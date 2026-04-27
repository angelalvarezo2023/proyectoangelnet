import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -4670796638;
const GRUPO_TELEFONISTAS = -5171466708;

// ──────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────

type PasoTelf =
  | "esperando_digitos"
  | "esperando_monto"
  | "esperando_descripcion_telf"
  | "esperando_confirmacion_envio";

type PasoEscort = "esperando_descripcion_escort";

interface ConvTelf {
  rol: "telefonista";
  paso: PasoTelf;
  digitos?: string;
  monto?: string;
  descripcion?: string;
  msgIdTelf?: number;   // mensaje del bot en grupo telefonistas
  msgIdEscort?: number; // mensaje del bot en grupo escorts
}

interface ConvEscort {
  rol: "escort";
  paso: PasoEscort;
  digitos: string;
  monto: string;
  msgIdEscort: number;
  msgIdTelf: number;
  escortNombre: string;
}

const convTelf:  Record<number, ConvTelf>  = {};
const convEscort: Record<number, ConvEscort> = {};

// Cola: uid del telefonista que tiene el turno activo (solo uno a la vez)
let colaActiva: number | null = null;
const colaEspera: number[] = [];

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function tPost(method: string, body: object) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMsg(chat_id: number, text: string, extra: object = {}) {
  return tPost("sendMessage", { chat_id, text, parse_mode: "Markdown", ...extra });
}

async function editMsg(chat_id: number, message_id: number, text: string, extra: object = {}) {
  return tPost("editMessageText", { chat_id, message_id, text, parse_mode: "Markdown", ...extra });
}

async function deleteMsg(chat_id: number, message_id: number) {
  return tPost("deleteMessage", { chat_id, message_id });
}

