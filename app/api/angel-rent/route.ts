// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT - DISEÑO PREMIUM MEJORADO 
// Versión moderna con glassmorphism, animaciones suaves y mejor UX
// ═══════════════════════════════════════════════════════════════════════════

import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

const userCache: Record<string, { user: ProxyUser; ts: number }> = {};
const CACHE_TTL = 60000;

interface ProxyUser {
  name?: string; proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string; userAgentKey?: string; userAgent?: string;
  rentalEnd?: string; defaultUrl?: string; siteEmail?: string; sitePass?: string;
  notes?: string; active?: boolean; phoneNumber?: string;
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
  if (targetUrl === "__fbpatch__") {
    const phone = sp.get("phone");
    if (phone) {
      await fbPatch(username, { phoneNumber: phone }).catch(() => {});
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
    if (decoded.includes("/users/posts/edit")) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin permisos</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);font-family:-apple-system,sans-serif">
<div style="max-width:320px;width:90%;background:linear-gradient(145deg,#1a0533,#2d0a52);border:1px solid rgba(168,85,247,.35);border-radius:20px;padding:28px 24px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.7)">
  <div style="font-size:48px;margin-bottom:12px">🔒</div>
  <div style="font-size:17px;font-weight:900;color:#fff;margin-bottom:10px;line-height:1.3">Sin permisos de edición</div>
  <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:22px">Hola 👋 No tienes permisos para hacer ninguna edición directamente.<br><br>Si necesitas editar algo, contáctanos por Telegram y lo hacemos por ti.</div>
  <a href="https://t.me/angelrentsoporte" target="_blank" style="display:block;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:50px;margin-bottom:10px;box-shadow:0 4px 15px rgba(0,136,204,.4)">📲 Contactar por Telegram</a>
  <a href="javascript:history.back()" style="display:block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);font-size:13px;font-weight:700;padding:10px 20px;border-radius:50px;text-decoration:none">Volver</a>
</div></body></html>`,
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
      );
    }
    const agent = (PH && PT) ? new HttpsProxyAgent(PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`) : undefined;
    const pb = `/api/angel-rent?u=${enc(username)}&url=`;
    let postBody: Buffer | null = null, postCT: string | null = null;
    if (method === "POST") {
      const ab = await req.arrayBuffer();
      postBody = Buffer.from(ab);
      postCT = req.headers.get("content-type") || "application/x-www-form-urlencoded";
    }
    const cookies = req.headers.get("cookie") || "";
    const resp = await fetchProxy(decoded, agent, method, postBody, postCT, cookies, getUA(user));
    const ct = resp.headers["content-type"] || "";
    const rh = new Headers(cors());
    resp.setCookies.forEach(c => rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi, "").replace(/Secure;?\s*/gi, "").replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
    ));
    if (resp.setCookies.length > 0) {
      saveCookies(username, resp.setCookies, cookies).catch(() => {});
    }
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

async function saveCookies(username: string, newCookies: string[], existing: string): Promise<void> {
  if (!newCookies.length) return;
  try {
    const cookieMap: Record<string, string> = {};
    if (existing) {
      existing.split(";").forEach(c => {
        const [k, ...v] = c.trim().split("=");
        if (k) cookieMap[k.trim()] = v.join("=").trim();
      });
    }
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
    phone: JSON.stringify(user.phoneNumber || ""),
    plist: JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`),
  };

  let daysLeft = 999;
  if (user.rentalEnd) {
    daysLeft = Math.ceil((new Date(user.rentalEnd + "T23:59:59").getTime() - Date.now()) / 86400000);
  }
  const showWarn = daysLeft >= 0 && daysLeft <= 3;
  const warnDays = daysLeft;

  // ═══════════════════════════════════════════════════════════════════
  // CSS MEJORADO CON DISEÑO MODERNO
  // ═══════════════════════════════════════════════════════════════════
  const css = `<style id="ar-css">
/* ─── Barra superior con glassmorphism ───────────────────────────────── */
#ar-bar{
  position:fixed;top:0;left:0;right:0;z-index:2147483647;
  background:rgba(10,3,24,.85);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(168,85,247,.2);
  box-shadow:0 4px 30px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.05) inset;
  height:48px;display:flex;align-items:center;
  overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:none;-ms-overflow-style:none;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
}
#ar-bar::-webkit-scrollbar{display:none}

.ars{
  display:flex;align-items:center;gap:5px;
  padding:0 14px;height:100%;flex-shrink:0;
  border-right:1px solid rgba(255,255,255,.06);white-space:nowrap;
  transition:background .2s;
}
.ars:hover{background:rgba(255,255,255,.03)}
.ars:first-child{padding-left:10px}

/* Mobile optimizations */
@media (max-width: 768px) {
  #ar-bar{height:44px}
  .ars{padding:0 10px;gap:4px}
  .ars:first-child{padding-left:8px}
  .arl{font-size:8px;letter-spacing:.7px}
  .arv{font-size:11px}
  #ar-logo-icon{width:24px;height:24px;font-size:13px;border-radius:7px}
  
  /* Ocultar segmentos menos críticos en móviles muy pequeños */
  @media (max-width: 480px) {
    .ars-hide-mobile{display:none!important}
  }
}

.arl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:rgba(168,85,247,.6)}
.arv{font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;color:#fff}
#ar-dot{
  width:7px;height:7px;border-radius:50%;background:#374151;flex-shrink:0;
  transition:all .3s;box-shadow:0 0 0 0 rgba(34,197,94,0);
}
#ar-dot.on{
  background:#22c55e;
  box-shadow:0 0 12px rgba(34,197,94,1), 0 0 0 4px rgba(34,197,94,.2);
  animation:ar-pulse-dot 2s ease infinite;
}
#ar-dot.blink{
  background:#f59e0b;
  animation:ar-blink 1.2s ease-in-out infinite;
}
@keyframes ar-pulse-dot{0%,100%{box-shadow:0 0 12px rgba(34,197,94,1), 0 0 0 4px rgba(34,197,94,.2)}50%{box-shadow:0 0 20px rgba(34,197,94,1), 0 0 0 8px rgba(34,197,94,.1)}}
@keyframes ar-blink{0%,100%{opacity:1;transform:scale(1.1)}50%{opacity:.2;transform:scale(.7)}}
.arg{color:#22c55e!important}.ary{color:#fbbf24!important}.arr{color:#ef4444!important}.arp2{color:#c084fc!important}
#ar-logo-icon{
  width:28px;height:28px;
  background:linear-gradient(135deg,#a855f7,#ec4899);
  border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-size:15px;flex-shrink:0;
  box-shadow:0 4px 12px rgba(168,85,247,.4);
}

/* ─── Botones flotantes modernos ─────────────────────────────────────── */
#ar-btns{
  position:fixed;bottom:24px;right:16px;z-index:2147483647;
  display:flex;flex-direction:column;gap:12px;align-items:flex-end;
}

/* Mobile optimizations for floating buttons */
@media (max-width: 768px) {
  #ar-btns{bottom:16px;right:12px;gap:10px}
  .arbtn{
    padding:12px 20px;font-size:13px;
    border-radius:50px;gap:8px;
  }
  .arbtn span[style*="font-size:17px"]{font-size:15px!important}
}

@media (max-width: 480px) {
  #ar-btns{bottom:12px;right:8px;gap:8px}
  .arbtn{
    padding:10px 16px;font-size:12px;
    border-radius:40px;gap:6px;
  }
  .arbtn span[style*="font-size:17px"]{font-size:14px!important}
}

.arbtn{
  display:flex;align-items:center;gap:9px;border:none;cursor:pointer;
  border-radius:60px;font-weight:900;font-size:14px;padding:14px 24px;
  font-family:-apple-system,sans-serif;letter-spacing:.2px;
  box-shadow:0 8px 24px rgba(0,0,0,.4), 0 4px 8px rgba(0,0,0,.3);
  transition:all .2s cubic-bezier(.34,1.56,.64,1);
  white-space:nowrap;
  -webkit-tap-highlight-color:transparent;
  position:relative;overflow:hidden;
}
.arbtn::before{
  content:"";position:absolute;inset:0;
  background:linear-gradient(45deg,transparent,rgba(255,255,255,.15),transparent);
  transform:translateX(-100%);
  transition:transform .6s;
}
.arbtn:hover::before{transform:translateX(100%)}
.arbtn:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.5), 0 6px 12px rgba(0,0,0,.4)}
.arbtn:active{transform:scale(.95)!important}
#ar-rb{
  background:linear-gradient(135deg,#27272a,#18181b);
  color:rgba(255,255,255,.5);
  border:1px solid rgba(255,255,255,.1);
}
#ar-rb.on{
  background:linear-gradient(135deg,#16a34a,#15803d);
  color:#fff;border-color:transparent;
  box-shadow:0 8px 28px rgba(34,197,94,.5), 0 4px 12px rgba(34,197,94,.4);
  animation:ar-glow-btn 2s ease infinite;
}
@keyframes ar-glow-btn{0%,100%{box-shadow:0 8px 28px rgba(34,197,94,.5), 0 4px 12px rgba(34,197,94,.4)}50%{box-shadow:0 12px 36px rgba(34,197,94,.7), 0 6px 16px rgba(34,197,94,.6)}}
#ar-sb{
  background:linear-gradient(135deg,#ec4899,#d946ef);
  color:#fff;border:1px solid rgba(255,255,255,.08);
  box-shadow:0 8px 24px rgba(236,72,153,.4), 0 4px 8px rgba(236,72,153,.3);
}
#ar-stats-btn{
  background:linear-gradient(135deg,#7c3aed,#6d28d9);
  color:#fff;border:1px solid rgba(255,255,255,.08);
  box-shadow:0 8px 24px rgba(124,58,237,.4), 0 4px 8px rgba(124,58,237,.3);
}

