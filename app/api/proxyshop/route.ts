import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────
const TOKEN = "8798842692:AAHzSInpAEcNxsDkf8_FkJTPGNPjD3qdu-Q";
const API = `https://api.telegram.org/bot${TOKEN}`;
const PROXY6_KEY = "c5008743d3-dfb41a5904-d007bb3002";
const PROXY6_API = `https://px6.link/api/${PROXY6_KEY}`;

// ─────────────────────────────────────────
//  TIPOS
// ─────────────────────────────────────────
type Session = {
  step: "idle" | "country" | "type" | "qty" | "days" | "confirm";
  country?: string;
  version?: "4" | "6";
  qty?: number;
  days?: number;
  price?: string;
  currency?: string;
};

// Sesiones en memoria
const sessions: Record<number, Session> = {};

// Países populares disponibles en Proxy6
const COUNTRIES: Record<string, string> = {
  "🇺🇸 USA": "us",
  "🇩🇪 Alemania": "de",
  "🇬🇧 UK": "gb",
  "🇫🇷 Francia": "fr",
  "🇳🇱 Holanda": "nl",
  "🇷🇺 Rusia": "ru",
  "🇨🇦 Canadá": "ca",
  "🇧🇷 Brasil": "br",
  "🇯🇵 Japón": "jp",
  "🇸🇬 Singapur": "sg",
};

const PERIODS = [7, 14, 30, 60, 90];
const QTY_OPTIONS = [1, 3, 5, 10, 20, 50];

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

