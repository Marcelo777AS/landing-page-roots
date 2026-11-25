/* ============ Roots — datos compartidos (landing + seguimiento) ============ */

// ---- Configuración: cambia estos datos por los reales ----
const CONFIG = {
  whatsapp: "5493870000000",  // Número de WhatsApp del local, con código de país y sin "+" ni espacios
  deliveryFee: 2500,          // Costo de envío
  currency: "$",
  city: "Salta, Argentina",   // Se agrega a la dirección del cliente para ubicarla en el mapa

  restaurant: {
    name: "Roots",
    address: "Balcarce 123, Salta, Argentina",
    lat: -24.7859,
    lng: -65.4116,
  },

  // Clave de la API de Google Maps (Maps JavaScript API + Directions API + Geocoding API).
  // Sin clave, el seguimiento usa un mapa de Google incrustado con la ruta, y la
  // posición del repartidor se muestra en una barra de progreso.
  googleMapsApiKey: "",

  // Minutos (desde que se registra el pedido) en que empieza cada etapa.
  // Mientras no haya un sistema de cocina conectado, el seguimiento se calcula con estos tiempos.
  stages: {
    delivery: [
      { key: "registrado", at: 0,  title: "Pedido registrado", desc: "Recibimos tu pedido y lo estamos confirmando." },
      { key: "cocina",     at: 3,  title: "En cocina",         desc: "Tu pedido se está preparando a la leña." },
      { key: "camino",     at: 25, title: "En camino",         desc: "El repartidor salió de Roots hacia tu dirección." },
      { key: "entregado",  at: 45, title: "Entregado",         desc: "¡Buen provecho! Gracias por elegir Roots." },
    ],
    local: [
      { key: "registrado", at: 0,  title: "Pedido registrado", desc: "Recibimos tu pedido y reservamos tu mesa." },
      { key: "cocina",     at: 3,  title: "En cocina",         desc: "Estamos preparando tu pedido a la leña." },
      { key: "listo",      at: 25, title: "Listo para servir", desc: "Tu mesa te espera en Roots." },
    ],
  },
};

// ---- Menú: edita, agrega o quita platillos aquí ----
const MENU = [
  { id: "asado-2",      cat: "Parrilla",       name: "Parrillada para dos",     desc: "Tira de asado, vacío, chorizo y morcilla a la leña, con chimichurri.", price: 32000, tag: "Para compartir" },
  { id: "bife",         cat: "Parrilla",       name: "Bife de chorizo",         desc: "400 g a punto, con papas rústicas y criolla.",                         price: 18500, tag: "Favorito" },
  { id: "vacio",        cat: "Parrilla",       name: "Vacío a la leña",         desc: "Cocción lenta, jugoso por dentro y crocante por fuera.",               price: 16500 },
  { id: "choripan",     cat: "Parrilla",       name: "Choripán",                desc: "Chorizo casero en pan de campo con chimichurri.",                      price: 6500 },
  { id: "empanadas",    cat: "Cocina salteña", name: "Empanadas salteñas",      desc: "Docena de carne cortada a cuchillo, al horno de barro.",               price: 14000, tag: "De la casa" },
  { id: "locro",        cat: "Cocina salteña", name: "Locro norteño",           desc: "Maíz, zapallo, porotos y carnes, con su quiquirimichi.",               price: 11000 },
  { id: "humita",       cat: "Cocina salteña", name: "Humita en chala",         desc: "Choclo rallado, queso de cabra y albahaca. Dos unidades.",             price: 7500, tag: "Vegetariano" },
  { id: "tamales",      cat: "Cocina salteña", name: "Tamales",                 desc: "De carne y maíz, envueltos en chala. Tres unidades.",                  price: 8000 },
  { id: "ensalada",     cat: "Acompañamientos",name: "Ensalada mixta",          desc: "Lechuga, tomate y cebolla.",                                           price: 4500 },
  { id: "papas",        cat: "Acompañamientos",name: "Papas rústicas",          desc: "Con romero y sal gruesa.",                                             price: 5000 },
  { id: "quesillo",     cat: "Postres",        name: "Quesillo con cayote",     desc: "Quesillo de cabra con dulce de cayote y nueces.",                      price: 6000 },
  { id: "flan",         cat: "Postres",        name: "Flan casero",             desc: "Con dulce de leche y crema.",                                          price: 5000 },
  { id: "malbec",       cat: "Bebidas",        name: "Malbec de Cafayate",      desc: "Botella 750 ml, Valles Calchaquíes.",                                  price: 15000 },
  { id: "torrontes",    cat: "Bebidas",        name: "Torrontés",               desc: "Botella 750 ml, blanco aromático salteño.",                            price: 13000 },
  { id: "agua",         cat: "Bebidas",        name: "Agua / gaseosa",          desc: "500 ml.",                                                              price: 2500 },
];

// ---- Utilidades compartidas ----
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const money = (n) => `${CONFIG.currency}${n.toLocaleString("es-AR")}`;
const byId = (id) => MENU.find((d) => d.id === id);
const escapeHTML = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Pedido <-> código para el link de seguimiento ----
// El pedido viaja dentro del link (no hay base de datos), así el cliente puede
// abrirlo desde cualquier dispositivo.
function encodeOrder(order) {
  const bytes = new TextEncoder().encode(JSON.stringify(order));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeOrder(code) {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const order = JSON.parse(new TextDecoder().decode(bytes));
    if (!order || !order.id || !order.t || !Array.isArray(order.i)) return null;
    return order;
  } catch {
    return null;
  }
}

function trackingUrl(order) {
  const base = location.href.replace(/[^/]*([?#].*)?$/, "");
  return `${base}seguimiento.html?p=${encodeOrder(order)}`;
}

function newOrderId() {
  return "RT-" + Math.floor(1000 + Math.random() * 9000);
}
