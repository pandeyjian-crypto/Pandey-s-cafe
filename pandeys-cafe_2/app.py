#!/usr/bin/env python3
"""
Pandey's Cafe — backend server (Flask version)

Local run:
    python3 app.py
Then open http://localhost:8000 (customer site) and
http://localhost:8000/admin (staff dashboard, password below).

For deployment, this file exposes a standard Flask `app` object that
any Python host (Render, PythonAnywhere, Railway, etc.) can run with
gunicorn: `gunicorn app:app`

Admin password defaults to "pandey123" — change ADMIN_PASSWORD below,
ideally using an environment variable, before deploying anywhere real.
"""

import json
import os
import secrets
import sqlite3
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "cafe.db")

# Prefer an environment variable in production; falls back to the default
# for local use so nothing breaks if you haven't set one.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "pandey123")
PORT = int(os.environ.get("PORT", 8000))

app = Flask(__name__, static_folder="static", template_folder="templates")

# Simple in-memory session tokens for logged-in admins.
# Note: this resets whenever the server restarts, and only works
# correctly with a single worker process (fine for a small cafe app;
# see README before scaling this up).
ADMIN_TOKENS = set()


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    fresh = not os.path.exists(DB_PATH)
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price REAL NOT NULL,
            category TEXT NOT NULL,
            available INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            contact TEXT DEFAULT '',
            note TEXT DEFAULT '',
            items_json TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            order_type TEXT NOT NULL DEFAULT 'pickup',
            address TEXT DEFAULT ''
        );
        """
    )
    conn.commit()

    # Migration: add columns if this db predates delivery support.
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(orders)")}
    if "order_type" not in existing_cols:
        conn.execute("ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'pickup'")
    if "address" not in existing_cols:
        conn.execute("ALTER TABLE orders ADD COLUMN address TEXT DEFAULT ''")
    conn.commit()

    if fresh:
        seed = [
            ("Masala Chai", "Hand-brewed with cardamom, ginger & clove", 40, "Chai & Coffee", 1),
            ("Filter Coffee", "South Indian style, served frothy", 50, "Chai & Coffee", 2),
            ("Cold Brew", "Slow-steeped 18 hours, served over ice", 120, "Chai & Coffee", 3),
            ("Cappuccino", "Double shot, steamed milk foam", 130, "Chai & Coffee", 4),
            ("Samosa (2 pcs)", "Crisp pastry, spiced potato filling", 45, "Snacks", 1),
            ("Veg Sandwich Grill", "Toasted, chutney, three cheeses", 110, "Snacks", 2),
            ("Paneer Tikka Toastie", "Charred paneer, mint chutney, sourdough", 150, "Snacks", 3),
            ("Banana Walnut Bread", "Baked in-house, served warm", 90, "Bakes", 1),
            ("Butter Croissant", "Laminated fresh every morning", 85, "Bakes", 2),
            ("Chocolate Hazelnut Tart", "Dark chocolate ganache, roasted hazelnut", 160, "Bakes", 3),
        ]
        conn.executemany(
            "INSERT INTO menu_items (name, description, price, category, sort_order) "
            "VALUES (?, ?, ?, ?, ?)",
            [(n, d, p, c, so) for (n, d, p, c, so) in seed],
        )
        conn.commit()
    conn.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


def is_authed():
    token = request.headers.get("X-Admin-Token", "")
    return token in ADMIN_TOKENS


def require_admin():
    if not is_authed():
        return jsonify({"error": "unauthorized"}), 401
    return None


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.route("/")
def index_page():
    return send_from_directory(app.template_folder, "index.html")


@app.route("/admin")
def admin_page():
    return send_from_directory(app.template_folder, "admin.html")


# ---------------------------------------------------------------------------
# Menu API
# ---------------------------------------------------------------------------

@app.route("/api/menu", methods=["GET"])
def list_menu():
    conn = get_db()
    rows = conn.execute("SELECT * FROM menu_items ORDER BY category, sort_order, id").fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/menu", methods=["POST"])
def create_menu_item():
    denied = require_admin()
    if denied:
        return denied
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    price = body.get("price")
    category = (body.get("category") or "").strip()
    if not name or price is None or not category:
        return jsonify({"error": "name, price and category are required"}), 400

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO menu_items (name, description, price, category, available, sort_order) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (name, body.get("description", ""), float(price), category,
         1 if body.get("available", True) else 0, int(body.get("sort_order", 0))),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM menu_items WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/menu/<int:item_id>", methods=["PUT"])
def update_menu_item(item_id):
    denied = require_admin()
    if denied:
        return denied
    body = request.get_json(force=True, silent=True) or {}
    conn = get_db()
    existing = conn.execute("SELECT * FROM menu_items WHERE id=?", (item_id,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "not found"}), 404

    fields = {
        "name": body.get("name", existing["name"]),
        "description": body.get("description", existing["description"]),
        "price": float(body.get("price", existing["price"])),
        "category": body.get("category", existing["category"]),
        "available": 1 if body.get("available", existing["available"]) else 0,
        "sort_order": int(body.get("sort_order", existing["sort_order"])),
    }
    conn.execute(
        "UPDATE menu_items SET name=?, description=?, price=?, category=?, "
        "available=?, sort_order=? WHERE id=?",
        (*fields.values(), item_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM menu_items WHERE id=?", (item_id,)).fetchone()
    conn.close()
    return jsonify(row_to_dict(row))


@app.route("/api/menu/<int:item_id>", methods=["DELETE"])
def delete_menu_item(item_id):
    denied = require_admin()
    if denied:
        return denied
    conn = get_db()
    conn.execute("DELETE FROM menu_items WHERE id=?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


# ---------------------------------------------------------------------------
# Orders API
# ---------------------------------------------------------------------------

@app.route("/api/orders", methods=["GET"])
def list_orders():
    denied = require_admin()
    if denied:
        return denied
    conn = get_db()
    rows = conn.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
    conn.close()
    orders = []
    for r in rows:
        d = row_to_dict(r)
        d["items"] = json.loads(d.pop("items_json"))
        orders.append(d)
    return jsonify(orders)


@app.route("/api/orders", methods=["POST"])
def create_order():
    body = request.get_json(force=True, silent=True) or {}
    items = body.get("items", [])
    customer_name = (body.get("customer_name") or "").strip()
    order_type = body.get("order_type", "pickup")
    address = (body.get("address") or "").strip()
    if order_type not in ("pickup", "delivery"):
        order_type = "pickup"

    if not customer_name or not items:
        return jsonify({"error": "customer_name and items are required"}), 400
    if order_type == "delivery" and not address:
        return jsonify({"error": "address is required for delivery orders"}), 400

    total = sum(float(i.get("price", 0)) * int(i.get("qty", 1)) for i in items)
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO orders (customer_name, contact, note, items_json, total, status, "
        "created_at, order_type, address) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
        (customer_name, body.get("contact", ""), body.get("note", ""),
         json.dumps(items), total, datetime.now().isoformat(timespec="seconds"),
         order_type, address),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id, "total": total, "status": "pending"}), 201


@app.route("/api/orders/<int:order_id>", methods=["PATCH"])
def update_order_status(order_id):
    denied = require_admin()
    if denied:
        return denied
    body = request.get_json(force=True, silent=True) or {}
    status = body.get("status")
    valid = {"pending", "preparing", "ready", "completed", "cancelled"}
    if status not in valid:
        return jsonify({"error": f"status must be one of {sorted(valid)}"}), 400

    conn = get_db()
    conn.execute("UPDATE orders SET status=? WHERE id=?", (status, order_id))
    conn.commit()
    row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    d = row_to_dict(row)
    d["items"] = json.loads(d.pop("items_json"))
    return jsonify(d)


# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    body = request.get_json(force=True, silent=True) or {}
    password = body.get("password", "")
    if password == ADMIN_PASSWORD:
        token = secrets.token_hex(16)
        ADMIN_TOKENS.add(token)
        return jsonify({"token": token})
    return jsonify({"error": "incorrect password"}), 401


if __name__ == "__main__":
    print(f"Pandey's Cafe running at http://localhost:{PORT}")
    print(f"Admin dashboard at http://localhost:{PORT}/admin  (password: {ADMIN_PASSWORD})")
    app.run(host="0.0.0.0", port=PORT, debug=False)
