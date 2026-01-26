// API Route para proxy6.net (evita CORS)
// Ubicación: app/api/proxy/route.ts

import { NextResponse } from 'next/server';

// ✅ API KEY CORRECTA
const PROXY6_API_KEY = "2dce4fd266-08fab19842-a9b14437e5";
const PROXY6_BASE_URL = "https://proxy6.net/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const ip = searchParams.get('ip');

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
        // Buscar proxy específico por IP
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active&descr=yes`;
        break;
      
      case 'getbalance':
        // Obtener balance de cuenta
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getbalance`;
        break;
      
      case 'getprice':
        // Obtener precio de renovación
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

    console.log('[Proxy API]: Fetching from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log('[Proxy API]: Response status:', data.status);

    // Si es búsqueda por IP, filtrar aquí
    if (action === 'getproxy_by_ip' && ip) {
      if (data.status === 'yes' && data.list) {
        // Convertir objeto a array
        const proxies = Object.entries(data.list).map(([id, proxyData]: [string, any]) => ({
          id,
          host: proxyData.host,
          port: proxyData.port,
          user: proxyData.user,
          pass: proxyData.pass,
          type: proxyData.type,
          country: proxyData.country,
          city: proxyData.city || 'Unknown',
          date: proxyData.date,
          date_end: proxyData.date_end,
          active: proxyData.active === '1',
          descr: proxyData.descr || '',
        }));

        // Buscar por IP
        const found = proxies.find((p: any) => p.host === ip);

        if (found) {
          console.log('[Proxy API]: Proxy found:', found.host);
          return NextResponse.json({
            status: 'yes',
            proxy: found,
          });
        } else {
          console.log('[Proxy API]: Proxy not found with IP:', ip);
          console.log('[Proxy API]: Available IPs:', proxies.map(p => p.host));
          return NextResponse.json({
            status: 'no',
            error: 'Proxy con esa IP no encontrado',
            available_ips: proxies.map(p => p.host),
          });
        }
      } else {
        return NextResponse.json({
          status: 'no',
          error: data.error || 'No hay proxies activos',
        });
      }
    }

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
