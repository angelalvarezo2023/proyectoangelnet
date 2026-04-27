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

type PasoEscort = "esperando_nota" | "esperando_monto_real" | "esperando_tiempo_personalizado";

interface EstadoEscort {
  uid: number;
  nombre: string;
  libre: boolean;
  ocupadaHasta?: number; // timestamp ms
  ocupadaTexto?: string; // "30 min", "1 hora", etc.
}

interface ConvTelf {
  paso: PasoTelf;
  nombre?: string;
  digitos?: string;
  monto?: string;
  descripcion?: string;
  grupMsgId?: number;
  escortMsgId?: number;
  escortNombre?: string;
  panelMsgId?: number; // ID del mensaje panel en privado
}

interface ConvEscort {
  paso: PasoEscort;
  digitos?: string;
  monto?: string;
  escortMsgId?: number;
  telfUid?: number;
  telfNombre?: string;
  nota?: string;
}

const convTelf:   Record<number, ConvTelf>   = {};
const convEscort: Record<number, ConvEscort> = {};
const comisiones: Record<number, number>     = {};

// Estado de escorts: uid → EstadoEscort
const estadosEscort: Record<number, EstadoEscort> = {};

// Panel msgs de telefonistas: uid → message_id del panel en privado
const panelesTelf: Record<number, number> = {};

let   colaActiva: number | null = null;
const colaEspera: number[]      = [];

// ──────────────────────────────────────────
// COMISIONES
// ──────────────────────────────────────────

function calcularComision(monto: number): number {
  if (monto === 100) return 15;
  if (monto === 150) return 25;
  if (monto === 200) return 30;
  return Math.round(monto * 0.15);
}

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

function primerNombre(nombre: string): string {
  return (nombre ?? "").split(" ")[0];
}

// ──────────────────────────────────────────
// ESTADOS DE ESCORTS — texto para el panel
// ──────────────────────────────────────────

function textoEstadoEscorts(): string {
  const lista = Object.values(estadosEscort);
  if (lista.length === 0) return "_No hay escorts registradas aún._";

  // Actualizar estados expirados
  const ahora = Date.now();
  for (const e of lista) {
    if (!e.libre && e.ocupadaHasta && ahora >= e.ocupadaHasta) {
      e.libre = true;
      e.ocupadaHasta = undefined;
      e.ocupadaTexto = undefined;
    }
  }

  return lista.map(e => {
    if (e.libre) return `🟢 *${primerNombre(e.nombre)}* — Libre`;
    const tiempo = e.ocupadaTexto ? ` (${e.ocupadaTexto})` : "";
    return `🔴 *${primerNombre(e.nombre)}* — Ocupada${tiempo}`;
  }).join("\n");
}

function textoPanelTelf(nombre: string): string {
  return (
    `📋 *Panel de Operaciones*\n` +
    `👋 ${primerNombre(nombre)}\n\n` +
    `👥 *Estado de escorts:*\n` +
    `${textoEstadoEscorts()}\n\n` +
    `━━━━━━━━━━━━━━`
  );
}

// Actualizar panel de TODOS los telefonistas registrados
async function actualizarPanelesTelf() {
  for (const [uidStr, msgId] of Object.entries(panelesTelf)) {
    const uid  = parseInt(uidStr);
    const conv = convTelf[uid];
    if (!conv || conv.paso !== "idle") continue;
    try {
      await editMsg(uid, msgId,
        textoPanelTelf(conv.nombre ?? ""),
        {
          reply_markup: {
            keyboard: [[{ text: "📞 Nuevo Cliente" }]],
            resize_keyboard: true,
            persistent: true,
          },
        }
      );
    } catch { /* mensaje no existe o no cambió */ }
  }
}

// ──────────────────────────────────────────
// TECLADOS REALES (solo telefonista en privado)
// ──────────────────────────────────────────

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
// PANEL ESCORT en el grupo escorts
// ──────────────────────────────────────────

