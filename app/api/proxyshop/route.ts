import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────
const TOKEN = "8798842692:AAHzSInpAEcNxsDkf8_FkJTPGNPjD3qdu-Q";
const API = `https://api.telegram.org/bot${TOKEN}`;
const PROXY6_KEY = "c5008743d3-dfb41a5904-d007bb3002";
const PROXY6_API = `https://px6.link/api/${PROXY6_KEY}`;

// Tu Telegram ID — recibirás todas las notificaciones de pedidos aquí
const ADMIN_ID = 1466412206;

// Precio por proxy
const PRECIO_DOP = 1000;
const PRECIO_USD = 18;
const PRECIO_ZELLE = 28;

// Info de pago
const METODOS_PAGO = {
  banreservas: {
    emoji: "🏦",
    nombre: "Banreservas",
    detalle:
      `Cuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>\nMonto: <b>RD$ ${PRECIO_DOP} por proxy</b>`,
  },
  remitly: {
    emoji: "💸",
    nombre: "Remitly",
    detalle:
      `País: <b>República Dominicana, Santiago</b>\nCuenta: <code>9607314353</code>\nTitular: <b>JOSE ANGEL ALVAREZ NUÑEZ</b>\nMonto: <b>$${PRECIO_USD} USD por proxy</b>`,
  },
  zelle: {
    emoji: "💳",
    nombre: "Zelle",
    detalle:
      `Email: <code>estherlopeztineo2025@gmail.com</code>\nTitular: <b>Laury Lopez</b>\nMonto: <b>$${PRECIO_ZELLE} USD por proxy</b>`,
  },
};

// ─────────────────────────────────────────
//  TIPOS
// ─────────────────────────────────────────
type OrderStatus = "pending_payment" | "pending_confirm" | "completed" | "cancelled";

type Order = {
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  status: OrderStatus;
  createdAt: number;
  proxies?: string[];
};

type Session = {
  step: "idle" | "qty" | "payment" | "waiting_receipt";
  qty?: number;
  metodoPago?: string;
  orderId?: string;
};

const sessions: Record<number, Session> = {};
const orders: Record<string, Order> = {};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
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

