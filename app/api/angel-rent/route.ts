// app/api/angel-rent/route.ts
import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

// In-memory cache for user data — avoids hitting Firebase on every request
const userCache: Record<string, { user: ProxyUser; ts: number }> = {};
const CACHE_TTL = 60000; // 60 seconds

interface ProxyUser {
  name?: string; proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string; userAgentKey?: string; userAgent?: string;
  rentalEnd?: string; defaultUrl?: string; siteEmail?: string; sitePass?: string;
  notes?: string; active?: boolean;
}
interface FetchResult { status: number; headers: Record<string, string>; body: Buffer; setCookies: string[]; }

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
export async function OPTIONS() { return new Response("", { status: 200, headers: cors() }); }

async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const targetUrl = sp.get("url"), username = sp.get("u");
  if (!targetUrl) return jres(400, { error: "Falta ?url=" });
  if (!username) return jres(400, { error: "Falta ?u=usuario" });
  // Special: client-side phone patch
  if (targetUrl === "__fbpatch__") {
    const phone = sp.get("phone");
    if (phone) {
      await fbPatch(username, { phoneNumber: phone }).catch(() => {});
      // Clear cache so next load shows fresh phone number
      const cacheKey = username.toLowerCase();
      delete userCache[cacheKey];
    }
    return new Response("ok", { headers: cors() });
  }
  try {
    const user = await getUser(username);
    if (!user) return jres(403, { error: "Usuario no encontrado" });
    if (!user.active) return expiredPage("Cuenta Desactivada", "Tu cuenta fue desactivada.");
    if (user.rentalEnd && new Date() > new Date(user.rentalEnd + "T23:59:59"))
      return expiredPage("Plan Expirado", "Tu plan vencio el " + user.rentalEnd + ".");
    const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
    const decoded = decodeURIComponent(targetUrl);
    // Edit block disabled - open for now
    // if (decoded.includes("/users/posts/edit")) { ... }
    const agent = (PH && PT) ? new HttpsProxyAgent(PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`) : undefined;
    const pb = `/api/angel-rent?u=${enc(username)}&url=`;
    let postBody: Buffer | null = null, postCT: string | null = null;
    if (method === "POST") {
      const ab = await req.arrayBuffer();
      postBody = Buffer.from(ab);
      postCT = req.headers.get("content-type") || "application/x-www-form-urlencoded";

      // For edit form POSTs: log the body to help debug phone field issue
      if (decoded.includes("/users/posts/edit") && postCT.includes("application/x-www-form-urlencoded")) {
        const bodyStr = postBody.toString("utf-8");
        const params = new URLSearchParams(bodyStr);
        console.log("[AR-EDIT] Fields:", [...params.keys()].join(", "));
        // Find phone-related fields
        for (const [k, v] of params.entries()) {
          if (k.toLowerCase().includes("phone") || k.toLowerCase().includes("tel") || k === "country_code") {
            console.log(`[AR-EDIT] ${k} = ${v}`);
          }
        }
      }
    }
    const cookies = req.headers.get("cookie") || "";
    const resp = await fetchProxy(decoded, agent, method, postBody, postCT, cookies, getUA(user));
    const ct = resp.headers["content-type"] || "";
    const rh = new Headers(cors());
    resp.setCookies.forEach(c => rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi, "").replace(/Secure;?\s*/gi, "").replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
    ));
    // Save cookies to Firebase for server-side robot (non-blocking)
    if (resp.setCookies.length > 0) {
      saveCookies(username, resp.setCookies, cookies).catch(() => {});
    }
    // Phone extraction is handled client-side using exact DOM selector
    // Server-side regex was matching internal IDs incorrectly, so it's disabled
    if (ct.includes("text/html")) {
      let html = resp.body.toString("utf-8");
      html = rewriteHtml(html, new URL(decoded).origin, pb, decoded);
      html = injectUI(html, decoded, username, user);
      rh.set("Content-Type", "text/html; charset=utf-8");
      return new Response(html, { status: 200, headers: rh });
    }
    if (ct.includes("text/css")) {
      rh.set("Content-Type", "text/css");
      return new Response(rewriteCss(resp.body.toString("utf-8"), new URL(decoded).origin, pb), { status: 200, headers: rh });
    }
    rh.set("Content-Type", ct || "application/octet-stream");
    if (!ct.includes("text/") && !ct.includes("javascript")) rh.set("Cache-Control", "public, max-age=3600");
    return new Response(resp.body, { status: 200, headers: rh });
  } catch (err: any) {
    console.error("[AR]", err.message);
    return jres(500, { error: err.message });
  }
}

async function getUser(u: string): Promise<ProxyUser | null> {
  const key = u.toLowerCase();
  const cached = userCache[key];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.user;
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers/${key}.json`, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => {
        try {
          const user = JSON.parse(d);
          if (user) userCache[key] = { user, ts: Date.now() };
          res(user);
        } catch { res(null); }
      });
      r.on("error", rej);
    }).on("error", rej);
  });
}

