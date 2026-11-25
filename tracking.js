/* ============ Roots — seguimiento del pedido ============ */

const params = new URLSearchParams(location.search);
const isDemo = params.has("demo");
const SPEED = isDemo ? 60 : 1; // en la demo, 1 minuto real = 1 segundo

// ---- Cargar el pedido (desde el link) ----
function demoOrder() {
  return {
    id: "RT-DEMO",
    t: Date.now(),
    m: "d",
    n: "Cliente demo",
    a: "Av. Entre Ríos 1600",
    i: [["bife", 1], ["empanadas", 1], ["malbec", 1]],
    f: CONFIG.deliveryFee,
  };
}

let order = params.get("p") ? decodeOrder(params.get("p")) : null;
if (!order && isDemo) order = demoOrder();

const isDelivery = order && order.m === "d";
const stages = order ? CONFIG.stages[isDelivery ? "delivery" : "local"] : [];

/* ---------------------------------------------------------------------------
   Estado del pedido.
   Hoy se calcula con los tiempos de CONFIG.stages porque la página no tiene
   servidor. Para seguimiento real, reemplaza esta función por una consulta a
   tu sistema (por ejemplo: fetch(`/api/pedidos/${order.id}`)) que devuelva
   la etapa actual y la posición GPS del repartidor.
   --------------------------------------------------------------------------- */
function getStatus(now = Date.now()) {
  const elapsed = ((now - order.t) / 60000) * SPEED; // minutos
  let index = 0;
  stages.forEach((s, i) => { if (elapsed >= s.at) index = i; });

  const last = stages[stages.length - 1];
  const done = elapsed >= last.at;
  const remaining = Math.max(0, Math.ceil(last.at - elapsed));

  // Avance del repartidor entre "En camino" y "Entregado" (0 a 1)
  let courier = 0;
  if (isDelivery) {
    const go = stages.find((s) => s.key === "camino");
    courier = Math.min(1, Math.max(0, (elapsed - go.at) / (last.at - go.at)));
  }
  return { index, done, remaining, courier, elapsed };
}

// ---- Render ----
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

function renderStatic() {
  $("[data-order-id]").textContent = order.id;
  $("[data-demo-badge]").hidden = !isDemo;
  $("[data-replay]").hidden = !isDemo;
  $("[data-courier-bar]").hidden = !isDelivery;

  const meta = isDelivery
    ? `Delivery a ${order.a}`
    : `Comer en el local · ${order.pp || 1} persona(s)${order.h ? ` · llegada ${order.h}` : ""}`;
  $("[data-order-meta]").textContent = `${order.n} · ${meta}`;

  const items = order.i.filter(([id]) => byId(id));
  $("[data-order-items]").innerHTML = items
    .map(([id, q]) => {
      const d = byId(id);
      return `<li class="cart__item cart__item--compact">
        <div class="cart__item-name">${q} × ${escapeHTML(d.name)}</div>
        <div></div>
        <div class="cart__item-total">${money(d.price * q)}</div>
      </li>`;
    })
    .join("");

  const subtotal = items.reduce((s, [id, q]) => s + byId(id).price * q, 0);
  const fee = order.f || 0;
  $("[data-order-totals]").innerHTML = `
    <div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>
    ${isDelivery ? `<div><dt>Envío</dt><dd>${money(fee)}</dd></div>` : ""}
    <div class="cart__total"><dt>Total</dt><dd>${money(subtotal + fee)}</dd></div>`;

  const help = `Hola Roots! Tengo una consulta sobre mi pedido ${order.id}.`;
  $("[data-help-link]").href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(help)}`;
}

function renderStatus() {
  const st = getStatus();
  const current = stages[st.index];

  $("[data-status-title]").textContent = current.title;
  $("[data-status-desc]").textContent = current.desc;

  // ETA
  if (st.done) {
    $("[data-eta-label]").textContent = isDelivery ? "Entregado" : "Listo";
    $("[data-eta-value]").textContent = "✓";
  } else {
    $("[data-eta-label]").textContent = isDelivery ? "Llega en" : "Listo en";
    $("[data-eta-value]").textContent = `${st.remaining} min`;
  }

  // Línea de tiempo
  $("[data-timeline]").innerHTML = stages
    .map((s, i) => {
      const state = i < st.index || st.done ? "done" : i === st.index ? "current" : "next";
      const at = order.t + (s.at * 60000) / SPEED;
      const when = i <= st.index ? fmtTime(at) : `~${fmtTime(at)}`;
      return `<li class="timeline__item is-${state}">
        <span class="timeline__dot"></span>
        <div>
          <div class="timeline__title">${s.title}</div>
          <div class="timeline__time">${when}</div>
        </div>
      </li>`;
    })
    .join("");

  // Barra del repartidor
  if (isDelivery) {
    const pct = Math.round(st.courier * 100);
    $("[data-courier-fill]").style.width = `${pct}%`;
    $("[data-courier-bike]").style.left = `${pct}%`;
  }
  updateCourierOnMap(st.courier);

  return st;
}

// ---- Mapa ----
let map, courierMarker, routePath = [];

function destinationText() {
  const a = order.a || "";
  return /salta/i.test(a) ? a : `${a}, ${CONFIG.city}`;
}

function embedMap() {
  // Mapa de Google incrustado (no requiere clave)
  const r = CONFIG.restaurant;
  const src = isDelivery
    ? `https://maps.google.com/maps?saddr=${encodeURIComponent(r.address)}&daddr=${encodeURIComponent(destinationText())}&output=embed`
    : `https://maps.google.com/maps?q=${r.lat},${r.lng}&z=16&output=embed`;
  $("[data-map]").innerHTML =
    `<iframe title="Mapa del pedido" src="${src}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
  $("[data-map-note]").textContent = isDelivery
    ? "Ruta de Roots a tu dirección. La barra muestra cuánto le falta al repartidor."
    : `Te esperamos en ${r.address}.`;
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    window.__rootsMapsReady = resolve;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleMapsApiKey)}&callback=__rootsMapsReady&loading=async`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1f0503" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d6a39c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#170000" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#350a06" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#4a0d0a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#56070c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0000" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const pin = (color, scale = 9) => ({
  path: google.maps.SymbolPath.CIRCLE,
  scale,
  fillColor: color,
  fillOpacity: 1,
  strokeColor: "#f6e7e3",
  strokeWeight: 2,
});