async function sendMessage(chatId: number, text: string, extra: object = {}): Promise<void> {
  await tPost("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function proxy6Get(endpoint: string): Promise<any> {
  const res = await fetch(`${PROXY6_API}/${endpoint}`);
  return res.json();
}

function buildKeyboard(options: string[][], isInline = true) {
  if (isInline) {
    return {
      inline_keyboard: options.map((row) =>
        row.map((label) => ({ text: label, callback_data: label }))
      ),
    };
  }
  return {
    keyboard: options.map((row) => row.map((label) => ({ text: label }))),
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// ─────────────────────────────────────────
//  FLUJO DEL BOT
// ─────────────────────────────────────────

async function handleStart(chatId: number, firstName: string) {
  sessions[chatId] = { step: "idle" };
  await sendMessage(
    chatId,
    `🌐 <b>Bienvenido, ${firstName}!</b>\n\n` +
      `Soy tu bot de compra de proxies privados. Aquí puedes adquirir proxies IPv4 e IPv6 de alta calidad en segundos.\n\n` +
      `Usa los botones para comenzar:`,
    {
      reply_markup: buildKeyboard(
        [["🛒 Comprar Proxies"], ["💰 Mi Balance", "ℹ️ Ayuda"]],
        false
      ),
    }
  );
}

async function handleBuyStart(chatId: number) {
  sessions[chatId] = { step: "country" };
  const countryKeys = Object.keys(COUNTRIES);
  const rows: string[][] = [];
  for (let i = 0; i < countryKeys.length; i += 2) {
    rows.push(countryKeys.slice(i, i + 2));
  }
  await sendMessage(chatId, `🌍 <b>Paso 1/4 — Elige el país de los proxies:</b>`, {
    reply_markup: buildKeyboard(rows),
  });
}

async function handleCountrySelected(chatId: number, countryLabel: string) {
  const code = COUNTRIES[countryLabel];
  if (!code) {
    await sendMessage(chatId, "❌ País no válido. Por favor elige una opción del menú.");
    return;
  }
  sessions[chatId] = { ...sessions[chatId], step: "type", country: code };
  await sendMessage(
    chatId,
    `✅ País: <b>${countryLabel}</b>\n\n` +
      `🔌 <b>Paso 2/4 — Elige el tipo de proxy:</b>\n\n` +
      `• <b>IPv4</b> — Mayor compatibilidad, ideal para redes sociales\n` +
      `• <b>IPv6</b> — Más económico, ideal para scraping y bots`,
    { reply_markup: buildKeyboard([["🔵 IPv4", "🟣 IPv6"]]) }
  );
}

async function handleTypeSelected(chatId: number, typeLabel: string) {
  const version = typeLabel.includes("IPv4") ? "4" : "6";
  sessions[chatId] = { ...sessions[chatId], step: "qty", version };
  await sendMessage(
    chatId,
    `✅ Tipo: <b>${typeLabel}</b>\n\n` +
      `📦 <b>Paso 3/4 — ¿Cuántos proxies necesitas?</b>`,
    {
      reply_markup: buildKeyboard([
        QTY_OPTIONS.slice(0, 3).map((n) => `${n}`),
        QTY_OPTIONS.slice(3).map((n) => `${n}`),
      ]),
    }
  );
}

async function handleQtySelected(chatId: number, qtyStr: string) {
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    await sendMessage(chatId, "❌ Cantidad no válida.");
    return;
  }
  sessions[chatId] = { ...sessions[chatId], step: "days", qty };
  await sendMessage(
    chatId,
    `✅ Cantidad: <b>${qty} proxies</b>\n\n` + `📅 <b>Paso 4/4 — ¿Por cuántos días?</b>`,
    {
      reply_markup: buildKeyboard([PERIODS.map((d) => `${d} días`)]),
    }
  );
}

async function handleDaysSelected(chatId: number, daysStr: string) {
  const days = parseInt(daysStr);
  if (isNaN(days)) {
    await sendMessage(chatId, "❌ Período no válido.");
    return;
  }
  const session = sessions[chatId];
  if (!session?.qty || !session?.country || !session?.version) {
    await sendMessage(chatId, "❌ Sesión expirada. Usa /start para comenzar.");
    return;
  }

  await sendMessage(chatId, "⏳ Calculando precio...");

  try {
    const priceData = await proxy6Get(
      `getprice?count=${session.qty}&period=${days}&version=${session.version}`
    );

    if (priceData.status !== "yes") {
      await sendMessage(
        chatId,
        `❌ Error al obtener precio: <code>${priceData.error || "desconocido"}</code>`
      );
      return;
    }

    const price = priceData.price;
    const currency = priceData.currency;

    sessions[chatId] = { ...session, step: "confirm", days, price, currency };

    const countryLabel =
      Object.entries(COUNTRIES).find(([, v]) => v === session.country)?.[0] || session.country;

    await sendMessage(
      chatId,
      `📋 <b>Resumen de tu pedido:</b>\n\n` +
        `🌍 País: <b>${countryLabel}</b>\n` +
        `🔌 Tipo: <b>IPv${session.version}</b>\n` +
        `📦 Cantidad: <b>${session.qty} proxies</b>\n` +
        `📅 Período: <b>${days} días</b>\n` +
        `💵 Precio total: <b>${price} ${currency}</b>\n\n` +
        `⚠️ El pago se deducirá del saldo en Proxy6.\n\n` +
        `¿Confirmas la compra?`,
      { reply_markup: buildKeyboard([["✅ Confirmar compra", "❌ Cancelar"]]) }
    );
  } catch (err) {
    await sendMessage(chatId, "❌ Error de conexión con Proxy6. Intenta de nuevo.");
    console.error("Proxy6 getprice error:", err);
  }
}

async function handleConfirmPurchase(chatId: number) {
  const session = sessions[chatId];
  if (!session?.qty || !session?.country || !session?.version || !session?.days) {
    await sendMessage(chatId, "❌ Sesión expirada. Usa /start para comenzar.");
    return;
  }

  await sendMessage(chatId, "🔄 Procesando tu compra...");

  try {
    // Verificar balance antes de comprar
    const balanceData = await proxy6Get("");
    if (balanceData.status !== "yes") {
      await sendMessage(chatId, "❌ Error al verificar balance en Proxy6.");
      return;
    }

    const balance = parseFloat(balanceData.balance);
    const price = parseFloat(session.price || "0");

    if (balance < price) {
      await sendMessage(
        chatId,
        `❌ <b>Balance insuficiente en Proxy6.</b>\n\n` +
          `Balance actual: <b>${balanceData.balance} ${balanceData.currency}</b>\n` +
          `Precio del pedido: <b>${session.price} ${session.currency}</b>\n\n` +
          `Por favor recarga tu cuenta en Proxy6 e intenta de nuevo.`
      );
      return;
    }

    // Comprar proxies
    const buyData = await proxy6Get(
      `buy?count=${session.qty}&period=${session.days}&country=${session.country}&version=${session.version}&type=http`
    );

    if (buyData.status !== "yes") {
      const errMsg =
        buyData.error_id === 400
          ? "Balance insuficiente en Proxy6."
          : buyData.error_id === 200
          ? "Cantidad de proxies no disponible para ese país."
          : `Error ${buyData.error_id}: ${buyData.error || "desconocido"}`;

      await sendMessage(chatId, `❌ <b>Compra fallida:</b> ${errMsg}`);
      return;
    }

    // Formatear proxies entregados
    const proxyList = Object.values(buyData.list) as any[];
    let proxyText = "";
    for (const proxy of proxyList) {
      proxyText += `<code>${proxy.host}:${proxy.port}:${proxy.user}:${proxy.pass}</code>\n`;
    }

    const countryLabel =
      Object.entries(COUNTRIES).find(([, v]) => v === session.country)?.[0] || session.country;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (session.days || 0));
    const expiry = expiryDate.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await sendMessage(
      chatId,
      `✅ <b>¡Compra exitosa!</b>\n\n` +
        `🌍 País: <b>${countryLabel}</b>\n` +
        `🔌 Tipo: <b>IPv${session.version}</b>\n` +
        `📦 Cantidad: <b>${session.qty} proxies</b>\n` +
        `📅 Expiran: <b>${expiry}</b>\n` +
        `💵 Total pagado: <b>${session.price} ${session.currency}</b>\n\n` +
        `🔐 <b>Tus proxies (host:puerto:usuario:contraseña):</b>\n\n` +
        proxyText +
        `\n📌 Protocolo: HTTP/HTTPS`
    );

    // Resetear sesión
    sessions[chatId] = { step: "idle" };

    await sendMessage(chatId, `¿Deseas comprar más proxies?`, {
      reply_markup: buildKeyboard(
        [["🛒 Comprar Proxies"], ["💰 Mi Balance", "ℹ️ Ayuda"]],
        false
      ),
    });
  } catch (err) {
    await sendMessage(chatId, "❌ Error interno al procesar la compra. Intenta de nuevo.");
    console.error("Proxy6 buy error:", err);
  }
}

async function handleBalance(chatId: number) {
  try {
    const data = await proxy6Get("");
    if (data.status !== "yes") {
      await sendMessage(chatId, "❌ Error al obtener el balance.");
      return;
    }
    await sendMessage(
      chatId,
      `💰 <b>Balance en Proxy6:</b>\n\n` +
        `<b>${data.balance} ${data.currency}</b>`
    );
  } catch {
    await sendMessage(chatId, "❌ Error de conexión con Proxy6.");
  }
}

async function handleHelp(chatId: number) {
  await sendMessage(
    chatId,
    `ℹ️ <b>¿Cómo funciona este bot?</b>\n\n` +
      `1. Toca <b>🛒 Comprar Proxies</b>\n` +
      `2. Elige tu país, tipo (IPv4/IPv6), cantidad y período\n` +
      `3. Revisa el precio y confirma\n` +
      `4. ¡Recibes tus proxies al instante!\n\n` +
      `<b>Formato entregado:</b>\n` +
      `<code>host:puerto:usuario:contraseña</code>\n\n` +
      `<b>Protocolos:</b> HTTP / HTTPS`
  );
}

// ─────────────────────────────────────────
//  WEBHOOK HANDLER PRINCIPAL
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;
    const callbackQuery = body.callback_query;

    // ── Mensajes de texto ──
    if (message) {
      const chatId: number = message.chat.id;
      const text: string = message.text || "";
      const firstName: string = message.from?.first_name || "Usuario";
      const session = sessions[chatId] || { step: "idle" };

      if (text === "/start") {
        await handleStart(chatId, firstName);
      } else if (text === "🛒 Comprar Proxies") {
        await handleBuyStart(chatId);
      } else if (text === "💰 Mi Balance") {
        await handleBalance(chatId);
      } else if (text === "ℹ️ Ayuda") {
        await handleHelp(chatId);
      } else {
        await sendMessage(
          chatId,
          `Usa los botones del menú para navegar.\nEscribe /start si necesitas reiniciar.`
        );
      }
    }

    // ── Botones inline ──
    if (callbackQuery) {
      const chatId: number = callbackQuery.message.chat.id;
      const data: string = callbackQuery.data;
      const session = sessions[chatId] || { step: "idle" };

      await tPost("answerCallbackQuery", { callback_query_id: callbackQuery.id });

      if (data === "❌ Cancelar") {
        sessions[chatId] = { step: "idle" };
        await sendMessage(chatId, "❌ Compra cancelada.", {
          reply_markup: buildKeyboard(
            [["🛒 Comprar Proxies"], ["💰 Mi Balance", "ℹ️ Ayuda"]],
            false
          ),
        });
        return NextResponse.json({ ok: true });
      }

      switch (session.step) {
        case "country":
          if (Object.keys(COUNTRIES).includes(data)) {
            await handleCountrySelected(chatId, data);
          }
          break;

        case "type":
          if (data.includes("IPv4") || data.includes("IPv6")) {
            await handleTypeSelected(chatId, data);
          }
          break;

        case "qty":
          if (QTY_OPTIONS.map(String).includes(data)) {
            await handleQtySelected(chatId, data);
          }
          break;

        case "days":
          const daysMatch = data.match(/^(\d+) días$/);
          if (daysMatch) {
            await handleDaysSelected(chatId, daysMatch[1]);
          }
          break;

        case "confirm":
          if (data === "✅ Confirmar compra") {
            await handleConfirmPurchase(chatId);
          }
          break;

        default:
          await sendMessage(chatId, "Usa /start para comenzar.");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Proxy bot error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// ─────────────────────────────────────────
//  GET — registrar / verificar webhook
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "setWebhook") {
    const webhookUrl = searchParams.get("url");
    if (!webhookUrl) {
      return NextResponse.json({ error: "Falta ?url=https://tu-dominio.vercel.app/api/proxyshop" });
    }
    const res = await fetch(`${API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await res.json();
    return NextResponse.json(data);
  }

  if (action === "getWebhook") {
    const res = await fetch(`${API}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json(data);
  }

  return NextResponse.json({
    bot: "ProxyShop Bot",
    status: "running",
    instructions: {
      setWebhook: "GET /api/proxyshop?action=setWebhook&url=https://tu-dominio.vercel.app/api/proxyshop",
      getWebhook: "GET /api/proxyshop?action=getWebhook",
    },
  });
}
