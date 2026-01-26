// API Route para verificar estado del proxy
// Ubicación: app/api/proxy/check/route.ts

import { NextResponse } from 'next/server';

async function checkProxy(host: string, port: string, user: string, pass: string) {
  try {
    console.log('[Proxy Check]: Testing proxy:', host);

    const startTime = Date.now();
    
    // Verificar usando proxy6.net API
    const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
    const apiUrl = `https://px6.link/api/${PROXY6_API_KEY}/check?proxy=${host}:${port}:${user}:${pass}`;
    
    console.log('[Proxy Check]: Calling proxy6 check API');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const endTime = Date.now();
    const ping = endTime - startTime;

    if (!response.ok) {
      console.log('[Proxy Check]: HTTP Error:', response.status);
      return {
        success: true,
        online: false,
        ping: 0,
        message: 'No se pudo verificar el proxy',
      };
    }

    const data = await response.json();
    console.log('[Proxy Check]: API Response:', data);

    if (data.status === 'yes' && data.proxy_status === true) {
      console.log('[Proxy Check]: ✅ Proxy is working');
      
      return {
        success: true,
        online: true,
        ping,
        proxy_id: data.proxy_id,
        message: 'Proxy funcionando correctamente',
      };
    } else if (data.status === 'yes' && data.proxy_status === false) {
      console.log('[Proxy Check]: ❌ Proxy not working');
      
      return {
        success: true,
        online: false,
        ping: 0,
        message: 'Proxy no responde o está offline',
      };
    } else {
      console.log('[Proxy Check]: ❌ Error from API:', data.error);
      
      return {
        success: true,
        online: false,
        ping: 0,
        message: data.error || 'Error verificando proxy',
      };
    }
  } catch (error) {
    console.log('[Proxy Check]: ❌ Exception:', error);
    
    return {
      success: true,
      online: false,
      ping: 0,
      message: 'No se pudo conectar con el servicio de verificación',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// Soportar POST
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, user, pass } = body;

    if (!host || !port) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos del proxy' },
        { status: 400 }
      );
    }

    const result = await checkProxy(host, port, user, pass);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[Proxy Check]: POST Exception:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Error verificando proxy',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Soportar GET (para testing)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const host = searchParams.get('host');
    const port = searchParams.get('port');
    const user = searchParams.get('user');
    const pass = searchParams.get('pass');

    if (!host || !port) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros: host, port' },
        { status: 400 }
      );
    }

    const result = await checkProxy(host, port, user || '', pass || '');
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[Proxy Check]: GET Exception:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Error verificando proxy',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
