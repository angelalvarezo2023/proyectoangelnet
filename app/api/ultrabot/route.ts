import { NextRequest, NextResponse } from 'next/server'
import { LicenseAPI, type MegaBotLicense } from '@/lib/firebase'
import { getDatabase, ref, update, get } from 'firebase/database'
import { initializeApp, getApps } from 'firebase/app'

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

async function updatePerfil(key: string, fingerprint: string, fields: Record<string, any>) {
  await update(ref(getDB(), `megabot_licenses/${key.toUpperCase()}/perfiles/${fingerprint}`), fields)
}

async function getPerfiles(key: string): Promise<Record<string, any>> {
  const snap = await get(ref(getDB(), `megabot_licenses/${key.toUpperCase()}/perfiles`))
  return snap.val() || {}
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
function buildMain(license: MegaBotLicense) {
  const dias        = Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / 86400000)
  const paused      = (license as any).remotePaused === true
  const perfiles    = license.fingerprints?.length ?? 0
  const maxPerfiles = LicenseAPI.getMaxPerfiles(license.plan, license.maxPerfiles)

  const text = [
    `🤖 <b>UltraBot</b> — <code>${license.key}</code>`,
    ``,
    `👤 <b>${license.clientName}</b>`,
    `📦 Plan: <b>${license.plan === 'pro' ? '⭐ PRO' : '📦 Básico'}</b>`,
    `📅 Expira en: <b>${dias > 0 ? `${dias} días` : 'EXPIRADA'}</b>`,
    `🖥️ Perfiles: <b>${perfiles}/${maxPerfiles}</b>`,
    ``,
    `Estado general: ${paused ? '⏸ <b>PAUSADO</b>' : '✅ <b>ACTIVO</b>'}`,
  ].join('\n')

  const keyboard = {
    inline_keyboard: [
      // Botones generales
      [
        paused
          ? { text: '▶️ Reanudar TODOS', callback_data: 'all_reanudar' }
          : { text: '⏸ Pausar TODOS',   callback_data: 'all_pausar' },
      ],
      // Ver perfiles
      [{ text: '📱 Administrar Perfiles', callback_data: 'ver_perfiles' }],
      // Actualizar
      [{ text: '🔄 Actualizar estado', callback_data: 'main_estado' }],
    ],
  }

  return { text, keyboard }
}

// ─── Lista de perfiles ────────────────────────────────────────────────────────
async function buildPerfilesList(license: MegaBotLicense) {
  const perfilesData = await getPerfiles(license.key)
  const fingerprints = license.fingerprints || []

  const text = [`📱 <b>Tus Perfiles</b>\n`]

  const buttons: any[][] = []

  if (fingerprints.length === 0) {
    text.push(`<i>No hay perfiles registrados aún.\nAbre MegaPersonals y el bot los detectará automáticamente.</i>`)
  } else {
    fingerprints.forEach((fp, i) => {
      const data    = perfilesData[fp]
      const tel     = data?.telefono || `Perfil ${i + 1}`
      const paused  = data?.pausado === true
      const estado  = paused ? '⏸' : '✅'
      text.push(`${estado} <b>${tel}</b>`)
      buttons.push([{ text: `${estado} ${tel}`, callback_data: `perfil_${fp}` }])
    })
  }

  // Botón volver
  buttons.push([{ text: '⬅️ Volver', callback_data: 'main_estado' }])

  return {
    text: text.join('\n'),
    keyboard: { inline_keyboard: buttons }
  }
}

// ─── Panel de un perfil individual ───────────────────────────────────────────
async function buildPerfilPanel(license: MegaBotLicense, fingerprint: string) {
  const perfilesData = await getPerfiles(license.key)
  const data         = perfilesData[fingerprint] || {}
  const tel          = data.telefono   || `Perfil ${fingerprint.substring(0, 8)}`
  const paused       = data.pausado    === true
  const timerMin     = data.timerMin   || 15
  const timerMax     = data.timerMax   || 15

  const text = [
    `📱 <b>Perfil: ${tel}</b>`,
    ``,
    `Estado: ${paused ? '⏸ <b>PAUSADO</b>' : '✅ <b>ACTIVO</b>'}`,
    `⏱ Intervalo: <b>${timerMin === timerMax ? `${timerMin} min` : `${timerMin}-${timerMax} min`}</b>`,
  ].join('\n')

  const fp = fingerprint

  const keyboard = {
    inline_keyboard: [
      // Pausar / Reanudar este perfil
      [
        paused
          ? { text: '▶️ Reanudar este perfil', callback_data: `p_reanudar_${fp}` }
          : { text: '⏸ Pausar este perfil',   callback_data: `p_pausar_${fp}` },
      ],
      // Intervalo
      [
        { text: '15 min', callback_data: `p_timer_${fp}_15` },
        { text: '20 min', callback_data: `p_timer_${fp}_20` },
        { text: '30 min', callback_data: `p_timer_${fp}_30` },
        { text: '45 min', callback_data: `p_timer_${fp}_45` },
        { text: '1 hora', callback_data: `p_timer_${fp}_60` },
      ],
      // Volver a la lista
      [{ text: '⬅️ Volver a perfiles', callback_data: 'ver_perfiles' }],
    ],
  }

  return { text, keyboard }
}