async function esEscort(user_id: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${user_id}`);
    const data = await res.json();
    return ["administrator", "creator"].includes(data.result?.status);
  } catch { return false; }
}

// Teclado real de Telegram (botones inferiores)
function teclado(botones: string[][]) {
  return {
    keyboard: botones.map(fila => fila.map(texto => ({ text: texto }))),
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function tecladoOculto() {
  return { remove_keyboard: true };
}

// Filtro de teléfonos, redes sociales y contactos
function tieneContactoProhibido(texto: string): boolean {
  const patrones = [
    /\b\d[\d\s\-().]{6,}\d\b/,                          // números de teléfono
    /@[a-zA-Z0-9_.]+/,                                   // @usuario
    /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i,
    /\b(t\.me|wa\.me|bit\.ly)\b/i,
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,                    // formato xxx-xxx-xxxx
  ];
  return patrones.some(p => p.test(texto));
}

// ──────────────────────────────────────────
// PANEL — comando /panel
// ──────────────────────────────────────────

async function publicarPanel() {
  return tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    text: "📋 *Panel de Operaciones*",
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
      ],
    },
  });
}

// ──────────────────────────────────────────
// COLA DE TURNOS
// ──────────────────────────────────────────

async function intentarTurno(uid: number, nombre: string, msgId: number) {
  if (colaActiva === null) {
    colaActiva = uid;
    await iniciarFlujoTelf(uid, nombre, msgId);
  } else if (colaActiva !== uid && !colaEspera.includes(uid)) {
    colaEspera.push(uid);
    await editMsg(
      GRUPO_TELEFONISTAS, msgId,
      `⏳ *${nombre}*, hay un registro en curso.\n\nEstás en la cola, espera tu turno.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Salir de la cola", callback_data: `salir_cola_${uid}` }]],
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
    // Notificar al siguiente en la cola
    await sendMsg(
      GRUPO_TELEFONISTAS,
      `✅ *Es tu turno.* Presiona el botón para continuar:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📞 Registrar Cliente", callback_data: `turno_${siguiente}` }],
          ],
        },
      }
    );
  }
}

// ──────────────────────────────────────────
// INICIO DEL FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function iniciarFlujoTelf(uid: number, nombre: string, msgId: number) {
  convTelf[uid] = { rol: "telefonista", paso: "esperando_digitos", msgIdTelf: msgId };

  await editMsg(
    GRUPO_TELEFONISTAS, msgId,
    `📞 *Nuevo Cliente* — ${nombre}\n\nEscribe los *4 dígitos* del código del cliente:`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_telf" }]],
      },
    }
  );

  // Teclado real para cancelar
  await sendMsg(GRUPO_TELEFONISTAS, "​", {
    reply_markup: teclado([["❌ Cancelar registro"]]),
  }).then(r => {
    // Borrar ese mensaje auxiliar inmediatamente (solo queremos activar el teclado)
    if (r?.result?.message_id) {
      setTimeout(() => deleteMsg(GRUPO_TELEFONISTAS, r.result.message_id), 500);
    }
  });
}

// ──────────────────────────────────────────
// PUBLICAR CLIENTE EN GRUPO ESCORTS
// ──────────────────────────────────────────

async function publicarEnEscorts(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (!conv) return;

  const desc = conv.descripcion ? `\n📝 Nota: _${conv.descripcion}_` : "";

  // Actualizar mensaje en grupo telefonistas
  await editMsg(
    GRUPO_TELEFONISTAS, conv.msgIdTelf!,
    `⏳ *Esperando escort...*\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${conv.digitos}\`\n` +
    `💰 Estimado: *$${conv.monto}*${desc}\n` +
    `👤 Telefonista: *${nombre}*\n` +
    `━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // Enviar al grupo de escorts
  const r = await tPost("sendMessage", {
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
    paso: "esperando_confirmacion_envio",
    msgIdEscort: r?.result?.message_id,
  };
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const uid: number    = msg.from.id;
  const texto: string  = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const nombre: string = msg.from.first_name;

  // ── /panel solo en grupo telefonistas (solo admins/escorts) ──
  if (texto === "/panel" && chatId === GRUPO_TELEFONISTAS) {
    const escort = await esEscort(uid);
    if (escort) {
      await deleteMsg(GRUPO_TELEFONISTAS, msg.message_id);
      await publicarPanel();
    }
    return;
  }

  // ── Grupo Telefonistas: flujo activo ──
  if (chatId === GRUPO_TELEFONISTAS) {
    const conv = convTelf[uid];
    if (!conv) return;

    // Borrar mensaje del usuario para mantener limpio
    await deleteMsg(GRUPO_TELEFONISTAS, msg.message_id);

    // Cancelar con teclado real
    if (texto === "❌ Cancelar registro") {
      await cancelarTelf(uid, nombre, conv.msgIdTelf!);
      return;
    }

    // Paso: esperando dígitos
    if (conv.paso === "esperando_digitos") {
      if (!/^\d{4}$/.test(texto)) {
        await editMsg(
          GRUPO_TELEFONISTAS, conv.msgIdTelf!,
          `⚠️ *${nombre}*, deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
          { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_telf" }]] } }
        );
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_monto", digitos: texto };
      await editMsg(
        GRUPO_TELEFONISTAS, conv.msgIdTelf!,
        `📞 *Nuevo Cliente* — ${nombre}\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${texto}\`\n\n` +
        `💵 ¿Cuánto estimas que pagará?\nElige o escribe el monto:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "$50",  callback_data: `monto_50_${uid}`  },
                { text: "$100", callback_data: `monto_100_${uid}` },
                { text: "$150", callback_data: `monto_150_${uid}` },
                { text: "$200", callback_data: `monto_200_${uid}` },
              ],
              [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
            ],
          },
        }
      );
      return;
    }

    // Paso: esperando monto escrito
    if (conv.paso === "esperando_monto") {
      if (!/^\d+(\.\d+)?$/.test(texto)) {
        await editMsg(GRUPO_TELEFONISTAS, conv.msgIdTelf!, `⚠️ Ingresa solo el número. Ej: *100*`);
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_descripcion_telf", monto: texto };
      await editMsg(
        GRUPO_TELEFONISTAS, conv.msgIdTelf!,
        `📞 *Nuevo Cliente* — ${nombre}\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${conv.digitos}\`\n` +
        `💰 Estimado: *$${texto}*\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `📝 ¿Deseas agregar una descripción?\n_Sin teléfonos ni redes sociales._`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➡️ Omitir descripción", callback_data: `omitir_desc_telf_${uid}` }],
              [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
            ],
          },
        }
      );
      return;
    }

    // Paso: esperando descripción
    if (conv.paso === "esperando_descripcion_telf") {
      if (tieneContactoProhibido(texto)) {
        await editMsg(
          GRUPO_TELEFONISTAS, conv.msgIdTelf!,
          `🚫 *Mensaje bloqueado.*\nNo se permiten teléfonos, usuarios ni redes sociales.\n\nEscribe una descripción sin datos de contacto:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "➡️ Omitir descripción", callback_data: `omitir_desc_telf_${uid}` }],
                [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
              ],
            },
          }
        );
        return;
      }
      convTelf[uid] = { ...conv, descripcion: texto };
      await publicarEnEscorts(uid, nombre);
      return;
    }

    return;
  }

  // ── Grupo Escorts: descripción opcional ──
  if (chatId === GRUPO_ESCORTS) {
    const conv = convEscort[uid];
    if (!conv || conv.paso !== "esperando_descripcion_escort") return;

    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

    if (tieneContactoProhibido(texto)) {
      await sendMsg(GRUPO_ESCORTS,
        `🚫 *${nombre}*, no se permiten teléfonos ni redes sociales en la descripción.`,
        { reply_markup: teclado([["➡️ Omitir descripción", "❌ Cancelar"]]) }
      );
      return;
    }

    await confirmarEscort(uid, nombre, texto);
  }
}