// Patch a field in Firebase proxyUsers
async function fbPatch(username: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  await new Promise<void>((res, rej) => {
    const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
    const req = https.request({ hostname: url.hostname, path: url.pathname, method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, r => { r.resume(); r.on("end", () => res()); });
    req.on("error", rej); req.write(body); req.end();
  });
}

// Save session cookies to Firebase so server-side robot can use them
async function saveCookies(username: string, newCookies: string[], existing: string): Promise<void> {
  if (!newCookies.length) return;
  try {
    // Merge new cookies with existing ones
    const cookieMap: Record<string, string> = {};
    // Parse existing cookies
    if (existing) {
      existing.split(";").forEach(c => {
        const [k, ...v] = c.trim().split("=");
        if (k) cookieMap[k.trim()] = v.join("=").trim();
      });
    }
    // Override with new cookies from Set-Cookie headers
    newCookies.forEach(c => {
      const part = c.split(";")[0].trim();
      const [k, ...v] = part.split("=");
      if (k) cookieMap[k.trim()] = v.join("=").trim();
    });
    const cookieStr = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
    const body = JSON.stringify({ cookies: cookieStr, cookieTs: Date.now() });
    await new Promise<void>((res, rej) => {
      const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
      const req = https.request({ hostname: url.hostname, path: url.pathname, method: "PATCH",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      }, r => { r.resume(); r.on("end", () => res()); });
      req.on("error", rej); req.write(body); req.end();
    });
  } catch (e) { /* non-critical */ }
}

function injectUI(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;
  const V = {
    pb:    JSON.stringify(pb),
    cur:   JSON.stringify(curUrl),
    uname: JSON.stringify(username),
    name:  JSON.stringify(user.name || username),
    endTs: user.rentalEnd ? String(new Date(user.rentalEnd + "T23:59:59").getTime()) : "0",
    b64e:  JSON.stringify(Buffer.from(user.siteEmail || "").toString("base64")),
    b64p:  JSON.stringify(Buffer.from(user.sitePass  || "").toString("base64")),
    plist: JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`),
  };

  let daysLeft = 999;
  if (user.rentalEnd) {
    daysLeft = Math.ceil((new Date(user.rentalEnd + "T23:59:59").getTime() - Date.now()) / 86400000);
  }
  const showWarn = daysLeft >= 0 && daysLeft <= 3;
  const warnDays = daysLeft;

  const css = `<style id="ar-css">
#ar-bar{
  position:fixed;top:0;left:0;right:0;z-index:2147483647;
  background:linear-gradient(90deg,#0a0318,#150830 50%,#0a0318);
  border-bottom:1px solid rgba(168,85,247,.18);
  height:42px;display:flex;align-items:center;
  overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:none;-ms-overflow-style:none;
  box-shadow:0 2px 14px rgba(0,0,0,.55);
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
}
#ar-bar::-webkit-scrollbar{display:none}
.ars{
  display:flex;align-items:center;gap:4px;
  padding:0 13px;height:100%;flex-shrink:0;
  border-right:1px solid rgba(255,255,255,.04);white-space:nowrap;
}
.ars:first-child{padding-left:8px}
.arl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:rgba(168,85,247,.5)}
.arv{font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff}
#ar-dot{width:6px;height:6px;border-radius:50%;background:#374151;flex-shrink:0;transition:.3s}
#ar-dot.on{background:#22c55e;box-shadow:0 0 7px rgba(34,197,94,.9)}
#ar-dot.blink{background:#f59e0b;animation:arp 1.2s ease-in-out infinite}
@keyframes arp{0%,100%{opacity:1;transform:scale(1.1)}50%{opacity:.2;transform:scale(.7)}}
.arg{color:#22c55e!important}.ary{color:#f59e0b!important}.arr{color:#ef4444!important}.arp2{color:#c084fc!important}
#ar-logo-icon{width:24px;height:24px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
#ar-btns{position:fixed;bottom:22px;right:14px;z-index:2147483647;display:flex;flex-direction:column;gap:9px;align-items:flex-end}
.arbtn{
  display:flex;align-items:center;gap:7px;border:none;cursor:pointer;
  border-radius:50px;font-weight:800;font-size:13px;padding:12px 20px;
  font-family:-apple-system,sans-serif;letter-spacing:.1px;
  box-shadow:0 4px 18px rgba(0,0,0,.5),0 1px 3px rgba(0,0,0,.3);
  transition:transform .1s,background .2s;white-space:nowrap;
  -webkit-tap-highlight-color:transparent;
}
.arbtn:active{transform:scale(.91)}
#ar-rb{background:linear-gradient(135deg,#27272a,#18181b);color:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.07)}
#ar-rb.on{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-color:transparent;box-shadow:0 4px 20px rgba(34,197,94,.4)}
#ar-sb{background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;border:1px solid rgba(255,255,255,.05)}
#ar-sb:active{transform:scale(.91)}
#ar-support-modal{
  position:fixed;inset:0;z-index:2147483648;
  background:rgba(0,0,0,.85);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  display:none;align-items:flex-end;justify-content:center;padding:0;box-sizing:border-box;
}
#ar-support-modal.show{display:flex}
#ar-sbox{
  background:linear-gradient(155deg,#0a1628,#0f1f3d);
  border:1px solid rgba(59,130,246,.25);border-radius:24px 24px 0 0;
  padding:24px 20px 32px;width:100%;max-width:480px;
  box-shadow:0 -20px 60px rgba(0,0,0,.8);
  animation:ar-sup .3s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;
}
@keyframes ar-sup{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}
#ar-sbox h3{font-size:18px;font-weight:900;text-align:center;margin:0 0 4px;color:#fff}
#ar-sbox .ar-ssub{font-size:12px;color:rgba(255,255,255,.4);text-align:center;margin-bottom:20px}
.ar-stype{
  display:flex;align-items:center;gap:12px;padding:14px;
  border:1px solid rgba(255,255,255,.08);border-radius:14px;
  background:rgba(255,255,255,.04);cursor:pointer;width:100%;
  margin-bottom:10px;transition:background .15s,border-color .15s;
  font-family:-apple-system,sans-serif;
}
.ar-stype:active{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.4)}
.ar-stype .ar-si{font-size:24px;width:44px;height:44px;border-radius:12px;background:rgba(59,130,246,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ar-stype .ar-stxt{text-align:left;flex:1}
.ar-stype .ar-stl{display:block;font-size:14px;font-weight:700;color:#fff}
.ar-stype .ar-sds{display:block;font-size:11px;color:rgba(255,255,255,.35);margin-top:2px}
.ar-urg{font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.3);flex-shrink:0}
#ar-sdesc{width:100%;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.05);color:#fff;font-size:13px;font-family:-apple-system,sans-serif;resize:none;outline:none;margin-bottom:14px;box-sizing:border-box}
#ar-sdesc:focus{border-color:rgba(59,130,246,.5)}
#ar-sdesc::placeholder{color:rgba(255,255,255,.25)}
.ar-sbtn-send{width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:10px}
.ar-sbtn-send:disabled{opacity:.4}
.ar-sbtn-cancel{width:100%;padding:10px;background:transparent;color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13px;cursor:pointer;font-family:-apple-system,sans-serif}
#ar-sback{background:none;border:none;color:rgba(255,255,255,.4);font-size:13px;cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:16px;padding:0;display:flex;align-items:center;gap:4px}
#ar-sdone{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 0}
#ar-sdone .ar-sdone-icon{font-size:56px}
#ar-sdone h3{font-size:20px;font-weight:900;color:#4ade80;margin:0}
#ar-sdone p{font-size:13px;color:rgba(255,255,255,.4);margin:0;text-align:center}
#ar-modal{
  position:fixed;inset:0;z-index:2147483648;
  background:rgba(0,0,0,.82);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  display:none;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;
}
#ar-modal.show{display:flex}
#ar-mbox{
  background:linear-gradient(155deg,#1c0a30,#0f0520);
  border:1px solid rgba(245,158,11,.28);border-radius:24px;
  padding:28px 22px 22px;max-width:310px;width:100%;text-align:center;
  box-shadow:0 30px 80px rgba(0,0,0,.9);
  animation:ar-pop .3s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;
}
@keyframes ar-pop{from{opacity:0;transform:scale(.87) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}
#ar-mbox .mi{font-size:46px;margin-bottom:2px}
#ar-mbox .mt{font-size:18px;font-weight:900;color:#fbbf24;margin-bottom:8px;letter-spacing:-.3px}
#ar-mbox .mb{
  display:inline-flex;align-items:center;justify-content:center;
  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.22);
  border-radius:12px;padding:4px 16px;margin-bottom:12px;
  font-size:24px;font-weight:900;color:#fcd34d;font-variant-numeric:tabular-nums;
}
#ar-mbox .mm{font-size:13px;color:rgba(255,255,255,.48);line-height:1.6;margin-bottom:18px}
#ar-mbox .mm strong{color:rgba(255,255,255,.7);font-weight:700}
#ar-mbox .mc{
  width:100%;padding:13px;background:linear-gradient(135deg,#f59e0b,#d97706);
  color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:800;
  cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(245,158,11,.38);
  transition:transform .1s;
}
#ar-mbox .mc:active{transform:scale(.96)}
#ar-mbox .ms{
  display:block;margin-top:12px;font-size:11px;
  color:rgba(255,255,255,.18);cursor:pointer;background:none;
  border:none;font-family:inherit;text-decoration:underline;
}
#ar-lhdr{
  display:block;background:linear-gradient(160deg,#0d0720,#1a0a35);
  border-bottom:1px solid rgba(168,85,247,.1);padding:18px;text-align:center;
  font-family:-apple-system,sans-serif;
}
#ar-lhdr .lw{
  display:inline-flex;align-items:center;gap:10px;
  background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.16);
  border-radius:50px;padding:7px 18px 7px 9px;
}
#ar-lhdr .li{
  width:34px;height:34px;background:linear-gradient(135deg,#a855f7,#ec4899);
  border-radius:11px;display:flex;align-items:center;justify-content:center;
  font-size:19px;flex-shrink:0;
}
#ar-lhdr .lt{text-align:left}
#ar-lhdr .ln{display:block;font-size:16px;font-weight:900;color:#fff;letter-spacing:-.3px;line-height:1.1}
#ar-lhdr .ls{display:block;font-size:8px;color:rgba(168,85,247,.55);text-transform:uppercase;letter-spacing:1.1px;font-weight:700;margin-top:2px}
</style>`;

  const modalHtml = showWarn ? `
