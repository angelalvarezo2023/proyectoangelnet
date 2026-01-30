// API Route para verificar estado del proxy
// Ubicación: app/api/proxy/check/route.ts

import { NextResponse } from 'next/server';

async function checkProxy(host: string, port: string, user: string, pass: string) {
  try {
    console.log('[Proxy Check]: Testing proxy:', `${host}:${port}`);

    const startTime = Date.now();
    
    // ✅ FORMATO CORRECTO: proxy=ip:port:user:pass
    const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
    const proxyString = `${host}:${port}:${user}:${pass}`;
    const apiUrl = `https://px6.link/api/${PROXY6_API_KEY}/check?proxy=${encodeURIComponent(proxyString)}`;
    
    console.log('[Proxy Check]: Checking proxy string:', `${host}:${port}:***:***`);
    
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
      console.log('[Proxy Check]: ✅ Proxy is ONLINE');
      
      return {
        success: true,
        online: true,
        ping,
        proxy_id: data.proxy_id,
        message: 'Proxy funcionando correctamente',
      };
    } else if (data.status === 'yes' && data.proxy_status === false) {
      console.log('[Proxy Check]: ❌ Proxy is OFFLINE');
      
      return {
        success: true,
        online: false,
        ping: 0,
        message: 'Proxy no responde o está en mantenimiento',
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
      message: 'Timeout o error de conexión',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// Soportar POST
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, user, pass } = body;

    console.log('[Proxy Check POST]: Received data:', { host, port, user: user ? '***' : 'missing', pass: pass ? '***' : 'missing' });

    if (!host || !port) {
      console.log('[Proxy Check POST]: Missing required fields');
      return NextResponse.json(
        { success: false, error: 'Faltan datos del proxy (host y port son requeridos)' },
        { status: 400 }
      );
    }

    if (!user || !pass) {
      console.log('[Proxy Check POST]: Missing credentials');
      return NextResponse.json(
        { success: false, error: 'Faltan credenciales del proxy (user y pass son requeridos)' },
        { status: 400 }
      );
    }

    const result = await checkProxy(host, String(port), user, pass);
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

// Soportar GET (para testing directo)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const host = searchParams.get('host');
    const port = searchParams.get('port');
    const user = searchParams.get('user');
    const pass = searchParams.get('pass');

    console.log('[Proxy Check GET]: Received params:', { host, port, user: user ? '***' : 'missing', pass: pass ? '***' : 'missing' });

    if (!host || !port || !user || !pass) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Faltan parámetros requeridos',
          required: ['host', 'port', 'user', 'pass'],
          received: { host: !!host, port: !!port, user: !!user, pass: !!pass }
        },
        { status: 400 }
      );
    }

    const result = await checkProxy(host, port, user, pass);
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