async function enviarPanelEscort(uid: number, nombre: string) {
  const estado  = estadosEscort[uid];
  const esLibre = !estado || estado.libre;
  const texto   = esLibre
    ? `🟢 *Estás libre*\nLos telefonistas pueden verte disponible.`
    : `🔴 *Estás ocupada* (${estado.ocupadaTexto ?? ""})\nCambia tu estado cuando termines.`;

  return tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text: `👤 *${primerNombre(nombre)}*\n${texto}`,
    reply_markup: {
      inline_keyboard: esLibre
        ? [[{ text: "🔴 Ponerme Ocupada", callback_data: `estado_ocupada_${uid}` }]]
        : [[{ text: "🟢 Estoy Libre ya", callback_data: `estado_libre_${uid}` }]],
    },
  });
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
    const conv = convTelf[siguiente];
    const msgId = panelesTelf[siguiente];
    if (msgId) {
      await editMsg(siguiente, msgId,
        `✅ *Es tu turno.*\n\nPresiona el botón para registrar tu cliente.`,
        {
          reply_markup: {
            keyboard: [[{ text: "📞 Nuevo Cliente" }]],
            resize_keyboard: true,
            persistent: true,
          },
        }
      );
    } else {
      await sendMsg(siguiente, `✅ *Es tu turno.* Presiona el botón.`,
        { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
      );
    }
  }
}

// ──────────────────────────────────────────
// FLUJO TELEFONISTA
// ──────────────────────────────────────────

