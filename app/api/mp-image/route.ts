// Endpoint proxy para imágenes de MegaPersonals.
// Los clientes en RD no pueden cargar directamente las imágenes de megapersonals.eu
// porque está bloqueado en su país. Este endpoint actúa como intermediario:
// el cliente pide la imagen a Vercel, Vercel la pide a MegaPersonals (que sí puede),
// y la sirve al cliente.
//
// Uso: <img src="/api/mp-image?url=https://images.megapersonals.eu/...">

export const runtime = "edge"; // Más rápido y barato

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  // Whitelist: solo permitir URLs de MegaPersonals y servidores asociados,
  // para evitar que el endpoint sea usado como proxy genérico.
  const dominiosPermitidos = [
    "megapersonals.eu",
    "images.megapersonals.eu",
    "cdn.megapersonals.eu",
    "drome6.com",
    "captcha.drome6.com",
  ];

  let urlObj: URL;
  try {
    urlObj = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!dominiosPermitidos.some((d) => urlObj.hostname === d || urlObj.hostname.endsWith(`.${d}`))) {
    return new Response("Domain not allowed", { status: 403 });
  }

  try {
    const r = await fetch(target, {
      headers: {
        // Algunos servidores chequean el User-Agent
        "User-Agent": "Mozilla/5.0 (compatible; AngelMegaProxy/1.0)",
      },
    });

    if (!r.ok) {
      return new Response(`Upstream returned ${r.status}`, { status: r.status });
    }

    const contentType = r.headers.get("Content-Type") || "image/jpeg";
    const buf = await r.arrayBuffer();

    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        // Cachear 24 horas para no saturar el ancho de banda de Vercel
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response("Error fetching image", { status: 500 });
  }
}
