import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -4670796638;
const GRUPO_TELEFONISTAS = -5171466708;

// ──────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────

type PasoTelf =
  | "idle"
  | "esperando_digitos"
  | "esperando_monto"
  | "esperando_descripcion"
  | "esperando_confirmacion";

interface ConvTelf {
  paso: PasoTelf;
  digitos?: string;
  monto?: string;
  descripcion?: string;
  grupMsgId?: number;
  escortMsgId?: number;
  escortNombre?: string;
}

interface ConvEscort {
  paso: "esperando_descripcion";
  digitos: string;
  monto: string;
  escortMsgId: number;
  telfUid: number;
}

const convTelf:   Record<number, ConvTelf>   = {};
const convEscort: Record<number, ConvEscort> = {};

let   colaActiva: number | null = null;
const colaEspera: number[]      = [];

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function tPost(method: string, body: object): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMsg(chat_id: number, text: string, extra: object = {}): Promise<any> {
  return tPost("sendMessage", { chat_id, text, parse_mode: "Markdown", ...extra });
}

async function editMsg(chat_id: number, message_id: number, text: string, extra: object = {}) {
  return tPost("editMessageText", { chat_id, message_id, text, parse_mode: "Markdown", ...extra });
}

async function deleteMsg(chat_id: number, message_id: number) {
  return tPost("deleteMessage", { chat_id, message_id });
}

async function answerCB(id: string, text?: string, alert = false) {
  return tPost("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text, show_alert: alert } : {}),
  });
}

async function esEscort(user_id: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${user_id}`);
    const data = await res.json();
    return ["administrator", "creator"].includes(data.result?.status);
  } catch { return false; }
}

async function esMiembroTelf(user_id: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_TELEFONISTAS}&user_id=${user_id}`);
    const data = await res.json();
    return ["member", "administrator", "creator"].includes(data.result?.status);
  } catch { return false; }
}

function tieneContactoProhibido(texto: string): boolean {
  const patrones = [
    /\b\d[\d\s\-().]{6,}\d\b/,
    /@[a-zA-Z0-9_.]+/,
    /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i,
    /\b(t\.me|wa\.me|bit\.ly)\b/i,
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,
  ];
  return patrones.some(p => p.test(texto));
}

// ──────────────────────────────────────────
// TECLADOS REALES
// ──────────────────────────────────────────

const tecladoInicio = {
  keyboard: [[{ text: "📞 Nuevo Cliente" }]],
  resize_keyboard: true,
  persistent: true,
};

const tecladoCancelar = {
  keyboard: [[{ text: "❌ Cancelar registro" }]],
  resize_keyboard: true,
  persistent: true,
};

