import { NextRequest, NextResponse } from 'next/server'
import { LicenseAPI, type MegaBotLicense } from '@/lib/firebase'
import { getDatabase, ref, update } from 'firebase/database'
import { initializeApp, getApps } from 'firebase/app'

// Token del bot de UltraBot (diferente al bot de grupos)
const TOKEN = process.env.ULTRABOT_TELEGRAM_TOKEN!
const API   = `https://api.telegram.org/bot${TOKEN}`

// ─── Firebase ─────────────────────────────────────────────────────────────────
function getDB() {
  const cfg = {
    apiKey:      "AIzaSyCnFuJqTuAXWYcg5N9rz0eNgQDj7JFEEjw",
    databaseURL: "https://megapersonals-control-default-rtdb.firebaseio.com",
    projectId:   "megapersonals-control",
  }
  const name = 'ultrabot'
  const app  = getApps().find(a => a.name === name) || initializeApp(cfg, name)
  return getDatabase(app)
}

async function updateLicense(key: string, fields: Record<string, any>) {
  await update(ref(getDB(), `megabot_licenses/${key.toUpperCase()}`), fields)
}

async function getLicenseByChatId(chatId: number): Promise<MegaBotLicense | null> {
  const all = await LicenseAPI.getAllLicenses()
  return Object.values(all).find(l => (l as any).telegramChatId === chatId) || null
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────
async function send(chatId: number, text: string, extra: any = {}) {
  await fetch(`${API}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  })
}

async function editMsg(chatId: number, msgId: number, text: string, extra: any = {}) {
  await fetch(`${API}/editMessageText`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', ...extra }),
  })
}

async function answerCb(id: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ callback_query_id: id, text }),
  })
}

// ─── Panel principal ──────────────────────────────────────────────────────────
function buildPanel(license: MegaBotLicense) {
  const dias        = Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / 86400000)
  const paused      = (license as any).remotePaused === true
  const perfiles    = license.fingerprints?.length ?? 0
  const maxPerfiles = LicenseAPI.getMaxPerfiles(license.plan, license.maxPerfiles)
  const timerMin    = (license as any).remoteTimerMin || 15
  const timerMax    = (license as any).remoteTimerMax || 15

  const estadoIcon  = paused ? '⏸' : '✅'
  const estadoText  = paused ? '<b>PAUSADO</b>' : '<b>ACTIVO</b>'

  const text = [
    `🤖 <b>UltraBot</b> — <code>${license.key}</code>`,
    ``,
    `👤 Cliente: <b>${license.clientName}</b>`,
    `📦 Plan: <b>${license.plan === 'pro' ? '⭐ PRO' : '📦 Básico'}</b>`,
    `📅 Expira en: <b>${dias > 0 ? `${dias} días` : 'EXPIRADA'}</b>`,
    `🖥️ Perfiles: <b>${perfiles}/${maxPerfiles}</b>`,
    `⏱️ Intervalo: <b>${timerMin === timerMax ? `${timerMin} min` : `${timerMin}-${timerMax} min`}</b>`,
    ``,
    `Estado: ${estadoIcon} ${estadoText}`,
  ].join('\n')

  const keyboard = {
    inline_keyboard: [
      [
        paused
          ? { text: '▶️ Reanudar bot',  callback_data: 'reanudar' }
          : { text: '⏸ Pausar bot',     callback_data: 'pausar'   },
      ],
      [
        { text: '⏱ 10 min', callback_data: 'timer_10' },
        { text: '⏱ 15 min', callback_data: 'timer_15' },
        { text: '⏱ 20 min', callback_data: 'timer_20' },
        { text: '⏱ 30 min', callback_data: 'timer_30' },
      ],
      [
        { text: '🔄 Actualizar estado', callback_data: 'estado' },
      ],
    ],
  }

  return { text, keyboard }
}

// ─── Bienvenida ───────────────────────────────────────────────────────────────
async function sendBienvenida(chatId: number, nombre: string) {
  await send(chatId,
    `👋 Hola <b>${nombre}</b>!\n\n` +
    `Bienvenido a <b>UltraBot</b> 🤖\n\n` +
    `Para comenzar, escribe tu <b>clave de licencia</b>:\n\n` +
    `<code>MEGA-XXXX-XXXX</code>`
  )
}

// ─── Procesar texto ───────────────────────────────────────────────────────────
async function handleText(chatId: number, text: string, nombre: string) {
  const clave = text.trim().toUpperCase()

  // Parece una clave
  if (clave.length >= 8) {
    const license = await LicenseAPI.getLicense(clave)

    if (!license) {
      await send(chatId,
        `❌ Clave <code>${clave}</code> no encontrada.\n\nVerifica que la escribiste bien e intenta de nuevo.`,
        { reply_markup: { inline_keyboard: [[{ text: '🔄 Intentar de nuevo', callback_data: 'reintentar' }]] } }
      )
      return
    }

    if (!license.active) {
      await send(chatId, `❌ Esta licencia está <b>desactivada</b>.\nContacta al vendedor.`)
      return
    }

    if (new Date(license.expiresAt) <= new Date()) {
      await send(chatId, `❌ Esta licencia ha <b>expirado</b>.\nContacta al vendedor para renovarla.`)
      return
    }

    // Vincular chatId
    await updateLicense(clave, { telegramChatId: chatId })

    const { text: panelText, keyboard } = buildPanel(license)
    await send(chatId, `✅ <b>¡Licencia vinculada!</b>\n\n` + panelText, { reply_markup: keyboard })
    return
  }

  // No reconocido
  await sendBienvenida(chatId, nombre)
}

// ─── Procesar callbacks ───────────────────────────────────────────────────────
async function handleCallback(chatId: number, msgId: number, cbId: string, data: string) {
  await answerCb(cbId)

  if (data === 'reintentar') {
    await editMsg(chatId, msgId,
      `✍️ Escribe tu <b>clave de licencia</b>:\n\n<code>MEGA-XXXX-XXXX</code>`
    )
    return
  }

  let license = await getLicenseByChatId(chatId)
  if (!license) {
    await editMsg(chatId, msgId, `❌ No tienes una licencia vinculada.\n\nEscribe tu clave para comenzar.`)
    return
  }

  if (data === 'pausar') {
    await updateLicense(license.key, { remotePaused: true })
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildPanel(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '⏸ Bot pausado')
    return
  }

  if (data === 'reanudar') {
    await updateLicense(license.key, { remotePaused: false })
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildPanel(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '▶️ Bot reanudado')
    return
  }

  if (data === 'estado') {
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildPanel(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '🔄 Actualizado')
    return
  }

  if (data.startsWith('timer_')) {
    const min = parseInt(data.replace('timer_', ''))
    await updateLicense(license.key, { remoteTimerMin: min, remoteTimerMax: min })
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildPanel(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, `⏱ Intervalo: ${min} min`)
    return
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.callback_query) {
      const cb = body.callback_query
      await handleCallback(cb.message.chat.id, cb.message.message_id, cb.id, cb.data)
      return NextResponse.json({ ok: true })
    }

    if (body.message?.text) {
      const chatId = body.message.chat.id
      const text   = body.message.text.trim()
      const nombre = body.message.from?.first_name || 'usuario'

      if (text === '/start') {
        const license = await getLicenseByChatId(chatId)
        if (license) {
          const { text: panelText, keyboard } = buildPanel(license)
          await send(chatId, panelText, { reply_markup: keyboard })
        } else {
          await sendBienvenida(chatId, nombre)
        }
        return NextResponse.json({ ok: true })
      }

      await handleText(chatId, text, nombre)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[UltraBot Telegram]', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'UltraBot webhook activo ✅' })
}
