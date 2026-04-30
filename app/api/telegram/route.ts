import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

const GRUPO_ESCORTS      = -1003938759901;
const GRUPO_TELEFONISTAS = -5171466708;

// ──────────────────────────────────────────
// FIREBASE REALTIME DATABASE (REST API)
// ──────────────────────────────────────────

const FB_PROJECT = process.env.FIREBASE_PROJECT_ID!;
const FB_EMAIL   = process.env.FIREBASE_CLIENT_EMAIL!;
const FB_KEY     = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const FB_URL     = `https://${FB_PROJECT}-default-rtdb.firebaseio.com`;

let fbToken: string | null = null;
let fbTokenExp = 0;

async function getFirebaseToken(): Promise<string> {
  if (fbToken && Date.now() < fbTokenExp - 60000) return fbToken;
  const now   = Math.floor(Date.now() / 1000);
  const claim = { iss: FB_EMAIL, sub: FB_EMAIL, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email" };
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify(claim)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signing = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBuffer(FB_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signing));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${signing}.${sigB64}`;
  const res  = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const data = await res.json();
  fbToken    = data.access_token;
  fbTokenExp = Date.now() + 3600000;
  return fbToken!;
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function fbGet(path: string): Promise<any> {
  const token = await getFirebaseToken();
  const res   = await fetch(`${FB_URL}/${path}.json`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function fbSet(path: string, data: any): Promise<void> {
  const token = await getFirebaseToken();
  await fetch(`${FB_URL}/${path}.json`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

async function fbDelete(path: string): Promise<void> {
  const token = await getFirebaseToken();
  await fetch(`${FB_URL}/${path}.json`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}

// ──────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────

type PasoTelf  = "idle" | "esperando_terminal" | "esperando_monto" | "esperando_descripcion" | "en_chat";
type PasoEscort = "esperando_nota" | "esperando_tiempo_custom" | "esperando_monto_real" | "esperando_otro" | "en_chat";

interface ConvTelf {
  paso: PasoTelf;
  nombre: string;
  lastBotMsgId?: number;
  flowMsgIds?: number[];
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
  nota?: string;
  chatMsgIds?: number[]; // todos los msgs del grupo escorts para borrar al cerrar
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

// Memoria local (caché)
const convTelf:    Record<number, ConvTelf>          = {};
const convEscort:  Record<number, ConvEscort>        = {};
const chatsActivos: Record<number, number>           = {};
let   colaActiva: number | null                      = null;
const colaEspera: number[]                           = [];

// Caché de datos persistidos
let escortsCache:     Record<number, EstadoEscort>      = {};
let telefonistasCache: Record<number, string>           = {};
let comisionesCache:  Record<number, number>            = {};
let historialCache:   Record<string, HistorialTerminal> = {};
let cacheLoaded = false;

// ──────────────────────────────────────────
// CARGA Y GUARDADO EN FIREBASE
// ──────────────────────────────────────────

async function cargarDatos() {
  if (cacheLoaded) return;
  try {
    const [esc, telf, com, hist, servs] = await Promise.all([
      fbGet("escorts"), fbGet("telefonistas"), fbGet("comisiones"), fbGet("historial"), fbGet("serviciosActivos")
    ]);
    escortsCache     = esc  ?? {};
    telefonistasCache = telf ?? {};
    comisionesCache  = com  ?? {};
    historialCache   = hist ?? {};
    // Restaurar servicios activos en memoria
    const serviciosActivos = servs ?? {};
    for (const [k, v] of Object.entries(serviciosActivos)) {
      convEscort[parseInt(k)] = v as ConvEscort;
    }
    // Convertir keys a números donde necesario
    const escNum: Record<number, EstadoEscort> = {};
    for (const [k, v] of Object.entries(escortsCache)) escNum[parseInt(k)] = v as EstadoEscort;
    escortsCache = escNum;
    const telfNum: Record<number, string> = {};
    for (const [k, v] of Object.entries(telefonistasCache)) telfNum[parseInt(k)] = v as string;
    telefonistasCache = telfNum;
    const comNum: Record<number, number> = {};
    for (const [k, v] of Object.entries(comisionesCache)) comNum[parseInt(k)] = v as number;
    comisionesCache = comNum;
    cacheLoaded = true;
  } catch { cacheLoaded = true; }
}

async function guardarEscort(uid: number) {
  await fbSet(`escorts/${uid}`, escortsCache[uid] ?? null);
}
async function guardarServicioActivo(escortUid: number, data: ConvEscort | null) {
  if (data) await fbSet(`serviciosActivos/${escortUid}`, data);
  else await fbDelete(`serviciosActivos/${escortUid}`);
}

async function guardarFlowMsgIds(telfUid: number, ids: number[]) {
  await fbSet(`flowMsgIds/${telfUid}`, ids);
}

async function cargarFlowMsgIds(telfUid: number): Promise<number[]> {
  const data = await fbGet(`flowMsgIds/${telfUid}`);
  return data ?? [];
}

async function eliminarFlowMsgIds(telfUid: number) {
  await fbDelete(`flowMsgIds/${telfUid}`);
}
async function eliminarEscort(uid: number) {
  delete escortsCache[uid];
  await fbDelete(`escorts/${uid}`);
}
async function guardarTelefonista(uid: number, nombre: string) {
  telefonistasCache[uid] = nombre;
  await fbSet(`telefonistas/${uid}`, nombre);
}
async function eliminarTelefonista(uid: number) {
  delete telefonistasCache[uid];
  await fbDelete(`telefonistas/${uid}`);
}
async function guardarComision(uid: number, total: number) {
  comisionesCache[uid] = total;
  await fbSet(`comisiones/${uid}`, total);
}
async function guardarHistorial(terminal: string, data: HistorialTerminal) {
  historialCache[terminal] = data;
  await fbSet(`historial/${terminal}`, data);
}

// Historial de servicios por telefonista
interface ServicioCompletado {
  terminal: string;
  monto: number;
  escortNombre: string;
  fecha: string;
  hora: string;
  tipo: "completado" | "sin_servicio";
  motivo?: string;
}
const historialTelfCache: Record<number, ServicioCompletado[]> = {};

async function guardarHistorialTelf(telfUid: number, servicio: ServicioCompletado) {
  if (!historialTelfCache[telfUid]) historialTelfCache[telfUid] = [];
  historialTelfCache[telfUid].unshift(servicio); // más reciente primero
  // Mantener solo los últimos 50
  if (historialTelfCache[telfUid].length > 50) historialTelfCache[telfUid] = historialTelfCache[telfUid].slice(0, 50);
  await fbSet(`historialTelf/${telfUid}`, historialTelfCache[telfUid]);
}

async function cargarHistorialTelf(telfUid: number): Promise<ServicioCompletado[]> {
  if (historialTelfCache[telfUid]) return historialTelfCache[telfUid];
  const data = await fbGet(`historialTelf/${telfUid}`);
  historialTelfCache[telfUid] = data ?? [];
  return historialTelfCache[telfUid];
}

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function tPost(method: string, body: object): Promise<any> {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
  return tPost("answerCallbackQuery", { callback_query_id: id, ...(text ? { text, show_alert: alert } : {}) });
}

function tieneContacto(txt: string): boolean {
  return [/\b\d[\d\s\-().]{6,}\d\b/, /@[a-zA-Z0-9_.]+/, /\b(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|ig|wa|fb)\b/i, /\b(t\.me|wa\.me|bit\.ly)\b/i, /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/].some(p => p.test(txt));
}
function fn(n: string): string { return (n ?? "").split(" ")[0]; }
function calcularComision(monto: number): number {
  if (monto <= 100) return 15; if (monto <= 150) return 25; if (monto <= 200) return 30;
  return Math.round(monto * 0.15);
}
function horaActual(): string {
  return new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
}
function fechaActual(): string {
  return new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ──────────────────────────────────────────
// TEXTOS
// ──────────────────────────────────────────

function textoEscorts(): string {
  const lista = Object.values(escortsCache);
  if (lista.length === 0) return "_Sin chicas registradas aún._";
  const ahora = Date.now();
  for (const e of lista) {
    if (!e.libre && e.ocupadaHasta && ahora >= e.ocupadaHasta) {
      e.libre = true; e.ocupadaHasta = undefined; e.ocupadaTexto = undefined;
      guardarEscort(e.uid);
    }
  }
  return lista.map(e => e.libre ? `🟢 *${fn(e.nombre)}* — Disponible` : `🔴 *${fn(e.nombre)}* — Ocupada${e.ocupadaTexto ? ` (${e.ocupadaTexto})` : ""}`).join("\n");
}

function textoCola(): string {
  if (colaActiva === null) return "";
  const activo = fn(telefonistasCache[colaActiva] ?? "Telefonista");
  let txt = `🎯 Turno actual: *${activo}*`;
  if (colaEspera.length > 0) txt += `\n⏳ En espera: ${colaEspera.map((u, i) => `${i + 1}. ${fn(telefonistasCache[u] ?? "?")}`).join(", ")}`;
  return txt;
}

function infoTerminal(terminal: string): string {
  const h = historialCache[terminal];
  if (!h) return "";
  return `\n⚠️ *Cliente conocido* — Ha venido *${h.veces}* veces\n💰 Último pago: *$${h.ultimoPago}* | 📅 *${h.ultimaFecha}*`;
}

function textoPanelTelf(nombre: string, extra?: string): string {
  const cola = textoCola();
  return (
    `📋 *Panel de Operaciones*\n━━━━━━━━━━━━━━\n` +
    `👋 Hola, *${fn(nombre)}*\n\n` +
    `📍 *Estado actual:* Listo para recibir clientes\n\n` +
    `👥 *Chicas disponibles:*\n${textoEscorts()}\n` +
    (cola ? `\n${cola}\n` : ``) +
    `━━━━━━━━━━━━━━\n` +
    `💡 _Toca el botón de abajo para registrar un cliente_` +
    (extra ? `\n\n${extra}` : ``)
  );
}

// ──────────────────────────────────────────
// ENVIAR MENSAJE Y LIMPIAR CHAT
// ──────────────────────────────────────────

async function enviarTelf(uid: number, texto: string, extra: object = {}): Promise<number | undefined> {
  const r = await sendMsg(uid, texto, extra);
  const newId = r?.result?.message_id;
  if (newId && convTelf[uid]) {
    convTelf[uid].lastBotMsgId = newId;
    // Trackear SIEMPRE para borrar al cerrar — incluyendo mensajes del chat
    if (!convTelf[uid].flowMsgIds) convTelf[uid].flowMsgIds = [];
    convTelf[uid].flowMsgIds!.push(newId);
    // Guardar en Firebase para sobrevivir reinicios
    guardarFlowMsgIds(uid, convTelf[uid].flowMsgIds!).catch(() => {});
  }
  return newId;
}

async function limpiarChat(uid: number, nombre: string) {
  const conv = convTelf[uid];
  // Cargar IDs de Firebase por si el servidor reinició
  let idsABorrar = conv?.flowMsgIds ?? [];
  if (idsABorrar.length === 0) {
    idsABorrar = await cargarFlowMsgIds(uid);
  }
  // Borrar todos los mensajes
  for (const msgId of idsABorrar) {
    await deleteMsg(uid, msgId);
  }
  // Limpiar de Firebase
  await eliminarFlowMsgIds(uid);
  convTelf[uid] = { paso: "idle", nombre, flowMsgIds: [] };
  await mostrarPanelTelf(uid, nombre);
}

async function notificarTelefonistas(extra?: string) {
  for (const uid of Object.keys(telefonistasCache).map(Number)) {
    const conv = convTelf[uid];
    if (!conv || conv.paso !== "idle") continue;
    if (conv.lastBotMsgId) {
      await editMsg(uid, conv.lastBotMsgId, textoPanelTelf(conv.nombre, extra), {
        reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }], [{ text: "❓ Ayuda / ¿Cómo funciona?", callback_data: "ayuda" }]] },
      }).catch(() => {});
    }
  }
}

async function mostrarPanelTelf(uid: number, nombre: string) {
  const nombreFinal = nombre || convTelf[uid]?.nombre || telefonistasCache[uid] || "Telefonista";
  await guardarTelefonista(uid, nombreFinal);
  convTelf[uid] = { paso: "idle", nombre: nombreFinal, flowMsgIds: [] };
  const r = await sendMsg(uid, textoPanelTelf(nombreFinal), {
    reply_markup: { inline_keyboard: [[{ text: "📞 Nuevo Cliente", callback_data: "nuevo_cliente" }], [{ text: "❓ Ayuda / ¿Cómo funciona?", callback_data: "ayuda" }]] },
  });
  const msgId = r?.result?.message_id;
  if (msgId) { convTelf[uid].lastBotMsgId = msgId; convTelf[uid].flowMsgIds = [msgId]; }
}

// ──────────────────────────────────────────
// COLA DE TURNOS
// ──────────────────────────────────────────

async function intentarTurno(uid: number) {
  if (colaActiva === null || colaActiva === uid) {
    colaActiva = uid; await iniciarFlujo(uid);
  } else {
    if (!colaEspera.includes(uid)) colaEspera.push(uid);
    const pos = colaEspera.indexOf(uid) + 1;
    await enviarTelf(uid,
      `⏳ *HAY UN REGISTRO EN CURSO*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nEstás en la posición *#${pos}*.\n💡 _Te avisaremos aquí cuando sea tu turno._`,
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
        `⏰ *¡PREPÁRATE, CASI ES TU TURNO!*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nSerás el siguiente en *30 segundos*. ¡Alistate!`,
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 30000));
  }
  const siguiente = colaEspera.shift()!;
  colaActiva = siguiente;
  await iniciarFlujo(siguiente);
  for (let i = 0; i < colaEspera.length; i++) {
    const u = colaEspera[i];
    const c = convTelf[u];
    if (c?.lastBotMsgId) {
      await editMsg(u, c.lastBotMsgId,
        `⏳ *HAY UN REGISTRO EN CURSO*\n━━━━━━━━━━━━━━\n${textoCola()}\n━━━━━━━━━━━━━━\n\nAhora estás en la posición *#${i + 1}*.`,
        { reply_markup: { inline_keyboard: [[{ text: "❌ Salir de la cola", callback_data: "salir_cola" }]] } }
      ).catch(() => {});
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
    `📞 *REGISTRAR NUEVO CLIENTE*\n━━━━━━━━━━━━━━\n` +
    (cola ? `${cola}\n━━━━━━━━━━━━━━\n` : ``) +
    `\n*Paso 1 de 3*\n\n` +
    `✏️ Escribe los *últimos 4 dígitos* del número del cliente:\n\n` +
    `💡 _Ejemplo: si el número es 809-555-*1234*, escribe_ *1234*`,
    { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar registro", callback_data: "cancelar_telf" }]] } }
  );
}

async function cancelarTelf(uid: number) {
  const conv = convTelf[uid];
  if (conv?.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId, `❌ *Servicio cancelado por el telefonista*\n📱 Últimos 4 dígitos: \`${conv.terminal ?? "—"}\``, { reply_markup: { inline_keyboard: [] } }).catch(() => {});
  }
  if (conv?.escortUid) {
    delete chatsActivos[conv.escortUid];
    if (escortsCache[conv.escortUid]) { escortsCache[conv.escortUid].libre = true; escortsCache[conv.escortUid].ocupadaTexto = undefined; await guardarEscort(conv.escortUid); }
    if (convEscort[conv.escortUid]) delete convEscort[conv.escortUid];
  }
  const nombre = conv?.nombre ?? "";
  await limpiarChat(uid, nombre);
  await liberarTurno();
  await notificarTelefonistas();
}