async function iniciarFlujo(uid: number, nombre: string) {
  convTelf[uid] = { ...convTelf[uid], paso: "esperando_digitos", nombre };
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
  convTelf[uid] = { paso: "idle", nombre: conv?.nombre };
  await liberarTurno();

  // Restaurar panel con estados
  const msgId = panelesTelf[uid];
  if (msgId) {
    await editMsg(uid, msgId,
      textoPanelTelf(conv?.nombre ?? ""),
      {
        reply_markup: {
          keyboard: [[{ text: "📞 Nuevo Cliente" }]],
          resize_keyboard: true,
          persistent: true,
        },
      }
    );
  } else {
    await sendMsg(uid, `❌ Cancelado.\n\n${textoPanelTelf(conv?.nombre ?? "")}`,
      { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
    );
  }
}

async function publicarEnEscorts(uid: number, nombre: string) {
  const conv = convTelf[uid];
  if (!conv) return;

  const desc = conv.descripcion ? `\n📝 _${conv.descripcion}_` : "";

  const gMsg = await tPost("sendMessage", {
    chat_id: GRUPO_TELEFONISTAS,
    parse_mode: "Markdown",
    text:
      `⏳ *Esperando escort...*\n━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `👤 Telefonista: *${primerNombre(nombre)}*\n━━━━━━━━━━━━━━`,
  });

  const eMsg = await tPost("sendMessage", {
    chat_id: GRUPO_ESCORTS,
    parse_mode: "Markdown",
    text:
      `🔔 *CLIENTE ABAJO*\n━━━━━━━━━━━━━━\n` +
      `🔢 Código: \`${conv.digitos}\`\n` +
      `💰 Estimado: *$${conv.monto}*${desc}\n` +
      `📲 De: *${primerNombre(nombre)}*\n━━━━━━━━━━━━━━\n¿Quién va?`,
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
    `⏳ *Esperando que una escort acepte...*\n\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*${desc}`,
    { reply_markup: { keyboard: [[{ text: "❌ Cancelar servicio" }]], resize_keyboard: true, persistent: true } }
  );
}

// ──────────────────────────────────────────
// CONFIRMAR ESCORT
// ──────────────────────────────────────────

async function confirmarEscort(uid: number, nombre: string) {
  const conv = convEscort[uid];
  if (!conv) return;

  const nota     = conv.nota ? `\n📝 _${conv.nota}_` : "";
  const telfConv = convTelf[conv.telfUid!];

  await editMsg(GRUPO_ESCORTS, conv.escortMsgId!,
    `🟡 *EN PROCESO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n🙋 Escort: *${primerNombre(nombre)}*${nota}\n━━━━━━━━━━━━━━`,
    { reply_markup: { inline_keyboard: [] } }
  );

  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId,
      `✅ *Escort lista*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n🙋 Escort: *${primerNombre(nombre)}*${nota}\n━━━━━━━━━━━━━━`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  await sendMsg(conv.telfUid!,
    `✅ *¡Escort lista!*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n🙋 Escort: *${primerNombre(nombre)}*${nota}\n━━━━━━━━━━━━━━\n\n¿Qué hago?`,
    { reply_markup: tecladoAcciones }
  );

  convTelf[conv.telfUid!] = { ...telfConv, paso: "esperando_confirmacion", escortNombre: nombre };
  delete convEscort[uid];
}

// ──────────────────────────────────────────
// PROCESAR RESULTADO FINAL
// ──────────────────────────────────────────

async function procesarResultado(
  escortNombre: string,
  telfUid: number,
  digitos: string,
  montoReal: number,
  escortMsgId: number
) {
  const telfConv   = convTelf[telfUid];
  const telfNombre = primerNombre(telfConv?.nombre ?? "Telefonista");
  const comision   = calcularComision(montoReal);

  comisiones[telfUid] = (comisiones[telfUid] ?? 0) + comision;
  const totalAcumulado = comisiones[telfUid];

  const textoEscorts =
    `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${digitos}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `🙋 Escort: *${primerNombre(escortNombre)}*\n━━━━━━━━━━━━━━`;

  const textoTelf =
    `✅ *SERVICIO COMPLETADO*\n━━━━━━━━━━━━━━\n` +
    `🔢 Código: \`${digitos}\`\n` +
    `💰 Pagó: *$${montoReal}*\n` +
    `🙋 Escort: *${primerNombre(escortNombre)}*\n━━━━━━━━━━━━━━\n` +
    `👤 *${telfNombre}*: +$${comision}\n` +
    `📊 Total acumulado: *$${totalAcumulado}*`;

  await editMsg(GRUPO_ESCORTS, escortMsgId, textoEscorts, { reply_markup: { inline_keyboard: [] } });

  if (telfConv?.grupMsgId) {
    await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId, textoTelf, { reply_markup: { inline_keyboard: [] } });
  }

  // Notificar telefonista y restaurar panel
  const panelMsgId = panelesTelf[telfUid];
  if (panelMsgId) {
    await editMsg(telfUid, panelMsgId,
      `${textoPanelTelf(telfConv?.nombre ?? "")}\n\n✅ *Último servicio completado*\n💵 Comisión: +$${comision} | Total: $${totalAcumulado}`,
      {
        reply_markup: {
          keyboard: [[{ text: "📞 Nuevo Cliente" }]],
          resize_keyboard: true,
          persistent: true,
        },
      }
    );
  } else {
    await sendMsg(telfUid,
      `✅ *¡Servicio completado!*\n🔢 Código: \`${digitos}\`\n💵 Comisión: +$${comision} | Total: $${totalAcumulado}`,
      { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
    );
  }

  convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre };
  await liberarTurno();
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
      // Registrar escort y enviar panel de estado en el grupo escorts
      if (!estadosEscort[uid]) {
        estadosEscort[uid] = { uid, nombre, libre: true };
      }
      await sendMsg(uid, `👋 *Bienvenida, ${primerNombre(nombre)}.*\n\nUsa el botón en el grupo de escorts para cambiar tu estado.`);
      await enviarPanelEscort(uid, nombre);
      return;
    }
    const esTelf = await esMiembroTelf(uid);
    if (!esTelf) {
      await sendMsg(uid, "❌ No tienes acceso. Pide al administrador que te añada al grupo.");
      return;
    }
    convTelf[uid] = { paso: "idle", nombre };

    // Enviar panel con estados
    const r = await sendMsg(uid,
      textoPanelTelf(nombre),
      {
        reply_markup: {
          keyboard: [[{ text: "📞 Nuevo Cliente" }]],
          resize_keyboard: true,
          persistent: true,
        },
      }
    );
    if (r?.result?.message_id) {
      panelesTelf[uid] = r.result.message_id;
    }
    return;
  }

  // ── Mensajes en privado del telefonista ──
  if (chatId === uid) {
    const conv = convTelf[uid];

    if (texto === "❌ Cancelar registro" || texto === "❌ Cancelar servicio") {
      await cancelarTelf(uid);
      return;
    }
    if (texto === "❌ Salir de la cola") {
      const idx = colaEspera.indexOf(uid);
      if (idx !== -1) colaEspera.splice(idx, 1);
      convTelf[uid] = { paso: "idle", nombre };
      const panelId = panelesTelf[uid];
      if (panelId) {
        await editMsg(uid, panelId, textoPanelTelf(nombre),
          { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
        );
      }
      return;
    }
    if (texto === "📞 Nuevo Cliente") {
      if (await esEscort(uid)) { await sendMsg(uid, "❌ Eres escort."); return; }
      await intentarTurno(uid, nombre);
      return;
    }

    if (!conv || conv.paso === "idle" || conv.paso === "esperando_confirmacion") return;

    await deleteMsg(uid, msg.message_id);

    if (conv.paso === "esperando_digitos") {
      if (!/^\d{4}$/.test(texto)) {
        await sendMsg(uid, `⚠️ Deben ser exactamente *4 dígitos*. Intenta de nuevo:`, { reply_markup: tecladoCancelar });
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_monto", digitos: texto };
      await sendMsg(uid,
        `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n🔢 Código: \`${texto}\`\n━━━━━━━━━━━━━━\n\n💵 ¿Cuánto estimas que pagará?\nElige o escribe el monto:`,
        { reply_markup: tecladoMontos }
      );
      return;
    }

    if (conv.paso === "esperando_monto") {
      const montoLimpio = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(montoLimpio)) {
        await sendMsg(uid, `⚠️ Ingresa solo el número. Ej: *100*`, { reply_markup: tecladoMontos });
        return;
      }
      convTelf[uid] = { ...conv, paso: "esperando_descripcion", monto: montoLimpio };
      await sendMsg(uid,
        `📞 *Nuevo Cliente*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${montoLimpio}*\n━━━━━━━━━━━━━━\n\n📝 ¿Deseas agregar una descripción?\n_Sin teléfonos ni redes sociales._`,
        { reply_markup: tecladoDescripcion }
      );
      return;
    }

    if (conv.paso === "esperando_descripcion") {
      if (texto === "➡️ Sin descripción") { await publicarEnEscorts(uid, nombre); return; }
      if (tieneContactoProhibido(texto)) {
        await sendMsg(uid, `🚫 *Bloqueado.* No se permiten teléfonos ni redes sociales.`, { reply_markup: tecladoDescripcion });
        return;
      }
      convTelf[uid] = { ...conv, descripcion: texto };
      await publicarEnEscorts(uid, nombre);
      return;
    }

    if (conv.paso === "esperando_confirmacion") {
      if (texto === "✈️ Lo envié, ya va de camino") {
        await sendMsg(uid,
          `✈️ *Cliente en camino.*\n🔢 Código: \`${conv.digitos}\`\nEspera el resultado.`,
          { reply_markup: { keyboard: [[{ text: "❌ Cancelar servicio" }]], resize_keyboard: true, persistent: true } }
        );
        if (conv.grupMsgId) {
          await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,
            `✈️ *CLIENTE EN CAMINO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n🙋 Escort: *${primerNombre(conv.escortNombre ?? "")}*\n━━━━━━━━━━━━━━`,
            { reply_markup: { inline_keyboard: [] } }
          );
        }
        if (conv.escortMsgId) {
          await tPost("sendMessage", {
            chat_id: GRUPO_ESCORTS,
            parse_mode: "Markdown",
            text:
              `✈️ *Cliente en camino*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n💰 Estimado: *$${conv.monto}*\n━━━━━━━━━━━━━━\nActualiza el resultado cuando termines:`,
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
        const esCancel  = texto === "❌ Cancelar servicio";
        const textoGrupo = esCancel
          ? `❌ *SERVICIO CANCELADO*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n━━━━━━━━━━━━━━`
          : `🚪 *CLIENTE SE FUE*\n━━━━━━━━━━━━━━\n🔢 Código: \`${conv.digitos}\`\n━━━━━━━━━━━━━━`;
        if (conv.grupMsgId)   await editMsg(GRUPO_TELEFONISTAS, conv.grupMsgId,   textoGrupo, { reply_markup: { inline_keyboard: [] } });
        if (conv.escortMsgId) await editMsg(GRUPO_ESCORTS,      conv.escortMsgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });
        convTelf[uid] = { paso: "idle", nombre };
        await liberarTurno();
        const panelId = panelesTelf[uid];
        if (panelId) {
          await editMsg(uid, panelId, textoPanelTelf(nombre),
            { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
          );
        }
        return;
      }
    }
    return;
  }

  // ── Grupo Escorts: nota o monto real ──
  if (chatId === GRUPO_ESCORTS) {
    const conv = convEscort[uid];
    if (!conv) return;
    await deleteMsg(GRUPO_ESCORTS, msg.message_id);

    if (conv.paso === "esperando_nota") {
      if (tieneContactoProhibido(texto)) {
        await sendMsg(GRUPO_ESCORTS, `🚫 *${primerNombre(nombre)}*, no se permiten teléfonos ni redes sociales.`,
          { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escort_ok_${uid}` }]] } }
        );
        return;
      }
      convEscort[uid] = { ...conv, nota: texto };
      await confirmarEscort(uid, nombre);
      return;
    }

    if (conv.paso === "esperando_monto_real") {
      const montoLimpio = texto.replace("$", "");
      if (!/^\d+(\.\d+)?$/.test(montoLimpio)) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ *${primerNombre(nombre)}*, ingresa solo el número. Ej: *120*`);
        return;
      }
      const montoReal = parseFloat(montoLimpio);
      delete convEscort[uid];
      await procesarResultado(nombre, conv.telfUid!, conv.digitos!, montoReal, conv.escortMsgId!);
      return;
    }

    if (conv.paso === "esperando_tiempo_personalizado") {
      convEscort[uid] = { paso: "esperando_nota" }; // reset
      const minutos = parseInt(texto);
      if (isNaN(minutos) || minutos <= 0) {
        await sendMsg(GRUPO_ESCORTS, `⚠️ Ingresa los minutos. Ej: *45*`);
        return;
      }
      estadosEscort[uid] = {
        uid, nombre,
        libre: false,
        ocupadaHasta: Date.now() + minutos * 60 * 1000,
        ocupadaTexto: `${minutos} min`,
      };
      await actualizarPanelesTelf();
      await sendMsg(GRUPO_ESCORTS,
        `🔴 *${primerNombre(nombre)}* está ocupada por *${minutos} minutos*.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: "🟢 Estoy Libre ya", callback_data: `estado_libre_${uid}` }]],
          },
        }
      );
      return;
    }
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
  const chatId: number = query.message.chat.id;

  // ── Estado escort: ponerse ocupada ──
  if (data.startsWith("estado_ocupada_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${primerNombre(nombre)}*\n🔴 ¿Cuánto tiempo estarás ocupada?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "5 min",  callback_data: `ocupada_5_${uid}`  },
              { text: "30 min", callback_data: `ocupada_30_${uid}` },
              { text: "1 hora", callback_data: `ocupada_60_${uid}` },
            ],
            [{ text: "⏱ Otro tiempo", callback_data: `ocupada_otro_${uid}` }],
          ],
        },
      }
    );
    return;
  }

  // ── Tiempo ocupada seleccionado ──
  if (data.match(/^ocupada_(\d+)_(\d+)$/)) {
    const parts   = data.split("_");
    const minutos = parseInt(parts[1]);
    const ownerId = parseInt(parts[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);

    const textoTiempo = minutos < 60 ? `${minutos} min` : `${minutos / 60} hora${minutos > 60 ? "s" : ""}`;
    estadosEscort[uid] = {
      uid, nombre,
      libre: false,
      ocupadaHasta: Date.now() + minutos * 60 * 1000,
      ocupadaTexto: textoTiempo,
    };

    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${primerNombre(nombre)}*\n🔴 *Ocupada* (${textoTiempo})\nCambia tu estado cuando termines.`,
      { reply_markup: { inline_keyboard: [[{ text: "🟢 Estoy Libre ya", callback_data: `estado_libre_${uid}` }]] } }
    );
    await actualizarPanelesTelf();
    return;
  }

  // ── Tiempo personalizado ──
  if (data.startsWith("ocupada_otro_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);
    convEscort[uid] = { paso: "esperando_tiempo_personalizado" };
    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${primerNombre(nombre)}*\n⏱ Escribe cuántos minutos estarás ocupada:`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  // ── Estado escort: ponerse libre ──
  if (data.startsWith("estado_libre_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu botón.", true);
    await answerCB(query.id);

    estadosEscort[uid] = { uid, nombre, libre: true };

    await editMsg(GRUPO_ESCORTS, msgId,
      `👤 *${primerNombre(nombre)}*\n🟢 *Estás libre*\nLos telefonistas pueden verte disponible.`,
      { reply_markup: { inline_keyboard: [[{ text: "🔴 Ponerme Ocupada", callback_data: `estado_ocupada_${uid}` }]] } }
    );
    await actualizarPanelesTelf();
    return;
  }

  // ── Escort acepta cliente ──
  if (data.startsWith("acepto_")) {
    const escort = await esEscort(uid);
    if (!escort) return answerCB(query.id, "❌ Solo las escorts pueden aceptar.", true);

    const parts   = data.split("_");
    const digitos = parts[1];
    const monto   = parts[2];
    const telfUid = parseInt(parts[3]);
    const telfConv = convTelf[telfUid];

    convEscort[uid] = {
      paso: "esperando_nota",
      digitos,
      monto,
      escortMsgId: msgId,
      telfUid,
      telfNombre: telfConv?.nombre ?? "Telefonista",
    };

    await editMsg(GRUPO_ESCORTS, msgId,
      `🟡 *${primerNombre(nombre)} está tomando el cliente...*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n💰 Estimado: *$${monto}*\n━━━━━━━━━━━━━━\nEscribe una nota o toca Sin nota:`,
      { reply_markup: { inline_keyboard: [[{ text: "➡️ Sin nota", callback_data: `escort_ok_${uid}` }]] } }
    );

    return answerCB(query.id, "✅ Aceptado. Escribe tu nota o toca 'Sin nota'.");
  }

  // ── Escort sin nota ──
  if (data.startsWith("escort_ok_")) {
    const ownerId = parseInt(data.split("_")[2]);
    if (uid !== ownerId) return answerCB(query.id, "❌ No es tu cliente.", true);
    await answerCB(query.id);
    await confirmarEscort(uid, nombre);
    return;
  }

  // ── Resultado: pagó ──
  if (data.startsWith("res_pago_")) {
    if (!await esEscort(uid)) return answerCB(query.id, "❌ Sin permisos.", true);
    const parts    = data.split("_");
    const digitos  = parts[2];
    const monto    = parts[3];
    const telfUid  = parseInt(parts[4]);
    const montoNum = parseFloat(monto);
    await answerCB(query.id);

    if ([50, 100, 150, 200].includes(montoNum)) {
      await procesarResultado(nombre, telfUid, digitos, montoNum, msgId);
    } else {
      convEscort[uid] = { paso: "esperando_monto_real", digitos, monto, escortMsgId: msgId, telfUid, telfNombre: convTelf[telfUid]?.nombre ?? "" };
      await editMsg(GRUPO_ESCORTS, msgId,
        `💵 *¿Cuánto pagó realmente el cliente?*\nEscribe el monto en el grupo:`,
        { reply_markup: { inline_keyboard: [] } }
      );
    }
    return;
  }

  // ── Resultado: no pagó ──
  if (data.startsWith("res_nopago_")) {
    if (!await esEscort(uid)) return answerCB(query.id, "❌ Sin permisos.", true);
    const parts    = data.split("_");
    const digitos  = parts[2];
    const monto    = parts[3];
    const telfUid  = parseInt(parts[4]);
    const telfConv = convTelf[telfUid];
    await answerCB(query.id);

    const textoGrupo = `🚪 *CLIENTE NO PAGÓ*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${primerNombre(nombre)}*\n━━━━━━━━━━━━━━`;
    await editMsg(GRUPO_ESCORTS, msgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });
    if (telfConv?.grupMsgId) await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });

    const panelId = panelesTelf[telfUid];
    if (panelId) {
      await editMsg(telfUid, panelId, textoPanelTelf(telfConv?.nombre ?? ""),
        { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
      );
    } else {
      await sendMsg(telfUid, `🚪 *Cliente no pagó.*\n🔢 Código: \`${digitos}\``,
        { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
      );
    }
    convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre };
    await liberarTurno();
    return;
  }

  // ── Resultado: problema ──
  if (data.startsWith("res_problema_")) {
    if (!await esEscort(uid)) return answerCB(query.id, "❌ Sin permisos.", true);
    const parts    = data.split("_");
    const digitos  = parts[2];
    const monto    = parts[3];
    const telfUid  = parseInt(parts[4]);
    const telfConv = convTelf[telfUid];
    await answerCB(query.id);

    const textoGrupo = `⚠️ *HUBO UN PROBLEMA*\n━━━━━━━━━━━━━━\n🔢 Código: \`${digitos}\`\n🙋 Escort: *${primerNombre(nombre)}*\n━━━━━━━━━━━━━━`;
    await editMsg(GRUPO_ESCORTS, msgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });
    if (telfConv?.grupMsgId) await editMsg(GRUPO_TELEFONISTAS, telfConv.grupMsgId, textoGrupo, { reply_markup: { inline_keyboard: [] } });

    const panelId = panelesTelf[telfUid];
    if (panelId) {
      await editMsg(telfUid, panelId, textoPanelTelf(telfConv?.nombre ?? ""),
        { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
      );
    } else {
      await sendMsg(telfUid, `⚠️ *Hubo un problema.*\n🔢 Código: \`${digitos}\``,
        { reply_markup: { keyboard: [[{ text: "📞 Nuevo Cliente" }]], resize_keyboard: true, persistent: true } }
      );
    }
    convTelf[telfUid] = { paso: "idle", nombre: telfConv?.nombre };
    await liberarTurno();
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
