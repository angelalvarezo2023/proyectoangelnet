import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API = `https://api.telegram.org/bot${TOKEN}`;

// ── IDs de los dos grupos ──
const GRUPO_ESCORTS      = -4670796638; // Solo admins/escorts
const GRUPO_TELEFONISTAS = -5171466708; // Solo telefonistas

// Estado en memoria por usuario
const conversaciones: Record<number, { paso: string; digitos?: string }> = {};

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function telegramPost(method: string, body: object) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chat_id: number, text: string, extra: object = {}) {
  return telegramPost("sendMessage", {
    chat_id,
    text,
    parse_mode: "Markdown",
    ...extra,
  });
}

// Verifica si el usuario es admin del grupo de escorts
async function esEscort(user_id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${user_id}`);
    const data = await res.json();
    return ["administrator", "creator"].includes(data.result?.status);
  } catch {
    return false;
  }
}

// Verifica si el usuario es miembro del grupo de telefonistas
async function esTelefonista(user_id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API}/getChatMember?chat_id=${GRUPO_TELEFONISTAS}&user_id=${user_id}`);
    const data = await res.json();
    return ["member", "administrator", "creator"].includes(data.result?.status);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────
// PUBLICAR CLIENTE EN GRUPO DE ESCORTS
// ──────────────────────────────────────────

