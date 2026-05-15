import { NextRequest, NextResponse } from "next/server";

const TOKEN = "8798842692:AAHzSInpAEcNxsDkf8_FkJTPGNPjD3qdu-Q";
const API = `https://api.telegram.org/bot${TOKEN}`;
const PROXY6_KEY = "c5008743d3-dfb41a5904-d007bb3002";
const PROXY6_API = `https://px6.link/api/${PROXY6_KEY}`;

const ADMIN_ID = 1466412206;
const COMENTARIO_VENTA = "disponible";
const COMENTARIO_VENDIDO = "vendido";
const DIAS_RENOVACION = 30;

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

type OrderStatus = "pending_payment" | "pending_confirm" | "completed" | "cancelled";
type OrderType = "compra" | "renovacion";

type Order = {
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  status: OrderStatus;
  createdAt: number;
  tipo: OrderType;
  proxies?: string[];
  proxyRenovar?: string;
};

type Session = {
  step: "idle" | "qty" | "payment" | "waiting_receipt" | "renew_input" | "renew_payment";
  qty?: number;
  metodoPago?: string;
  orderId?: string;
  proxyRenovar?: string;
};

const sessions: Record<number, Session> = {};
const orders: Record<string, Order> = {};

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

function formatFecha(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function getPrecioMonto(metodo: string, qty: number): string {
  if (metodo === "banreservas") return `RD$ ${(qty * PRECIO_DOP).toLocaleString()}`;
  if (metodo === "zelle") return `$${qty * PRECIO_ZELLE} USD`;
  return `$${qty * PRECIO_USD} USD`;
}

function mainMenu() {
  return {
    keyboard: [
      [{ text: "🛒 Comprar Proxies" }, { text: "🔄 Renovar Proxy" }],
      [{ text: "📦 Mis Pedidos" }, { text: "ℹ️ Ayuda" }],
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

// ─── FACTURA EN TEXTO ──────────────────────────────────
function generarFacturaTexto(order: Order, proxies: string[]): string {
  const ahora = new Date();
  const expira = new Date();
  expira.setDate(expira.getDate() + 30);

  const metodoKey = Object.entries(METODOS_PAGO).find(
    ([, v]) => v.nombre === order.metodoPago
  )?.[0] || "banreservas";
  const monto = getPrecioMonto(metodoKey, order.qty);

  // Formatear cada proxy con campos separados
  const proxiesFormateados = proxies.map((proxy, i) => {
    const parts = proxy.split(":");
    const ip       = parts[0] || "";
    const port     = parts[1] || "";
    const usuario  = parts[2] || "";
    const clave    = parts[3] || "";

    return (
      `<b>Proxy ${i + 1}:</b>\n` +
      `  🌐 IP:       <code>${ip}</code>\n` +
      `  🔌 Port:     <code>${port}</code>\n` +
      `  👤 Usuario:  <code>${usuario}</code>\n` +
      `  🔑 Clave:    <code>${clave}</code>`
    );
  }).join("\n\n");

  return (
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾  <b>FACTURA  •  AngelVercel</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n` +
    `📅 Fecha:    ${formatFecha(ahora)}\n` +
    `👤 Cliente:  ${order.firstName}\n` +
    `💳 Método:   ${order.metodoPago}\n` +
    `💵 Monto:    <b>${monto}</b>\n` +
    `📆 Expira:   ${formatFecha(expira)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 <b>IPs ENTREGADAS</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    proxiesFormateados + `\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 Protocolo: HTTPS / SOCKS5 ✓\n` +
    `✅ <b>Pago Confirmado</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Guarda este mensaje como comprobante.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n` +
    `━━━━━━━━━━━━━━━━━━━━`
  );
}

// ─── PROXY6 ────────────────────────────────────────────
async function getProxiesDisponibles(): Promise<any[]> {
  try {
    const data = await proxy6Get("getproxy?state=active&limit=1000");
    if (data.status !== "yes") return [];
    const allProxies = Object.values(data.list) as any[];
    return allProxies.filter((p: any) => {
      const comentario = (p.descr || "").toLowerCase().trim();
      const daysLeft = Math.floor(
        (new Date(p.date_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return comentario === COMENTARIO_VENTA.toLowerCase() && daysLeft >= 1;
    });
  } catch {
    return [];
  }
}

async function getAvailableProxies(qty: number): Promise<{ formatted: string; id: string }[]> {
  const disponibles = await getProxiesDisponibles();
  return disponibles.slice(0, qty).map((p: any) => ({
    formatted: `${p.host}:${p.port}:${p.user}:${p.pass}`,
    id: String(p.id),
  }));
}

async function marcarComoVendido(proxyIds: string[]): Promise<void> {
  try {
    if (proxyIds.length === 0) return;
    await proxy6Get(`setdescr?new=${encodeURIComponent(COMENTARIO_VENDIDO)}&ids=${proxyIds.join(",")}`);
  } catch {
    console.error("Error marcando proxies como vendido");
  }
}

async function findProxyByHostPort(hostPort: string): Promise<any | null> {
  try {
    const [host, port] = hostPort.split(":");
    const data = await proxy6Get("getproxy?state=active");
    if (data.status !== "yes") return null;
    const allProxies = Object.values(data.list) as any[];
    return allProxies.find(
      (p: any) => p.host === host.trim() && String(p.port) === String(port?.trim())
    ) || null;
  } catch {
    return null;
  }
}

// ─── NOTIFICAR ADMIN ───────────────────────────────────
async function notifyAdmin(order: Order) {
  const userLink = order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;
  const esRenovacion = order.tipo === "renovacion";
  const titulo = esRenovacion ? "🔄 RENOVACION" : "🛒 NUEVA COMPRA";
  const detalle = esRenovacion
    ? `🔌 Proxy: <code>${order.proxyRenovar}</code>\n📅 Dias: <b>${DIAS_RENOVACION}</b>`
    : `📦 Cantidad: <b>${order.qty} IP(s)</b>`;

  await sendMessage(
    ADMIN_ID,
    `🔔 <b>${titulo} — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
      `👤 Cliente: ${userLink}\n${detalle}\n` +
      `💳 Metodo: <b>${order.metodoPago}</b>\n` +
      `🕐 ${new Date(order.createdAt).toLocaleString("es-DO")}\n\n` +
      `⏳ <i>Esperando comprobante...</i>`,
    {
      reply_markup: inlineBtn([
        [
          { text: "✅ Confirmar", data: `confirm_${order.orderId}` },
          { text: "❌ Rechazar", data: `reject_${order.orderId}` },
        ],
      ]),
    }
  );
}

async function notifyAdminReceipt(order: Order, photoFileId?: string, receiptText?: string) {
  const userLink = order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;
  const esRenovacion = order.tipo === "renovacion";
  const detalle = esRenovacion
    ? `🔌 Proxy: <code>${order.proxyRenovar}</code>`
    : `📦 Cantidad: <b>${order.qty} IP(s)</b>`;

  const caption =
    `📸 <b>COMPROBANTE — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 ${userLink}\n${detalle}\n💳 <b>${order.metodoPago}</b>\n\nConfirma o rechaza:`;

  const keyboard = inlineBtn([
    [
      { text: "✅ Confirmar", data: `confirm_${order.orderId}` },
      { text: "❌ Rechazar", data: `reject_${order.orderId}` },
    ],
  ]);

  if (photoFileId) {
    await tPost("sendPhoto", {
      chat_id: ADMIN_ID, photo: photoFileId,
      caption, parse_mode: "HTML", reply_markup: keyboard,
    });
  } else {
    await sendMessage(
      ADMIN_ID,
      caption + (receiptText ? `\n\n📝 Referencia: <i>${receiptText}</i>` : ""),
      { reply_markup: keyboard }
    );
  }
}

// ─── ENTREGAR PROXIES + FACTURA ────────────────────────
async function deliverProxies(
  order: Order,
  proxies: { formatted: string; id: string }[] | string[]
) {
  const formatted: string[] = proxies.map((p) => (typeof p === "string" ? p : p.formatted));
  const ids: string[] = (proxies as any[])
    .filter((p) => typeof p !== "string")
    .map((p) => p.id);

  // Enviar factura con todo incluido
  const factura = generarFacturaTexto(order, formatted);
  await sendMessage(order.chatId, factura, { reply_markup: mainMenu() });

  orders[order.orderId].proxies = formatted;
  orders[order.orderId].status = "completed";

  // Marcar como vendido en Proxy6
  if (ids.length > 0) await marcarComoVendido(ids);
}

// ─── RENOVACION ────────────────────────────────────────
async function confirmRenovacion(order: Order, adminChatId: number) {
  if (!order.proxyRenovar) {
    await sendMessage(adminChatId, "❌ No hay proxy definido para renovar.");
    return;
  }
  await sendMessage(adminChatId, `⏳ Buscando proxy en Proxy6...`);
  const proxy = await findProxyByHostPort(order.proxyRenovar);

  if (!proxy) {
    await sendMessage(
      adminChatId,
      `❌ Proxy no encontrado: <code>${order.proxyRenovar}</code>\n\n` +
        `Usa: <code>/renovado ${order.orderId}</code>`
    );
    return;
  }

  const renewData = await proxy6Get(`prolong?period=${DIAS_RENOVACION}&ids=${proxy.id}`);
  if (renewData.status !== "yes") {
    await sendMessage(
      adminChatId,
      `❌ Error al renovar: ${renewData.error || "desconocido"}\n\nManual: <code>/renovado ${order.orderId}</code>`
    );
    return;
  }

  const nuevaFecha = new Date();
  nuevaFecha.setDate(nuevaFecha.getDate() + DIAS_RENOVACION);

  const [host, port] = order.proxyRenovar.split(":");

  await sendMessage(
    order.chatId,
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄  <b>RENOVACION  •  AngelVercel</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n` +
    `📅 Fecha:    ${formatFecha(new Date())}\n` +
    `👤 Cliente:  ${order.firstName}\n` +
    `💳 Método:   ${order.metodoPago}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 <b>PROXY RENOVADO</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `  🌐 IP:      <code>${host}</code>\n` +
    `  🔌 Port:    <code>${port}</code>\n\n` +
    `📆 Nueva exp: <b>${formatFecha(nuevaFecha)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Renovacion Confirmada</b>\n` +
    `💡 <i>Tus credenciales siguen siendo las mismas.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n` +
    `━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: mainMenu() }
  );

  orders[order.orderId].status = "completed";
  await sendMessage(adminChatId, `✅ Renovacion <b>${order.orderId}</b> completada y cliente notificado.`);
}

// ─── FLUJO COMPRA ──────────────────────────────────────
async function handleStart(chatId: number, firstName: string) {
  sessions[chatId] = { step: "idle" };
  await sendMessage(
    chatId,
    `🌐 <b>¡Bienvenido, ${firstName}!</b>\n\n` +
      `Compra y renueva proxies privados de forma rapida y segura.\n\n` +
      `📌 <b>Precios:</b>\n` +
      `• Banreservas: <b>RD$ ${PRECIO_DOP}</b> por proxy\n` +
      `• Remitly: <b>$${PRECIO_USD} USD</b> por proxy\n` +
      `• Zelle: <b>$${PRECIO_ZELLE} USD</b> por proxy\n\n` +
      `Usa los botones para comenzar 👇`,
    { reply_markup: mainMenu() }
  );
}

async function handleBuyStart(chatId: number) {
  sessions[chatId] = { step: "qty" };
  const disponibles = await getProxiesDisponibles();
  const stock = disponibles.length;

  if (stock === 0) {
    await sendMessage(
      chatId,
      `😔 <b>Sin IPs disponibles ahora mismo.</b>\n\nEscribenos: @Soportetecnico2323`,
      { reply_markup: mainMenu() }
    );
    return;
  }

  const opciones = [1, 3, 5, 10, 20, 50].filter((n) => n <= stock);
  const rows: { text: string; data: string }[][] = [];
  for (let i = 0; i < opciones.length; i += 3) {
    rows.push(
      opciones.slice(i, i + 3).map((n) => ({
        text: n === 1 ? "1 proxy" : `${n} proxies`,
        data: `qty_${n}`,
      }))
    );
  }

  await sendMessage(
    chatId,
    `🛒 <b>IPs disponibles: ${stock}</b>\n\n¿Cuantas necesitas?`,
    { reply_markup: inlineBtn(rows) }
  );
}

async function handleQtySelected(chatId: number, qty: number) {
  sessions[chatId] = { step: "payment", qty };
  await sendMessage(
    chatId,
    `✅ <b>${qty} IP(s)</b>\n\n` +
      `💵 <b>Total:</b>\n` +
      `• Banreservas: <b>RD$ ${(qty * PRECIO_DOP).toLocaleString()}</b>\n` +
      `• Remitly: <b>$${qty * PRECIO_USD} USD</b>\n` +
      `• Zelle: <b>$${qty * PRECIO_ZELLE} USD</b>\n\n` +
      `💳 <b>¿Con que metodo deseas pagar?</b>`,
    {
      reply_markup: inlineBtn([
        [{ text: "🏦 Banreservas", data: "pay_banreservas" }],
        [{ text: "💸 Remitly", data: "pay_remitly" }],
        [{ text: "💳 Zelle", data: "pay_zelle" }],
        [{ text: "❌ Cancelar", data: "cancel" }],
      ]),
    }
  );
}

async function handlePaymentSelected(
  chatId: number,
  firstName: string,
  username: string | undefined,
  metodo: string,
  tipo: OrderType = "compra"
) {
  const session = sessions[chatId];
  const orderId = generateOrderId();
  const qty = tipo === "renovacion" ? 1 : session?.qty || 1;
  const monto = getPrecioMonto(metodo, qty);

  const order: Order = {
    orderId, chatId, firstName, username, qty,
    metodoPago: METODOS_PAGO[metodo as keyof typeof METODOS_PAGO].nombre,
    status: "pending_payment",
    createdAt: Date.now(),
    tipo,
    proxyRenovar: tipo === "renovacion" ? session?.proxyRenovar : undefined,
  };
  orders[orderId] = order;
  sessions[chatId] = { ...session, step: "waiting_receipt", metodoPago: metodo, orderId };

  const m = METODOS_PAGO[metodo as keyof typeof METODOS_PAGO];
  const descripcion = tipo === "renovacion"
    ? `🔄 Renovacion\n🔌 Proxy: <code>${session?.proxyRenovar}</code>\n📅 Dias: <b>${DIAS_RENOVACION}</b>`
    : `📦 <b>${qty} IP(s)</b>`;

  await sendMessage(
    chatId,
    `${m.emoji} <b>${m.nombre}</b>\n━━━━━━━━━━━━━━\n\n` +
      m.detalle + `\n\n${descripcion}\n` +
      `📦 Pedido: <code>${orderId}</code>\n` +
      `💵 <b>Total: ${monto}</b>\n\n` +
      `📸 <b>Envia una foto del comprobante</b> (foto o captura).\n` +
      `⏳ Te respondemos en menos de 30 minutos.`
  );

  await notifyAdmin(order);
}

// ─── FLUJO RENOVACION ──────────────────────────────────
async function handleRenewStart(chatId: number) {
  sessions[chatId] = { step: "renew_input" };
  await sendMessage(
    chatId,
    `🔄 <b>Renovar Proxy</b>\n━━━━━━━━━━━━━━\n\n` +
      `Enviame el <b>host:puerto</b> de tu proxy.\n\n` +
      `📋 Ejemplo: <code>196.19.157.34:8000</code>`,
    {
      reply_markup: {
        keyboard: [[{ text: "❌ Cancelar" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function handleRenewProxy(
  chatId: number,
  firstName: string,
  username: string | undefined,
  hostPort: string
) {
  const partes = hostPort.trim().split(":");
  if (partes.length !== 2 || !partes[0] || !partes[1] || isNaN(Number(partes[1]))) {
    await sendMessage(
      chatId,
      `❌ Formato incorrecto.\nDebe ser: <code>host:puerto</code>\nEjemplo: <code>196.19.157.34:8000</code>`
    );
    return;
  }

  sessions[chatId] = { step: "renew_payment", proxyRenovar: hostPort.trim() };
  await sendMessage(
    chatId,
    `✅ Proxy: <code>${hostPort.trim()}</code>\n\n` +
      `📅 Renovacion por <b>${DIAS_RENOVACION} dias</b>\n\n` +
      `💵 <b>Costo:</b>\n` +
      `• Banreservas: <b>RD$ ${PRECIO_DOP.toLocaleString()}</b>\n` +
      `• Remitly: <b>$${PRECIO_USD} USD</b>\n` +
      `• Zelle: <b>$${PRECIO_ZELLE} USD</b>\n\n` +
      `💳 <b>¿Con que metodo deseas pagar?</b>`,
    {
      reply_markup: inlineBtn([
        [{ text: "🏦 Banreservas", data: "renew_pay_banreservas" }],
        [{ text: "💸 Remitly", data: "renew_pay_remitly" }],
        [{ text: "💳 Zelle", data: "renew_pay_zelle" }],
        [{ text: "❌ Cancelar", data: "cancel" }],
      ]),
    }
  );
}

// ─── MIS PEDIDOS / AYUDA ───────────────────────────────
async function handleMyOrders(chatId: number) {
  const myOrders = Object.values(orders).filter((o) => o.chatId === chatId);
  if (myOrders.length === 0) {
    await sendMessage(chatId, "📦 No tienes pedidos aun.", { reply_markup: mainMenu() });
    return;
  }
  const statusLabel: Record<OrderStatus, string> = {
    pending_payment: "⏳ Pendiente",
    pending_confirm: "🔍 En revision",
    completed: "✅ Completado",
    cancelled: "❌ Cancelado",
  };
  let text = `📦 <b>Tus pedidos:</b>\n━━━━━━━━━━━━━━\n\n`;
  for (const o of myOrders.slice(-5)) {
    const tipo = o.tipo === "renovacion" ? "🔄" : "🛒";
    text += `${tipo} <code>${o.orderId}</code> — ${statusLabel[o.status]}\n\n`;
  }
  await sendMessage(chatId, text, { reply_markup: mainMenu() });
}

async function handleHelp(chatId: number) {
  await sendMessage(
    chatId,
    `ℹ️ <b>¿Como funciona?</b>\n\n` +
      `<b>🛒 Comprar:</b>\n` +
      `1. Elige cantidad y metodo de pago\n` +
      `2. Realiza el pago y envia el comprobante\n` +
      `3. En max. 30 min recibes tu factura con los proxies ✅\n\n` +
      `<b>🔄 Renovar:</b>\n` +
      `1. Envia el host:puerto de tu proxy\n` +
      `2. Paga y envia comprobante\n` +
      `3. Tu proxy se renueva por ${DIAS_RENOVACION} dias ✅\n\n` +
      `📩 Soporte: @Soportetecnico2323`,
    { reply_markup: mainMenu() }
  );
}

// ─── COMANDOS ADMIN ────────────────────────────────────
async function handleAdminConfirm(orderId: string, adminChatId: number) {
  const order = orders[orderId];
  if (!order) {
    await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`);
    return;
  }
  if (order.status === "completed") {
    await sendMessage(adminChatId, `⚠️ Este pedido ya fue procesado.`);
    return;
  }
  if (order.tipo === "renovacion") {
    await confirmRenovacion(order, adminChatId);
    return;
  }

  await sendMessage(adminChatId, `⏳ Obteniendo proxies...`);
  const proxies = await getAvailableProxies(order.qty);

  if (proxies.length < order.qty) {
    await sendMessage(
      adminChatId,
      `❌ No hay suficientes IPs disponibles.\nNecesitas: <b>${order.qty}</b> — Disponibles: <b>${proxies.length}</b>\n\n` +
        `Entrega manual:\n<code>/entregar ${orderId} host:port:user:pass</code>`
    );
    return;
  }

  await deliverProxies(order, proxies);
  await sendMessage(
    adminChatId,
    `✅ Pedido <b>${orderId}</b> entregado.\n` +
      `${proxies.length} IP(s) enviados y marcados como "vendido" en Proxy6.`
  );
}

async function handleAdminReject(orderId: string, adminChatId: number) {
  const order = orders[orderId];
  if (!order) {
    await sendMessage(adminChatId, `❌ Pedido no encontrado.`);
    return;
  }
  orders[orderId].status = "cancelled";
  await sendMessage(
    order.chatId,
    `❌ <b>Pedido ${orderId} rechazado.</b>\n\nEl pago no se pudo verificar.\nContacta: @Soportetecnico2323`,
    { reply_markup: mainMenu() }
  );
  await sendMessage(adminChatId, `✅ Pedido rechazado y cliente notificado.`);
}

async function handleManualDeliver(text: string, adminChatId: number) {
  const parts = text.split(" ");
  if (parts.length < 3) {
    await sendMessage(adminChatId, `❌ Uso: <code>/entregar ORD-XXX host:port:user:pass</code>`);
    return;
  }
  const orderId = parts[1];
  const proxies = parts.slice(2);
  const order = orders[orderId];
  if (!order) {
    await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`);
    return;
  }
  await deliverProxies(order, proxies);
  await sendMessage(adminChatId, `✅ Proxies entregados y factura enviada al cliente.`);
}

async function handleManualRenovado(text: string, adminChatId: number) {
  const parts = text.split(" ");
  if (parts.length < 2) {
    await sendMessage(adminChatId, `❌ Uso: <code>/renovado ORD-XXX</code>`);
    return;
  }
  const orderId = parts[1];
  const order = orders[orderId];
  if (!order || order.tipo !== "renovacion") {
    await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`);
    return;
  }
  const nuevaFecha = new Date();
  nuevaFecha.setDate(nuevaFecha.getDate() + DIAS_RENOVACION);
  const [host, port] = (order.proxyRenovar || ":").split(":");
  await sendMessage(
    order.chatId,
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄  <b>RENOVACION  •  AngelVercel</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Pedido:   <code>${order.orderId}</code>\n` +
    `👤 Cliente:  ${order.firstName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `  🌐 IP:      <code>${host}</code>\n` +
    `  🔌 Port:    <code>${port}</code>\n\n` +
    `📆 Nueva exp: <b>${formatFecha(nuevaFecha)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Renovacion Confirmada</b>\n` +
    `💡 <i>Tus credenciales siguen siendo las mismas.</i>\n` +
    `📩 Soporte: @Soportetecnico2323\n` +
    `━━━━━━━━━━━━━━━━━━━━`,
    { reply_markup: mainMenu() }
  );
  orders[orderId].status = "completed";
  await sendMessage(adminChatId, `✅ Cliente notificado.`);
}

// ─── ROUTE HANDLER ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;
    const callbackQuery = body.callback_query;

    if (message) {
      const chatId: number = message.chat.id;
      const text: string = message.text || "";
      const firstName: string = message.from?.first_name || "Usuario";
      const username: string | undefined = message.from?.username;
      const session = sessions[chatId] || { step: "idle" };
      const isAdmin = chatId === ADMIN_ID;

      // Comprobante foto
      if (message.photo && session.step === "waiting_receipt" && session.orderId) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        const order = orders[session.orderId];
        if (order) {
          order.status = "pending_confirm";
          await sendMessage(chatId,
            `📸 <b>¡Comprobante recibido!</b>\n\nPedido <code>${session.orderId}</code> en revision.\n⏳ Max. <b>30 minutos</b>.`
          );
          await notifyAdminReceipt(order, fileId);
        }
        return NextResponse.json({ ok: true });
      }

      // Comprobante texto
      if (session.step === "waiting_receipt" && session.orderId && text && !text.startsWith("/") && text !== "❌ Cancelar") {
        const order = orders[session.orderId];
        if (order) {
          order.status = "pending_confirm";
          await sendMessage(chatId,
            `📝 <b>Referencia recibida.</b>\n\nPedido <code>${session.orderId}</code> en revision.\n⏳ Max. <b>30 minutos</b>.`
          );
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
        sessions[chatId] = { step: "idle" };
        await sendMessage(chatId, "❌ Operacion cancelada.", { reply_markup: mainMenu() });
        return NextResponse.json({ ok: true });
      }

      if (isAdmin && text.startsWith("/entregar")) { await handleManualDeliver(text, chatId); return NextResponse.json({ ok: true }); }
      if (isAdmin && text.startsWith("/renovado"))  { await handleManualRenovado(text, chatId);  return NextResponse.json({ ok: true }); }

      if      (text === "/start")            await handleStart(chatId, firstName);
      else if (text === "🛒 Comprar Proxies") await handleBuyStart(chatId);
      else if (text === "🔄 Renovar Proxy")   await handleRenewStart(chatId);
      else if (text === "📦 Mis Pedidos")     await handleMyOrders(chatId);
      else if (text === "ℹ️ Ayuda")           await handleHelp(chatId);
    }

    if (callbackQuery) {
      const chatId: number = callbackQuery.message.chat.id;
      const data: string   = callbackQuery.data;
      const firstName: string        = callbackQuery.from?.first_name || "Usuario";
      const username: string | undefined = callbackQuery.from?.username;

      await tPost("answerCallbackQuery", { callback_query_id: callbackQuery.id });

      if (data === "cancel") {
        sessions[chatId] = { step: "idle" };
        await sendMessage(chatId, "❌ Operacion cancelada.", { reply_markup: mainMenu() });
        return NextResponse.json({ ok: true });
      }

      if      (data.startsWith("qty_"))      await handleQtySelected(chatId, parseInt(data.replace("qty_", "")));
      else if (data.startsWith("pay_"))      await handlePaymentSelected(chatId, firstName, username, data.replace("pay_", ""), "compra");
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
