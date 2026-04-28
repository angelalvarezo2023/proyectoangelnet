import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -1003938759901;
const GRUPO_TELEFONISTAS = -5171466708;

// ──────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────

type PasoTelf =
  | "idle"
  | "esperando_terminal"
  | "esperando_monto"
  | "esperando_descripcion"
  | "en_chat";              // chat activo con escort

type PasoEscort =
  | "esperando_nota"
  | "esperando_tiempo_custom"
  | "esperando_monto_real"
  | "esperando_otro"
  | "en_chat";              // chat activo con telefonista

interface ConvTelf {
  paso: PasoTelf;
  nombre: string;
  lastBotMsgId?: number;
  flowMsgIds?: number[];   // todos los msg IDs del flujo para borrar al cerrar
  terminal?: string;
  monto?: string;
  descripcion?: string;
  escortMsgId?: number;
  escortUid?: number;
  escortNombre?: string;
}

interface ConvEscort {
  paso: PasoEscort;
  terminal?: string;
  monto?: string;
  escortMsgId?: number;
  telfUid?: number;
  telfNombre?: string;
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

// Chat activo: escortUid → telfUid (para saber con quién está chateando)
const chatsActivos: Record<number, number> = {};

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
// TEXTOS
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
// ENVIAR MENSAJE AL TELEFONISTA (borra el anterior)
// ──────────────────────────────────────────

async function enviarTelf(uid: number, texto: string, extra: object = {}): Promise<number | undefined> {
  const conv = convTelf[uid];
  const r = await sendMsg(uid, texto, extra);
  const newId = r?.result?.message_id;
  if (newId && convTelf[uid]) {
    convTelf[uid].lastBotMsgId = newId;
    if (!convTelf[uid].flowMsgIds) convTelf[uid].flowMsgIds = [];
    convTelf[uid].flowMsgIds!.push(newId);
  }
  return newId;
}

// Borrar todos los mensajes del flujo y mostrar panel limpio
async function limpiarChat(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (conv?.flowMsgIds) {
    for (const msgId of conv.flowMsgIds) {
      await deleteMsg(uid, msgId);
    }
  }
  convTelf[uid] = { paso: "idle", nombre };
  await mostrarPanelTelf(uid, nombre);
}

// ──────────────────────────────────────────
// ACTUALIZAR PANEL DE TELEFONISTAS
// ──────────────────────────────────────────

async function notificarTelefonistas(extra?: string) {
  for (const uid of Object.keys(telefonistas).map(Number)) {
    const conv = convTelf[uid];
    if (!conv || conv.paso !== "idle") continue;
    if (conv.lastBotMsgId) {
      await editMsg(uid, conv.lastBotMsgId, textoPanelTelf(conv.nombre, extra), {
        reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] },
      }).catch(() => {});
    }
  }
}

// ──────────────────────────────────────────
// PANEL DEL TELEFONISTA
// ──────────────────────────────────────────

async function mostrarPanelTelf(uid: number, nombre: string) {
  const nombreFinal = nombre || convTelf[uid]?.nombre || telefonistas[uid] || "Telefonista";
  telefonistas[uid] = nombreFinal;
  // Reset completo — nuevo panel limpio
  convTelf[uid] = { paso: "idle", nombre: nombreFinal, flowMsgIds: [] };

  const r = await sendMsg(uid, textoPanelTelf(nombreFinal), {
    reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }]] },
  });
  const msgId = r?.result?.message_id;
  if (msgId) {
    convTelf[uid].lastBotMsgId = msgId;
    convTelf[uid].flowMsgIds = [msgId];
  }
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
// FLUJO TELEFONISTA
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
  if (conv?.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `❌ *Servicio cancelado*\n📱 Terminal: \`${conv.terminal ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }
  // Si hay chat activo, notificar a la escort
  if (conv?.escortUid) {
    delete chatsActivos[conv.escortUid];
    const convE = convEscort[conv.escortUid];
    if (convE) {
      convEscort[conv.escortUid] = { paso: "en_chat", ...convE };
      await sendMsg(conv.escortUid,
        `❌ *El telefonista canceló el servicio.*\n📱 Terminal: \`${conv.terminal ?? "—"}\``,
        { reply_markup: { inline_keyboard: [] } }
      );
      delete convEscort[conv.escortUid];
      if (escorts[conv.escortUid]) { escorts[conv.escortUid].libre = true; escorts[conv.escortUid].ocupadaTexto = undefined; }
    }
  }
  const nombreC = conv?.nombre ?? "";
  await limpiarChat(uid, nombreC);
  await liberarTurno();
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
    `💰 Estimado: *$${conv.monto}*\n` +
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

  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE DISPONIBLE*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${conv.terminal}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `📲 De: *${fn(conv.nombre)}*\n━━━━━━━━━━━━━━\n` +
      `👆 Toca el botón si estás disponible`,
    reply_markup: {
      inline_keyboard: [[{ text: "🙋 Acepto este cliente", callback_data: `acepto_${conv.terminal}_${conv.monto}_${uid}` }]],
    },
  });

  conv.paso        = "en_chat";
  conv.escortMsgId = eMsg?.result?.message_id;

  await enviarTelf(uid,
    `⏳ *Esperando que una escort acepte...*\n━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${conv.terminal}\`\n` +
    `💰 Estimado: *$${conv.monto}*${desc}\n━━━━━━━━━━━━━━\n\n` +
    `👥 *Escorts disponibles:*\n${textoEscorts()}`,
    { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar servicio", callback_data: "cancelar_telf" }]] } }
  );
}