async function publicarEnEscorts(uid: number, chatPrivado: number, digitos: string, monto: string) {
  delete conversaciones[uid];

  // Mensaje al grupo de escorts
  await telegramPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE ABAJO*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${digitos}\`\n` +
      `💰 Estimado: *$${monto}*\n` +
      `━━━━━━━━━━━━━━\n` +
      `¿Quién va?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🙋 Envíamelo, estoy lista", callback_data: `acepto_${digitos}_${monto}` }],
      ],
    },
  });

  // Confirmación al telefonista en privado
  return sendMessage(chatPrivado, "✅ *Cliente enviado al grupo de escorts.*", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📞 Registrar otro cliente", callback_data: "inicio_nuevo_cliente" }],
      ],
    },
  });
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES DE TEXTO
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const uid: number  = msg.from.id;
  const texto: string = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const conv = conversaciones[uid];

  // ── /panel en grupo telefonistas — publica botón (solo admins del grupo escorts) ──
  if (texto === "/panel" && chatId === GRUPO_TELEFONISTAS) {
    const escort = await esEscort(uid);
    if (escort) {
      await telegramPost("deleteMessage", {
        chat_id: GRUPO_TELEFONISTAS,
        message_id: msg.message_id,
      });
      await telegramPost("sendMessage", {
        chat_id: GRUPO_TELEFONISTAS,
        text: "📋 *Panel de operaciones*\nUsa el botón para registrar un nuevo cliente.",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
          ],
        },
      });
    }
    return;
  }

  // Ignorar mensajes directos de los grupos
  if (chatId === GRUPO_TELEFONISTAS || chatId === GRUPO_ESCORTS) return;

  // ── Flujo en privado: esperando dígitos ──
  if (conv?.paso === "esperando_digitos") {
    if (!/^\d{4}$/.test(texto)) {
      return sendMessage(chatId, "⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:", {
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }]],
        },
      });
    }
    conversaciones[uid] = { paso: "esperando_monto", digitos: texto };
    return sendMessage(
      chatId,
      `✅ Código: \`${texto}\`\n\n💵 ¿Cuánto estimas que pagará?\n\nElige o escribe el monto:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "$50",  callback_data: "monto_50"  },
              { text: "$100", callback_data: "monto_100" },
              { text: "$150", callback_data: "monto_150" },
              { text: "$200", callback_data: "monto_200" },
            ],
            [{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }],
          ],
        },
      }
    );
  }

  // ── Flujo en privado: monto escrito manualmente ──
  if (conv?.paso === "esperando_monto") {
    if (!/^\d+(\.\d+)?$/.test(texto)) {
      return sendMessage(chatId, "⚠️ Ingresa solo el número. Ej: *100*");
    }
    await publicarEnEscorts(uid, chatId, conv.digitos!, texto);
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS (botones inline)
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const chatId: number = query.message.chat.id;

  // ── Telefonista presiona "Nuevo Cliente" en el grupo telefonistas ──
  if (data === "inicio_nuevo_cliente") {
    const escort = await esEscort(uid);
    if (escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Eres escort (admin), no puedes registrar clientes.",
        show_alert: true,
      });
    }
    const esTelf = await esTelefonista(uid);
    if (!esTelf) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ No tienes acceso.",
        show_alert: true,
      });
    }

    conversaciones[uid] = { paso: "esperando_digitos" };

    await sendMessage(uid, "📞 *Nuevo Cliente*\n\nIngresa los *4 dígitos* del código del cliente:", {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }]],
      },
    });

    return telegramPost("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "✅ Revisa tu chat privado con el bot.",
    });
  }

  // ── Monto rápido ──
  if (data.startsWith("monto_")) {
    const monto = data.replace("monto_", "");
    const conv  = conversaciones[uid];
    if (conv?.paso === "esperando_monto" && conv.digitos) {
      await publicarEnEscorts(uid, chatId, conv.digitos, monto);
    }
    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Cancelar flujo ──
  if (data === "cancelar_flujo") {
    delete conversaciones[uid];
    await telegramPost("editMessageText", {
      chat_id: chatId,
      message_id: query.message.message_id,
      text: "❌ Operación cancelada.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
        ],
      },
    });
    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Escort acepta el cliente (solo desde grupo escorts) ──
  if (data.startsWith("acepto_")) {
    const escort = await esEscort(uid);
    if (!escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo las escorts pueden aceptar.",
        show_alert: true,
      });
    }

    const [, digitos, monto] = data.split("_");

    // Actualizar mensaje en grupo escorts
    await telegramPost("editMessageText", {
      chat_id: GRUPO_ESCORTS,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      text:
        `🟡 *EN PROCESO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `💰 Estimado: *$${monto}*\n` +
        `🙋 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━`,
      reply_markup: { inline_keyboard: [] },
    });

    // Botones de estado final en privado a la escort
    await sendMessage(
      uid,
      `✅ *Asignada al cliente \`${digitos}\`*\n\nActualiza el estado cuando termines:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Cliente pagó",      callback_data: `pago_${digitos}_${monto}`      }],
            [{ text: "🚪 Cliente se fue",    callback_data: `fue_${digitos}_${monto}`       }],
            [{ text: "❌ Servicio cancelado", callback_data: `cancelado_${digitos}_${monto}` }],
          ],
        },
      }
    );

    return telegramPost("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "✅ Asignada. Revisa tu chat privado con el bot.",
    });
  }

  // ── Estado final del servicio ──
  const estadoMatch = data.match(/^(pago|fue|cancelado)_(\d+)_(\d+)$/);
  if (estadoMatch) {
    const escort = await esEscort(uid);
    if (!escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Sin permisos.",
        show_alert: true,
      });
    }

    const [, accion, digitos, monto] = estadoMatch;

    const mensajes: Record<string, string> = {
      pago:
        `✅ *SERVICIO COMPLETADO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `💰 Monto: *$${monto}*\n` +
        `🙋 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━`,
      fue:
        `🚪 *CLIENTE SE FUE*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `👤 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━`,
      cancelado:
        `❌ *CANCELADO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `👤 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━`,
    };

    // Notificar resultado en AMBOS grupos
    await telegramPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: mensajes[accion],
    });
    await telegramPost("sendMessage", {
      chat_id: GRUPO_TELEFONISTAS,
      parse_mode: "Markdown",
      text: mensajes[accion],
    });

    // Quitar botones del mensaje privado de la escort
    await telegramPost("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });

    await sendMessage(uid, "✅ Estado actualizado.");
    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }
}

// ──────────────────────────────────────────
// ROUTE HANDLER
// ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message)        await handleMessage(body.message);
    else if (body.callback_query) await handleCallback(body.callback_query);
  } catch (err) {
    console.error("Bot error:", err);
  }
  return NextResponse.json({ ok: true });
}
