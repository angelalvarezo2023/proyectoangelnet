import { NextResponse } from "next/server";

const CONFIG = {
  RESEND_API_KEY: 're_CV3xyyrE_3xwhULkaRM8hZecVLsWvxhrc',
  FROM_EMAIL: 'angel15dobleu@gmail.com',
  FIREBASE_URL: 'https://megapersonals-4f24c-default-rtdb.firebaseio.com'
};

interface BrowserData {
  browserName: string;
  clientName?: string;
  postName?: string;
  city?: string;
  phoneNumber?: string;
  rentalExpiration?: string;
  lastUpdate?: string;
  republishStatus?: {
    remainingSeconds: number;
  };
  lastError?: {
    message: string;
    timestamp: string;
  };
}

interface NotificationConfig {
  email?: {
    active: boolean;
    address: string;
  };
  eventos?: {
    republicacion: boolean;
    error: boolean;
    rentaExpira: boolean;
    // 🆕 Nuevos eventos de renta
    renta7dias: boolean;
    renta3dias: boolean;
    renta24horas: boolean;
    renta12horas: boolean;
  };
}

interface LastNotified {
  republicacion?: string;
  error?: string;
  rentaExpira?: string;
  // 🆕 Trackeo de notificaciones de renta
  renta7dias?: string;
  renta3dias?: string;
  renta24horas?: string;
  renta12horas?: string;
}

