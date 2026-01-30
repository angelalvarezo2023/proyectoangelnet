// API Route para proxy6.net (VERSIÓN DEBUG)
// Ubicación: app/api/proxy/route.ts

import { NextResponse } from 'next/server';

const PROXY6_API_KEY = process.env.PROXY6_API_KEY || "2dce4fd266-08fab19842-a9b14437e5";
const PROXY6_BASE_URL = "https://px6.link/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const ip = searchParams.get('ip');

    console.log('=== PROXY API DEBUG START ===');
    console.log('Action:', action);
    console.log('Requested IP:', ip);
    console.log('API Key (first 10):', PROXY6_API_KEY.substring(0, 10) + '...');

    if (!action) {
      return NextResponse.json({ error: 'Action required' }, { status: 400 });
    }

    let apiUrl = '';

    switch (action) {
      case 'getproxy':
      case 'getproxy_by_ip':
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getproxy?state=active`;
        break;
      case 'getbalance':
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}`;
        break;
      case 'getprice':
        const period = searchParams.get('period') || '30';
        const count = searchParams.get('count') || '1';
        apiUrl = `${PROXY6_BASE_URL}/${PROXY6_API_KEY}/getprice?count=${count}&period=${period}`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    console.log('Calling API URL:', apiUrl.replace(PROXY6_API_KEY, '***'));

    const response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
    });

    console.log('API Response Status:', response.status);

    if (!response.ok) {
      console.error('HTTP Error:', response.status, response.statusText);
      return NextResponse.json({
        status: 'no',
        error: `HTTP ${response.status}: ${response.statusText}`,
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('API Response Status Field:', data.status);
    
    // 🔍 DEBUG: Mostrar estructura completa
    if (data.list) {
      console.log('Total proxies in list:', Object.keys(data.list).length);
      
      // Mostrar primeros 3 proxies para ver estructura
      const firstThree = Object.entries(data.list).slice(0, 3);
      console.log('First 3 proxies structure:', JSON.stringify(firstThree, null, 2));
    }

    if (data.status === 'no') {
      console.error('Proxy6 Error:', data.error, 'ID:', data.error_id);
      return NextResponse.json({
        status: 'no',
        error: data.error || `Error ${data.error_id}`,
        error_id: data.error_id,
      });
    }

    // Si es búsqueda por IP
    if (action === 'getproxy_by_ip' && ip) {
      if (data.status === 'yes' && data.list) {
        const proxies = Object.entries(data.list).map(([id, proxyData]: [string, any]) => {
          console.log(`Proxy ${id}:`, {
            host: proxyData.host,
            ip: proxyData.ip,
            port: proxyData.port,
          });
          
          return {
            id,
            host: proxyData.host,
            port: proxyData.port,
            user: proxyData.user,
            pass: proxyData.pass,
            type: proxyData.type,
            country: proxyData.country,
            date: proxyData.date,
            date_end: proxyData.date_end,
            active: proxyData.active === '1' || proxyData.active === 1,
            descr: proxyData.descr || '',
            ip: proxyData.ip,
          };
        });

        console.log('Total proxies processed:', proxies.length);
        console.log('All available hosts:', proxies.map(p => p.host));
        console.log('Searching for IP:', ip);

        // Buscar por host
        const searchIP = ip.trim();
        const found = proxies.find(p => p.host === searchIP);

        console.log('Match found:', !!found);
        
        if (found) {
          console.log('✅ MATCH! Proxy:', found);
          return NextResponse.json({
            status: 'yes',
            proxy: found,
          });
        } else {
          console.log('❌ NO MATCH');
          console.log('Searched IP:', `"${searchIP}"`);
          console.log('Available IPs:', proxies.map(p => `"${p.host}"`));
          
          return NextResponse.json({
            status: 'no',
            error: 'Proxy con esa IP no encontrado',
            debug: {
              searched_ip: searchIP,
              searched_length: searchIP.length,
              available_ips: proxies.map(p => ({
                host: p.host,
                length: p.host.length,
                matches: p.host === searchIP,
              })),
              total_proxies: proxies.length,
            }
          });
        }
      }
    }

    // Devolver todo
    console.log('=== PROXY API DEBUG END ===');
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('❌ EXCEPTION:', error);
    return NextResponse.json({
      status: 'no',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
