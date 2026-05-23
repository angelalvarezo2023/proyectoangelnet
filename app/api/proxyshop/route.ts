import { NextRequest, NextResponse } from "next/server";
import {
  poolAdd, poolTake, poolCount, poolList, poolRemove, poolFlush,
  saveOrder, getOrder, updateOrderStatus,
  saveClientProxy, getClientProxies, markAvisado, getProxiesParaAvisar,
  saveStat, getStatsMes,
  type Order, type OrderStatus, type OrderType, type ClientProxy,
} from "@/lib/storage";

// ─── CONFIG ───────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API     = `https://api.telegram.org/bot${TOKEN}`;
const P6_KEY  = process.env.PROXY6_KEY!;
const P6_API  = `https://px6.link/api/${P6_KEY}`;
const ADMIN   = Number(process.env.ADMIN_ID!);

const PRECIO_DOP   = 1000;
const PRECIO_USD   = 18;
const PRECIO_ZELLE = 28;
const DIAS_RENOV   = 30;
const DIAS_AVISO   = 3;

const METODOS = {
  banreservas: {
    emoji: "🏦", nombre: "Banreservas",
    detalle: `Cuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>`,
  },
  remitly: {
    emoji: "💸", nombre: "Remitly",
    detalle: `País: <b>República Dominicana, Santiago</b>\nCuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>`,
  },
  zelle: {
    emoji: "💳", nombre: "Zelle",
    detalle: `Email: <code>estherlopeztineo2025@gmail.com</code>\nTitular: <b>Laury Lopez</b>`,
  },
} as const;
type MetodoKey = keyof typeof METODOS;

// ─── SESIONES EN MEMORIA ──────────────────────────────

type Step = "idle" | "qty" | "payment" | "waiting_receipt" | "renew_input" | "renew_payment";
interface Session { step: Step; qty?: number; orderId?: string; proxyRenovar?: string; }
const sessions = new Map<number, Session>();
const ses = (id: number): Session => sessions.get(id) ?? { step: "idle" };
const setSes = (id: number, d: Partial<Session>) => sessions.set(id, { ...ses(id), ...d });
const clearSes = (id: number) => sessions.set(id, { step: "idle" });

// ─── CHECK EXPIRACIONES ───────────────────────────────

let lastCheck = 0;
async function checkExpiraciones() {
  try {
    const lista = await getProxiesParaAvisar(DIAS_AVISO);
    for (const cp of lista) {
      const dias = Math.floor((cp.fechaExpira - Date.now()) / 86400000);
      const [ip, port] = cp.full.split(":");
      await send(cp.chatId,
        `⚠️ <b>Tu IP está por expirar</b>\n━━━━━━━━━━━━━━\n\n` +
        `🌐 IP:     <code>${ip}</code>\n🔌 Puerto: <code>${port}</code>\n` +
        `📆 Expira: <b>${fecha(cp.fechaExpira)}</b>\n⏳ Quedan: <b>${dias} día(s)</b>\n\n` +
        `🚨 <b>Renuévala antes de que se elimine.</b>`,
        { reply_markup: inline([[{ text: "🔄 Renovar ahora", data: `renovar_${ip}:${port}` }]]) }
      );
      await markAvisado(cp.id, cp.chatId);
    }
  } catch (e) { console.error("[expiraciones]", e); }
}

// ─── TELEGRAM HELPERS ─────────────────────────────────

async function tPost(method: string, body: object) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}
async function send(chatId: number, text: string, extra: object = {}) {
  return tPost("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}
function menu() {
  return { keyboard: [
    [{ text: "🛒 Comprar IPs" }, { text: "🔄 Renovar IP" }],
    [{ text: "📋 Mis IPs" },     { text: "ℹ️ Ayuda" }],
    [{ text: "🧾 Cuentas Mega" }],
  ], resize_keyboard: true };
}
function inline(rows: { text: string; data: string }[][]) {
  return { inline_keyboard: rows.map(r => r.map(b => ({ text: b.text, callback_data: b.data }))) };
}

// ─── UTILS ────────────────────────────────────────────

const orderId = () => `ORD-${Date.now().toString(36).toUpperCase()}`;
const fecha   = (ts: number) => new Date(ts).toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });
const dias    = (ts: number) => Math.floor((ts - Date.now()) / 86400000);

