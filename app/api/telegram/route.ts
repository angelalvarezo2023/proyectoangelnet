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
  | "esperando_respuesta_escort"  // escort aceptó, telf decide qué hacer
  | "cliente_enviado";            // telf confirmó envío, esperando resultado escort

type PasoEscort =
  | "esperando_nota"
  | "esperando_monto_real"
  | "esperando_tiempo_personalizado"
  | "cliente_en_camino";         // escort espera al cliente

interface ConvTelf {
  paso: PasoTelf;
  nombre?: string;
  digitos?: string;
  monto?: string;
  descripcion?: string;
  grupMsgId?: number;       // msg en grupo telefonistas
  escortAcceptMsgId?: number; // msg en grupo escorts donde escort aceptó
  escortUid?: number;
  escortNombre?: string;
  ultimaPreguntaLlegó?: number; // timestamp último "¿llegó?"
}

interface ConvEscort {
  paso: PasoEscort;
  digitos?: string;
  monto?: string;
  escortMsgId?: number;
  telfUid?: number;
  nota?: string;
}

interface EstadoEscort {
  uid: number;
  nombre: string;
  libre: boolean;
  ocupadaHasta?: number;
  ocupadaTexto?: string;
  panelMsgId?: number; // msg del panel de estado en grupo escorts
}

const convTelf:   Record<number, ConvTelf>   = {};
const convEscort: Record<number, ConvEscort> = {};
const comisiones: Record<number, number>     = {};

// Escorts registradas automáticamente
const escorts: Record<number, EstadoEscort> = {};

// Telefonistas registrados: uid → nombre
const telefonistas: Record<number, string> = {};

// Cola de turnos
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
  return tPost("deleteMessage", { chat_id, message_id }).catch(() => {});
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
    return ["administrator", "creator", "member"].includes(data.result?.status);
  } catch { return false; }
}

