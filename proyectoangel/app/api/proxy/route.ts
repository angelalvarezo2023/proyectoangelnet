// API Route para proxy6.net (VERSIÓN FINAL CORRECTA)
// Ubicación: app/api/proxy/route.ts

import { NextResponse } from 'next/server';

// ✅ Usar variable de entorno
const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
const PROXY6_BASE_URL = "https://px6.link/api"; // ✅ URL CORRECTA según documentación

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
        // Obtener todos los proxies activos
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active&descr=yes`;
        break;
      
      case 'getproxy_by_ip':
        // Buscar proxy específico por IP (necesitamos obtener todos primero)
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active&descr=yes`;
        break;
      
      case 'getbalance':
        // Obtener balance
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}`;
        break;
      
      case 'getprice':
        // Obtener precio
        const period = searchParams.get('period') || '30';
        const count = searchParams.get('count') || '1';
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getprice?count=${count}&period=${period}`;
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    console.log('[Proxy API]: Calling URL (masked):', apiUrl.replace(PROXY6_API_KEY, '***'));

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[Proxy API]: HTTP Error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Proxy API]: Response status:', data.status);

    // Si hay error de proxy6
    if (data.status === 'no') {
      console.error('[Proxy API]: Error from proxy6:', data.error || data.error_id);
      return NextResponse.json({
        status: 'no',
        error: data.error || `Error ${data.error_id}`,
        error_id: data.error_id,
      });
    }

    // Si es búsqueda por IP específica
    if (action === 'getproxy_by_ip' && ip) {
      if (data.status === 'yes' && data.list) {
        // Convertir objeto a array
        const proxies = Object.entries(data.list).map(([id, proxyData]: [string, any]) => ({
          id,
          host: proxyData.host, // ✅ Según documentación, el campo es "host"
          port: proxyData.port,
          user: proxyData.user,
          pass: proxyData.pass,
          type: proxyData.type,
          country: proxyData.country,
          date: proxyData.date,
          date_end: proxyData.date_end,
          active: proxyData.active === '1' || proxyData.active === 1 || proxyData.active === true,
          descr: proxyData.descr || '',
          ip: proxyData.ip, // IPv6 si existe
        }));

        console.log('[Proxy API]: Total proxies found:', proxies.length);
        console.log('[Proxy API]: Available IPs (host):', proxies.map(p => p.host));

        // Buscar por host (IP)
        const searchIP = ip.trim();
        const found = proxies.find((p: any) => {
          const matches = p.host === searchIP || p.host.trim() === searchIP;
          console.log(`[Proxy API]: Comparing "${p.host}" === "${searchIP}": ${matches}`);
          return matches;
        });

        if (found) {
          console.log('[Proxy API]: ✅ Proxy FOUND:', found.host);
          return NextResponse.json({
            status: 'yes',
            proxy: found,
          });
        } else {
          console.log('[Proxy API]: ❌ Proxy NOT FOUND with IP:', searchIP);
          return NextResponse.json({
            status: 'no',
            error: 'Proxy con esa IP no encontrado',
            searched_ip: searchIP,
            available_ips: proxies.map(p => p.host),
            total_proxies: proxies.length,
            hint: 'Usa una de las IPs disponibles de arriba',
          });
        }
      } else {
        return NextResponse.json({
          status: 'no',
          error: 'No hay proxies activos',
        });
      }
    }

    // Devolver respuesta completa para otros casos
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('[Proxy API]: Exception:', error);
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

// ✅ Configuración para Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