/* ─── Efecto de anillo pulsante ────────────────────────────────────────── */
#ar-pulse-ring{
  position:absolute;inset:-6px;
  border:3px solid #22c55e;border-radius:60px;
  animation:ar-pulse-ring 2s cubic-bezier(0,0,.2,1) infinite;
  display:none;pointer-events:none;
}
@keyframes ar-pulse-ring{0%{transform:scale(.9);opacity:0}50%{opacity:.4}100%{transform:scale(1.3);opacity:0}}

/* ─── Notificaciones modernas ────────────────────────────────────────── */
#ar-client-notify{
  position:fixed;bottom:220px;right:16px;z-index:2147483647;
  background:linear-gradient(135deg,#10b981,#059669);
  border:1px solid rgba(16,185,129,.4);border-radius:16px;
  padding:16px 20px;max-width:300px;
  box-shadow:0 12px 40px rgba(0,0,0,.5), 0 4px 12px rgba(16,185,129,.3);
  animation:ar-slide-up .5s cubic-bezier(.34,1.56,.64,1);
  display:none;
  backdrop-filter:blur(10px);
}
@keyframes ar-slide-up{from{opacity:0;transform:translateY(24px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
#ar-client-notify .notify-icon{font-size:28px;margin-bottom:8px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
#ar-client-notify .notify-title{font-size:14px;font-weight:900;color:#fff;margin-bottom:4px;text-shadow:0 1px 2px rgba(0,0,0,.3)}
#ar-client-notify .notify-msg{font-size:12px;color:rgba(255,255,255,.9);line-height:1.5}

/* ─── Modales mejorados ────────────────────────────────────────────────── */
#ar-support-modal,#ar-stats-modal{
  position:fixed;inset:0;z-index:2147483648;
  background:rgba(0,0,0,.88);
  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  display:none;align-items:flex-end;justify-content:center;padding:0;
}
#ar-support-modal.show,#ar-stats-modal.show{display:flex}
#ar-sbox,#ar-stats-box{
  background:linear-gradient(160deg,#0a1628,#0f1f3d);
  border:1px solid rgba(59,130,246,.3);
  border-radius:28px 28px 0 0;
  padding:28px 24px 36px;width:100%;max-width:500px;
  box-shadow:0 -24px 80px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.05) inset;
  animation:ar-modal-slide .4s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;
  max-height:85vh;overflow-y:auto;
}
@keyframes ar-modal-slide{from{opacity:0;transform:translateY(80px)}to{opacity:1;transform:translateY(0)}}
#ar-sbox h3,#ar-stats-box h3{font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;color:#fff}
#ar-sbox .ar-ssub{font-size:13px;color:rgba(255,255,255,.45);text-align:center;margin-bottom:24px}

/* ─── Tarjetas de estadísticas ─────────────────────────────────────────── */
.ar-stat-card{
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1);
  border-radius:16px;padding:20px;margin-bottom:14px;
  transition:all .2s;position:relative;overflow:hidden;
}
.ar-stat-card::before{
  content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,#3b82f6,#8b5cf6);opacity:.5;
}
.ar-stat-card:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 24px rgba(0,0,0,.4);
  border-color:rgba(255,255,255,.15);
}
.ar-stat-title{font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;font-weight:800}
.ar-stat-value{font-size:32px;font-weight:900;color:#fff;margin-bottom:6px;letter-spacing:-.5px}
.ar-stat-sub{font-size:13px;color:rgba(255,255,255,.5)}
.ar-stat-trend{
  display:inline-flex;align-items:center;gap:5px;
  padding:6px 12px;border-radius:24px;font-size:12px;font-weight:800;margin-top:10px;
}
.ar-stat-trend.up{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.3)}

/* ─── Botones de tipo de soporte ──────────────────────────────────────── */
.ar-stype{
  display:flex;align-items:center;gap:14px;padding:16px;
  border:1px solid rgba(255,255,255,.1);border-radius:16px;
  background:rgba(255,255,255,.04);cursor:pointer;width:100%;
  margin-bottom:12px;
  transition:all .2s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;
}
.ar-stype:hover{
  background:rgba(59,130,246,.12);
  border-color:rgba(59,130,246,.4);
  transform:translateX(4px);
  box-shadow:0 4px 16px rgba(59,130,246,.2);
}
.ar-stype:active{transform:scale(.98) translateX(4px)}
.ar-stype .ar-si{
  font-size:28px;width:48px;height:48px;border-radius:14px;
  background:rgba(59,130,246,.12);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  transition:transform .2s;
}
.ar-stype:hover .ar-si{transform:scale(1.1) rotate(5deg)}
.ar-stype .ar-stxt{text-align:left;flex:1}
.ar-stype .ar-stl{display:block;font-size:15px;font-weight:800;color:#fff;margin-bottom:2px}
.ar-stype .ar-sds{display:block;font-size:12px;color:rgba(255,255,255,.4)}
.ar-urg{
  font-size:9px;font-weight:900;padding:4px 10px;border-radius:99px;
  background:rgba(239,68,68,.2);color:#f87171;
  border:1px solid rgba(239,68,68,.35);flex-shrink:0;
  animation:ar-urgent-pulse 2s ease infinite;
}
@keyframes ar-urgent-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}

/* ─── Inputs y controles ───────────────────────────────────────────────── */
#ar-sdesc{
  width:100%;padding:14px;
  border:1px solid rgba(255,255,255,.12);border-radius:14px;
  background:rgba(255,255,255,.06);color:#fff;font-size:14px;
  font-family:-apple-system,sans-serif;resize:none;outline:none;
  margin-bottom:16px;box-sizing:border-box;
  transition:all .2s;
}
#ar-sdesc:focus{
  border-color:rgba(59,130,246,.6);
  background:rgba(255,255,255,.08);
  box-shadow:0 0 0 4px rgba(59,130,246,.1);
}
#ar-sdesc::placeholder{color:rgba(255,255,255,.3)}
.ar-sbtn-send{
  width:100%;padding:16px;
  background:linear-gradient(135deg,#3b82f6,#1d4ed8);
  color:#fff;border:none;border-radius:16px;font-size:16px;font-weight:900;
  cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:12px;
  box-shadow:0 6px 20px rgba(59,130,246,.4);
  transition:all .2s;
}
.ar-sbtn-send:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 28px rgba(59,130,246,.5);
}
.ar-sbtn-send:active{transform:scale(.98)}
.ar-sbtn-send:disabled{opacity:.4;cursor:not-allowed}
.ar-sbtn-cancel{
  width:100%;padding:12px;background:transparent;
  color:rgba(255,255,255,.4);
  border:1px solid rgba(255,255,255,.1);border-radius:14px;
  font-size:14px;cursor:pointer;font-family:-apple-system,sans-serif;
  transition:all .2s;
}
.ar-sbtn-cancel:hover{
  background:rgba(255,255,255,.05);
  border-color:rgba(255,255,255,.15);
  color:rgba(255,255,255,.6);
}
#ar-sback{
  background:none;border:none;color:rgba(255,255,255,.5);
  font-size:14px;cursor:pointer;font-family:-apple-system,sans-serif;
  margin-bottom:18px;padding:0;display:flex;align-items:center;gap:6px;
  transition:color .2s;
}
#ar-sback:hover{color:rgba(255,255,255,.8)}

/* ─── Animación de éxito ────────────────────────────────────────────────── */
#ar-sdone{
  display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px 0;
}
#ar-sdone .ar-sdone-icon{font-size:64px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.3))}
#ar-sdone h3{font-size:22px;font-weight:900;color:#4ade80;margin:0}
#ar-sdone p{font-size:14px;color:rgba(255,255,255,.5);margin:0;text-align:center}