<div id="ar-modal" class="show">
<div id="ar-mbox">
  <div class="mi">&#x23F0;</div>
  <div class="mt">Tu renta vence pronto</div>
  <div class="mb">${warnDays === 0 ? "HOY" : warnDays === 1 ? "1 d&iacute;a" : warnDays + " d&iacute;as"}</div>
  <p class="mm">${warnDays === 0
    ? "Tu plan <strong>vence hoy</strong>. Si no renuevas ahora, tu anuncio dejara de republicarse automaticamente."
    : `Tu plan vence en <strong>${warnDays} dia${warnDays > 1 ? "s" : ""}</strong>. Renueva pronto para no perder la republicacion automatica.`
  }<br><br>Contactanos para renovar y mantener tu anuncio siempre arriba.</p>
  <button class="mc" id="ar-mok">&#x1F4F2; Contactar para renovar</button>
  <button class="ms" id="ar-msk">Recordarme despues</button>
</div>
</div>` : "";

  const barHtml = `
<div id="ar-bar">
  <div class="ars">
    <div id="ar-logo-icon">&#x1F47C;</div>
    <span style="font-size:11px;font-weight:900;color:#fff;letter-spacing:-.2px">Angel Rent</span>
  </div>
  <div class="ars"><span class="arl">Usuario</span><span class="arv" style="color:rgba(255,255,255,.55);font-weight:600" id="ar-uname"></span></div>
  <div class="ars"><span class="arl">Renta</span><span class="arv arg" id="ar-rent">...</span></div>
  <div class="ars" style="gap:6px"><div id="ar-dot"></div><span class="arl">Robot</span><span class="arv" id="ar-status" style="color:rgba(255,255,255,.28)">OFF</span></div>
  <div class="ars" id="ar-cdseg" style="display:none"><span class="arl">&#x23F1; Bump en</span><span class="arv arp2" id="ar-cd">--:--</span></div>
  <div class="ars" id="ar-cntseg" style="display:none"><span class="arl">&#x1F504; Bumps</span><span class="arv arp2" id="ar-cnt">0</span></div>