const tecladoMontos = {
  keyboard: [
    [{ text: "$50" }, { text: "$100" }, { text: "$150" }, { text: "$200" }],
    [{ text: "❌ Cancelar registro" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

const tecladoDescripcion = {
  keyboard: [
    [{ text: "➡️ Sin descripción" }],
    [{ text: "❌ Cancelar registro" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

const tecladoAcciones = {
  keyboard: [
    [{ text: "✈️ Lo envié, ya va de camino" }],
    [{ text: "🚪 Cliente se fue" }],
    [{ text: "❌ Cancelar servicio" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

// ──────────────────────────────────────────
// COLA DE TURNOS
// ──────────────────────────────────────────

async function intentarTurno(uid: number, nombre: string) {
  if (colaActiva === null || colaActiva === uid) {
    colaActiva = uid;
    await iniciarFlujo(uid, nombre);
  } else {
    if (!colaEspera.includes(uid)) colaEspera.push(uid);
    const pos = colaEspera.indexOf(uid) + 1;
    await sendMsg(uid,
      `⏳ *Hay un registro en curso.*\n\nEstás en la cola — posición *#${pos}*.\nEspera tu turno.`,
      {
        reply_markup: {
          keyboard: [[{ text: "❌ Salir de la cola" }]],
          resize_keyboard: true,
          persistent: true,
        },
      }
    );
  }
}

async function liberarTurno() {
  colaActiva = null;
  if (colaEspera.length > 0) {
    const siguiente = colaEspera.shift()!;
    colaActiva = siguiente;
    await sendMsg(siguiente,
      `✅ *Es tu turno.* Presiona el botón para registrar tu cliente.`,
      { reply_markup: tecladoInicio }
    );
  }
}

// ──────────────────────────────────────────
// FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function iniciarFlujo(uid: number, nombre: string) {
  convTelf[uid] = { ...convTelf[uid], paso: "esperando_digitos" };
  await sendMsg(uid,
    `📞 *Nuevo Cliente*\n\nEscribe los *4 dígitos* del código del cliente:`,
    { reply_markup: tecladoCancelar }
  );
}

async function cancelarTelf(uid: number) {
  const conv = convTelf[uid];

  if (conv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
      `❌ *Registro cancelado.*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos ?? "—"}\`\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }
  if (conv?.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `❌ *Servicio cancelado por el telefonista.*\n🔢 Código: \`${conv.digitos ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  convTelf[uid] = { paso: "idle" };
  await liberarTurno();
  await sendMsg(uid,
    `❌ *Registro cancelado.*\n\nPuedes iniciar uno nuevo cuando quieras.`,
    { reply_markup: tecladoInicio }
  );
}

async function publicarEnEscorts(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (!conv) return;

  const desc = conv.descripcion ? `\n📝 _${conv.descripcion}_` : "";

  // Estado en grupo telefonistas
  const gMsg = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text:
      `⏳ *Esperando escort...*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `👤 Telefonista: *${nombre}*\n` +
      `━━━━━━━━━━━━━━`,
  });

  // Mensaje al grupo escorts
  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE ABAJO*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `━━━━━━━━━━━━━━\n` +
      `¿Quién va?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🙋 Estoy lista, mándalo", callback_data: `acepto_${conv.digitos}_${conv.monto}_${uid}` }],
      ],
    },
  });

  convTelf[uid] = {
    ...conv,
    paso: "esperando_confirmacion",
    grupMsgId:   gMsg?.result?.message_id,
    escortMsgId: eMsg?.result?.message_id,
  };

  await sendMsg(uid,
    `⏳ *Esperando que una escort acepte...*\n\n` +
    `🔢 Código: \`${conv.digitos}\`\n` +
    `💰 Estimado: *$${conv.monto}*${desc}`,
    {
      reply_markup: {
        keyboard: [[{ text: "❌ Cancelar servicio" }]],
        resize_keyboard: true,
        persistent: true,
      },
    }
  );
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT
// ──────────────────────────────────────────

async function confirmarEscort(uid: number, nombre: string, descripcion?: string) {
  const conv = convEscort[uid];
  if (!conv) return;

  const desc     = descripcion ? `\n📝 Nota: _${descripcion}_` : "";
  const telfUid  = conv.telfUid;
  const telfConv = convTelf[telfUid];

  // Actualizar mensaje en grupo escorts
  await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
    `🟡 *EN PROCESO*\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${conv.digitos}\`\n` +
    `💰 Estimado: *$${conv.monto}*\n` +
    `🙋 Escort: *${nombre}*${desc}\n` +
    `━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // Actualizar grupo telefonistas
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `✅ *Escort lista*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*\n` +
      `🙋 Escort: *${nombre}*${desc}\n` +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  // Notificar telefonista con teclado de acciones
  await sendMsg(telfUid,
    `✅ *¡Escort lista!*\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${conv.digitos}\`\n` +
    `💰 Estimado: *$${conv.monto}*\n` +
    `🙋 Escort: *${nombre}*${desc}\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `¿Qué hago?`,
    { reply_markup: tecladoAcciones }
  );

  convTelf[telfUid] = { ...telfConv, paso: "esperando_confirmacion", escortNombre: nombre };
  delete convEscort[uid];
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const uid: number    = msg.from.id;
  const texto: string  = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const nombre: string = msg.from.first_name;

  // ── /start en privado ──
  if (texto === "/start" && chatId === uid) {
    const escort = await esEscort(uid);
    if (escort) {
      await sendMsg(uid, "👋 Eres escort. Tu panel está en el grupo de escorts.");
      return;
    }
    const esTelf = await esMiembroTelf(uid);
    if (!esTelf) {
      await sendMsg(uid, "❌ No tienes acceso. Pide al administrador que te añada al grupo.");
      return;
    }
    convTelf[uid] = { paso: "idle" };
    await sendMsg(uid,
      `👋 *Bienvenido, ${nombre}.*\n\nUsa el botón para registrar un nuevo cliente.`,
      { reply_markup: tecladoInicio }
    );
    return;
  }

  // ── Mensajes en privado del telefonista ──
  if (chatId === uid) {
    const conv = convTelf[uid];

    // Cancelar (cualquier paso)
    if (texto === "❌ Cancelar registro" || texto === "❌ Cancelar servicio") {
      await cancelarTelf(uid);
      return;
    }

    // Salir de la cola
    if (texto === "❌ Salir de la cola") {
      const idx = colaEspera.indexOf(uid);
      if (idx !== -1) colaEspera.splice(idx, 1);
      convTelf[uid] = { paso: "idle" };
      await sendMsg(uid,
        `✅ Saliste de la cola.\n\nPuedes intentarlo de nuevo cuando quieras.`,
        { reply_markup: tecladoInicio }
      );
      return;
    }

    // Nuevo cliente desde teclado
    if (texto === "📞 Nuevo Cliente") {
      const escort = await esEscort(uid);
      if (escort) {
        await sendMsg(uid, "❌ Eres escort, no puedes registrar clientes.");
        return;
      }
      await intentarTurno(uid, nombre);
      return;
    }

    if (!conv || conv.paso === "idle" || conv.paso === "esperando_confirmacion") return;

    // Borrar mensaje del usuario
    await deleteMsg(uid, msg.message_id);

    // Paso: dígitos
    if (conv.paso === "esperando_digitos") {
      if (!/^\d{4}$/.test(texto)) {
        await sendMsg(uid,
          `⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
          { reply_markup: tecladoCancelar }
        );
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_monto", digitos: texto };
      await sendMsg(uid,
        `📞 *Nuevo Cliente*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${texto}\`\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `💵 ¿Cuánto estimas que pagará?\nElige o escribe el monto:`,
        { reply_markup: tecladoMontos }
      );
      return;
    }

    // Paso: monto escrito manualmente
    if (conv.paso === "esperando_monto") {
      // Puede ser uno de los botones de monto
      const montoBtn = texto.replace("$", "");
      if (/^\d+(\.\d+)?$/.test(montoBtn)) {
        convTelf[uid] = { ...conv, paso: "esperando_descripcion", monto: montoBtn };
        await sendMsg(uid,
          `📞 *Nuevo Cliente*\n` +
          `━━━━━━━━━━━━━━\n` +
          `🔢 Código: \`${conv.digitos}\`\n` +
          `💰 Estimado: *$${montoBtn}*\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `📝 ¿Deseas agregar una descripción?\n_Sin teléfonos ni redes sociales._`,
          { reply_markup: tecladoDescripcion }
        );
        return;
      }
      await sendMsg(uid,
        `⚠️ Ingresa solo el número. Ej: *100*`,
        { reply_markup: tecladoMontos }
      );
      return;
    }

    // Paso: descripción
    if (conv.paso === "esperando_descripcion") {
      if (texto === "➡️ Sin descripción") {
        await publicarEnEscorts(uid, nombre);
        return;
      }
      if (tieneContactoProhibido(texto)) {
        await sendMsg(uid,
          `🚫 *Mensaje bloqueado.*\nNo se permiten teléfonos, usuarios ni redes sociales.\n\nEscribe una descripción sin datos de contacto:`,
          { reply_markup: tecladoDescripcion }
        );
        return;
      }
      convTelf[uid] = { ...conv, descripcion: texto };
      await publicarEnEscorts(uid, nombre);
      return;
    }

    // Paso: esperando confirmacion — acciones tras escort lista
    if (conv.paso === "esperando_confirmacion") {
      if (texto === "✈️ Lo envié, ya va de camino") {
        await sendMsg(uid,
          `✈️ *Cliente en camino.*\n\n🔢 Código: \`${conv.digitos}\`\nEspera el resultado de la escort.`,
          {
            reply_markup: {
              keyboard: [[{ text: "❌ Cancelar servicio" }]],
              resize_keyboard: true,
              persistent: true,
            },
          }
        );
        if (conv.grupMsgId) {
          await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
            `✈️ *CLIENTE EN CAMINO*\n` +
            `━━━━━━━━━━━━━━\n` +
            `🔢 Código: \`${conv.digitos}\`\n` +
            `💰 Estimado: *$${conv.monto}*\n` +
            `🙋 Escort: *${conv.escortNombre}*\n` +
            `━━━━━━━━━━━━━━`,
            { reply_markup: { inline_keyboard: [] } }
          );
        }
        if (conv.escortMsgId) {
          await tPost("sendMessage", {
            chat_id: GRUPO_ESCORTS,
            parse_mode: "Markdown",
            text:
              `✈️ *Cliente en camino*\n` +
              `━━━━━━━━━━━━━━\n` +
              `🔢 Código: \`${conv.digitos}\`\n` +
              `💰 Estimado: *$${conv.monto}*\n` +
              `━━━━━━━━━━━━━━\n` +
              `Actualiza el resultado cuando termines:`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Cliente pagó",     callback_data: `res_pago_${conv.digitos}_${conv.monto}_${uid}`     }],
                [{ text: "🚪 Cliente no pagó",  callback_data: `res_nopago_${conv.digitos}_${conv.monto}_${uid}`   }],
                [{ text: "⚠️ Hubo un problema", callback_data: `res_problema_${conv.digitos}_${conv.monto}_${uid}` }],
              ],
            },
          });
        }
        return;
      }

      if (texto === "🚪 Cliente se fue" || texto === "❌ Cancelar servicio") {
        const esCancel = texto === "❌ Cancelar servicio";
        const textoGrupo = esCancel
          ? `❌ *SERVICIO CANCELADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n━━━━━━━━━━━━━━`
          : `🚪 *CLIENTE SE FUE*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n━━━━━━━━━━━━━━`;

        if (conv.grupMsgId) {
          await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId, textoGrupo,
            { reply_markup: { inline_keyboard: [] } }
          );
        }
        if (conv.escortMsgId) {
          await editMsg(GRUPO_ESCORTS, conv.escortMsgId, textoGrupo,
            { reply_markup: { inline_keyboard: [] } }
          );
        }
        convTelf[uid] = { paso: "idle" };
        await liberarTurno();
        await sendMsg(uid,
          `${esCancel ? "❌ Servicio cancelado." : "🚪 Cliente registrado como ido."}\n\nPuedes registrar un nuevo cliente.`,
          { reply_markup: tecladoInicio }
        );
        return;
      }
    }
    return;
  }

  // ── Grupo Escorts: descripción opcional ──
  if (chatId === GRUPO_ESCORTS) {
    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);
    if (tieneContactoProhibido(texto)) {
      await sendMsg(uid,
        `🚫 *${nombre}*, no se permiten teléfonos ni redes sociales. Intenta de nuevo:`
      );
      return;
    }
    await confirmarEscort(uid, nombre, texto);
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const msgId: number  = query.message.message_id;

  // ── Escort acepta cliente ──
  if (data.startsWith("acepto_")) {
    const escort = await esEscort(uid);
    if (!escort) return answerCB(query.id, "❌ Solo las escorts pueden aceptar.", true);

    const parts   = data.split("_");
    const digitos = parts[1];
    const monto   = parts[2];
    const telfUid = parseInt(parts[3]);

    convEscort[uid] = {
      paso: "esperando_descripcion",
      digitos,
      monto,
      escortMsgId: msgId,
      telfUid,
    };

    await editMsg(GRUPO_ESCORTS, msgId,
      `🟡 *${nombre} está tomando el cliente...*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${digitos}\`\n` +
      `💰 Estimado: *$${monto}*\n` +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await sendMsg(uid,
      `🙋 *Cliente \`${digitos}\` aceptado.*\n\n` +
      `¿Deseas agregar alguna nota para el telefonista?\n_Sin teléfonos ni redes sociales._\n\n` +
      `O presiona el botón para confirmar sin nota:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➡️ Confirmar sin nota", callback_data: `escort_ok_${uid}` }],
          ],
        },
      }
    );

    return answerCB(query.id, "✅ Aceptado. Revisa tu privado con el bot.");
  }

  // ── Escort confirma sin nota ──
  if (data.startsWith("escort_ok_")) {
    await answerCB(query.id);
    await confirmarEscort(uid, nombre, undefined);
    return;
  }

  // ── Resultado final (desde grupo escorts) ──
  const resMatch = data.match(/^res_(pago|nopago|problema)_(\d+)_(\d+)_(\d+)$/);
  if (resMatch) {
    const escort = await esEscort(uid);
    if (!escort) return answerCB(query.id, "❌ Sin permisos.", true);

    const [, resultado, digitos, monto, telfUidStr] = resMatch;
    const telfUid  = parseInt(telfUidStr);
    const telfConv = convTelf[telfUid];

    const textos: Record<string, { grupo: string; privado: string }> = {
      pago: {
        grupo:   `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Monto: *$${monto}*\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        privado: `✅ *¡Servicio completado!*\n🔢 Código: \`${digitos}\`\n💰 Monto: *$${monto}*`,
      },
      nopago: {
        grupo:   `🚪 *CLIENTE NO PAGÓ*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        privado: `🚪 *Cliente no pagó.*\n🔢 Código: \`${digitos}\``,
      },
      problema: {
        grupo:   `⚠️ *HUBO UN PROBLEMA*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        privado: `⚠️ *Hubo un problema.*\n🔢 Código: \`${digitos}\``,
      },
    };

    await editMsg(GRUPO_ESCORTS, msgId, textos[resultado].grupo,
      { reply_markup: { inline_keyboard: [] } }
    );

    if (telfConv?.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId, textos[resultado].grupo,
        { reply_markup: { inline_keyboard: [] } }
      );
    }

    await sendMsg(telfUid,
      `📋 *Panel de Operaciones*\n\n${textos[resultado].privado}\n\nPuedes registrar un nuevo cliente.`,
      { reply_markup: tecladoInicio }
    );

    convTelf[telfUid] = { paso: "idle" };
    await liberarTurno();
    return answerCB(query.id);
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