function monto(metodo: MetodoKey, qty: number) {
  if (metodo === "banreservas") return `RD$ ${(qty * PRECIO_DOP).toLocaleString()}`;
  if (metodo === "zelle")       return `$${qty * PRECIO_ZELLE} USD`;
  return `$${qty * PRECIO_USD} USD`;
}
function metodoKey(nombre: string): MetodoKey {
  return (Object.entries(METODOS).find(([, v]) => v.nombre === nombre)?.[0] ?? "banreservas") as MetodoKey;
}
function cpId(chatId: number, full: string) {
  const [ip, port] = full.split(":");
  return `${chatId}_${ip}_${port}`;
}

// ─── PROXY6 ───────────────────────────────────────────

async function p6(endpoint: string) {
  return (await fetch(`${P6_API}/${endpoint}`)).json();
}
async function getCredenciales(hostPort: string): Promise<string | null> {
  try {
    const [host, port] = hostPort.split(":");
    const data = await p6("getproxy?state=active&limit=1000") as any;
    if (data.status !== "yes") return null;
    const found = Object.values(data.list as any[]).find(
      (p: any) => p.host === host && String(p.port) === port
    ) as any;
    return found ? `${found.host}:${found.port}:${found.user}:${found.pass}` : null;
  } catch { return null; }
}
async function findProxy6(hostPort: string): Promise<any> {
  try {
    const [host, port] = hostPort.split(":");
    const data = await p6("getproxy?state=active&limit=1000") as any;
    if (data.status !== "yes") return null;
    return Object.values(data.list as any[]).find(
      (p: any) => p.host === host && String(p.port) === port
    ) ?? null;
  } catch { return null; }
}

// ─── FACTURA ──────────────────────────────────────────

