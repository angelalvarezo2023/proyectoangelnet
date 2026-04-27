import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -4670796638;
const GRUPO_TELEFONISTAS = -5171466708;

// ──────────────────────────────────────────
// ESTADO (en memoria — se reconstruye con cada interacción)
// ──────────────────────────────────────────

type PasoTelf =
  | "idle"
  | "esperando_terminal"
  | "esperando_monto"
  | "esperando_descripcion"
  | "esperando_accion"
  | "cliente_enviado";

interface ConvTelf {
  paso: PasoTelf;
  nombre: string;
  lastBotMsgId?: number;  // ID del último mensaje del bot — para borrar el anterior
  terminal?: string;
  monto?: string;
  descripcion?: string;
  grupMsgId?: number;
  escortMsgId?: number;
  escortUid?: number;
  escortNombre?: string;
  ultimaPregunta?: number;
}

interface ConvEscort {
  paso: "esperando_nota" | "esperando_tiempo_custom" | "esperando_monto_real";
  terminal?: string;
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
  panelMsgId?: number;
}

interface HistorialTerminal {
  veces: number;
  ultimoPago: number;
  ultimaEscort: string;
  ultimaFecha: string;
}

const convTelf:    Record<number, ConvTelf>          = {};
const convEscort:  Record<number, ConvEscort>        = {};
const comisiones:  Record<number, number>            = {};
const escorts:     Record<number, EstadoEscort>      = {};
const telefonistas: Record<number, string>           = {};
const historial:   Record<string, HistorialTerminal> = {};

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

async function editMsg(chat_id: number, message_id: number, text: string, extra: object = {}): Promise<any> {
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

async function esEscortGrupo(uid: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${uid}`);
    const data = await res.json();
    return ["administrator", "creator", "member"].includes(data.result?.status);
  } catch { return false; }
}

async function esMiembroTelf(uid: number): Promise<boolean> {
  try {
    const res  = await fetch(`${API}/getChatMember?chat_id=${GRUPO_TELEFONISTAS}&user_id=${uid}`);
    const data = await res.json();
    return ["member", "administrator", "creator"].includes(data.result?.status);
  } catch { return false; }
}

function tieneContacto(txt: string): boolean {
  return [
    /\b\d[\d\s\-().]{6,}\d\b/,
    /@[a-zA-Z0-9_.]+/,
    /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i,
    /\b(t\.me|wa\.me|bit\.ly)\b/i,
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,
  ].some(p => p.test(txt));
}

function fn(n: string): string { return (n ?? "").split(" ")[0]; }

function calcularComision(monto: number): number {
  if (monto <= 100) return 15;
  if (monto <= 150) return 25;
  if (monto <= 200) return 30;
  return Math.round(monto * 0.15);
}

function hoy(): string {
  return new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ──────────────────────────────────────────
// TEXTOS DE ESTADO
// ──────────────────────────────────────────

function textoEscorts(): string {
  const lista = Object.values(escorts);
  if (lista.length === 0) return "_Sin escorts registradas._";
  const ahora = Date.now();
  for (const e of lista) {
    if (!e.libre && e.ocupadaHasta && ahora >= e.ocupadaHasta) {
      e.libre = true; e.ocupadaHasta = undefined; e.ocupadaTexto = undefined;
    }
  }
  return lista.map(e =>
    e.libre ? `🟢 *${fn(e.nombre)}* — Disponible`
            : `🔴 *${fn(e.nombre)}* — Ocupada${e.ocupadaTexto ? ` (${e.ocupadaTexto})` : ""}`
  ).join("\n");
}

function textoCola(): string {
  if (colaActiva === null) return "";
  const activo = fn(telefonistas[colaActiva] ?? "Telefonista");
  let txt = `🎯 Turno actual: *${activo}*`;
  if (colaEspera.length > 0)
    txt += `\n⏳ En espera: ${colaEspera.map((u, i) => `${i + 1}. ${fn(telefonistas[u] ?? "?")}`).join(", ")}`;
  return txt;
}

function infoTerminal(terminal: string): string {
  const h = historial[terminal];
  if (!h) return "";
  return (
    `\n⚠️ *Terminal conocida*\n` +
    `🔁 Visitas: *${h.veces}* | 💰 Último pago: *$${h.ultimoPago}*\n` +
    `🙋 Última escort: *${h.ultimaEscort}* | 📅 *${h.ultimaFecha}*`
  );
}

// ──────────────────────────────────────────
// ENVIAR MENSAJE AL TELEFONISTA Y BORRAR EL ANTERIOR
// ──────────────────────────────────────────

async function enviarTelf(uid: number, texto: string, extra: object = {}): Promise<number | undefined> {
  const conv = convTelf[uid];
  // Borrar mensaje anterior del bot
  if (conv?.lastBotMsgId) {
    await deleteMsg(uid, conv.lastBotMsgId);
  }
  const r = await sendMsg(uid, texto, extra);
  const newId = r?.result?.message_id;
  if (newId && convTelf[uid]) convTelf[uid].lastBotMsgId = newId;
  return newId;
}

// ──────────────────────────────────────────
// NOTIFICAR TELEFONISTAS (actualizar su panel)
// ──────────────────────────────────────────

async function notificarTelefonistas(extra?: string) {
  for (const uid of Object.keys(telefonistas).map(Number)) {
    const conv = convTelf[uid];
    if (!conv || conv.paso !== "idle") continue;
    const texto = textoPanelTelf(conv.nombre, extra);
    if (conv.lastBotMsgId) {
      await editMsg(uid, conv.lastBotMsgId, texto, {
        reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] },
      }).catch(() => {});
    }
  }
}

function textoPanelTelf(nombre: string, extra?: string): string {
  const cola = textoCola();
  return (
    `📋 *Panel de Operaciones*\n` +
    `━━━━━━━━━━━━━━\n` +
    `👋 Hola, *${fn(nombre)}*\n\n` +
    `👥 *Estado de escorts:*\n${textoEscorts()}\n` +
    (cola ? `\n${cola}\n` : ``) +
    `━━━━━━━━━━━━━━` +
    (extra ? `\n\n${extra}` : ``)
  );
}

// ──────────────────────────────────────────
// PANEL INICIAL DEL TELEFONISTA
// ──────────────────────────────────────────

async function mostrarPanelTelf(uid: number, nombre: string) {
  // Usar el nombre guardado si el que llega está vacío (tras reinicio)
  const nombreFinal = nombre || convTelf[uid]?.nombre || telefonistas[uid] || "Telefonista";
  telefonistas[uid] = nombreFinal;
  nombre = nombreFinal;
  if (!convTelf[uid]) convTelf[uid] = { paso: "idle", nombre };
  else { convTelf[uid].paso = "idle"; convTelf[uid].nombre = nombre; }

  const msgId = await enviarTelf(uid, textoPanelTelf(nombre), {
    reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] },
  });
  if (msgId) convTelf[uid].lastBotMsgId = msgId;
}

// ──────────────────────────────────────────
// COLA DE TURNOS
// ──────────────────────────────────────────

async function intentarTurno(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;

  if (colaActiva === null || colaActiva === uid) {
    colaActiva = uid;
    await iniciarFlujo(uid);
  } else {
    if (!colaEspera.includes(uid)) colaEspera.push(uid);
    const pos = colaEspera.indexOf(uid) + 1;
    await enviarTelf(uid,
      `⏳ *Hay un registro en curso*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nEstás en la posición *#${pos}*. Te avisaré cuando sea tu turno.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Salir de la cola", callback_data: "salir_cola" }]] } }
    );
  }
}