/* ─── Modal de advertencia ──────────────────────────────────────────────── */
#ar-modal{
  position:fixed;inset:0;z-index:2147483648;
  background:rgba(0,0,0,.9);
  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  display:none;align-items:center;justify-content:center;padding:20px;
}
#ar-modal.show{display:flex}
#ar-mbox{
  background:linear-gradient(160deg,#1c0a30,#0f0520);
  border:1px solid rgba(245,158,11,.35);border-radius:28px;
  padding:32px 26px 26px;max-width:340px;width:100%;text-align:center;
  box-shadow:0 40px 100px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.05) inset;
  animation:ar-modal-pop .4s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;
}
@keyframes ar-modal-pop{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
#ar-mbox .mi{font-size:52px;margin-bottom:4px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
#ar-mbox .mt{font-size:20px;font-weight:900;color:#fbbf24;margin-bottom:10px;letter-spacing:-.4px}
#ar-mbox .mb{
  display:inline-flex;align-items:center;justify-content:center;
  background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);
  border-radius:16px;padding:8px 20px;margin-bottom:14px;
  font-size:28px;font-weight:900;color:#fcd34d;font-variant-numeric:tabular-nums;
}
#ar-mbox .mm{font-size:14px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:22px}
#ar-mbox .mm strong{color:rgba(255,255,255,.8);font-weight:800}
#ar-mbox .mc{
  width:100%;padding:15px;
  background:linear-gradient(135deg,#f59e0b,#d97706);
  color:#fff;border:none;border-radius:16px;font-size:15px;font-weight:900;
  cursor:pointer;font-family:inherit;
  box-shadow:0 6px 20px rgba(245,158,11,.45);
  transition:all .2s;
}
#ar-mbox .mc:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 28px rgba(245,158,11,.6);
}
#ar-mbox .mc:active{transform:scale(.98)}
#ar-mbox .ms{
  display:block;margin-top:14px;font-size:12px;
  color:rgba(255,255,255,.25);cursor:pointer;background:none;
  border:none;font-family:inherit;text-decoration:underline;
}

/* ─── Promo bar ──────────────────────────────────────────────────────────── */
#ar-promo{
  position:fixed;top:48px;left:0;right:0;z-index:2147483646;
  background:linear-gradient(90deg,#4c0870,#7c1fa0,#4c0870);
  padding:5px 14px;text-align:center;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:11px;font-weight:800;color:#fff;letter-spacing:.2px;
  box-shadow:0 2px 12px rgba(0,0,0,.5);
  animation:ar-promo-in .4s ease;display:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
@keyframes ar-promo-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
@keyframes ar-promo-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-10px)}}
@keyframes ar-warning-pulse{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes ar-warning-fade-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}

/* ─── Login header ───────────────────────────────────────────────────────── */
#ar-lhdr{
  display:block;
  background:linear-gradient(165deg,#0d0720,#1a0a35);
  border-bottom:1px solid rgba(168,85,247,.15);
  padding:20px;text-align:center;font-family:-apple-system,sans-serif;
}
#ar-lhdr .lw{
  display:inline-flex;align-items:center;gap:12px;
  background:rgba(168,85,247,.08);
  border:1px solid rgba(168,85,247,.2);
  border-radius:60px;padding:8px 22px 8px 10px;
}
#ar-lhdr .li{
  width:38px;height:38px;
  background:linear-gradient(135deg,#a855f7,#ec4899);
  border-radius:12px;display:flex;align-items:center;justify-content:center;
  font-size:21px;flex-shrink:0;
  box-shadow:0 4px 14px rgba(168,85,247,.5);
}
#ar-lhdr .lt{text-align:left}
#ar-lhdr .ln{
  display:block;font-size:17px;font-weight:900;
  color:#fff;letter-spacing:-.4px;line-height:1.2;
}
#ar-lhdr .ls{
  display:block;font-size:9px;color:rgba(168,85,247,.65);
  text-transform:uppercase;letter-spacing:1.2px;font-weight:800;margin-top:3px;
}
</style>`;

  const modalHtml = showWarn ? `
<div id="ar-modal" class="show">
<div id="ar-mbox">
  <div class="mi">⏰</div>
  <div class="mt">Tu renta vence pronto</div>
  <div class="mb">${warnDays === 0 ? "HOY" : warnDays === 1 ? "1 día" : warnDays + " días"}</div>
  <p class="mm">${warnDays === 0
    ? "Tu plan <strong>vence hoy</strong>. Si no renuevas ahora, tu anuncio dejará de republicarse automáticamente."
    : `Tu plan vence en <strong>${warnDays} día${warnDays > 1 ? "s" : ""}</strong>. Renueva pronto para no perder la republicación automática.`
  }<br><br>Contáctanos para renovar y mantener tu anuncio siempre arriba.</p>
  <button class="mc" id="ar-mok">📲 Contactar para renovar</button>
  <button class="ms" id="ar-msk">Recordarme después</button>
</div>
</div>` : "";

  const uiHtml = `
${modalHtml}
<div id="ar-bar">
  <div class="ars">
    <div id="ar-logo-icon">👼</div>
    <span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:-.3px">Angel Rent</span>
  </div>
  <div class="ars"><span class="arl">Usuario</span><span class="arv" style="color:rgba(255,255,255,.65);font-weight:700" id="ar-uname"></span></div>
  <div class="ars"><span class="arl">Renta</span><span class="arv arg" id="ar-rent">...</span></div>
  <div class="ars" style="gap:7px"><div id="ar-dot"></div><span class="arl">Robot</span><span class="arv" id="ar-status" style="color:rgba(255,255,255,.3)">OFF</span></div>
  <div class="ars" id="ar-cdseg" style="display:none"><span class="arl">⏱ Próximo</span><span class="arv arp2" id="ar-cd">--:--</span></div>
  <div class="ars" id="ar-cntseg" style="display:none"><span class="arl">🔄 Bumps</span><span class="arv arp2" id="ar-cnt">0</span></div>
  <div class="ars ars-hide-mobile" id="ar-last-bump-seg" style="display:none"><span class="arl">⏮ Último</span><span class="arv arp2" id="ar-last-bump" style="font-size:11px">--</span></div>
  <div class="ars ars-hide-mobile" style="gap:7px"><div style="width:7px;height:7px;border-radius:50%;background:#f59e0b;box-shadow:0 0 10px rgba(245,158,11,1);flex-shrink:0"></div><span class="arl">Boost</span><span class="arv ary" id="ar-boost">x2.5</span></div>
  <div class="ars"><span class="arl">👁 Vistas</span><span class="arv arg" id="ar-views">...</span></div>
  <div class="ars ars-hide-mobile"><span class="arl">🔥 Destacado</span><span class="arv ary" id="ar-featured">SI</span></div>
</div>
<div id="ar-promo"><span id="ar-promo-txt"></span></div>
<div id="ar-client-notify">
  <div class="notify-icon">💬</div>
  <div class="notify-title" id="notify-title">Nuevo cliente interesado</div>
  <div class="notify-msg" id="notify-msg">Alguien acaba de ver tu anuncio</div>
</div>
<div id="ar-btns">
  <button id="ar-stats-btn" class="arbtn"><span style="font-size:17px">📊</span><span>Estadísticas</span></button>
  <button id="ar-rb" class="arbtn">
    <span id="ar-pulse-ring"></span>
    <span id="ar-ri" style="font-size:17px">⚡</span><span id="ar-rl">Robot OFF</span>
  </button>
  <button id="ar-sb" class="arbtn"><span style="font-size:17px">🎫</span><span>Soporte</span></button>
</div>
<div id="ar-stats-modal">
<div id="ar-stats-box">
  <h3>📊 Estadísticas del Anuncio</h3>
  <div class="ar-ssub" style="margin-bottom:24px">Rendimiento en tiempo real</div>
  
  <div class="ar-stat-card">
    <div class="ar-stat-title">Vistas Totales</div>
    <div class="ar-stat-value" id="stat-total-views">0</div>
    <div class="ar-stat-sub">en las últimas 24 horas</div>
    <span class="ar-stat-trend up">↗ +127% vs ayer</span>
  </div>

  <div class="ar-stat-card">
    <div class="ar-stat-title">Clientes Interesados</div>
    <div class="ar-stat-value" id="stat-interested">0</div>
    <div class="ar-stat-sub">han guardado o contactado</div>
    <span class="ar-stat-trend up">↗ +89% esta semana</span>
  </div>

  <div class="ar-stat-card">
    <div class="ar-stat-title">Posición en Búsqueda</div>
    <div class="ar-stat-value" style="color:#fbbf24">#<span id="stat-ranking">3</span></div>
    <div class="ar-stat-sub">en tu ciudad</div>
    <span class="ar-stat-trend up">↗ Subiste 12 posiciones</span>
  </div>

  <div class="ar-stat-card">
    <div class="ar-stat-title">Efectividad del Boost</div>
    <div class="ar-stat-value" style="color:#f59e0b">x<span id="stat-boost">2.5</span></div>
    <div class="ar-stat-sub">multiplicador activo</div>
    <span class="ar-stat-trend up">↗ Máxima visibilidad</span>
  </div>

  <button class="ar-sbtn-cancel" id="ar-stats-close">Cerrar</button>
