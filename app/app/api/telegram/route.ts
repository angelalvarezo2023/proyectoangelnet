import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const GROUP_ID = -5171466708;
const API = `https://api.telegram.org/bot${TOKEN}`;

// Estado en memoria (se resetea con cada deploy, suficiente para uso normal)
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
  return telegramPost("sendMessage", { chat_id, text, parse_mode: "Markdown", ...extra });
}

async function esEscort(user_id: number): Promise<boolean> {
  try {
    const res = await fetch(
      `${API}/getChatMember?chat_id=${GROUP_ID}&user_id=${user_id}`
    );
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
  const uid: number = msg.from.id;
  const texto: string = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const escort = await esEscort(uid);
  const conv = conversaciones[uid];

  // Comando /nuevo_cliente — solo telefonistas (no admins)
  if (texto === "/nuevo_cliente") {
    if (escort) {
      return sendMessage(chatId, "❌ Los administradores son escorts, no telefonistas.");
    }
    conversaciones[uid] = { paso: "esperando_digitos" };
    return sendMessage(chatId, "📞 Ingresa los *4 dígitos* del cliente:");
  }

  // Comando /cancelar
  if (texto === "/cancelar") {
    delete conversaciones[uid];
    return sendMessage(chatId, "❌ Operación cancelada.");
  }

  // Flujo de conversación activa (telefonista)
  if (conv) {
    if (conv.paso === "esperando_digitos") {
      if (!/^\d{4}$/.test(texto)) {
        return sendMessage(chatId, "⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:");
      }
      conversaciones[uid] = { paso: "esperando_monto", digitos: texto };
      return sendMessage(chatId, `✅ Código: \`${texto}\`\n\n💵 ¿Cuánto estimas que pagará? (solo el número, ej: *100*):`);
    }

    if (conv.paso === "esperando_monto") {
      if (!/^\d+(\.\d+)?$/.test(texto)) {
        return sendMessage(chatId, "⚠️ Ingresa solo el monto numérico. Ej: *100*");
      }
      const { digitos } = conv;
      const monto = texto;
      delete conversaciones[uid];

      const teclado = {
        inline_keyboard: [
          [{ text: "🙋 Envíamelo, estoy lista", callback_data: `acepto_${digitos}_${monto}` }],
        ],
      };

      await telegramPost("sendMessage", {
        chat_id: GROUP_ID,
        parse_mode: "Markdown",
        text:
          `🔔 *CLIENTE ABAJO*\n` +
          `━━━━━━━━━━━━━━\n` +
          `🔢 Código: \`${digitos}\`\n` +
          `💰 Estimado: *$${monto}*\n` +
          `━━━━━━━━━━━━━━\n` +
          `¿Quién va?`,
        reply_markup: teclado,
      });

      return sendMessage(chatId, "✅ Mensaje enviado al grupo.");
    }
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS (botones inline)
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number = query.from.id;
  const data: string = query.data;
  const nombre: string = query.from.first_name;
  const escort = await esEscort(uid);

  // Escort acepta el cliente
  if (data.startsWith("acepto_")) {
    if (!escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo las escorts pueden aceptar.",
        show_alert: true,
      });
    }

    const [, digitos, monto] = data.split("_");

    // Editar mensaje del grupo
    await telegramPost("editMessageText", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      text:
        `🔔 *CLIENTE ASIGNADO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `💰 Estimado: *$${monto}*\n` +
        `🙋 Escort: *${nombre}*\n` +
        `━━━━━━━━━━━━━━`,
    });

    // Enviar botones de estado final a la escort en privado
    const tecladoEstado = {
      inline_keyboard: [
        [{ text: "✅ Cliente pagó", callback_data: `pago_${digitos}` }],
        [{ text: "🚪 Cliente se fue", callback_data: `fue_${digitos}` }],
        [{ text: "❌ Cancelado", callback_data: `cancelado_${digitos}` }],
      ],
    };

    await telegramPost("sendMessage", {
      chat_id: uid,
      parse_mode: "Markdown",
      text: `Estás asignada al cliente \`${digitos}\`.\n\nActualiza el estado cuando termines:`,
      reply_markup: tecladoEstado,
    });

    return telegramPost("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "✅ Asignada. Revisa tu chat privado con el bot.",
    });
  }

  // Estado final (pagó, se fue, cancelado)
  const estadoMatch = data.match(/^(pago|fue|cancelado)_(\d+)$/);
  if (estadoMatch) {
    if (!escort) {
      return telegramPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Sin permisos.",
        show_alert: true,
      });
    }

    const [, accion, digitos] = estadoMatch;

    const mensajes: Record<string, string> = {
      pago: `✅ *Servicio completado*\nCliente \`${digitos}\` — Pagó correctamente.`,
      fue: `🚪 *Cliente se fue*\nCliente \`${digitos}\` — Se retiró sin completar.`,
      cancelado: `❌ *Cancelado*\nCliente \`${digitos}\` — Cancelado por *${nombre}*.`,
    };

    await telegramPost("sendMessage", {
      chat_id: GROUP_ID,
      parse_mode: "Markdown",
      text: mensajes[accion],
    });

    await telegramPost("editMessageReplyMarkup", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });

    await telegramPost("sendMessage", {
      chat_id: uid,
      text: "✅ Estado actualizado en el grupo.",
    });

    return telegramPost("answerCallbackQuery", { callback_query_id: query.id });
  }
}

// ──────────────────────────────────────────
// ROUTE HANDLER (Next.js App Router)
// ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.message) {
      await handleMessage(body.message);
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }
  } catch (err) {
    console.error("Bot error:", err);
  }

  return NextResponse.json({ ok: true });
}
