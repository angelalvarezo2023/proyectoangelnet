import { NextRequest, NextResponse } from 'next/server'
import { LicenseAPI } from '@/lib/firebase'

const CURRENT_VERSION = "2.8.0"

export async function POST(req: NextRequest) {
  try {
    const { key, fingerprint, version } = await req.json()

    if (!key || !fingerprint) {
      return json({ valid: false, reason: 'MISSING_PARAMS' })
    }

    if (version !== CURRENT_VERSION) {
      return json({
        valid: false,
        reason: 'UPDATE_REQUIRED',
        currentVersion: CURRENT_VERSION,
        updateUrl: 'https://angelrentmg.vercel.app/megabot.user.js',
      })
    }

    const result = await LicenseAPI.validateLicense(key.toUpperCase(), fingerprint)

    if (!result.valid) {
      return json({ valid: false, reason: result.reason })
    }

    const l    = result.license!
    const dias = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000)

    return json({
      valid:         true,
      cliente:       l.clientName,
      dias,
      plan:          l.plan,
      remotePaused:  (l as any).remotePaused === true,
      remoteTimerMin: (l as any).remoteTimerMin || null,
      remoteTimerMax: (l as any).remoteTimerMax || null,
    })

  } catch (err) {
    console.error('[validate]', err)
    return json({ valid: false, reason: 'SERVER_ERROR' })
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