async function pasoMonto(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "esperando_monto";
  const info = infoTerminal(conv.terminal!);
  await enviarTelf(uid,
    `📞 *REGISTRAR NUEVO CLIENTE*\n━━━━━━━━━━━━━━\n` +
    `✅ Dígitos guardados: *${conv.terminal}*${info}\n` +
    `━━━━━━━━━━━━━━\n\n*Paso 2 de 3*\n\n` +
    `💵 ¿Cuánto crees que va a pagar el cliente?\n` +
    `💡 _Toca uno de los botones o escribe el monto:_`,
    { reply_markup: { inline_keyboard: [
      [{ text: "$50", callback_data: "m_50" }, { text: "$100", callback_data: "m_100" }, { text: "$150", callback_data: "m_150" }, { text: "$200", callback_data: "m_200" }],
      [{ text: "❌ Cancelar registro", callback_data: "cancelar_telf" }],
    ]}}
  );
}

async function pasoDescripcion(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  conv.paso = "esperando_descripcion";
  await enviarTelf(uid,
    `📞 *REGISTRAR NUEVO CLIENTE*\n━━━━━━━━━━━━━━\n` +
    `✅ Dígitos: *${conv.terminal}*\n` +
    `✅ Monto estimado: *$${conv.monto}*\n` +
    `━━━━━━━━━━━━━━\n\n*Paso 3 de 3 — Último paso*\n\n` +
    `📝 ¿Quieres agregar alguna nota sobre el cliente?\n` +
    `💡 _Ejemplo: "cliente habitual", "viene solo", etc._\n\n` +
    `⚠️ _No escribas números de teléfono ni redes sociales_`,
    { reply_markup: { inline_keyboard: [
      [{ text: "➡️ Sin nota, continuar", callback_data: "sin_nota_telf" }],
      [{ text: "❌ Cancelar registro",   callback_data: "cancelar_telf" }],
    ]}}
  );
}