async function esMiembroTelf(user_id: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_TELEFONISTAS}&user_id=${user_id}`);
    const data = await res.json();
    return ["member", "administrator", "creator"].includes(data.result?.status);
  } catch { return false; }
}

function tieneContacto(texto: string): boolean {
  return [
    /\b\d[\d\s\-().]{6,}\d\b/,
    /@[a-zA-Z0-9_.]+/,
    /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i,
    /\b(t\.me|wa\.me|bit\.ly)\b/i,
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,
  ].some(p => p.test(texto));
}

function p(nombre: string): string {
  return (nombre ?? "").split(" ")[0];
}

function calcularComision(monto: number): number {
  if (monto === 100) return 15;
  if (monto === 150) return 25;
  if (monto === 200) return 30;
  return Math.round(monto * 0.15);
}

// ──────────────────────────────────────────
// COLA — texto para telefonistas
// ──────────────────────────────────────────

function textoCola(): string {
  if (colaActiva === null) return "_No hay nadie en turno._";
  const activoNombre = p(telefonistas[colaActiva] ?? "Telefonista");
  let texto = `🎯 *Turno actual:* ${activoNombre}`;
  if (colaEspera.length > 0) {
    const espera = colaEspera.map((uid, i) => `${i + 1}. ${p(telefonistas[uid] ?? "?")}`).join("\n");
    texto += `\n⏳ *En espera:*\n${espera}`;
  }
  return texto;
}

// ──────────────────────────────────────────
// ESCORTS — texto de estado
// ──────────────────────────────────────────

function textoEscorts(): string {
  const lista = Object.values(escorts);
  if (lista.length === 0) return "_Sin escorts registradas._";
  const ahora = Date.now();
  for (const e of lista) {
    if (!e.libre && e.ocupadaHasta && ahora >= e.ocupadaHasta) {
      e.libre = true;
      e.ocupadaHasta = undefined;
      e.ocupadaTexto = undefined;
    }
  }
  return lista.map(e =>
    e.libre
      ? `🟢 *${p(e.nombre)}* — Libre`
      : `🔴 *${p(e.nombre)}* — Ocupada (${e.ocupadaTexto ?? ""})`
  ).join("\n");
}

// Notificar a todos los telefonistas con estado actualizado
async function notificarTelefonistas(mensaje: string) {
  for (const [uidStr, nombre] of Object.entries(telefonistas)) {
    const uid = parseInt(uidStr);
    try {
      await sendMsg(uid, mensaje);
    } catch {}
  }
}

// ──────────────────────────────────────────
// TECLADOS
// ──────────────────────────────────────────

const tecladoInicio = {
  keyboard: [[{ text: "📞 Nuevo Cliente" }]],
  resize_keyboard: true, persistent: true,
};
const tecladoCancelar = {
  keyboard: [[{ text: "❌ Cancelar registro" }]],
  resize_keyboard: true, persistent: true,
};
const tecladoMontos = {
  keyboard: [
    [{ text: "$50" }, { text: "$100" }, { text: "$150" }, { text: "$200" }],
    [{ text: "❌ Cancelar registro" }],
  ],
  resize_keyboard: true, persistent: true,
};
const tecladoDescripcion = {
  keyboard: [[{ text: "➡️ Sin descripción" }], [{ text: "❌ Cancelar registro" }]],
  resize_keyboard: true, persistent: true,
};

// ──────────────────────────────────────────
// PANEL ESCORTS en grupo escorts
// ──────────────────────────────────────────

async function publicarPanelEscorts() {
  const lista = Object.values(escorts);
  if (lista.length === 0) {
    await sendMsg(GRUPO_ESCORTS, "📋 *Panel de Escorts*\n\n_No hay escorts registradas aún._");
    return;
  }
  for (const escort of lista) {
    const esLibre = escort.libre;
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: esLibre
        ? `👤 *${p(escort.nombre)}*\n🟢 Libre`
        : `👤 *${p(escort.nombre)}*\n🔴 Ocupada (${escort.ocupadaTexto ?? ""})`,
      reply_markup: {
        inline_keyboard: esLibre
          ? [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${escort.uid}` }]]
          : [[{ text: "🟢 Estoy Libre", callback_data: `libre_${escort.uid}` }]],
      },
    });
    escorts[escort.uid].panelMsgId = r?.result?.message_id;
  }
}

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
      `⏳ *Hay un registro en curso.*\n\n${textoCola()}\n\nEstás en la posición *#${pos}*.\nTe avisaré cuando sea tu turno.`,
      { reply_markup: { keyboard: [[{ text: "❌ Salir de la cola" }]], resize_keyboard: true, persistent: true } }
    );
  }
}

async function liberarTurno() {
  const anteriorUid = colaActiva;
  colaActiva = null;

  if (colaEspera.length > 0) {
    const siguiente = colaEspera.shift()!;
    colaActiva = siguiente;
    await sendMsg(siguiente,
      `✅ *¡Es tu turno!*\n\n${textoCola()}\n\nPresiona el botón para registrar tu cliente.`,
      { reply_markup: tecladoInicio }
    );
    // Notificar a los demás en cola
    for (let i = 0; i < colaEspera.length; i++) {
      const uid = colaEspera[i];
      await sendMsg(uid,
        `🔄 *Actualización de cola:*\n\n${textoCola()}\n\nAhora estás en la posición *#${i + 1}*`
      ).catch(() => {});
    }
  }
}

// ──────────────────────────────────────────
// FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function iniciarFlujo(uid: number, nombre: string) {
  convTelf[uid] = { ...convTelf[uid], paso: "esperando_digitos", nombre };
  await sendMsg(uid,
    `📞 *Nuevo Cliente*\n\n${textoCola()}\n\nEscribe los *4 dígitos* del código del cliente:`,
    { reply_markup: tecladoCancelar }
  );
}