async function interactiveMap() {
  await loadGoogleMaps();
  const r = CONFIG.restaurant;
  const origin = { lat: r.lat, lng: r.lng };

  map = new google.maps.Map($("[data-map]"), {
    center: origin,
    zoom: 15,
    styles: MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
  });
  new google.maps.Marker({ position: origin, map, icon: pin("#8f3d38", 10), title: "Roots" });

  if (!isDelivery) {
    $("[data-map-note]").textContent = `Te esperamos en ${r.address}.`;
    return;
  }

  const result = await new google.maps.DirectionsService().route({
    origin,
    destination: destinationText(),
    travelMode: google.maps.TravelMode.DRIVING,
  });
  const leg = result.routes[0].legs[0];
  routePath = result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));

  new google.maps.Polyline({ path: routePath, map, strokeColor: "#cb7169", strokeWeight: 5, strokeOpacity: 0.9 });
  new google.maps.Marker({ position: leg.end_location, map, icon: pin("#cb7169", 10), title: "Tu dirección" });
  courierMarker = new google.maps.Marker({ position: origin, map, icon: pin("#f6e7e3", 7), title: "Repartidor", zIndex: 10 });

  const bounds = new google.maps.LatLngBounds();
  routePath.forEach((p) => bounds.extend(p));
  map.fitBounds(bounds, 48);

  $("[data-map-note]").textContent = `Recorrido de ${leg.distance.text} · el punto claro es tu repartidor.`;
  updateCourierOnMap(getStatus().courier);
}

// Distancia aproximada en metros entre dos puntos
function dist(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointAlongRoute(fraction) {
  if (routePath.length < 2) return routePath[0];
  const segs = routePath.slice(1).map((p, i) => dist(routePath[i], p));
  let target = segs.reduce((a, b) => a + b, 0) * fraction;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const k = segs[i] ? target / segs[i] : 0;
      const a = routePath[i], b = routePath[i + 1];
      return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
    }
    target -= segs[i];
  }
  return routePath[routePath.length - 1];
}

function updateCourierOnMap(fraction) {
  if (!courierMarker || !routePath.length) return;
  courierMarker.setPosition(pointAlongRoute(fraction));
}

// ---- Inicio ----
$("[data-year]").textContent = new Date().getFullYear();

if (!order) {
  $("[data-track-empty]").hidden = false;
} else {
  $("[data-track]").hidden = false;
  document.title = `Pedido ${order.id} — Roots`;
  renderStatic();

  if (CONFIG.googleMapsApiKey) {
    interactiveMap().catch(() => embedMap());
  } else {
    embedMap();
  }

  let timer = setInterval(() => { if (renderStatus().done) clearInterval(timer); }, 1000);
  renderStatus();

  $("[data-replay]").addEventListener("click", () => {
    order.t = Date.now();
    clearInterval(timer);
    timer = setInterval(() => { if (renderStatus().done) clearInterval(timer); }, 1000);
    renderStatus();
  });
}