async function liberarTurno() {
  colaActiva = null;
  if (colaEspera.length === 0) return;

  // Avisar al siguiente con 30s de anticipación si hay más de 1
  if (colaEspera.length > 1) {
    const proximo = colaEspera[0];
    const convP   = convTelf[proximo];
    if (convP?.lastBotMsgId) {
      await editMsg(proximo, convP.lastBotMsgId,
        `⏰ *¡Prepárate, casi es tu turno!*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nSerás el siguiente en *30 segundos*.`,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 30000));
  }

  const siguiente = colaEspera.shift()!;
  colaActiva = siguiente;
  const conv = convTelf[siguiente];
  if (conv) {
    await iniciarFlujo(siguiente);
    // Actualizar posición de los demás
    for (let i = 0; i < colaEspera.length; i++) {
      const u = colaEspera[i];
      const c = convTelf[u];
      if (c?.lastBotMsgId) {
        await editMsg(u, c.lastBotMsgId,
          `⏳ *Hay un registro en curso*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nAhora estás en la posición *#${i + 1}*.`,
          { reply_markup: { inline_keyboard: [[{ text: "❌ Salir de la cola", callback_data: "salir_cola" }]] } }
        ).catch(() => {});
      }
    }
  }
}

// ──────────────────────────────────────────
// FLUJO TELEFONISTA — pasos
// ──────────────────────────────────────────

