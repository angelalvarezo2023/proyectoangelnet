// API Route para proxy6.net (evita CORS)
// Ubicación: app/api/proxy/route.ts

import { NextResponse } from 'next/server';

const PROXY6_API_KEY = "51048fc5cb-e13ec47656-a617da853f";
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

    console.log('[Proxy API]: Fetching from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    // Si es búsqueda por IP, filtrar aquí
    if (action === 'getproxy_by_ip' && ip) {
      if (data.status === 'yes' && data.list) {
        const proxies = Object.entries(data.list).map(([id, proxyData]: [string, any]) => ({
          id,
          ...proxyData,
        }));

        const found = proxies.find((p: any) => p.host === ip);

        if (found) {
          return NextResponse.json({
            status: 'yes',
            proxy: found,
          });
        } else {
          return NextResponse.json({
            status: 'no',
            error: 'Proxy con esa IP no encontrado',
          });
        }
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
