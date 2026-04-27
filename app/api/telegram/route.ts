import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -4670796638;
const GRUPO_TELEFONISTAS = -5171466708;

// Estado por usuario: qué paso del flujo está completando
const conversaciones: Record<number, { paso: string; digitos?: string; msgId?: number }> = {};

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

async function esEscort(user_id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${user_id}`);
    const data = await res.json();
    return ["administrator", "creator"].includes(data.result?.status);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const uid: number    = msg.from.id;
  const texto: string  = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const nombre: string = msg.from.first_name;
  const conv           = conversaciones[uid];

  // ── /panel en grupo telefonistas → publica botón (solo admins) ──
  if (texto === "/panel" && chatId === GRUPO_TELEFONISTAS) {
    const escort = await esEscort(uid);
    if (escort) {
      await telegramPost("deleteMessage", {
        chat_id: GRUPO_TELEFONISTAS,
        message_id: msg.message_id,
      });
      await telegramPost("sendMessage", {
        chat_id: GRUPO_TELEFONISTAS,
        text: "📋 *Panel de operaciones*",
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

  // Solo procesar mensajes del grupo de telefonistas
  if (chatId !== GRUPO_TELEFONISTAS) return;

  // ── Esperando los 4 dígitos ──
  if (conv?.paso === "esperando_digitos") {
    // Borrar mensaje del telefonista para mantener limpio el grupo
    await telegramPost("deleteMessage", {
      chat_id: GRUPO_TELEFONISTAS,
      message_id: msg.message_id,
    });

    if (!/^\d{4}$/.test(texto)) {
      // Editar el mensaje del bot con el error
      await telegramPost("editMessageText", {
        chat_id: GRUPO_TELEFONISTAS,
        message_id: conv.msgId,
        parse_mode: "Markdown",
        text: `⚠️ *${nombre}*, deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }]],
        },
      });
      return;
    }

    conversaciones[uid] = { paso: "esperando_monto", digitos: texto, msgId: conv.msgId };

    await telegramPost("editMessageText", {
      chat_id: GRUPO_TELEFONISTAS,
      message_id: conv.msgId,
      parse_mode: "Markdown",
      text:
        `📞 *Nuevo Cliente* — ${nombre}\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${texto}\`\n\n` +
        `💵 ¿Cuánto estimas que pagará?\n` +
        `Elige o escribe el monto:`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "$50",  callback_data: `monto_50_${uid}`  },
            { text: "$100", callback_data: `monto_100_${uid}` },
            { text: "$150", callback_data: `monto_150_${uid}` },
            { text: "$200", callback_data: `monto_200_${uid}` },
          ],
          [{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }],
        ],
      },
    });
    return;
  }

  // ── Esperando monto escrito manualmente ──
  if (conv?.paso === "esperando_monto") {
    await telegramPost("deleteMessage", {
      chat_id: GRUPO_TELEFONISTAS,
      message_id: msg.message_id,
    });

    if (!/^\d+(\.\d+)?$/.test(texto)) {
      await telegramPost("editMessageText", {
        chat_id: GRUPO_TELEFONISTAS,
        message_id: conv.msgId,
        parse_mode: "Markdown",
        text: `⚠️ Ingresa solo el número. Ej: *100*`,
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }]],
        },
      });
      return;
    }

    await publicarCliente(uid, nombre, conv.digitos!, texto, conv.msgId!);
  }
}

// ──────────────────────────────────────────
// PUBLICAR CLIENTE EN GRUPO ESCORTS
// ──────────────────────────────────────────

