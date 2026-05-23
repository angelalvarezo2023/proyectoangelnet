import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, ref, update, get } from 'firebase/database'
import { initializeApp, getApps } from 'firebase/app'

const cfg = {
  apiKey:      "AIzaSyCnFuJqTuAXWYcg5N9rz0eNgQDj7JFEEjw",
  databaseURL: "https://megapersonals-control-default-rtdb.firebaseio.com",
  projectId:   "megapersonals-control",
}

function getDB() {
  const app = getApps().find(a => a.name === 'profile') || initializeApp(cfg, 'profile')
  return getDatabase(app)
}

// Guarda: licenses/{key}/perfiles/{fingerprint} = { telefono, postId, updatedAt }
export async function POST(req: NextRequest) {
  try {
    const { key, fingerprint, postId, telefono } = await req.json()
    if (!key || !fingerprint || !telefono) {
      return NextResponse.json({ ok: false })
    }

    const db      = getDB()
    const limpio  = telefono.trim()
    const perfilRef = ref(db, `megabot_licenses/${key.toUpperCase()}/perfiles/${fingerprint}`)

    await update(perfilRef, {
      telefono:  limpio,
      postId,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[profile]', err)
    return NextResponse.json({ ok: false })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }
  })
}
