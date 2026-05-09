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

// ──────────────────────────────────────────
// REENVIAR MENSAJE AL OTRO GRUPO
// ──────────────────────────────────────────

async function reenviar(msg: any, destino: number) {
  const nombre  = fn(msg.from?.first_name ?? "");
  const caption = msg.caption ? `\n${msg.caption}` : "";

  if (msg.text) {
    await tPost("sendMessage", {
      chat_id: destino,
      text: `*${nombre}:*\n${msg.text}`,
      parse_mode: "Markdown",
    });
  } else if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await tPost("sendPhoto", {
      chat_id: destino,
      photo: fileId,
      caption: `*${nombre}:*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.voice) {
    await tPost("sendVoice", {
      chat_id: destino,
      voice: msg.voice.file_id,
      caption: `*${nombre}:*`,
      parse_mode: "Markdown",
    });
  } else if (msg.video) {
    await tPost("sendVideo", {
      chat_id: destino,
      video: msg.video.file_id,
      caption: `*${nombre}:*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.audio) {
    await tPost("sendAudio", {
      chat_id: destino,
      audio: msg.audio.file_id,
      caption: `*${nombre}:*${caption}`,
      parse_mode: "Markdown",
    });
  } else if (msg.document) {
    await tPost("sendDocument", {
      chat_id: destino,
      document: msg.document.file_id,
      caption: `*${nombre}:*${caption}`,
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
// MANEJADOR DE MENSAJES
// ──────────────────────────────────────────

async function handleMessage(msg: any) {
  const chatId: number = msg.chat?.id;
  const uid: number    = msg.from?.id;
  if (!chatId || !uid) return;

  // Ignorar mensajes del propio bot
  if (msg.from?.is_bot) return;

  // Ignorar entradas/salidas del grupo
  if (msg.new_chat_members || msg.left_chat_member) return;

  // Puente: Grupo A → Grupo B
  if (chatId === GRUPO_A) {
    await reenviar(msg, GRUPO_B);
    return;
  }

  // Puente: Grupo B → Grupo A
  if (chatId === GRUPO_B) {
    await reenviar(msg, GRUPO_A);
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