// ─── Bienvenida ───────────────────────────────────────────────────────────────
async function sendBienvenida(chatId: number, nombre: string) {
  await send(chatId,
    `👋 Hola <b>${nombre}</b>!\n\n` +
    `Bienvenido a <b>UltraBot</b> 🤖\n\n` +
    `Escribe tu <b>clave de licencia</b> para comenzar:\n\n` +
    `<code>MEGA-XXXX-XXXX</code>`
  )
}

// ─── Procesar texto ───────────────────────────────────────────────────────────
async function handleText(chatId: number, text: string, nombre: string) {
  const clave = text.trim().toUpperCase()

  if (clave.length >= 8) {
    const license = await LicenseAPI.getLicense(clave)

    if (!license) {
      await send(chatId,
        `❌ Clave <code>${clave}</code> no encontrada.\nVerifica que la escribiste bien.`,
        { reply_markup: { inline_keyboard: [[{ text: '🔄 Intentar de nuevo', callback_data: 'reintentar' }]] } }
      )
      return
    }

    if (!license.active) {
      await send(chatId, `❌ Licencia <b>desactivada</b>.\nContacta al vendedor.`)
      return
    }

    if (new Date(license.expiresAt) <= new Date()) {
      await send(chatId, `❌ Licencia <b>expirada</b>.\nContacta al vendedor para renovarla.`)
      return
    }

    await updateLicense(clave, { telegramChatId: chatId })

    const { text: panelText, keyboard } = buildMain(license)
    await send(chatId, `✅ <b>¡Licencia vinculada!</b>\n\n` + panelText, { reply_markup: keyboard })
    return
  }

  await sendBienvenida(chatId, nombre)
}

// ─── Procesar callbacks ───────────────────────────────────────────────────────
async function handleCallback(chatId: number, msgId: number, cbId: string, data: string) {
  await answerCb(cbId)

  if (data === 'reintentar') {
    await editMsg(chatId, msgId, `✍️ Escribe tu <b>clave de licencia</b>:\n\n<code>MEGA-XXXX-XXXX</code>`)
    return
  }

  let license = await getLicenseByChatId(chatId)
  if (!license) {
    await editMsg(chatId, msgId, `❌ No tienes una licencia vinculada.\n\nEscribe tu clave para comenzar.`)
    return
  }

  // ── Panel principal ──
  if (data === 'main_estado') {
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildMain(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '🔄 Actualizado')
    return
  }

  // ── Pausar / Reanudar TODOS ──
  if (data === 'all_pausar') {
    await updateLicense(license.key, { remotePaused: true })
    // También pausar todos los perfiles individualmente
    const fingerprints = license.fingerprints || []
    for (const fp of fingerprints) {
      await updatePerfil(license.key, fp, { pausado: true })
    }
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildMain(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '⏸ Todos pausados')
    return
  }

  if (data === 'all_reanudar') {
    await updateLicense(license.key, { remotePaused: false })
    const fingerprints = license.fingerprints || []
    for (const fp of fingerprints) {
      await updatePerfil(license.key, fp, { pausado: false })
    }
    license = (await LicenseAPI.getLicense(license.key))!
    const { text, keyboard } = buildMain(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '▶️ Todos reanudados')
    return
  }

  // ── Ver lista de perfiles ──
  if (data === 'ver_perfiles') {
    const { text, keyboard } = await buildPerfilesList(license)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    return
  }

  // ── Abrir perfil individual ──
  if (data.startsWith('perfil_')) {
    const fp = data.replace('perfil_', '')
    const { text, keyboard } = await buildPerfilPanel(license, fp)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    return
  }

  // ── Pausar perfil individual ──
  if (data.startsWith('p_pausar_')) {
    const fp = data.replace('p_pausar_', '')
    await updatePerfil(license.key, fp, { pausado: true })

    // Verificar si todos están pausados → pausar general también
    const perfilesData = await getPerfiles(license.key)
    const todos = (license.fingerprints || []).every(f => perfilesData[f]?.pausado === true)
    if (todos) await updateLicense(license.key, { remotePaused: true })

    const { text, keyboard } = await buildPerfilPanel(license, fp)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '⏸ Perfil pausado')
    return
  }

  // ── Reanudar perfil individual ──
  if (data.startsWith('p_reanudar_')) {
    const fp = data.replace('p_reanudar_', '')
    await updatePerfil(license.key, fp, { pausado: false })
    // Si hay pausa general, quitarla también
    await updateLicense(license.key, { remotePaused: false })

    const { text, keyboard } = await buildPerfilPanel(license, fp)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, '▶️ Perfil reanudado')
    return
  }

  // ── Cambiar intervalo de perfil individual ──
  if (data.startsWith('p_timer_')) {
    // formato: p_timer_{fingerprint}_{minutos}
    const parts = data.replace('p_timer_', '').split('_')
    const min   = parseInt(parts[parts.length - 1])
    const fp    = parts.slice(0, -1).join('_')
    await updatePerfil(license.key, fp, { timerMin: min, timerMax: min })

    const { text, keyboard } = await buildPerfilPanel(license, fp)
    await editMsg(chatId, msgId, text, { reply_markup: keyboard })
    await answerCb(cbId, `⏱ ${min} min`)
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
          const { text: panelText, keyboard } = buildMain(license)
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
    console.error('[UltraBot]', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'UltraBot webhook activo ✅' })
}