async function publicarCliente(uid: number) {
  const conv = convTelf[uid];
  if (!conv) return;
  const desc = conv.descripcion ? `\n📝 _${conv.descripcion}_` : "";
  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS, parse_mode: "Markdown",
    text:
      `🔔 *NUEVO CLIENTE DISPONIBLE*\n━━━━━━━━━━━━━━\n` +
      `📱 Últimos 4 dígitos del cliente: \`${conv.terminal}\`\n` +
      `💰 El cliente pagará aproximadamente: *$${conv.monto}*${desc}\n` +
      `📲 Enviado por: *${fn(conv.nombre)}*\n━━━━━━━━━━━━━━\n` +
      `👆 Toca el botón si estás disponible para atenderlo`,
    reply_markup: { inline_keyboard: [[{ text: "🙋 Acepto este cliente", callback_data: `acepto_${conv.terminal}_${conv.monto}_${uid}` }]] },
  });
  conv.paso = "en_chat";
  conv.escortMsgId = eMsg?.result?.message_id;
  // Guardar el primer msg ID para borrar rango después
  if (!convTelf[uid].flowMsgIds) convTelf[uid].flowMsgIds = [];
  await enviarTelf(uid,
    `⏳ *CLIENTE ENVIADO — ESPERANDO RESPUESTA*\n━━━━━━━━━━━━━━\n` +
    `✅ Últimos 4 dígitos: *${conv.terminal}*\n` +
    `✅ Monto estimado: *$${conv.monto}*${desc}\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `📍 *Estado actual:* Esperando que una chica acepte...\n\n` +
    `👥 *Chicas disponibles ahora:*\n${textoEscorts()}\n\n` +
    `💡 _Cuando una chica acepte, te avisaremos aquí mismo._`,
    { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar y volver al inicio", callback_data: "cancelar_telf" }]] } }
  );
}

// ──────────────────────────────────────────
// CHAT INTERNO
// ──────────────────────────────────────────

function tecladoChatTelf(escortUid: number): object {
  return { inline_keyboard: [[{ text: "❌ Cancelar servicio", callback_data: `cancelar_chat_${escortUid}` }]] };
}

function tecladoChatEscort(telfUid: number): object {
  return { inline_keyboard: [
    [{ text: "✅ Marcar como atendido", callback_data: `atendido_${telfUid}` }],
    [{ text: "❌ Cerrar sin servicio",  callback_data: `sinservicio_${telfUid}` }],
  ]};
}

async function abrirChat(escortUid: number, escortNombre: string, telfUid: number) {
  const telfConv   = convTelf[telfUid];
  const escortConv = convEscort[escortUid];
  if (!telfConv || !escortConv) return;
  chatsActivos[escortUid] = telfUid;
  telfConv.escortUid    = escortUid;
  telfConv.escortNombre = escortNombre;
  if (escortsCache[escortUid]) { escortsCache[escortUid].libre = false; escortsCache[escortUid].ocupadaTexto = "con cliente"; await guardarEscort(escortUid); }
  // Inicializar chatMsgIds con el mensaje original del cliente
  if (!convEscort[escortUid].chatMsgIds) convEscort[escortUid].chatMsgIds = [];
  if (escortConv.escortMsgId) convEscort[escortUid].chatMsgIds!.push(escortConv.escortMsgId);
  // Guardar en Firebase para sobrevivir reinicios
  await guardarServicioActivo(escortUid, convEscort[escortUid]);

  // The editMsg on escortMsgId is already tracked
  if (escortConv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, escortConv.escortMsgId,
      `🟡 *TIENES UN CLIENTE ACTIVO*\n━━━━━━━━━━━━━━\n` +
      `📱 Últimos 4 dígitos del cliente: \`${escortConv.terminal}\`\n` +
      `💰 El cliente pagará aproximadamente: *$${escortConv.monto}*\n` +
      (escortConv.nota ? `📝 Nota del telefonista: _${escortConv.nota}_\n` : ``) +
      `━━━━━━━━━━━━━━\n\n` +
      `💬 *ESTÁS EN CHAT DIRECTO CON EL TELEFONISTA*\n\n` +
      `⚡ Todo lo que escribas aquí le llegará a él al instante.\n` +
      `⚡ Todo lo que él escriba te llegará a ti aquí.\n\n` +
      `📸 También puedes enviar fotos.\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `⬇️ *Cuando termines con el cliente usa los botones:*\n\n` +
      `✅ *Marcar como atendido* → El cliente pagó\n` +
      `❌ *Cerrar sin servicio* → El cliente se fue sin pagar`,
      { reply_markup: tecladoChatEscort(telfUid) }
    );
  }
  await enviarTelf(telfUid,
    `✅ *¡${fn(escortNombre).toUpperCase()} ACEPTÓ EL CLIENTE!*\n` +
    `━━━━━━━━━━━━━━\n` +
    `📱 Últimos 4 dígitos: *${telfConv.terminal}*\n` +
    `💰 Monto estimado: *$${telfConv.monto}*\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `💬 *ESTÁS EN CHAT DIRECTO CON ${fn(escortNombre).toUpperCase()}*\n\n` +
    `⚡ *Todo lo que escribas aquí le llegará a ella al instante.*\n` +
    `⚡ *Todo lo que ella escriba te llegará a ti aquí.*\n\n` +
    `📸 También puedes enviar fotos.\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `💡 _Escribe tu mensaje abajo para comenzar la conversación._`,
    { reply_markup: tecladoChatTelf(escortUid) }
  );
  convEscort[escortUid].paso = "en_chat";
  telfConv.paso = "en_chat";
  await notificarTelefonistas();
}

async function confirmarEscort(escortUid: number, escortNombre: string) {
  const conv = convEscort[escortUid];
  if (!conv?.telfUid) return;
  if (conv.escortMsgId) {
    await editMsg(GRUPO_ESCORTS, conv.escortMsgId,
      `💬 *Chat activo con telefonista*\n━━━━━━━━━━━━━━\n📱 Últimos 4 dígitos: \`${conv.terminal}\`\n💰 Estimado: *$${conv.monto}*\n━━━━━━━━━━━━━━\nEscribe aquí para hablar con el telefonista:`,
      { reply_markup: tecladoChatEscort(conv.telfUid) }
    );
  }
  await abrirChat(escortUid, escortNombre, conv.telfUid);
}