</div>
<div id="ar-promo" style="
  position:fixed;top:42px;left:0;right:0;z-index:2147483646;
  background:linear-gradient(90deg,#4c0870,#7c1fa0,#4c0870);
  padding:4px 12px;text-align:center;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:10px;font-weight:700;color:#fff;letter-spacing:.1px;
  box-shadow:0 2px 8px rgba(0,0,0,.4);
  animation:arpi .4s ease;display:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:100vw;box-sizing:border-box;
">
  <span id="ar-promo-txt"></span>
</div>
<style>
@keyframes arpi{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes arpo{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}
</style>
<div id="ar-btns">
  <button id="ar-rb" class="arbtn"><span id="ar-ri">&#x26A1;</span><span id="ar-rl">Robot OFF</span></button>
  <button id="ar-sb" class="arbtn"><span>&#x1F3AB;</span><span>Soporte</span></button>
</div>
<div id="ar-support-modal">
<div id="ar-sbox">
  <div id="ar-s-select">
    <h3>&#x1F3AB; Solicitar Soporte</h3>
    <div class="ar-ssub">¿Qué necesitas?</div>
    <button class="ar-stype" data-type="activation" data-label="Activacion nueva" data-priority="urgent">
      <div class="ar-si">🚀</div><div class="ar-stxt"><span class="ar-stl">Activacion nueva</span><span class="ar-sds">Crear anuncio por primera vez</span></div><span class="ar-urg">URGENTE</span>
    </button>
    <button class="ar-stype" data-type="photo_change" data-label="Cambiar fotos" data-priority="normal">
      <div class="ar-si">📸</div><div class="ar-stxt"><span class="ar-stl">Cambiar fotos</span><span class="ar-sds">Actualizar las fotos del anuncio</span></div>
    </button>
    <button class="ar-stype" data-type="number_change" data-label="Cambiar numero" data-priority="urgent">
      <div class="ar-si">📱</div><div class="ar-stxt"><span class="ar-stl">Cambiar numero</span><span class="ar-sds">Cambiar el numero de telefono del anuncio</span></div><span class="ar-urg">URGENTE</span>
    </button>
    <button class="ar-stype" data-type="other" data-label="Otro" data-priority="normal">
      <div class="ar-si">💬</div><div class="ar-stxt"><span class="ar-stl">Otro</span><span class="ar-sds">Otra solicitud o consulta</span></div>
    </button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel1">Cancelar</button>
  </div>
  <div id="ar-s-details" style="display:none">
    <button id="ar-sback">&#8592; Volver</button>
    <h3 id="ar-s-dtitle"></h3>
    <div class="ar-ssub" id="ar-s-dsub"></div>
    <div id="ar-s-photo-hint" style="display:none;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:12px;padding:12px;margin-bottom:14px;font-size:12px;text-align:center;color:#93c5fd">
      📸 Cuando te atiendan, envia tus fotos a <a href="https://t.me/Soportetecnico2323" target="_blank" style="color:#60a5fa;font-weight:700">@Soportetecnico2323</a>
    </div>
    <textarea id="ar-sdesc" rows="3" placeholder="Describe tu solicitud (opcional)..."></textarea>
    <button class="ar-sbtn-send" id="ar-s-send">Enviar Solicitud</button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel2">Cancelar</button>
  </div>
  <div id="ar-s-sending" style="display:none;text-align:center;padding:30px 0">
    <div style="width:40px;height:40px;border:4px solid rgba(59,130,246,.3);border-top-color:#3b82f6;border-radius:50%;animation:ar-spin 1s linear infinite;margin:0 auto 12px"></div>
    <p style="color:rgba(255,255,255,.4);font-size:13px;margin:0">Enviando solicitud...</p>
  </div>
  <div id="ar-sdone" style="display:none">
    <div class="ar-sdone-icon">✅</div>
    <h3>Solicitud enviada</h3>
    <p>Te avisaremos cuando te estemos atendiendo</p>
  </div>
</div>
</div>
<style>@keyframes ar-spin{to{transform:rotate(360deg)}}</style>`;

  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},B64E=${V.b64e},B64P=${V.b64p},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;

function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

// ── Promo banner ──────────────────────────────────────────────────────────────
var PROMOS=[
  "⭐ ¡Gracias por preferirnos! Contácto: 829-383-7695",
  "🚀 El mejor servicio de bump automático para MegaPersonals",
  "💜 Angel Rent — Tu anuncio, siempre arriba",
  "📲 ¿Quieres recomendar? Comparte: 829-383-7695",
  "⚡ Robot 24/7 — Tu anuncio nunca baja",
  "🏆 Servicio #1 en MegaPersonals. ¡Cuéntale a tus amigos!",
];
var _promoIdx=Math.floor(Math.random()*PROMOS.length);
var _promoTimer=null;
function showNextPromo(){
  var el=document.getElementById("ar-promo");
  var txt=document.getElementById("ar-promo-txt");
  if(!el||!txt)return;
  txt.textContent=PROMOS[_promoIdx % PROMOS.length];
  _promoIdx++;
  el.style.animation="arpi .4s ease";
  el.style.display="block";
  // Adjust top padding of page so content isn't hidden under banner
  document.body.style.paddingTop="64px";
  // Hide after 10 seconds
  _promoTimer=setTimeout(function(){
    el.style.animation="arpo .4s ease forwards";
    setTimeout(function(){
      el.style.display="none";
      document.body.style.paddingTop="42px";
      // Show next promo after 30 seconds pause
      _promoTimer=setTimeout(showNextPromo,30000);
    },400);
  },10000);
}
// Start first promo after 5 seconds
setTimeout(showNextPromo,5000);
// ─────────────────────────────────────────────────────────────────────────────

// ── Modal "sin permisos de edición" ──────────────────────────────────────────
(function(){
  var modal=document.createElement("div");
  modal.id="ar-noedit-modal";
  modal.style.cssText="display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);align-items:center;justify-content:center;";
  modal.innerHTML='\
<div style="background:linear-gradient(145deg,#1a0533,#2d0a52);border:1px solid rgba(168,85,247,.35);border-radius:20px;padding:28px 24px 24px;max-width:320px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.7);position:relative;">\
  <div style="font-size:38px;margin-bottom:10px;">🔒</div>\
  <div style="font-size:16px;font-weight:900;color:#fff;margin-bottom:10px;line-height:1.3;">Sin permisos de edición</div>\
  <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:20px;">Hola 👋 No tienes permisos para hacer ninguna edición directamente.<br><br>Si necesitas editar algo, contáctanos por Telegram y lo hacemos por ti.</div>\
  <a href="https://t.me/angelrentsoporte" target="_blank" style="display:block;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:50px;margin-bottom:10px;box-shadow:0 4px 15px rgba(0,136,204,.4);">📲 Contactar por Telegram</a>\
  <button id="ar-noedit-close" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);font-size:13px;font-weight:700;padding:10px 20px;border-radius:50px;cursor:pointer;width:100%;">Cerrar</button>\
</div>';
  document.body.appendChild(modal);
  document.getElementById("ar-noedit-close").addEventListener("click",function(){modal.style.display="none";});
  modal.addEventListener("click",function(e){if(e.target===modal)modal.style.display="none";});
})();
// ─────────────────────────────────────────────────────────────────────────────
function addLog(t,m){var s=gst();if(!s.logs)s.logs=[];var h=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});s.logs.unshift({t:t,m:"["+h+"] "+m});if(s.logs.length>30)s.logs=s.logs.slice(0,30);sst(s);}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function p2(n){return String(n).padStart(2,"0");}
function fmtR(ms){if(ms===null)return"\u221E";if(ms<=0)return"EXP";var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),m=Math.floor((ms%3600000)/60000);if(d>0)return d+"d "+h+"h";if(h>0)return h+"h "+m+"m";return m+"m";}
function G(id){return document.getElementById(id);}

function updateUI(){
  var s=gst(),on=!!s.on,paused=!!s.paused,cnt=s.cnt||0,nextAt=s.nextAt||0;
  if(G("ar-uname"))G("ar-uname").textContent=DNAME;
  var rl=rentLeft(),re=G("ar-rent");
  if(re){re.textContent=fmtR(rl);re.className="arv";re.classList.add(rl===null||rl>259200000?"arg":rl>86400000?"ary":"arr");}
  var dot=G("ar-dot");
  if(dot){dot.className="";if(on&&!paused)dot.className="on";else if(on&&paused)dot.className="blink";}
  var st=G("ar-status");
  if(st){if(!on){st.textContent="OFF";st.style.color="rgba(255,255,255,.28)";}else if(paused){st.textContent="Pausado";st.style.color="#f59e0b";}else{st.textContent="Activo";st.style.color="#22c55e";}}
  var cdSeg=G("ar-cdseg");
  if(on&&!paused){
    if(cdSeg)cdSeg.style.display="";
    var left=Math.max(0,Math.floor((nextAt-Date.now())/1000));
    if(G("ar-cd"))G("ar-cd").textContent=p2(Math.floor(left/60))+":"+p2(left%60);
  }else if(cdSeg)cdSeg.style.display="none";
  var cntSeg=G("ar-cntseg");
  if(on){if(cntSeg)cntSeg.style.display="";if(G("ar-cnt"))G("ar-cnt").textContent=String(cnt);}
  else if(cntSeg)cntSeg.style.display="none";
  var rb=G("ar-rb");
  if(rb){rb.className=on?"arbtn on":"arbtn";if(G("ar-rl"))G("ar-rl").textContent=on?"Robot ON":"Robot OFF";}
}

function schedNext(){var secs=BMIN+Math.floor(Math.random()*(BMAX-BMIN));var s=gst();s.nextAt=Date.now()+secs*1000;sst(s);addLog("in","Proximo bump en "+Math.floor(secs/60)+"m "+(secs%60)+"s");}
function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}
function rnd(n){return Math.floor(Math.random()*n);}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
function isBumpUrl(u){var k=["bump","repost","renew","republish"];for(var i=0;i<k.length;i++)if(u.indexOf("/"+k[i]+"/")!==-1)return true;return false;}
function getPid(u){var s=u.split("/");for(var i=s.length-1;i>=0;i--)if(s[i]&&s[i].length>=5&&/^\d+$/.test(s[i]))return s[i];return null;}
function deproxy(h){if(h.indexOf("/api/angel-rent")===-1)return h;try{var m=h.match(/[?&]url=([^&]+)/);if(m)return decodeURIComponent(m[1]);}catch(x){}return h;}

async function doBump(){
  var s=gst();if(!s.on||s.paused)return;
  addLog("in","Republicando...");schedNext();
  var btn=document.getElementById("managePublishAd");
  if(btn){try{btn.scrollIntoView({behavior:"smooth",block:"center"});await wait(300+rnd(500));btn.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));await wait(100+rnd(200));btn.click();s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt+" (boton)");}catch(e){addLog("er","Error M1");}updateUI();return;}
  var links=document.querySelectorAll("a[href]");
  for(var i=0;i<links.length;i++){var rh=deproxy(links[i].getAttribute("href")||"");if(isBumpUrl(rh)){try{links[i].scrollIntoView({behavior:"smooth",block:"center"});await wait(300+rnd(400));links[i].click();s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt+" (link)");}catch(e){addLog("er","Error M2");}updateUI();return;}}
  var ids=[];
  var al=document.querySelectorAll("a[href]");
  for(var j=0;j<al.length;j++){var pid=getPid(deproxy(al[j].getAttribute("href")||""));if(pid&&ids.indexOf(pid)===-1)ids.push(pid);}
  var dels=document.querySelectorAll("[data-id],[data-post-id]");
  for(var k=0;k<dels.length;k++){var did=dels[k].getAttribute("data-id")||dels[k].getAttribute("data-post-id")||"";if(/^\d{5,}$/.test(did)&&ids.indexOf(did)===-1)ids.push(did);}
  if(ids.length){for(var n=0;n<ids.length;n++){try{var r=await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[n]),{credentials:"include",redirect:"follow"});if(r.ok){var txt=await r.text();if(txt.indexOf("blocked")!==-1||txt.indexOf("Attention")!==-1)addLog("er","Bloqueado");else{s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt);}}else addLog("er","HTTP "+r.status);}catch(e2){addLog("er","Fetch err");}if(n<ids.length-1)await wait(1500+rnd(2000));}}
  else{addLog("er","No posts");var sc=gst();if(sc.on&&!sc.paused&&CUR.indexOf("/users/posts/list")===-1)goList(3000);}
  updateUI();
}

function startTick(){if(TICK)return;TICK=setInterval(function(){var s=gst();if(!s.on||s.paused)return;updateUI();if(s.nextAt>0&&Date.now()>=s.nextAt)doBump();},1000);}

function saveRobotState(on,paused){
  try{
    fetch("/api/angel-rent-state?u="+UNAME,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({robotOn:on,robotPaused:paused})
    });
  }catch(e){}
}
function toggleRobot(){
  var s=gst();
  if(s.on){s.on=false;s.nextAt=0;sst(s);if(TICK){clearInterval(TICK);TICK=null;}addLog("in","Robot OFF");saveRobotState(false,false);}
  else{s.on=true;s.paused=false;s.cnt=0;sst(s);addLog("ok","Robot ON - bumps 16-20 min");saveRobotState(true,false);schedNext();startTick();doBump();}
  updateUI();
}
function togglePause(){var s=gst();if(!s.on)return;s.paused=!s.paused;sst(s);addLog("in",s.paused?"Pausado":"Reanudado");saveRobotState(true,s.paused);updateUI();}

function autoOK(){
  var done=false;
  var chk=setInterval(function(){if(done)return;var btns=document.querySelectorAll("button,a,input[type=button],input[type=submit]");for(var i=0;i<btns.length;i++){var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();if(t==="ok"||t==="okay"||t==="done"||t==="continue"||t==="continuar"){done=true;clearInterval(chk);var b=btns[i];setTimeout(function(){try{b.click();}catch(e){}goList(2000);},500);return;}}},400);
  setTimeout(function(){if(!done){clearInterval(chk);goList(600);}},8000);
}

function handlePage(){
  var u=CUR;
  var RK="ar_ret_"+UNAME;
  var now=Date.now();

  // Block edit pages — show no-permissions modal and go back
  if(u.indexOf("/users/posts/edit/")!==-1){
    var m=document.getElementById("ar-noedit-modal");
    if(m)m.style.display="flex";
    setTimeout(function(){
      var listUrl="/api/angel-rent?u="+UNAME+"&url="+encodeURIComponent("https://megapersonals.eu/users/posts/list");
      history.replaceState(null,"",listUrl);
    },300);
    return;
  }

  // On any other page: check if we have a recent edit return URL (within last 60s)
  var retRaw=null;
  try{retRaw=localStorage.getItem(RK);}catch(e){}
  if(retRaw){
    var retObj=null;
    try{retObj=JSON.parse(retRaw);}catch(e){}
    if(retObj&&retObj.url&&(now-retObj.ts)<60000){
      // Clear it so we don't loop
      try{localStorage.removeItem(RK);}catch(e){}
      setTimeout(function(){location.href=retObj.url;},500);
      return;
    }
    // Expired — clear it
    try{localStorage.removeItem(RK);}catch(e){}
  }

  if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1||u.indexOf("success_renew")!==-1){addLog("ok","Publicado!");autoOK();return;}
  if(u.indexOf("/users/posts/bump/")!==-1||u.indexOf("/users/posts/repost/")!==-1||u.indexOf("/users/posts/renew/")!==-1){setTimeout(function(){autoOK();goList(2000);},1500);return;}
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){var s=gst();if(s.on)goList(3000);return;}
  if(u.indexOf("/users/posts")!==-1){
    startTick();
    // Extract phone on ANY posts page (list, manage, detail) - phone shows in "Current Post" section
    if(u.indexOf("/users/posts/bump")===-1&&u.indexOf("/users/posts/repost")===-1){
      setTimeout(function(){
        try{
          var rawPhone=null;

          // Method 1: exact selector for the phone span in post_preview_info
          var phoneEl=document.querySelector("#manage_ad_body > div.post_preview_info > div:nth-child(1) > div:nth-child(1) > span:nth-child(3)");
          if(phoneEl) rawPhone=(phoneEl.innerText||phoneEl.textContent||"").trim();

          // Method 2: find "Phone :" in page text, take next 25 chars
          if(!rawPhone){
            var bodyTxt=document.body?document.body.innerText:"";
            var idx=bodyTxt.indexOf("Phone :");
            if(idx===-1)idx=bodyTxt.indexOf("Phone:");
            if(idx!==-1){
              var after=bodyTxt.substring(idx+7,idx+35).trim();
              var end2=0;
              for(var ci=0;ci<after.length;ci++){
                var cc=after.charCodeAt(ci);
                if(!((cc>=48&&cc<=57)||cc===43||cc===32||cc===45||cc===40||cc===41||cc===46))break;
                end2=ci+1;
              }
              var cand=after.substring(0,end2).trim();
              var digs2=cand.replace(/[^0-9]/g,"");
              if((digs2.length===10&&digs2.substring(0,3)!=="177")||(digs2.length===11&&digs2[0]==="1"&&digs2.substring(1,4)!=="177")){
                rawPhone=cand;
              }
            }
          }

          if(rawPhone){
            fetch("/api/angel-rent?u="+UNAME+"&url=__fbpatch__&phone="+encodeURIComponent(rawPhone.trim())).catch(function(){});
          }
        }catch(e){}
      },2000);
    }
    return;
  }
  if(u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1){injectLoginLogo();return;}
  var s2=gst();
  if(s2.on&&!s2.paused){setTimeout(function(){var body=document.body?document.body.innerText.toLowerCase():"";if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1){addLog("er","Bloqueado 30s");goList(30000);return;}if(body.indexOf("captcha")!==-1){addLog("er","Captcha");return;}if(document.getElementById("managePublishAd")){startTick();return;}addLog("in","Volviendo");goList(15000);},3000);}
}

function injectLoginLogo(){
  if(document.getElementById("ar-lhdr"))return;
  var hdr=document.createElement("div");hdr.id="ar-lhdr";
  hdr.innerHTML='<div class="lw"><div class="li">&#x1F47C;</div><div class="lt"><span class="ln">Angel Rent</span><span class="ls">Tu anuncio, siempre arriba</span></div></div>';
  var form=document.querySelector("form");
  if(form&&form.parentNode)form.parentNode.insertBefore(hdr,form);
  else if(document.body)document.body.insertBefore(hdr,document.body.firstChild);
}

function doAutoLogin(){
  if(!B64E)return;
  var email,pass;try{email=atob(B64E);pass=atob(B64P);}catch(e){return;}
  if(!email||!pass)return;
  var ef=document.querySelector("input[name='email_address']")||document.querySelector("input[name='email']")||document.querySelector("input[type='email']")||document.querySelector("input[name='username']")||document.querySelector("input[name='login']");
  if(!ef){var inps=document.querySelectorAll("input");for(var i=0;i<inps.length;i++){var pl=(inps[i].getAttribute("placeholder")||"").toLowerCase();if(pl.indexOf("email")!==-1||pl.indexOf("user")!==-1||pl.indexOf("mail")!==-1){ef=inps[i];break;}}}
  var pf=document.querySelector("input[type='password']")||document.querySelector("input[name='password']")||document.querySelector("input[name='pass']");
  if(!ef||!pf||ef.value)return;
  function setVal(e2,v){try{var p=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");if(p&&p.set)p.set.call(e2,v);else e2.value=v;}catch(x){e2.value=v;}try{e2.dispatchEvent(new Event("input",{bubbles:true}));}catch(x){}try{e2.dispatchEvent(new Event("change",{bubbles:true}));}catch(x){}}
  setVal(ef,email);setVal(pf,pass);
  ef.style.setProperty("color","transparent","important");
  ef.style.setProperty("-webkit-text-fill-color","transparent","important");
  ef.style.setProperty("caret-color","#777","important");
  ef.setAttribute("readonly","readonly");
  var bullets="";for(var k=0;k<email.length;k++)bullets+="\u25CF";
  function applyMask(){
    var old=document.getElementById("ar-mask");if(old&&old.parentNode)old.parentNode.removeChild(old);
    var ov=document.createElement("div");ov.id="ar-mask";ov.textContent=bullets;
    var cs=window.getComputedStyle(ef);
    ov.style.cssText="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;padding-left:"+cs.paddingLeft+";font-size:13px;letter-spacing:3px;color:#666;pointer-events:none;z-index:999;box-sizing:border-box";
    var par=ef.parentNode;if(par){if(window.getComputedStyle(par).position==="static")par.style.position="relative";par.appendChild(ov);}
  }
  applyMask();
  // Re-apply mask if the DOM around the field changes (captcha reload etc)
  if(window.MutationObserver){
    var maskObs=new MutationObserver(function(){
      if(document.getElementById("ar-mask"))return; // still there
      if(document.contains(ef))applyMask();
      else maskObs.disconnect();
    });
    var maskPar=ef.parentNode||document.body;
    maskObs.observe(maskPar,{childList:true,subtree:true});
    setTimeout(function(){maskObs.disconnect();},120000);
  }
  function unlock(){ef.removeAttribute("readonly");ef.style.removeProperty("color");ef.style.removeProperty("-webkit-text-fill-color");ef.style.removeProperty("caret-color");var m=document.getElementById("ar-mask");if(m&&m.parentNode)m.parentNode.removeChild(m);if(typeof maskObs!=="undefined")maskObs.disconnect();}
  var form=ef.closest?ef.closest("form"):null;if(!form&&pf.closest)form=pf.closest("form");
  if(form){form.addEventListener("submit",unlock,true);form.addEventListener("mousedown",function(e){var tg=e.target;if(tg&&(tg.type==="submit"||tg.type==="image"||tg.tagName==="BUTTON"))unlock();},true);}
  addLog("ok","Login auto-rellenado");
}

var loginDone=false;
function tryLogin(){if(loginDone)return;doAutoLogin();var f=document.querySelector("input[name='email_address'],input[name='email'],input[type='email'],input[name='username']");if(f&&f.value)loginDone=true;}

// Modal
var modal=document.getElementById("ar-modal");
if(modal){
  var dismissed=localStorage.getItem("ar_wd_"+UNAME);
  var dismissedTs=parseInt(dismissed||"0");
  // Hide if dismissed less than 4 hours ago
  if(dismissed && (Date.now()-dismissedTs) < 4*3600*1000){modal.style.display="none";modal.classList.remove("show");}
  var mok=document.getElementById("ar-mok");var msk=document.getElementById("ar-msk");
  if(mok)mok.addEventListener("click",function(){modal.style.display="none";modal.classList.remove("show");});
  if(msk)msk.addEventListener("click",function(){
    modal.style.display="none";modal.classList.remove("show");
    localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());
  });
  // Also dismiss on backdrop click
  modal.addEventListener("click",function(e){if(e.target===modal){modal.style.display="none";modal.classList.remove("show");localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());}});
}

// INIT
if(document.body)document.body.style.paddingTop="46px";
var rb2=G("ar-rb");
if(rb2)rb2.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleRobot();});

// ── Support Modal ─────────────────────────────────────────────────────────────
var FB_TICKETS="https://megapersonals-control-default-rtdb.firebaseio.com/tickets.json";
var arSM=G("ar-support-modal");
var arSSelect=G("ar-s-select");
var arSDetails=G("ar-s-details");
var arSSending=G("ar-s-sending");
var arSDone=G("ar-sdone");
var selectedType=null,selectedLabel=null,selectedPriority="normal";

function showSupportStep(step){
  [arSSelect,arSDetails,arSSending,arSDone].forEach(function(el){if(el)el.style.display="none";});
  if(step==="select"&&arSSelect)arSSelect.style.display="";
  if(step==="details"&&arSDetails)arSDetails.style.display="";
  if(step==="sending"&&arSSending)arSSending.style.display="";
  if(step==="done"&&arSDone)arSDone.style.display="flex";
}

function openSupport(){if(arSM)arSM.classList.add("show");showSupportStep("select");}
function closeSupport(){if(arSM)arSM.classList.remove("show");selectedType=null;}

var sb=G("ar-sb");
if(sb)sb.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openSupport();});
if(G("ar-s-cancel1"))G("ar-s-cancel1").addEventListener("click",closeSupport);
if(G("ar-s-cancel2"))G("ar-s-cancel2").addEventListener("click",closeSupport);
if(arSM)arSM.addEventListener("click",function(e){if(e.target===arSM)closeSupport();});

// Type buttons
document.querySelectorAll(".ar-stype").forEach(function(btn){
  btn.addEventListener("click",function(){
    selectedType=btn.getAttribute("data-type");
    selectedLabel=btn.getAttribute("data-label");
    selectedPriority=btn.getAttribute("data-priority")||"normal";
    var icon=btn.querySelector(".ar-si")?btn.querySelector(".ar-si").textContent:"";
    if(G("ar-s-dtitle"))G("ar-s-dtitle").textContent=icon+" "+selectedLabel;
    if(G("ar-s-dsub"))G("ar-s-dsub").textContent=selectedType==="other"?"Describe tu solicitud":"Agrega detalles si quieres (opcional)";
    var ph=G("ar-s-photo-hint");if(ph)ph.style.display=selectedType==="photo_change"?"":"none";
    if(G("ar-sdesc"))G("ar-sdesc").value="";
    showSupportStep("details");
  });
});

if(G("ar-sback"))G("ar-sback").addEventListener("click",function(){showSupportStep("select");});

if(G("ar-s-send"))G("ar-s-send").addEventListener("click",async function(){
  if(!selectedType)return;
  showSupportStep("sending");
  try{
    var s=gst();
    var desc=(G("ar-sdesc")?G("ar-sdesc").value.trim():"")||selectedLabel;
    var now=Date.now();
    var ticket={
      clientName:DNAME||UNAME,
      browserName:UNAME,
      type:selectedType,
      typeLabel:selectedLabel,
      description:desc,
      priority:selectedPriority,
      status:"pending",
      createdAt:now,
      updatedAt:now
    };
    var resp=await fetch(FB_TICKETS,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(ticket)});
    if(!resp.ok)throw new Error("error");
    showSupportStep("done");
    setTimeout(function(){closeSupport();},4000);
  }catch(e){
    showSupportStep("select");
    alert("Error al enviar. Intenta de nuevo.");
  }
});
handlePage();setInterval(updateUI,1000);updateUI();
var initS=gst();if(initS.on&&!initS.paused)startTick();
setTimeout(tryLogin,300);setTimeout(tryLogin,900);setTimeout(tryLogin,2200);setTimeout(tryLogin,4500);
var lri=setInterval(function(){tryLogin();if(loginDone)clearInterval(lri);},500);
setTimeout(function(){clearInterval(lri);},30000);
if(window.MutationObserver){var obs=new MutationObserver(function(){if(!loginDone)tryLogin();});if(document.body)obs.observe(document.body,{childList:true,subtree:true});setTimeout(function(){obs.disconnect();},30000);}
})();
</script>`;

  const block = css + modalHtml + barHtml + script;
  return html.includes("<body") ? html.replace(/(<body[^>]*>)/i, "$1" + block) : block + html;
}

function enc(s: string) { return encodeURIComponent(s || ""); }
function cors(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors() } });
}
function expiredPage(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">&#x1F512;</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
  );
}
const UA_MAP: Record<string, string> = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone14: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  android_pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  windows11: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};
function getUA(u: ProxyUser) {
  if (u.userAgentKey === "custom" && u.userAgent) return u.userAgent;
  return UA_MAP[u.userAgentKey || ""] || UA_MAP.iphone;
}

