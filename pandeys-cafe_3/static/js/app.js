const API = "/api";
let MENU = [];
let CART = {}; // id -> {item, qty}
let ORDER_TYPE = "pickup";

const fmt = (n) => `₹${Number(n).toFixed(0)}`;

async function loadMenu() {
  const res = await fetch(`${API}/menu`);
  MENU = await res.json();
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById("menu-list");
  if (!MENU.length) {
    container.innerHTML = `<p class="drawer-empty">Menu is empty right now.</p>`;
    return;
  }

  const categories = [...new Set(MENU.map(i => i.category))];
  container.innerHTML = categories.map(cat => {
    const items = MENU.filter(i => i.category === cat);
    const rows = items.map(item => `
      <div class="menu-row ${item.available ? "" : "unavailable"}">
        <div class="name-block">
          <span class="name">${escapeHtml(item.name)}</span>
          ${item.description ? `<span class="desc">${escapeHtml(item.description)}</span>` : ""}
        </div>
        <div class="leader"></div>
        <span class="price">${fmt(item.price)}</span>
        <button class="add-btn" data-id="${item.id}">${item.available ? "Add" : "Sold out"}</button>
      </div>
    `).join("");
    return `
      <div class="category-block">
        <div class="category-label">${escapeHtml(cat)}</div>
        ${rows}
      </div>
    `;
  }).join("");

  container.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => addToCart(Number(btn.dataset.id)));
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function addToCart(id) {
  const item = MENU.find(i => i.id === id);
  if (!item || !item.available) return;
  if (!CART[id]) CART[id] = { item, qty: 0 };
  CART[id].qty += 1;
  renderCart();
  openDrawer();
}

function changeQty(id, delta) {
  if (!CART[id]) return;
  CART[id].qty += delta;
  if (CART[id].qty <= 0) delete CART[id];
  renderCart();
}

function renderCart() {
  const entries = Object.values(CART);
  const itemsEl = document.getElementById("cart-items");
  const countEl = document.getElementById("cart-count");
  const totalEl = document.getElementById("cart-total");

  const count = entries.reduce((s, e) => s + e.qty, 0);
  countEl.textContent = count;

  if (!entries.length) {
    itemsEl.innerHTML = `<p class="drawer-empty">Nothing added yet.<br>Tap "Add" on any item.</p>`;
    totalEl.textContent = fmt(0);
    return;
  }

  itemsEl.innerHTML = entries.map(({ item, qty }) => `
    <div class="cart-line">
      <span class="cl-name">${escapeHtml(item.name)}</span>
      <span class="cl-qty-ctrl">
        <button data-id="${item.id}" data-delta="-1">–</button>
        <span>${qty}</span>
        <button data-id="${item.id}" data-delta="1">+</button>
      </span>
      <span class="cl-price">${fmt(item.price * qty)}</span>
    </div>
  `).join("");

  itemsEl.querySelectorAll("button[data-delta]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(Number(btn.dataset.id), Number(btn.dataset.delta)));
  });

  const total = entries.reduce((s, e) => s + e.item.price * e.qty, 0);
  totalEl.textContent = fmt(total);
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("open");
}

function setOrderType(type) {
  ORDER_TYPE = type;
  document.getElementById("type-pickup").classList.toggle("active", type === "pickup");
  document.getElementById("type-delivery").classList.toggle("active", type === "delivery");
  document.getElementById("address-field").style.display = type === "delivery" ? "block" : "none";
}

async function placeOrder() {
  const entries = Object.values(CART);
  const banner = document.getElementById("confirm-banner");
  const btn = document.getElementById("place-order-btn");
  const name = document.getElementById("cust-name").value.trim();
  const address = document.getElementById("cust-address").value.trim();

  if (!entries.length) return;
  if (!name) {
    banner.style.display = "block";
    banner.style.color = "#A8402F";
    banner.textContent = "Please enter your name.";
    return;
  }
  if (ORDER_TYPE === "delivery" && !address) {
    banner.style.display = "block";
    banner.style.color = "#A8402F";
    banner.textContent = "Please enter a delivery address.";
    return;
  }

  btn.disabled = true;
  const payload = {
    customer_name: name,
    contact: document.getElementById("cust-contact").value.trim(),
    note: document.getElementById("cust-note").value.trim(),
    order_type: ORDER_TYPE,
    address: ORDER_TYPE === "delivery" ? address : "",
    items: entries.map(({ item, qty }) => ({ id: item.id, name: item.name, price: item.price, qty })),
  };

  try {
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");

    banner.style.display = "block";
    banner.style.color = "#4B6B45";
    banner.textContent = `Order #${data.id} placed — ${fmt(data.total)} total. See you soon!`;
    CART = {};
    renderCart();
    document.getElementById("cust-address").value = "";
  } catch (err) {
    banner.style.display = "block";
    banner.style.color = "#A8402F";
    banner.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("type-pickup").addEventListener("click", () => setOrderType("pickup"));
document.getElementById("type-delivery").addEventListener("click", () => setOrderType("delivery"));
document.getElementById("cart-fab").addEventListener("click", openDrawer);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
document.getElementById("place-order-btn").addEventListener("click", placeOrder);
document.getElementById("footer-year").textContent = new Date().getFullYear();

// ---------- PWA install ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
const installBtn = document.getElementById("install-btn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.style.display = "inline-block";
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.style.display = "none";
});

window.addEventListener("appinstalled", () => {
  installBtn.style.display = "none";
});

loadMenu();