// ──────────────────────────────────────────
// CHAT INTERNO — retransmitir mensajes
// ──────────────────────────────────────────

// Teclado del chat para el telefonista
function tecladoChatTelf(escortUid: number): object {
  return {
    inline_keyboard: [
      [{ text: "❌ Cancelar servicio", callback_data: `cancelar_chat_${escortUid}` }],
    ],
  };
}

// Teclado del chat para la escort (en el grupo)
function tecladoChatEscort(telfUid: number, terminal: string, monto: string): object {
  return {
    inline_keyboard: [
      [{ text: "✅ Marcar como atendido", callback_data: `atendido_${telfUid}` }],
      [{ text: "❌ Cerrar sin servicio",  callback_data: `sinservicio_${telfUid}` }],
    ],
  };
}

async function abrirChat(escortUid: number, escortNombre: string, telfUid: number) {
  const telfConv  = convTelf[telfUid];
  const escortConv = convEscort[escortUid];
  if (!telfConv || !escortConv) return;

  // Registrar chat activo
  chatsActivos[escortUid] = telfUid;
  telfConv.escortUid    = escortUid;
  telfConv.escortNombre = escortNombre;

  // Marcar escort ocupada
  if (escorts[escortUid]) { escorts[escortUid].libre = false; escorts[escortUid].ocupadaTexto = "con cliente"; }

  // Editar mensaje en escorts → SERVICIO ACTIVO
  if (escortConv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, escortConv.escortMsgId,
      `🟡 *TIENES UN CLIENTE ACTIVO*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal del cliente: \`${escortConv.terminal}\`\n` +
      `💰 El cliente pagará aproximadamente: *$${escortConv.monto}*\n` +
      `━━━━━━━━━━━━━━\n\n` +
      `💬 *Puedes escribir o enviar fotos aquí.*\n` +
      `Tus mensajes le llegarán al telefonista directamente.\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `⬇️ *Cuando el cliente termine, usa los botones de abajo:*\n\n` +
      `✅ *Marcar como atendido* → Si el cliente pagó\n` +
      `❌ *Cerrar sin servicio* → Si el cliente se fue sin pagar o algo salió mal`,
      { reply_markup: tecladoChatEscort(telfUid, escortConv.terminal!, escortConv.monto!) }
    );
  }

  // Notificar telefonista — servicio aceptado + chat abierto
  await enviarTelf(telfUid,
    `✅ *¡Servicio aceptado!*\n━━━━━━━━━━━━━━\n` +
    `💃 *Escort ${fn(escortNombre)}* tomó el cliente\n` +
    `📱 Terminal: \`${telfConv.terminal}\`\n` +
    `💰 Estimado: *$${telfConv.monto}*\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `💬 Chat abierto — escribe o envía fotos:\n` +
    `_Tus mensajes llegarán directamente a la escort._`,
    { reply_markup: tecladoChatTelf(escortUid) }
  );

  convEscort[escortUid].paso = "en_chat";
  telfConv.paso = "en_chat";

  // Auto-limpieza de mensajes del chat cada 10 minutos
  setTimeout(async () => {
    const telfC = convTelf[telfUid];
    const escortC = convEscort[escortUid];
    // Solo limpiar si el chat sigue activo
    if (telfC?.paso === "en_chat" && telfC.flowMsgIds && telfC.flowMsgIds.length > 5) {
      // Conservar solo el último mensaje (el del chat activo con botones)
      const toDelete = telfC.flowMsgIds.slice(0, -1);
      for (const id of toDelete) {
        await deleteMsg(telfUid, id);
      }
      telfC.flowMsgIds = telfC.flowMsgIds.slice(-1);
    }
  }, 10 * 60 * 1000);

  await notificarTelefonistas();
}

// ──────────────────────────────────────────
// CERRAR SERVICIO
// ──────────────────────────────────────────

async function cerrarServicio(
  escortUid: number,
  escortNombre: string,
  telfUid: number,
  terminal: string,
  montoReal: number | null,
  motivo?: string
) {
  const telfConv  = convTelf[telfUid];
  const telfNombre = telfConv?.nombre ?? "Telefonista";
  const convE      = convEscort[escortUid];
  const ahora      = new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });

  delete chatsActivos[escortUid];
  if (escorts[escortUid]) { escorts[escortUid].libre = true; escorts[escortUid].ocupadaTexto = undefined; }

  if (montoReal !== null) {
    // ── SERVICIO COMPLETADO CON PAGO ──
    const comision = calcularComision(montoReal);
    comisiones[telfUid] = (comisiones[telfUid] ?? 0) + comision;
    const total = comisiones[telfUid];

    historial[terminal] = {
      veces: (historial[terminal]?.veces ?? 0) + 1,
      ultimoPago: montoReal,
      ultimaEscort: fn(escortNombre),
      ultimaFecha: hoy(),
    };

    // Mensaje a la ESCORT (claro y simple)
    if (convE?.escortMsgId) {
      await editMsg(GRUPO_ESCORTS, convE.escortMsgId,
        `✅ *¡SERVICIO COMPLETADO!*
` +
        `━━━━━━━━━━━━━━
` +
        `🕐 Hora de cierre: *${ahora}*
` +
        `📱 Terminal del cliente: \`${terminal}\`
` +
        `💰 Monto que pagó el cliente: *$${montoReal}*
` +
        `👤 Telefonista que lo envió: *${fn(telfNombre)}*
` +
        `━━━━━━━━━━━━━━
` +
        `_Cuando el cliente se vaya, toca el botón de abajo._`,
        { reply_markup: { inline_keyboard: [[{ text: "🟢 Ya terminé, estoy libre", callback_data: `yalibre_${escortUid}` }]] } }
      ).catch(() => {});
    }

    // Mensaje al TELEFONISTA (claro y simple)
    convTelf[telfUid] = { paso: "idle", nombre: telfNombre };
    await limpiarChat(telfUid, telfNombre);
    await sendMsg(telfUid,
      `✅ *¡SERVICIO COMPLETADO!*
` +
      `━━━━━━━━━━━━━━
` +
      `🕐 Hora de cierre: *${ahora}*
` +
      `📱 Terminal del cliente: \`${terminal}\`
` +
      `💰 Lo que pagó el cliente: *$${montoReal}*
` +
      `💵 Tu ganancia (comisión): *+$${comision}*
` +
      `📊 Tu balance total acumulado: *$${total}*
` +
      `💃 Atendido por: *${fn(escortNombre)}*
` +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [[{ text: "🧹 Limpiar chat", callback_data: `limpiar_${telfUid}` }]] } }
    );

  } else {
    // ── SERVICIO CERRADO SIN PAGO ──
    const motivoTexto = motivo ?? "No especificado";

    // Mensaje a la ESCORT
    if (convE?.escortMsgId) {
      await editMsg(GRUPO_ESCORTS, convE.escortMsgId,
        `❌ *SERVICIO CERRADO SIN ATENDER*
` +
        `━━━━━━━━━━━━━━
` +
        `🕐 Hora de cierre: *${ahora}*
` +
        `📱 Terminal del cliente: \`${terminal}\`
` +
        `💰 Lo que iba a pagar (estimado): *$${convE?.monto ?? "—"}*
` +
        `📋 Motivo del cierre: *${motivoTexto}*
` +
        `👤 Telefonista que lo envió: *${fn(telfNombre)}*
` +
        `━━━━━━━━━━━━━━
` +
        `_Ya quedas libre para el próximo cliente._`,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }

    // Mensaje al TELEFONISTA
    convTelf[telfUid] = { paso: "idle", nombre: telfNombre };
    await limpiarChat(telfUid, telfNombre);
    await sendMsg(telfUid,
      `❌ *SERVICIO CERRADO SIN ATENDER*
` +
      `━━━━━━━━━━━━━━
` +
      `🕐 Hora de cierre: *${ahora}*
` +
      `📱 Terminal del cliente: \`${terminal}\`
` +
      `💰 Lo que iba a pagar (estimado): *$${convE?.monto ?? "—"}*
` +
      `📋 Motivo: *${motivoTexto}*
` +
      `💃 Escort que atendió: *${fn(escortNombre)}*
` +
      `━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [[{ text: "🧹 Limpiar chat", callback_data: `limpiar_${telfUid}` }]] } }
    );
  }

  delete convEscort[escortUid];
  await liberarTurno();
  await notificarTelefonistas();
}

// ──────────────────────────────────────────
// PANEL ESCORTS
// ──────────────────────────────────────────

async function publicarPanelEscorts() {
  const lista = Object.values(escorts);
  if (lista.length === 0) {
    await sendMsg(GRUPO_ESCORTS, `📋 *Panel de Escorts*\n\n_Escribe cualquier mensaje para registrarte._`);
    return;
  }
  for (const e of lista) {
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: e.libre
        ? `👤 *${fn(e.nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`
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

  // ── /panel en escorts ──
  if (texto === "/panel" && chatId === GRUPO_ESCORTS) {
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);
    await publicarPanelEscorts();
    return;
  }

  // ── Registro automático de escorts y chat en grupo escorts ──
  if (chatId === GRUPO_ESCORTS) {
    // Registrar si es nueva
    if (!escorts[uid]) {
      escorts[uid] = { uid, nombre, libre: true };
      await notificarTelefonistas(`🟢 *${fn(nombre)}* se registró como escort.`);
    }

    // Si escort tiene chat activo — retransmitir mensaje al telefonista
    const telfUid = chatsActivos[uid];
    if (telfUid && convEscort[uid]?.paso === "en_chat") {
      // No borrar — los mensajes del chat quedan como historial

      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption ? `\n_${msg.caption}_` : "";
        await tPost("sendPhoto", {
          chat_id: telfUid,
          photo: fileId,
          caption: `💃 *Escort ${fn(nombre)}:*${caption}`,
          parse_mode: "Markdown",
        });
      } else if (texto && !tieneContacto(texto)) {
        await sendMsg(telfUid, `💃 *Escort ${fn(nombre)}:*
${texto}`);
      } else if (tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS, `🚫 *${fn(nombre)}*, no se permiten teléfonos ni redes sociales.`);
      }
      return;
    }

    // Flujo de convEscort (tiempo custom, monto real, otro)
    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

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
      await notificarTelefonistas(`🔴 *${fn(nombre)}* se puso ocupada (${mins} min).`);
      return;
    }

    if (conv.paso === "esperando_monto_real") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) { await sendMsg(GRUPO_ESCORTS, `⚠️ Ingresa solo el número. Ej: *120*`); return; }
      await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, parseFloat(ml));
      return;
    }

    if (conv.paso === "esperando_otro") {
      await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, null, texto);
      return;
    }

    if (conv.paso === "esperando_nota") {
      if (tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS, `🚫 No se permiten teléfonos ni redes sociales.`,
          { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }
        );
        return;
      }
      convEscort[uid] = { ...conv, nota: texto };
      await confirmarEscort(uid, nombre);
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
    const conv = convTelf[uid];
    if (!conv) return;

    if (conv.paso === "en_chat") {
      // Durante el chat, trackear los mensajes del usuario para borrarlos al cerrar
      if (!conv.flowMsgIds) conv.flowMsgIds = [];
      conv.flowMsgIds.push(msg.message_id);
    } else {
      await deleteMsg(uid, msg.message_id);
    }

    // Si está en chat activo — retransmitir a la escort
    if (conv.paso === "en_chat" && conv.escortUid) {
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption ? `\n_${msg.caption}_` : "";
        await tPost("sendPhoto", {
          chat_id: GRUPO_ESCORTS,
          photo: fileId,
          caption: `📞 *Telefonista ${fn(conv.nombre)}:*${caption}`,
          parse_mode: "Markdown",
        });
      } else if (texto && !tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS, `📞 *Telefonista ${fn(conv.nombre)}:*
${texto}`);
      } else if (tieneContacto(texto)) {
        await sendMsg(uid, `🚫 No se permiten teléfonos ni redes sociales.`);
      }
      return;
    }

    // Flujo de registro
    if (conv.paso === "idle" || conv.paso === "en_chat") return;

    if (conv.paso === "esperando_terminal") {
      if (!/^\d{4}$/.test(texto)) {
        await enviarTelf(uid, `⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
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
        await enviarTelf(uid, `🚫 No se permiten teléfonos ni redes sociales.`,
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
// CONFIRMAR ESCORT ACEPTÓ
// ──────────────────────────────────────────

async function confirmarEscort(escortUid: number, escortNombre: string) {
  const conv = convEscort[escortUid];
  if (!conv?.telfUid) return;
  const nota = conv.nota ? `\n📝 _${conv.nota}_` : "";

  // Editar mensaje en escorts
  if (conv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `💬 *Chat activo con telefonista*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${conv.terminal}\`\n` +
      `💰 Estimado: *$${conv.monto}*${nota}\n━━━━━━━━━━━━━━\n\n` +
      `Escribe aquí para hablar con el telefonista:`,
      { reply_markup: tecladoChatEscort(conv.telfUid, conv.terminal!, conv.monto!) }
    );
  }
  await abrirChat(escortUid, escortNombre, conv.telfUid);
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const msgId: number  = query.message.message_id;

  // ── Nuevo Cliente ──
  if (data === "nuevo_cliente") {
    await answerCB(query.id);
    const nombreActual = nombre || convTelf[uid]?.nombre || telefonistas[uid] || "Telefonista";
    telefonistas[uid] = nombreActual;
    if (!convTelf[uid]) convTelf[uid] = { paso: "idle", nombre: nombreActual };
    else convTelf[uid].nombre = nombreActual;
    await intentarTurno(uid);
    return;
  }

  // ── Cancelar telefonista ──
  if (data === "cancelar_telf") {
    await answerCB(query.id);
    await cancelarTelf(uid);
    return;
  }

  // ── Cancelar chat ──
  if (data.startsWith("cancelar_chat_")) {
    await answerCB(query.id);
    await cancelarTelf(uid);
    return;
  }

  // ── Salir de cola ──
  if (data === "salir_cola") {
    await answerCB(query.id);
    const idx = colaEspera.indexOf(uid);
    if (idx !== -1) colaEspera.splice(idx, 1);
    if (convTelf[uid]) convTelf[uid].paso = "idle";
    await mostrarPanelTelf(uid, nombre);
    return;
  }

  // ── Monto rápido ──
  if (data.startsWith("m_")) {
    await answerCB(query.id);
    const monto = data.replace("m_", "");
    const conv  = convTelf[uid];
    if (conv?.paso === "esperando_monto") { conv.monto = monto; await pasoDescripcion(uid); }
    return;
  }

  // ── Sin nota telefonista ──
  if (data === "sin_nota_telf") {
    await answerCB(query.id);
    await publicarCliente(uid);
    return;
  }

  // ── ESCORT: Acepta cliente ──
  if (data.startsWith("acepto_")) {
    if (!escorts[uid]) return answerCB(query.id, "❌ No estás registrada.", true);
    if (!escorts[uid].libre) return answerCB(query.id, "❌ Ya estás atendiendo un cliente. Para aceptar este debes cerrar el que ya estás atendiendo.", true);
    const parts = data.split("_");
    convEscort[uid] = {
      paso: "esperando_nota",
      terminal: parts[1],
      monto: parts[2],
      escortMsgId: msgId,
      telfUid: parseInt(parts[3]),
      telfNombre: convTelf[parseInt(parts[3])]?.nombre ?? "Telefonista",
    };
    await editMsg(GRUPO_ESCORTS, msgId,
      `🔒 *${fn(nombre)} aceptó el cliente*\n━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${parts[1]}\`\n💰 Estimado: *$${parts[2]}*\n━━━━━━━━━━━━━━\n\n` +
      `⚠️ *Para activar el servicio debes:*\n` +
      `• Escribir una nota para el telefonista, *O*\n` +
      `• Tocar el botón *"✅ Confirmar — Sin nota"*\n\n` +
      `_El servicio NO se activa hasta que confirmes._`,
      { reply_markup: { inline_keyboard: [[{ text: "✅ Confirmar — Sin nota", callback_data: `escortnota_${uid}` }]] } }
    );
    return answerCB(query.id, "⚠️ Toca 'Confirmar — Sin nota' o escribe una nota para activar el servicio.", true);
  }

  // ── ESCORT: Sin nota ──
  if (data.startsWith("escortnota_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    await confirmarEscort(uid, nombre);
    return;
  }

  // ── ESCORT: Marcar como atendido ──
  if (data.startsWith("atendido_")) {
    // formato: atendido_TELFUID (simple, sin terminal en callback)
    const telfUid = parseInt(data.split("_")[1]);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ No tienes un servicio activo.", true);
    await answerCB(query.id);

    // Guardar msgId del mensaje de chat para editarlo
    convEscort[uid] = { ...conv, paso: "esperando_monto_real", escortMsgId: msgId, telfUid };

    await editMsg(GRUPO_ESCORTS, msgId,
      `✅ *¿Cuánto pagó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [
        [{ text: "$50",  callback_data: `pm_50_${uid}`  },
         { text: "$100", callback_data: `pm_100_${uid}` }],
        [{ text: "$150", callback_data: `pm_150_${uid}` },
         { text: "$200", callback_data: `pm_200_${uid}` }],
        [{ text: "💵 Otro monto", callback_data: `pm_otro_${uid}` }],
      ]}}
    );
    return;
  }

  // ── ESCORT: Sin servicio ──
  if (data.startsWith("sinservicio_")) {
    const telfUid = parseInt(data.split("_")[1]);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ No tienes un servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, paso: "esperando_otro", escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `❌ *¿Por qué no hubo servicio?*\n━━━━━━━━━━━━━━\nEscribe el motivo en el grupo:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  // ── ESCORT: Monto rápido (pm_MONTO_ESCORTUID) ──
  if (data.startsWith("pm_") && !data.startsWith("pm_otro_")) {
    const parts = data.split("_");
    const montoReal = parseInt(parts[1]);
    const escortId  = parseInt(parts[2]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id);
    delete convEscort[uid];
    await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, montoReal);
    return;
  }

  // ── ESCORT: Otro monto ──
  if (data.startsWith("pm_otro_")) {
    const escortId = parseInt(data.split("_")[2]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, paso: "esperando_monto_real", escortMsgId: msgId };
    await editMsg(GRUPO_ESCORTS, msgId,
      `💵 *¿Cuánto pagó el cliente?*\n━━━━━━━━━━━━━━\nEscribe el monto en el grupo:`,
      { reply_markup: { inline_keyboard: [] } }
    );
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
        [{ text: "⏱ Otro", callback_data: `t_otro_${uid}` }],
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
      `👤 *${fn(nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)}* ya está libre.`);
    return;
  }

  // ── TELEFONISTA: Limpiar chat ──
  if (data.startsWith("limpiar_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu chat.", true);
    await answerCB(query.id, "🧹 Limpiando...");
    // Borrar historial: Telegram permite borrar msgs propios del bot
    // Borramos el mensaje de resumen (este mismo)
    await deleteMsg(uid, msgId);
    // El panel ya se mostró — no hacer nada más
    return;
  }

  // ── ESCORT: Limpiar chat del grupo ──
  if (data.startsWith("limpiar_escort_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu chat.", true);
    await answerCB(query.id, "🧹 Limpiado.");
    // Quitar el botón de limpiar del panel de la escort
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*
✨ Estás libre. Te avisaré cuando haya un cliente.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    ).catch(() => {});
    return;
  }

  // ── ESCORT: Ya estoy libre (post-servicio) ──
  if (data.startsWith("yalibre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; escorts[uid].ocupadaHasta = undefined; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`,
      { reply_markup: { inline_keyboard: [
        [{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }],
        [{ text: "🧹 Limpiar mi chat", callback_data: `limpiar_escort_${uid}` }],
      ]}}
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)}* terminó y está libre.`);
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