// 🆕 Templates de email con urgencia creciente
function getEmailTemplate(tipo: string, data: any) {
  const baseStyle = `
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #1a1a2e;
    color: #ffffff;
    padding: 40px 20px;
  `;

  const templates = {
    // Template amigable - 7 días antes
    renta7dias: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 2px solid #00BCD4;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 60px; margin-bottom: 10px;">⏰</div>
            <h1 style="color: #00BCD4; margin: 0; font-size: 28px;">Recordatorio Amigable</h1>
          </div>
          
          <div style="background: rgba(0, 188, 212, 0.1); padding: 30px; border-radius: 15px; margin-bottom: 30px;">
            <p style="font-size: 18px; margin: 0 0 15px 0;">Hola <strong>${data.clientName}</strong> 👋</p>
            <p style="font-size: 16px; margin: 0; color: rgba(255,255,255,0.9);">
              Tu servicio premium vence en <strong style="color: #00BCD4;">7 días</strong> (${data.fechaExpiracion})
            </p>
          </div>

          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 12px; margin-bottom: 30px;">
            <p style="margin: 0 0 15px 0; font-size: 16px;">📊 <strong>Detalles de tu cuenta:</strong></p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">🤖 Navegador: ${data.browserName}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">📍 Ciudad: ${data.city}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">📱 Post: ${data.postName}</p>
          </div>

          <div style="background: rgba(255, 152, 0, 0.1); border-left: 4px solid #FF9800; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <p style="margin: 0; color: #FF9800; font-size: 15px;">
              <strong>⚠️ Importante:</strong> Si no renuevas, tu anuncio será <strong>ELIMINADO automáticamente</strong> del sistema.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #00BCD4, #0097A7); color: white; padding: 15px 40px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px;">
              🎯 Renovar Ahora
            </a>
          </div>

          <p style="text-align: center; margin-top: 30px; color: rgba(255,255,255,0.6); font-size: 14px;">
            ¿Dudas? Contáctanos por WhatsApp
          </p>
        </div>
      </div>
    `,

    // Template urgente - 3 días antes
    renta3dias: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 2px solid #FF9800;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 60px; margin-bottom: 10px;">⚠️</div>
            <h1 style="color: #FF9800; margin: 0; font-size: 28px;">Tu Renta Está por Vencer</h1>
          </div>
          
          <div style="background: rgba(255, 152, 0, 0.2); padding: 30px; border-radius: 15px; margin-bottom: 30px; border: 2px solid #FF9800;">
            <p style="font-size: 20px; margin: 0 0 15px 0; text-align: center;">
              ⏰ Quedan solo <strong style="color: #FF9800; font-size: 32px;">3 DÍAS</strong>
            </p>
            <p style="font-size: 16px; margin: 0; text-align: center; color: rgba(255,255,255,0.9);">
              Fecha de expiración: <strong>${data.fechaExpiracion}</strong>
            </p>
          </div>

          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 12px; margin-bottom: 30px;">
            <p style="margin: 0 0 15px 0; font-size: 16px;">👤 <strong>${data.clientName}</strong></p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">🤖 ${data.browserName}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">📍 ${data.city}</p>
          </div>

          <div style="background: rgba(244, 67, 54, 0.15); border: 2px solid #f44336; padding: 25px; border-radius: 12px; margin-bottom: 30px;">
            <p style="margin: 0 0 15px 0; color: #f44336; font-size: 18px; font-weight: bold; text-align: center;">
              ❌ Si no renuevas en 3 días:
            </p>
            <ul style="margin: 0; padding-left: 20px; color: rgba(255,255,255,0.9);">
              <li style="margin-bottom: 10px;">Tu anuncio será <strong>ELIMINADO</strong> del sistema</li>
              <li style="margin-bottom: 10px;">Perderás todo tu <strong>posicionamiento</strong></li>
              <li style="margin-bottom: 10px;">Tus estadísticas se <strong>borrarán</strong></li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #FF9800, #F57C00); color: white; padding: 18px 50px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 15px rgba(255, 152, 0, 0.4);">
              🔥 RENOVAR AHORA
            </a>
          </div>
        </div>
      </div>
    `,

    // Template crítico - 24 horas antes
    renta24horas: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 3px solid #f44336; animation: pulse 2s infinite;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 70px; margin-bottom: 10px; animation: bounce 1s infinite;">🚨</div>
            <h1 style="color: #f44336; margin: 0; font-size: 32px;">¡URGENTE - ÚLTIMA OPORTUNIDAD!</h1>
          </div>
          
          <div style="background: rgba(244, 67, 54, 0.3); padding: 35px; border-radius: 15px; margin-bottom: 30px; border: 3px solid #f44336; text-align: center;">
            <p style="font-size: 18px; margin: 0 0 10px 0; color: rgba(255,255,255,0.9);">
              Tu cuenta expira en
            </p>
            <p style="font-size: 48px; margin: 0; font-weight: 900; color: #f44336; text-shadow: 0 0 20px rgba(244, 67, 54, 0.5);">
              24 HORAS
            </p>
            <p style="font-size: 16px; margin: 10px 0 0 0; color: rgba(255,255,255,0.8);">
              Mañana a las ${data.horaExacta}
            </p>
          </div>

          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 12px; margin-bottom: 25px;">
            <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">📋 ${data.clientName}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">🤖 Navegador: ${data.browserName}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">📍 Ciudad: ${data.city}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.8);">📱 Post: ${data.postName}</p>
          </div>

          <div style="background: linear-gradient(135deg, rgba(244, 67, 54, 0.2), rgba(233, 30, 99, 0.2)); border: 3px solid #f44336; padding: 30px; border-radius: 15px; margin-bottom: 30px;">
            <p style="margin: 0 0 20px 0; color: #f44336; font-size: 20px; font-weight: bold; text-align: center;">
              💀 DESPUÉS DE 24 HORAS:
            </p>
            <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px;">
              <p style="margin: 0 0 15px 0; color: #f44336; font-size: 16px;">❌ Tu anuncio será <strong>ELIMINADO AUTOMÁTICAMENTE</strong></p>
              <p style="margin: 0 0 15px 0; color: #f44336; font-size: 16px;">❌ Perderás <strong>TODO tu posicionamiento</strong></p>
              <p style="margin: 0 0 15px 0; color: #f44336; font-size: 16px;">❌ Las estadísticas se <strong>BORRARÁN PERMANENTEMENTE</strong></p>
              <p style="margin: 0; color: #f44336; font-size: 16px;">❌ No podrás recuperar tu cuenta después de 48h</p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 40px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #f44336, #E91E63); color: white; padding: 22px 60px; text-decoration: none; border-radius: 15px; font-weight: 900; font-size: 20px; box-shadow: 0 8px 25px rgba(244, 67, 54, 0.6); text-transform: uppercase;">
              🔥 RENOVAR URGENTE
            </a>
            <p style="margin-top: 20px; color: rgba(255,255,255,0.7); font-size: 14px;">
              No pierdas todo tu trabajo 😢
            </p>
          </div>
        </div>
      </div>
    `,

    // Template ultra crítico - 12 horas antes
    renta12horas: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: #000; border-radius: 20px; padding: 40px; border: 4px solid #f44336; box-shadow: 0 0 40px rgba(244, 67, 54, 0.8);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 80px; margin-bottom: 10px;">❌</div>
            <h1 style="color: #f44336; margin: 0; font-size: 36px; text-transform: uppercase; letter-spacing: 2px;">
              ⚠️ ELIMINACIÓN INMINENTE ⚠️
            </h1>
          </div>
          
          <div style="background: rgba(244, 67, 54, 0.4); padding: 40px; border-radius: 15px; margin-bottom: 30px; border: 4px solid #f44336;">
            <p style="font-size: 20px; margin: 0 0 15px 0; text-align: center; color: rgba(255,255,255,0.9);">
              ⏰ QUEDAN SOLO
            </p>
            <p style="font-size: 64px; margin: 0; font-weight: 900; color: #f44336; text-align: center; text-shadow: 0 0 30px rgba(244, 67, 54, 1);">
              12 HORAS
            </p>
            <p style="font-size: 18px; margin: 15px 0 0 0; text-align: center; color: #FF9800;">
              Tu cuenta será eliminada a las <strong>${data.horaExacta}</strong>
            </p>
          </div>

          <div style="background: rgba(255,255,255,0.08); padding: 30px; border-radius: 12px; margin-bottom: 25px; border-left: 5px solid #f44336;">
            <p style="margin: 0 0 15px 0; font-size: 20px; font-weight: bold; color: #f44336;">
              👤 ${data.clientName}
            </p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.9); font-size: 16px;">🤖 ${data.browserName}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.9); font-size: 16px;">📍 ${data.city}</p>
            <p style="margin: 5px 0; color: rgba(255,255,255,0.9); font-size: 16px;">📱 ${data.postName}</p>
          </div>

          <div style="background: linear-gradient(135deg, #000, #1a1a2e); border: 3px solid #f44336; padding: 35px; border-radius: 15px; margin-bottom: 35px;">
            <p style="margin: 0 0 25px 0; color: #f44336; font-size: 22px; font-weight: bold; text-align: center; text-transform: uppercase;">
              💀 ESTO ES LO QUE PERDERÁS:
            </p>
            <div style="background: rgba(244, 67, 54, 0.1); padding: 25px; border-radius: 10px; border-left: 5px solid #f44336;">
              <p style="margin: 0 0 15px 0; color: #f44336; font-size: 18px; font-weight: bold;">❌ ELIMINACIÓN TOTAL del sistema</p>
              <p style="margin: 0 0 15px 0; color: #FF9800; font-size: 18px; font-weight: bold;">❌ TODO tu posicionamiento SEO</p>
              <p style="margin: 0 0 15px 0; color: #E91E63; font-size: 18px; font-weight: bold;">❌ Todas tus estadísticas y métricas</p>
              <p style="margin: 0; color: #9C27B0; font-size: 18px; font-weight: bold;">❌ Recuperación IMPOSIBLE después de 48h</p>
            </div>
          </div>

          <div style="background: rgba(244, 67, 54, 0.2); border: 2px dashed #f44336; padding: 20px; border-radius: 10px; margin-bottom: 35px; text-align: center;">
            <p style="margin: 0; color: #FF9800; font-size: 16px; font-weight: bold;">
              🔥 ESTA ES TU ÚLTIMA OPORTUNIDAD 🔥
            </p>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
              Después de 12 horas, NO habrá vuelta atrás
            </p>
          </div>

          <div style="text-align: center;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #f44336, #c62828); color: white; padding: 25px 70px; text-decoration: none; border-radius: 15px; font-weight: 900; font-size: 22px; box-shadow: 0 10px 30px rgba(244, 67, 54, 0.8); text-transform: uppercase; letter-spacing: 1px; border: 3px solid #fff;">
              ⚡ SALVAR MI CUENTA AHORA ⚡
            </a>
            <p style="margin-top: 25px; color: #f44336; font-size: 16px; font-weight: bold;">
              ⏰ SOLO QUEDAN 12 HORAS ⏰
            </p>
            <p style="margin-top: 10px; color: rgba(255,255,255,0.6); font-size: 14px;">
              No dejes que todo tu esfuerzo se pierda 😢
            </p>
          </div>
        </div>
      </div>
    `,

    // Template original de republicación
    republicacion: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 2px solid #00E676;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 60px; margin-bottom: 10px;">✅</div>
            <h1 style="color: #00E676; margin: 0; font-size: 28px;">Republicación Exitosa</h1>
          </div>
          <div style="background: rgba(0, 230, 118, 0.1); padding: 25px; border-radius: 12px; margin-bottom: 20px;">
            <p style="margin: 5px 0;">🤖 <strong>Cuenta:</strong> ${data.clientName}</p>
            <p style="margin: 5px 0;">⏰ <strong>Hora:</strong> ${data.hora}</p>
            <p style="margin: 5px 0;">📍 <strong>Ciudad:</strong> ${data.city}</p>
            <p style="margin: 5px 0;">📱 <strong>Post:</strong> ${data.postName}</p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #00E676, #00C853); color: white; padding: 15px 40px; text-decoration: none; border-radius: 12px; font-weight: bold;">
              Ver Panel
            </a>
          </div>
        </div>
      </div>
    `,

    // Template de error
    error: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 2px solid #FF9800;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 60px; margin-bottom: 10px;">⚠️</div>
            <h1 style="color: #FF9800; margin: 0; font-size: 28px;">Error Detectado</h1>
          </div>
          <div style="background: rgba(255, 152, 0, 0.1); padding: 25px; border-radius: 12px; margin-bottom: 20px;">
            <p style="margin: 5px 0;">🤖 <strong>Cuenta:</strong> ${data.clientName}</p>
            <p style="margin: 5px 0;">⏰ <strong>Hora:</strong> ${data.hora}</p>
            <p style="margin: 5px 0;">❌ <strong>Error:</strong> ${data.error}</p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #FF9800, #F57C00); color: white; padding: 15px 40px; text-decoration: none; border-radius: 12px; font-weight: bold;">
              Ver Detalles
            </a>
          </div>
        </div>
      </div>
    `
  };

  return templates[tipo as keyof typeof templates] || templates.error;
}

