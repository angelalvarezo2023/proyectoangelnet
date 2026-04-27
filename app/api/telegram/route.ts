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
  | "esperando_terminal"
  | "esperando_monto"
  | "esperando_descripcion"
  | "esperando_accion"       // escort aceptó → telf decide
  | "cliente_enviado";       // telf confirmó → esperando resultado

type PasoEscort =
  | "esperando_nota"
  | "esperando_tiempo_custom"
  | "esperando_monto_real";

interface ConvTelf {
  paso: PasoTelf;
  nombre?: string;
  terminal?: string;
  monto?: string;
  descripcion?: string;
  flowMsgId?: number;    // único msg en privado que se edita
  grupMsgId?: number;    // msg en grupo telefonistas
  escortMsgId?: number;  // msg en grupo escorts
  escortUid?: number;
  escortNombre?: string;
  ultimaPregunta?: number;
}

interface ConvEscort {
  paso: PasoEscort;
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

const convTelf:   Record<number, ConvTelf>   = {};
const convEscort: Record<number, ConvEscort> = {};
const comisiones: Record<number, number>     = {};
const escorts:    Record<number, EstadoEscort> = {};
const telefonistas: Record<number, string>   = {};

let   colaActiva: number | null = null;
const colaEspera: number[]      = [];

// Historial de terminales
interface HistorialTerminal {
  veces: number;
  ultimoPago: number;
  ultimaEscort: string;
  ultimaFecha: string;
}
const historialTerminales: Record<string, HistorialTerminal> = {};

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

async function esEscort(uid: number): Promise<boolean> {
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

function tieneContacto(texto: string): boolean {
  return [
    /\b\d[\d\s\-().]{6,}\d\b/,
    /@[a-zA-Z0-9_.]+/,
    /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i,
    /\b(t\.me|wa\.me|bit\.ly)\b/i,
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,
  ].some(p => p.test(texto));
}

function fn(nombre: string): string {
  return (nombre ?? "").split(" ")[0];
}

function calcularComision(monto: number): number {
  if (monto <= 100) return 15;
  if (monto <= 150) return 25;
  if (monto <= 200) return 30;
  return Math.round(monto * 0.15);
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
      e.libre = true;
      e.ocupadaHasta = undefined;
      e.ocupadaTexto = undefined;
    }
  }
  return lista.map(e =>
    e.libre
      ? `🟢 *${fn(e.nombre)}* — Disponible`
      : `🔴 *${fn(e.nombre)}* — Ocupada${e.ocupadaTexto ? ` (${e.ocupadaTexto})` : ""}`
  ).join("\n");
}

function textoCola(): string {
  if (colaActiva === null) return "";
  const activoNombre = fn(telefonistas[colaActiva] ?? "Telefonista");
  let txt = `🎯 Turno actual: *${activoNombre}*`;
  if (colaEspera.length > 0) {
    txt += `\n⏳ En espera: ${colaEspera.map((u, i) => `${i + 1}. ${fn(telefonistas[u] ?? "?")}`).join(", ")}`;
  }
  return txt;
}

async function notificarTelefonistas(extraInfo?: string) {
  // En vez de enviar mensajes nuevos, editar el panel existente de cada telefonista
  for (const uid of Object.keys(telefonistas).map(Number)) {
    const conv = convTelf[uid];
    if (!conv?.flowMsgId) continue;
    // Solo actualizar el panel si está en idle (no en medio de un flujo)
    if (conv.paso !== "idle") continue;
    const panelTexto =
      `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Estado de escorts:*\n${textoEscorts()}\n━━━━━━━━━━━━━━` +
      (extraInfo ? `\n\n${extraInfo}` : ``) +
      `\n\nUsa el botón para registrar un nuevo cliente.`;
    await editMsg(uid, conv.flowMsgId, panelTexto, { reply_markup: KB_INICIO }).catch(() => {});
  }
}

// ──────────────────────────────────────────
// TECLADOS
// ──────────────────────────────────────────

const KB_INICIO = {
  keyboard: [[{ text: "📞 Nuevo Cliente" }]],
  resize_keyboard: true, persistent: true,
};

const KB_CANCELAR = {
  keyboard: [[{ text: "❌ Cancelar" }]],
  resize_keyboard: true, persistent: true,
};

const KB_MONTOS = {
  keyboard: [
    [{ text: "$50" }, { text: "$100" }, { text: "$150" }, { text: "$200" }],
    [{ text: "❌ Cancelar" }],
  ],
  resize_keyboard: true, persistent: true,
};

const KB_DESC = {
  keyboard: [[{ text: "➡️ Sin descripción" }], [{ text: "❌ Cancelar" }]],
  resize_keyboard: true, persistent: true,
};

const KB_ACCION = {
  keyboard: [
    [{ text: "✈️ Lo envié, ya va de camino" }],
    [{ text: "🚪 Cliente se fue" }],
    [{ text: "❌ Cancelar servicio" }],
  ],
  resize_keyboard: true, persistent: true,
};