function factura(order: Order, proxies: string[]) {
  const ahora  = Date.now();
  const expira = ahora + 30 * 86400000;
  const mk     = metodoKey(order.metodoPago);
  const bloque = proxies.map((p, i) => {
    const [ip, port, user, pass] = p.split(":");
    return `<b>IP ${i + 1}:</b>\n  🌐 <code>${ip}</code>\n  🔌 <code>${port}</code>\n  👤 <code>${user ?? ""}</code>\n  🔑 <code>${pass ?? ""}</code>`;
  }).join("\n\n");

  return (
    `━━━━━━━━━━━━━━━━━━━━\n🧾 <b>FACTURA — AngelVercel</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:  <code>${order.orderId}</code>\n📅 Fecha:   ${fecha(ahora)}\n` +
    `👤 Cliente: ${order.firstName}\n💳 Método:  ${order.metodoPago}\n` +
    `💵 Monto:   <b>${monto(mk, order.qty)}</b>\n📆 Expira:  ${fecha(expira)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n🔐 <b>TUS IPs</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    bloque +
    `\n\n━━━━━━━━━━━━━━━━━━━━\n✅ <b>Pago Confirmado</b> · Protocolo HTTPS\n` +
    `💡 <i>Guarda este mensaje.</i>\n📩 Soporte: @Soportetecnico2323\n━━━━━━━━━━━━━━━━━━━━`
  );
}

// ─── NOTIF ADMIN ──────────────────────────────────────

function confirmBtns(orderId: string) {
  return inline([[{ text: "✅ Confirmar", data: `confirm_${orderId}` }, { text: "❌ Rechazar", data: `reject_${orderId}` }]]);
}
function clienteLink(order: Order) {
  return order.username ? `@${order.username}` : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;
}
async function notifyAdmin(order: Order) {
  const esRenov  = order.tipo === "renovacion";
  const detalle  = esRenov
    ? `🔌 IP: <code>${order.proxyRenovar}</code>`
    : `📦 Cantidad: <b>${order.qty} IP(s)</b>`;
  await send(ADMIN,
    `🔔 <b>${esRenov ? "🔄 RENOVACIÓN" : "🛒 NUEVA COMPRA"} — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 ${clienteLink(order)}\n${detalle}\n💳 <b>${order.metodoPago}</b>\n` +
    `🕐 ${new Date(order.createdAt).toLocaleString("es-DO")}\n\n⏳ Esperando comprobante...`,
    { reply_markup: confirmBtns(order.orderId) }
  );
}
async function notifyComprobante(order: Order, photoId?: string, texto?: string) {
  const esRenov = order.tipo === "renovacion";
  const detalle = esRenov ? `🔌 <code>${order.proxyRenovar}</code>` : `📦 <b>${order.qty} IP(s)</b>`;
  const caption =
    `📸 <b>COMPROBANTE — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 ${clienteLink(order)}\n${detalle}\n💳 <b>${order.metodoPago}</b>\n\nConfirma o rechaza:`;
  const kb = confirmBtns(order.orderId);
  if (photoId) {
    await tPost("sendPhoto", { chat_id: ADMIN, photo: photoId, caption, parse_mode: "HTML", reply_markup: kb });
  } else {
    await send(ADMIN, caption + (texto ? `\n\n📝 Referencia: <i>${texto}</i>` : ""), { reply_markup: kb });
  }
}

// ─── ENTREGA ──────────────────────────────────────────

async function entregar(order: Order, proxies: string[]) {
  await send(order.chatId, factura(order, proxies), { reply_markup: menu() });

  const expira = Date.now() + 30 * 86400000;
  for (const full of proxies) {
    await saveClientProxy({
      id: cpId(order.chatId, full), chatId: order.chatId,
      full, orderId: order.orderId, fechaExpira: expira, avisado: false,
    });
  }

  const mk = metodoKey(order.metodoPago);
  await saveStat({
    orderId: order.orderId, chatId: order.chatId, firstName: order.firstName,
    username: order.username, qty: order.qty, metodoPago: order.metodoPago,
    monto: monto(mk, order.qty), tipo: order.tipo, fecha: Date.now(),
  });

  await updateOrderStatus(order.orderId, "completed", proxies);
  clearSes(order.chatId);
}

// ─── RENOVACIÓN ───────────────────────────────────────

async function finalizarRenovacion(order: Order, adminId: number) {
  const nuevaExpira = Date.now() + DIAS_RENOV * 86400000;
  const [ip, port]  = (order.proxyRenovar ?? ":").split(":");
  const mk          = metodoKey(order.metodoPago);

  // Actualizar fecha en historial del cliente
  const clientIPs = await getClientProxies(order.chatId);
  const cp = clientIPs.find((p) => p.full.startsWith(order.proxyRenovar!));
  if (cp) await saveClientProxy({ ...cp, fechaExpira: nuevaExpira, avisado: false });

  await saveStat({
    orderId: order.orderId, chatId: order.chatId, firstName: order.firstName,
    username: order.username, qty: 1, metodoPago: order.metodoPago,
    monto: monto(mk, 1), tipo: "renovacion", fecha: Date.now(),
  });

  await send(order.chatId,
    `━━━━━━━━━━━━━━━━━━━━\n🔄 <b>RENOVACIÓN — AngelVercel</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:  <code>${order.orderId}</code>\n👤 Cliente: ${order.firstName}\n━━━━━━━━━━━━━━━━━━━━\n` +
    `  🌐 IP:     <code>${ip}</code>\n  🔌 Puerto: <code>${port}</code>\n\n` +
    `📆 Nueva expiración: <b>${fecha(nuevaExpira)}</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Renovación Confirmada</b>\n💡 <i>Tus credenciales siguen igual.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: menu() }
  );

  await updateOrderStatus(order.orderId, "completed");
  clearSes(order.chatId);
  await send(adminId, `✅ Renovación <b>${order.orderId}</b> completada.`);
}

