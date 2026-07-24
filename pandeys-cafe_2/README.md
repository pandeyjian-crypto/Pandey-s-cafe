# Pandey's Cafe — Web App

A full cafe ordering app: customer-facing menu + cart + checkout, and a staff
admin dashboard to manage the menu and track live orders.

Built with **HTML, CSS, JavaScript**, and a **Python** backend (standard
library only — no installs needed).

## Run it

You need Python 3.8+ installed. No pip packages required.

```
python3 app.py
```

Then open:
- **Customer site:** http://localhost:8000
- **Admin dashboard:** http://localhost:8000/admin — password: `pandey123`

Change the password in `app.py` (the `ADMIN_PASSWORD` variable near the top)
before you show this to anyone else.

## What's inside

```
app.py                 Backend server: REST API + SQLite database
cafe.db                Created automatically on first run, with sample menu items
templates/
  index.html            Customer site
  admin.html            Admin dashboard
static/
  css/style.css          Shared design system
  js/app.js              Customer site logic (menu, cart, checkout)
  js/admin.js             Admin logic (login, orders, menu CRUD)
```

## How it works

- **Customers** browse the menu, add items to a cart, and place an order with
  their name (and optional phone/note). No login needed.
- **Staff** log into `/admin` to see orders come in live, move them through
  `pending → preparing → ready → completed`, and add/edit/remove menu items
  (including marking things sold out).
- Everything is stored in `cafe.db`, a SQLite file created next to `app.py`.
  Delete it any time to reset to the sample menu.

## Going live (putting it on the internet)

This version is set up to deploy easily on **Render** (free tier, no
terminal commands needed beyond what you've already done). See the
step-by-step guide in the chat, or in short:

1. Put this folder on GitHub (you can drag-and-drop the files into a new
   repo on github.com — no git command line needed).
2. Create a free Render account at render.com, connect your GitHub repo.
3. Build command: `pip install -r requirements.txt`
   Start command: `gunicorn app:app`
4. Set an environment variable `ADMIN_PASSWORD` to something private.
5. Deploy — Render gives you a public URL like `pandeys-cafe.onrender.com`.

**Important:** Render's free tier has a temporary filesystem — the
`cafe.db` file (your menu and orders) can reset when the app restarts or
redeploys. For a real cafe in daily use, upgrade to a paid instance with
a persistent disk, or migrate to a hosted database, once you're past the
testing stage.

## Notes before going live

This is a solid working app for local use or a small demo, but before putting
it on the public internet for real customers you'll want to:
- Set `ADMIN_PASSWORD` as an environment variable instead of the default
- Serve it over HTTPS (Render and most hosts do this automatically)
- Add rate limiting on the order endpoint to avoid spam orders
- Consider a payment gateway (Razorpay/Stripe) if you want to take payment online — right now orders are "pay at pickup/delivery" style
- Move from SQLite to a persistent hosted database if you expect real ongoing traffic
