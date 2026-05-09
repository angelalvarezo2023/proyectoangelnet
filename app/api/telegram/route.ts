import { NextRequest, NextResponse } from "next/server";

const TOKEN = process.env.TELEGRAM_TOKEN!;
const API   = `https://api.telegram.org/bot${TOKEN}`;

// Los dos grupos que se comunican
const GRUPO_A = -1003938759901; // Grupo escorts
const GRUPO_B = -5171466708;   // Grupo telefonistas

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

function fn(nombre: string): string {
  return (nombre ?? "").split(" ")[0];
}

// Registro de infracciones por usuario
const infracciones: Record<number, number> = {};

function tieneContacto(texto: string): boolean {
  return [
    /\d[\d\s\-().]{6,}\d/,          // números de teléfono
    /\+\d{1,3}[\s\-]?\d{6,}/,           // teléfonos con código de país
    /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/,    // formato xxx-xxx-xxxx
    /@[a-zA-Z0-9_.]{2,}/,               // usuarios @
    /(whatsapp|telegram|instagram|facebook|tiktok|snapchat|twitter|youtube|ig|wa|fb|tt)/i,
    /(t\.me|wa\.me|bit\.ly|instagram\.com|facebook\.com)/i,
  ].some(p => p.test(texto));
}

async function banear(chatId: number, uid: number) {
  await tPost("banChatMember", { chat_id: chatId, user_id: uid });
}

async function expulsar(chatId: number, uid: number) {
  await tPost("banChatMember", { chat_id: chatId, user_id: uid });
  // Desbanear inmediatamente para que pueda volver a unirse si el admin lo permite
  await tPost("unbanChatMember", { chat_id: chatId, user_id: uid });
}

// ──────────────────────────────────────────
// REENVIAR MENSAJE AL OTRO GRUPO
// ──────────────────────────────────────────

