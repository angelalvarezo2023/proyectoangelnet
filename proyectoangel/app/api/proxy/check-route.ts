// API Route para verificar estado REAL del proxy
// Ubicación: app/api/proxy/check/route.ts

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, user, pass, type } = body;

    if (!host || !port || !user || !pass) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos del proxy' },
        { status: 400 }
      );
    }

    console.log('[Proxy Check]: Testing proxy:', host);

    // Construir URL del proxy
    const proxyUrl = `${type === 'socks' ? 'socks5' : 'http'}://${user}:${pass}@${host}:${port}`;
    
    const startTime = Date.now();
    
    try {
      // Intentar hacer request a través del proxy
      // Usamos un sitio simple para verificar conectividad
      const testUrl = 'https://api.ipify.org?format=json';
      
      // En Node.js necesitamos usar ProxyAgent
      const { ProxyAgent } = await import('undici');
      const agent = new ProxyAgent(proxyUrl);
      
      const response = await fetch(testUrl, {
        dispatcher: agent,
        signal: AbortSignal.timeout(10000), // 10 segundos timeout
      });

      const endTime = Date.now();
      const ping = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        const proxyIP = data.ip;

        console.log('[Proxy Check]: ✅ Proxy working, IP:', proxyIP, 'Ping:', ping + 'ms');

        return NextResponse.json({
          success: true,
          online: true,
          ping,
          proxy_ip: proxyIP,
          message: 'Proxy funcionando correctamente',
        });
      } else {
        console.log('[Proxy Check]: ❌ Proxy returned error:', response.status);
        
        return NextResponse.json({
          success: true,
          online: false,
          ping: 0,
          message: 'Proxy no responde correctamente',
        });
      }
    } catch (proxyError) {
      console.log('[Proxy Check]: ❌ Proxy connection failed:', proxyError);
      
      return NextResponse.json({
        success: true,
        online: false,
        ping: 0,
        message: 'No se pudo conectar al proxy',
        error: proxyError instanceof Error ? proxyError.message : 'Connection failed',
      });
    }
  } catch (error) {
    console.error('[Proxy Check]: Exception:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Error verificando proxy',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
