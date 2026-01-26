// API Route para verificar estado del proxy (versión compatible con Vercel)
// Ubicación: app/api/proxy/check/route.ts

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, user, pass, type } = body;

    if (!host || !port) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos del proxy' },
        { status: 400 }
      );
    }

    console.log('[Proxy Check]: Testing proxy:', host);

    const startTime = Date.now();
    
    try {
      // Verificar que el proxy existe y está activo usando proxy6.net API
      const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
      const apiUrl = `https://px6.link/api/${PROXY6_API_KEY}/check?proxy=${host}:${port}:${user}:${pass}`;
      
      console.log('[Proxy Check]: Calling proxy6 check API');
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000), // 15 segundos timeout
      });

      const endTime = Date.now();
      const ping = endTime - startTime;

      if (!response.ok) {
        console.log('[Proxy Check]: HTTP Error:', response.status);
        return NextResponse.json({
          success: true,
          online: false,
          ping: 0,
          message: 'No se pudo verificar el proxy',
        });
      }

      const data = await response.json();
      console.log('[Proxy Check]: API Response:', data);

      if (data.status === 'yes' && data.proxy_status === true) {
        console.log('[Proxy Check]: ✅ Proxy is working');
        
        return NextResponse.json({
          success: true,
          online: true,
          ping,
          proxy_id: data.proxy_id,
          message: 'Proxy funcionando correctamente',
        });
      } else if (data.status === 'yes' && data.proxy_status === false) {
        console.log('[Proxy Check]: ❌ Proxy not working');
        
        return NextResponse.json({
          success: true,
          online: false,
          ping: 0,
          message: 'Proxy no responde o está offline',
        });
      } else {
        console.log('[Proxy Check]: ❌ Error from API:', data.error);
        
        return NextResponse.json({
          success: true,
          online: false,
          ping: 0,
          message: data.error || 'Error verificando proxy',
        });
      }
    } catch (proxyError) {
      console.log('[Proxy Check]: ❌ Exception:', proxyError);
      
      return NextResponse.json({
        success: true,
        online: false,
        ping: 0,
        message: 'No se pudo conectar con el servicio de verificación',
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