</div>
</div>
<div id="ar-support-modal">
<div id="ar-sbox">
  <div id="ar-s-select">
    <h3>🎫 Solicitar Soporte</h3>
    <div class="ar-ssub">¿Qué necesitas?</div>
    <button class="ar-stype" data-type="activation" data-label="Activacion nueva" data-priority="urgent">
      <div class="ar-si">🚀</div><div class="ar-stxt"><span class="ar-stl">Activación nueva</span><span class="ar-sds">Crear anuncio por primera vez</span></div><span class="ar-urg">URGENTE</span>
    </button>
    <button class="ar-stype" data-type="photo_change" data-label="Cambiar fotos" data-priority="normal">
      <div class="ar-si">📸</div><div class="ar-stxt"><span class="ar-stl">Cambiar fotos</span><span class="ar-sds">Actualizar las fotos del anuncio</span></div>
    </button>
    <button class="ar-stype" data-type="number_change" data-label="Cambiar numero" data-priority="urgent">
      <div class="ar-si">📱</div><div class="ar-stxt"><span class="ar-stl">Cambiar número</span><span class="ar-sds">Cambiar el número de teléfono</span></div><span class="ar-urg">URGENTE</span>
    </button>
    <button class="ar-stype" data-type="other" data-label="Otro" data-priority="normal">
      <div class="ar-si">💬</div><div class="ar-stxt"><span class="ar-stl">Otro</span><span class="ar-sds">Otra solicitud o consulta</span></div>
    </button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel1">Cancelar</button>
  </div>
  <div id="ar-s-details" style="display:none">
    <button id="ar-sback">← Volver</button>
    <h3 id="ar-s-dtitle"></h3>
    <div class="ar-ssub" id="ar-s-dsub"></div>
    <div id="ar-s-photo-hint" style="display:none;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);border-radius:14px;padding:14px;margin-bottom:16px;font-size:13px;text-align:center;color:#93c5fd">
      📸 Cuando te atiendan, envía tus fotos a <a href="https://t.me/Soportetecnico2323" target="_blank" style="color:#60a5fa;font-weight:800">@Soportetecnico2323</a>
    </div>
    <textarea id="ar-sdesc" rows="3" placeholder="Describe tu solicitud (opcional)..."></textarea>
    <button class="ar-sbtn-send" id="ar-s-send">Enviar Solicitud</button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel2">Cancelar</button>
  </div>
  <div id="ar-s-sending" style="display:none;text-align:center;padding:36px 0">
    <div style="width:48px;height:48px;border:5px solid rgba(59,130,246,.3);border-top-color:#3b82f6;border-radius:50%;animation:ar-spin 1s linear infinite;margin:0 auto 16px"></div>
    <p style="color:rgba(255,255,255,.5);font-size:14px;margin:0;font-weight:600">Enviando solicitud...</p>
  </div>
  <div id="ar-sdone" style="display:none">
    <div class="ar-sdone-icon">✅</div>
    <h3>Solicitud enviada</h3>
    <p>Te avisaremos cuando te estemos atendiendo</p>
  </div>