const KB_LLEGO = {
  keyboard: [[{ text: "📍 ¿Llegó?" }], [{ text: "❌ Cancelar servicio" }]],
  resize_keyboard: true, persistent: true,
};

// ──────────────────────────────────────────
// MENSAJES DEL FLUJO TELEFONISTA (un solo msg)
// ──────────────────────────────────────────

function msgPaso1(nombre: string, cola: string): string {
  return (
    `📞 *Registrar Cliente*\n` +
    `━━━━━━━━━━━━━━\n` +
    (cola ? `${cola}\n━━━━━━━━━━━━━━\n` : ``) +
    `\n✏️ Escribe el *número terminal* del cliente (4 dígitos):`
  );
}

function infoTerminal(terminal: string): string {
  const h = historialTerminales[terminal];
  if (!h) return "";
  return (
    `\n⚠️ *Terminal conocida*\n` +
    `🔁 Visitas anteriores: *${h.veces}*\n` +
    `💰 Último pago: *$${h.ultimoPago}*\n` +
    `🙋 Última escort: *${h.ultimaEscort}*\n` +
    `📅 Última visita: *${h.ultimaFecha}*`
  );
}

function msgPaso2(terminal: string): string {
  const info = infoTerminal(terminal);
  return (
    `📞 *Registrar Cliente*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    (info ? `━━━━━━━━━━━━━━${info}\n` : ``) +
    `━━━━━━━━━━━━━━\n` +
    `\n💵 ¿Cuánto estimas que pagará?\nElige un monto o escríbelo:`
  );
}

function msgPaso3(terminal: string, monto: string): string {
  return (
    `📞 *Registrar Cliente*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Estimado a pagar: *$${monto}*\n` +
    `━━━━━━━━━━━━━━\n` +
    `\n📝 ¿Deseas agregar una nota?\n_No se permiten teléfonos ni redes sociales._`
  );
}

function msgEsperando(terminal: string, monto: string, desc?: string): string {
  const nota = desc ? `\n📝 _${desc}_` : "";
  return (
    `⏳ *Buscando escort disponible...*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Estimado a pagar: *$${monto}*${nota}\n` +
    `━━━━━━━━━━━━━━\n` +
    `\n👥 *Estado de escorts:*\n${textoEscorts()}`
  );
}

function msgEscortLista(terminal: string, monto: string, escortNombre: string, nota?: string): string {
  const n = nota ? `\n📝 _${nota}_` : "";
  return (
    `✅ *¡${fn(escortNombre)} está lista!*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Estimado a pagar: *$${monto}*${n}\n` +
    `━━━━━━━━━━━━━━\n` +
    `\n¿Qué hago?`
  );
}

function msgEnviado(terminal: string, monto: string, escortNombre: string): string {
  return (
    `✈️ *Cliente enviado*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Estimado: *$${monto}*\n` +
    `🙋 Escort: *${fn(escortNombre)}*\n` +
    `━━━━━━━━━━━━━━\n` +
    `\nEspera que la escort confirme si el cliente llegó.\nPuedes preguntar con el botón de abajo.`
  );
}

function msgCompletado(terminal: string, montoReal: number, comision: number, total: number, escortNombre: string): string {
  return (
    `🎉 *¡Servicio completado!*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `💵 Tu comisión: *+$${comision}*\n` +
    `📊 Balance acumulado: *$${total}*\n` +
    `🙋 Atendido por: *${fn(escortNombre)}*\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `👥 *Escorts:*\n${textoEscorts()}`
  );
}

// ──────────────────────────────────────────
// MENSAJE EN GRUPO ESCORTS (un solo msg que se edita)
// ──────────────────────────────────────────

function msgClienteEscorts(terminal: string, monto: string, telfNombre: string, desc?: string): string {
  const nota = desc ? `\n📝 _${desc}_` : "";
  return (
    `🔔 *CLIENTE DISPONIBLE*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal del cliente: \`${terminal}\`\n` +
    `💰 Estimado a pagar: *$${monto}*${nota}\n` +
    `📲 Enviado por: *${fn(telfNombre)}*\n` +
    `━━━━━━━━━━━━━━\n` +
    `👆 Toca el botón si estás disponible`
  );
}

// ──────────────────────────────────────────
// COLA
// ──────────────────────────────────────────

async function intentarTurno(uid: number, nombre: string, flowMsgId: number) {
  if (colaActiva === null || colaActiva === uid) {
    colaActiva = uid;
    await iniciarFlujo(uid, nombre, flowMsgId);
  } else {
    if (!colaEspera.includes(uid)) colaEspera.push(uid);
    const pos = colaEspera.indexOf(uid) + 1;
    await editMsg(uid, flowMsgId,
      `⏳ *Hay un registro en curso*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nEstás en la posición *#${pos}*. Te avisaré cuando sea tu turno.`,
      { reply_markup: { keyboard: [[{ text: "❌ Salir de la cola" }]], resize_keyboard: true, persistent: true } }
    );
  }
}

