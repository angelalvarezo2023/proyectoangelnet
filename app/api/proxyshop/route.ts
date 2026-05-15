import { NextRequest, NextResponse } from "next/server";
import {
  getPool, addToPool, removeFromPoolMany,
  saveOrder, getOrder, updateOrderStatus,
  getClientProxies, saveClientProxy, markAvisado, getProxiesParaAvisar,
  saveStat, getStatsMes,
  type Order, type OrderStatus, type OrderType, type ClientProxy,
} from "@/lib/proxyshop-db";

const TOKEN = "8798842692:AAHzSInpAEcNxsDkf8_FkJTPGNPjD3qdu-Q";
const API = `https://api.telegram.org/bot${TOKEN}`;
const PROXY6_KEY = "c5008743d3-dfb41a5904-d007bb3002";
const PROXY6_API = `https://px6.link/api/${PROXY6_KEY}`;

const ADMIN_ID = 1466412206;
const DIAS_RENOVACION = 30;
const DIAS_AVISO_EXPIRACION = 3;

const PRECIO_DOP = 1000;
const PRECIO_USD = 18;
const PRECIO_ZELLE = 28;

const METODOS_PAGO = {
  banreservas: {
    emoji: "🏦",
    nombre: "Banreservas",
    detalle: `Cuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>`,
  },
  remitly: {
    emoji: "💸",
    nombre: "Remitly",
    detalle: `Pais: <b>Republica Dominicana, Santiago</b>\nCuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>`,
  },
  zelle: {
    emoji: "💳",
    nombre: "Zelle",
    detalle: `Email: <code>estherlopeztineo2025@gmail.com</code>\nTitular: <b>Laury Lopez</b>`,
  },
};

// Sesiones en memoria (no necesitan persistir — se resetean con cada conversación)
type Session = {
  step: "idle" | "qty" | "payment" | "waiting_receipt" | "renew_input" | "renew_payment";
  qty?: number;
  metodoPago?: string;
  orderId?: string;
  proxyRenovar?: string;
};
const sessions: Record<number, Session> = {};