async function iniciarFlujo(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "esperando_terminal";
  const cola = textoCola();
  await enviarTelf(uid,
    `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n` +
    (cola ? `${cola}\n━━━━━━━━━━━━━━\n` : ``) +
    `\n✏️ Escribe el *número terminal* del cliente (4 dígitos):`,
    { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_telf" }]] } }
  );
}

async function cancelarTelf(uid: number) {
  const conv = convTelf[uid];
  if (conv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
      `❌ *Registro cancelado* — Terminal \`${conv.terminal ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }
  if (conv?.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `❌ *Servicio cancelado por el telefonista*\nTerminal: \`${conv.terminal ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }
  if (conv?.escortUid && escorts[conv.escortUid]) {
    escorts[conv.escortUid].libre = true;
    escorts[conv.escortUid].ocupadaTexto = undefined;
  }
  convTelf[uid] = { paso: "idle", nombre: conv?.nombre ?? "" };
  await liberarTurno();
  await mostrarPanelTelf(uid, conv?.nombre ?? "");
  await notificarTelefonistas();
}

async function pasoMonto(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "esperando_monto";
  const info = infoTerminal(conv.terminal!);
  await enviarTelf(uid,
    `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`${info}\n` +
    `━━━━━━━━━━━━━━\n\n💵 ¿Cuánto estimas que pagará?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "$50", callback_data: "m_50" }, { text: "$100", callback_data: "m_100" },
           { text: "$150", callback_data: "m_150" }, { text: "$200", callback_data: "m_200" }],
          [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
        ],
      },
    }
  );
}

async function pasoDescripcion(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "esperando_descripcion";
  await enviarTelf(uid,
    `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`\n` +
    `💰 Estimado a pagar: *$${conv.monto}*\n` +
    `━━━━━━━━━━━━━━\n\n📝 ¿Deseas agregar una nota?\n_Sin teléfonos ni redes sociales._`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➡️ Sin nota", callback_data: "sin_nota_telf" }],
          [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
        ],
      },
    }
  );
}

async function publicarCliente(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;

  const desc = conv.descripcion ? `\n📝 _${conv.descripcion}_` : "";
  const nombre = conv.nombre;

  // Grupo telefonistas
  const gMsg = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text:
      `📲 *${fn(nombre)}* está enviando un cliente\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${conv.terminal}\`\n` +
      `💰 Estimado: *$${conv.monto}*\n━━━━━━━━━━━━━━`,
  });

  // Grupo escorts
  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE DISPONIBLE*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal del cliente: \`${conv.terminal}\`\n` +
      `💰 Estimado a pagar: *$${conv.monto}*${desc}\n` +
      `📲 Enviado por: *${fn(nombre)}*\n━━━━━━━━━━━━━━\n` +
      `👆 Toca el botón si estás disponible`,
    reply_markup: {
      inline_keyboard: [[{ text: "🙋 Estoy lista, mándalo", callback_data: `acepto_${conv.terminal}_${conv.monto}_${uid}` }]],
    },
  });

  conv.paso       = "esperando_accion";
  conv.grupMsgId  = gMsg?.result?.message_id;
  conv.escortMsgId = eMsg?.result?.message_id;

  await enviarTelf(uid,
    `⏳ *Esperando escort...*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`\n` +
    `💰 Estimado: *$${conv.monto}*${desc}\n━━━━━━━━━━━━━━\n\n` +
    `👥 *Escorts:*\n${textoEscorts()}`,
    { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar servicio", callback_data: "cancelar_telf" }]] } }
  );
}

async function escortLista(uid: number, escortNombre: string, nota?: string) {
  const conv = convTelf[uid];
  if (!conv) return;
  const n = nota ? `\n📝 _${nota}_` : "";
  conv.paso = "esperando_accion";
  await enviarTelf(uid,
    `✅ *¡${fn(escortNombre)} está lista!*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`\n` +
    `💰 Estimado: *$${conv.monto}*${n}\n━━━━━━━━━━━━━━\n\n¿Qué hago?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✈️ Lo envié, ya va de camino", callback_data: "lo_envie" }],
          [{ text: "🚪 Cliente se fue",            callback_data: "cliente_fue" }],
          [{ text: "❌ Cancelar servicio",          callback_data: "cancelar_telf" }],
        ],
      },
    }
  );
}

async function clienteEnviado(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "cliente_enviado";
  conv.ultimaPregunta = Date.now(); // Timer empieza desde que se envía el cliente
  await enviarTelf(uid,
    `✈️ *Cliente enviado*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`\n` +
    `🙋 Escort: *${fn(conv.escortNombre ?? "")}*\n━━━━━━━━━━━━━━\n\n` +
    `Espera que la escort confirme si el cliente llegó.\nPuedes preguntar con el botón de abajo.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📍 ¿Llegó?",          callback_data: "preguntar_llego" }],
          [{ text: "❌ Cancelar servicio", callback_data: "cancelar_telf" }],
        ],
      },
    }
  );
}

async function procesarPago(escortUid: number, escortNombre: string, telfUid: number, terminal: string, montoReal: number, escortMsgId: number) {
  const telfConv = convTelf[telfUid];
  const comision = calcularComision(montoReal);
  comisiones[telfUid] = (comisiones[telfUid] ?? 0) + comision;
  const total = comisiones[telfUid];

  // Guardar en historial
  historial[terminal] = {
    veces: (historial[terminal]?.veces ?? 0) + 1,
    ultimoPago: montoReal,
    ultimaEscort: fn(escortNombre),
    ultimaFecha: hoy(),
  };

  // Escorts — completado + botón libre
  await editMsg(GRUPO_ESCORTS, escortMsgId,
    `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `🙋 Escort: *${fn(escortNombre)}*\n━━━━━━━━━━━━━━\n\n` +
    `_Toca cuando termines con el cliente._`,
    { reply_markup: { inline_keyboard: [[{ text: "🟢 Ya estoy libre", callback_data: `yalibre_${escortUid}` }]] } }
  );

  // Grupo telefonistas
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `🎉 *¡Servicio completado!*\n━━━━━━━━━━━━━━\n` +
      `👤 *${fn(telfConv.nombre)}* cerró un cliente\n` +
      `💰 Pagó: *$${montoReal}* | 💵 Comisión: *+$${comision}*\n` +
      `📊 Balance: *$${total}* | 🙋 *${fn(escortNombre)}*\n━━━━━━━━━━━━━━\n` +
      `¡Felicidades ${fn(telfConv.nombre)}! 🏆`,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }

  // Telefonista — privado con resumen completo
  const telfNombreStr = telfConv?.nombre ?? "";
  convTelf[telfUid] = { paso: "idle", nombre: telfNombreStr };
  await enviarTelf(telfUid,
    `🎉 *¡Servicio completado!*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `💵 Tu comisión: *+$${comision}*\n` +
    `📊 Balance acumulado: *$${total}*\n` +
    `🙋 Atendido por: *${fn(escortNombre)}*\n━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] } }
  );
  // Mostrar panel actualizado después del resumen
  setTimeout(async () => {
    await mostrarPanelTelf(telfUid, telfNombreStr);
  }, 3000);
  await liberarTurno();
  await notificarTelefonistas();
}