async function liberarTurno() {
  colaActiva = null;
  if (colaEspera.length > 0) {
    // Notificar al siguiente con 30s de anticipación si hay más de 1 en cola
    if (colaEspera.length > 1) {
      const proximo = colaEspera[0];
      const convProximo = convTelf[proximo];
      if (convProximo?.flowMsgId) {
        await editMsg(proximo, convProximo.flowMsgId,
          `⏰ *¡Prepárate, casi es tu turno!*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nSerás el siguiente en *30 segundos*.`,
          { reply_markup: { keyboard: [[{ text: "❌ Salir de la cola" }]], resize_keyboard: true, persistent: true } }
        ).catch(() => {});
      }
      // Esperar 30 segundos antes de darle el turno
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    const siguiente = colaEspera.shift()!;
    colaActiva = siguiente;
    const conv = convTelf[siguiente];
    if (conv?.flowMsgId) {
      await editMsg(siguiente, conv.flowMsgId,
        `✅ *¡Es tu turno!*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\n✏️ Escribe el *número terminal* del cliente (4 dígitos):`,
        { reply_markup: KB_CANCELAR }
      );
      convTelf[siguiente] = { ...conv, paso: "esperando_terminal" };
    }
    // Actualizar posición de los demás en cola
    for (let i = 0; i < colaEspera.length; i++) {
      const u = colaEspera[i];
      const c = convTelf[u];
      if (c?.flowMsgId) {
        await editMsg(u, c.flowMsgId,
          `⏳ *Hay un registro en curso*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nAhora estás en la posición *#${i + 1}*.`,
          { reply_markup: { keyboard: [[{ text: "❌ Salir de la cola" }]], resize_keyboard: true, persistent: true } }
        ).catch(() => {});
      }
    }
  }
}

// ──────────────────────────────────────────
// FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function iniciarFlujo(uid: number, nombre: string, flowMsgId: number) {
  convTelf[uid] = { ...convTelf[uid], paso: "esperando_terminal", nombre, flowMsgId };
  await editMsg(uid, flowMsgId, msgPaso1(nombre, textoCola()), { reply_markup: KB_CANCELAR });
}

async function cancelarTelf(uid: number) {
  const conv = convTelf[uid];

  if (conv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
      `❌ *Registro cancelado*\n📱 Terminal: \`${conv.terminal ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }
  if (conv?.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `❌ *Servicio cancelado por el telefonista*\n📱 Terminal: \`${conv.terminal ?? "—"}\``,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }
  if (conv?.escortUid && escorts[conv.escortUid]) {
    escorts[conv.escortUid].libre = true;
    escorts[conv.escortUid].ocupadaTexto = undefined;
  }

  const flowMsgId = conv?.flowMsgId;
  convTelf[uid] = { paso: "idle", nombre: conv?.nombre, flowMsgId };
  await liberarTurno();

  if (flowMsgId) {
    await editMsg(uid, flowMsgId,
      `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Escorts:*\n${textoEscorts()}\n\n_Registro cancelado. Puedes iniciar uno nuevo._`,
      { reply_markup: KB_INICIO }
    );
  }

  await notificarTelefonistas();
}

async function publicarClienteEscorts(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (!conv?.flowMsgId) return;

  // Mensaje en grupo telefonistas
  const gMsg = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text:
      `📲 *${fn(nombre)}* está enviando un cliente\n` +
      `━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${conv.terminal}\`\n` +
      `💰 Estimado: *$${conv.monto}*\n` +
      `━━━━━━━━━━━━━━`,
  });

  // Mensaje en grupo escorts (este se editará durante todo el flujo)
  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text: msgClienteEscorts(conv.terminal!, conv.monto!, nombre, conv.descripcion),
    reply_markup: {
      inline_keyboard: [[
        { text: "🙋 Estoy lista, mándalo", callback_data: `acepto_${conv.terminal}_${conv.monto}_${uid}` }
      ]],
    },
  });

  const escortMsgId = eMsg?.result?.message_id;
  const grupMsgId   = gMsg?.result?.message_id;

  convTelf[uid] = {
    ...conv,
    paso: "esperando_accion",
    grupMsgId,
    escortMsgId,
  };

  // Actualizar el único mensaje del telefonista
  await editMsg(uid, conv.flowMsgId,
    msgEsperando(conv.terminal!, conv.monto!, conv.descripcion),
    { reply_markup: { keyboard: [[{ text: "❌ Cancelar servicio" }]], resize_keyboard: true, persistent: true } }
  );
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT ACEPTÓ
// ──────────────────────────────────────────