function mainMenu() {
  return {
    keyboard: [
      [{ text: "🛒 Comprar Proxies" }],
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

// ─────────────────────────────────────────
//  NOTIFICAR AL ADMIN
// ─────────────────────────────────────────
async function notifyAdmin(order: Order) {
  const userLink = order.username
    ? `@${order.username}`
    : `<a href="tg://user?id=${order.chatId}">${order.firstName}</a>`;

  await sendMessage(
    ADMIN_ID,
    `🔔 <b>NUEVO PEDIDO — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
      `👤 Cliente: ${userLink}\n` +
      `📦 Cantidad: <b>${order.qty} proxy(s)</b>\n` +
      `💳 Método: <b>${order.metodoPago}</b>\n` +
      `🕐 Hora: ${new Date(order.createdAt).toLocaleString("es-DO")}\n\n` +
      `⏳ <i>Esperando comprobante del cliente...</i>`,
    {
      reply_markup: inlineBtn([
        [
          { text: "✅ Confirmar y entregar", data: `confirm_${order.orderId}` },
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

  const caption =
    `📸 <b>COMPROBANTE — ${order.orderId}</b>\n━━━━━━━━━━━━━━\n\n` +
    `👤 Cliente: ${userLink}\n` +
    `📦 Cantidad: <b>${order.qty} proxy(s)</b>\n` +
    `💳 Método: <b>${order.metodoPago}</b>\n\n` +
    `Revisa el pago y confirma o rechaza:`;

  const keyboard = inlineBtn([
    [
      { text: "✅ Confirmar y entregar", data: `confirm_${order.orderId}` },
      { text: "❌ Rechazar", data: `reject_${order.orderId}` },
    ],
  ]);

  if (photoFileId) {
    await tPost("sendPhoto", {
      chat_id: ADMIN_ID,
      photo: photoFileId,
      caption,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await sendMessage(
      ADMIN_ID,
      caption + (receiptText ? `\n\n📝 Referencia: <i>${receiptText}</i>` : ""),
      { reply_markup: keyboard }
    );
  }
}

// ─────────────────────────────────────────
//  OBTENER PROXIES DE TU CUENTA PROXY6
// ─────────────────────────────────────────
async function getAvailableProxies(qty: number): Promise<string[]> {
  try {
    const data = await proxy6Get("getproxy?state=active&nokey");
    if (data.status !== "yes") return [];
    const allProxies = Object.values(data.list) as any[];
    const valid = allProxies.filter((p: any) => {
      const daysLeft = Math.floor(
        (new Date(p.date_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft > 3;
    });
    return valid.slice(0, qty).map((p: any) => `${p.host}:${p.port}:${p.user}:${p.pass}`);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────
//  ENTREGAR PROXIES AL CLIENTE
// ─────────────────────────────────────────
async function deliverProxies(order: Order, proxies: string[]) {
  const proxyText = proxies.map((p) => `<code>${p}</code>`).join("\n");

  await sendMessage(
    order.chatId,
    `✅ <b>¡Pedido confirmado!</b>\n━━━━━━━━━━━━━━\n\n` +
      `📦 Pedido: <b>${order.orderId}</b>\n` +
      `🔢 Cantidad: <b>${proxies.length} proxy(s)</b>\n\n` +
      `🔐 <b>Tus proxies (host:puerto:usuario:contraseña):</b>\n\n` +
      proxyText +
      `\n\n📌 Protocolo: HTTPS / SOCKS5\n` +
      `💡 <i>Guarda estos datos en un lugar seguro.</i>`,
    { reply_markup: mainMenu() }
  );

  orders[order.orderId].proxies = proxies;
  orders[order.orderId].status = "completed";
}

// ─────────────────────────────────────────
//  FLUJO DEL BOT
// ─────────────────────────────────────────
async function handleStart(chatId: number, firstName: string) {
  sessions[chatId] = { step: "idle" };
  await sendMessage(
    chatId,
    `🌐 <b>¡Bienvenido, ${firstName}!</b>\n\n` +
      `Aquí puedes comprar proxies privados de forma rápida y segura.\n\n` +
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
  await sendMessage(chatId, `🛒 <b>¿Cuántos proxies deseas comprar?</b>`, {
    reply_markup: inlineBtn([
      [
        { text: "1 proxy", data: "qty_1" },
        { text: "3 proxies", data: "qty_3" },
        { text: "5 proxies", data: "qty_5" },
      ],
      [
        { text: "10 proxies", data: "qty_10" },
        { text: "20 proxies", data: "qty_20" },
        { text: "50 proxies", data: "qty_50" },
      ],
    ]),
  });
}

async function handleQtySelected(chatId: number, qty: number) {
  sessions[chatId] = { step: "payment", qty };
  const totalDOP = qty * PRECIO_DOP;
  const totalUSD = qty * PRECIO_USD;
  const totalZelle = qty * PRECIO_ZELLE;

  await sendMessage(
    chatId,
    `✅ <b>${qty} proxy(s) seleccionado(s)</b>\n\n` +
      `💵 <b>Total a pagar:</b>\n` +
      `• Banreservas: <b>RD$ ${totalDOP.toLocaleString()}</b>\n` +
      `• Remitly: <b>$${totalUSD} USD</b>\n` +
      `• Zelle: <b>$${totalZelle} USD</b>\n\n` +
      `💳 <b>¿Con qué método deseas pagar?</b>`,
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
  metodo: string
) {
  const session = sessions[chatId];
  if (!session?.qty) {
    await sendMessage(chatId, "❌ Sesión expirada. Usa /start para reiniciar.");
    return;
  }

  const orderId = generateOrderId();
  const order: Order = {
    orderId,
    chatId,
    firstName,
    username,
    qty: session.qty,
    metodoPago: METODOS_PAGO[metodo as keyof typeof METODOS_PAGO].nombre,
    status: "pending_payment",
    createdAt: Date.now(),
  };
  orders[orderId] = order;
  sessions[chatId] = { step: "waiting_receipt", qty: session.qty, metodoPago: metodo, orderId };

  const m = METODOS_PAGO[metodo as keyof typeof METODOS_PAGO];
  const qty = session.qty;
  const total =
    metodo === "banreservas"
      ? `RD$ ${(qty * PRECIO_DOP).toLocaleString()}`
      : metodo === "zelle"
      ? `$${qty * PRECIO_ZELLE} USD`
      : `$${qty * PRECIO_USD} USD`;

  await sendMessage(
    chatId,
    `${m.emoji} <b>Instrucciones — ${m.nombre}</b>\n━━━━━━━━━━━━━━\n\n` +
      m.detalle +
      `\n\n📦 Pedido: <code>${orderId}</code>\n` +
      `💵 <b>Total a enviar: ${total}</b>\n\n` +
      `📸 <b>Una vez pagado, envía aquí el comprobante</b> (foto o captura de pantalla).\n\n` +
      `⏳ Tu pedido será confirmado en máximo <b>30 minutos</b>.`
  );

  await notifyAdmin(order);
}

async function handleMyOrders(chatId: number) {
  const myOrders = Object.values(orders).filter((o) => o.chatId === chatId);
  if (myOrders.length === 0) {
    await sendMessage(chatId, "📦 No tienes pedidos aún.\n\nUsa <b>🛒 Comprar Proxies</b> para comenzar.", {
      reply_markup: mainMenu(),
    });
    return;
  }

  const statusLabel: Record<OrderStatus, string> = {
    pending_payment: "⏳ Pendiente de pago",
    pending_confirm: "🔍 En revisión",
    completed: "✅ Completado",
    cancelled: "❌ Cancelado",
  };

  let text = `📦 <b>Tus pedidos:</b>\n━━━━━━━━━━━━━━\n\n`;
  for (const o of myOrders.slice(-5)) {
    text += `🔖 <code>${o.orderId}</code> — ${statusLabel[o.status]}\n`;
    text += `   ${o.qty} proxy(s) · ${o.metodoPago}\n\n`;
  }
  await sendMessage(chatId, text, { reply_markup: mainMenu() });
}

async function handleHelp(chatId: number) {
  await sendMessage(
    chatId,
    `ℹ️ <b>¿Cómo funciona?</b>\n\n` +
      `1️⃣ Toca <b>🛒 Comprar Proxies</b>\n` +
      `2️⃣ Elige la cantidad\n` +
      `3️⃣ Elige tu método de pago\n` +
      `4️⃣ Realiza el pago y envía el comprobante\n` +
      `5️⃣ En máximo 30 min recibes tus proxies ✅\n\n` +
      `<b>Formato entregado:</b>\n<code>host:puerto:usuario:contraseña</code>\n\n` +
      `<b>Protocolos:</b> HTTPS / SOCKS5\n\n` +
      `📩 ¿Problemas? Contacta: @Soportetecnico2323`,
    { reply_markup: mainMenu() }
  );
}

// ─────────────────────────────────────────
//  COMANDOS DEL ADMIN
// ─────────────────────────────────────────
async function handleAdminConfirm(orderId: string, adminChatId: number) {
  const order = orders[orderId];
  if (!order) {
    await sendMessage(adminChatId, `❌ Pedido <code>${orderId}</code> no encontrado.`);
    return;
  }
  if (order.status === "completed") {
    await sendMessage(adminChatId, `⚠️ Este pedido ya fue entregado.`);
    return;
  }

  await sendMessage(adminChatId, `⏳ Obteniendo proxies de tu cuenta Proxy6...`);
  const proxies = await getAvailableProxies(order.qty);

  if (proxies.length < order.qty) {
    await sendMessage(
      adminChatId,
      `❌ <b>No hay suficientes proxies disponibles.</b>\n\n` +
        `Necesitas: <b>${order.qty}</b> — Disponibles: <b>${proxies.length}</b>\n\n` +
        `Usa entrega manual:\n` +
        `<code>/entregar ${orderId} host:port:user:pass</code>`
    );
    return;
  }

  await deliverProxies(order, proxies);
  await sendMessage(
    adminChatId,
    `✅ <b>Pedido ${orderId} entregado.</b> Se enviaron <b>${proxies.length} proxies</b> al cliente.`
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
    `❌ <b>Pedido ${orderId} rechazado.</b>\n\nEl comprobante no fue válido.\nContacta: @Soportetecnico2323`,
    { reply_markup: mainMenu() }
  );
  await sendMessage(adminChatId, `✅ Pedido <code>${orderId}</code> rechazado y cliente notificado.`);
}

async function handleManualDeliver(text: string, adminChatId: number) {
  const parts = text.split(" ");
  if (parts.length < 3) {
    await sendMessage(
      adminChatId,
      `❌ Formato: <code>/entregar ORD-XXX host:port:user:pass</code>`
    );
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
  await sendMessage(adminChatId, `✅ Proxies entregados manualmente.`);
}

// ─────────────────────────────────────────
//  ROUTE HANDLER
// ─────────────────────────────────────────
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
          await sendMessage(
            chatId,
            `📸 <b>Comprobante recibido.</b>\n\nPedido <code>${session.orderId}</code> en revisión.\n⏳ Máximo <b>30 minutos</b>.`
          );
          await notifyAdminReceipt(order, fileId);
        }
        return NextResponse.json({ ok: true });
      }

      // Comprobante texto
      if (session.step === "waiting_receipt" && session.orderId && text && !text.startsWith("/")) {
        const order = orders[session.orderId];
        if (order) {
          order.status = "pending_confirm";
          await sendMessage(
            chatId,
            `📝 <b>Referencia recibida.</b>\n\nPedido <code>${session.orderId}</code> en revisión.\n⏳ Máximo <b>30 minutos</b>.`
          );
          await notifyAdminReceipt(order, undefined, text);
        }
        return NextResponse.json({ ok: true });
      }

      // Comandos admin
      if (isAdmin && text.startsWith("/entregar")) {
        await handleManualDeliver(text, chatId);
        return NextResponse.json({ ok: true });
      }

      if (text === "/start") await handleStart(chatId, firstName);
      else if (text === "🛒 Comprar Proxies") await handleBuyStart(chatId);
      else if (text === "📦 Mis Pedidos") await handleMyOrders(chatId);
      else if (text === "ℹ️ Ayuda") await handleHelp(chatId);
    }

    if (callbackQuery) {
      const chatId: number = callbackQuery.message.chat.id;
      const data: string = callbackQuery.data;
      const firstName: string = callbackQuery.from?.first_name || "Usuario";
      const username: string | undefined = callbackQuery.from?.username;

      await tPost("answerCallbackQuery", { callback_query_id: callbackQuery.id });

      if (data === "cancel") {
        sessions[chatId] = { step: "idle" };
        await sendMessage(chatId, "❌ Compra cancelada.", { reply_markup: mainMenu() });
        return NextResponse.json({ ok: true });
      }
      if (data.startsWith("qty_")) {
        await handleQtySelected(chatId, parseInt(data.replace("qty_", "")));
      } else if (data.startsWith("pay_")) {
        await handlePaymentSelected(chatId, firstName, username, data.replace("pay_", ""));
      } else if (data.startsWith("confirm_") && chatId === ADMIN_ID) {
        await handleAdminConfirm(data.replace("confirm_", ""), chatId);
      } else if (data.startsWith("reject_") && chatId === ADMIN_ID) {
        await handleAdminReject(data.replace("reject_", ""), chatId);
      }
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