</div>
</div>
<style>@keyframes ar-spin{to{transform:rotate(360deg)}}</style>`;

  // JavaScript con las mismas funcionalidades pero con mejoras visuales
  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},B64E=${V.b64e},B64P=${V.b64p},PHONE=${V.phone},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;

function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

// [El resto del JavaScript es idéntico al anterior pero activa las nuevas animaciones]
function initFakeStats(){var s=gst();if(!s.fakeViews){s.fakeViews=Math.floor(Math.random()*100)+250;s.fakeInterested=Math.floor(Math.random()*15)+12;s.fakeRanking=Math.floor(Math.random()*5)+2;s.lastViewUpdate=Date.now();s.lastClientNotify=Date.now();sst(s);}return s;}
function updateFakeViews(){var s=gst();if(!s.fakeViews)s=initFakeStats();var now=Date.now();var elapsed=now-(s.lastViewUpdate||now);if(elapsed>30000){var increment=Math.floor(Math.random()*3)+1;s.fakeViews+=increment;s.lastViewUpdate=now;if(s.fakeViews%5===0){s.fakeInterested=(s.fakeInterested||12)+1;}if(Math.random()>0.9&&s.fakeRanking>1){s.fakeRanking--;}sst(s);}return s;}
function showClientNotification(){var notify=document.getElementById("ar-client-notify");if(!notify)return;var msgs=["Alguien acaba de ver tu perfil","Nuevo cliente viendo tu anuncio","Cliente interesado en tu zona","Alguien guardó tu anuncio","Nuevo mensaje potencial","+1 vista desde tu ciudad"];var titles=["🔥 Actividad reciente","💬 Nuevo cliente","👀 Te están viendo","⭐ Interés alto","📱 Cliente potencial"];document.getElementById("notify-title").textContent=titles[Math.floor(Math.random()*titles.length)];document.getElementById("notify-msg").textContent=msgs[Math.floor(Math.random()*msgs.length)];notify.style.display="block";notify.style.animation="ar-slide-up .5s cubic-bezier(.34,1.56,.64,1)";setTimeout(function(){notify.style.animation="ar-slide-up .5s cubic-bezier(.34,1.56,.64,1) reverse";setTimeout(function(){notify.style.display="none";},500);},4500);}
function startClientNotifications(){var s=gst();if(!s.on||s.paused)return;var now=Date.now();var elapsed=now-(s.lastClientNotify||now);var interval=(Math.random()*180000)+120000;if(elapsed>interval){showClientNotification();s.lastClientNotify=now;sst(s);}}
function updateFakeUI(){var s=updateFakeViews();var viewsEl=document.getElementById("ar-views");if(viewsEl)viewsEl.textContent=s.fakeViews||"...";var statsModal=document.getElementById("ar-stats-modal");if(statsModal&&statsModal.classList.contains("show")){var totalViews=document.getElementById("stat-total-views");var interested=document.getElementById("stat-interested");var ranking=document.getElementById("stat-ranking");if(totalViews)totalViews.textContent=s.fakeViews||0;if(interested)interested.textContent=s.fakeInterested||0;if(ranking)ranking.textContent=s.fakeRanking||3;}if(s.on&&!s.paused){startClientNotifications();}}

var PROMOS=["⭐ ¡Gracias por preferirnos! Contacto: 829-383-7695","🚀 El mejor servicio de bump automático","💜 Angel Rent — Tu anuncio, siempre arriba","📲 Comparte: 829-383-7695","⚡ Robot 24/7 — Tu anuncio nunca baja","🏆 Servicio #1 en MegaPersonals","🔥 +2000 escorts confían en nosotros","💎 Boost Premium activado"];
var _promoIdx=Math.floor(Math.random()*PROMOS.length);
var _promoTimer=null;
function showNextPromo(){var el=document.getElementById("ar-promo");var txt=document.getElementById("ar-promo-txt");if(!el||!txt)return;txt.textContent=PROMOS[_promoIdx % PROMOS.length];_promoIdx++;el.style.animation="ar-promo-in .4s ease";el.style.display="block";document.body.style.paddingTop="74px";_promoTimer=setTimeout(function(){el.style.animation="ar-promo-out .4s ease forwards";setTimeout(function(){el.style.display="none";document.body.style.paddingTop="48px";_promoTimer=setTimeout(showNextPromo,30000);},400);},10000);}
setTimeout(showNextPromo,5000);

(function(){var modal=document.createElement("div");modal.id="ar-noedit-modal";modal.style.cssText="display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);align-items:center;justify-content:center;";modal.innerHTML='<div style="background:linear-gradient(145deg,#1a0533,#2d0a52);border:1px solid rgba(168,85,247,.35);border-radius:24px;padding:32px 28px;max-width:340px;width:90%;text-align:center;box-shadow:0 24px 72px rgba(0,0,0,.8);position:relative;">  <div style="font-size:42px;margin-bottom:12px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))">🔒</div>  <div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:12px;line-height:1.3">Sin permisos de edición</div>  <div style="font-size:14px;color:rgba(255,255,255,.7);line-height:1.7;margin-bottom:24px">Hola 👋 No tienes permisos para hacer ninguna edición directamente.<br><br>Si necesitas editar algo, contáctanos por Telegram.</div>  <a href="https://t.me/angelrentsoporte" target="_blank" style="display:block;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;text-decoration:none;font-weight:900;font-size:15px;padding:14px 22px;border-radius:50px;margin-bottom:12px;box-shadow:0 6px 18px rgba(0,136,204,.5)">📲 Contactar por Telegram</a>  <button id="ar-noedit-close" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);font-size:14px;font-weight:700;padding:12px 22px;border-radius:50px;cursor:pointer;width:100%">Cerrar</button></div>';document.body.appendChild(modal);document.getElementById("ar-noedit-close").addEventListener("click",function(){modal.style.display="none";});modal.addEventListener("click",function(e){if(e.target===modal)modal.style.display="none";});})();

function addLog(t,m){var s=gst();if(!s.logs)s.logs=[];var h=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});s.logs.unshift({t:t,m:"["+h+"] "+m});if(s.logs.length>30)s.logs=s.logs.slice(0,30);sst(s);}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function p2(n){return String(n).padStart(2,"0");}
function fmtR(ms){if(ms===null)return"∞";if(ms<=0)return"EXP";var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),m=Math.floor((ms%3600000)/60000);if(d>0)return d+"d "+h+"h";if(h>0)return h+"h "+m+"m";return m+"m";}
function G(id){return document.getElementById(id);}

function updateUI(){var s=gst(),on=!!s.on,paused=!!s.paused,cnt=s.cnt||0,nextAt=s.nextAt||0;if(G("ar-uname"))G("ar-uname").textContent=DNAME;var rl=rentLeft(),re=G("ar-rent");if(re){re.textContent=fmtR(rl);re.className="arv";re.classList.add(rl===null||rl>259200000?"arg":rl>86400000?"ary":"arr");}var dot=G("ar-dot");if(dot){dot.className="";if(on&&!paused)dot.className="on";else if(on&&paused)dot.className="blink";}var st=G("ar-status");if(st){if(!on){st.textContent="OFF";st.style.color="rgba(255,255,255,.3)";}else if(paused){st.textContent="Pausado";st.style.color="#f59e0b";}else{st.textContent="Activo";st.style.color="#22c55e";}}var cdSeg=G("ar-cdseg");if(on&&!paused){if(cdSeg)cdSeg.style.display="";var left=Math.max(0,Math.floor((nextAt-Date.now())/1000));if(G("ar-cd"))G("ar-cd").textContent=p2(Math.floor(left/60))+":"+p2(left%60);}else if(cdSeg)cdSeg.style.display="none";var cntSeg=G("ar-cntseg");if(on){if(cntSeg)cntSeg.style.display="";if(G("ar-cnt"))G("ar-cnt").textContent=String(cnt);}else if(cntSeg)cntSeg.style.display="none";var rb=G("ar-rb");if(rb){rb.className=on?"arbtn on":"arbtn";if(G("ar-rl"))G("ar-rl").textContent=on?"Robot ON":"Robot OFF";}updateFakeUI();}

function schedNext(){var secs=BMIN+Math.floor(Math.random()*(BMAX-BMIN));var s=gst();s.nextAt=Date.now()+secs*1000;sst(s);addLog("in","Proximo bump en "+Math.floor(secs/60)+"m "+(secs%60)+"s");}
function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}
function rnd(n){return Math.floor(Math.random()*n);}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
function isBumpUrl(u){var k=["bump","repost","renew","republish"];for(var i=0;i<k.length;i++)if(u.indexOf("/"+k[i]+"/")!==-1)return true;return false;}
function getPid(u){var s=u.split("/");for(var i=s.length-1;i>=0;i--)if(s[i]&&s[i].length>=5&&/^\d+$/.test(s[i]))return s[i];return null;}
function deproxy(h){if(h.indexOf("/api/angel-rent")===-1)return h;try{var m=h.match(/[?&]url=([^&]+)/);if(m)return decodeURIComponent(m[1]);}catch(x){}return h;}

async function doBump(){var s=gst();if(!s.on||s.paused)return;addLog("in","Republicando...");schedNext();setTimeout(function(){showClientNotification();s=gst();var views=Math.floor(Math.random()*8)+5;s.fakeViews=(s.fakeViews||250)+views;s.fakeInterested=(s.fakeInterested||12)+Math.floor(views/3);sst(s);updateFakeUI();},2000);var btn=document.getElementById("managePublishAd");if(btn){try{btn.scrollIntoView({behavior:"smooth",block:"center"});await wait(300+rnd(500));btn.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));await wait(100+rnd(200));btn.click();s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt+" (boton)");}catch(e){addLog("er","Error M1");}updateUI();return;}var links=document.querySelectorAll("a[href]");for(var i=0;i<links.length;i++){var rh=deproxy(links[i].getAttribute("href")||"");if(isBumpUrl(rh)){try{links[i].scrollIntoView({behavior:"smooth",block:"center"});await wait(300+rnd(400));links[i].click();s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt+" (link)");}catch(e){addLog("er","Error M2");}updateUI();return;}}var ids=[];var al=document.querySelectorAll("a[href]");for(var j=0;j<al.length;j++){var pid=getPid(deproxy(al[j].getAttribute("href")||""));if(pid&&ids.indexOf(pid)===-1)ids.push(pid);}var dels=document.querySelectorAll("[data-id],[data-post-id]");for(var k=0;k<dels.length;k++){var did=dels[k].getAttribute("data-id")||dels[k].getAttribute("data-post-id")||"";if(/^\d{5,}$/.test(did)&&ids.indexOf(did)===-1)ids.push(did);}if(ids.length){for(var n=0;n<ids.length;n++){try{var r=await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[n]),{credentials:"include",redirect:"follow"});if(r.ok){var txt=await r.text();if(txt.indexOf("blocked")!==-1||txt.indexOf("Attention")!==-1)addLog("er","Bloqueado");else{s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt);}}else addLog("er","HTTP "+r.status);}catch(e2){addLog("er","Fetch err");}if(n<ids.length-1)await wait(1500+rnd(2000));}}else{addLog("er","No posts");var sc=gst();if(sc.on&&!sc.paused&&CUR.indexOf("/users/posts/list")===-1)goList(3000);}updateUI();}

function startTick(){if(TICK)return;TICK=setInterval(function(){var s=gst();if(!s.on||s.paused)return;updateUI();if(s.nextAt>0&&Date.now()>=s.nextAt)doBump();},1000);}

function saveRobotState(on,paused){try{fetch("/api/angel-rent-state?u="+UNAME,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({robotOn:on,robotPaused:paused})});}catch(e){}}

function toggleRobot(){
  var s=gst();
  var ring=document.getElementById("ar-pulse-ring");
  if(s.on){
    s.on=false;s.nextAt=0;sst(s);
    if(TICK){clearInterval(TICK);TICK=null;}
    addLog("in","Robot OFF");
    saveRobotState(false,false);
    if(ring)ring.style.display="none";
  }else{
    s.on=true;s.paused=false;s.cnt=0;sst(s);
    addLog("ok","Robot ON - bumps 16-20 min");
    saveRobotState(true,false);
    schedNext();startTick();doBump();
    if(ring)ring.style.display="block";
  }
  updateUI();
}

function togglePause(){var s=gst();if(!s.on)return;s.paused=!s.paused;sst(s);addLog("in",s.paused?"Pausado":"Reanudado");saveRobotState(true,s.paused);updateUI();}

function autoOK(){var done=false;var chk=setInterval(function(){if(done)return;var btns=document.querySelectorAll("button,a,input[type=button],input[type=submit]");for(var i=0;i<btns.length;i++){var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();if(t==="ok"||t==="okay"||t==="done"||t==="continue"||t==="continuar"){done=true;clearInterval(chk);var b=btns[i];setTimeout(function(){try{b.click();}catch(e){}goList(2000);},500);return;}}},400);setTimeout(function(){if(!done){clearInterval(chk);goList(600);}},8000);}

function handlePage(){
  var u=CUR;
  var RK="ar_ret_"+UNAME;
  var now=Date.now();
  
  // ═══════════════════════════════════════════════════════════════════════
  // MARCAR CAMPO PHONE COMO NO EDITABLE EN FORMULARIO DE EDICIÓN
  // ═══════════════════════════════════════════════════════════════════════
  if(u.indexOf("/users/posts/edit")!==-1){
    setTimeout(function(){
      var phoneFields=document.querySelectorAll("input[name*='phone' i], input[id*='phone' i], input[placeholder*='phone' i], input[name='phone']");
      phoneFields.forEach(function(field){
        if(!field.classList.contains("ar-phone-marked")){
          field.classList.add("ar-phone-marked");
          field.style.cssText+="border:2px solid #f59e0b!important;background:rgba(251,191,36,.1)!important;";
          
          // Agregar tooltip warning
          var warning=document.createElement("div");
          warning.style.cssText="position:absolute;left:0;top:calc(100% + 4px);background:#f59e0b;color:#000;font-size:11px;font-weight:700;padding:6px 10px;border-radius:8px;z-index:9999;white-space:nowrap;box-shadow:0 4px 12px rgba(245,158,11,.4);pointer-events:none;animation:ar-warning-pulse 2s ease infinite;";
          warning.innerHTML="⚠️ No cambies este campo (1 cambio/día)";
          
          var parent=field.parentElement;
          if(parent){
            if(window.getComputedStyle(parent).position==="static"){
              parent.style.position="relative";
            }
            parent.appendChild(warning);
            
            // Ocultar warning después de 10 segundos
            setTimeout(function(){
              if(warning&&warning.parentNode){
                warning.style.animation="ar-warning-fade-out .3s ease forwards";
                setTimeout(function(){
                  if(warning.parentNode)warning.parentNode.removeChild(warning);
                }, 300);
              }
            }, 10000);
          }
          
          console.log("[Angel Rent] Phone field marked with warning");
        }
      });
    }, 1500);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // BLOQUEAR BOTONES PELIGROSOS
  // ═══════════════════════════════════════════════════════════════════════
  setTimeout(function(){
    // Función para bloquear un botón
    function blockButton(selector,label){
      var btn=document.querySelector(selector);
      if(btn){
        btn.style.opacity="0.5";
        btn.style.cursor="not-allowed";
        btn.style.pointerEvents="none";
        btn.setAttribute("disabled","true");
        
        // Crear overlay clickeable
        var overlay=document.createElement("div");
        overlay.style.cssText="position:absolute;inset:0;cursor:not-allowed;z-index:9999";
        overlay.addEventListener("click",function(e){
          e.preventDefault();
          e.stopPropagation();
          var modal=document.getElementById("ar-noedit-modal");
          if(modal)modal.style.display="flex";
        });
        
        var parent=btn.parentElement;
        if(parent&&window.getComputedStyle(parent).position==="static"){
          parent.style.position="relative";
        }
        if(parent)parent.appendChild(overlay);
        
        addLog("in","Bloqueado: "+label);
      }
    }
    
    // Bloquear EDIT POST
    blockButton("a[href*='/users/posts/edit']","Edit Post");
    blockButton("button:contains('EDIT POST')","Edit Post");
    blockButton("#edit-post-btn","Edit Post");
    
    // Bloquear WRITE NEW
    blockButton("a[href*='/users/posts/create']","Write New");
    blockButton("button:contains('WRITE NEW')","Write New");
    blockButton("#write-new-btn","Write New");
    blockButton("a[href*='create']","Write New");
    
    // Bloquear REMOVE POST
    blockButton("#delete-post-id","Remove Post");
    blockButton("a[href*='/users/posts/delete']","Remove Post");
    blockButton("button:contains('REMOVE POST')","Remove Post");
    blockButton("button:contains('Remove Post')","Remove Post");
    
    // Bloquear DELETE ACCOUNT
    blockButton("#footercontainer > div.account-options > div.delete-account > a","Delete Account");
    blockButton("a[href*='delete']","Delete Account");
    blockButton(".delete-account a","Delete Account");
    blockButton("a:contains('Delete Account')","Delete Account");
    
    // Buscar por texto en todos los enlaces y botones
    var allLinks=document.querySelectorAll("a,button");
    for(var i=0;i<allLinks.length;i++){
      var el=allLinks[i];
      var text=(el.innerText||el.textContent||"").trim().toUpperCase();
      var href=(el.getAttribute("href")||"").toLowerCase();
      
      // Bloquear por texto
      if(text.indexOf("EDIT POST")!==-1||
         text.indexOf("WRITE NEW")!==-1||
         text.indexOf("REMOVE POST")!==-1||
         text.indexOf("DELETE POST")!==-1||
         text.indexOf("DELETE ACCOUNT")!==-1||
         text.indexOf("REMOVE ACCOUNT")!==-1){
        
        el.style.opacity="0.5";
        el.style.cursor="not-allowed";
        el.style.filter="grayscale(1)";
        
        el.addEventListener("click",function(e){
          e.preventDefault();
          e.stopPropagation();
          var modal=document.getElementById("ar-noedit-modal");
          if(modal)modal.style.display="flex";
        },true);
      }
      
      // Bloquear por href
      if(href.indexOf("/edit")!==-1||
         href.indexOf("/create")!==-1||
         href.indexOf("/delete")!==-1||
         href.indexOf("/remove")!==-1){
        
        if(href.indexOf("/bump")===-1&&href.indexOf("/repost")===-1){
          el.style.opacity="0.5";
          el.style.cursor="not-allowed";
          el.style.filter="grayscale(1)";
          
          el.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();
            var modal=document.getElementById("ar-noedit-modal");
            if(modal)modal.style.display="flex";
          },true);
        }
      }
    }
  },1000);
  
  // Repetir el bloqueo cada 3 segundos por si cargan dinámicamente
  setInterval(function(){
    var dangerousButtons=document.querySelectorAll("a,button");
    for(var i=0;i<dangerousButtons.length;i++){
      var el=dangerousButtons[i];
      var text=(el.innerText||el.textContent||"").trim().toUpperCase();
      var href=(el.getAttribute("href")||"").toLowerCase();
      
      if((text.indexOf("EDIT POST")!==-1||
          text.indexOf("WRITE NEW")!==-1||
          text.indexOf("REMOVE POST")!==-1||
          text.indexOf("DELETE")!==-1||
          href.indexOf("/edit")!==-1||
          href.indexOf("/create")!==-1||
          href.indexOf("/delete")!==-1)&&
          href.indexOf("/bump")===-1&&
          href.indexOf("/repost")===-1){
        
        if(el.style.opacity!=="0.5"){
          el.style.opacity="0.5";
          el.style.cursor="not-allowed";
          el.style.filter="grayscale(1)";
          
          el.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();
            var modal=document.getElementById("ar-noedit-modal");
            if(modal)modal.style.display="flex";
          },true);
        }
      }
    }
  },3000);
  
  // ═══════════════════════════════════════════════════════════════════════
  // RESTO DEL CÓDIGO ORIGINAL
  // ═══════════════════════════════════════════════════════════════════════
  
  if(u.indexOf("/users/posts/edit/")!==-1){
    // ═══════════════════════════════════════════════════════════════════════
    // MODO DE PRUEBA: Permitir edición con advertencia en consola
    // ═══════════════════════════════════════════════════════════════════════
    setTimeout(function(){
      console.log("[Angel Rent] ⚠️ EDIT MODE ENABLED - Testing phone field removal");
      console.log("[Angel Rent] The phone field will be automatically removed if unchanged");
      
      var forms=document.querySelectorAll("form");
      if(forms.length>0){
        console.log("[Angel Rent] Edit form detected, analyzing fields...");
        var form=forms[0];
        var allInputs=form.querySelectorAll("input, textarea, select");
        console.log("[Angel Rent] Total fields:", allInputs.length);
        allInputs.forEach(function(input){
          var name=input.getAttribute("name")||"no-name";
          var type=input.type||"unknown";
          var hasPhone=name.toLowerCase().indexOf("phone")!==-1;
          if(hasPhone){
            console.log("[Angel Rent] 🔍 PHONE FIELD FOUND:", {
              name: name,
              type: type,
              value: input.value,
              defaultValue: input.defaultValue,
              placeholder: input.getAttribute("placeholder")
            });
          }
        });
      }
    }, 1000);
    
    // NO MOSTRAR MODAL - Permitir edición para testing
    return;
  }
  var retRaw=null;try{retRaw=localStorage.getItem(RK);}catch(e){}if(retRaw){var retObj=null;try{retObj=JSON.parse(retRaw);}catch(e){}if(retObj&&retObj.url&&(now-retObj.ts)<60000){try{localStorage.removeItem(RK);}catch(e){}setTimeout(function(){location.href=retObj.url;},500);return;}try{localStorage.removeItem(RK);}catch(e){}}if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1||u.indexOf("success_renew")!==-1){addLog("ok","Publicado!");autoOK();return;}if(u.indexOf("/users/posts/bump/")!==-1||u.indexOf("/users/posts/repost/")!==-1||u.indexOf("/users/posts/renew/")!==-1){setTimeout(function(){autoOK();goList(2000);},1500);return;}if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){var s=gst();if(s.on)goList(3000);return;}if(u.indexOf("/users/posts")!==-1){startTick();if(u.indexOf("/users/posts/bump")===-1&&u.indexOf("/users/posts/repost")===-1){setTimeout(function(){try{var rawPhone=null;var phoneEl=document.querySelector("#manage_ad_body > div.post_preview_info > div:nth-child(1) > div:nth-child(1) > span:nth-child(3)");if(phoneEl) rawPhone=(phoneEl.innerText||phoneEl.textContent||"").trim();if(!rawPhone){var bodyTxt=document.body?document.body.innerText:"";var idx=bodyTxt.indexOf("Phone :");if(idx===-1)idx=bodyTxt.indexOf("Phone:");if(idx!==-1){var after=bodyTxt.substring(idx+7,idx+35).trim();var end2=0;for(var ci=0;ci<after.length;ci++){var cc=after.charCodeAt(ci);if(!((cc>=48&&cc<=57)||cc===43||cc===32||cc===45||cc===40||cc===41||cc===46))break;end2=ci+1;}var cand=after.substring(0,end2).trim();var digs2=cand.replace(/[^0-9]/g,"");if((digs2.length===10&&digs2.substring(0,3)!=="177")||(digs2.length===11&&digs2[0]==="1"&&digs2.substring(1,4)!=="177")){rawPhone=cand;}}}if(rawPhone){fetch("/api/angel-rent?u="+UNAME+"&url=__fbpatch__&phone="+encodeURIComponent(rawPhone.trim())).catch(function(){});}}catch(e){}},2000);}return;}if(u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1){injectLoginLogo();return;}var s2=gst();if(s2.on&&!s2.paused){setTimeout(function(){var body=document.body?document.body.innerText.toLowerCase():"";if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1){addLog("er","Bloqueado 30s");goList(30000);return;}if(body.indexOf("captcha")!==-1){addLog("er","Captcha");return;}if(document.getElementById("managePublishAd")){startTick();return;}addLog("in","Volviendo");goList(15000);},3000);}}

function injectLoginLogo(){if(document.getElementById("ar-lhdr"))return;var hdr=document.createElement("div");hdr.id="ar-lhdr";hdr.innerHTML='<div class="lw"><div class="li">👼</div><div class="lt"><span class="ln">Angel Rent</span><span class="ls">Tu anuncio, siempre arriba</span></div></div>';var form=document.querySelector("form");if(form&&form.parentNode)form.parentNode.insertBefore(hdr,form);else if(document.body)document.body.insertBefore(hdr,document.body.firstChild);}

function doAutoLogin(){if(!B64E)return;var email,pass;try{email=atob(B64E);pass=atob(B64P);}catch(e){return;}if(!email||!pass)return;var ef=document.querySelector("input[name='email_address']")||document.querySelector("input[name='email']")||document.querySelector("input[type='email']")||document.querySelector("input[name='username']")||document.querySelector("input[name='login']");if(!ef){var inps=document.querySelectorAll("input");for(var i=0;i<inps.length;i++){var pl=(inps[i].getAttribute("placeholder")||"").toLowerCase();if(pl.indexOf("email")!==-1||pl.indexOf("user")!==-1||pl.indexOf("mail")!==-1){ef=inps[i];break;}}}var pf=document.querySelector("input[type='password']")||document.querySelector("input[name='password']")||document.querySelector("input[name='pass']");if(!ef||!pf||ef.value)return;function setVal(e2,v){try{var p=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");if(p&&p.set)p.set.call(e2,v);else e2.value=v;}catch(x){e2.value=v;}try{e2.dispatchEvent(new Event("input",{bubbles:true}));}catch(x){}try{e2.dispatchEvent(new Event("change",{bubbles:true}));}catch(x){}}setVal(ef,email);setVal(pf,pass);ef.style.setProperty("color","transparent","important");ef.style.setProperty("-webkit-text-fill-color","transparent","important");ef.style.setProperty("caret-color","#777","important");ef.setAttribute("readonly","readonly");var bullets="";for(var k=0;k<email.length;k++)bullets+="●";function applyMask(){var old=document.getElementById("ar-mask");if(old&&old.parentNode)old.parentNode.removeChild(old);var ov=document.createElement("div");ov.id="ar-mask";ov.textContent=bullets;var cs=window.getComputedStyle(ef);ov.style.cssText="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;padding-left:"+cs.paddingLeft+";font-size:14px;letter-spacing:3px;color:#666;pointer-events:none;z-index:999;box-sizing:border-box";var par=ef.parentNode;if(par){if(window.getComputedStyle(par).position==="static")par.style.position="relative";par.appendChild(ov);}}applyMask();if(window.MutationObserver){var maskObs=new MutationObserver(function(){if(document.getElementById("ar-mask"))return;if(document.contains(ef))applyMask();else maskObs.disconnect();});var maskPar=ef.parentNode||document.body;maskObs.observe(maskPar,{childList:true,subtree:true});setTimeout(function(){maskObs.disconnect();},120000);}ef.setAttribute("autocomplete","off");pf.setAttribute("autocomplete","off");var form=ef.closest?ef.closest("form"):null;if(!form&&pf.closest)form=pf.closest("form");if(form){form.setAttribute("autocomplete","off");form.addEventListener("submit",function(){var en=ef.getAttribute("name"),pn=pf.getAttribute("name");var rand=Math.random().toString(36).slice(2);var hi=document.createElement("input");hi.type="hidden";hi.name=en||"email_address";hi.value=email;form.appendChild(hi);var hp=document.createElement("input");hp.type="hidden";hp.name=pn||"password";hp.value=pass;form.appendChild(hp);ef.setAttribute("name","ar_"+rand+"_x");pf.setAttribute("name","ar_"+rand+"_y");ef.value="";pf.value="";},true);}addLog("ok","Login auto-rellenado");}

var loginDone=false;
function tryLogin(){if(loginDone)return;doAutoLogin();var f=document.querySelector("input[name='email_address'],input[name='email'],input[type='email'],input[name='username']");if(f&&f.value)loginDone=true;}

var modal=document.getElementById("ar-modal");
if(modal){var dismissed=localStorage.getItem("ar_wd_"+UNAME);var dismissedTs=parseInt(dismissed||"0");if(dismissed && (Date.now()-dismissedTs) < 4*3600*1000){modal.style.display="none";modal.classList.remove("show");}var mok=document.getElementById("ar-mok");var msk=document.getElementById("ar-msk");if(mok)mok.addEventListener("click",function(){modal.style.display="none";modal.classList.remove("show");});if(msk)msk.addEventListener("click",function(){modal.style.display="none";modal.classList.remove("show");localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());});modal.addEventListener("click",function(e){if(e.target===modal){modal.style.display="none";modal.classList.remove("show");localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());}});}

if(document.body)document.body.style.paddingTop="48px";
var rb2=G("ar-rb");
if(rb2)rb2.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleRobot();});

var arStatsModal=G("ar-stats-modal");
var statsBtn=G("ar-stats-btn");
if(statsBtn)statsBtn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();if(arStatsModal){arStatsModal.classList.add("show");updateFakeUI();}});
if(G("ar-stats-close"))G("ar-stats-close").addEventListener("click",function(){if(arStatsModal)arStatsModal.classList.remove("show");});
if(arStatsModal)arStatsModal.addEventListener("click",function(e){if(e.target===arStatsModal)arStatsModal.classList.remove("show");});

var FB_TICKETS="https://megapersonals-control-default-rtdb.firebaseio.com/tickets.json";
var arSM=G("ar-support-modal");
var arSSelect=G("ar-s-select");
var arSDetails=G("ar-s-details");
var arSSending=G("ar-s-sending");
var arSDone=G("ar-sdone");
var selectedType=null,selectedLabel=null,selectedPriority="normal";
var currentTicketId=null;
var queueChecker=null;

function showSupportStep(step){[arSSelect,arSDetails,arSSending,arSDone].forEach(function(el){if(el)el.style.display="none";});if(step==="select"&&arSSelect)arSSelect.style.display="";if(step==="details"&&arSDetails)arSDetails.style.display="";if(step==="sending"&&arSSending)arSSending.style.display="";if(step==="done"&&arSDone)arSDone.style.display="flex";if(step==="queue"){var queueEl=G("ar-s-queue");if(queueEl)queueEl.style.display="flex";}}

async function checkQueuePosition(){
  if(!currentTicketId)return;
  try{
    var resp=await fetch(FB_TICKETS.replace(".json",""));
    if(!resp.ok){clearInterval(queueChecker);return;}
    var allTickets=await resp.json();
    if(!allTickets)return;
    
    var ticketsArray=Object.entries(allTickets).map(function(entry){
      return {id:entry[0],data:entry[1]};
    });
    
    var myTicket=ticketsArray.find(function(t){return t.id===currentTicketId;});
    if(!myTicket){clearInterval(queueChecker);return;}
    
    if(myTicket.data.status==="in_progress"){
      clearInterval(queueChecker);
      showBeingAttended();
      return;
    }
    
    if(myTicket.data.status==="completed"){
      clearInterval(queueChecker);
      showSupportStep("done");
      setTimeout(function(){closeSupport();},4000);
      return;
    }
    
    var pendingTickets=ticketsArray
      .filter(function(t){return t.data.status==="pending";})
      .sort(function(a,b){return a.data.createdAt-b.data.createdAt;});
    
    var position=pendingTickets.findIndex(function(t){return t.id===currentTicketId;})+1;
    
    if(position>0){
      updateQueueUI(position,pendingTickets.length);
    }
  }catch(e){
    console.error("Error checking queue:",e);
  }
}

function updateQueueUI(position,total){
  var posEl=G("ar-queue-position");
  var totalEl=G("ar-queue-total");
  var msgEl=G("ar-queue-msg");
  var progressBar=G("ar-queue-progress-fill");
  
  if(posEl)posEl.textContent=position;
  if(totalEl)totalEl.textContent=total;
  
  if(msgEl){
    if(position===1){
      msgEl.textContent="¡Eres el siguiente! Un agente te atenderá pronto";
      msgEl.style.color="#4ade80";
    }else if(position<=3){
      msgEl.textContent="Quedan "+(position-1)+" persona"+(position>2?"s":"")+" antes que tú";
      msgEl.style.color="#fbbf24";
    }else{
      msgEl.textContent="Espera estimada: "+Math.ceil(position*2)+" minutos";
      msgEl.style.color="rgba(255,255,255,.6)";
    }
  }
  
  if(progressBar){
    var progress=Math.max(10,100-((position-1)/Math.max(total,1)*100));
    progressBar.style.width=progress+"%";
  }
}

function showBeingAttended(){
  var queueEl=G("ar-s-queue");
  if(!queueEl)return;
  
  var content=queueEl.querySelector(".ar-queue-content");
  if(content){
    content.innerHTML='<div style="text-align:center;padding:20px 0"><div style="width:80px;height:80px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(59,130,246,.4);animation:ar-pulse-scale 2s ease infinite"><span style="font-size:40px">👨‍💻</span></div><h3 style="font-size:22px;font-weight:900;color:#60a5fa;margin-bottom:8px">¡Te están atendiendo!</h3><p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:20px">Un agente está trabajando en tu solicitud.<br>Pronto resolveremos tu caso.</p></div>';
  }
  
  setTimeout(function(){
    if(queueEl)queueEl.style.display="none";
  },8000);
}

function startQueueMonitoring(){
  if(queueChecker)clearInterval(queueChecker);
  checkQueuePosition();
  queueChecker=setInterval(checkQueuePosition,5000);
}

function openSupport(){if(arSM)arSM.classList.add("show");showSupportStep("select");currentTicketId=null;if(queueChecker){clearInterval(queueChecker);queueChecker=null;}}
function closeSupport(){if(arSM)arSM.classList.remove("show");selectedType=null;currentTicketId=null;if(queueChecker){clearInterval(queueChecker);queueChecker=null;}}

var sb=G("ar-sb");
if(sb)sb.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openSupport();});
if(G("ar-s-cancel1"))G("ar-s-cancel1").addEventListener("click",closeSupport);
if(G("ar-s-cancel2"))G("ar-s-cancel2").addEventListener("click",closeSupport);
if(arSM)arSM.addEventListener("click",function(e){if(e.target===arSM)closeSupport();});

document.querySelectorAll(".ar-stype").forEach(function(btn){btn.addEventListener("click",function(){selectedType=btn.getAttribute("data-type");selectedLabel=btn.getAttribute("data-label");selectedPriority=btn.getAttribute("data-priority")||"normal";var icon=btn.querySelector(".ar-si")?btn.querySelector(".ar-si").textContent:"";if(G("ar-s-dtitle"))G("ar-s-dtitle").textContent=icon+" "+selectedLabel;if(G("ar-s-dsub"))G("ar-s-dsub").textContent=selectedType==="other"?"Describe tu solicitud":"Agrega detalles si quieres (opcional)";var ph=G("ar-s-photo-hint");if(ph)ph.style.display=selectedType==="photo_change"?"":"none";if(G("ar-sdesc"))G("ar-sdesc").value="";showSupportStep("details");});});

if(G("ar-sback"))G("ar-sback").addEventListener("click",function(){showSupportStep("select");});

if(G("ar-s-send"))G("ar-s-send").addEventListener("click",async function(){if(!selectedType)return;showSupportStep("sending");try{var s=gst();var desc=(G("ar-sdesc")?G("ar-sdesc").value.trim():"")||selectedLabel;var now=Date.now();var email="",pass="";try{if(B64E)email=atob(B64E);if(B64P)pass=atob(B64P);}catch(e){}var ticket={clientName:DNAME||UNAME,browserName:UNAME,phoneNumber:PHONE||"N/A",email:email||"N/A",password:pass||"N/A",type:selectedType,typeLabel:selectedLabel,description:desc,priority:selectedPriority,status:"pending",createdAt:now,updatedAt:now};var resp=await fetch(FB_TICKETS,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(ticket)});if(!resp.ok)throw new Error("error");var result=await resp.json();currentTicketId=result.name;showSupportStep("queue");startQueueMonitoring();}catch(e){showSupportStep("select");alert("Error al enviar. Intenta de nuevo.");}});

initFakeStats();
handlePage();setInterval(updateUI,1000);updateUI();
var initS=gst();if(initS.on&&!initS.paused)startTick();
setTimeout(tryLogin,300);setTimeout(tryLogin,900);setTimeout(tryLogin,2200);setTimeout(tryLogin,4500);
var lri=setInterval(function(){tryLogin();if(loginDone)clearInterval(lri);},500);
setTimeout(function(){clearInterval(lri);},30000);
if(window.MutationObserver){var obs=new MutationObserver(function(){if(!loginDone)tryLogin();});if(document.body)obs.observe(document.body,{childList:true,subtree:true});setTimeout(function(){obs.disconnect();},30000);}
})();
</script>`;

  const bodyBlock = uiHtml + script;
  let result = html;
  if (result.includes("</head>")) {
    result = result.replace("</head>", css + "</head>");
  } else if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/<head[^>]*>/i, (m) => m + css);
  }
  result = result.includes("<body") ? result.replace(/(<body[^>]*>)/i, "$1" + bodyBlock) : bodyBlock + result;
  return result;
}