async function confirmarEscort(escortUid: number, escortNombre: string) {
  const conv     = convEscort[escortUid];
  if (!conv?.telfUid) return;
  const telfConv = convTelf[conv.telfUid];
  const nota     = conv.nota;

  // Marcar escort ocupada
  if (escorts[escortUid]) {
    escorts[escortUid].libre = false;
    escorts[escortUid].ocupadaTexto = "con cliente";
  }

  // Editar mensaje en escorts → EN PROCESO
  if (conv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `🟡 *EN PROCESO*\n` +
      `━━━━━━━━━━━━━━\n` +
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
      `✅ *Escort asignada*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${conv.terminal}\`\n🙋 Escort: *${fn(escortNombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }

  // Actualizar único mensaje del telefonista
  if (telfConv?.flowMsgId) {
    await editMsg(conv.telfUid, telfConv.flowMsgId,
      msgEscortLista(conv.terminal!, conv.monto!, escortNombre, nota),
      { reply_markup: KB_ACCION }
    );
  }

  convTelf[conv.telfUid] = {
    ...telfConv,
    paso: "esperando_accion",
    escortUid,
    escortNombre,
  };

  await notificarTelefonistas();
  delete convEscort[escortUid];
}

// ──────────────────────────────────────────
// PROCESAR PAGO FINAL
// ──────────────────────────────────────────

async function procesarPago(
  escortUid: number,
  escortNombre: string,
  telfUid: number,
  terminal: string,
  montoReal: number,
  escortMsgId: number
) {
  const telfConv = convTelf[telfUid];
  const comision = calcularComision(montoReal);
  comisiones[telfUid] = (comisiones[telfUid] ?? 0) + comision;
  const total = comisiones[telfUid];

  // Guardar en historial de terminales
  const hoy = new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
  historialTerminales[terminal] = {
    veces: (historialTerminales[terminal]?.veces ?? 0) + 1,
    ultimoPago: montoReal,
    ultimaEscort: fn(escortNombre),
    ultimaFecha: hoy,
  };


  // Escorts — completado con botón "Ya estoy libre"
  await editMsg(GRUPO_ESCORTS, escortMsgId,
    `✅ *SERVICIO COMPLETADO*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Terminal: \`${terminal}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `🙋 Escort: *${fn(escortNombre)}*\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `_Toca el botón cuando termines con el cliente._`,
    { reply_markup: { inline_keyboard: [[{ text: "🟢 Ya estoy libre", callback_data: `yalibre_${escortUid}` }]] } }
  );

  // Grupo telefonistas — celebración
  const telfNombre = fn(telfConv?.nombre ?? "Telefonista");
  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `🎉 *¡Servicio completado!*\n` +
      `━━━━━━━━━━━━━━\n` +
      `👤 *${telfNombre}* cerró un cliente exitosamente\n` +
      `💰 Cantidad pagada: *$${montoReal}*\n` +
      `💵 Balance actual: *$${total}*\n` +
      `🙋 Atendido por: *${fn(escortNombre)}*\n` +
      `━━━━━━━━━━━━━━\n` +
      `¡Felicidades ${telfNombre}! 🏆`,
      { reply_markup: { inline_keyboard: [] } }
    ).catch(() => {});
  }

  // Único mensaje del telefonista → completado
  if (telfConv?.flowMsgId) {
    await editMsg(telfUid, telfConv.flowMsgId,
      msgCompletado(terminal, montoReal, comision, total, escortNombre),
      { reply_markup: KB_INICIO }
    );
  }

  convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre, flowMsgId: telfConv?.flowMsgId };
  await liberarTurno();
}

// ──────────────────────────────────────────
// ACCIONES DEL TELEFONISTA (teclado real)
// ──────────────────────────────────────────