// ──────────────────────────────────────────
// CANCELAR FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function cancelarTelf(uid: number, nombre: string, msgId: number) {
  delete convTelf[uid];
  await liberarTurno();
  await editMsg(
    GRUPO_TELEFONISTAS, msgId,
    `❌ *Registro cancelado* por ${nombre}.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }],
        ],
      },
    }
  );
  await sendMsg(GRUPO_TELEFONISTAS, "​", { reply_markup: tecladoOculto() })
    .then(r => { if (r?.result?.message_id) deleteMsg(GRUPO_TELEFONISTAS, r.result.message_id); });
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT ACEPTA (con o sin descripción)
// ──────────────────────────────────────────

async function confirmarEscort(uid: number, nombre: string, descripcion?: string) {
  const conv = convEscort[uid];
  if (!conv) return;

  const desc = descripcion ? `\n📝 Nota escort: _${descripcion}_` : "";

  // Actualizar mensaje en grupo escorts
  await editMsg(
    GRUPO_ESCORTS, conv.msgIdEscort,
    `🟡 *EN PROCESO*\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${conv.digitos}\`\n` +
    `💰 Estimado: *$${conv.monto}*${desc}\n` +
    `🙋 Escort: *${nombre}*\n` +
    `━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // Notificar al grupo de telefonistas con botones de acción
  const r = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text:
      `✅ *Escort lista*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*\n` +
      `🙋 Escort: *${nombre}*${desc}\n` +
      `━━━━━━━━━━━━━━\n` +
      `¿Qué hago?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "✈️ Lo envié, ya va de camino", callback_data: `enviado_${conv.digitos}_${conv.monto}_${uid}` }],
        [{ text: "🚪 Cliente se fue",            callback_data: `cliente_fue_${conv.digitos}_${conv.monto}_${uid}` }],
        [{ text: "❌ Cancelar servicio",          callback_data: `cancelar_serv_${conv.digitos}_${conv.monto}_${uid}` }],
      ],
    },
  });

  // Guardar msgId del mensaje en telefonistas para editarlo después
  convEscort[uid] = { ...conv, msgIdTelf: r?.result?.message_id };

  // Ocultar teclado real en escorts
  await sendMsg(GRUPO_ESCORTS, "​", { reply_markup: tecladoOculto() })
    .then(r2 => { if (r2?.result?.message_id) deleteMsg(GRUPO_ESCORTS, r2.result.message_id); });

  delete convEscort[uid];
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

  // ── Inicio nuevo cliente ──
  if (data === "inicio_nuevo_cliente") {
    const escort = await esEscort(uid);
    if (escort) {
      return tPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Eres escort, no puedes registrar clientes.",
        show_alert: true,
      });
    }
    await tPost("answerCallbackQuery", { callback_query_id: query.id });
    await intentarTurno(uid, nombre, msgId);
    return;
  }

  // ── Turno disponible (siguiente en cola) ──
  if (data.startsWith("turno_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) {
      return tPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Este turno no es tuyo.",
        show_alert: true,
      });
    }
    await tPost("answerCallbackQuery", { callback_query_id: query.id });
    await iniciarFlujoTelf(uid, nombre, msgId);
    return;
  }

  // ── Salir de la cola ──
  if (data.startsWith("salir_cola_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return tPost("answerCallbackQuery", { callback_query_id: query.id });
    const idx = colaEspera.indexOf(uid);
    if (idx !== -1) colaEspera.splice(idx, 1);
    delete convTelf[uid];
    await editMsg(GRUPO_TELEFONISTAS, msgId, `✅ *${nombre}* salió de la cola.`, {
      reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "inicio_nuevo_cliente" }]] },
    });
    return tPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Monto rápido ──
  if (data.startsWith("monto_")) {
    const parts   = data.split("_");
    const monto   = parts[1];
    const ownerId = parseInt(parts[2]);
    if (uid !== ownerId) {
      return tPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo quien inició puede completar este registro.",
        show_alert: true,
      });
    }
    const conv = convTelf[uid];
    if (conv?.paso === "esperando_monto") {
      convTelf[uid] = { ...conv, paso: "esperando_descripcion_telf", monto };
      await editMsg(
        GRUPO_TELEFONISTAS, conv.msgIdTelf!,
        `📞 *Nuevo Cliente* — ${nombre}\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${conv.digitos}\`\n` +
        `💰 Estimado: *$${monto}*\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `📝 ¿Deseas agregar una descripción?\n_Sin teléfonos ni redes sociales._`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➡️ Omitir descripción", callback_data: `omitir_desc_telf_${uid}` }],
              [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
            ],
          },
        }
      );
    }
    return tPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Omitir descripción telefonista ──
  if (data.startsWith("omitir_desc_telf_")) {
    const ownerId = parseInt(data.split("_")[3]);
    if (uid !== ownerId) return tPost("answerCallbackQuery", { callback_query_id: query.id });
    await tPost("answerCallbackQuery", { callback_query_id: query.id });
    await publicarEnEscorts(uid, nombre);
    return;
  }

  // ── Cancelar telefonista ──
  if (data === "cancelar_telf") {
    const conv = convTelf[uid];
    await tPost("answerCallbackQuery", { callback_query_id: query.id });
    await cancelarTelf(uid, nombre, conv?.msgIdTelf ?? msgId);
    return;
  }

  // ── Escort acepta cliente ──
  if (data.startsWith("acepto_")) {
    const escort = await esEscort(uid);
    if (!escort) {
      return tPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Solo las escorts pueden aceptar.",
        show_alert: true,
      });
    }

    const parts    = data.split("_");
    const digitos  = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);

    convEscort[uid] = {
      rol: "escort",
      paso: "esperando_descripcion_escort",
      digitos,
      monto,
      msgIdEscort: msgId,
      msgIdTelf: 0,
      escortNombre: nombre,
    };

    // Editar mensaje en escorts para bloquear doble aceptación
    await editMsg(
      GRUPO_ESCORTS, msgId,
      `🟡 *${nombre} está tomando el cliente...*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${digitos}\`\n` +
      `💰 Estimado: *$${monto}*\n` +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );

    // Pedir descripción opcional con teclado real
    await sendMsg(
      GRUPO_ESCORTS,
      `🙋 *${nombre}*, ¿deseas agregar alguna nota para el telefonista?\n_Sin teléfonos ni redes sociales._`,
      { reply_markup: teclado([["➡️ Omitir descripción", "❌ Cancelar"]]) }
    );

    return tPost("answerCallbackQuery", { callback_query_id: query.id });
  }

  // ── Omitir descripción escort (teclado real) — manejado en handleMessage ──
  // ── pero también puede venir como texto "➡️ Omitir descripción" ──

  // ── Telefonista: Lo envié / Cliente se fue / Cancelar servicio ──
  const accionMatch = data.match(/^(enviado|cliente_fue|cancelar_serv)_(\d+)_(\d+)_(\d+)$/);
  if (accionMatch) {
    const [, accion, digitos, monto, escortUidStr] = accionMatch;

    await tPost("answerCallbackQuery", { callback_query_id: query.id });

    const mensajesEscorts: Record<string, string> = {
      enviado:
        `✈️ *CLIENTE EN CAMINO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `💰 Estimado: *$${monto}*\n` +
        `━━━━━━━━━━━━━━\n` +
        `Actualiza el estado cuando termines:`,
      cliente_fue:
        `🚪 *CLIENTE SE FUE*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `━━━━━━━━━━━━━━`,
      cancelar_serv:
        `❌ *SERVICIO CANCELADO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${digitos}\`\n` +
        `━━━━━━━━━━━━━━`,
    };

    const mensajesTelf: Record<string, string> = {
      enviado:       `✈️ *Cliente \`${digitos}\` en camino.* Espera el resultado de la escort.`,
      cliente_fue:   `🚪 *Cliente \`${digitos}\` se fue.* Servicio cerrado.`,
      cancelar_serv: `❌ *Servicio \`${digitos}\` cancelado.*`,
    };

    // Actualizar mensaje en grupo telefonistas
    await editMsg(GRUPO_TELEFONISTAS, msgId, mensajesTelf[accion], {
      reply_markup: { inline_keyboard: [] },
    });

    if (accion === "enviado") {
      // Enviar al grupo escorts con botones de resultado final
      await tPost("sendMessage", {
        chat_id: GRUPO_ESCORTS,
        parse_mode: "Markdown",
        text: mensajesEscorts[accion],
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Cliente pagó",      callback_data: `resultado_pago_${digitos}_${monto}`      }],
            [{ text: "🚪 Cliente no pagó",   callback_data: `resultado_nopago_${digitos}_${monto}`    }],
            [{ text: "⚠️ Hubo un problema", callback_data: `resultado_problema_${digitos}_${monto}`  }],
          ],
        },
      });
    } else {
      // Cerrar en escorts también
      await sendMsg(GRUPO_ESCORTS, mensajesEscorts[accion]);
      await liberarTurno();
    }

    // Limpiar flujo
    delete convTelf[uid];
    if (accion !== "enviado") await liberarTurno();
    return;
  }

  // ── Resultado final (desde grupo escorts) ──
  const resultadoMatch = data.match(/^resultado_(pago|nopago|problema)_(\d+)_(\d+)$/);
  if (resultadoMatch) {
    const escort = await esEscort(uid);
    if (!escort) {
      return tPost("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "❌ Sin permisos.",
        show_alert: true,
      });
    }

    const [, resultado, digitos, monto] = resultadoMatch;

    const textos: Record<string, { escorts: string; telf: string }> = {
      pago: {
        escorts: `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Monto: *$${monto}*\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        telf:    `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Monto: *$${monto}*\n━━━━━━━━━━━━━━`,
      },
      nopago: {
        escorts: `🚪 *CLIENTE NO PAGÓ*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        telf:    `🚪 *CLIENTE NO PAGÓ*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n━━━━━━━━━━━━━━`,
      },
      problema: {
        escorts: `⚠️ *HUBO UN PROBLEMA*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${nombre}*\n━━━━━━━━━━━━━━`,
        telf:    `⚠️ *HUBO UN PROBLEMA*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n━━━━━━━━━━━━━━`,
      },
    };

    // Actualizar en escorts
    await editMsg(GRUPO_ESCORTS, msgId, textos[resultado].escorts, {
      reply_markup: { inline_keyboard: [] },
    });

    // Notificar en telefonistas
    await sendMsg(GRUPO_TELEFONISTAS, textos[resultado].telf);

    await liberarTurno();
    return tPost("answerCallbackQuery", { callback_query_id: query.id });
  }
}

