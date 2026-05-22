
import { NextResponse } from 'next/server'

// ✅ SOLO CAMBIA ESTE NÚMERO CUANDO SUBAS UNA NUEVA VERSIÓN
export const VERSION = "2.5.0"

export async function GET() {
  return NextResponse.json(
    { version: VERSION },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  )
}