// ──────────────────────────────────────────
// PANEL ESCORTS
// ──────────────────────────────────────────

async function publicarPanelEscorts() {
  const lista = Object.values(escorts);
  if (lista.length === 0) {
    await sendMsg(GRUPO_ESCORTS, `📋 *Panel de Escorts*\n\n_Escribe cualquier mensaje en el grupo para registrarte._`);
    return;
  }
  for (const e of lista) {
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: e.libre
        ? `👤 *${fn(e.nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`
        : `👤 *${fn(e.nombre)}*\n🔴 Ocupada (${e.ocupadaTexto ?? ""})`,
      reply_markup: {
        inline_keyboard: e.libre
          ? [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${e.uid}` }]]
          : [[{ text: "🟢 Estoy libre",     callback_data: `libre_${e.uid}` }]],
      },
    });
    if (escorts[e.uid]) escorts[e.uid].panelMsgId = r?.result?.message_id;
  }
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

  // ── Salida de grupos ──
  if (msg.left_chat_member) {
    const leftUid = msg.left_chat_member.id;
    if (chatId === GRUPO_ESCORTS && escorts[leftUid]) {
      delete escorts[leftUid];
      await notificarTelefonistas();
    }
    if (chatId === GRUPO_TELEFONISTAS && telefonistas[leftUid]) {
      delete telefonistas[leftUid];
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

  // ── Registro automático de escorts ──
  if (chatId === GRUPO_ESCORTS) {
    if (!escorts[uid]) {
      escorts[uid] = { uid, nombre, libre: true };
      await notificarTelefonistas(`🟢 *${fn(nombre)}* se registró como escort.`);
    }
    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

    if (conv.paso === "esperando_nota") {
      if (tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS, `🚫 *${fn(nombre)}*, no se permiten teléfonos ni redes sociales.`,
          { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }
        );
        return;
      }
      convEscort[uid] = { ...conv, nota: texto };
      await confirmarEscort(uid, nombre);
      return;
    }
    if (conv.paso === "esperando_tiempo_custom") {
      const mins = parseInt(texto);
      if (isNaN(mins) || mins <= 0) { await sendMsg(GRUPO_ESCORTS, `⚠️ Escribe los minutos. Ej: *45*`); return; }
      escorts[uid] = { ...escorts[uid], libre: false, ocupadaHasta: Date.now() + mins * 60000, ocupadaTexto: `${mins} min` };
      delete convEscort[uid];
      if (escorts[uid]?.panelMsgId) {
        await editMsg(GRUPO_ESCORTS, escorts[uid].panelMsgId!,
          `👤 *${fn(nombre)}*\n🔴 Ocupada (${mins} min)`,
          { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy libre", callback_data: `libre_${uid}` }]] } }
        );
      }
      await notificarTelefonistas();
      return;
    }
    if (conv.paso === "esperando_monto_real") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) { await sendMsg(GRUPO_ESCORTS, `⚠️ Ingresa solo el número. Ej: *120*`); return; }
      delete convEscort[uid];
      await procesarPago(uid, nombre, conv.telfUid!, conv.terminal!, parseFloat(ml), conv.escortMsgId!);
      return;
    }
    return;
  }

  // ── /start en privado ──
  if (texto === "/start" && chatId === uid) {
    await deleteMsg(uid, msg.message_id);
    const escort = await esEscortGrupo(uid);
    if (escort) { await sendMsg(uid, `👋 *Bienvenida ${fn(nombre)}.*\nTu panel está en el grupo de escorts.`); return; }
    const esTelf = await esMiembroTelf(uid);
    if (!esTelf) { await sendMsg(uid, "❌ No tienes acceso. Contacta al administrador."); return; }
    await mostrarPanelTelf(uid, nombre);
    return;
  }

  // ── Mensajes en privado del telefonista ──
  if (chatId === uid) {
    await deleteMsg(uid, msg.message_id);
    const conv = convTelf[uid];
    if (!conv || conv.paso === "idle" || conv.paso === "esperando_accion" || conv.paso === "cliente_enviado") return;

    if (conv.paso === "esperando_terminal") {
      if (!/^\d{4}$/.test(texto)) {
        await enviarTelf(uid,
          `⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
          { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_telf" }]] } }
        );
        return;
      }
      conv.terminal = texto;
      await pasoMonto(uid);
      return;
    }

    if (conv.paso === "esperando_monto") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) {
        await enviarTelf(uid, `⚠️ Ingresa solo el número. Ej: *100*`,
          { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancelar_telf" }]] } }
        );
        return;
      }
      conv.monto = ml;
      await pasoDescripcion(uid);
      return;
    }

    if (conv.paso === "esperando_descripcion") {
      if (tieneContacto(texto)) {
        await enviarTelf(uid, `🚫 No se permiten teléfonos ni redes sociales. Intenta de nuevo:`,
          { reply_markup: { inline_keyboard: [
            [{ text: "➡️ Sin nota", callback_data: "sin_nota_telf" }],
            [{ text: "❌ Cancelar", callback_data: "cancelar_telf" }],
          ]}}
        );
        return;
      }
      conv.descripcion = texto;
      await publicarCliente(uid);
      return;
    }
  }
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT
// ──────────────────────────────────────────

