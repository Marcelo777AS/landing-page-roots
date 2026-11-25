/* ============ Roots — lógica de pedidos ============ */
/* La configuración, el menú y las utilidades están en data.js */

// ---- Estado ----
const cart = JSON.parse(localStorage.getItem("roots-cart") || "{}"); // { id: cantidad }
let activeCat = "Todo";

const getMode = () => $('input[name="mode"]:checked').value;

function saveCart() {
  localStorage.setItem("roots-cart", JSON.stringify(cart));
}

function setQty(id, qty) {
  if (qty <= 0) delete cart[id];
  else cart[id] = Math.min(qty, 50);
  saveCart();
  renderMenu();
  renderCart();
}

let toastTimer;
function toast(msg) {
  const el = $("[data-toast]");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

function qtyControl(id, qty) {
  return `
    <div class="qty">
      <button type="button" data-dec="${id}" aria-label="Quitar uno">−</button>
      <span>${qty}</span>
      <button type="button" data-inc="${id}" aria-label="Agregar uno">+</button>
    </div>`;
}

// ---- Render: pestañas ----
function renderTabs() {
  const cats = ["Todo", ...new Set(MENU.map((d) => d.cat))];
  $("[data-tabs]").innerHTML = cats
    .map((c) => `<button class="tab" role="tab" aria-selected="${c === activeCat}" data-cat="${c}">${c}</button>`)
    .join("");
}

// ---- Render: menú ----
function renderMenu() {
  const items = activeCat === "Todo" ? MENU : MENU.filter((d) => d.cat === activeCat);
  $("[data-menu]").innerHTML = items
    .map((d) => {
      const qty = cart[d.id] || 0;
      return `
        <article class="dish">
          ${d.tag ? `<span class="dish__tag">${d.tag}</span>` : ""}
          <div class="dish__top">
            <h3 class="dish__name">${d.name}</h3>
            <span class="dish__price">${money(d.price)}</span>
          </div>
          <p class="dish__desc">${d.desc}</p>
          <div class="dish__actions">
            ${qty ? qtyControl(d.id, qty) : `<button type="button" class="add" data-inc="${d.id}">Agregar +</button>`}
          </div>
        </article>`;
    })
    .join("");
}

// ---- Render: carrito ----
function totals() {
  const subtotal = Object.entries(cart).reduce((s, [id, q]) => s + byId(id).price * q, 0);
  const fee = getMode() === "delivery" && subtotal > 0 ? CONFIG.deliveryFee : 0;
  return { subtotal, fee, total: subtotal + fee };
}

function renderCart() {
  const entries = Object.entries(cart).filter(([id]) => byId(id));
  const count = entries.reduce((s, [, q]) => s + q, 0);
  const { subtotal, fee, total } = totals();

  $$("[data-cart-count]").forEach((el) => (el.textContent = count));
  $("[data-cart-empty]").hidden = count > 0;
  $("[data-cart-totals]").hidden = count === 0;
  $("[data-float-cart]").hidden = count === 0;

  $("[data-cart-list]").innerHTML = entries
    .map(([id, q]) => {
      const d = byId(id);
      return `
        <li class="cart__item">
          <div>
            <div class="cart__item-name">${d.name}</div>
            <div class="cart__item-unit">${money(d.price)} c/u</div>
          </div>
          ${qtyControl(id, q)}
          <div class="cart__item-total">${money(d.price * q)}</div>
        </li>`;
    })
    .join("");

  $("[data-subtotal]").textContent = money(subtotal);
  $("[data-delivery-fee]").textContent = money(fee);
  $("[data-delivery-row]").hidden = getMode() !== "delivery";
  $("[data-total]").textContent = money(total);
  $("[data-float-total]").textContent = money(total);
}

// ---- Modo: delivery / local ----
function updateMode() {
  const isDelivery = getMode() === "delivery";
  $("[data-delivery-fields]").hidden = !isDelivery;
  $("[data-local-fields]").hidden = isDelivery;
  $('[name="address"]').required = isDelivery;
  $('[name="time"]').required = !isDelivery;
  renderCart();
}

// ---- Envío del pedido ----
function buildMessage(data, order) {
  const { subtotal, fee, total } = totals();
  const isDelivery = data.mode === "delivery";
  const lines = [
    `Hola Roots! Quiero hacer un pedido 🌱`,
    ``,
    `*Pedido N°:* ${order.id}`,
    `*Modalidad:* ${isDelivery ? "Delivery" : "Comer en el local"}`,
    `*Nombre:* ${data.name}`,
    `*Teléfono:* ${data.phone}`,
  ];
  if (isDelivery) {
    lines.push(`*Dirección:* ${data.address}`, `*Pago:* ${data.payment}`);
  } else {
    lines.push(`*Hora de llegada:* ${data.time}`, `*Personas:* ${data.people}`);
  }
  lines.push(``, `*Pedido:*`);
  Object.entries(cart).forEach(([id, q]) => {
    const d = byId(id);
    lines.push(`• ${q} x ${d.name} — ${money(d.price * q)}`);
  });
  lines.push(``, `Subtotal: ${money(subtotal)}`);
  if (isDelivery) lines.push(`Envío: ${money(fee)}`);
  lines.push(`*Total: ${money(total)}*`);
  if (data.notes.trim()) lines.push(``, `*Notas:* ${data.notes.trim()}`);
  lines.push(``, `Seguimiento del pedido: ${trackingUrl(order)}`);
  return lines.join("\n");
}

function createOrder(data) {
  const isDelivery = data.mode === "delivery";
  const order = {
    id: newOrderId(),
    t: Date.now(),
    m: isDelivery ? "d" : "l",
    n: data.name.trim(),
    i: Object.entries(cart).filter(([id]) => byId(id)),
    f: isDelivery ? CONFIG.deliveryFee : 0,
  };
  if (isDelivery) order.a = data.address.trim();
  else Object.assign(order, { h: data.time, pp: Number(data.people) || 1 });
  return order;
}

// ---- Último pedido (para volver al seguimiento desde la landing) ----
function renderLastOrder() {
  const box = $("[data-last-order]");
  if (!box) return;
  const order = decodeOrder(localStorage.getItem("roots-last-order") || "");
  box.hidden = !order;
  if (!order) return;
  $("[data-last-order-id]").textContent = order.id;
  $("[data-last-order-link]").href = trackingUrl(order);
}

function showOrderSent(order) {
  const panel = $("[data-order-sent]");
  $("[data-order-sent-id]").textContent = order.id;
  $("[data-order-sent-link]").href = trackingUrl(order);
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const error = $("[data-form-error]");
  error.textContent = "";
  $$(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));

  if (!Object.keys(cart).length) {
    error.textContent = "Agrega al menos un platillo a tu pedido.";
    return;
  }

  const invalid = $$("input, select, textarea", form).filter(
    (el) => el.required && !el.closest("[hidden]") && !el.value.trim()
  );
  if (invalid.length) {
    invalid.forEach((el) => el.classList.add("is-invalid"));
    invalid[0].focus();
    error.textContent = "Completa los campos marcados.";
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const order = createOrder(data);
  const url = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(buildMessage(data, order))}`;
  window.open(url, "_blank", "noopener");

  localStorage.setItem("roots-last-order", encodeOrder(order));
  renderLastOrder();
  showOrderSent(order);
  toast("¡Pedido listo! Envíalo desde WhatsApp.");
}

// ---- Eventos ----
document.addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  const tab = e.target.closest("[data-cat]");

  if (inc) {
    const id = inc.dataset.inc;
    const wasEmpty = !cart[id];
    setQty(id, (cart[id] || 0) + 1);
    if (wasEmpty) toast(`${byId(id).name} agregado`);
  }
  if (dec) setQty(dec.dataset.dec, (cart[dec.dataset.dec] || 0) - 1);
  if (tab) {
    activeCat = tab.dataset.cat;
    renderTabs();
    renderMenu();
  }
});

$$('input[name="mode"]').forEach((r) => r.addEventListener("change", updateMode));
$("[data-order-form]").addEventListener("submit", handleSubmit);
$("[data-year]").textContent = new Date().getFullYear();

// Limpia del carrito guardado platillos que ya no existan en el menú
Object.keys(cart).forEach((id) => { if (!byId(id)) delete cart[id]; });

// ---- Inicio ----
renderTabs();
renderMenu();
updateMode();
renderLastOrder();