// [El resto de las funciones helper son idénticas al archivo anterior]
function enc(s: string) { return encodeURIComponent(s || ""); }
function cors(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors() } });
}
function expiredPage(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">🔒</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
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
    if (/\/home\/\d+/.test(t)) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });
  html = html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) =>
    /^(data:|blob:|javascript:)/.test(u) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b);
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });
  if (cur.includes("/login") || cur.includes("/sign_in")) {
    html = html.replace(/(<input[^>]*)(>)/gi, (_, attrs, close) => {
      if (attrs.includes("autocomplete")) return _;
      return attrs + ' autocomplete="off"' + close;
    });
    html = html.replace(/(<form[^>]*)(>)/gi, (_, attrs, close) => {
      if (attrs.includes("autocomplete")) return _;
      return attrs + ' autocomplete="off"' + close;
    });
  }
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, c2, c) =>
    o + c2.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (cm: string, ca: string, cu: string, cb: string) =>
      cu.startsWith("data:") ? cm : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb) + c);

  const pbJ = JSON.stringify(pb), baseJ = JSON.stringify(base), curJ = JSON.stringify(cur);
  const zl = `<script>(function(){
var P=${pbJ},B=${baseJ},C=${curJ};
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
  var isEditForm=C.indexOf("/users/posts/edit")!==-1||a.indexOf("/users/posts/edit")!==-1;
  var target;try{target=a?new URL(a,B).href:C;}catch(x){target=C;}
  var proxiedAction=P+encodeURIComponent(target);
  if(isEditForm){
    e.preventDefault();
    setTimeout(function(){
      // ═══════════════════════════════════════════════════════════════════
      // SOLUCIÓN: ELIMINAR CAMPO PHONE SI NO FUE MODIFICADO
      // ═══════════════════════════════════════════════════════════════════
      var phoneFields=f.querySelectorAll("input[name*='phone' i], input[id*='phone' i], input[placeholder*='phone' i]");
      phoneFields.forEach(function(field){
        // Si el campo tiene un valor original y no cambió, eliminarlo
        if(field.defaultValue&&field.value===field.defaultValue){
          console.log("[Angel Rent] Phone field unchanged, removing from form");
          var hiddenMarker=document.createElement("input");
          hiddenMarker.type="hidden";
          hiddenMarker.name="ar_phone_removed";
          hiddenMarker.value="1";
          f.appendChild(hiddenMarker);
          field.remove();
        }
        // Si el campo está vacío o es el valor por defecto, también eliminarlo
        else if(!field.value||field.value.trim()===""||field.value===field.getAttribute("placeholder")){
          console.log("[Angel Rent] Phone field empty, removing from form");
          field.remove();
        }
      });
      
      // También buscar campos por name exacto
      var exactPhoneField=f.querySelector("input[name='phone']");
      if(exactPhoneField&&exactPhoneField.defaultValue===exactPhoneField.value){
        console.log("[Angel Rent] Exact phone field unchanged, removing");
        exactPhoneField.remove();
      }
      
      // Continuar con el submit normal
      var hasFiles=f.querySelector("input[type=file]");
      if(hasFiles){
        f.setAttribute("action",proxiedAction);
        var btn=document.createElement("input");
        btn.type="submit";btn.style.display="none";
        f.appendChild(btn);
        btn.click();
        f.removeChild(btn);
      } else {
        f.setAttribute("action",proxiedAction);
        f.submit();
      }
    },50);
  } else {
    f.setAttribute("action",proxiedAction);
  }
},true);
      } else {
        f.setAttribute("action",proxiedAction);
        f.submit();
      }
    },50);
  } else {
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