async function manejarAccionTelf(uid: number, texto: string, msgId?: number, nombre?: string) {
  // Si no hay conv o perdió el flowMsgId (reinicio del servidor), crear panel nuevo
  if (!convTelf[uid] || !convTelf[uid].flowMsgId) {
    const n = nombre ?? convTelf[uid]?.nombre ?? "Telefonista";
    const r = await sendMsg(uid,
      `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Estado de escorts:*\n${textoEscorts()}\n━━━━━━━━━━━━━━\n\nUsa el botón para registrar un nuevo cliente.`,
      { reply_markup: KB_INICIO }
    );
    convTelf[uid] = { paso: "idle", nombre: n, flowMsgId: r?.result?.message_id };
    if (nombre) telefonistas[uid] = nombre;
    // Si era "Nuevo Cliente", ya mostramos el panel actualizado — salir
    if (texto === "📞 Nuevo Cliente") return;
  }
  const conv = convTelf[uid];

  // ── Cancelar en cualquier paso ──
  if (texto === "❌ Cancelar" || texto === "❌ Cancelar servicio") {
    await cancelarTelf(uid);
    return;
  }

  // ── Salir de la cola ──
  if (texto === "❌ Salir de la cola") {
    const idx = colaEspera.indexOf(uid);
    if (idx !== -1) colaEspera.splice(idx, 1);
    convTelf[uid] = { paso: "idle", nombre: conv.nombre, flowMsgId: conv.flowMsgId };
    if (conv.flowMsgId) {
      await editMsg(uid, conv.flowMsgId,
        `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Escorts:*\n${textoEscorts()}`,
        { reply_markup: KB_INICIO }
      );
    }
    return;
  }

  // ── Nuevo Cliente ──
  if (texto === "📞 Nuevo Cliente") {
    if (!conv.flowMsgId) return;
    await intentarTurno(uid, conv.nombre ?? nombre ?? "", conv.flowMsgId);
    return;
  }

  // ── Lo envié ──
  if (texto === "✈️ Lo envié, ya va de camino" && conv.paso === "esperando_accion") {
    convTelf[uid] = { ...conv, paso: "cliente_enviado", ultimaPregunta: 0 };

    // Notificar al grupo de escorts que viene el cliente
    if (conv.escortMsgId) {
      await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
        `✈️ *CLIENTE EN CAMINO*\n` +
        `━━━━━━━━━━━━━━\n` +
        `📱 Terminal: \`${conv.terminal}\`\n` +
        `💰 Estimado: *$${conv.monto}*\n` +
        `🙋 Escort: *${fn(conv.escortNombre ?? "")}*\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `Confirma cuando el cliente llegue:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Llegó", callback_data: `llego_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
              [{ text: "🚪 Se fue", callback_data: `sefue_${conv.terminal}_${conv.monto}_${uid}_${conv.escortUid}` }],
            ],
          },
        }
      );
    }

    // Grupo telefonistas
    if (conv.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
        `✈️ *${fn(conv.nombre ?? "")}* envió el cliente \`${conv.terminal}\` — esperando resultado...`,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }

    // Actualizar único mensaje del telefonista
    if (conv.flowMsgId) {
      await editMsg(uid, conv.flowMsgId,
        msgEnviado(conv.terminal!, conv.monto!, conv.escortNombre ?? ""),
        { reply_markup: KB_LLEGO }
      );
    }
    return;
  }

  // ── Cliente se fue (antes de enviarlo) ──
  if (texto === "🚪 Cliente se fue" && conv.paso === "esperando_accion") {
    if (conv.escortMsgId) {
      await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
        `🚪 *Cliente se fue antes de llegar*\n📱 Terminal: \`${conv.terminal}\``,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    if (conv.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
        `🚪 *Cliente se fue* — Terminal \`${conv.terminal}\``,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    if (conv.escortUid && escorts[conv.escortUid]) {
      escorts[conv.escortUid].libre = true;
      escorts[conv.escortUid].ocupadaTexto = undefined;
    }
    const flowMsgId = conv.flowMsgId;
    convTelf[uid] = { paso: "idle", nombre: conv.nombre, flowMsgId };
    await liberarTurno();
    if (flowMsgId) {
      await editMsg(uid, flowMsgId,
        `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Escorts:*\n${textoEscorts()}\n\n_Cliente registrado como ido._`,
        { reply_markup: KB_INICIO }
      );
    }
    await notificarTelefonistas();
    return;
  }

  // ── ¿Llegó? ──
  if (texto === "📍 ¿Llegó?" && conv.paso === "cliente_enviado") {
    const ahora = Date.now();
    if (conv.ultimaPregunta && ahora - conv.ultimaPregunta < 60000) {
      const segs = Math.ceil((60000 - (ahora - conv.ultimaPregunta)) / 1000);
      // Editar el mismo mensaje con aviso temporal
      if (conv.flowMsgId) {
        await editMsg(uid, conv.flowMsgId,
          `${msgEnviado(conv.terminal!, conv.monto!, conv.escortNombre ?? "")}\n\n⏱ Espera *${segs}s* antes de preguntar de nuevo.`,
          { reply_markup: KB_LLEGO }
        );
      }
      return;
    }

    convTelf[uid] = { ...conv, ultimaPregunta: ahora };

    const DURACION = 180; // 3 minutos
    const terminal = conv.terminal!;
    const monto    = conv.monto!;
    const escId    = conv.escortUid!;

    const botonesEscort = {
      inline_keyboard: [
        [{ text: "✅ Llegó",   callback_data: `llego_${terminal}_${monto}_${uid}_${escId}` }],
        [{ text: "🚪 Se fue", callback_data: `sefue_${terminal}_${monto}_${uid}_${escId}` }],
      ],
    };

    // Enviar mensaje de countdown en escorts
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text:
        `📍 *¿Llegó el cliente?*\n` +
        `━━━━━━━━━━━━━━\n` +
        `📱 Terminal: \`${terminal}\`\n` +
        `⏱ Tiempo: *3:00*\n` +
        `━━━━━━━━━━━━━━`,
      reply_markup: botonesEscort,
    });

    const cuentaMsgId = r?.result?.message_id;
    if (!cuentaMsgId) return;

    // Actualizar msg del telefonista
    if (conv.flowMsgId) {
      await editMsg(uid, conv.flowMsgId,
        `${msgEnviado(terminal, monto, conv.escortNombre ?? "")}\n\n✅ Pregunta enviada. Esperando respuesta de la escort...`,
        { reply_markup: KB_LLEGO }
      );
    }

    // Countdown cada 30 segundos
    let segsRestantes = DURACION;
    const timer = setInterval(async () => {
      segsRestantes -= 30;
      if (segsRestantes <= 0) {
        clearInterval(timer);
        await editMsg(GRUPO_ESCORTS, cuentaMsgId,
          `📍 *¿Llegó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n⏱ *Tiempo agotado*\n━━━━━━━━━━━━━━`,
          { reply_markup: botonesEscort }
        ).catch(() => clearInterval(timer));
        return;
      }
      const m = Math.floor(segsRestantes / 60);
      const s = (segsRestantes % 60).toString().padStart(2, "0");
      await editMsg(GRUPO_ESCORTS, cuentaMsgId,
        `📍 *¿Llegó el cliente?*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n⏱ Tiempo: *${m}:${s}*\n━━━━━━━━━━━━━━`,
        { reply_markup: botonesEscort }
      ).catch(() => clearInterval(timer));
    }, 30000);

    return;
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

  // ── Salida del grupo ──
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

  // ── Registro automático de escorts ──
  if (chatId === GRUPO_ESCORTS && !msg.left_chat_member) {
    if (!escorts[uid]) {
      escorts[uid] = { uid, nombre, libre: true };
      await notificarTelefonistas(`🟢 *${fn(nombre)} se unió como escort.*`);
    }

    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

    if (conv.paso === "esperando_nota") {
      if (tieneContacto(texto)) {
        await sendMsg(GRUPO_ESCORTS,
          `🚫 *${fn(nombre)}*, no se permiten teléfonos ni redes sociales. Intenta de nuevo:`,
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
      if (isNaN(mins) || mins <= 0) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ Escribe solo los minutos. Ej: *45*`);
        return;
      }
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
      if (!/^\d+(\.\d+)?$/.test(ml)) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ Ingresa solo el número. Ej: *120*`);
        return;
      }
      const montoReal = parseFloat(ml);
      delete convEscort[uid];
      await procesarPago(uid, nombre, conv.telfUid!, conv.terminal!, montoReal, conv.escortMsgId!);
      return;
    }
    return;
  }

  // ── Mensajes en privado del telefonista (incluye /start) ──
  if (chatId === uid) {
    // Borrar siempre el mensaje del usuario para mantener el chat limpio
    await deleteMsg(uid, msg.message_id);

    // Función helper para mostrar/refrescar el panel
    async function mostrarPanel() {
      telefonistas[uid] = nombre;
      const existingId = convTelf[uid]?.flowMsgId;
      const panelTexto =
        `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Estado de escorts:*\n${textoEscorts()}\n━━━━━━━━━━━━━━\n\nUsa el botón para registrar un nuevo cliente.`;

      if (existingId) {
        const editResult = await editMsg(uid, existingId, panelTexto, { reply_markup: KB_INICIO }).catch(() => null);
        if (!editResult?.ok) {
          // Mensaje muy viejo, crear uno nuevo
          const r = await sendMsg(uid, panelTexto, { reply_markup: KB_INICIO });
          convTelf[uid] = { paso: "idle", nombre, flowMsgId: r?.result?.message_id };
        } else {
          convTelf[uid] = { ...convTelf[uid], paso: "idle", nombre };
        }
      } else {
        const r = await sendMsg(uid, panelTexto, { reply_markup: KB_INICIO });
        convTelf[uid] = { paso: "idle", nombre, flowMsgId: r?.result?.message_id };
      }
    }

    // /start → verificar acceso y mostrar panel
    if (texto === "/start") {
      const escort = await esEscort(uid);
      if (escort) {
        await sendMsg(uid, `👋 *Bienvenida ${fn(nombre)}.*\nTu panel está en el grupo de escorts.`);
        return;
      }
      const esTelf = await esMiembroTelf(uid);
      if (!esTelf) {
        await sendMsg(uid, "❌ No tienes acceso. Contacta al administrador.");
        return;
      }
      await mostrarPanel();
      return;
    }

    const conv = convTelf[uid];

    // Botones del teclado real — pasar msgId y nombre para recuperar estado tras reinicio
    const botonesAccion = [
      "📞 Nuevo Cliente", "❌ Cancelar", "❌ Cancelar servicio",
      "❌ Salir de la cola", "✈️ Lo envié, ya va de camino",
      "🚪 Cliente se fue", "📍 ¿Llegó?",
    ];
    if (botonesAccion.includes(texto)) {
      await manejarAccionTelf(uid, texto, msg.message_id, nombre);
      return;
    }

    // Si no hay conv o no tiene panel, ignorar
    if (!conv?.flowMsgId) return;

    if (conv.paso === "idle" || conv.paso === "esperando_accion" || conv.paso === "cliente_enviado") return;


    // Paso: terminal
    if (conv.paso === "esperando_terminal") {
      if (!/^\d{4}$/.test(texto)) {
        if (conv.flowMsgId) {
          await editMsg(uid, conv.flowMsgId,
            `${msgPaso1(conv.nombre ?? "", textoCola())}\n\n⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:`,
            { reply_markup: KB_CANCELAR }
          );
        }
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_monto", terminal: texto };
      if (conv.flowMsgId) await editMsg(uid, conv.flowMsgId, msgPaso2(texto), { reply_markup: KB_MONTOS });
      return;
    }

    // Paso: monto escrito manualmente
    if (conv.paso === "esperando_monto") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) {
        if (conv.flowMsgId) await editMsg(uid, conv.flowMsgId, msgPaso2(conv.terminal!), { reply_markup: KB_MONTOS });
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_descripcion", monto: ml };
      if (conv.flowMsgId) await editMsg(uid, conv.flowMsgId, msgPaso3(conv.terminal!, ml), { reply_markup: KB_DESC });
      return;
    }

    // Paso: descripción
    if (conv.paso === "esperando_descripcion") {
      if (texto === "➡️ Sin descripción") {
        await publicarClienteEscorts(uid, conv.nombre ?? "");
        return;
      }
      if (tieneContacto(texto)) {
        if (conv.flowMsgId) {
          await editMsg(uid, conv.flowMsgId,
            `${msgPaso3(conv.terminal!, conv.monto!)}\n\n🚫 No se permiten teléfonos ni redes sociales.`,
            { reply_markup: KB_DESC }
          );
        }
        return;
      }
      convTelf[uid] = { ...conv, descripcion: texto };
      await publicarClienteEscorts(uid, conv.nombre ?? "");
      return;
    }
  }
}