// ──────────────────────────────────────────
// CERRAR SERVICIO
// ──────────────────────────────────────────

async function cerrarServicio(escortUid: number, escortNombre: string, telfUid: number, terminal: string, montoReal: number | null, motivo?: string) {
  const telfConv   = convTelf[telfUid];
  const telfNombre = telfConv?.nombre ?? "Telefonista";
  const convE      = convEscort[escortUid];
  const ahora      = horaActual();
  delete chatsActivos[escortUid];
  if (escortsCache[escortUid]) { escortsCache[escortUid].libre = true; escortsCache[escortUid].ocupadaTexto = undefined; await guardarEscort(escortUid); }
  await guardarServicioActivo(escortUid, null);

  // Borrar todos los mensajes del chat en el grupo de escorts
  const msgsBorrar = convE?.chatMsgIds ?? [];
  for (const mId of msgsBorrar) {
    await tPost("deleteMessage", { chat_id: GRUPO_ESCORTS, message_id: mId }).catch(() => {});
  }

  if (montoReal !== null) {
    const comision = calcularComision(montoReal);
    const nuevoTotal = (comisionesCache[telfUid] ?? 0) + comision;
    await guardarComision(telfUid, nuevoTotal);
    await guardarHistorial(terminal, { veces: (historialCache[terminal]?.veces ?? 0) + 1, ultimoPago: montoReal, ultimaEscort: fn(escortNombre), ultimaFecha: fechaActual() });
    await guardarHistorialTelf(telfUid, { terminal, monto: montoReal, escortNombre: fn(escortNombre), fecha: fechaActual(), hora: ahora, tipo: "completado" });

    // Enviar resumen limpio en grupo escorts (mensajes anteriores ya borrados)
    await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text:
        `✅ *¡SERVICIO COMPLETADO!*\n━━━━━━━━━━━━━━\n` +
        `🕐 Hora de cierre: *${ahora}*\n` +
        `📱 Últimos 4 dígitos: \`${terminal}\`\n` +
        `💰 Pagó: *$${montoReal}*\n` +
        `👤 Telefonista: *${fn(telfNombre)}*\n` +
        `━━━━━━━━━━━━━━\n_Toca el botón cuando termines con el cliente._`,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "🟢 Ya terminé, estoy libre", callback_data: `yalibre_${escortUid}` }]] }),
    }).catch(() => {});
    convTelf[telfUid] = { paso: "idle", nombre: telfNombre };
    await limpiarChat(telfUid, telfNombre);
    await sendMsg(telfUid,
      `✅ *¡SERVICIO COMPLETADO!*\n━━━━━━━━━━━━━━\n` +
      `🕐 Hora de cierre: *${ahora}*\n` +
      `📱 Últimos 4 dígitos: \`${terminal}\`\n` +
      `💰 Lo que pagó el cliente: *$${montoReal}*\n` +
      `💵 Tu ganancia: *+$${comision}*\n` +
      `📊 Tu balance total: *$${nuevoTotal}*\n` +
      `💃 Atendido por: *${fn(escortNombre)}*\n━━━━━━━━━━━━━━`
    );
  } else {
    const motivoTexto = motivo ?? "No especificado";
    await guardarHistorialTelf(telfUid, { terminal, monto: 0, escortNombre: fn(escortNombre), fecha: fechaActual(), hora: ahora, tipo: "sin_servicio", motivo: motivoTexto });
    await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS,
      parse_mode: "Markdown",
      text:
        `❌ *SERVICIO CERRADO SIN ATENDER*\n━━━━━━━━━━━━━━\n` +
        `🕐 Hora de cierre: *${ahora}*\n` +
        `📱 Últimos 4 dígitos: \`${terminal}\`\n` +
        `💰 Lo que iba a pagar (estimado): *$${convE?.monto ?? "—"}*\n` +
        `📋 Motivo: *${motivoTexto}*\n` +
        `👤 Telefonista: *${fn(telfNombre)}*\n━━━━━━━━━━━━━━\n_Ya quedas libre para el próximo cliente._`,
    }).catch(() => {});
    convTelf[telfUid] = { paso: "idle", nombre: telfNombre };
    await limpiarChat(telfUid, telfNombre);
    await sendMsg(telfUid,
      `❌ *SERVICIO CERRADO SIN ATENDER*\n━━━━━━━━━━━━━━\n` +
      `🕐 Hora de cierre: *${ahora}*\n` +
      `📱 Últimos 4 dígitos del cliente: \`${terminal}\`\n` +
      `💰 Lo que iba a pagar (estimado): *$${convE?.monto ?? "—"}*\n` +
      `📋 Motivo: *${motivoTexto}*\n` +
      `💃 Escort: *${fn(escortNombre)}*\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
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
  const lista = Object.values(escortsCache);
  if (lista.length === 0) { await sendMsg(GRUPO_ESCORTS, `📋 *Panel de Escorts*\n\n_Escribe cualquier mensaje en el grupo para registrarte._`); return; }
  for (const e of lista) {
    const r = await tPost("sendMessage", {
      chat_id: GRUPO_ESCORTS, parse_mode: "Markdown",
      text: e.libre
        ? `👤 *${fn(e.nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`
        : `👤 *${fn(e.nombre)}*\n🔴 Ocupada (${e.ocupadaTexto ?? ""})`,
      reply_markup: { inline_keyboard: e.libre
        ? [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${e.uid}` }]]
        : [[{ text: "🟢 Estoy libre",     callback_data: `libre_${e.uid}` }]] },
    });
    if (escortsCache[e.uid]) { escortsCache[e.uid].panelMsgId = r?.result?.message_id; await guardarEscort(e.uid); }
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  await cargarDatos();
  const uid: number    = msg.from?.id;
  const texto: string  = msg.text?.trim() ?? "";
  const chatId: number = msg.chat.id;
  const nombre: string = msg.from?.first_name ?? "";
  if (!uid) return;

  if (msg.left_chat_member) {
    const leftUid = msg.left_chat_member.id;
    if (chatId === GRUPO_ESCORTS && escortsCache[leftUid]) { await eliminarEscort(leftUid); await notificarTelefonistas(); }
    if (chatId === GRUPO_TELEFONISTAS && telefonistasCache[leftUid]) { await eliminarTelefonista(leftUid); const idx = colaEspera.indexOf(leftUid); if (idx !== -1) colaEspera.splice(idx, 1); if (colaActiva === leftUid) await liberarTurno(); }
    return;
  }

  if (texto === "/panel" && chatId === GRUPO_ESCORTS) { await deleteMsg(GRUPO_ESCORTS, msg.message_id); await publicarPanelEscorts(); return; }

  if (chatId === GRUPO_ESCORTS) {
    if (!escortsCache[uid]) { escortsCache[uid] = { uid, nombre, libre: true }; await guardarEscort(uid); await notificarTelefonistas(`🟢 *${fn(nombre)}* se registró como chica disponible.`); }
    const telfUid = chatsActivos[uid];
    if (telfUid && convEscort[uid]?.paso === "en_chat") {
      // Trackear mensaje de la escort para borrarlo al cerrar
      if (convEscort[uid]) {
        if (!convEscort[uid].chatMsgIds) convEscort[uid].chatMsgIds = [];
        convEscort[uid].chatMsgIds!.push(msg.message_id);
        // Actualizar en Firebase
        await guardarServicioActivo(uid, convEscort[uid]);
      }


      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const photoR = await tPost("sendPhoto", { chat_id: telfUid, photo: fileId, caption: `💃 *Escort ${fn(nombre)}:*${msg.caption ? "\n" + msg.caption : ""}`, parse_mode: "Markdown" });
        if (photoR?.result?.message_id && convTelf[telfUid]) {
          if (!convTelf[telfUid].flowMsgIds) convTelf[telfUid].flowMsgIds = [];
          convTelf[telfUid].flowMsgIds!.push(photoR.result.message_id);
          guardarFlowMsgIds(telfUid, convTelf[telfUid].flowMsgIds!).catch(() => {});
        }
      } else if (texto && !tieneContacto(texto)) {
        const escMsg = await sendMsg(telfUid, `💃 *Escort ${fn(nombre)}:*\n${texto}`);
        // Trackear en el chat del telefonista para borrar al cerrar
        if (escMsg?.result?.message_id && convTelf[telfUid]) {
          if (!convTelf[telfUid].flowMsgIds) convTelf[telfUid].flowMsgIds = [];
          convTelf[telfUid].flowMsgIds!.push(escMsg.result.message_id);
          guardarFlowMsgIds(telfUid, convTelf[telfUid].flowMsgIds!).catch(() => {});
        }
      } else if (tieneContacto(texto)) {
        await deleteMsg(GRUPO_ESCORTS, msg.message_id);
        await sendMsg(GRUPO_ESCORTS, `🚫 *${fn(nombre)}*, no se permiten teléfonos ni redes sociales.`);
      }
      return;
    }
    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);
    if (conv.paso === "esperando_nota") {
      if (tieneContacto(texto)) { await sendMsg(GRUPO_ESCORTS, `🚫 No se permiten teléfonos ni redes sociales.`, { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }); return; }
      convEscort[uid] = { ...conv, nota: texto };
      await confirmarEscort(uid, nombre);
      return;
    }
    if (conv.paso === "esperando_tiempo_custom") {
      const mins = parseInt(texto);
      if (isNaN(mins) || mins <= 0) { await sendMsg(GRUPO_ESCORTS, `⚠️ Escribe solo los minutos. Ejemplo: *45*`); return; }
      escortsCache[uid] = { ...escortsCache[uid], libre: false, ocupadaHasta: Date.now() + mins * 60000, ocupadaTexto: `${mins} min` };
      await guardarEscort(uid);
      delete convEscort[uid];
      if (escortsCache[uid]?.panelMsgId) await editMsg(GRUPO_ESCORTS, escortsCache[uid].panelMsgId!, `👤 *${fn(nombre)}*\n🔴 Ocupada (${mins} min)`, { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy libre", callback_data: `libre_${uid}` }]] } });
      await notificarTelefonistas(`🔴 *${fn(nombre)}* se puso ocupada (${mins} min).`);
      return;
    }
    if (conv.paso === "esperando_monto_real") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) { await sendMsg(GRUPO_ESCORTS, `⚠️ Escribe solo el número. Ejemplo: *120*`); return; }
      await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, parseFloat(ml));
      return;
    }
    if (conv.paso === "esperando_otro") { await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, null, texto); return; }
    return;
  }

  if (texto === "/historial" && chatId === uid) {
    await deleteMsg(uid, msg.message_id);
    const hist = await cargarHistorialTelf(uid);
    if (hist.length === 0) {
      await sendMsg(uid, `📋 *Tu historial está vacío.*\n\nAún no has completado ningún servicio.`);
      return;
    }
    const texto_hist = hist.slice(0, 20).map((s, i) => {
      if (s.tipo === "completado") {
        return `${i + 1}. ✅ *Completado* — ${s.fecha} ${s.hora}\n` +
               `   📱 Dígitos: \`${s.terminal}\` | 💰 Pagó: $${s.monto}\n` +
               `   💃 Escort: ${s.escortNombre}`;
      } else {
        return `${i + 1}. ❌ *Sin servicio* — ${s.fecha} ${s.hora}\n` +
               `   📱 Dígitos: \`${s.terminal}\` | 📋 ${s.motivo ?? "—"}\n` +
               `   💃 Escort: ${s.escortNombre}`;
      }
    }).join("\n\n");
    const totalComision = comisionesCache[uid] ?? 0;
    await sendMsg(uid,
      `📋 *Tu historial de servicios*\n━━━━━━━━━━━━━━\n` +
      `📊 Balance acumulado: *$${totalComision}*\n` +
      `━━━━━━━━━━━━━━\n\n` +
      `${texto_hist}\n\n` +
      `━━━━━━━━━━━━━━\n_Mostrando los últimos ${Math.min(hist.length, 20)} servicios._`
    );
    return;
  }

  if (texto === "/start" && chatId === uid) {
    await deleteMsg(uid, msg.message_id);
    if (await (async () => { try { const res = await fetch(`${API}/getChatMember?chat_id=${GRUPO_ESCORTS}&user_id=${uid}`); const d = await res.json(); return ["administrator","creator","member"].includes(d.result?.status); } catch { return false; } })()) { await sendMsg(uid, `👋 *Bienvenida ${fn(nombre)}.*\nTu panel está en el grupo.`); return; }
    if (!(await (async () => { try { const res = await fetch(`${API}/getChatMember?chat_id=${GRUPO_TELEFONISTAS}&user_id=${uid}`); const d = await res.json(); return ["member","administrator","creator"].includes(d.result?.status); } catch { return false; } })())) { await sendMsg(uid, "❌ No tienes acceso. Contacta al administrador."); return; }
    if (!telefonistasCache[uid]) {
      await sendMsg(uid,
        `👋 *¡Bienvenido, ${fn(nombre)}!\n━━━━━━━━━━━━━━\n\nAsí funciona el sistema:\n\n` +
        `1️⃣ Toca *"📞 Nuevo Cliente"* cuando tengas un cliente\n` +
        `2️⃣ Escribe los *últimos 4 dígitos* del número del cliente\n` +
        `3️⃣ Selecciona cuánto va a pagar\n` +
        `4️⃣ Espera que una chica acepte\n` +
        `5️⃣ Puedes hablarle a la chica directamente desde aquí\n` +
        `6️⃣ Cuando la chica cierre el servicio, recibirás un resumen\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `💡 Si tienes dudas toca el botón *"❓ Ayuda"*\n\n👇 Tu panel aparece abajo:`
      );
    }
    await mostrarPanelTelf(uid, nombre);
    return;
  }

  if (chatId === uid) {
    const conv = convTelf[uid];
    if (!conv) return;
    // Solo borrar mensajes del usuario si NO está en chat activo
    if (conv.paso !== "en_chat") {
      await deleteMsg(uid, msg.message_id);
    } else {
      // Durante chat: trackear mensaje del telf para borrar al cerrar
      if (!convTelf[uid].flowMsgIds) convTelf[uid].flowMsgIds = [];
      convTelf[uid].flowMsgIds!.push(msg.message_id);
      guardarFlowMsgIds(uid, convTelf[uid].flowMsgIds!).catch(() => {});
    }
    if (conv.paso === "en_chat" && conv.escortUid) {
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        if (!convTelf[uid].flowMsgIds) convTelf[uid].flowMsgIds = [];
        await tPost("sendPhoto", { chat_id: GRUPO_ESCORTS, photo: fileId, caption: `📞 *Telefonista ${fn(conv.nombre)}:*${msg.caption ? `\n${msg.caption}` : ""}`, parse_mode: "Markdown" });
      } else if (texto && !tieneContacto(texto)) {
        const fwdMsg = await sendMsg(GRUPO_ESCORTS, `📞 *Telefonista ${fn(conv.nombre)}:*
${texto}`);
        // Trackear msg enviado al grupo escorts
        if (fwdMsg?.result?.message_id && convEscort[conv.escortUid!]) {
          if (!convEscort[conv.escortUid!].chatMsgIds) convEscort[conv.escortUid!].chatMsgIds = [];
          convEscort[conv.escortUid!].chatMsgIds!.push(fwdMsg.result.message_id);
          await guardarServicioActivo(conv.escortUid!, convEscort[conv.escortUid!]);
        }
      } else if (tieneContacto(texto)) {
        await sendMsg(uid, `🚫 No se permiten teléfonos ni redes sociales.`);
      }
      return;
    }
    if (conv.paso === "idle" || conv.paso === "en_chat") return;
    if (conv.paso === "esperando_terminal") {
      if (!/^\d{4}$/.test(texto)) { await enviarTelf(uid, `⚠️ *Ese número no es válido.*\n\nDebes escribir exactamente *4 dígitos*.\n💡 _Ejemplo: si el número termina en 1234, escribe_ *1234*\n\nIntenta de nuevo:`, { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar registro", callback_data: "cancelar_telf" }]] } }); return; }
      conv.terminal = texto; await pasoMonto(uid); return;
    }
    if (conv.paso === "esperando_monto") {
      const ml = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(ml)) { await enviarTelf(uid, `⚠️ *Ese monto no es válido.*\n\nEscribe solo el número, sin letras.\n💡 _Ejemplo: escribe_ *100* _(no "$100")_\n\nIntenta de nuevo:`, { reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar registro", callback_data: "cancelar_telf" }]] } }); return; }
      conv.monto = ml; await pasoDescripcion(uid); return;
    }
    if (conv.paso === "esperando_descripcion") {
      if (tieneContacto(texto)) { await enviarTelf(uid, `🚫 *Mensaje bloqueado.*\n\nNo puedes escribir números de teléfono, redes sociales ni links.\n💡 _Escribe solo una descripción del cliente._`, { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota, continuar", callback_data: "sin_nota_telf" }], [{ text: "❌ Cancelar registro", callback_data: "cancelar_telf" }]] } }); return; }
      conv.descripcion = texto; await publicarCliente(uid); return;
    }
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE CALLBACKS
// ──────────────────────────────────────────

async function handleCallback(query: any) {
  await cargarDatos();
  const uid: number    = query.from.id;
  const data: string   = query.data;
  const nombre: string = query.from.first_name;
  const msgId: number  = query.message.message_id;

  if (data === "nuevo_cliente") {
    await answerCB(query.id);
    const n = nombre || convTelf[uid]?.nombre || telefonistasCache[uid] || "Telefonista";
    await guardarTelefonista(uid, n);
    if (!convTelf[uid]) convTelf[uid] = { paso: "idle", nombre: n };
    else convTelf[uid].nombre = n;
    await intentarTurno(uid); return;
  }

  if (data === "cancelar_telf") { await answerCB(query.id); await cancelarTelf(uid); return; }
  if (data.startsWith("cancelar_chat_")) { await answerCB(query.id); await cancelarTelf(uid); return; }

  if (data === "salir_cola") {
    await answerCB(query.id);
    const idx = colaEspera.indexOf(uid);
    if (idx !== -1) colaEspera.splice(idx, 1);
    if (convTelf[uid]) convTelf[uid].paso = "idle";
    await mostrarPanelTelf(uid, nombre); return;
  }

  if (data.startsWith("m_")) {
    await answerCB(query.id);
    const monto = data.replace("m_", "");
    const conv  = convTelf[uid];
    if (conv?.paso === "esperando_monto") { conv.monto = monto; await pasoDescripcion(uid); }
    return;
  }

  if (data === "sin_nota_telf") { await answerCB(query.id); await publicarCliente(uid); return; }

  if (data === "ayuda") {
    await answerCB(query.id);
    const paso = convTelf[uid]?.paso ?? "idle";
    const msgs: Record<string, string> = {
      idle: `❓ *¿Cómo funciona el sistema?*\n━━━━━━━━━━━━━━\n\n1️⃣ Toca *"📞 Nuevo Cliente"*\n2️⃣ Escribe los últimos 4 dígitos del número del cliente\n3️⃣ Selecciona cuánto va a pagar\n4️⃣ Agrega una nota si quieres\n5️⃣ Espera que una chica acepte\n6️⃣ Recibe el resumen cuando termine\n\n💡 _Si tienes problemas, contacta al administrador._`,
      esperando_terminal: `❓ *¿Qué debo escribir aquí?*\n━━━━━━━━━━━━━━\n\nDebes escribir los *últimos 4 dígitos* del número del cliente.\n\n💡 *Ejemplo:*\nSi el número es *809-555-1234*\nEscribe: *1234*\n\n⚠️ Deben ser exactamente 4 números.`,
      esperando_monto: `❓ *¿Qué monto debo poner?*\n━━━━━━━━━━━━━━\n\nPon el monto *aproximado* que crees que va a pagar.\n\n💡 Toca uno de los botones o escribe el número.\nNo te preocupes si no es exacto — la chica confirmará el monto real.`,
      esperando_descripcion: `❓ *¿Para qué sirve la nota?*\n━━━━━━━━━━━━━━\n\nLa nota es *opcional*. Puedes escribir algo útil como:\n• "Cliente habitual"\n• "Viene solo"\n\n⚠️ No escribas teléfonos ni redes sociales.\nSi no quieres nota, toca *"➡️ Sin nota, continuar"*`,
      en_chat: `❓ *¿Cómo usar el chat?*\n━━━━━━━━━━━━━━\n\nEstás en chat con la chica que aceptó el cliente.\n\n✉️ Puedes escribir mensajes y enviar fotos.\n🚫 No puedes enviar teléfonos ni redes sociales.\n\n⬇️ Usa el botón *"❌ Cancelar servicio"* si algo salió mal.`,
    };
    await sendMsg(uid, msgs[paso] ?? msgs["idle"]); return;
  }

  if (data.startsWith("limpiar_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu chat.", true);
    await answerCB(query.id, "🧹 Limpiando...");
    await deleteMsg(uid, msgId); return;
  }

  if (data.startsWith("limpiar_escort_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id, "🧹 Limpiado.");
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`, { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } }).catch(() => {});
    return;
  }

  if (data.startsWith("acepto_")) {
    if (!escortsCache[uid]) return answerCB(query.id, "❌ No estás registrada.", true);
    if (!escortsCache[uid].libre) return answerCB(query.id, "❌ Ya estás atendiendo un cliente.\nPara aceptar este, primero cierra el que ya tienes.", true);
    const parts = data.split("_");
    convEscort[uid] = { paso: "esperando_nota", terminal: parts[1], monto: parts[2], escortMsgId: msgId, telfUid: parseInt(parts[3]) };
    await guardarServicioActivo(uid, convEscort[uid]);
    await editMsg(GRUPO_ESCORTS, msgId,
      `🙋 *${fn(nombre)} tomando el cliente...*\n━━━━━━━━━━━━━━\n📱 Últimos 4 dígitos: \`${parts[1]}\`\n💰 Estimado: *$${parts[2]}*\n━━━━━━━━━━━━━━\n\n📝 ¿Tienes alguna nota para el telefonista?\nO toca _Sin nota_ para continuar:`,
      { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escortnota_${uid}` }]] } }
    );
    return answerCB(query.id, "✅ Escribe tu nota o toca 'Sin nota'.");
  }

  if (data.startsWith("escortnota_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id); await confirmarEscort(uid, nombre); return;
  }

  if (data.startsWith("atendido_")) {
    const telfUid = parseInt(data.split("_")[1]);
    let conv = convEscort[uid];
    if (!conv) {
      const fbConv = await fbGet(`serviciosActivos/${uid}`);
      if (fbConv) { conv = fbConv; convEscort[uid] = conv; }
    }
    if (!conv) return answerCB(query.id, "❌ No tienes un servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, paso: "esperando_monto_real", escortMsgId: msgId, telfUid };
    await guardarServicioActivo(uid, convEscort[uid]);
    await editMsg(GRUPO_ESCORTS, msgId,
      `✅ *¿Cuánto pagó el cliente?*\n━━━━━━━━━━━━━━\n📱 Últimos 4 dígitos: \`${conv.terminal}\`\n━━━━━━━━━━━━━━\n\n💡 Toca el monto o escríbelo abajo:`,
      { reply_markup: { inline_keyboard: [
        [{ text: "$50", callback_data: `pm_50_${uid}` }, { text: "$100", callback_data: `pm_100_${uid}` }],
        [{ text: "$150", callback_data: `pm_150_${uid}` }, { text: "$200", callback_data: `pm_200_${uid}` }],
        [{ text: "💵 Otro monto — escríbelo abajo", callback_data: `pm_otro_${uid}` }],
      ]}}
    ); return;
  }

  if (data.startsWith("sinservicio_")) {
    const telfUid = parseInt(data.split("_")[1]);
    let conv = convEscort[uid];
    if (!conv) {
      const fbConv = await fbGet(`serviciosActivos/${uid}`);
      if (fbConv) { conv = fbConv; convEscort[uid] = conv; }
    }
    if (!conv) return answerCB(query.id, "❌ No tienes un servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, escortMsgId: msgId, telfUid };
    await editMsg(GRUPO_ESCORTS, msgId,
      `❌ *¿Por qué no hubo servicio?*\n━━━━━━━━━━━━━━\n📱 Dígitos: \`${conv.terminal}\`\n━━━━━━━━━━━━━━\n\nSelecciona el motivo:`,
      { reply_markup: { inline_keyboard: [
        [{ text: "🚪 El cliente se fue", callback_data: `motivo_sefue_${uid}` }],
        [{ text: "📝 Otro motivo",       callback_data: `motivo_otro_${uid}` }],
      ]}}
    );
    return;
  }

  // ── Motivo: se fue ──
  if (data.startsWith("motivo_sefue_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id);
    delete convEscort[uid];
    await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, null, "El cliente se fue");
    return;
  }

  // ── Motivo: otro (pide texto) ──
  if (data.startsWith("motivo_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, paso: "esperando_otro" };
    await editMsg(GRUPO_ESCORTS, msgId,
      `📝 *Escribe el motivo en el grupo:*\n━━━━━━━━━━━━━━\n💡 _Ejemplo: "No quiso el precio", "Era para otra", etc._`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  if (data.startsWith("pm_") && !data.startsWith("pm_otro_")) {
    const parts = data.split("_"), montoReal = parseInt(parts[1]), escortId = parseInt(parts[2]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    let conv = convEscort[uid];
    // Si no está en memoria, buscar en Firebase
    if (!conv) {
      const fbConv = await fbGet(`serviciosActivos/${uid}`);
      if (fbConv) { conv = fbConv; convEscort[uid] = conv; }
    }
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id); delete convEscort[uid];
    await cerrarServicio(uid, nombre, conv.telfUid!, conv.terminal!, montoReal); return;
  }

  if (data.startsWith("pm_otro_")) {
    const escortId = parseInt(data.split("_")[2]);
    if (uid !== escortId) return answerCB(query.id, "❌ No es tu cliente.", true);
    const conv = convEscort[uid];
    if (!conv) return answerCB(query.id, "❌ Sin servicio activo.", true);
    await answerCB(query.id);
    convEscort[uid] = { ...conv, paso: "esperando_monto_real", escortMsgId: msgId };
    await editMsg(GRUPO_ESCORTS, msgId, `💵 *¿Cuánto pagó el cliente?*\n━━━━━━━━━━━━━━\nEscribe el monto exacto en el grupo:`, { reply_markup: { inline_keyboard: [] } });
    return;
  }

  if (data.startsWith("ocupada_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n🔴 ¿Cuánto tiempo estarás ocupada?`,
      { reply_markup: { inline_keyboard: [
        [{ text: "5 min", callback_data: `t_5_${uid}` }, { text: "30 min", callback_data: `t_30_${uid}` }, { text: "1 hora", callback_data: `t_60_${uid}` }],
        [{ text: "⏱ Otro tiempo", callback_data: `t_otro_${uid}` }],
      ]}}
    );
    if (escortsCache[uid]) escortsCache[uid].panelMsgId = msgId;
    return;
  }

  if (data.match(/^t_\d+_\d+$/)) {
    const [, mins, ownerId] = data.split("_");
    if (uid !== parseInt(ownerId)) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    const m = parseInt(mins), txt = m < 60 ? `${m} min` : "1 hora";
    escortsCache[uid] = { ...escortsCache[uid], libre: false, ocupadaHasta: Date.now() + m * 60000, ocupadaTexto: txt, panelMsgId: msgId };
    await guardarEscort(uid);
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n🔴 Ocupada (${txt})`, { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy libre", callback_data: `libre_${uid}` }]] } });
    await notificarTelefonistas(`🔴 *${fn(nombre)}* se puso ocupada (${txt}).`); return;
  }

  if (data.startsWith("t_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_tiempo_custom" };
    if (escortsCache[uid]) escortsCache[uid].panelMsgId = msgId;
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n⏱ Escribe cuántos minutos estarás ocupada:\n\n💡 _Ejemplo: escribe_ *45* _para 45 minutos_`, { reply_markup: { inline_keyboard: [] } });
    return;
  }

  if (data.startsWith("libre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    escortsCache[uid] = { ...escortsCache[uid], libre: true, ocupadaHasta: undefined, ocupadaTexto: undefined, panelMsgId: msgId };
    await guardarEscort(uid);
    await editMsg(GRUPO_ESCORTS, msgId, `👤 *${fn(nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`, { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }]] } });
    await notificarTelefonistas(`🟢 *${fn(nombre)}* ya está libre.`); return;
  }

  if (data.startsWith("yalibre_")) {
    const ownerId = parseInt(data.split("_")[1]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    escortsCache[uid] = { ...escortsCache[uid], libre: true, ocupadaTexto: undefined, ocupadaHasta: undefined };
    await guardarEscort(uid);
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${fn(nombre)}*\n✨ Estás libre. Te avisaré cuando haya un cliente.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `ocupada_${uid}` }], [{ text: "🧹 Limpiar mi chat", callback_data: `limpiar_escort_${uid}` }]] } }
    );
    await notificarTelefonistas(`🟢 *${fn(nombre)}* terminó y está libre.`); return;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message)             await handleMessage(body.message);
    else if (body.callback_query) await handleCallback(body.callback_query);
  } catch (err) { console.error("Bot error:", err); }
  return NextResponse.json({ ok: true });
}