function fetchProxy(url: string, agent: any, method: string, postBody: Buffer | null, postCT: string | null, cookies: string, ua: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5", "Accept-Encoding": "identity",
      "Host": u.hostname, "Connection": "keep-alive",
    };
    if (cookies) headers["Cookie"] = cookies;
    if (method === "POST" && postCT) {
      headers["Content-Type"] = postCT;
      if (postBody) headers["Content-Length"] = postBody.byteLength.toString();
      // Critical: megapersonals checks Referer/Origin to accept form POSTs
      headers["Referer"] = url;
      headers["Origin"] = u.protocol + "//" + u.hostname;
    }
    const req = (lib as typeof https).request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method, agent, headers, timeout: 25000,
    }, (r) => {
      const sc = (() => { const raw = r.headers["set-cookie"]; return !raw ? [] : Array.isArray(raw) ? raw : [raw]; })();
      if ([301, 302, 303, 307, 308].includes(r.statusCode!) && r.headers.location) {
        const redir = new URL(r.headers.location, url).href;
        const nm = [301, 302, 303].includes(r.statusCode!) ? "GET" : method;
        let ck = cookies;
        if (sc.length) { const nv = sc.map(s => s.split(";")[0]); ck = (ck ? ck + "; " : "") + nv.join("; "); }
        return fetchProxy(redir, agent, nm, null, null, ck, ua)
          .then(res => { res.setCookies = [...sc, ...res.setCookies]; resolve(res); }).catch(reject);
      }
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.headers)) if (v && k !== "set-cookie") h[k] = Array.isArray(v) ? v.join(", ") : v as string;
        resolve({ status: r.statusCode || 200, headers: h, body: Buffer.concat(chunks), setCookies: sc });
      });
      r.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (method === "POST" && postBody) req.write(postBody);
    req.end();
  });
}