// ──────────────────────────────────────────
// PANEL ESCORTS
// ──────────────────────────────────────────

async function publicarPanelEscorts() {
  const lista = Object.values(escorts);
  if (lista.length === 0) {
    await sendMsg(GRUPO_ESCORTS, `📋 *Panel de Escorts*\n\n_No hay escorts registradas. Escribe cualquier mensaje para registrarte._`);
    return;
  }
  for (const escort of lista) {
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text: escort.libre
        ? `👤 *${fn(escort.nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`
        : `👤 *${fn(escort.nombre)}*\n🔴 Ocupada (${escort.ocupadaTexto ?? ""})`,
      reply_markup: {
        inline_keyboard: escort.libre
          ? [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${escort.uid}` }]]
          : [[{ text: "🟢 Estoy libre", callback_data: `libre_${escort.uid}` }]],
      },
    });
    if (escorts[escort.uid]) escorts[escort.uid].panelMsgId = r?.result?.message_id;
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

  // ── Monto rápido ──
  if (data.startsWith("monto_")) {
    const monto   = data.split("_")[1];
    const conv    = convTelf[uid];
    if (conv?.paso === "esperando_monto" && conv.flowMsgId) {
      convTelf[uid] = { ...conv, paso: "esperando_descripcion", monto };
      await editMsg(uid, conv.flowMsgId, msgPaso3(conv.terminal!, monto), { reply_markup: KB_DESC });
    }
    return answerCB(query.id);
  }

  // ── Escort: ponerme ocupada ──
  if (data.startsWith("ocupada_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n🔴 ¿Cuánto tiempo estarás ocupada?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "5 min", callback_data: `t_5_${uid}` }, { text: "30 min", callback_data: `t_30_${uid}` }, { text: "1 hora", callback_data: `t_60_${uid}` }],
            [{ text: "⏱ Otro tiempo", callback_data: `t_otro_${uid}` }],
          ],
        },
      }
    );
    if (escorts[uid]) escorts[uid].panelMsgId = msgId;
    return;
  }

  // ── Tiempo seleccionado ──
  if (data.match(/^t_\d+_\d+$/)) {
    const [, mins, ownerId] = data.split("_");
    if (uid !== parseInt(ownerId)) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    const m   = parseInt(mins);
    const txt = m < 60 ? `${m} min` : "1 hora";
    if (escorts[uid]) { escorts[uid].libre = false; escorts[uid].ocupadaHasta = Date.now() + m * 60000; escorts[uid].ocupadaTexto = txt; escorts[uid].panelMsgId = msgId; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n🔴 Ocupada (${txt})`,
      { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy libre", callback_data: `libre_${uid}` }]] } }
    );
    await notificarTelefonistas();
    return;
  }

  // ── Tiempo personalizado ──
  if (data.startsWith("t_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_tiempo_custom" };
    if (escorts[uid]) escorts[uid].panelMsgId = msgId;
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n⏱ Escribe cuántos minutos estarás ocupada:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  // ── Escort: estoy libre ──
  if (data.startsWith("libre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaHasta = undefined; escorts[uid].ocupadaTexto = undefined; escorts[uid].panelMsgId = msgId; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)} ya está libre.*`);
    return;
  }

  // ── Ya estoy libre (después de servicio) ──
  if (data.startsWith("yalibre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; escorts[uid].ocupadaHasta = undefined; }
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Actualmente estás libre. Cuando haya un cliente te avisaré.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)} terminó con el cliente y está libre.*`);
    return;
  }

  // ── Escort acepta cliente ──
  if (data.startsWith("acepto_")) {
    if (!escorts[uid]) return answerCB(query.id, "❌ No estás registrada como escort.", true);
    const parts   = data.split("_");
    const terminal = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);

    convEscort[uid] = { paso: "esperando_nota", terminal, monto, escortMsgId: msgId, telfUid };

    await editMsg(GRUPO_ESCORTS, msgId,
      `🙋 *${fn(nombre)} tomando el cliente...*\n` +
      `━━━━━━━━━━━━━━\n` +
      `📱 Terminal: \`${terminal}\`\n` +
      `💰 Estimado: *$${monto}*\n` +
      `━━━━━━━━━━━━━━\n\n` +
      `📝 Escribe una nota para el telefonista o toca _Sin nota_:`,
      { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }
    );
    return answerCB(query.id, "✅ Escribe tu nota o toca 'Sin nota'.");
  }

  // ── Escort sin nota ──
  if (data.startsWith("escortnota_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    await confirmarEscort(uid, nombre);
    return;
  }

  // ── Escort: cliente llegó ──
  if (data.startsWith("llego_")) {
    const parts    = data.split("_");
    const terminal = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);
    const escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    if (escorts[uid]) { escorts[uid].libre = false; escorts[uid].ocupadaTexto = "con cliente"; }
    await notificarTelefonistas();

    const telfConv = convTelf[telfUid];
    if (telfConv?.flowMsgId) {
      await editMsg(telfUid, telfConv.flowMsgId,
        `✅ *El cliente llegó*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\nEspera el resultado final de la escort.\n━━━━━━━━━━━━━━`,
        { reply_markup: { keyboard: [[{ text: "❌ Cancelar servicio" }]], resize_keyboard: true, persistent: true } }
      );
    }

    convEscort[uid] = { paso: "esperando_monto_real", terminal, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `✅ *Cliente llegó*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n━━━━━━━━━━━━━━\n💵 ¿Cuánto pagó el cliente?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "$50", callback_data: `pago_50_${terminal}_${monto}_${telfUid}_${uid}` }, { text: "$100", callback_data: `pago_100_${terminal}_${monto}_${telfUid}_${uid}` }],
            [{ text: "$150", callback_data: `pago_150_${terminal}_${monto}_${telfUid}_${uid}` }, { text: "$200", callback_data: `pago_200_${terminal}_${monto}_${telfUid}_${uid}` }],
            [{ text: "💵 Otro monto", callback_data: `pago_otro_${terminal}_${monto}_${telfUid}_${uid}` }],
          ],
        },
      }
    );
    return;
  }

  // ── Escort: cliente se fue ──
  if (data.startsWith("sefue_")) {
    const parts    = data.split("_");
    const terminal = parts[1];
    const monto    = parts[2];
    const telfUid  = parseInt(parts[3]);
    const escortId = parseInt(parts[4]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);

    const telfConv = convTelf[telfUid];
    if (escorts[uid]) { escorts[uid].libre = true; escorts[uid].ocupadaTexto = undefined; }

    await editMsg(GRUPO_ESCORTS, msgId,
      `🚪 *Cliente se fue*\n━━━━━━━━━━━━━━\n📱 Terminal: \`${terminal}\`\n🙋 Escort: *${fn(nombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
    if (telfConv?.grupMsgId) {
      await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
        `🚪 *Cliente se fue* — Terminal \`${terminal}\``,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    if (telfConv?.flowMsgId) {
      await editMsg(telfUid, telfConv.flowMsgId,
        `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n\n👥 *Escorts:*\n${textoEscorts()}\n\n🚪 El cliente \`${terminal}\` se fue.`,
        { reply_markup: KB_INICIO }
      );
    }
    convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre, flowMsgId: telfConv?.flowMsgId };
    await liberarTurno();
    await notificarTelefonistas();
    return;
  }

  // ── Monto de pago seleccionado ──
  if (data.match(/^pago_\d+_.+_\d+_\d+_\d+$/)) {
    const parts    = data.split("_");
    const montoReal = parseInt(parts[1]);
    const terminal  = parts[2];
    const telfUid   = parseInt(parts[4]);
    const escortId  = parseInt(parts[5]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    delete convEscort[uid];
    await procesarPago(uid, nombre, telfUid, terminal, montoReal, msgId);
    return;
  }

  // ── Otro monto ──
  if (data.startsWith("pago_otro_")) {
    const parts    = data.split("_");
    const terminal  = parts[2];
    const monto     = parts[3];
    const telfUid   = parseInt(parts[4]);
    const escortId  = parseInt(parts[5]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_monto_real", terminal, monto, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `💵 *¿Cuánto pagó el cliente?*\nEscribe el monto en el grupo:`,
      { reply_markup: { inline_keyboard: [] } }
    );
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