// ─── FLUJOS USUARIO ───────────────────────────────────

async function handleStart(chatId: number, firstName: string) {
  clearSes(chatId);
  await send(chatId,
    `🌐 <b>Bienvenido, ${firstName}!</b>\n\nCompra y renueva IPs privadas.\n\n` +
    `📌 <b>Precios por IP:</b>\n• Banreservas: <b>RD$ ${PRECIO_DOP.toLocaleString()}</b>\n` +
    `• Remitly: <b>$${PRECIO_USD} USD</b>\n• Zelle: <b>$${PRECIO_ZELLE} USD</b>\n\nUsa los botones 👇`,
    { reply_markup: menu() }
  );
}

async function handleComprar(chatId: number) {
  setSes(chatId, { step: "qty" });
  const stock = await poolCount();
  const opciones = [1, 3, 5, 10, 20, 50];
  const rows: { text: string; data: string }[][] = [];
  for (let i = 0; i < opciones.length; i += 3) {
    rows.push(opciones.slice(i, i + 3).map(n => ({ text: `${n} IP${n > 1 ? "s" : ""}`, data: `qty_${n}` })));
  }
  const stockMsg = stock === 0
    ? `⚠️ <b>Sin stock inmediato.</b> Puedes ordenar y te las enviamos en 30 min.\n\n`
    : `🟢 <b>Disponibles ahora: ${stock} IP(s)</b>\n\n`;
  await send(chatId, stockMsg + `¿Cuántas necesitas?`, { reply_markup: inline(rows) });
}

async function handleQty(chatId: number, qty: number) {
  setSes(chatId, { step: "payment", qty });
  await send(chatId,
    `✅ <b>${qty} IP(s)</b>\n\n💵 <b>Total:</b>\n` +
    `• Banreservas: <b>RD$ ${(qty * PRECIO_DOP).toLocaleString()}</b>\n` +
    `• Remitly: <b>$${qty * PRECIO_USD} USD</b>\n• Zelle: <b>$${qty * PRECIO_ZELLE} USD</b>\n\n` +
    `💳 <b>¿Con qué método pagas?</b>`,
    { reply_markup: inline([
      [{ text: "🏦 Banreservas", data: "pay_banreservas" }],
      [{ text: "💸 Remitly",     data: "pay_remitly"     }],
      [{ text: "💳 Zelle",       data: "pay_zelle"       }],
      [{ text: "❌ Cancelar",    data: "cancel"          }],
    ]) }
  );
}

async function handleMetodo(chatId: number, firstName: string, username: string | undefined, metodo: MetodoKey, tipo: OrderType = "compra") {
  const s   = ses(chatId);
  const oid = orderId();
  const qty = tipo === "renovacion" ? 1 : s.qty ?? 1;
  const m   = METODOS[metodo];

  const order: Order = {
    orderId: oid, chatId, firstName, username, qty,
    metodoPago: m.nombre, status: "pending_payment",
    createdAt: Date.now(), tipo,
    proxyRenovar: tipo === "renovacion" ? s.proxyRenovar : undefined,
  };

  await saveOrder(order);
  setSes(chatId, { step: "waiting_receipt", orderId: oid });

  const detalle = tipo === "renovacion"
    ? `🔄 Renovación\n🔌 IP: <code>${s.proxyRenovar}</code>`
    : `📦 <b>${qty} IP(s)</b>`;

  await send(chatId,
    `${m.emoji} <b>${m.nombre}</b>\n━━━━━━━━━━━━━━\n\n${m.detalle}\n\n` +
    `${detalle}\n📦 Pedido: <code>${oid}</code>\n💵 <b>Total: ${monto(metodo, qty)}</b>\n\n` +
    `📸 Envía foto o número de referencia del comprobante.\n⏳ Confirmamos en menos de <b>30 minutos</b>.`
  );
  await notifyAdmin(order);
}