// ─── HELPERS ───────────────────────────────────────────
async function tPost(method: string, body: object): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId: number, text: string, extra: object = {}): Promise<any> {
  return tPost("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

async function proxy6Get(endpoint: string): Promise<any> {
  const res = await fetch(`${PROXY6_API}/${endpoint}`);
  return res.json();
}

function generateOrderId(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

function formatFecha(ts: number): string {
  return new Date(ts).toLocaleDateString("es-ES", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function diasRestantes(ts: number): number {
  return Math.floor((ts - Date.now()) / (1000 * 60 * 60 * 24));
}

function getPrecioMonto(metodo: string, qty: number): string {
  if (metodo === "banreservas") return `RD$ ${(qty * PRECIO_DOP).toLocaleString()}`;
  if (metodo === "zelle") return `$${qty * PRECIO_ZELLE} USD`;
  return `$${qty * PRECIO_USD} USD`;
}

function mainMenu() {
  return {
    keyboard: [
      [{ text: "🛒 Comprar IPs" }, { text: "🔄 Renovar IP" }],
      [{ text: "📋 Mis IPs" }, { text: "ℹ️ Ayuda" }],
      [{ text: "🧾 Comprar Cuentas" }],
    ],
    resize_keyboard: true,
  };
}

function inlineBtn(rows: { text: string; data: string }[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((btn) => ({ text: btn.text, callback_data: btn.data }))
    ),
  };
}

function getSession(chatId: number): Session {
  return sessions[chatId] || { step: "idle" };
}

function setSession(chatId: number, data: Partial<Session>) {
  sessions[chatId] = { ...(sessions[chatId] || { step: "idle" }), ...data };
}

// ─── AVISOS DE EXPIRACIÓN ──────────────────────────────
async function checkExpiraciones() {
  try {
    const proxies = await getProxiesParaAvisar(DIAS_AVISO_EXPIRACION);
    for (const cp of proxies) {
      const dias = diasRestantes(cp.fechaExpira);
      const [ip, port] = cp.full.split(":");
      await sendMessage(
        cp.chatId,
        `⚠️ <b>Tu IP esta por expirar</b>\n━━━━━━━━━━━━━━\n\n` +
        `🌐 IP:   <code>${ip}</code>\n` +
        `🔌 Port: <code>${port}</code>\n` +
        `📆 Expira: <b>${formatFecha(cp.fechaExpira)}</b>\n` +
        `⏳ Te quedan: <b>${dias} dia(s)</b>\n\n` +
        `🚨 <b>Si no la renuevas, sera eliminada y no podras recuperarla.</b>\n\n` +
        `Toca el boton para renovarla ahora 👇`,
        { reply_markup: inlineBtn([[{ text: "🔄 Renovar ahora", data: `renovar_rapido_${ip}:${port}` }]]) }
      );
      if (cp.id) await markAvisado(cp.id);
    }
  } catch (err) {
    console.error("checkExpiraciones error:", err);
  }
}

// ─── POOL DE IPs ───────────────────────────────────────
async function fetchProxyData(hostPort: string): Promise<string | null> {
  try {
    const [host, port] = hostPort.split(":");
    const data = await proxy6Get("getproxy?state=active&limit=1000");
    if (data.status !== "yes") return null;
    const all = Object.values(data.list) as any[];
    const found = all.find(
      (p: any) => p.host === host.trim() && String(p.port) === String(port?.trim())
    );
    if (!found) return null;
    return `${found.host}:${found.port}:${found.user}:${found.pass}`;
  } catch { return null; }
}

async function agregarProxy(input: string, adminChatId: number) {
  const parts = input.trim().split(":");

  if (parts.length < 2 || !parts[0] || !parts[1] || isNaN(Number(parts[1]))) {
    await sendMessage(adminChatId,
      `❌ Formato incorrecto.\nEnvia: <code>IP:Puerto</code>\nEjemplo: <code>181.177.86.38:9344</code>`
    );
    return;
  }

  const hostPort = `${parts[0].trim()}:${parts[1].trim()}`;
  const pool = await getPool();

  if (pool.some((p) => p.hostPort === hostPort)) {
    await sendMessage(adminChatId, `⚠️ Esa IP ya esta en la lista.`);
    return;
  }

  // Guardar inmediatamente con hostPort como placeholder
  // Los datos completos se obtienen de Proxy6 al momento de entregar
  await addToPool({ hostPort, full: hostPort, addedAt: Date.now() });
  const poolActualizado = await getPool();
  const lista = poolActualizado.map((p, i) => `${i + 1}. <code>${p.hostPort}</code>`).join("\n");

  await sendMessage(adminChatId,
    `✅ <b>IP agregada.</b>\n\n` +
    `🌐 <code>${hostPort}</code>\n` +
    `📦 Disponibles ahora: <b>${poolActualizado.length}</b>\n\n${lista}`
  );
}

async function handleLimpiarIP(input: string, adminChatId: number) {
  const hostPort = input.replace("/limpiar", "").trim();
  if (!hostPort) {
    await sendMessage(adminChatId,
      `❌ Uso: <code>/limpiar IP:Puerto</code>
Ejemplo: <code>/limpiar 186.65.117.52:9927</code>`
    );
    return;
  }
  await removeFromPool(hostPort);
  const pool = await getPool();
  await sendMessage(adminChatId,
    `✅ <code>${hostPort}</code> eliminada del pool.
📦 Disponibles ahora: <b>${pool.length}</b>`
  );
}

async function findProxyByHostPort(hostPort: string): Promise<any | null> {
  try {
    const [host, port] = hostPort.split(":");
    const data = await proxy6Get("getproxy?state=active&limit=1000");
    if (data.status !== "yes") return null;
    const all = Object.values(data.list) as any[];
    return all.find(
      (p: any) => p.host === host.trim() && String(p.port) === String(port?.trim())
    ) || null;
  } catch { return null; }
}

// ─── FACTURA ───────────────────────────────────────────
function generarFacturaTexto(order: Order, proxies: string[]): string {
  const ahora = Date.now();
  const expira = ahora + 30 * 24 * 60 * 60 * 1000;
  const metodoKey = Object.entries(METODOS_PAGO).find(([, v]) => v.nombre === order.metodoPago)?.[0] || "banreservas";
  const monto = getPrecioMonto(metodoKey, order.qty);

  const proxiesFormateados = proxies.map((proxy, i) => {
    const [ip, port, usuario, clave] = proxy.split(":");
    return (
      `<b>IP ${i + 1}:</b>\n` +
      `  🌐 IP:       <code>${ip || ""}</code>\n` +
      `  🔌 Port:     <code>${port || ""}</code>\n` +
      `  👤 Usuario:  <code>${usuario || ""}</code>\n` +
      `  🔑 Clave:    <code>${clave || ""}</code>`
    );
  }).join("\n\n");

  return (
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾  <b>FACTURA  •  AngelVercel</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n` +
    `📅 Fecha:    ${formatFecha(ahora)}\n` +
    `👤 Cliente:  ${order.firstName}\n` +
    `💳 Metodo:   ${order.metodoPago}\n` +
    `💵 Monto:    <b>${monto}</b>\n` +
    `📆 Expira:   ${formatFecha(expira)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 <b>IPs ENTREGADAS</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    proxiesFormateados + `\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 Protocolo: HTTPS ✓\n` +
    `✅ <b>Pago Confirmado</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Guarda este mensaje como comprobante.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n` +
    `━━━━━━━━━━━━━━━━━━━━`
  );
}

// ─── NOTIFICAR ADMIN ───────────────────────────────────
async function notifyAdmin(order: Order) {
  const userLink = order.username ? `@${order.username}` : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;
  const esRenovacion = order.tipo === "renovacion";
  const detalle = esRenovacion
    ? `🔌 IP: <code>${order.proxyRenovar}</code>\n📅 Dias: <b>${DIAS_RENOVACION}</b>`
    : `📦 Cantidad: <b>${order.qty} IP(s)</b>`;

  await sendMessage(ADMIN_ID,
    `🔔 <b>${esRenovacion ? "🔄 RENOVACION" : "🛒 NUEVA COMPRA"} — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 Cliente: ${userLink}\n${detalle}\n` +
    `💳 Metodo: <b>${order.metodoPago}</b>\n` +
    `🕐 ${new Date(order.createdAt).toLocaleString("es-DO")}\n\n` +
    `⏳ <i>Esperando comprobante...</i>`,
    { reply_markup: inlineBtn([[{ text: "✅ Confirmar", data: `confirm_${order.orderId}` }, { text: "❌ Rechazar", data: `reject_${order.orderId}` }]]) }
  );
}

async function notifyAdminReceipt(order: Order, photoFileId?: string, receiptText?: string) {
  const userLink = order.username ? `@${order.username}` : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;
  const esRenovacion = order.tipo === "renovacion";
  const detalle = esRenovacion ? `🔌 IP: <code>${order.proxyRenovar}</code>` : `📦 Cantidad: <b>${order.qty} IP(s)</b>`;
  const caption =
    `📸 <b>COMPROBANTE — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 ${userLink}\n${detalle}\n💳 <b>${order.metodoPago}</b>\n\nConfirma o rechaza:`;
  const keyboard = inlineBtn([[{ text: "✅ Confirmar", data: `confirm_${order.orderId}` }, { text: "❌ Rechazar", data: `reject_${order.orderId}` }]]);

  if (photoFileId) {
    await tPost("sendPhoto", { chat_id: ADMIN_ID, photo: photoFileId, caption, parse_mode: "HTML", reply_markup: keyboard });
  } else {
    await sendMessage(ADMIN_ID, caption + (receiptText ? `\n\n📝 Referencia: <i>${receiptText}</i>` : ""), { reply_markup: keyboard });
  }
}

// ─── ENTREGAR ──────────────────────────────────────────
async function deliverProxies(order: Order, proxies: string[]) {
  const factura = generarFacturaTexto(order, proxies);
  await sendMessage(order.chatId, factura, { reply_markup: mainMenu() });

  // Guardar IPs del cliente en Firebase
  const expira = Date.now() + 30 * 24 * 60 * 60 * 1000;
  for (const full of proxies) {
    await saveClientProxy({ chatId: order.chatId, full, orderId: order.orderId, fechaExpira: expira, avisado: false });
  }

  // Guardar estadística
  const metodoKey = Object.entries(METODOS_PAGO).find(([, v]) => v.nombre === order.metodoPago)?.[0] || "banreservas";
  await saveStat({
    orderId: order.orderId, chatId: order.chatId,
    firstName: order.firstName, username: order.username,
    qty: order.qty, metodoPago: order.metodoPago,
    monto: getPrecioMonto(metodoKey, order.qty),
    tipo: order.tipo, fecha: Date.now(),
  });

  await updateOrderStatus(order.orderId, "completed", proxies);
  setSession(order.chatId, { step: "idle" });
}

// ─── RENOVACION ────────────────────────────────────────
async function confirmRenovacion(order: Order, adminChatId: number) {
  if (!order.proxyRenovar) { await sendMessage(adminChatId, "❌ No hay IP definida."); return; }
  await sendMessage(adminChatId, `⏳ Buscando en Proxy6...`);
  const proxy = await findProxyByHostPort(order.proxyRenovar);

  if (!proxy) {
    await sendMessage(adminChatId, `❌ IP no encontrada: <code>${order.proxyRenovar}</code>\n\nUsa: <code>/renovado ${order.orderId}</code>`);
    return;
  }

  const renewData = await proxy6Get(`prolong?period=${DIAS_RENOVACION}&ids=${proxy.id}`);
  if (renewData.status !== "yes") {
    await sendMessage(adminChatId, `❌ Error al renovar: ${renewData.error || "desconocido"}\n\nManual: <code>/renovado ${order.orderId}</code>`);
    return;
  }

  const nuevaExpira = Date.now() + DIAS_RENOVACION * 24 * 60 * 60 * 1000;
  const [ip, port] = order.proxyRenovar.split(":");

  // Actualizar fecha en Firebase
  const clientIPs = await getClientProxies(order.chatId);
  const cp = clientIPs.find((p) => p.full.startsWith(order.proxyRenovar!));
  if (cp?.id) await saveClientProxy({ ...cp, fechaExpira: nuevaExpira, avisado: false });

  // Guardar estadística
  const metodoKey = Object.entries(METODOS_PAGO).find(([, v]) => v.nombre === order.metodoPago)?.[0] || "banreservas";
  await saveStat({
    orderId: order.orderId, chatId: order.chatId,
    firstName: order.firstName, username: order.username,
    qty: 1, metodoPago: order.metodoPago,
    monto: getPrecioMonto(metodoKey, 1),
    tipo: "renovacion", fecha: Date.now(),
  });

  await sendMessage(order.chatId,
    `━━━━━━━━━━━━━━━━━━━━\n🔄  <b>RENOVACION  •  AngelVercel</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n👤 Cliente:  ${order.firstName}\n━━━━━━━━━━━━━━━━━━━━\n` +
    `  🌐 IP:      <code>${ip}</code>\n  🔌 Port:    <code>${port}</code>\n\n` +
    `📆 Nueva expiracion: <b>${formatFecha(nuevaExpira)}</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Renovacion Confirmada</b>\n💡 <i>Tus credenciales siguen siendo las mismas.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: mainMenu() }
  );

  await updateOrderStatus(order.orderId, "completed");
  setSession(order.chatId, { step: "idle" });
  await sendMessage(adminChatId, `✅ Renovacion ${order.orderId} completada y cliente notificado.`);
}

// ─── FLUJO PRINCIPAL ───────────────────────────────────
async function handleStart(chatId: number, firstName: string) {
  setSession(chatId, { step: "idle" });
  await sendMessage(chatId,
    `🌐 <b>Bienvenido, ${firstName}!</b>\n\n` +
    `Compra y renueva IPs privadas de forma rapida y segura.\n\n` +
    `📌 <b>Precios:</b>\n` +
    `• Banreservas: <b>RD$ ${PRECIO_DOP}</b> por IP\n` +
    `• Remitly: <b>$${PRECIO_USD} USD</b> por IP\n` +
    `• Zelle: <b>$${PRECIO_ZELLE} USD</b> por IP\n\n` +
    `Usa los botones para comenzar 👇`,
    { reply_markup: mainMenu() }
  );
}

async function handleBuyStart(chatId: number) {
  setSession(chatId, { step: "qty" });
  const pool = await getPool();
  const stock = pool.length;

  const opciones = [1, 3, 5, 10, 20, 50];
  const rows: { text: string; data: string }[][] = [];
  for (let i = 0; i < opciones.length; i += 3) {
    rows.push(opciones.slice(i, i + 3).map((n) => ({ text: n === 1 ? "1 IP" : `${n} IPs`, data: `qty_${n}` })));
  }

  const stockMsg = stock === 0
    ? `⚠️ <b>No hay IPs disponibles ahora mismo.</b>\nPuedes hacer tu pedido y te las enviamos en menos de 30 minutos.\n\n`
    : `🛒 <b>IPs disponibles: ${stock}</b>\n\n`;

  await sendMessage(chatId, stockMsg + `¿Cuantas necesitas?`, { reply_markup: inlineBtn(rows) });
}

async function handleQtySelected(chatId: number, qty: number) {
  setSession(chatId, { step: "payment", qty });
  await sendMessage(chatId,
    `✅ <b>${qty} IP(s)</b>\n\n` +
    `💵 <b>Total:</b>\n` +
    `• Banreservas: <b>RD$ ${(qty * PRECIO_DOP).toLocaleString()}</b>\n` +
    `• Remitly: <b>$${qty * PRECIO_USD} USD</b>\n` +
    `• Zelle: <b>$${qty * PRECIO_ZELLE} USD</b>\n\n` +
    `💳 <b>¿Con que metodo deseas pagar?</b>`,
    { reply_markup: inlineBtn([[{ text: "🏦 Banreservas", data: "pay_banreservas" }], [{ text: "💸 Remitly", data: "pay_remitly" }], [{ text: "💳 Zelle", data: "pay_zelle" }], [{ text: "❌ Cancelar", data: "cancel" }]]) }
  );
}

async function handlePaymentSelected(chatId: number, firstName: string, username: string | undefined, metodo: string, tipo: OrderType = "compra") {
  const session = getSession(chatId);
  const orderId = generateOrderId();
  const qty = tipo === "renovacion" ? 1 : session?.qty || 1;
  const monto = getPrecioMonto(metodo, qty);

  const order: Order = {
    orderId, chatId, firstName, username, qty,
    metodoPago: METODOS_PAGO[metodo as keyof typeof METODOS_PAGO].nombre,
    status: "pending_payment", createdAt: Date.now(), tipo,
    proxyRenovar: tipo === "renovacion" ? session?.proxyRenovar : undefined,
  };
  await saveOrder(order);
  setSession(chatId, { step: "waiting_receipt", metodoPago: metodo, orderId });

  const m = METODOS_PAGO[metodo as keyof typeof METODOS_PAGO];
  const descripcion = tipo === "renovacion"
    ? `🔄 Renovacion\n🔌 IP: <code>${session?.proxyRenovar}</code>\n📅 Dias: <b>${DIAS_RENOVACION}</b>`
    : `📦 <b>${qty} IP(s)</b>`;

  await sendMessage(chatId,
    `${m.emoji} <b>${m.nombre}</b>\n━━━━━━━━━━━━━━\n\n` +
    m.detalle + `\n\n${descripcion}\n` +
    `📦 Pedido: <code>${orderId}</code>\n💵 <b>Total: ${monto}</b>\n\n` +
    `📸 Envia una foto del comprobante de pago.\n⏳ Te respondemos en menos de <b>30 minutos</b>.`
  );
}

async function handleRenewStart(chatId: number) {
  setSession(chatId, { step: "renew_input" });
  await sendMessage(chatId,
    `🔄 <b>Renovar IP</b>\n━━━━━━━━━━━━━━\n\nEnviame la <b>IP:Puerto</b> de tu proxy.\n\n📋 Ejemplo: <code>196.19.157.34:8000</code>`,
    { reply_markup: { keyboard: [[{ text: "❌ Cancelar" }]], resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function handleRenewProxy(chatId: number, firstName: string, username: string | undefined, hostPort: string) {
  const partes = hostPort.trim().split(":");
  if (partes.length !== 2 || !partes[0] || !partes[1] || isNaN(Number(partes[1]))) {
    await sendMessage(chatId, `❌ Formato incorrecto.\nDebe ser: <code>IP:Puerto</code>\nEjemplo: <code>196.19.157.34:8000</code>`);
    return;
  }
  setSession(chatId, { step: "renew_payment", proxyRenovar: hostPort.trim() });
  await sendMessage(chatId,
    `✅ IP: <code>${hostPort.trim()}</code>\n\n📅 Renovacion por <b>${DIAS_RENOVACION} dias</b>\n\n` +
    `💵 <b>Costo:</b>\n• Banreservas: <b>RD$ ${PRECIO_DOP.toLocaleString()}</b>\n• Remitly: <b>$${PRECIO_USD} USD</b>\n• Zelle: <b>$${PRECIO_ZELLE} USD</b>\n\n💳 <b>¿Con que metodo deseas pagar?</b>`,
    { reply_markup: inlineBtn([[{ text: "🏦 Banreservas", data: "renew_pay_banreservas" }], [{ text: "💸 Remitly", data: "renew_pay_remitly" }], [{ text: "💳 Zelle", data: "renew_pay_zelle" }], [{ text: "❌ Cancelar", data: "cancel" }]]) }
  );
}

async function handleMisIPs(chatId: number) {
  const lista = (await getClientProxies(chatId)).filter((p) => diasRestantes(p.fechaExpira) >= 0);
  if (lista.length === 0) {
    await sendMessage(chatId, `📋 <b>Mis IPs</b>\n━━━━━━━━━━━━━━\n\nNo tienes IPs activas.\n\nUsa <b>🛒 Comprar IPs</b> para adquirir una.`, { reply_markup: mainMenu() });
    return;
  }
  let text = `📋 <b>Mis IPs activas</b>\n━━━━━━━━━━━━━━\n\n`;
  for (const cp of lista) {
    const [ip, port] = cp.full.split(":");
    const dias = diasRestantes(cp.fechaExpira);
    const estadoDias = dias <= DIAS_AVISO_EXPIRACION ? `⚠️ <b>${dias} dia(s) — Renueva pronto</b>` : `✅ ${dias} dia(s)`;
    text += `🌐 IP:     <code>${ip}</code>\n🔌 Port:   <code>${port}</code>\n📆 Expira: ${formatFecha(cp.fechaExpira)}\n⏳ Tiempo: ${estadoDias}\n━━━━━━━━━━━━━━\n`;
  }
  await sendMessage(chatId, text, { reply_markup: mainMenu() });
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId,
    `ℹ️ <b>¿Como funciona?</b>\n\n` +
    `<b>🛒 Comprar:</b>\n1. Elige cuantas IPs necesitas\n2. Elige como vas a pagar\n3. Paga y manda foto del comprobante\n4. En menos de 30 min recibes tus IPs ✅\n\n` +
    `<b>🔄 Renovar:</b>\n1. Envia la IP:Puerto de tu proxy\n2. Paga y manda el comprobante\n3. Tu proxy se renueva por ${DIAS_RENOVACION} dias ✅\n\n` +
    `<b>📋 Mis IPs:</b>\nVer todas tus IPs activas y cuando expiran.\n\n📩 Soporte: @Soportetecnico2323`,
    { reply_markup: mainMenu() }
  );
}

// ─── ADMIN ─────────────────────────────────────────────
async function handleAdminConfirm(orderId: string, adminChatId: number) {
  const order = await getOrder(orderId);
  if (!order) { await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`); return; }
  if (order.status === "completed") { await sendMessage(adminChatId, `⚠️ Ya fue entregado.`); return; }
  if (order.tipo === "renovacion") { await confirmRenovacion(order, adminChatId); return; }

  const pool = await getPool();
  if (pool.length < order.qty) {
    await sendMessage(adminChatId,
      `❌ No hay suficientes IPs en la lista.\nNecesitas: <b>${order.qty}</b> — Disponibles: <b>${pool.length}</b>\n\n` +
      `Agrega mas IPs enviandomelas, o entrega manual:\n<code>/entregar ${orderId} IP:port:user:pass</code>`
    );
    return;
  }

  const tomados = pool.slice(0, order.qty);
  await removeFromPoolMany(tomados.map((p) => p.hostPort));

  // Obtener datos completos de Proxy6 para cada IP
  const proxies: string[] = [];
  for (const entry of tomados) {
    // Si ya tiene user:pass completo, usarlo
    if (entry.full.split(":").length >= 4) {
      proxies.push(entry.full);
    } else {
      // Buscar en Proxy6
      const data = await fetchProxyData(entry.hostPort);
      proxies.push(data || entry.full);
    }
  }

  await deliverProxies(order, proxies);
  await sendMessage(adminChatId, `✅ Pedido <b>${orderId}</b> entregado.\n${proxies.length} IP(s) enviadas y quitadas de la lista.`);
}

async function handleAdminReject(orderId: string, adminChatId: number) {
  const order = await getOrder(orderId);
  if (!order) { await sendMessage(adminChatId, `❌ Pedido no encontrado.`); return; }
  await updateOrderStatus(orderId, "cancelled");
  await sendMessage(order.chatId, `❌ <b>Pedido ${orderId} rechazado.</b>\n\nEl pago no se pudo verificar.\nContacta: @Soportetecnico2323`, { reply_markup: mainMenu() });
  await sendMessage(adminChatId, `✅ Pedido rechazado y cliente notificado.`);
}

async function handleManualDeliver(text: string, adminChatId: number) {
  const parts = text.split(" ");
  if (parts.length < 3) { await sendMessage(adminChatId, `❌ Uso: <code>/entregar ORD-XXX IP:port:user:pass</code>`); return; }
  const orderId = parts[1];
  const proxies = parts.slice(2);
  const order = await getOrder(orderId);
  if (!order) { await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`); return; }
  await deliverProxies(order, proxies);
  await sendMessage(adminChatId, `✅ IPs entregadas y factura enviada al cliente.`);
}

async function handleManualRenovado(text: string, adminChatId: number) {
  const parts = text.split(" ");
  if (parts.length < 2) { await sendMessage(adminChatId, `❌ Uso: <code>/renovado ORD-XXX</code>`); return; }
  const orderId = parts[1];
  const order = await getOrder(orderId);
  if (!order || order.tipo !== "renovacion") { await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`); return; }

  const nuevaExpira = Date.now() + DIAS_RENOVACION * 24 * 60 * 60 * 1000;
  const [ip, port] = (order.proxyRenovar || ":").split(":");

  const clientIPs = await getClientProxies(order.chatId);
  const cp = clientIPs.find((p) => p.full.startsWith(order.proxyRenovar!));
  if (cp?.id) await saveClientProxy({ ...cp, fechaExpira: nuevaExpira, avisado: false });

  const metodoKey = Object.entries(METODOS_PAGO).find(([, v]) => v.nombre === order.metodoPago)?.[0] || "banreservas";
  await saveStat({ orderId: order.orderId, chatId: order.chatId, firstName: order.firstName, username: order.username, qty: 1, metodoPago: order.metodoPago, monto: getPrecioMonto(metodoKey, 1), tipo: "renovacion", fecha: Date.now() });

  await sendMessage(order.chatId,
    `━━━━━━━━━━━━━━━━━━━━\n🔄  <b>RENOVACION  •  AngelVercel</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n👤 Cliente:  ${order.firstName}\n━━━━━━━━━━━━━━━━━━━━\n` +
    `  🌐 IP:      <code>${ip}</code>\n  🔌 Port:    <code>${port}</code>\n\n` +
    `📆 Nueva expiracion: <b>${formatFecha(nuevaExpira)}</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Renovacion Confirmada</b>\n💡 <i>Tus credenciales siguen siendo las mismas.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: mainMenu() }
  );
  await updateOrderStatus(orderId, "completed");
  setSession(order.chatId, { step: "idle" });
  await sendMessage(adminChatId, `✅ Cliente notificado.`);
}

async function handleStats(adminChatId: number) {
  const ahora = new Date();
  const stats = await getStatsMes(ahora.getMonth(), ahora.getFullYear());
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const ventas = stats.filter((s) => s.tipo === "compra");
  const renovaciones = stats.filter((s) => s.tipo === "renovacion");
  const totalIPs = ventas.reduce((acc, s) => acc + s.qty, 0);

  const ingresosPorMetodo: Record<string, number> = {};
  for (const s of stats) {
    const num = parseFloat(s.monto.replace(/[^0-9.]/g, "")) || 0;
    ingresosPorMetodo[s.metodoPago] = (ingresosPorMetodo[s.metodoPago] || 0) + num;
  }

  let txt = `📊 <b>Estadisticas de ${meses[ahora.getMonth()]} ${ahora.getFullYear()}</b>\n━━━━━━━━━━━━━━\n\n` +
    `🛒 <b>Ventas:</b> ${ventas.length} pedido(s) — ${totalIPs} IP(s)\n` +
    `🔄 <b>Renovaciones:</b> ${renovaciones.length}\n\n`;

  if (Object.keys(ingresosPorMetodo).length > 0) {
    txt += `💵 <b>Ingresos estimados:</b>\n`;
    for (const [m, total] of Object.entries(ingresosPorMetodo)) {
      txt += `  • ${m}: <b>${total.toLocaleString()}</b>\n`;
    }
    txt += `\n`;
  }

  if (ventas.length > 0) {
    txt += `📋 <b>Ultimas ventas:</b>\n`;
    for (const s of ventas.slice(-5).reverse()) {
      txt += `  • ${s.username ? `@${s.username}` : s.firstName} — ${s.qty} IP(s) — ${s.metodoPago}\n`;
    }
  }
  if (renovaciones.length > 0) {
    txt += `\n🔄 <b>Ultimas renovaciones:</b>\n`;
    for (const s of renovaciones.slice(-5).reverse()) {
      txt += `  • ${s.username ? `@${s.username}` : s.firstName} — ${s.metodoPago}\n`;
    }
  }
  if (stats.length === 0) txt += `No hay actividad registrada este mes aun.`;

  await sendMessage(adminChatId, txt);
}

// ─── ROUTE HANDLER ─────────────────────────────────────
// Solo revisar expiraciones cada 30 minutos
let lastCheck = 0;
const CHECK_INTERVAL = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    if (Date.now() - lastCheck > CHECK_INTERVAL) {
      lastCheck = Date.now();
      checkExpiraciones().catch(console.error); // sin await — no bloquea
    }

    const body = await req.json();
    const message = body.message;
    const callbackQuery = body.callback_query;

    if (message) {
      const chatId: number = message.chat.id;
      const text: string = message.text || "";
      const firstName: string = message.from?.first_name || "Usuario";
      const username: string | undefined = message.from?.username;
      const isAdmin = chatId === ADMIN_ID;
      const session = getSession(chatId);

      // Comprobante foto
      if (message.photo && session.step === "waiting_receipt" && session.orderId) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        const order = await getOrder(session.orderId);
        if (order) {
          await updateOrderStatus(session.orderId, "pending_confirm");
          await sendMessage(chatId, `📸 <b>Comprobante recibido.</b>\n\nPedido <code>${session.orderId}</code> en revision.\n⏳ En menos de <b>30 minutos</b> te confirmamos.`);
          await notifyAdmin(order);
          await notifyAdminReceipt(order, fileId);
        }
        return NextResponse.json({ ok: true });
      }

      // Comprobante texto
      if (session.step === "waiting_receipt" && session.orderId && text && !text.startsWith("/") && text !== "❌ Cancelar") {
        const order = await getOrder(session.orderId);
        if (order) {
          await updateOrderStatus(session.orderId, "pending_confirm");
          await sendMessage(chatId, `📝 <b>Referencia recibida.</b>\n\nPedido <code>${session.orderId}</code> en revision.\n⏳ En menos de <b>30 minutos</b> te confirmamos.`);
          await notifyAdmin(order);
          await notifyAdminReceipt(order, undefined, text);
        }
        return NextResponse.json({ ok: true });
      }

      // Input host:port renovacion
      if (session.step === "renew_input" && text && !text.startsWith("/") && text !== "❌ Cancelar") {
        await handleRenewProxy(chatId, firstName, username, text);
        return NextResponse.json({ ok: true });
      }

      if (text === "❌ Cancelar") {
        setSession(chatId, { step: "idle" });
        await sendMessage(chatId, "❌ Operacion cancelada.", { reply_markup: mainMenu() });
        return NextResponse.json({ ok: true });
      }

      // Admin: IP nueva (formato x.x.x.x:puerto)
      if (isAdmin && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(text.trim())) {
        await agregarProxy(text.trim(), chatId);
        return NextResponse.json({ ok: true });
      }

      if (isAdmin && text === "/stats")      { await handleStats(chatId); return NextResponse.json({ ok: true }); }
      if (isAdmin && text === "/lista")      {
        const pool = await getPool();
        if (pool.length === 0) { await sendMessage(chatId, `📋 La lista esta vacia.`); }
        else { await sendMessage(chatId, `📋 <b>IPs disponibles (${pool.length}):</b>\n\n${pool.map((p, i) => `${i + 1}. <code>${p.hostPort}</code>`).join("\n")}`); }
        return NextResponse.json({ ok: true });
      }
      if (isAdmin && text.startsWith("/limpiar"))   { await handleLimpiarIP(text, chatId); return NextResponse.json({ ok: true }); }
      if (isAdmin && text.startsWith("/entregar")) { await handleManualDeliver(text, chatId); return NextResponse.json({ ok: true }); }
      if (isAdmin && text.startsWith("/renovado"))  { await handleManualRenovado(text, chatId);  return NextResponse.json({ ok: true }); }

      if      (text === "/start")              await handleStart(chatId, firstName);
      else if (text === "🛒 Comprar IPs")      await handleBuyStart(chatId);
      else if (text === "🔄 Renovar IP")       await handleRenewStart(chatId);
      else if (text === "📋 Mis IPs")          await handleMisIPs(chatId);
      else if (text === "ℹ️ Ayuda")            await handleHelp(chatId);
      else if (text === "🧾 Comprar Cuentas")  await sendMessage(chatId, `🧾 <b>Comprar Cuentas</b>\n\n⏳ <i>Esta opcion estara disponible proximamente.</i>\n\nEstate atento a las novedades 👀`, { reply_markup: mainMenu() });
      else if (!isAdmin && session.step === "idle" && text && !text.startsWith("/")) {
        await sendMessage(chatId, `Usa los botones del menu 👇`, { reply_markup: mainMenu() });
      }
    }

    if (callbackQuery) {
      const chatId: number = callbackQuery.message.chat.id;
      const data: string   = callbackQuery.data;
      const firstName: string        = callbackQuery.from?.first_name || "Usuario";
      const username: string | undefined = callbackQuery.from?.username;

      await tPost("answerCallbackQuery", { callback_query_id: callbackQuery.id });

      if (data === "cancel") {
        setSession(chatId, { step: "idle" });
        await sendMessage(chatId, "❌ Operacion cancelada.", { reply_markup: mainMenu() });
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith("renovar_rapido_")) {
        const hostPort = data.replace("renovar_rapido_", "");
        setSession(chatId, { step: "renew_payment", proxyRenovar: hostPort });
        await sendMessage(chatId,
          `✅ IP: <code>${hostPort}</code>\n\n📅 Renovacion por <b>${DIAS_RENOVACION} dias</b>\n\n` +
          `💵 <b>Costo:</b>\n• Banreservas: <b>RD$ ${PRECIO_DOP.toLocaleString()}</b>\n• Remitly: <b>$${PRECIO_USD} USD</b>\n• Zelle: <b>$${PRECIO_ZELLE} USD</b>\n\n💳 <b>¿Con que metodo deseas pagar?</b>`,
          { reply_markup: inlineBtn([[{ text: "🏦 Banreservas", data: "renew_pay_banreservas" }], [{ text: "💸 Remitly", data: "renew_pay_remitly" }], [{ text: "💳 Zelle", data: "renew_pay_zelle" }], [{ text: "❌ Cancelar", data: "cancel" }]]) }
        );
        return NextResponse.json({ ok: true });
      }

      if      (data.startsWith("qty_"))        await handleQtySelected(chatId, parseInt(data.replace("qty_", "")));
      else if (data.startsWith("pay_"))        await handlePaymentSelected(chatId, firstName, username, data.replace("pay_", ""), "compra");
      else if (data.startsWith("renew_pay_")) await handlePaymentSelected(chatId, firstName, username, data.replace("renew_pay_", ""), "renovacion");
      else if (data.startsWith("confirm_") && chatId === ADMIN_ID) await handleAdminConfirm(data.replace("confirm_", ""), chatId);
      else if (data.startsWith("reject_")  && chatId === ADMIN_ID) await handleAdminReject(data.replace("reject_", ""), chatId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ProxyShop error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action === "setWebhook") {
    const webhookUrl = searchParams.get("url");
    if (!webhookUrl) return NextResponse.json({ error: "Falta ?url=..." });
    const res = await fetch(`${API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    return NextResponse.json(await res.json());
  }
  if (action === "getWebhook") {
    const res = await fetch(`${API}/getWebhookInfo`);
    return NextResponse.json(await res.json());
  }
  return NextResponse.json({ bot: "ProxyShop Bot", status: "running" });
}
