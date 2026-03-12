// app/api/angel-rent-state/route.ts
// ✅ Endpoint para guardar estado del robot desde el navegador

import { type NextRequest } from "next/server";
import https from "https";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("u");
    
    if (!username) {
      return new Response(JSON.stringify({ error: "Missing username" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const { robotOn, robotPaused, nextAt } = body;

    // Actualizar Firebase
    const data: any = {};
    if (typeof robotOn === "boolean") data.robotOn = robotOn;
    if (typeof robotPaused === "boolean") data.robotPaused = robotPaused;
    if (typeof nextAt === "number") data.nextBumpAt = nextAt; // ✅ Guardar próximo bump

    const fbBody = JSON.stringify(data);
    
    await new Promise<void>((resolve, reject) => {
      const fbUrl = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
      const fbReq = https.request({
        hostname: fbUrl.hostname,
        path: fbUrl.pathname,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(fbBody)
        }
      }, (res) => {
        res.resume();
        res.on("end", () => resolve());
      });
      
      fbReq.on("error", reject);
      fbReq.write(fbBody);
      fbReq.end();
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("[angel-rent-state]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