async function handleRenovarStart(chatId: number) {
  setSes(chatId, { step: "renew_input" });
  await send(chatId,
    `🔄 <b>Renovar IP</b>\n━━━━━━━━━━━━━━\n\nEnvíame la <b>IP:Puerto</b> de tu proxy.\n\nEjemplo: <code>196.19.157.34:8000</code>`,
    { reply_markup: { keyboard: [[{ text: "❌ Cancelar" }]], resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function handleRenovarIP(chatId: number, firstName: string, username: string | undefined, hostPort: string) {
  const partes = hostPort.trim().split(":");
  if (partes.length !== 2 || !partes[0] || isNaN(Number(partes[1]))) {
    await send(chatId, `❌ Formato incorrecto. Debe ser: <code>IP:Puerto</code>`);
    return;
  }
  setSes(chatId, { step: "renew_payment", proxyRenovar: hostPort.trim() });
  await send(chatId,
    `✅ IP: <code>${hostPort.trim()}</code>\n\n📅 Renovación por <b>${DIAS_RENOV} días</b>\n\n` +
    `💵 <b>Costo:</b>\n• Banreservas: <b>RD$ ${PRECIO_DOP.toLocaleString()}</b>\n` +
    `• Remitly: <b>$${PRECIO_USD} USD</b>\n• Zelle: <b>$${PRECIO_ZELLE} USD</b>\n\n💳 <b>¿Con qué método?</b>`,
    { reply_markup: inline([
      [{ text: "🏦 Banreservas", data: "renew_pay_banreservas" }],
      [{ text: "💸 Remitly",     data: "renew_pay_remitly"     }],
      [{ text: "💳 Zelle",       data: "renew_pay_zelle"       }],
      [{ text: "❌ Cancelar",    data: "cancel"                }],
    ]) }
  );
}

async function handleMisIPs(chatId: number) {
  const lista = (await getClientProxies(chatId)).filter(p => dias(p.fechaExpira) >= 0);
  if (!lista.length) {
    await send(chatId,
      `📋 <b>Mis IPs</b>\n━━━━━━━━━━━━━━\n\nNo tienes IPs activas.\nUsa <b>🛒 Comprar IPs</b> para adquirir una.`,
      { reply_markup: menu() }
    );
    return;
  }
  let txt = `📋 <b>Mis IPs activas (${lista.length})</b>\n━━━━━━━━━━━━━━\n\n`;
  for (const cp of lista) {
    const [ip, port] = cp.full.split(":");
    const d = dias(cp.fechaExpira);
    const estado = d <= DIAS_AVISO ? `⚠️ <b>${d} día(s) — Renueva pronto</b>` : `✅ ${d} día(s)`;
    txt += `🌐 <code>${ip}</code>:<code>${port}</code>\n📆 ${fecha(cp.fechaExpira)}\n⏳ ${estado}\n━━━━━━━━━━━━━━\n`;
  }
  await send(chatId, txt, { reply_markup: menu() });
}

async function handleAyuda(chatId: number) {
  await send(chatId,
    `ℹ️ <b>¿Cómo funciona?</b>\n\n` +
    `<b>🛒 Comprar:</b>\n1. Elige cuántas IPs\n2. Elige método de pago\n3. Paga y envía comprobante\n4. En 30 min recibes tus IPs ✅\n\n` +
    `<b>🔄 Renovar:</b>\n1. Envía tu IP:Puerto\n2. Paga y envía comprobante\n3. Tu IP se renueva ${DIAS_RENOV} días ✅\n\n` +
    `<b>📋 Mis IPs:</b> Ver tus IPs activas y fechas de expiración.\n\n📩 Soporte: @Soportetecnico2323`,
    { reply_markup: menu() }
  );
}

// ─── FLUJOS ADMIN ─────────────────────────────────────

async function adminConfirmar(orderId: string, adminId: number) {
  const order = await getOrder(orderId);
  if (!order) { await send(adminId, `❌ Pedido <code>${orderId}</code> no encontrado.`); return; }
  if (order.status === "completed") { await send(adminId, `⚠️ Ya fue entregado.`); return; }

  if (order.tipo === "renovacion") {
    // Intentar renovar en Proxy6 automáticamente
    const proxy = await findProxy6(order.proxyRenovar!);
    if (proxy) {
      const r = await p6(`prolong?period=${DIAS_RENOV}&ids=${proxy.id}`) as any;
      if (r.status === "yes") {
        await finalizarRenovacion(order, adminId);
        return;
      }
    }
    await send(adminId,
      `⚠️ No se pudo renovar en Proxy6 automáticamente.\n` +
      `Renueva manualmente y usa: <code>/renovado ${orderId}</code>`
    );
    return;
  }

  // Compra normal: tomar del pool
  const stock = await poolCount();
  if (stock < order.qty) {
    await send(adminId,
      `❌ <b>Stock insuficiente.</b>\nNecesitas: <b>${order.qty}</b> | Disponibles: <b>${stock}</b>\n\n` +
      `Agrega IPs enviándolas o entrega manual:\n<code>/entregar ${orderId} ip:port:user:pass</code>`
    );
    return;
  }

  const tomadas = await poolTake(order.qty);
  const proxies: string[] = [];
  for (const ip of tomadas) {
    proxies.push(ip.split(":").length >= 4 ? ip : (await getCredenciales(ip) ?? ip));
  }

  await entregar(order, proxies);
  await send(adminId, `✅ Pedido <b>${orderId}</b> entregado. ${proxies.length} IP(s) enviadas.\n📦 Quedan en pool: <b>${await poolCount()}</b>`);
}

async function adminRechazar(orderId: string, adminId: number) {
  const order = await getOrder(orderId);
  if (!order) { await send(adminId, `❌ Pedido no encontrado.`); return; }
  await updateOrderStatus(orderId, "cancelled");
  await send(order.chatId, `❌ <b>Pedido ${orderId} rechazado.</b>\nContacta: @Soportetecnico2323`, { reply_markup: menu() });
  await send(adminId, `✅ Rechazado. Cliente notificado.`);
}

async function adminStats(adminId: number) {
  const ahora = new Date();
  const stats = await getStatsMes(ahora.getMonth(), ahora.getFullYear());
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const ventas = stats.filter(s => s.tipo === "compra");
  const renov  = stats.filter(s => s.tipo === "renovacion");
  const stock  = await poolCount();

  const ingresos: Record<string, number> = {};
  for (const s of stats) {
    const n = parseFloat(s.monto.replace(/[^0-9.]/g, "")) || 0;
    ingresos[s.metodoPago] = (ingresos[s.metodoPago] ?? 0) + n;
  }

  let txt =
    `📊 <b>Stats — ${meses[ahora.getMonth()]} ${ahora.getFullYear()}</b>\n━━━━━━━━━━━━━━\n\n` +
    `📦 Pool disponible: <b>${stock} IP(s)</b>\n\n` +
    `🛒 Ventas: <b>${ventas.length}</b> pedidos — <b>${ventas.reduce((a, s) => a + s.qty, 0)}</b> IPs\n` +
    `🔄 Renovaciones: <b>${renov.length}</b>\n\n`;

  if (Object.keys(ingresos).length) {
    txt += `💵 <b>Ingresos estimados:</b>\n`;
    for (const [m, t] of Object.entries(ingresos)) txt += `  • ${m}: <b>${t.toLocaleString()}</b>\n`;
    txt += `\n`;
  }
  if (ventas.length) {
    txt += `📋 <b>Últimas ventas:</b>\n`;
    for (const s of ventas.slice(-5).reverse())
      txt += `  • ${s.username ? `@${s.username}` : s.firstName} — ${s.qty} IP(s) — ${s.metodoPago}\n`;
  }
  if (!stats.length) txt += `Sin actividad este mes.`;
  await send(adminId, txt);
}

// ─── ROUTE HANDLER ────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Check expiración en background cada 30 min
    if (Date.now() - lastCheck > 30 * 60 * 1000) {
      lastCheck = Date.now();
      checkExpiraciones().catch(console.error);
    }

    const body = await req.json();
    const { message, callback_query: cq } = body;

    // ── MENSAJES ────────────────────────────────────────
    if (message) {
      const chatId   = message.chat.id as number;
      const text     = (message.text || "") as string;
      const nombre   = (message.from?.first_name || "Usuario") as string;
      const username = message.from?.username as string | undefined;
      const isAdmin  = chatId === ADMIN;
      const s        = ses(chatId);

      // Foto comprobante
      if (message.photo && s.step === "waiting_receipt" && s.orderId) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        const order  = await getOrder(s.orderId);
        if (order) {
          await updateOrderStatus(s.orderId, "pending_confirm");
          await send(chatId, `📸 Comprobante recibido.\n\nPedido <code>${s.orderId}</code> en revisión.\n⏳ Te confirmamos en 30 min.`);
          await notifyComprobante(order, fileId);
        }
        return NextResponse.json({ ok: true });
      }

      // Texto comprobante
      if (s.step === "waiting_receipt" && s.orderId && text && !text.startsWith("/") && text !== "❌ Cancelar") {
        const order = await getOrder(s.orderId);
        if (order) {
          await updateOrderStatus(s.orderId, "pending_confirm");
          await send(chatId, `📝 Referencia recibida.\n\nPedido <code>${s.orderId}</code> en revisión.\n⏳ Te confirmamos en 30 min.`);
          await notifyComprobante(order, undefined, text);
        }
        return NextResponse.json({ ok: true });
      }

      // Input IP renovación
      if (s.step === "renew_input" && text && !text.startsWith("/") && text !== "❌ Cancelar") {
        await handleRenovarIP(chatId, nombre, username, text);
        return NextResponse.json({ ok: true });
      }

      if (text === "❌ Cancelar") {
        clearSes(chatId);
        await send(chatId, "❌ Cancelado.", { reply_markup: menu() });
        return NextResponse.json({ ok: true });
      }

      // ── ADMIN ──────────────────────────────────────────
      if (isAdmin) {
        // Agregar IP al pool (con o sin credenciales)
        if (/^\d+\.\d+\.\d+\.\d+:\d+/.test(text.trim())) {
          const count = await poolAdd(text.trim());
          await send(chatId, `✅ IP agregada.\n🌐 <code>${text.trim()}</code>\n📦 Pool total: <b>${count}</b>`);
          return NextResponse.json({ ok: true });
        }
        if (text === "/stats")   { await adminStats(chatId); return NextResponse.json({ ok: true }); }
        if (text === "/lista")   {
          const lista = await poolList();
          await send(chatId, lista.length
            ? `📋 <b>Pool (${lista.length} IPs):</b>\n\n${lista.map((ip, i) => `${i + 1}. <code>${ip}</code>`).join("\n")}`
            : `📋 El pool está vacío.`
          );
          return NextResponse.json({ ok: true });
        }
        if (text === "/flush") {
          await poolFlush();
          await send(chatId, `🗑️ Pool vaciado.`);
          return NextResponse.json({ ok: true });
        }
        if (text.startsWith("/limpiar")) {
          const ip = text.replace("/limpiar", "").trim();
          await poolRemove(ip);
          await send(chatId, `✅ <code>${ip}</code> eliminada.\n📦 Quedan: <b>${await poolCount()}</b>`);
          return NextResponse.json({ ok: true });
        }
        if (text.startsWith("/entregar")) {
          const parts  = text.trim().split(/\s+/);
          const oid    = parts[1];
          const proxies = parts.slice(2);
          const order  = await getOrder(oid);
          if (!order) { await send(chatId, `❌ Pedido no encontrado.`); return NextResponse.json({ ok: true }); }
          await entregar(order, proxies);
          await send(chatId, `✅ IPs entregadas al cliente.`);
          return NextResponse.json({ ok: true });
        }
        if (text.startsWith("/renovado")) {
          const oid   = text.trim().split(/\s+/)[1];
          const order = await getOrder(oid);
          if (!order || order.tipo !== "renovacion") { await send(chatId, `❌ Pedido no encontrado.`); return NextResponse.json({ ok: true }); }
          await finalizarRenovacion(order, chatId);
          return NextResponse.json({ ok: true });
        }
      }

      // ── MENÚ ───────────────────────────────────────────
      if      (text === "/start")             await handleStart(chatId, nombre);
      else if (text === "🛒 Comprar IPs")     await handleComprar(chatId);
      else if (text === "🔄 Renovar IP")      await handleRenovarStart(chatId);
      else if (text === "📋 Mis IPs")         await handleMisIPs(chatId);
      else if (text === "ℹ️ Ayuda")           await handleAyuda(chatId);
      else if (text === "🧾 Cuentas Mega")    await send(chatId, `🧾 <b>Cuentas Mega</b>\n\n⏳ <i>Próximamente.</i>`, { reply_markup: menu() });
      else if (!isAdmin && s.step === "idle") await send(chatId, `Usa los botones del menú 👇`, { reply_markup: menu() });
    }

    // ── CALLBACKS ───────────────────────────────────────
    if (cq) {
      const chatId   = cq.message.chat.id as number;
      const data     = cq.data as string;
      const nombre   = (cq.from?.first_name || "Usuario") as string;
      const username = cq.from?.username as string | undefined;

      await tPost("answerCallbackQuery", { callback_query_id: cq.id });

      if (data === "cancel") {
        clearSes(chatId);
        await send(chatId, "❌ Cancelado.", { reply_markup: menu() });
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith("renovar_")) {
        const hp = data.replace("renovar_", "");
        setSes(chatId, { step: "renew_payment", proxyRenovar: hp });
        await send(chatId,
          `✅ IP: <code>${hp}</code>\n\n📅 Renovación por <b>${DIAS_RENOV} días</b>\n\n💳 <b>¿Con qué método?</b>`,
          { reply_markup: inline([
            [{ text: "🏦 Banreservas", data: "renew_pay_banreservas" }],
            [{ text: "💸 Remitly",     data: "renew_pay_remitly"     }],
            [{ text: "💳 Zelle",       data: "renew_pay_zelle"       }],
            [{ text: "❌ Cancelar",    data: "cancel"                }],
          ]) }
        );
        return NextResponse.json({ ok: true });
      }

      if      (data.startsWith("qty_"))         await handleQty(chatId, parseInt(data.replace("qty_", "")));
      else if (data.startsWith("pay_"))         await handleMetodo(chatId, nombre, username, data.replace("pay_", "") as MetodoKey, "compra");
      else if (data.startsWith("renew_pay_"))   await handleMetodo(chatId, nombre, username, data.replace("renew_pay_", "") as MetodoKey, "renovacion");
      else if (data.startsWith("confirm_") && chatId === ADMIN) await adminConfirmar(data.replace("confirm_", ""), chatId);
      else if (data.startsWith("reject_")  && chatId === ADMIN) await adminRechazar(data.replace("reject_", ""), chatId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ProxyShop]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// ─── WEBHOOK ──────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const action = new URL(req.url).searchParams.get("action");
  if (action === "setWebhook") {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return NextResponse.json({ error: "Falta ?url=" });
    return NextResponse.json(await (await fetch(`${API}/setWebhook?url=${encodeURIComponent(url)}`)).json());
  }
  if (action === "getWebhook") {
    return NextResponse.json(await (await fetch(`${API}/getWebhookInfo`)).json());
  }
  return NextResponse.json({ bot: "ProxyShop", status: "ok" });
}
