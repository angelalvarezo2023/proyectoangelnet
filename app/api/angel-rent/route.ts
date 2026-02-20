// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT - PREMIUM DESIGN
// Proxy residencial SIEMPRE activo + Edición HABILITADA
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
    
    // Proxy SIEMPRE activo (incluyendo edición)
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

  const css = `<style id="ar-css">
#ar-bar{position:fixed;top:0;left:0;right:0;z-index:2147483647;background:rgba(10,3,24,.85);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-bottom:1px solid rgba(168,85,247,.2);box-shadow:0 4px 30px rgba(0,0,0,.3);height:48px;display:flex;align-items:center;overflow-x:auto;font-family:-apple-system,sans-serif}
#ar-bar::-webkit-scrollbar{display:none}
.ars{display:flex;align-items:center;gap:5px;padding:0 14px;height:100%;flex-shrink:0;border-right:1px solid rgba(255,255,255,.06);white-space:nowrap;transition:background .2s}
.ars:hover{background:rgba(255,255,255,.03)}
.arl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:rgba(168,85,247,.6)}
.arv{font-size:13px;font-weight:900;color:#fff}
#ar-dot{width:7px;height:7px;border-radius:50%;background:#374151;flex-shrink:0;transition:all .3s}
#ar-dot.on{background:#22c55e;box-shadow:0 0 12px rgba(34,197,94,1);animation:ar-pulse 2s ease infinite}
@keyframes ar-pulse{0%,100%{box-shadow:0 0 12px rgba(34,197,94,1)}50%{box-shadow:0 0 20px rgba(34,197,94,1)}}
.arg{color:#22c55e!important}.ary{color:#fbbf24!important}.arr{color:#ef4444!important}
#ar-logo-icon{width:28px;height:28px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 4px 12px rgba(168,85,247,.4)}
#ar-btns{position:fixed;bottom:24px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:12px}
.arbtn{display:flex;align-items:center;gap:9px;border:none;cursor:pointer;border-radius:60px;font-weight:900;font-size:14px;padding:14px 24px;font-family:-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:all .2s;position:relative;overflow:hidden}
.arbtn:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.5)}
#ar-rb{background:linear-gradient(135deg,#27272a,#18181b);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.1)}
#ar-rb.on{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;box-shadow:0 8px 28px rgba(34,197,94,.5);animation:ar-glow 2s ease infinite}
@keyframes ar-glow{0%,100%{box-shadow:0 8px 28px rgba(34,197,94,.5)}50%{box-shadow:0 12px 36px rgba(34,197,94,.7)}}
#ar-sb{background:linear-gradient(135deg,#ec4899,#d946ef);color:#fff;box-shadow:0 8px 24px rgba(236,72,153,.4)}
</style>`;

  const modalHtml = showWarn ? `
<div id="ar-modal" class="show" style="position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.9);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:20px">
<div style="background:linear-gradient(160deg,#1c0a30,#0f0520);border:1px solid rgba(245,158,11,.35);border-radius:28px;padding:32px 26px;max-width:340px;width:100%;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.95);font-family:-apple-system,sans-serif;color:#fff">
  <div style="font-size:52px;margin-bottom:4px">⏰</div>
  <div style="font-size:20px;font-weight:900;color:#fbbf24;margin-bottom:10px">Tu renta vence pronto</div>
  <div style="display:inline-flex;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:16px;padding:8px 20px;margin-bottom:14px;font-size:28px;font-weight:900;color:#fcd34d">${warnDays === 0 ? "HOY" : warnDays === 1 ? "1 día" : warnDays + " días"}</div>
  <p style="font-size:14px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:22px">${warnDays === 0 ? "Tu plan <strong>vence hoy</strong>. Renueva ahora." : `Tu plan vence en <strong>${warnDays} día${warnDays > 1 ? "s" : ""}</strong>. Renueva pronto.`}</p>
  <button id="ar-mok" style="width:100%;padding:15px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:16px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 6px 20px rgba(245,158,11,.45)">📲 Contactar para renovar</button>
</div>
</div>` : "";

  const uiHtml = `
${modalHtml}
<div id="ar-bar">
  <div class="ars">
    <div id="ar-logo-icon">👼</div>
    <span style="font-size:12px;font-weight:900;color:#fff">Angel Rent</span>
  </div>
  <div class="ars"><span class="arl">Usuario</span><span class="arv" id="ar-uname"></span></div>
  <div class="ars"><span class="arl">Renta</span><span class="arv arg" id="ar-rent">...</span></div>
  <div class="ars"><div id="ar-dot"></div><span class="arl">Robot</span><span class="arv" id="ar-status">OFF</span></div>
  <div class="ars" id="ar-cdseg" style="display:none"><span class="arl">⏱ Próximo</span><span class="arv" id="ar-cd">--:--</span></div>
  <div class="ars" id="ar-cntseg" style="display:none"><span class="arl">🔄 Bumps</span><span class="arv" id="ar-cnt">0</span></div>
</div>
<div id="ar-btns">
  <button id="ar-rb" class="arbtn"><span style="font-size:17px">⚡</span><span id="ar-rl">Robot OFF</span></button>
  <button id="ar-sb" class="arbtn"><span style="font-size:17px">🎫</span><span>Soporte</span></button>
</div>`;

  const script = `<script>
(function(){
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name},ENDTS=${V.endTs},PLIST=${V.plist};
var SK="ar_"+UNAME,TICK=null;
function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}
function G(id){return document.getElementById(id);}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function fmtR(ms){if(ms===null)return"∞";if(ms<=0)return"EXP";var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000);return d>0?d+"d "+h+"h":h+"h";}
function updateUI(){var s=gst(),on=!!s.on;if(G("ar-uname"))G("ar-uname").textContent=DNAME;var rl=rentLeft(),re=G("ar-rent");if(re){re.textContent=fmtR(rl);re.className="arv "+(rl===null||rl>259200000?"arg":rl>86400000?"ary":"arr");}var dot=G("ar-dot");if(dot)dot.className=on?"on":"";var st=G("ar-status");if(st){st.textContent=on?"Activo":"OFF";st.style.color=on?"#22c55e":"rgba(255,255,255,.3)";}var rb=G("ar-rb");if(rb){rb.className=on?"arbtn on":"arbtn";if(G("ar-rl"))G("ar-rl").textContent=on?"Robot ON":"Robot OFF";}}
function toggleRobot(){var s=gst();s.on=!s.on;sst(s);updateUI();}
if(document.body)document.body.style.paddingTop="48px";
var rb=G("ar-rb");if(rb)rb.addEventListener("click",toggleRobot);
var modal=document.getElementById("ar-modal");
if(modal){
  var mok=document.getElementById("ar-mok");
  if(mok)mok.addEventListener("click",function(){window.open("https://t.me/angelrentsoporte","_blank");modal.style.display="none";});
}
setInterval(updateUI,1000);updateUI();
})();
<\/script>`;

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