// ──────────────────────────────────────────
// MANEJAR TECLADO REAL DE ESCORTS
// (➡️ Omitir descripción / ❌ Cancelar)
// ──────────────────────────────────────────

async function handleEscortTeclado(msg: any) {
  const uid: number    = msg.from.id;
  const texto: string  = msg.text?.trim() ?? "";
  const nombre: string = msg.from.first_name;
  const conv           = convEscort[uid];

  if (!conv || conv.paso !== "esperando_descripcion_escort") return;

  await deleteMsg(GRUPO_ESCORTS, msg.message_id);

  if (texto === "➡️ Omitir descripción") {
    await confirmarEscort(uid, nombre, undefined);
    return;
  }

  if (texto === "❌ Cancelar") {
    delete convEscort[uid];
    // Restaurar mensaje en escorts
    await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text:
        `🔔 *CLIENTE ABAJO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔢 Código: \`${conv.digitos}\`\n` +
        `💰 Estimado: *$${conv.monto}*\n` +
        `━━━━━━━━━━━━━━\n` +
        `¿Quién va?`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🙋 Estoy lista, mándalo", callback_data: `acepto_${conv.digitos}_${conv.monto}_0` }],
        ],
      },
    });
    await sendMsg(GRUPO_ESCORTS, "​", { reply_markup: tecladoOculto() })
      .then(r => { if (r?.result?.message_id) deleteMsg(GRUPO_ESCORTS, r.result.message_id); });
  }
}

// ──────────────────────────────────────────
// ROUTE HANDLER
// ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message) {
      const msg    = body.message;
      const chatId = msg.chat?.id;
      const texto  = msg.text?.trim() ?? "";

      // Teclado real de escorts
      if (chatId === GRUPO_ESCORTS &&
          (texto === "➡️ Omitir descripción" || texto === "❌ Cancelar")) {
        await handleEscortTeclado(msg);
      } else {
        await handleMessage(msg);
      }
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }
  } catch (err) {
    console.error("Bot error:", err);
  }
  return NextResponse.json({ ok: true });
}