async function publicarCliente(
  uid: number,
  nombre: string,
  digitos: string,
  monto: string,
  msgId: number
) {
  delete conversaciones[uid];

  // Actualizar mensaje en grupo telefonistas → confirmación
  await telegramPost("editMessageText", {
    chat_id: GRUPO_TELEFONISTAS,
    message_id: msgId,
    parse_mode: "Markdown",
    text:
      `✅ *Cliente enviado*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${digitos}\`\n` +
      `💰 Estimado: *$${monto}*\n` +
      `👤 Registrado por: *${nombre}*\n` +
      `━━━━━━━━━━━━━━`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
      ],
    },
  });

  // Enviar al grupo de escorts
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
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const chatId: number = query.message.chat.id;
  const msgId: number  = query.message.message_id;

  // ── Telefonista presiona "Nuevo Cliente" ──
  if (data === "inicio_nuevo_cliente") {
    const escort = await esEscort(uid);
    if (escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Eres escort, no puedes registrar clientes.",
        show_alert: true,
      });
    }

    conversaciones[uid] = { paso: "esperando_digitos", msgId };

    await telegramPost("editMessageText", {
      chat_id: GRUPO_TELEFONISTAS,
      message_id: msgId,
      parse_mode: "Markdown",
      text: `📞 *Nuevo Cliente* — ${nombre}\n\nEscribe los *4 dígitos* del código del cliente:`,
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_flujo" }]],
      },
    });

    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Monto rápido seleccionado ──
  if (data.startsWith("monto_")) {
    const parts = data.split("_"); // monto_100_uid
    const monto = parts[1];
    const ownerId = parseInt(parts[2]);

    // Solo el telefonista que inició el flujo puede elegir
    if (uid !== ownerId) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo quien inició puede completar este registro.",
        show_alert: true,
      });
    }

    const conv = conversaciones[uid];
    if (conv?.paso === "esperando_monto" && conv.digitos) {
      await publicarCliente(uid, nombre, conv.digitos, monto, conv.msgId!);
    }
    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Cancelar flujo ──
  if (data === "cancelar_flujo") {
    delete conversaciones[uid];
    await telegramPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "📋 *Panel de operaciones*",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
        ],
      },
    });
    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Escort acepta cliente ──
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
      message_id: msgId,
      parse_mode: "Markdown",
      text:
        `🟡 *EN PROCESO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `💰 Estimado: *$${monto}*\n` +
        `🙋 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━\n` +
        `Actualiza el estado cuando termines:`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Cliente pagó",       callback_data: `pago_${digitos}_${monto}_${uid}`      }],
          [{ text: "🚪 Cliente se fue",     callback_data: `fue_${digitos}_${monto}_${uid}`       }],
          [{ text: "❌ Servicio cancelado", callback_data: `cancelado_${digitos}_${monto}_${uid}` }],
        ],
      },
    });

    return telegramPost("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "✅ Cliente asignado. Actualiza el estado cuando termines.",
    });
  }

  // ── Estado final del servicio ──
  const estadoMatch = data.match(/^(pago|fue|cancelado)_(\d+)_(\d+)_(\d+)$/);
  if (estadoMatch) {
    const [, accion, digitos, monto, ownerId] = estadoMatch;

    // Solo la escort que aceptó puede actualizar
    if (uid !== parseInt(ownerId)) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo la escort asignada puede actualizar el estado.",
        show_alert: true,
      });
    }

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

    // Actualizar mensaje en grupo escorts (quitar botones)
    await telegramPost("editMessageText", {
      chat_id: GRUPO_ESCORTS,
      message_id: msgId,
      parse_mode: "Markdown",
      text: mensajes[accion],
      reply_markup: { inline_keyboard: [] },
    });

    // Notificar resultado en grupo telefonistas
    await telegramPost("sendMessage", {
      chat_id: GRUPO_TELEFONISTAS,
      parse_mode: "Markdown",
      text: mensajes[accion],
    });

    return telegramPost("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "✅ Estado actualizado.",
    });
  }
}

// ──────────────────────────────────────────
// ROUTE HANDLER
// ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message)             await handleMessage(body.message);
    else if (body.callback_query) await handleCallback(body.callback_query);
  } catch (err) {
    console.error("Bot error:", err);
  }
  return NextResponse.json({ ok: true });
}