async function confirmarEscort(escortUid: number, escortNombre: string) {
  const conv = convEscort[escortUid];
  if (!conv?.telfUid) return;
  const telfConv = convTelf[conv.telfUid];
  const nota = conv.nota;

  if (escorts[escortUid]) { escorts[escortUid].libre = false; escorts[escortUid].ocupadaTexto = "con cliente"; }

  // Editar msg en escorts
  if (conv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `🟡 *EN PROCESO*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${conv.terminal}\`\n` +
      `💰 Estimado: *$${conv.monto}*\n` +
      `🙋 Escort: *${fn(escortNombre)}*\n` +
      (nota ? `📝 _${nota}_\n` : ``) +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  // Actualizar grupo telefonistas
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `✅ *Escort asignada*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n🙋 *${fn(escortNombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }

  // Notificar telefonista
  if (telfConv) {
    telfConv.escortUid    = escortUid;
    telfConv.escortNombre = escortNombre;
    await escortLista(conv.telfUid, escortNombre, nota);
  }

  await notificarTelefonistas();
  delete convEscort[escortUid];
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const msgId: number  = query.message.message_id;

  // ── TELEFONISTA: Nuevo Cliente ──
  if (data === "nuevo_cliente") {
    await answerCB(query.id);
    // Siempre actualizar el nombre desde Telegram (puede haberse perdido tras reinicio)
    const nombreActual = nombre || convTelf[uid]?.nombre || telefonistas[uid] || "Telefonista";
    telefonistas[uid] = nombreActual;
    if (!convTelf[uid]) convTelf[uid] = { paso: "idle", nombre: nombreActual };
    else convTelf[uid].nombre = nombreActual;
    await intentarTurno(uid);
    return;
  }

  // ── TELEFONISTA: Cancelar ──
  if (data === "cancelar_telf") {
    await answerCB(query.id);
    await cancelarTelf(uid);
    return;
  }

  // ── TELEFONISTA: Salir de cola ──
  if (data === "salir_cola") {
    await answerCB(query.id);
    const idx = colaEspera.indexOf(uid);
    if (idx !== -1) colaEspera.splice(idx, 1);
    if (convTelf[uid]) convTelf[uid].paso = "idle";
    await mostrarPanelTelf(uid, nombre);
    return;
  }

  // ── TELEFONISTA: Monto rápido ──
  if (data.startsWith("m_")) {
    await answerCB(query.id);
    const monto = data.replace("m_", "");
    const conv  = convTelf[uid];
    if (conv?.paso === "esperando_monto") {
      conv.monto = monto;
      await pasoDescripcion(uid);
    }
    return;
  }

  // ── TELEFONISTA: Sin nota ──
  if (data === "sin_nota_telf") {
    await answerCB(query.id);
    await publicarCliente(uid);
    return;
  }

  // ── TELEFONISTA: Lo envié ──
  if (data === "lo_envie") {
    await answerCB(query.id);
    const conv = convTelf[uid];
    if (!conv) return;

    if (conv.escortMsgId) {
      await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
        `✈️ *CLIENTE EN CAMINO*\n━━━━━━━━━━━━━━\n` +
        `📱 Terminal: \`${conv.terminal}\`\n` +
        `🙋 Escort: *${fn(conv.escortNombre ?? "")}*\n━━━━━━━━━━━━━━\n\n` +
        `Confirma cuando el cliente llegue:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Llegó",   callback_data: `llego_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
              [{ text: "🚪 Se fue", callback_data: `sefue_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
            ],
          },
        }
      );
    }
    if (conv.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
        `✈️ *${fn(conv.nombre)}* envió el cliente \`${conv.terminal}\` — esperando resultado...`,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    await clienteEnviado(uid);
    return;
  }

  // ── TELEFONISTA: Cliente se fue (antes de llegar) ──
  if (data === "cliente_fue") {
    await answerCB(query.id);
    const conv = convTelf[uid];
    if (!conv) return;
    if (conv.escortMsgId) await editMsg(GRUPO_ESCORTS, conv.escortMsgId, `🚪 *Cliente se fue antes de llegar*\n📱 Terminal: \`${conv.terminal}\``, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (conv.grupMsgId)   await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId, `🚪 *Cliente se fue* — Terminal \`${conv.terminal}\``, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (conv.escortUid && escorts[conv.escortUid]) { escorts[conv.escortUid].libre = true; escorts[conv.escortUid].ocupadaTexto = undefined; }
    convTelf[uid] = { paso: "idle", nombre: conv.nombre };
    await liberarTurno();
    await mostrarPanelTelf(uid, conv.nombre);
    await notificarTelefonistas();
    return;
  }

  // ── TELEFONISTA: ¿Llegó? ──
  if (data === "preguntar_llego") {
    const conv = convTelf[uid];
    if (!conv) return;
    const ahora = Date.now();
    // Esperar 2 min desde que se envió el cliente antes de primera pregunta
    // Luego 1 min entre preguntas repetidas
    const ESPERA_INICIAL = 120000; // 2 min desde envío
    const ESPERA_REPEAT  = 60000;  // 1 min entre repeticiones
    const tiempoDesdeEnvio = ahora - (conv.ultimaPregunta ?? ahora);
    const esPrimeraPregunta = conv.ultimaPregunta !== undefined && 
                               Date.now() - conv.ultimaPregunta < ESPERA_INICIAL + 5000 &&
                               conv.ultimaPregunta === convTelf[uid]?.ultimaPregunta;

    // Simplificado: bloquear si no han pasado 2min desde envío O 1min desde última pregunta
    if (conv.ultimaPregunta && ahora - conv.ultimaPregunta < ESPERA_INICIAL) {
      const esperando = ESPERA_INICIAL - (ahora - conv.ultimaPregunta);
      const mins = Math.floor(esperando / 60000);
      const segs = Math.ceil((esperando % 60000) / 1000);
      const textoEspera = mins > 0 ? `${mins}min ${segs}s` : `${segs}s`;
      return answerCB(query.id, `⏱ Espera ${textoEspera} para preguntar.`, true);
    }
    await answerCB(query.id);
    // Después de la primera pregunta, el límite baja a 1 min
    conv.ultimaPregunta = ahora - ESPERA_INICIAL + ESPERA_REPEAT;

    const DURACION = 180;
    const botonesEscort = {
      inline_keyboard: [
        [{ text: "✅ Llegó",   callback_data: `llego_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
        [{ text: "🚪 Se fue", callback_data: `sefue_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
      ],
    };

    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: `📍 *¿Llegó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n⏱ Tiempo: *3:00*\n━━━━━━━━━━━━━━`,
      reply_markup: botonesEscort,
    });

    const cuentaMsgId = r?.result?.message_id;
    if (!cuentaMsgId) return;

    // Actualizar mensaje del telefonista
    if (conv.lastBotMsgId) {
      await editMsg(uid, conv.lastBotMsgId,
        `✈️ *Cliente enviado*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n━━━━━━━━━━━━━━\n\n✅ Pregunta enviada. Esperando respuesta...`,
        { reply_markup: { inline_keyboard: [
          [{ text: "📍 ¿Llegó?", callback_data: "preguntar_llego" }],
          [{ text: "❌ Cancelar servicio", callback_data: "cancelar_telf" }],
        ]}}
      ).catch(() => {});
    }

    // Countdown
    let segsLeft = DURACION;
    const timer = setInterval(async () => {
      segsLeft -= 30;
      if (segsLeft <= 0) {
        clearInterval(timer);
        await editMsg(GRUPO_ESCORTS, cuentaMsgId,
          `📍 *¿Llegó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n⏱ *Tiempo agotado*\n━━━━━━━━━━━━━━`,
          { reply_markup: botonesEscort }
        ).catch(() => clearInterval(timer));
        return;
      }
      const m = Math.floor(segsLeft / 60), s = (segsLeft % 60).toString().padStart(2, "0");
      await editMsg(GRUPO_ESCORTS, cuentaMsgId,
        `📍 *¿Llegó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n⏱ Tiempo: *${m}:${s}*\n━━━━━━━━━━━━━━`,
        { reply_markup: botonesEscort }
      ).catch(() => clearInterval(timer));
    }, 30000);
    return;
  }

  // ── ESCORT: Ocupada ──
  if (data.startsWith("ocupada_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n🔴 ¿Cuánto tiempo estarás ocupada?`,
      { reply_markup: { inline_keyboard: [
        [{ text: "5 min", callback_data: `t_5_${uid}` }, { text: "30 min", callback_data: `t_30_${uid}` }, { text: "1 hora", callback_data: `t_60_${uid}` }],
        [{ text: "⏱ Otro tiempo", callback_data: `t_otro_${uid}` }],
      ]}}
    );
    if (escorts[uid]) escorts[uid].panelMsgId = msgId;
    return;
  }

  // ── ESCORT: Tiempo seleccionado ──
  if (data.match(/^t_\d+_\d+$/)) {
    const [, mins, ownerId] = data.split("_");
    if (uid !== parseInt(ownerId)) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    const m = parseInt(mins), txt = m < 60 ? `${m} min` : "1 hora";
    if (escorts[uid]) { escorts[uid].libre = false; escorts[uid].ocupadaHasta = Date.now() + m * 60000; escorts[uid].ocupadaTexto = txt; escorts[uid].panelMsgId = msgId; }
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n🔴 Ocupada (${txt})`,
      { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy libre", callback_data: `libre_${uid}` }]] } }
    );
    await notificarTelefonistas(`🔴 *${fn(nombre)}* se puso ocupada (${txt}).`);
    return;
  }

  // ── ESCORT: Tiempo personalizado ──
  if (data.startsWith("t_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_tiempo_custom" };
    if (escorts[uid]) escorts[uid].panelMsgId = msgId;
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n⏱ Escribe cuántos minutos estarás ocupada:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  // ── ESCORT: Libre ──
  if (data.startsWith("libre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaHasta = undefined; escorts[uid].ocupadaTexto = undefined; escorts[uid].panelMsgId = msgId; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)}* ya está libre.`);
    return;
  }

  // ── ESCORT: Ya estoy libre (post-servicio) ──
  if (data.startsWith("yalibre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; escorts[uid].ocupadaHasta = undefined; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)}* terminó con el cliente y está libre.`);
    return;
  }

  // ── ESCORT: Acepta cliente ──
  if (data.startsWith("acepto_")) {
    if (!escorts[uid]) return answerCB(query.id, "❌ No estás registrada como escort.", true);
    const parts = data.split("_");
    convEscort[uid] = { paso: "esperando_nota", terminal: parts[1], monto: parts[2], escortMsgId: msgId, telfUid: parseInt(parts[3]) };
    await editMsg(GRUPO_ESCORTS, msgId,
      `🙋 *${fn(nombre)} tomando el cliente...*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${parts[1]}\`\n💰 Estimado: *$${parts[2]}*\n━━━━━━━━━━━━━━\n\n` +
      `📝 Escribe una nota o toca _Sin nota_:`,
      { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }
    );
    return answerCB(query.id, "✅ Escribe tu nota o toca 'Sin nota'.");
  }

  // ── ESCORT: Sin nota ──
  if (data.startsWith("escortnota_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    await confirmarEscort(uid, nombre);
    return;
  }

  // ── ESCORT: Llegó — mostrar opciones pagó/se fue ──
  if (data.startsWith("llego_")) {
    const parts = data.split("_");
    const terminal = parts[1], monto = parts[2], telfUid = parseInt(parts[3]), escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    // Notificar al telefonista que llegó
    const telfConv = convTelf[telfUid];
    if (telfConv?.lastBotMsgId) {
      await editMsg(telfUid, telfConv.lastBotMsgId,
        `✅ *El cliente llegó*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n━━━━━━━━━━━━━━\nEspera el resultado final de la escort.`,
        { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar servicio", callback_data: "cancelar_telf" }]] } }
      );
    }

    // Mostrar 2 opciones en el grupo escorts
    await editMsg(GRUPO_ESCORTS, msgId,
      `✅ *Cliente llegó*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n━━━━━━━━━━━━━━\n\n¿Qué pasó?`,
      { reply_markup: { inline_keyboard: [
        [{ text: "💰 Llegó y pagó",  callback_data: `llegopago_${terminal}_${monto}_${telfUid}_${uid}` }],
        [{ text: "🚪 Llegó y se fue", callback_data: `llegofue_${terminal}_${monto}_${telfUid}_${uid}` }],
      ]}}
    );
    return;
  }

  // ── ESCORT: Llegó y pagó — mostrar montos ──
  if (data.startsWith("llegopago_")) {
    const parts = data.split("_");
    const terminal = parts[1], monto = parts[2], telfUid = parseInt(parts[3]), escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = false; escorts[uid].ocupadaTexto = "con cliente"; }
    await notificarTelefonistas();
    convEscort[uid] = { paso: "esperando_monto_real", terminal, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `💰 *Cliente pagó*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n━━━━━━━━━━━━━━\n\n💵 ¿Cuánto pagó el cliente?`,
      { reply_markup: { inline_keyboard: [
        [{ text: "$50",  callback_data: `pago_50_${terminal}_${monto}_${telfUid}_${uid}` },
         { text: "$100", callback_data: `pago_100_${terminal}_${monto}_${telfUid}_${uid}` }],
        [{ text: "$150", callback_data: `pago_150_${terminal}_${monto}_${telfUid}_${uid}` },
         { text: "$200", callback_data: `pago_200_${terminal}_${monto}_${telfUid}_${uid}` }],
        [{ text: "💵 Otro monto", callback_data: `pago_otro_${terminal}_${monto}_${telfUid}_${uid}` }],
      ]}}
    );
    return;
  }

  // ── ESCORT: Llegó y se fue (sin pagar) ──
  if (data.startsWith("llegofue_")) {
    const parts = data.split("_");
    const terminal = parts[1], monto = parts[2], telfUid = parseInt(parts[3]), escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    const telfConv = convTelf[telfUid];
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `🚪 *Cliente llegó pero se fue sin pagar*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n🙋 *${fn(nombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
    if (telfConv?.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
        `🚪 *Cliente llegó y se fue sin pagar* — Terminal \`${terminal}\``,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    const telfNombreLF = telfConv?.nombre ?? "";
    convTelf[telfUid] = { paso: "idle", nombre: telfNombreLF };
    // Notificar al telefonista en privado
    await enviarTelf(telfUid,
      `🚪 *El cliente se fue — no hubo servicio*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n🙋 Escort: *${fn(nombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] } }
    );
    setTimeout(async () => { await mostrarPanelTelf(telfUid, telfNombreLF); }, 3000);
    await liberarTurno();
    await notificarTelefonistas();
    return;
  }

  // ── ESCORT: Se fue ──
  if (data.startsWith("sefue_")) {
    const parts = data.split("_");
    const terminal = parts[1], telfUid = parseInt(parts[3]), escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    const telfConv = convTelf[telfUid];
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; }
    await editMsg(GRUPO_ESCORTS, msgId, `🚪 *Cliente se fue*\n📱 Terminal: \`${terminal}\`\n🙋 *${fn(nombre)}*`, { reply_markup: { inline_keyboard: [] } });
    if (telfConv?.grupMsgId) await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId, `🚪 *Cliente se fue* — Terminal \`${terminal}\``, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    const telfNombreLF = telfConv?.nombre ?? "";
    convTelf[telfUid] = { paso: "idle", nombre: telfNombreLF };
    // Notificar al telefonista en privado
    await enviarTelf(telfUid,
      `🚪 *El cliente no llegó — servicio cancelado*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n🙋 Escort: *${fn(nombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] } }
    );
    setTimeout(async () => { await mostrarPanelTelf(telfUid, telfNombreLF); }, 3000);
    await liberarTurno();
    await notificarTelefonistas();
    return;
  }

  // ── ESCORT: Monto de pago ──
  if (data.match(/^pago_\d+_.+_\d+_\d+_\d+$/)) {
    const parts = data.split("_");
    const montoReal = parseInt(parts[1]), terminal = parts[2], telfUid = parseInt(parts[4]), escortId = parseInt(parts[5]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    delete convEscort[uid];
    await procesarPago(uid, nombre, telfUid, terminal, montoReal, msgId);
    return;
  }

  // ── ESCORT: Otro monto ──
  if (data.startsWith("pago_otro_")) {
    const parts = data.split("_");
    const terminal = parts[2], monto = parts[3], telfUid = parseInt(parts[4]), escortId = parseInt(parts[5]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_monto_real", terminal, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId, `💵 *¿Cuánto pagó el cliente?*\nEscribe el monto en el grupo:`, { reply_markup: { inline_keyboard: [] } });
    return;
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
