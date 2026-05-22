
import { NextRequest, NextResponse } from 'next/server'
import { LicenseAPI } from '@/lib/firebase'

export async function POST(req: NextRequest) {
  try {
    const { key, fingerprint } = await req.json()

    if (!key || !fingerprint) {
      return json({ success: false, message: '❌ Datos incompletos' })
    }

    const result = await LicenseAPI.activateLicense(key.toUpperCase(), fingerprint)

    return json({
      success: result.success,
      message: result.message,
      ...(result.license && {
        cliente: result.license.clientName,
        plan: result.license.plan,
        dias: Math.ceil((new Date(result.license.expiresAt).getTime() - Date.now()) / 86400000),
      }),
    })

  } catch (err) {
    console.error('[activate]', err)
    return json({ success: false, message: '❌ Error del servidor. Intenta de nuevo.' })
  }
}

function json(data: object) {
  return NextResponse.json(data, { headers: { 'Access-Control-Allow-Origin': '*' } })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