async function enviarEmail(to: string, subject: string, html: string) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.FROM_EMAIL,
        to: [to],
        subject: subject,
        html: html
      })
    });

    if (!response.ok) {
      throw new Error(`Resend API error: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error enviando email:', error);
    return { success: false, error };
  }
}

export async function GET() {
  try {
    console.log('🔍 Iniciando monitoreo de notificaciones...');

    // Obtener todos los navegadores
    const browsersResponse = await fetch(`${CONFIG.FIREBASE_URL}/browsers.json`);
    const browsers: Record<string, BrowserData> = await browsersResponse.json() || {};

    // Obtener configuraciones de notificaciones
    const notificationsResponse = await fetch(`${CONFIG.FIREBASE_URL}/notifications.json`);
    const notifications: Record<string, NotificationConfig> = await notificationsResponse.json() || {};

    // Obtener registro de últimas notificaciones
    const lastNotifiedResponse = await fetch(`${CONFIG.FIREBASE_URL}/lastNotified.json`);
    const lastNotified: Record<string, LastNotified> = await lastNotifiedResponse.json() || {};

    const results = {
      total: 0,
      enviados: 0,
      errores: 0,
      detalles: [] as any[]
    };

    const ahora = Date.now();

    for (const [browserName, browserData] of Object.entries(browsers)) {
      results.total++;

      const config = notifications[browserName];
      if (!config?.email?.active || !config?.email?.address) {
        continue;
      }

      const lastNotif = lastNotified[browserName] || {};
      const eventos = config.eventos || {};

      // 🆕 DETECCIÓN DE NIVELES DE RENTA
      if (browserData.rentalExpiration) {
        const expira = new Date(browserData.rentalExpiration).getTime();
        const horasRestantes = (expira - ahora) / (1000 * 60 * 60);
        const diasRestantes = Math.floor(horasRestantes / 24);

        const clientName = browserData.clientName || 'Usuario';
        const city = browserData.city || 'N/A';
        const postName = browserData.postName || 'N/A';
        
        const fechaExpiracion = new Date(expira).toLocaleString('es-ES', {
          dateStyle: 'full',
          timeStyle: 'short'
        });
        
        const horaExacta = new Date(expira).toLocaleString('es-ES', {
          timeStyle: 'short'
        });

        // NIVEL 1: 7 días antes (167-169 horas)
        if (eventos.renta7dias && 
            horasRestantes > 167 && 
            horasRestantes <= 169 &&
            lastNotif.renta7dias !== browserData.rentalExpiration) {
          
          const resultado = await enviarEmail(
            config.email.address,
            '⏰ Recordatorio: Tu renta vence en 7 días',
            getEmailTemplate('renta7dias', {
              clientName,
              browserName,
              city,
              postName,
              fechaExpiracion,
              diasRestantes
            })
          );

          if (resultado.success) {
            results.enviados++;
            await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renta7dias: browserData.rentalExpiration })
            });
          } else {
            results.errores++;
          }

          results.detalles.push({
            navegador: browserName,
            tipo: 'renta7dias',
            email: config.email.address,
            exito: resultado.success
          });
        }

        // NIVEL 2: 3 días antes (71-73 horas)
        if (eventos.renta3dias && 
            horasRestantes > 71 && 
            horasRestantes <= 73 &&
            lastNotif.renta3dias !== browserData.rentalExpiration) {
          
          const resultado = await enviarEmail(
            config.email.address,
            '⚠️ Tu renta vence en 3 días - Renueva para evitar eliminación',
            getEmailTemplate('renta3dias', {
              clientName,
              browserName,
              city,
              postName,
              fechaExpiracion,
              diasRestantes
            })
          );

          if (resultado.success) {
            results.enviados++;
            await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renta3dias: browserData.rentalExpiration })
            });
          } else {
            results.errores++;
          }

          results.detalles.push({
            navegador: browserName,
            tipo: 'renta3dias',
            email: config.email.address,
            exito: resultado.success
          });
        }

        // NIVEL 3: 24 horas antes (23-25 horas)
        if (eventos.renta24horas && 
            horasRestantes > 23 && 
            horasRestantes <= 25 &&
            lastNotif.renta24horas !== browserData.rentalExpiration) {
          
          const resultado = await enviarEmail(
            config.email.address,
            '🚨 URGENTE - Tu anuncio será eliminado en 24 HORAS',
            getEmailTemplate('renta24horas', {
              clientName,
              browserName,
              city,
              postName,
              fechaExpiracion,
              horaExacta
            })
          );

          if (resultado.success) {
            results.enviados++;
            await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renta24horas: browserData.rentalExpiration })
            });
          } else {
            results.errores++;
          }

          results.detalles.push({
            navegador: browserName,
            tipo: 'renta24horas',
            email: config.email.address,
            exito: resultado.success
          });
        }

        // NIVEL 4: 12 horas antes (11-13 horas)
        if (eventos.renta12horas && 
            horasRestantes > 11 && 
            horasRestantes <= 13 &&
            lastNotif.renta12horas !== browserData.rentalExpiration) {
          
          const resultado = await enviarEmail(
            config.email.address,
            '❌ ÚLTIMA OPORTUNIDAD - Eliminación en 12 HORAS',
            getEmailTemplate('renta12horas', {
              clientName,
              browserName,
              city,
              postName,
              fechaExpiracion,
              horaExacta
            })
          );

          if (resultado.success) {
            results.enviados++;
            await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renta12horas: browserData.rentalExpiration })
            });
          } else {
            results.errores++;
          }

          results.detalles.push({
            navegador: browserName,
            tipo: 'renta12horas',
            email: config.email.address,
            exito: resultado.success
          });
        }
      }

      // Detección de republicación (código original)
      if (eventos.republicacion && browserData.republishStatus) {
        const remainingSeconds = browserData.republishStatus.remainingSeconds;
        if (remainingSeconds <= 30 && 
            remainingSeconds >= 0 &&
            lastNotif.republicacion !== browserData.lastUpdate) {
          
          const resultado = await enviarEmail(
            config.email.address,
            '✅ Republicación exitosa - Megapersonals Premium',
            getEmailTemplate('republicacion', {
              clientName: browserData.clientName || 'Usuario',
              hora: new Date().toLocaleString('es-ES'),
              city: browserData.city || 'N/A',
              postName: browserData.postName || 'N/A'
            })
          );

          if (resultado.success) {
            results.enviados++;
            await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ republicacion: browserData.lastUpdate })
            });
          } else {
            results.errores++;
          }

          results.detalles.push({
            navegador: browserName,
            tipo: 'republicacion',
            email: config.email.address,
            exito: resultado.success
          });
        }
      }

      // Detección de error (código original)
      if (eventos.error && browserData.lastError &&
          lastNotif.error !== browserData.lastError.timestamp) {
        
        const resultado = await enviarEmail(
          config.email.address,
          '⚠️ Error detectado - Megapersonals Premium',
          getEmailTemplate('error', {
            clientName: browserData.clientName || 'Usuario',
            hora: new Date().toLocaleString('es-ES'),
            error: browserData.lastError.message
          })
        );

        if (resultado.success) {
          results.enviados++;
          await fetch(`${CONFIG.FIREBASE_URL}/lastNotified/${browserName}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: browserData.lastError.timestamp })
          });
        } else {
          results.errores++;
        }

        results.detalles.push({
          navegador: browserName,
          tipo: 'error',
          email: config.email.address,
          exito: resultado.success
        });
      }
    }

    console.log('✅ Monitoreo completado:', results);

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en monitoreo:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}
