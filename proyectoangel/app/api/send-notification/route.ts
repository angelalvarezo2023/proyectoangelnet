import { NextResponse } from "next/server";

const CONFIG = {
  RESEND_API_KEY: 're_CV3xyyrE_3xwhULkaRM8hZecVLsWvxhrc',
  FROM_EMAIL: 'angel15dobleu@gmail.com',
  FIREBASE_URL: 'https://megapersonals-4f24c-default-rtdb.firebaseio.com'
};

export async function POST(request: Request) {
  try {
    const { browserName, tipo, config } = await request.json();

    if (!browserName || !tipo) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros' },
        { status: 400 }
      );
    }

    // Obtener datos del navegador desde Firebase
    const browserResponse = await fetch(`${CONFIG.FIREBASE_URL}/browsers/${browserName}.json`);
    const browserData = await browserResponse.json();

    if (!browserData) {
      return NextResponse.json(
        { success: false, error: 'Navegador no encontrado' },
        { status: 404 }
      );
    }

    // Obtener configuración de notificaciones
    const notifResponse = await fetch(`${CONFIG.FIREBASE_URL}/notifications/${browserName}.json`);
    const notifConfig = await notifResponse.json();

    const emailAddress = config?.email || notifConfig?.email?.address;

    if (!emailAddress) {
      return NextResponse.json(
        { success: false, error: 'Email no configurado' },
        { status: 400 }
      );
    }

    // Preparar datos para el template
    const templateData = {
      clientName: browserData.clientName || 'Usuario',
      browserName: browserData.browserName || browserName,
      city: browserData.city || 'N/A',
      postName: browserData.postName || 'N/A',
      phoneNumber: browserData.phoneNumber || 'N/A',
      hora: new Date().toLocaleString('es-ES'),
      error: browserData.lastError?.message || 'Error desconocido'
    };

    // Determinar asunto y template según el tipo
    let subject = '';
    let html = '';

    switch (tipo) {
      case 'republicacion':
        subject = '✅ Republicación exitosa - Megapersonals Premium';
        html = getEmailTemplate('republicacion', templateData);
        break;
      case 'error':
        subject = '⚠️ Error detectado - Megapersonals Premium';
        html = getEmailTemplate('error', templateData);
        break;
      case 'test':
        subject = '🧪 Email de prueba - Megapersonals Premium';
        html = getEmailTemplate('test', templateData);
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Tipo de notificación no válido' },
          { status: 400 }
        );
    }

    // Enviar email
    const emailResult = await enviarEmail(emailAddress, subject, html);

    return NextResponse.json({
      success: emailResult.success,
      message: emailResult.success ? 'Email enviado correctamente' : 'Error al enviar email',
      email: emailAddress
    });

  } catch (error) {
    console.error('Error en send-notification:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
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

function getEmailTemplate(tipo: string, data: any) {
  const baseStyle = `
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #1a1a2e;
    color: #ffffff;
    padding: 40px 20px;
  `;

  const templates = {
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
    `,
    test: `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px; border: 2px solid #00BCD4;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 60px; margin-bottom: 10px;">🧪</div>
            <h1 style="color: #00BCD4; margin: 0; font-size: 28px;">Email de Prueba</h1>
          </div>
          <div style="background: rgba(0, 188, 212, 0.1); padding: 25px; border-radius: 12px; margin-bottom: 20px;">
            <p style="margin: 5px 0;">✅ Las notificaciones están funcionando correctamente</p>
            <p style="margin: 15px 0 5px 0;">📋 <strong>Detalles de tu cuenta:</strong></p>
            <p style="margin: 5px 0;">🤖 <strong>Navegador:</strong> ${data.browserName}</p>
            <p style="margin: 5px 0;">👤 <strong>Cliente:</strong> ${data.clientName}</p>
            <p style="margin: 5px 0;">📍 <strong>Ciudad:</strong> ${data.city}</p>
            <p style="margin: 5px 0;">📱 <strong>Post:</strong> ${data.postName}</p>
            <p style="margin: 5px 0;">☎️ <strong>Teléfono:</strong> ${data.phoneNumber}</p>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://angelrentmg.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #00BCD4, #0097A7); color: white; padding: 15px 40px; text-decoration: none; border-radius: 12px; font-weight: bold;">
              Ver Panel
            </a>
          </div>
          <p style="text-align: center; margin-top: 20px; color: rgba(255,255,255,0.6); font-size: 14px;">
            Este es un email de prueba. Recibirás notificaciones cuando haya eventos importantes.
          </p>
        </div>
      </div>
    `
  };

  return templates[tipo as keyof typeof templates] || templates.test;
}