function enc(s: string) { return encodeURIComponent(s || ""); }
function cors(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors() } });
}
function expiredPage(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Angel Rent</title><style>*{margin:0;padding:0}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">🔒</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
  );
}
const UA_MAP: Record<string, string> = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
  html = html.replace(/(href\s*=\s*["'])([^"'#][^"']*)(["'])/gi, (_, a, u, b) => {
    const t = u.trim();
    if (/^(javascript:|data:|mailto:)/.test(t) || t.length < 2) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });
  html = html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) =>
    /^(data:|blob:|javascript:)/.test(u) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b);
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });
  const pbJ = JSON.stringify(pb), baseJ = JSON.stringify(base), curJ = JSON.stringify(cur);
  const zl = `<script>(function(){
var P=${pbJ},B=${baseJ},C=${curJ};
function px(u){
  if(!u||typeof u!=="string")return null;
  if(u==="#"||u.indexOf("javascript:")===0||u.indexOf("data:")===0)return null;
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
  if(h.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();var d=px(h);if(d)location.href=d;
},true);
document.addEventListener("submit",function(e){
  var f=e.target,a=f.getAttribute("action")||"";
  if(a.indexOf("/api/angel-rent")!==-1)return;
  var target;try{target=a?new URL(a,B).href:C;}catch(x){target=C;}
  f.setAttribute("action",P+encodeURIComponent(target));
},true);
})();<\/script>`;
  return html.match(/<head[^>]*>/i) ? html.replace(/<head[^>]*>/i, (m) => m + zl) : zl + html;
}
function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b);
}
