const API = "/api";
const fmt = (n) => `₹${Number(n).toFixed(0)}`;

function getToken() { return localStorage.getItem("pandeys_admin_token") || ""; }
function setToken(t) { localStorage.setItem("pandeys_admin_token", t); }
function clearToken() { localStorage.removeItem("pandeys_admin_token"); }

function authHeaders() {
  return { "Content-Type": "application/json", "X-Admin-Token": getToken() };
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : s;
  return div.innerHTML;
}

// ---------- login ----------

async function tryLogin() {
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  try {
    const res = await fetch(`${API}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    setToken(data.token);
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function showDashboard() {
  document.getElementById("login-shell").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  loadOrders();
  loadMenuAdmin();
}

function showLogin() {
  document.getElementById("login-shell").style.display = "block";
  document.getElementById("dashboard").style.display = "none";
}

async function checkAuthAndInit() {
  if (!getToken()) { showLogin(); return; }
  // Try a lightweight authed call; if it fails, drop back to login.
  const res = await fetch(`${API}/orders`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); showLogin(); }
  else showDashboard();
}

// ---------- tabs ----------

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- orders ----------

const STATUS_FLOW = ["pending", "preparing", "ready", "completed", "cancelled"];

async function loadOrders() {
  const listEl = document.getElementById("orders-list");
  const res = await fetch(`${API}/orders`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); showLogin(); return; }
  const orders = await res.json();

  if (!orders.length) {
    listEl.innerHTML = `<p class="admin-empty">No orders yet.</p>`;
    return;
  }

  listEl.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="oc-top">
        <span>#${o.id} · ${new Date(o.created_at).toLocaleString()}</span>
        <span>
          <span class="type-pill">${o.order_type === "delivery" ? "Delivery" : "Pickup"}</span>
          <span class="status-pill status-${o.status}">${o.status}</span>
        </span>
      </div>
      <div class="oc-name">${escapeHtml(o.customer_name)}${o.contact ? " · " + escapeHtml(o.contact) : ""}</div>
      <div class="oc-items">
        ${o.items.map(i => `<div><span class="q">${i.qty}×</span>${escapeHtml(i.name)}</div>`).join("")}
        ${o.order_type === "delivery" && o.address ? `<div style="margin-top:6px;color:#9A9488;">Deliver to: ${escapeHtml(o.address)}</div>` : ""}
        ${o.note ? `<div style="margin-top:6px;color:#9A9488;">Note: ${escapeHtml(o.note)}</div>` : ""}
      </div>
      <div class="oc-bottom">
        <span class="oc-total">${fmt(o.total)}</span>
        <select class="status-select" data-id="${o.id}">
          ${STATUS_FLOW.map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", () => updateOrderStatus(Number(sel.dataset.id), sel.value));
  });
}

async function updateOrderStatus(id, status) {
  await fetch(`${API}/orders/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  loadOrders();
}

// ---------- menu admin ----------

async function loadMenuAdmin() {
  const listEl = document.getElementById("menu-admin-list");
  const res = await fetch(`${API}/menu`);
  const items = await res.json();

  if (!items.length) {
    listEl.innerHTML = `<p class="admin-empty">No menu items yet — add one above.</p>`;
    return;
  }

  listEl.innerHTML = items.map(item => `
    <div class="menu-admin-row" data-id="${item.id}">
      <input type="text" class="f-name" value="${escapeHtml(item.name)}">
      <input type="text" class="f-category" value="${escapeHtml(item.category)}">
      <input type="number" class="f-price" value="${item.price}" min="0" step="1">
      <select class="f-available">
        <option value="1" ${item.available ? "selected" : ""}>Available</option>
        <option value="0" ${!item.available ? "selected" : ""}>Sold out</option>
      </select>
      <button class="icon-btn save-btn" data-id="${item.id}">Save</button>
      <button class="icon-btn danger delete-btn" data-id="${item.id}">Delete</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".save-btn").forEach(btn => {
    btn.addEventListener("click", () => saveMenuRow(Number(btn.dataset.id)));
  });
  listEl.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteMenuItem(Number(btn.dataset.id)));
  });
}

async function saveMenuRow(id) {
  const row = document.querySelector(`.menu-admin-row[data-id="${id}"]`);
  const body = {
    name: row.querySelector(".f-name").value.trim(),
    category: row.querySelector(".f-category").value.trim(),
    price: Number(row.querySelector(".f-price").value),
    available: row.querySelector(".f-available").value === "1",
  };
  await fetch(`${API}/menu/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  loadMenuAdmin();
}

async function deleteMenuItem(id) {
  if (!confirm("Delete this item?")) return;
  await fetch(`${API}/menu/${id}`, { method: "DELETE", headers: authHeaders() });
  loadMenuAdmin();
}

async function addMenuItem() {
  const name = document.getElementById("new-name").value.trim();
  const category = document.getElementById("new-category").value.trim();
  const price = Number(document.getElementById("new-price").value);
  const description = document.getElementById("new-desc").value.trim();

  if (!name || !category || !price) {
    alert("Name, category and price are required.");
    return;
  }

  await fetch(`${API}/menu`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, category, price, description }),
  });

  document.getElementById("new-name").value = "";
  document.getElementById("new-category").value = "";
  document.getElementById("new-price").value = "";
  document.getElementById("new-desc").value = "";
  loadMenuAdmin();
}

// ---------- wire up ----------

document.getElementById("login-btn").addEventListener("click", tryLogin);
document.getElementById("login-password").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
document.getElementById("logout-btn").addEventListener("click", () => { clearToken(); showLogin(); });
document.getElementById("refresh-orders-btn").addEventListener("click", loadOrders);
document.getElementById("add-item-btn").addEventListener("click", addMenuItem);

checkAuthAndInit();