async function cancelarTelf(uid: number) {
  const conv = convTelf[uid];
  if (conv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
      `❌ *Registro cancelado*\n🔢 Código: \`${conv.digitos ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    );
  }
  if (conv?.escortAcceptMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortAcceptMsgId,
      `❌ *Servicio cancelado por el telefonista.*\n🔢 Código: \`${conv.digitos ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    );
  }
  // Marcar escort como libre si estaba en proceso
  if (conv?.escortUid && escorts[conv.escortUid]) {
    escorts[conv.escortUid].libre = true;
    await notificarTelefonistas(
      `🔄 *Estado de escorts:*\n\n${textoEscorts()}`
    );
  }
  convTelf[uid] = { paso: "idle", nombre: conv?.nombre };
  await liberarTurno();
  await sendMsg(uid,
    `❌ *Registro cancelado.*\n\n👥 *Escorts:*\n${textoEscorts()}\n\nPuedes registrar un nuevo cliente.`,
    { reply_markup: tecladoInicio }
  );
}

async function publicarEnEscorts(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (!conv) return;

  const desc = conv.descripcion ? `\n📝 _${conv.descripcion}_` : "";

  // Mensaje en grupo telefonistas (solo estado)
  const gMsg = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text: `📲 *${p(nombre)}* está buscando escort para el cliente \`${conv.digitos}\`...`,
  });

  // Mensaje en grupo escorts
  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE ABAJO*\n━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `📲 De: *${p(nombre)}*\n━━━━━━━━━━━━━━\n¿Quién va?`,
    reply_markup: {
      inline_keyboard: [[
        { text: "🙋 Estoy lista, mándalo", callback_data: `acepto_${conv.digitos}_${conv.monto}_${uid}` }
      ]],
    },
  });

  convTelf[uid] = {
    ...conv,
    paso: "esperando_respuesta_escort",
    grupMsgId:        gMsg?.result?.message_id,
    escortAcceptMsgId: eMsg?.result?.message_id,
  };

  await sendMsg(uid,
    `⏳ *Esperando que una escort acepte...*\n\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*${desc}\n\n${textoEscorts()}`,
    { reply_markup: { keyboard: [[{ text: "❌ Cancelar servicio" }]], resize_keyboard: true, persistent: true } }
  );
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const uid: number    = msg.from?.id;
  const texto: string  = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const nombre: string = msg.from?.first_name ?? "";

  if (!uid) return;

  // ── Alguien sale del grupo escorts ──
  if (chatId === GRUPO_ESCORTS && msg.left_chat_member) {
    const leftUid = msg.left_chat_member.id;
    if (escorts[leftUid]) {
      delete escorts[leftUid];
      await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    }
    return;
  }

  // ── Alguien sale del grupo telefonistas ──
  if (chatId === GRUPO_TELEFONISTAS && msg.left_chat_member) {
    const leftUid = msg.left_chat_member.id;
    if (telefonistas[leftUid]) {
      delete telefonistas[leftUid];
      // Limpiar de la cola si estaba
      const idx = colaEspera.indexOf(leftUid);
      if (idx !== -1) colaEspera.splice(idx, 1);
      if (colaActiva === leftUid) await liberarTurno();
    }
    return;
  }

  // ── /panel en grupo escorts ──
  if (texto === "/panel" && chatId === GRUPO_ESCORTS) {
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);
    await publicarPanelEscorts();
    return;
  }

  // ── Registro automático de escorts: cualquier mensaje en el grupo escorts ──
  if (chatId === GRUPO_ESCORTS && !msg.left_chat_member) {
    if (!escorts[uid]) {
      escorts[uid] = { uid, nombre, libre: true };
      // Notificar a telefonistas del nuevo registro
      await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    }

    const conv = convEscort[uid];
    if (!conv) return;

    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

    // Esperando nota
    if (conv.paso === "esperando_nota") {
      if (tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS, `🚫 *${p(nombre)}*, no se permiten teléfonos ni redes sociales.`,
          { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escort_ok_${uid}` }]] } }
        );
        return;
      }
      convEscort[uid] = { ...conv, nota: texto };
      await confirmarEscort(uid, nombre);
      return;
    }

    // Esperando tiempo personalizado
    if (conv.paso === "esperando_tiempo_personalizado") {
      const minutos = parseInt(texto);
      if (isNaN(minutos) || minutos <= 0) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ Escribe solo los minutos. Ej: *45*`);
        return;
      }
      escorts[uid] = {
        ...escorts[uid],
        libre: false,
        ocupadaHasta: Date.now() + minutos * 60 * 1000,
        ocupadaTexto: `${minutos} min`,
      };
      delete convEscort[uid];
      const panelMsgId = escorts[uid]?.panelMsgId;
      if (panelMsgId) {
        await editMsg(GRUPO_ESCORTS, panelMsgId,
          `👤 *${p(nombre)}*\n🔴 Ocupada (${minutos} min)`,
          { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy Libre", callback_data: `libre_${uid}` }]] } }
        );
      }
      await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
      return;
    }

    // Esperando monto real
    if (conv.paso === "esperando_monto_real") {
      const montoLimpio = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(montoLimpio)) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ *${p(nombre)}*, ingresa solo el número. Ej: *120*`);
        return;
      }
      delete convEscort[uid];
      await procesarPago(nombre, conv.telfUid!, conv.digitos!, parseFloat(montoLimpio), conv.escortMsgId!);
      return;
    }

    // Escort confirmó llegada — esperando monto
    if (conv.paso === "cliente_en_camino") {
      const montoLimpio = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(montoLimpio)) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ Ingresa el monto. Ej: *100*`);
        return;
      }
      delete convEscort[uid];
      await procesarPago(nombre, conv.telfUid!, conv.digitos!, parseFloat(montoLimpio), conv.escortMsgId!);
      return;
    }

    return;
  }

  // ── /start en privado ──
  if (texto === "/start" && chatId === uid) {
    const escort = await esEscort(uid);
    if (escort) {
      await sendMsg(uid, `👋 *Bienvenida ${p(nombre)}.*\nTu panel está en el grupo de escorts.`);
      return;
    }
    const esTelf = await esMiembroTelf(uid);
    if (!esTelf) {
      await sendMsg(uid, "❌ No tienes acceso.");
      return;
    }
    telefonistas[uid] = nombre;
    convTelf[uid] = { paso: "idle", nombre };
    await sendMsg(uid,
      `👋 *Bienvenido, ${p(nombre)}.*\n\n👥 *Escorts:*\n${textoEscorts()}\n\n${textoCola()}\n\nUsa el botón para registrar un cliente.`,
      { reply_markup: tecladoInicio }
    );
    return;
  }

  // ── Mensajes en privado del telefonista ──
  if (chatId === uid) {
    const conv = convTelf[uid];

    if (texto === "❌ Cancelar registro" || texto === "❌ Cancelar servicio") {
      await cancelarTelf(uid); return;
    }
    if (texto === "❌ Salir de la cola") {
      const idx = colaEspera.indexOf(uid);
      if (idx !== -1) colaEspera.splice(idx, 1);
      convTelf[uid] = { paso: "idle", nombre };
      await sendMsg(uid, `✅ Saliste de la cola.\n\n${textoCola()}`, { reply_markup: tecladoInicio });
      return;
    }
    if (texto === "📞 Nuevo Cliente") {
      if (await esEscort(uid)) { await sendMsg(uid, "❌ Eres escort."); return; }
      await intentarTurno(uid, nombre); return;
    }
    if (texto === "📍 ¿Llegó?") {
      const ahora = Date.now();
      if (conv?.ultimaPreguntaLlegó && ahora - conv.ultimaPreguntaLlegó < 60000) {
        const segs = Math.ceil((60000 - (ahora - conv.ultimaPreguntaLlegó)) / 1000);
        await sendMsg(uid, `⏱ Espera *${segs} segundos* antes de preguntar de nuevo.`);
        return;
      }
      if (!conv?.escortUid) return;
      convTelf[uid] = { ...conv, ultimaPreguntaLlegó: ahora };
      // Notificar a la escort en el grupo
      await sendMsg(GRUPO_ESCORTS,
        `📍 *${p(conv.escortNombre ?? "Telefonista")}*, el telefonista pregunta: ¿ya llegó el cliente \`${conv.digitos}\`?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Sí, llegó", callback_data: `llego_${conv.digitos}_${conv.monto}_${uid}_${conv.escortUid}` }],
              [{ text: "🚪 No llegó / Se fue", callback_data: `nollego_${conv.digitos}_${conv.monto}_${uid}_${conv.escortUid}` }],
            ],
          },
        }
      );
      await sendMsg(uid, `✅ Pregunta enviada a la escort. Espera su respuesta.`);
      return;
    }

    if (!conv || conv.paso === "idle") return;

    await deleteMsg(uid, msg.message_id);

    if (conv.paso === "esperando_digitos") {
      if (!/^\d{4}$/.test(texto)) {
        await sendMsg(uid, `⚠️ Deben ser *4 dígitos*. Intenta de nuevo:`, { reply_markup: tecladoCancelar });
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_monto", digitos: texto };
      await sendMsg(uid,
        `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n🔢 Código: \`${texto}\`\n━━━━━━━━━━━━━━\n\n💵 ¿Cuánto estimas que pagará?`,
        { reply_markup: tecladoMontos }
      );
      return;
    }

    if (conv.paso === "esperando_monto") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) {
        await sendMsg(uid, `⚠️ Ingresa solo el número.`, { reply_markup: tecladoMontos });
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_descripcion", monto: ml };
      await sendMsg(uid,
        `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${ml}*\n━━━━━━━━━━━━━━\n\n📝 ¿Deseas agregar una descripción?\n_Sin teléfonos ni redes sociales._`,
        { reply_markup: tecladoDescripcion }
      );
      return;
    }

    if (conv.paso === "esperando_descripcion") {
      if (texto === "➡️ Sin descripción") { await publicarEnEscorts(uid, nombre); return; }
      if (tieneContacto(texto)) {
        await sendMsg(uid, `🚫 No se permiten teléfonos ni redes sociales.`, { reply_markup: tecladoDescripcion });
        return;
      }
      convTelf[uid] = { ...conv, descripcion: texto };
      await publicarEnEscorts(uid, nombre); return;
    }

    return;
  }
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT (en grupo escorts)
// ──────────────────────────────────────────

