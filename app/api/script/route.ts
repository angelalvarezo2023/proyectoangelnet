
import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const scriptPath = join(process.cwd(), 'public', 'megabot.user.js')
    const script = readFileSync(scriptPath, 'utf-8')

    return new NextResponse(script, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Script no encontrado' }, { status: 404 })
  }
}