async function reenviar(msg: any, destino: number, tag: string) {
  const nombre  = fn(msg.from?.first_name ?? "");
  const label   = `${tag} | ${nombre}:`;
  const caption = msg.caption ? `\n${msg.caption}` : "";
  if (msg.text) {
    await tPost("sendMessage", {
      chat_id: destino,
      text: `*${label}*\n${msg.text}`,
      parse_mode: "Markdown",
    });
  } else if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await tPost("sendPhoto", {
      chat_id: destino,
      photo: fileId,
      caption: `*${label}*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.voice) {
    await tPost("sendVoice", {
      chat_id: destino,
      voice: msg.voice.file_id,
      caption: `*${label}*`,
      parse_mode: "Markdown",
    });
  } else if (msg.video) {
    await tPost("sendVideo", {
      chat_id: destino,
      video: msg.video.file_id,
      caption: `*${label}*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.audio) {
    await tPost("sendAudio", {
      chat_id: destino,
      audio: msg.audio.file_id,
      caption: `*${label}*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.document) {
    await tPost("sendDocument", {
      chat_id: destino,
      document: msg.document.file_id,
      caption: `*${label}*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.video_note) {
    await tPost("sendVideoNote", {
      chat_id: destino,
      video_note: msg.video_note.file_id,
    });
  } else if (msg.sticker) {
    await tPost("sendSticker", {
      chat_id: destino,
      sticker: msg.sticker.file_id,
    });
  }
}

// ──────────────────────────────────────────
// MANEJO DE INFRACCIONES
// ──────────────────────────────────────────

async function manejarInfraccion(msg: any, chatId: number, uid: number, nombre: string) {
  // Borrar el mensaje
  await tPost("deleteMessage", { chat_id: chatId, message_id: msg.message_id });

  infracciones[uid] = (infracciones[uid] ?? 0) + 1;
  const count = infracciones[uid];

  if (count === 1) {
    // Primera vez — advertencia
    const aviso = await tPost("sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `⚠️ *${fn(nombre)}*, tu mensaje fue eliminado.\n\n` +
        `🚫 *Está prohibido compartir:*\n` +
        `• Números de teléfono\n` +
        `• Redes sociales (Instagram, WhatsApp, etc.)\n` +
        `• Links o usuarios (@)\n\n` +
        `⚠️ *Si lo vuelves a intentar, serás expulsado del grupo.*`,
    });
    // Borrar el aviso después de 10 segundos
    setTimeout(() => {
      tPost("deleteMessage", { chat_id: chatId, message_id: aviso.result?.message_id }).catch(() => {});
    }, 10000);
  } else {
    // Segunda vez — expulsar
    await expulsar(chatId, uid);
    const aviso = await tPost("sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text:
        `🚫 *${fn(nombre)}* fue expulsado por intentar compartir información de contacto por segunda vez.`,
    });
    // Borrar el aviso después de 10 segundos
    setTimeout(() => {
      tPost("deleteMessage", { chat_id: chatId, message_id: aviso.result?.message_id }).catch(() => {});
    }, 10000);
    // Resetear infracciones
    delete infracciones[uid];
  }
}

// ──────────────────────────────────────────
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const chatId: number = msg.chat?.id;
  const uid: number    = msg.from?.id;
  const nombre: string = msg.from?.first_name ?? "";
  if (!chatId || !uid) return;

  // Ignorar mensajes del propio bot
  if (msg.from?.is_bot) return;

  // Ignorar entradas/salidas del grupo
  if (msg.new_chat_members || msg.left_chat_member) return;

  // Comando /video — solo para telefonistas
  if (msg.text === "/video" && chatId === GRUPO_B) {
    await tPost("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
    // Generar ID único para la sala
    const roomId = `tunel-${Math.random().toString(36).substring(2, 9)}`;
    const enlace = `https://jitsi.riot.im/${roomId}`;
    const advertencia =
      `\n\n⚠️ *AVISO DE SEGURIDAD*\n` +
      `🔴 Esta sesión está siendo *monitoreada*.\n` +
      `🚫 Cualquier intento de compartir número de teléfono, redes sociales o información personal resultará en *expulsión inmediata* del grupo.`;

    const texto =
      `🎥 *Video Verificación*\n━━━━━━━━━━━━━━\n\n` +
      `🔗 *Enlace de la sala:*\n${enlace}\n\n` +
      `💡 _Envía este enlace al cliente y dile a la modelo que lo abra._\n` +
      `⏱ _La sala se cierra sola cuando todos salgan._` +
      advertencia;

    // Enviar a telefonistas
    await tPost("sendMessage", { chat_id: GRUPO_B, text: texto, parse_mode: "Markdown" });
    // Enviar a escorts
    await tPost("sendMessage", {
      chat_id: GRUPO_A,
      parse_mode: "Markdown",
      text:
        `🎥 *Video Verificación*\n━━━━━━━━━━━━━━\n\n` +
        `🔗 *Enlace de la sala:*\n${enlace}\n\n` +
        `💡 _Abre el enlace en Chrome o Safari y permite acceso a tu cámara._` +
        advertencia,
    });
    return;
  }

  // Puente: Grupo A → Grupo B
  if (chatId === GRUPO_A) {
    const textoA = msg.text || msg.caption || "";
    if (tieneContacto(textoA)) {
      await manejarInfraccion(msg, chatId, uid, nombre);
      return;
    }
    await reenviar(msg, GRUPO_B, "🌹 Modelo");
    return;
  }

  // Puente: Grupo B → Grupo A
  if (chatId === GRUPO_B) {
    const textoB = msg.text || msg.caption || "";
    if (tieneContacto(textoB)) {
      await manejarInfraccion(msg, chatId, uid, nombre);
      return;
    }
    await reenviar(msg, GRUPO_A, "📞 Telefonista");
    return;
  }
}

// ──────────────────────────────────────────
// ROUTE HANDLER
// ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.message) await handleMessage(body.message);
  } catch (err) {
    console.error("Bot error:", err);
  }
  return NextResponse.json({ ok: true });
}