async function confirmarEscort(uid: number, nombre: string) {
  const conv = convEscort[uid];
  if (!conv) return;

  const nota     = conv.nota ? `\n📝 _${conv.nota}_` : "";
  const telfConv = convTelf[conv.telfUid!];

  // Marcar escort como ocupada
  if (escorts[uid]) escorts[uid].libre = false;

  // Actualizar mensaje en escorts
  await editMsg(GRUPO_ESCORTS, conv.escortMsgId!,
    `🟡 *EN PROCESO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n🙋 Escort: *${p(nombre)}*${nota}\n━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // Actualizar grupo telefonistas
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `✅ *${p(telfConv.nombre ?? "")}* — Escort aceptó el cliente \`${conv.digitos}\``,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  // Notificar telefonista en privado con botones de acción
  await sendMsg(conv.telfUid!,
    `✅ *¡${p(nombre)} aceptó!*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*${nota}\n━━━━━━━━━━━━━━\n\n¿Qué hago?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: "✈️ Lo envié, ya va de camino" }],
          [{ text: "🚪 Cliente se fue" }],
          [{ text: "❌ Cancelar servicio" }],
        ],
        resize_keyboard: true, persistent: true,
      },
    }
  );

  convTelf[conv.telfUid!] = {
    ...telfConv,
    paso: "esperando_respuesta_escort",
    escortUid: uid,
    escortNombre: nombre,
  };

  // Notificar cambio de estado de escorts
  await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);

  delete convEscort[uid];
}

// ──────────────────────────────────────────
// PROCESAR PAGO FINAL
// ──────────────────────────────────────────

async function procesarPago(
  escortNombre: string,
  telfUid: number,
  digitos: string,
  montoReal: number,
  escortMsgId: number
) {
  const telfConv   = convTelf[telfUid];
  const comision   = calcularComision(montoReal);
  comisiones[telfUid] = (comisiones[telfUid] ?? 0) + comision;
  const total = comisiones[telfUid];

  // Actualizar escorts
  await editMsg(GRUPO_ESCORTS, escortMsgId,
    `✅ *COMPLETADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Pagó: *$${montoReal}*\n🙋 Escort: *${p(escortNombre)}*\n━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // Marcar escort libre
  const escortUid = telfConv?.escortUid;
  if (escortUid && escorts[escortUid]) {
    escorts[escortUid].libre = true;
  }

  // Grupo telefonistas — solo estado general
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `✅ *Servicio completado* — Código \`${digitos}\`\n💰 $${montoReal}`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  // Privado telefonista — detalles completos
  await sendMsg(telfUid,
    `✅ *¡Servicio completado!*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Pagó: *$${montoReal}*\n💵 Tu comisión: *+$${comision}*\n📊 Total acumulado: *$${total}*\n━━━━━━━━━━━━━━\n\n👥 *Escorts:*\n${textoEscorts()}`,
    { reply_markup: tecladoInicio }
  );

  convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre };
  await liberarTurno();
  await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const msgId: number  = query.message.message_id;
  const chatId: number = query.message.chat.id;

  // ── Escort se pone ocupada ──
  if (data.startsWith("ocupada_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${p(nombre)}*\n🔴 ¿Cuánto tiempo estarás ocupada?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "5 min",  callback_data: `t_5_${uid}`  },
              { text: "30 min", callback_data: `t_30_${uid}` },
              { text: "1 hora", callback_data: `t_60_${uid}` },
            ],
            [{ text: "⏱ Otro", callback_data: `t_otro_${uid}` }],
          ],
        },
      }
    );
    return;
  }

  // ── Tiempo seleccionado ──
  if (data.match(/^t_\d+_\d+$/)) {
    const parts   = data.split("_");
    const minutos = parseInt(parts[1]);
    const ownerId = parseInt(parts[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    const txt = minutos < 60 ? `${minutos} min` : "1 hora";
    escorts[uid] = { ...escorts[uid], libre: false, ocupadaHasta: Date.now() + minutos * 60000, ocupadaTexto: txt };
    escorts[uid].panelMsgId = msgId;
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${p(nombre)}*\n🔴 Ocupada (${txt})`,
      { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy Libre", callback_data: `libre_${uid}` }]] } }
    );
    await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    return;
  }

  // ── Tiempo personalizado ──
  if (data.startsWith("t_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_tiempo_personalizado" };
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${p(nombre)}*\n⏱ Escribe cuántos minutos estarás ocupada:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    escorts[uid].panelMsgId = msgId;
    return;
  }

  // ── Escort se pone libre ──
  if (data.startsWith("libre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaHasta = undefined; escorts[uid].ocupadaTexto = undefined; }
    escorts[uid].panelMsgId = msgId;
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${p(nombre)}*\n🟢 Libre`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    return;
  }

  // ── Escort acepta cliente ──
  if (data.startsWith("acepto_")) {
    if (!escorts[uid]) return answerCB(query.id, "❌ No estás registrada.", true);
    const parts   = data.split("_");
    const digitos = parts[1];
    const monto   = parts[2];
    const telfUid = parseInt(parts[3]);

    convEscort[uid] = { paso: "esperando_nota", digitos, monto, escortMsgId: msgId, telfUid };

    await editMsg(GRUPO_ESCORTS, msgId,
      `🟡 *${p(nombre)} está tomando el cliente...*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Estimado: *$${monto}*\n━━━━━━━━━━━━━━\nEscribe una nota o toca Sin nota:`,
      { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escort_ok_${uid}` }]] } }
    );
    return answerCB(query.id, "✅ Escribe tu nota o toca 'Sin nota'.");
  }

  // ── Escort sin nota ──
  if (data.startsWith("escort_ok_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    await confirmarEscort(uid, nombre);
    return;
  }

  // ── Telefonista confirmó envío (desde privado via teclado, pero por si acaso) ──
  // Esto se maneja en handleMessage con el teclado real

  // ── ¿Llegó? — respuesta de escort ──
  if (data.startsWith("llego_")) {
    const parts    = data.split("_");
    const digitos  = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);
    const escortId = parseInt(parts[4]);

    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    // Notificar al telefonista
    await sendMsg(telfUid,
      `✅ *El cliente \`${digitos}\` llegó.*\n\nEspera el resultado final de la escort.`,
    );

    // Pedir monto en el grupo escorts
    convEscort[uid] = { paso: "cliente_en_camino", digitos, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `✅ *Cliente llegó*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n━━━━━━━━━━━━━━\n¿Cuánto pagó el cliente?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "$50",  callback_data: `pago_50_${digitos}_${monto}_${telfUid}_${uid}`  },
              { text: "$100", callback_data: `pago_100_${digitos}_${monto}_${telfUid}_${uid}` },
              { text: "$150", callback_data: `pago_150_${digitos}_${monto}_${telfUid}_${uid}` },
              { text: "$200", callback_data: `pago_200_${digitos}_${monto}_${telfUid}_${uid}` },
            ],
            [{ text: "💵 Otro monto", callback_data: `pago_otro_${digitos}_${monto}_${telfUid}_${uid}` }],
          ],
        },
      }
    );
    return;
  }

  // ── No llegó / Se fue ──
  if (data.startsWith("nollego_")) {
    const parts    = data.split("_");
    const digitos  = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);
    const escortId = parseInt(parts[4]);

    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    const telfConv = convTelf[telfUid];
    if (escorts[uid]) escorts[uid].libre = true;

    await editMsg(GRUPO_ESCORTS, msgId,
      `🚪 *Cliente no llegó*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${p(nombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );

    if (telfConv?.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
        `🚪 *Cliente no llegó* — Código \`${digitos}\``,
        { reply_markup: { inline_keyboard: [] } }
      );
    }

    await sendMsg(telfUid,
      `🚪 *El cliente \`${digitos}\` no llegó.*\n\n👥 *Escorts:*\n${textoEscorts()}`,
      { reply_markup: tecladoInicio }
    );

    convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre };
    await liberarTurno();
    await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    return;
  }

  // ── Monto de pago seleccionado ──
  if (data.match(/^pago_\d+_\d+_\d+_\d+_\d+$/)) {
    const parts    = data.split("_");
    const montoReal = parseInt(parts[1]);
    const digitos   = parts[2];
    const monto     = parts[3];
    const telfUid   = parseInt(parts[4]);
    const escortId  = parseInt(parts[5]);

    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    delete convEscort[uid];
    await procesarPago(nombre, telfUid, digitos, montoReal, msgId);
    return;
  }

  // ── Otro monto ──
  if (data.startsWith("pago_otro_")) {
    const parts   = data.split("_");
    const digitos = parts[2];
    const monto   = parts[3];
    const telfUid = parseInt(parts[4]);
    const escortId = parseInt(parts[5]);

    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    convEscort[uid] = { paso: "esperando_monto_real", digitos, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `💵 *¿Cuánto pagó el cliente?*\nEscribe el monto en el grupo:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }
}

// ──────────────────────────────────────────
// RUTA PRINCIPAL
// ──────────────────────────────────────────

// Manejar el teclado de telefonista para "Lo envié" etc.
async function manejarAccionTelf(uid: number, texto: string) {
  const conv = convTelf[uid];
  if (!conv) return;

  if (conv.paso === "esperando_respuesta_escort") {
    if (texto === "✈️ Lo envié, ya va de camino") {
      convTelf[uid] = { ...conv, paso: "cliente_enviado", ultimaPreguntaLlegó: 0 };

      // Notificar escort en grupo
      await sendMsg(GRUPO_ESCORTS,
        `✈️ *Cliente en camino*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n━━━━━━━━━━━━━━\n¿Llegó el cliente?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Sí, llegó", callback_data: `llego_${conv.digitos}_${conv.monto}_${uid}_${conv.escortUid}` }],
              [{ text: "🚪 No llegó / Se fue", callback_data: `nollego_${conv.digitos}_${conv.monto}_${uid}_${conv.escortUid}` }],
            ],
          },
        }
      );

      // Actualizar grupo telefonistas
      if (conv.grupMsgId) {
        await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
          `✈️ *${p(conv.nombre ?? "")}* envió el cliente \`${conv.digitos}\` — esperando resultado...`,
          { reply_markup: { inline_keyboard: [] } }
        );
      }

      await sendMsg(uid,
        `✈️ *Cliente enviado.*\nEspera que la escort confirme si llegó.\n\nPuedes preguntar con el botón:`,
        {
          reply_markup: {
            keyboard: [[{ text: "📍 ¿Llegó?" }], [{ text: "❌ Cancelar servicio" }]],
            resize_keyboard: true, persistent: true,
          },
        }
      );
      return;
    }

    if (texto === "🚪 Cliente se fue" || texto === "❌ Cancelar servicio") {
      const esCancel  = texto === "❌ Cancelar servicio";
      const textoGrupo = esCancel
        ? `❌ *Cancelado* — Código \`${conv.digitos}\``
        : `🚪 *Cliente se fue* — Código \`${conv.digitos}\``;

      if (conv.grupMsgId)        await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });
      if (conv.escortAcceptMsgId) await editMsg(GRUPO_ESCORTS, conv.escortAcceptMsgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });

      if (conv.escortUid && escorts[conv.escortUid]) escorts[conv.escortUid].libre = true;

      convTelf[uid] = { paso: "idle", nombre: conv.nombre };
      await liberarTurno();

      await sendMsg(uid,
        `${esCancel ? "❌ Cancelado." : "🚪 Cliente registrado como ido."}\n\n👥 *Escorts:*\n${textoEscorts()}`,
        { reply_markup: tecladoInicio }
      );
      await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    }
  }

  if (conv.paso === "cliente_enviado") {
    if (texto === "❌ Cancelar servicio") {
      if (conv.grupMsgId)        await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId, `❌ *Cancelado* — Código \`${conv.digitos}\``, { reply_markup: { inline_keyboard: [] } });
      if (conv.escortAcceptMsgId) await editMsg(GRUPO_ESCORTS, conv.escortAcceptMsgId, `❌ *Cancelado* — Código \`${conv.digitos}\``, { reply_markup: { inline_keyboard: [] } });
      if (conv.escortUid && escorts[conv.escortUid]) escorts[conv.escortUid].libre = true;
      convTelf[uid] = { paso: "idle", nombre: conv.nombre };
      await liberarTurno();
      await sendMsg(uid, `❌ Cancelado.\n\n👥 *Escorts:*\n${textoEscorts()}`, { reply_markup: tecladoInicio });
      await notificarTelefonistas(`🔄 *Estado de escorts:*\n\n${textoEscorts()}`);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message) {
      const msg    = body.message;
      const chatId = msg.chat?.id;
      const uid    = msg.from?.id;
      const texto  = msg.text?.trim() ?? "";

      // Acciones del teclado del telefonista en privado
      if (chatId === uid && ["✈️ Lo envié, ya va de camino", "🚪 Cliente se fue", "❌ Cancelar servicio", "📍 ¿Llegó?"].includes(texto)) {
        await manejarAccionTelf(uid, texto);
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
