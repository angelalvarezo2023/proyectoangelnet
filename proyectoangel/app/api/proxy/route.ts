// API Route para proxy6.net (versión segura con env variables)
// Ubicación: app/api/proxy/route.ts

import { NextResponse } from 'next/server';

// ✅ Usar variable de entorno (más seguro)
const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
const PROXY6_BASE_URL = "https://proxy6.net/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const ip = searchParams.get('ip');

    console.log('[Proxy API]: Action:', action, 'IP:', ip);

    if (!action) {
      return NextResponse.json(
        { error: 'Action parameter required' },
        { status: 400 }
      );
    }

    let apiUrl = '';

    switch (action) {
      case 'getproxy':
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active&descr=yes`;
        break;
      
      case 'getproxy_by_ip':
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active&descr=yes`;
        break;
      
      case 'getbalance':
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getbalance`;
        break;
      
      case 'getprice':
        const period = searchParams.get('period') || '30';
        const count = searchParams.get('count') || '1';
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getprice?period=${period}&count=${count}`;
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    console.log('[Proxy API]: Calling:', apiUrl.replace(PROXY6_API_KEY, '***'));

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      cache: 'no-store', // ✅ Importante para Vercel
    });

    if (!response.ok) {
      console.error('[Proxy API]: HTTP Error:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Proxy API]: Response status:', data.status);

    // Si no hay proxies
    if (data.status === 'no' || data.error) {
      console.error('[Proxy API]: Error from proxy6:', data.error || data.error_id);
      return NextResponse.json({
        status: 'no',
        error: data.error || data.error_id || 'Error obteniendo proxies',
      });
    }

    // Si es búsqueda por IP
    if (action === 'getproxy_by_ip' && ip) {
      if (data.status === 'yes' && data.list) {
        // Convertir objeto a array con IDs
        const proxies = Object.entries(data.list).map(([id, proxyData]: [string, any]) => ({
          id,
          host: proxyData.host || proxyData.ip, // Algunos usan "ip" en vez de "host"
          port: proxyData.port,
          user: proxyData.user,
          pass: proxyData.pass,
          type: proxyData.type,
          country: proxyData.country,
          city: proxyData.city || 'Unknown',
          date: proxyData.date,
          date_end: proxyData.date_end,
          active: proxyData.active === '1' || proxyData.active === 1 || proxyData.active === true,
          descr: proxyData.descr || '',
        }));

        console.log('[Proxy API]: Total proxies:', proxies.length);
        console.log('[Proxy API]: Available IPs:', proxies.map(p => p.host));

        // Buscar por IP (soportar con o sin espacios)
        const searchIP = ip.trim();
        const found = proxies.find((p: any) => p.host.trim() === searchIP);

        if (found) {
          console.log('[Proxy API]: ✅ Proxy found:', found.host);
          return NextResponse.json({
            status: 'yes',
            proxy: found,
          });
        } else {
          console.log('[Proxy API]: ❌ Proxy not found with IP:', searchIP);
          return NextResponse.json({
            status: 'no',
            error: 'Proxy con esa IP no encontrado',
            searched_ip: searchIP,
            available_ips: proxies.map(p => p.host),
            hint: 'Verifica que la IP sea exactamente una de las disponibles (arriba)'
          });
        }
      } else {
        return NextResponse.json({
          status: 'no',
          error: 'No hay proxies activos en tu cuenta',
        });
      }
    }

    // Devolver todos los proxies
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('[Proxy API]: Error:', error);
    return NextResponse.json(
      { 
        status: 'no',
        error: 'Error de conexión con proxy6.net',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ✅ Configuración de runtime para Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