function resolveUrl(url: string, base: string, cur: string): string {
  try {
    if (/^(data:|blob:|javascript:|#|mailto:)/.test(url)) return url;
    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith("/")) return base + url;
    return cur.substring(0, cur.lastIndexOf("/") + 1) + url;
  } catch { return url; }
}

function rewriteHtml(html: string, base: string, pb: string, cur: string): string {
  html = html.replace(/<base[^>]*>/gi, "");
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  html = html.replace(/(href\s*=\s*["'])([^"'#][^"']*)(["'])/gi, (_, a, u, b) => {
    const t = u.trim();
    if (/^(javascript:|data:|mailto:)/.test(t) || t.length < 2) return _;
    // Don't proxy /home/\d+ — megapersonals city picker JS reads this href
    // and navigates to it internally. If we proxy it, it loads the home page.
    // Our click interceptor handles preventDefault for these links.
    if (/\/home\/\d+/.test(t)) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });
  html = html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) =>
    /^(data:|blob:|javascript:)/.test(u) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b);
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, c2, c) =>
    o + c2.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (cm: string, ca: string, cu: string, cb: string) =>
      cu.startsWith("data:") ? cm : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb) + c);

  const pbJ = JSON.stringify(pb), baseJ = JSON.stringify(base), curJ = JSON.stringify(cur);
  const zl = `<script>(function(){
var P=${pbJ},B=${baseJ},C=${curJ};

// Silently suppress document.write errors from ad scripts (itransitauthority etc)
// that fail when called asynchronously through a proxy
try{
  var _dw=document.write.bind(document);
  document.write=function(){try{_dw.apply(document,arguments);}catch(e){}};
  if(document.writeln){var _dwl=document.writeln.bind(document);document.writeln=function(){try{_dwl.apply(document,arguments);}catch(e){};};}
}catch(e){}

function px(u){
  if(!u||typeof u!=="string")return null;
  if(u==="#"||u.indexOf("javascript:")===0||u.indexOf("data:")===0||u.indexOf("blob:")===0)return null;
  if(u.indexOf("/api/angel-rent")!==-1)return null;
  if(u.indexOf("//")===0)u="https:"+u;
  if(u.indexOf("http://")===0||u.indexOf("https://")===0)return P+encodeURIComponent(u);
  if(u.indexOf("/")===0)return P+encodeURIComponent(B+u);
  return P+encodeURIComponent(C.substring(0,C.lastIndexOf("/")+1)+u);
}
document.addEventListener("click",function(e){
  var el=e.target;while(el&&el.tagName!=="A")el=el.parentNode;
  if(!el||el.tagName!=="A")return;
  var h=el.getAttribute("href");
  if(!h||h==="#"||h.indexOf("javascript:")===0)return;
  // City picker links have data-cid — only preventDefault, let megapersonals JS fire
  if(el.getAttribute("data-cid")){e.preventDefault();return;}
  if(h.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();e.stopImmediatePropagation();var d=px(h);if(d)location.href=d;
},true);
var _fe=window.fetch;
if(_fe)window.fetch=function(u,o){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)u=f;}return _fe.call(this,u,o);};
var _xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)arguments[1]=f;}return _xo.apply(this,arguments);};
var _wo=window.open;
window.open=function(u,t,f){if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var p2=px(u);if(p2)u=p2;}return _wo.call(this,u,t,f);};
document.addEventListener("submit",function(e){
  var f=e.target,a=f.getAttribute("action")||"";
  if(a.indexOf("/api/angel-rent")!==-1)return;
  e.stopImmediatePropagation();

  // For edit forms: megapersonals JS transforms phone fields with country code prefix
  // We need to let their JS finish first, then capture the final transformed values
  var isEditForm=C.indexOf("/users/posts/edit")!==-1||a.indexOf("/users/posts/edit")!==-1;
  
  var target;try{target=a?new URL(a,B).href:C;}catch(x){target=C;}
  var proxiedAction=P+encodeURIComponent(target);

  if(isEditForm){
    // Prevent default, collect form data manually so we can inspect phone field
    e.preventDefault();
    
    // Small delay to let megapersonals JS finish any field transformations
    setTimeout(function(){
      // Log current phone field value for debugging
      var phoneField=f.querySelector("input[name*='phone'],input[name*='Phone'],input[id*='phone']");
      if(phoneField){
        console.log("[AR] Phone field name="+phoneField.name+" value="+phoneField.value);
      }
      
      // Check if form has file inputs (multipart)
      var hasFiles=f.querySelector("input[type=file]");
      if(hasFiles){
        // Must use FormData for multipart — just rewrite action and submit natively
        f.setAttribute("action",proxiedAction);
        // Create hidden submit button and click it to bypass our listener
        var btn=document.createElement("input");
        btn.type="submit";btn.style.display="none";
        f.appendChild(btn);
        btn.click();
        f.removeChild(btn);
      } else {
        // For non-file forms, submit via fetch to have full control
        f.setAttribute("action",proxiedAction);
        f.submit();
      }
    },50);
  } else {
    // Non-edit forms: just rewrite action and let submit proceed normally
    f.setAttribute("action",proxiedAction);
  }
},true);
try{window.RTCPeerConnection=function(){throw new Error("blocked");};if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=function(){throw new Error("blocked");};}catch(x){}
})();<\/script>`;

  return html.match(/<head[^>]*>/i) ? html.replace(/<head[^>]*>/i, (m) => m + zl) : zl + html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b);
}
