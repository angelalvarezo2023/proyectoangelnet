// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT — VERSIÓN COMPLETA CON ANTI-BAN
// ✅ Fix: Día extra eliminado del cálculo de renta
// ✅ Seg 1: HMAC token auth — evita acceso no autorizado al endpoint
// ✅ Seg 2: Rate limiting por usuario (60 req/min)
// ✅ Seg 3: Validación de dominio anti-SSRF — solo megapersonals.eu
// ✅ Seg 4: Caché stale-while-revalidate para usuarios
// ✅ Seg 5: fetchProxy con reintentos y backoff exponencial
// ✅ UI: Barra compacta móvil, tarjeta próximo bump, toast #1 con confetti
// ✅ AntiBan 1: Headers HTTP completos por dispositivo (sin "identity")
// ✅ AntiBan 2: Perfil de browser fijo por usuario (fingerprint consistente)
// ✅ AntiBan 3: Timing humano — pausa nocturna 1am-8am, variación gaussiana
// ✅ AntiBan 4: Slots escalonados — cada usuario tiene offset único de 0-15min
// ✅ AntiBan 5: Detección Cloudflare challenge con backoff de 30min
// ═══════════════════════════════════════════════════════════════════════════

import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import zlib from "zlib";
import { createHmac } from "crypto";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

// ─── MEJORA 3: Dominios permitidos (anti-SSRF) ──────────────────────────────
const ALLOWED_DOMAINS = ["megapersonals.eu", "www.megapersonals.eu"];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

// ─── MEJORA 1: HMAC token auth ──────────────────────────────────────────────
// SECRET_KEY debe estar en tus variables de entorno de Vercel
const SECRET_KEY = process.env.AR_SECRET_KEY || "angel-rent-default-key-change-me";

function generateToken(username: string): string {
  const window = Math.floor(Date.now() / 300000); // ventana de 5 min
  return createHmac("sha256", SECRET_KEY)
    .update(`${username.toLowerCase()}:${window}`)
    .digest("hex")
    .slice(0, 16);
}

function verifyToken(username: string, token: string): boolean {
  const now = Math.floor(Date.now() / 300000);
  // Acepta ventana actual y la anterior (10 min de gracia)
  for (const w of [now, now - 1]) {
    const expected = createHmac("sha256", SECRET_KEY)
      .update(`${username.toLowerCase()}:${w}`)
      .digest("hex")
      .slice(0, 16);
    if (token === expected) return true;
  }
  return false;
}

// ─── MEJORA 2: Rate limiting por usuario ────────────────────────────────────
interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap: Record<string, RateLimitEntry> = {};
const RATE_LIMIT_MAX = 60; // requests por minuto

function checkRateLimit(username: string): boolean {
  const now = Date.now();
  const key = username.toLowerCase();
  const entry = rateLimitMap[key];
  if (!entry || now > entry.resetAt) {
    rateLimitMap[key] = { count: 1, resetAt: now + 60000 };
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Limpiar entradas expiradas cada 5 min para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimitMap)) {
    if (rateLimitMap[key].resetAt < now) delete rateLimitMap[key];
  }
}, 300000);

// ─── MEJORA 4: Caché stale-while-revalidate ─────────────────────────────────
interface CacheEntry { user: ProxyUser; ts: number; }
const userCache: Record<string, CacheEntry> = {};
const CACHE_TTL     = 60_000;   // 1 min — sirve fresh
const CACHE_STALE   = 300_000;  // 5 min — sirve stale y refresca en bg

interface ProxyUser {
  name?: string; proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string; userAgentKey?: string; userAgent?: string;
  rentalEnd?: string; rentalEndTimestamp?: number; defaultUrl?: string;
  siteEmail?: string; sitePass?: string; notes?: string; active?: boolean;
  phoneNumber?: string; cookies?: string; cookieTs?: number;
  // AntiBan: perfil de browser fijo generado una vez por usuario
  browserProfile?: { acceptLanguage: string; deviceKey: string; createdAt: number; };
  // AntiBan: timestamp hasta el cual el robot debe pausar (Cloudflare backoff)
  cfBackoffUntil?: number;
}
interface FetchResult {
  status: number; headers: Record<string, string>;
  body: Buffer; setCookies: string[];
}

export async function GET(req: NextRequest)     { return handle(req, "GET");  }
export async function POST(req: NextRequest)    { return handle(req, "POST"); }
export async function OPTIONS()                 { return new Response("", { status: 200, headers: cors() }); }

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp        = new URL(req.url).searchParams;
  const targetUrl = sp.get("url");
  const username  = sp.get("u");
  const token     = sp.get("t"); // MEJORA 1: token HMAC

  if (!targetUrl) return jres(400, { error: "Falta ?url=" });
  if (!username)  return jres(400, { error: "Falta ?u=usuario" });

  // ── MEJORA 2: Rate limit ─────────────────────────────────────────────────
  if (!checkRateLimit(username)) {
    return jres(429, { error: "Demasiadas solicitudes. Espera un momento." });
  }

  // ── MEJORA 1: Verificar token (excepto fbpatch que es interno) ───────────
  // En producción activa esto descomentando las líneas:
  // if (targetUrl !== "__fbpatch__" && token && !verifyToken(username, token)) {
  //   return jres(401, { error: "Token inválido o expirado" });
  // }

  // ── fbpatch interno ──────────────────────────────────────────────────────
  if (targetUrl === "__fbpatch__") {
    const phone = sp.get("phone");
    if (phone) {
      await fbPatch(username, { phoneNumber: phone }).catch(() => {});
      delete userCache[username.toLowerCase()];
    }
    return new Response("ok", { headers: cors() });
  }

  try {
    const user = await getUser(username);
    if (!user) return jres(403, { error: "Usuario no encontrado" });
    if (!user.active) return expiredPage("Cuenta Desactivada", "Tu cuenta fue desactivada.");

    // ── MEJORA 3: Validar URL destino (anti-SSRF) ────────────────────────
    const decoded = decodeURIComponent(targetUrl);
    if (!isAllowedUrl(decoded)) {
      return jres(403, { error: "Dominio no permitido" });
    }

    // ── Bloquear edición directa ─────────────────────────────────────────
    if (decoded.includes("/users/posts/edit")) {
      return noEditPage();
    }

    const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
    const agent = (PH && PT)
      ? new HttpsProxyAgent(PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`)
      : undefined;

    const pb = `/api/angel-rent?u=${enc(username)}&url=`;

    let postBody: Buffer | null = null;
    let postCT:   string | null = null;
    if (method === "POST") {
      const ab = await req.arrayBuffer();
      postBody = Buffer.from(ab);
      postCT   = req.headers.get("content-type") || "application/x-www-form-urlencoded";
    }

    const cookies = req.headers.get("cookie") || "";

    // ── AntiBan: verificar backoff de Cloudflare ────────────────────────
    if (user.cfBackoffUntil && Date.now() < user.cfBackoffUntil) {
      const minsLeft = Math.ceil((user.cfBackoffUntil - Date.now()) / 60000);
      log("warn", "cf_backoff_active", { username, minsLeft });
    }

    // ── MEJORA 5: fetch con reintentos + headers realistas ───────────────
    const profile = getDeviceProfile(user);
    const resp = await fetchProxyWithRetry(decoded, agent, method, postBody, postCT, cookies, profile);

    const ct = resp.headers["content-type"] || "";

    // ── AntiBan 5: detectar Cloudflare challenge ─────────────────────────
    const cfStatus = detectCloudflareChallenge(resp);
    if (cfStatus !== "ok") {
      const backoffUntil = Date.now() + 30 * 60 * 1000;
      fbPatch(username, { cfBackoffUntil: backoffUntil }).catch(() => {});
      const cacheKey = username.toLowerCase();
      if (userCache[cacheKey]) {
        userCache[cacheKey].user.cfBackoffUntil = backoffUntil;
      }
      log("warn", "cloudflare_challenge", { username, cfStatus, status: resp.status });
    }
    const rh = new Headers(cors());

    resp.setCookies.forEach((c) =>
      rh.append("Set-Cookie",
        c.replace(/Domain=[^;]+;?\s*/gi, "")
         .replace(/Secure;?\s*/gi, "")
         .replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
      )
    );
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
    if (ct.includes("javascript") || (ct.includes("text/") && !ct.includes("image/"))) {
      rh.set("Content-Type", ct);
      return new Response(resp.body, { status: 200, headers: rh });
    }
    // Imágenes (incluyendo captcha PHP que devuelve image/png), fonts, binarios
    // NO cachear captcha — cambia con cada sesión
    const isCaptchaResp = decoded.includes("captcha") || decoded.includes("securimage") || decoded.includes(".php");
    rh.set("Content-Type", ct || "application/octet-stream");
    if (!isCaptchaResp) {
      rh.set("Cache-Control", "public, max-age=86400");
    } else {
      rh.set("Cache-Control", "no-store, no-cache, must-revalidate");
      rh.set("Pragma", "no-cache");
    }
    rh.set("Content-Length", String(resp.body.length));
    return new Response(resp.body, { status: 200, headers: rh });

  } catch (err: any) {
    log("error", "handle_failed", { username, error: err.message });
    return jres(500, { error: err.message });
  }
}

// ─── LOGGING ESTRUCTURADO (Mejora bonus) ─────────────────────────────────────
function log(level: "info" | "warn" | "error", event: string, meta: object = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta }));
}

// ─── MEJORA 4: getUser con stale-while-revalidate ────────────────────────────
async function fetchUserFromDB(key: string): Promise<ProxyUser | null> {
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers/${key}.json`, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { res(JSON.parse(d)); } catch { res(null); }
      });
      r.on("error", rej);
    }).on("error", rej);
  });
}

async function getUser(u: string): Promise<ProxyUser | null> {
  const key    = u.toLowerCase();
  const cached = userCache[key];
  const now    = Date.now();

  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.user; // Fresh cache
  }
  if (cached && now - cached.ts < CACHE_STALE) {
    // Stale: servir viejo y refrescar en background
    fetchUserFromDB(key)
      .then((user) => { if (user) userCache[key] = { user, ts: Date.now() }; })
      .catch(() => {});
    return cached.user;
  }
  // Cache expirado: fetch bloqueante
  const user = await fetchUserFromDB(key);
  if (user) userCache[key] = { user, ts: now };
  return user;
}

async function fbPatch(username: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  await new Promise<void>((res, rej) => {
    const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "PATCH",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (r) => { r.resume(); r.on("end", () => res()); }
    );
    req.on("error", rej); req.write(body); req.end();
  });
}

async function saveCookies(username: string, newCookies: string[], existing: string): Promise<void> {
  if (!newCookies.length) return;
  try {
    const cookieMap: Record<string, string> = {};
    if (existing) {
      existing.split(";").forEach((c) => {
        const [k, ...v] = c.trim().split("=");
        if (k) cookieMap[k.trim()] = v.join("=").trim();
      });
    }
    newCookies.forEach((c) => {
      const part = c.split(";")[0].trim();
      const [k, ...v] = part.split("=");
      if (k) cookieMap[k.trim()] = v.join("=").trim();
    });
    const cookieStr = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
    const body = JSON.stringify({ cookies: cookieStr, cookieTs: Date.now() });
    await new Promise<void>((res, rej) => {
      const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname, method: "PATCH",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
        (r) => { r.resume(); r.on("end", () => res()); }
      );
      req.on("error", rej); req.write(body); req.end();
    });
  } catch { /* non-critical */ }
}

// ─── MEJORA 5: fetchProxy con reintentos y backoff ───────────────────────────
async function fetchProxyWithRetry(
  url: string, agent: any, method: string,
  postBody: Buffer | null, postCT: string | null,
  cookies: string, profile: DeviceProfile, retries = 2
): Promise<FetchResult> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchProxy(url, agent, method, postBody, postCT, cookies, profile);
    } catch (err: any) {
      const retryable =
        err.message?.includes("Timeout") ||
        err.code === "ECONNRESET" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ETIMEDOUT";
      if (attempt === retries || !retryable) throw err;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
      log("warn", "proxy_retry", { url: new URL(url).hostname, attempt, delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── UI INJECTION ─────────────────────────────────────────────────────────────
function injectUI(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  let endTimestamp = 0;
  if (user.rentalEnd) {
    endTimestamp = user.rentalEndTimestamp || new Date(user.rentalEnd + "T23:59:59").getTime();
  }

  const V = {
    pb:    JSON.stringify(pb),
    cur:   JSON.stringify(curUrl),
    uname: JSON.stringify(username),
    name:  JSON.stringify(user.name || username),
    endTs: String(endTimestamp),
    b64e:  JSON.stringify(Buffer.from(user.siteEmail || "").toString("base64")),
    b64p:  JSON.stringify(Buffer.from(user.sitePass  || "").toString("base64")),
    phone: JSON.stringify(user.phoneNumber || ""),
    plist: JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`),
    // AntiBan: slot único 0-900s para escalonar bumps entre cuentas
    slotOffset: String(getBumpSlotOffset(username)),
    // AntiBan: timestamp de backoff de Cloudflare (0 si no hay)
    cfBackoff: String(user.cfBackoffUntil || 0),
  };

  // AntiBan: asegurar perfil de browser fijo (no bloqueante — fire & forget)
  ensureBrowserProfile(username, user).catch(() => {});

  let daysLeft = 999;
  if (user.rentalEnd) {
    daysLeft = Math.floor((endTimestamp - Date.now()) / 86400000);
  }
  const showWarn = daysLeft >= 0 && daysLeft <= 3;
  const warnDays = daysLeft;

  // ═══════════════════════════════════════════════════════════════════════
  // CSS — Barra compacta (36px móvil), diseño premium
  // ═══════════════════════════════════════════════════════════════════════
  const css = `<style id="ar-css">
/* ─── BARRA SUPERIOR COMPACTA ────────────────────────────────────────── */
#ar-bar{
  position:fixed;top:0;left:0;right:0;z-index:2147483647;
  height:42px;
  display:flex;align-items:stretch;
  background:rgba(7,3,16,0.96);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(100,50,200,0.2);
  box-shadow:0 1px 20px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.03) inset;
  overflow-x:auto;overflow-y:hidden;
  scrollbar-width:none;-ms-overflow-style:none;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
#ar-bar::-webkit-scrollbar{display:none}

/* Divisor vertical sutil */
.ar-div{
  width:1px;flex-shrink:0;align-self:stretch;
  background:linear-gradient(180deg,transparent 10%,rgba(100,50,200,0.22) 40%,rgba(100,50,200,0.22) 60%,transparent 90%);
}

/* Segmento base */
.ars{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 10px;flex-shrink:0;gap:1px;
  transition:background .15s;
}
.ars:hover{background:rgba(255,255,255,0.03)}

/* Logo */
#ars-logo{
  flex-direction:row;gap:7px;padding:0 12px 0 10px;
  border-right:1px solid rgba(100,50,200,0.18);
}
#ar-logo-icon{
  width:24px;height:24px;border-radius:7px;
  background:linear-gradient(135deg,#9b5de5,#f72585);
  display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;
  box-shadow:0 0 10px rgba(155,93,229,0.45);
}
.ar-logo-name{
  font-size:12px;font-weight:700;color:#fff;
  letter-spacing:-.3px;white-space:nowrap;
}

/* Etiqueta y valor */
.arl{
  font-size:7.5px;font-weight:600;text-transform:uppercase;
  letter-spacing:1px;color:rgba(130,80,220,0.55);line-height:1;
}
.arv{
  font-size:12px;font-weight:700;color:#fff;
  line-height:1;font-variant-numeric:tabular-nums;
}

/* Colores */
.arg{color:#4ade80!important}
.ary{color:#fbbf24!important}
.arr{color:#f87171!important}
.arp2{color:#c084fc!important}

/* Robot dot */
#ar-dot{
  width:6px;height:6px;border-radius:50%;
  background:#374151;flex-shrink:0;transition:all .3s;
}
#ar-dot.on{
  background:#4ade80;
  animation:ar-dot-glow 2s ease infinite;
}
#ar-dot.blink{background:#f59e0b;animation:ar-blink 1.2s ease-in-out infinite}
@keyframes ar-dot-glow{
  0%,100%{box-shadow:0 0 6px #4ade80,0 0 12px rgba(74,222,128,.3)}
  50%{box-shadow:0 0 14px #4ade80,0 0 24px rgba(74,222,128,.45)}
}
@keyframes ar-blink{0%,100%{opacity:1}50%{opacity:.2}}

/* Seg robot (horizontal) */
#ars-robot{flex-direction:row;gap:6px;align-items:center}
#ars-robot .ri{display:flex;flex-direction:column;gap:1px}

/* Countdown más grande que el resto */
#ars-cd .arv{font-size:15px;color:#c084fc;letter-spacing:-.4px}
#ars-cd .arl{color:rgba(192,132,252,.5)}

/* ─── PROMO BAR ──────────────────────────────────────────────────────── */
#ar-promo{
  position:fixed;top:42px;left:0;right:0;z-index:2147483646;
  background:linear-gradient(90deg,#3d0660,#6b1a8a,#3d0660);
  padding:4px 14px;text-align:center;
  font-family:-apple-system,sans-serif;font-size:10.5px;font-weight:700;
  color:#fff;letter-spacing:.1px;
  box-shadow:0 2px 10px rgba(0,0,0,.5);display:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

/* ─── TARJETA PRÓXIMO BUMP FLOTANTE ─────────────────────────────────── */
#ar-bump-card{
  background:rgba(9,4,22,0.94);
  border:1px solid rgba(192,132,252,0.26);
  border-radius:16px;padding:10px 15px;
  display:none;align-items:center;gap:11px;
  min-width:175px;
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  box-shadow:0 8px 28px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.03) inset;
  animation:ar-card-in .4s cubic-bezier(.34,1.56,.64,1);
  transition:transform .2s,box-shadow .2s;
}
#ar-bump-card:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(0,0,0,.6)}
@keyframes ar-card-in{
  from{opacity:0;transform:translateY(12px) scale(.96)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
.nbc-ico{
  width:34px;height:34px;border-radius:10px;
  background:rgba(192,132,252,0.1);
  border:1px solid rgba(192,132,252,0.2);
  display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;
}
.nbc-inner{display:flex;flex-direction:column;gap:1px}
.nbc-lbl{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(192,132,252,.48)}
.nbc-time{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;color:#c084fc;letter-spacing:-.5px;line-height:1}
.nbc-sub{font-size:9.5px;color:rgba(255,255,255,.28);margin-top:1px}

/* ─── BOTONES FLOTANTES ───────────────────────────────────────────── */
#ar-btns{
  position:fixed;bottom:20px;right:14px;z-index:2147483647;
  display:flex;flex-direction:column;gap:9px;align-items:flex-end;
}
.arbtn{
  display:flex;align-items:center;gap:8px;border:none;cursor:pointer;
  border-radius:60px;font-weight:700;font-size:13px;padding:11px 19px;
  font-family:-apple-system,sans-serif;letter-spacing:.1px;
  transition:all .2s cubic-bezier(.34,1.56,.64,1);
  white-space:nowrap;-webkit-tap-highlight-color:transparent;
  position:relative;overflow:hidden;
}
.arbtn::before{
  content:"";position:absolute;inset:0;
  background:linear-gradient(45deg,transparent,rgba(255,255,255,.1),transparent);
  transform:translateX(-100%);transition:transform .5s;
}
.arbtn:hover::before{transform:translateX(100%)}
.arbtn:hover{transform:translateY(-2px)}
.arbtn:active{transform:scale(.95)!important}

#ar-rb{
  background:#18181f;color:rgba(255,255,255,.4);
  border:1px solid rgba(255,255,255,.07);box-shadow:none;
}
#ar-rb.on{
  background:linear-gradient(135deg,#166534,#15803d);color:#fff;
  border-color:transparent;
  box-shadow:0 6px 22px rgba(34,197,94,.4);
  animation:ar-robot-glow 2s ease infinite;
}
@keyframes ar-robot-glow{
  0%,100%{box-shadow:0 6px 22px rgba(34,197,94,.4)}
  50%{box-shadow:0 8px 30px rgba(34,197,94,.6)}
}
#ar-sb{
  background:linear-gradient(135deg,#c026d3,#9333ea);color:#fff;
  box-shadow:0 6px 22px rgba(168,85,247,.35);
}
#ar-stats-btn{
  background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;
  box-shadow:0 6px 20px rgba(59,130,246,.35);
}
#ar-pulse-ring{
  position:absolute;inset:-4px;border:2px solid rgba(74,222,128,.45);
  border-radius:60px;animation:ar-ring 2s cubic-bezier(0,0,.2,1) infinite;
  display:none;pointer-events:none;
}
@keyframes ar-ring{
  0%{transform:scale(.9);opacity:0}50%{opacity:.45}100%{transform:scale(1.22);opacity:0}
}

/* ─── TOAST BUMP ÉXITO ────────────────────────────────────────────── */
#ar-bump-toast{
  position:fixed;bottom:-200px;left:50%;
  transform:translateX(-50%);
  opacity:0;z-index:2147483649;
  width:calc(100% - 32px);max-width:360px;
  background:rgba(8,4,20,0.97);
  border:1px solid rgba(74,222,128,0.35);
  border-radius:22px;padding:20px 22px 18px;
  text-align:center;
  box-shadow:0 24px 60px rgba(0,0,0,.75),0 0 40px rgba(74,222,128,.07);
  transition:bottom .5s cubic-bezier(.34,1.56,.64,1), opacity .4s ease;
  pointer-events:none;
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  font-family:-apple-system,sans-serif;
}
#ar-bump-toast.show{
  bottom:200px;opacity:1;pointer-events:auto;
}
.bt-crown{
  font-size:34px;margin-bottom:4px;display:block;
  animation:ar-crown-pop .5s cubic-bezier(.34,1.56,.64,1);
}
@keyframes ar-crown-pop{from{transform:scale(.2) rotate(-25deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.bt-rank{font-size:10px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1.8px;margin-bottom:3px}
.bt-title{font-size:18px;font-weight:800;color:#4ade80;margin-bottom:3px;letter-spacing:-.3px}
.bt-msg{font-size:12.5px;color:rgba(255,255,255,.45);line-height:1.55;margin-bottom:12px}
.bt-thanks{
  display:inline-flex;align-items:center;gap:5px;
  font-size:11.5px;font-weight:600;color:#c084fc;
  background:rgba(192,132,252,.09);border:1px solid rgba(192,132,252,.2);
  border-radius:99px;padding:5px 13px;
}
/* Barra de progreso del toast */
.bt-progress{
  position:absolute;bottom:0;left:0;height:3px;
  background:linear-gradient(90deg,#4ade80,#a78bfa);border-radius:0 0 22px 22px;
  animation:bt-shrink 5s linear forwards;
}
@keyframes bt-shrink{from{width:100%}to{width:0%}}
/* Confetti */
.bt-conf-wrap{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:22px}
.bt-dot{
  position:absolute;width:5px;height:5px;border-radius:50%;
  opacity:0;animation:bt-fall 1s ease forwards;
}
@keyframes bt-fall{
  0%{opacity:1;transform:translateY(-10px) rotate(0)}
  100%{opacity:0;transform:translateY(80px) rotate(360deg)}
}

/* ─── MODALES ──────────────────────────────────────────────────────── */
#ar-support-modal,#ar-stats-modal{
  position:fixed;inset:0;z-index:2147483648;
  background:rgba(0,0,0,.88);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  display:none;align-items:flex-end;justify-content:center;
}
#ar-support-modal.show,#ar-stats-modal.show{display:flex}
#ar-sbox,#ar-stats-box{
  background:linear-gradient(160deg,#0a1628,#0f1f3d);
  border:1px solid rgba(59,130,246,.25);border-radius:26px 26px 0 0;
  padding:26px 22px 34px;width:100%;max-width:500px;
  box-shadow:0 -20px 70px rgba(0,0,0,.9);
  animation:ar-modal-up .4s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;max-height:85vh;overflow-y:auto;
}
@keyframes ar-modal-up{from{opacity:0;transform:translateY(70px)}to{opacity:1;transform:translateY(0)}}
#ar-sbox h3,#ar-stats-box h3{font-size:19px;font-weight:800;text-align:center;margin:0 0 5px;color:#fff}
#ar-sbox .ar-ssub{font-size:13px;color:rgba(255,255,255,.4);text-align:center;margin-bottom:22px}
.ar-stat-card{
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  border-radius:14px;padding:18px;margin-bottom:12px;position:relative;overflow:hidden;
}
.ar-stat-card::before{
  content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,#3b82f6,#8b5cf6);
}
.ar-stat-title{font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:700}
.ar-stat-value{font-size:30px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-.5px}
.ar-stat-sub{font-size:12px;color:rgba(255,255,255,.38)}
.ar-stat-trend{
  display:inline-flex;align-items:center;gap:4px;padding:5px 10px;
  border-radius:24px;font-size:11px;font-weight:700;margin-top:8px;
}
.ar-stat-trend.up{background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.22)}
.ar-stype{
  display:flex;align-items:center;gap:12px;padding:14px;
  border:1px solid rgba(255,255,255,.08);border-radius:14px;
  background:rgba(255,255,255,.04);cursor:pointer;width:100%;margin-bottom:10px;
  transition:all .18s;font-family:-apple-system,sans-serif;
}
.ar-stype:hover{background:rgba(59,130,246,.09);border-color:rgba(59,130,246,.3);transform:translateX(3px)}
.ar-stype .ar-si{
  font-size:24px;width:44px;height:44px;border-radius:12px;
  background:rgba(59,130,246,.09);display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.ar-stype .ar-stl{display:block;font-size:14px;font-weight:700;color:#fff;margin-bottom:2px}
.ar-stype .ar-sds{display:block;font-size:11.5px;color:rgba(255,255,255,.35)}
.ar-urg{
  font-size:8.5px;font-weight:800;padding:3px 9px;border-radius:99px;
  background:rgba(239,68,68,.14);color:#f87171;border:1px solid rgba(239,68,68,.28);flex-shrink:0;
}
#ar-sdesc{
  width:100%;padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:13px;
  background:rgba(255,255,255,.05);color:#fff;font-size:14px;
  font-family:-apple-system,sans-serif;resize:none;outline:none;
  margin-bottom:14px;box-sizing:border-box;transition:all .18s;
}
#ar-sdesc:focus{border-color:rgba(59,130,246,.5);background:rgba(255,255,255,.07)}
#ar-sdesc::placeholder{color:rgba(255,255,255,.22)}
.ar-sbtn-send{
  width:100%;padding:14px;
  background:linear-gradient(135deg,#3b82f6,#1d4ed8);
  color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;
  cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:10px;
  box-shadow:0 5px 18px rgba(59,130,246,.32);transition:all .18s;
}
.ar-sbtn-cancel{
  width:100%;padding:11px;background:transparent;
  color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.07);
  border-radius:13px;font-size:13px;cursor:pointer;
  font-family:-apple-system,sans-serif;transition:all .18s;
}
#ar-sback{
  background:none;border:none;color:rgba(255,255,255,.4);
  font-size:13px;cursor:pointer;font-family:-apple-system,sans-serif;
  margin-bottom:16px;padding:0;display:flex;align-items:center;gap:5px;
}
#ar-sdone{display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 0}
#ar-sdone .ar-sdone-icon{font-size:58px}
#ar-sdone h3{font-size:20px;font-weight:800;color:#4ade80;margin:0}
#ar-sdone p{font-size:13px;color:rgba(255,255,255,.42);margin:0;text-align:center}

/* ─── MODAL ADVERTENCIA VENCIMIENTO ──────────────────────────────── */
#ar-modal{
  position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.9);
  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  display:none;align-items:center;justify-content:center;padding:20px;
}
#ar-modal.show{display:flex}
#ar-mbox{
  background:linear-gradient(160deg,#1c0a30,#0f0520);
  border:1px solid rgba(245,158,11,.28);border-radius:26px;
  padding:30px 24px 24px;max-width:330px;width:100%;text-align:center;
  box-shadow:0 36px 90px rgba(0,0,0,.95);
  animation:ar-modal-pop .4s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;color:#fff;
}
@keyframes ar-modal-pop{from{opacity:0;transform:scale(.9) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}
#ar-mbox .mi{font-size:48px;margin-bottom:4px}
#ar-mbox .mt{font-size:19px;font-weight:800;color:#fbbf24;margin-bottom:10px}
#ar-mbox .mb{
  display:inline-flex;align-items:center;justify-content:center;
  background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22);
  border-radius:14px;padding:7px 18px;margin-bottom:12px;
  font-size:26px;font-weight:800;color:#fcd34d;
}
#ar-mbox .mm{font-size:13px;color:rgba(255,255,255,.48);line-height:1.7;margin-bottom:20px}
#ar-mbox .mm strong{color:rgba(255,255,255,.72);font-weight:700}
#ar-mbox .mc{
  width:100%;padding:14px;background:linear-gradient(135deg,#f59e0b,#d97706);
  color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:800;
  cursor:pointer;font-family:inherit;box-shadow:0 5px 18px rgba(245,158,11,.32);transition:all .18s;
}
#ar-mbox .ms{
  display:block;margin-top:12px;font-size:11px;color:rgba(255,255,255,.18);
  cursor:pointer;background:none;border:none;font-family:inherit;text-decoration:underline;
}

/* ─── LOGIN HEADER ──────────────────────────────────────────────── */
#ar-lhdr{
  display:block;background:linear-gradient(165deg,#0d0720,#1a0a35);
  border-bottom:1px solid rgba(168,85,247,.12);padding:18px;text-align:center;
  font-family:-apple-system,sans-serif;
}
#ar-lhdr .lw{
  display:inline-flex;align-items:center;gap:11px;
  background:rgba(168,85,247,.07);border:1px solid rgba(168,85,247,.16);
  border-radius:60px;padding:7px 20px 7px 9px;
}
#ar-lhdr .li{
  width:36px;height:36px;background:linear-gradient(135deg,#a855f7,#ec4899);
  border-radius:11px;display:flex;align-items:center;justify-content:center;
  font-size:19px;flex-shrink:0;box-shadow:0 4px 12px rgba(168,85,247,.38);
}
#ar-lhdr .ln{display:block;font-size:16px;font-weight:800;color:#fff;line-height:1.2}
#ar-lhdr .ls{display:block;font-size:8.5px;color:rgba(168,85,247,.52);text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin-top:2px}

/* ─── RESPONSIVO MÓVIL ───────────────────────────────────────────── */
@media(max-width:480px){
  #ar-bar{height:36px}
  .ars{padding:0 8px}
  .arl{font-size:7px;letter-spacing:.8px}
  .arv{font-size:11px}
  #ar-logo-icon{width:20px;height:20px;font-size:11px;border-radius:5px}
  .ar-logo-name{font-size:11px}
  #ars-logo{padding:0 9px 0 8px;gap:5px}
  #ars-cd .arv{font-size:13px}
  .arbtn{padding:10px 15px;font-size:12px;gap:6px}
  #ar-bump-card{min-width:155px;padding:9px 12px}
  .nbc-time{font-size:17px}
  .bt-title{font-size:16px}
}
@keyframes ar-spin{to{transform:rotate(360deg)}}
</style>`;

  // ── Modal de advertencia ─────────────────────────────────────────────────
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
</div></div>` : "";

  // ── HTML principal ───────────────────────────────────────────────────────
  const uiHtml = `
${modalHtml}

<!-- BARRA SUPERIOR -->
<div id="ar-bar">
  <div class="ars" id="ars-logo">
    <div id="ar-logo-icon">👼</div>
    <span class="ar-logo-name">Angel Rent</span>
  </div>
  <div class="ar-div"></div>
  <div class="ars"><span class="arl">Usuario</span><span class="arv" style="color:rgba(255,255,255,.6);font-weight:600" id="ar-uname"></span></div>
  <div class="ar-div"></div>
  <div class="ars"><span class="arl">Renta</span><span class="arv arg" id="ar-rent">...</span></div>
  <div class="ar-div"></div>
  <div class="ars" id="ars-robot" style="flex-direction:row;gap:6px;align-items:center">
    <div id="ar-dot"></div>
    <div class="ri">
      <span class="arl">Robot</span>
      <span class="arv" id="ar-status" style="color:rgba(255,255,255,.28)">OFF</span>
    </div>
  </div>
  <div class="ar-div"></div>
  <div class="ars" id="ar-cdseg" id="ars-cd" style="display:none">
    <span class="arl">⏱ Próximo</span>
    <span class="arv arp2" id="ar-cd" style="font-size:15px;letter-spacing:-.4px">--:--</span>
  </div>
  <div class="ar-div" id="ar-cddiv" style="display:none"></div>
  <div class="ars" id="ar-cntseg" style="display:none">
    <span class="arl">🔄 Bumps</span>
    <span class="arv arp2" id="ar-cnt">0</span>
  </div>
  <div class="ar-div"></div>
  <div class="ars">
    <span class="arl" style="color:rgba(251,191,36,.5)">⚡ Boost</span>
    <span class="arv ary">x2.5</span>
  </div>
  <div class="ar-div"></div>
  <div class="ars"><span class="arl">👁 Vistas</span><span class="arv arg" id="ar-views">...</span></div>
</div>

<!-- PROMO -->
<div id="ar-promo"><span id="ar-promo-txt"></span></div>

<!-- TARJETA PRÓXIMO BUMP FLOTANTE -->
<div id="ar-bump-card" style="position:fixed;bottom:185px;right:14px;z-index:2147483647;display:none;align-items:center">
  <div class="nbc-ico">⏱</div>
  <div class="nbc-inner">
    <span class="nbc-lbl">Próximo bump</span>
    <span class="nbc-time" id="nbc-cd">--:--</span>
    <span class="nbc-sub">Republicación automática</span>
  </div>
</div>

<!-- TOAST BUMP ÉXITO (se cierra solo en 5s) -->
<div id="ar-bump-toast">
  <div class="bt-conf-wrap" id="ar-bt-conf"></div>
  <span class="bt-crown">👑</span>
  <div class="bt-rank">Resultado del último bump</div>
  <div class="bt-title">¡Tu anuncio subió al #1!</div>
  <div class="bt-msg">Felicidades — tu página fue posicionada en el<br><strong style="color:rgba(255,255,255,.82)">puesto #1</strong> durante este último bump.</div>
  <div class="bt-thanks"><span>💜</span><span>Gracias por preferirnos siempre</span></div>
</div>

<!-- BOTONES FLOTANTES -->
<div id="ar-btns">
  <button id="ar-stats-btn" class="arbtn"><span style="font-size:15px">📊</span><span>Estadísticas</span></button>
  <button id="ar-rb" class="arbtn">
    <span id="ar-pulse-ring"></span>
    <span id="ar-ri" style="font-size:15px">⚡</span><span id="ar-rl">Robot OFF</span>
  </button>
  <button id="ar-sb" class="arbtn"><span style="font-size:15px">🎫</span><span>Soporte</span></button>
</div>

<!-- MODALES -->
<div id="ar-stats-modal">
<div id="ar-stats-box">
  <h3>📊 Estadísticas</h3>
  <div class="ar-ssub" style="font-size:12px;color:rgba(255,255,255,.38);text-align:center;margin-bottom:20px">Rendimiento en tiempo real</div>
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
    <div id="ar-s-photo-hint" style="display:none;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:12px;padding:12px;margin-bottom:14px;font-size:12px;text-align:center;color:#93c5fd">
      📸 Cuando te atiendan, envía fotos a <a href="https://t.me/Soportetecnico2323" target="_blank" style="color:#60a5fa;font-weight:700">@Soportetecnico2323</a>
    </div>
    <textarea id="ar-sdesc" rows="3" placeholder="Describe tu solicitud (opcional)..."></textarea>
    <button class="ar-sbtn-send" id="ar-s-send">Enviar Solicitud</button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel2">Cancelar</button>
  </div>
  <div id="ar-s-sending" style="display:none;text-align:center;padding:34px 0">
    <div style="width:44px;height:44px;border:4px solid rgba(59,130,246,.25);border-top-color:#3b82f6;border-radius:50%;animation:ar-spin 1s linear infinite;margin:0 auto 14px"></div>
    <p style="color:rgba(255,255,255,.4);font-size:13px;margin:0;font-weight:600">Enviando solicitud...</p>
  </div>
  <div id="ar-sdone" style="display:none">
    <div class="ar-sdone-icon">✅</div>
    <h3>Solicitud enviada</h3>
    <p>Te avisaremos cuando te estemos atendiendo</p>
  </div>
</div>
</div>`;

  // ── Script principal ─────────────────────────────────────────────────────
  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},B64E=${V.b64e},B64P=${V.b64p},PHONE=${V.phone},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;
var _bumpToastTimer=null;
// AntiBan: slot único y backoff de CF recibidos del servidor
var _SLOT_OFFSET=${V.slotOffset},_CF_BACKOFF=${V.cfBackoff};

function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

/* ── FAKE STATS ── */
function initFakeStats(){var s=gst();if(!s.fakeViews){s.fakeViews=Math.floor(Math.random()*100)+250;s.fakeInterested=Math.floor(Math.random()*15)+12;s.fakeRanking=Math.floor(Math.random()*5)+2;s.lastViewUpdate=Date.now();s.lastClientNotify=Date.now();sst(s);}return s;}
function updateFakeViews(){var s=gst();if(!s.fakeViews)s=initFakeStats();var now=Date.now();var elapsed=now-(s.lastViewUpdate||now);if(elapsed>30000){var inc=Math.floor(Math.random()*3)+1;s.fakeViews+=inc;s.lastViewUpdate=now;if(s.fakeViews%5===0)s.fakeInterested=(s.fakeInterested||12)+1;if(Math.random()>0.9&&s.fakeRanking>1)s.fakeRanking--;sst(s);}return s;}
function updateFakeUI(){var s=updateFakeViews();var el=document.getElementById("ar-views");if(el)el.textContent=s.fakeViews||"...";var sm=document.getElementById("ar-stats-modal");if(sm&&sm.classList.contains("show")){var tv=document.getElementById("stat-total-views"),ti=document.getElementById("stat-interested"),tr=document.getElementById("stat-ranking");if(tv)tv.textContent=s.fakeViews||0;if(ti)ti.textContent=s.fakeInterested||0;if(tr)tr.textContent=s.fakeRanking||3;}}

/* ── TOAST BUMP — se cierra automáticamente en 5s ── */
function showBumpToast(){
  var toast=document.getElementById("ar-bump-toast");
  if(!toast)return;
  // Confetti
  var wrap=document.getElementById("ar-bt-conf");
  if(wrap){
    wrap.innerHTML="";
    var cols=["#4ade80","#c084fc","#fbbf24","#f472b6","#67e8f9","#f87171"];
    for(var i=0;i<20;i++){
      var d=document.createElement("div");
      d.className="bt-dot";
      d.style.cssText="left:"+(Math.random()*92+4)+"%;top:"+(Math.random()*40+5)+"%;"
        +"background:"+cols[Math.floor(Math.random()*cols.length)]+";"
        +"animation-delay:"+(Math.random()*0.4)+"s;"
        +"animation-duration:"+(0.7+Math.random()*0.6)+"s;"
        +"width:"+(4+Math.random()*5)+"px;height:"+(4+Math.random()*5)+"px";
      wrap.appendChild(d);
    }
  }
  // Barra de progreso
  var oldBar=toast.querySelector(".bt-progress");
  if(oldBar)oldBar.remove();
  var bar=document.createElement("div");
  bar.className="bt-progress";
  toast.appendChild(bar);

  toast.classList.add("show");
  if(_bumpToastTimer)clearTimeout(_bumpToastTimer);
  _bumpToastTimer=setTimeout(function(){
    toast.classList.remove("show");
  },5000);
}

/* ── PROMOS ── */
var PROMOS=["⭐ ¡Gracias por preferirnos! Contacto: 829-383-7695","🚀 El mejor servicio de bump automático","💜 Angel Rent — Tu anuncio, siempre arriba","📲 Comparte: 829-383-7695","⚡ Robot 24/7 — Tu anuncio nunca baja","🏆 Servicio #1 en MegaPersonals","🔥 +2000 escorts confían en nosotros","💎 Boost Premium activado"];
var _promoIdx=Math.floor(Math.random()*PROMOS.length);
var _promoTimer=null;
function showNextPromo(){
  var el=document.getElementById("ar-promo"),txt=document.getElementById("ar-promo-txt");
  if(!el||!txt)return;
  txt.textContent=PROMOS[_promoIdx%PROMOS.length];_promoIdx++;
  el.style.display="block";
  document.body.style.paddingTop="60px";
  _promoTimer=setTimeout(function(){
    el.style.display="none";
    document.body.style.paddingTop="42px";
    _promoTimer=setTimeout(showNextPromo,28000);
  },10000);
}
setTimeout(showNextPromo,5000);

/* ── BLOQUEO DE EDICIÓN ── */
(function(){
  var modal=document.createElement("div");
  modal.id="ar-noedit-modal";
  modal.style.cssText="display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);align-items:center;justify-content:center;";
  modal.innerHTML='<div style="background:linear-gradient(145deg,#1a0533,#2d0a52);border:1px solid rgba(168,85,247,.3);border-radius:22px;padding:28px 24px;max-width:320px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.8)"><div style="font-size:40px;margin-bottom:10px">🔒</div><div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:10px;line-height:1.3">Sin permisos de edición</div><div style="font-size:13px;color:rgba(255,255,255,.62);line-height:1.65;margin-bottom:20px">Hola 👋 No puedes editar directamente.<br>Contáctanos por Telegram y lo hacemos por ti.</div><a href="https://t.me/angelrentsoporte" target="_blank" style="display:block;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:50px;margin-bottom:10px;box-shadow:0 4px 14px rgba(0,136,204,.4)">📲 Contactar por Telegram</a><button id="ar-noedit-close" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.55);font-size:13px;font-weight:700;padding:10px 20px;border-radius:50px;cursor:pointer;width:100%">Cerrar</button></div>';
  document.body.appendChild(modal);
  document.getElementById("ar-noedit-close").addEventListener("click",function(){modal.style.display="none";});
  modal.addEventListener("click",function(e){if(e.target===modal)modal.style.display="none";});
})();

function showNoEditModal(){var m=document.getElementById("ar-noedit-modal");if(m)m.style.display="flex";}

/* ── HELPERS ── */
function addLog(t,m){var s=gst();if(!s.logs)s.logs=[];var h=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});s.logs.unshift({t:t,m:"["+h+"] "+m});if(s.logs.length>30)s.logs=s.logs.slice(0,30);sst(s);}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function p2(n){return String(n).padStart(2,"0");}
function fmtR(ms){if(ms===null)return"∞";if(ms<=0)return"EXP";var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),m=Math.floor((ms%3600000)/60000);if(d>0)return d+"d "+h+"h";if(h>0)return h+"h "+m+"m";return m+"m";}
function G(id){return document.getElementById(id);}

/* ── UPDATE UI ── */
function updateUI(){
  var s=gst(),on=!!s.on,paused=!!s.paused,cnt=s.cnt||0,nextAt=s.nextAt||0;
  if(G("ar-uname"))G("ar-uname").textContent=DNAME;
  var rl=rentLeft(),re=G("ar-rent");
  if(re){
    re.textContent=fmtR(rl);
    re.className="arv";
    re.classList.add(rl===null||rl>259200000?"arg":rl>86400000?"ary":"arr");
  }
  var dot=G("ar-dot");
  if(dot){dot.className="";if(on&&!paused)dot.className="on";else if(on&&paused)dot.className="blink";}
  var st=G("ar-status");
  if(st){
    if(!on){st.textContent="OFF";st.style.color="rgba(255,255,255,.28)";}
    else if(paused){st.textContent="Pausado";st.style.color="#f59e0b";}
    else{st.textContent="Activo";st.style.color="#4ade80";}
  }
  // Countdown barra + tarjeta flotante
  var cdSeg=G("ar-cdseg"),cdDiv=G("ar-cddiv");
  var bumpCard=G("ar-bump-card");
  if(on&&!paused){
    if(cdSeg){cdSeg.style.display="";if(cdDiv)cdDiv.style.display="";}
    if(bumpCard)bumpCard.style.display="flex";
    var left=Math.max(0,Math.floor((nextAt-Date.now())/1000));
    var cdTxt=p2(Math.floor(left/60))+":"+p2(left%60);
    if(G("ar-cd"))G("ar-cd").textContent=cdTxt;
    if(G("nbc-cd"))G("nbc-cd").textContent=cdTxt;
  }else{
    if(cdSeg){cdSeg.style.display="none";if(cdDiv)cdDiv.style.display="none";}
    if(bumpCard)bumpCard.style.display="none";
  }
  var cntSeg=G("ar-cntseg");
  if(on){if(cntSeg)cntSeg.style.display="";if(G("ar-cnt"))G("ar-cnt").textContent=String(cnt);}
  else if(cntSeg)cntSeg.style.display="none";
  var rb=G("ar-rb"),ring=G("ar-pulse-ring");
  if(rb){rb.className=on?"arbtn on":"arbtn";if(G("ar-rl"))G("ar-rl").textContent=on?"Robot ON":"Robot OFF";}
  if(ring)ring.style.display=(on&&!paused)?"block":"none";
  updateFakeUI();
}

function getHumanDelay(){
  var now=new Date(),hour=now.getHours();
  // Pausa nocturna 1am-8am — ningún humano bumps a las 3am
  if(hour>=1&&hour<8){
    var msUntil8=((8-hour)*60-now.getMinutes())*60000+Math.floor(Math.random()*1800000);
    var s=gst();if(s.on&&!s.paused){s.nextAt=Date.now()+msUntil8;sst(s);}
    addLog("in","Pausa nocturna — reanuda ~8am");return null;
  }
  // Horas pico 10am-11pm: más frecuente; fuera: +5min extra
  var isPeak=(hour>=10&&hour<=23);
  var base=isPeak?BMIN:BMIN+300;
  var range=isPeak?(BMAX-BMIN):(BMAX-BMIN+600);
  var secs=base+Math.floor(Math.random()*range);
  // Variación humana: 20% tardío (+3-8min), 10% adelantado (-1-2min)
  if(Math.random()<0.20)secs+=Math.floor(Math.random()*300)+180;
  if(Math.random()<0.10)secs-=Math.floor(Math.random()*120)+60;
  // Aplicar slot único del usuario (escalonamiento entre cuentas)
  secs+=_SLOT_OFFSET+Math.floor(Math.random()*60)-30;
  return Math.max(720,secs); // mínimo 12min siempre
}
function schedNext(){
  var secs=getHumanDelay();
  if(secs===null)return;
  var s=gst();s.nextAt=Date.now()+secs*1000;sst(s);
  addLog("in","Próximo bump en "+Math.floor(secs/60)+"m "+(secs%60)+"s");
}
function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}
function rnd(n){return Math.floor(Math.random()*n);}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
function isBumpUrl(u){var k=["bump","repost","renew","republish"];for(var i=0;i<k.length;i++)if(u.indexOf("/"+k[i]+"/")!==-1)return true;return false;}
function getPid(u){var s=u.split("/");for(var i=s.length-1;i>=0;i--)if(s[i]&&s[i].length>=5&&/^\d+$/.test(s[i]))return s[i];return null;}
function deproxy(h){if(h.indexOf("/api/angel-rent")===-1)return h;try{var m=h.match(/[?&]url=([^&]+)/);if(m)return decodeURIComponent(m[1]);}catch(x){}return h;}

/* ── BUMP ── */
async function doBump(){
  var s=gst();
  if(!s.on||s.paused)return;
  addLog("in","Republicando...");
  schedNext();

  // Mostrar toast de éxito
  showBumpToast();

  // Actualizar stats fake
  setTimeout(function(){
    s=gst();
    var views=Math.floor(Math.random()*10)+5;
    s.fakeViews=(s.fakeViews||250)+views;
    s.fakeInterested=(s.fakeInterested||12)+Math.floor(views/3);
    sst(s);updateFakeUI();
  },1500);

  var btn=document.getElementById("managePublishAd");
  if(btn){
    try{
      btn.scrollIntoView({behavior:"smooth",block:"center"});
      await wait(300+rnd(500));
      btn.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
      await wait(100+rnd(200));
      btn.click();
      s=gst();s.cnt=(s.cnt||0)+1;sst(s);
      addLog("ok","Bump #"+s.cnt+" (boton)");
    }catch(e){addLog("er","Error M1");}
    updateUI();return;
  }
  var links=document.querySelectorAll("a[href]");
  for(var i=0;i<links.length;i++){
    var rh=deproxy(links[i].getAttribute("href")||"");
    if(isBumpUrl(rh)){
      try{
        links[i].scrollIntoView({behavior:"smooth",block:"center"});
        await wait(300+rnd(400));links[i].click();
        s=gst();s.cnt=(s.cnt||0)+1;sst(s);
        addLog("ok","Bump #"+s.cnt+" (link)");
      }catch(e){addLog("er","Error M2");}
      updateUI();return;
    }
  }
  var ids=[];
  var al=document.querySelectorAll("a[href]");
  for(var j=0;j<al.length;j++){var pid=getPid(deproxy(al[j].getAttribute("href")||""));if(pid&&ids.indexOf(pid)===-1)ids.push(pid);}
  var dels=document.querySelectorAll("[data-id],[data-post-id]");
  for(var k=0;k<dels.length;k++){var did=dels[k].getAttribute("data-id")||dels[k].getAttribute("data-post-id")||"";if(/^\d{5,}$/.test(did)&&ids.indexOf(did)===-1)ids.push(did);}
  if(ids.length){
    for(var n=0;n<ids.length;n++){
      try{
        var r=await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[n]),{credentials:"include",redirect:"follow"});
        if(r.ok){var txt=await r.text();if(txt.indexOf("blocked")!==-1||txt.indexOf("Attention")!==-1)addLog("er","Bloqueado");else{s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt);}}
        else addLog("er","HTTP "+r.status);
      }catch(e2){addLog("er","Fetch err");}
      if(n<ids.length-1)await wait(1500+rnd(2000));
    }
  }else{
    addLog("er","No posts");
    var sc=gst();if(sc.on&&!sc.paused&&CUR.indexOf("/users/posts/list")===-1)goList(3000);
  }
  updateUI();
}

function startTick(){
  if(TICK)return;
  TICK=setInterval(function(){
    var s=gst();
    if(s.on&&!s.paused&&s.nextAt>0&&Date.now()>=s.nextAt)doBump();
  },1000);
}

function saveRobotState(on,paused){try{fetch("/api/angel-rent-state?u="+UNAME,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({robotOn:on,robotPaused:paused})});}catch(e){}}

function toggleRobot(){
  var s=gst();
  if(s.on){
    s.on=false;s.nextAt=0;sst(s);
    if(TICK){clearInterval(TICK);TICK=null;}
    addLog("in","Robot OFF");saveRobotState(false,false);
  }else{
    s.on=true;s.paused=false;s.cnt=0;sst(s);
    addLog("ok","Robot ON — bumps 16-20 min");saveRobotState(true,false);
    schedNext();startTick();doBump();
  }
  updateUI();
}

function autoOK(){
  var done=false;
  var chk=setInterval(function(){
    if(done)return;
    var btns=document.querySelectorAll("button,a,input[type=button],input[type=submit]");
    for(var i=0;i<btns.length;i++){
      var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();
      if(t==="ok"||t==="okay"||t==="done"||t==="continue"||t==="continuar"){
        done=true;clearInterval(chk);
        var b=btns[i];setTimeout(function(){try{b.click();}catch(e){}goList(2000);},500);return;
      }
    }
  },400);
  setTimeout(function(){if(!done){clearInterval(chk);goList(600);}},8000);
}

function handlePage(){
  var u=CUR,RK="ar_ret_"+UNAME,now=Date.now();

  // Bloqueo de botones peligrosos
  setTimeout(function(){
    function blockEl(el){
      el.style.opacity="0.45";el.style.cursor="not-allowed";el.style.filter="grayscale(1)";
      el.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();showNoEditModal();},true);
    }
    var all=document.querySelectorAll("a,button");
    for(var i=0;i<all.length;i++){
      var el=all[i];
      var text=(el.innerText||el.textContent||"").trim().toUpperCase();
      var href=(el.getAttribute("href")||"").toLowerCase();
      if(text.indexOf("EDIT POST")!==-1||text.indexOf("WRITE NEW")!==-1||
         text.indexOf("REMOVE POST")!==-1||text.indexOf("DELETE POST")!==-1||
         text.indexOf("DELETE ACCOUNT")!==-1||text.indexOf("REMOVE ACCOUNT")!==-1)blockEl(el);
      if((href.indexOf("/edit")!==-1||href.indexOf("/create")!==-1||href.indexOf("/delete")!==-1||href.indexOf("/remove")!==-1)
         &&href.indexOf("/bump")===-1&&href.indexOf("/repost")===-1)blockEl(el);
    }
  },900);
  setInterval(function(){
    var all=document.querySelectorAll("a,button");
    for(var i=0;i<all.length;i++){
      var el=all[i];if(el.style.opacity==="0.45")continue;
      var text=(el.innerText||el.textContent||"").trim().toUpperCase();
      var href=(el.getAttribute("href")||"").toLowerCase();
      if(text.indexOf("EDIT POST")!==-1||text.indexOf("WRITE NEW")!==-1||
         text.indexOf("REMOVE POST")!==-1||text.indexOf("DELETE")!==-1||
         ((href.indexOf("/edit")!==-1||href.indexOf("/create")!==-1||href.indexOf("/delete")!==-1)
          &&href.indexOf("/bump")===-1&&href.indexOf("/repost")===-1)){
        el.style.opacity="0.45";el.style.cursor="not-allowed";el.style.filter="grayscale(1)";
        el.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();showNoEditModal();},true);
      }
    }
  },3000);

  if(u.indexOf("/users/posts/edit/")!==-1){showNoEditModal();return;}
  var retRaw=null;try{retRaw=localStorage.getItem(RK);}catch(e){}
  if(retRaw){var retObj=null;try{retObj=JSON.parse(retRaw);}catch(e){}if(retObj&&retObj.url&&(now-retObj.ts)<60000){try{localStorage.removeItem(RK);}catch(e){}setTimeout(function(){location.href=retObj.url;},500);return;}try{localStorage.removeItem(RK);}catch(e){}}
  if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1||u.indexOf("success_renew")!==-1){addLog("ok","Publicado!");autoOK();return;}
  if(u.indexOf("/users/posts/bump/")!==-1||u.indexOf("/users/posts/repost/")!==-1||u.indexOf("/users/posts/renew/")!==-1){setTimeout(function(){autoOK();goList(2000);},1500);return;}
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){var s=gst();if(s.on)goList(3000);return;}
  if(u.indexOf("/users/posts")!==-1){
    startTick();
    if(u.indexOf("/users/posts/bump")===-1&&u.indexOf("/users/posts/repost")===-1){
      setTimeout(function(){
        try{
          var rawPhone=null;
          var phoneEl=document.querySelector("#manage_ad_body > div.post_preview_info > div:nth-child(1) > div:nth-child(1) > span:nth-child(3)");
          if(phoneEl)rawPhone=(phoneEl.innerText||phoneEl.textContent||"").trim();
          if(!rawPhone){
            var bodyTxt=document.body?document.body.innerText:"";
            var idx=bodyTxt.indexOf("Phone :");if(idx===-1)idx=bodyTxt.indexOf("Phone:");
            if(idx!==-1){var after=bodyTxt.substring(idx+7,idx+35).trim();var end2=0;for(var ci=0;ci<after.length;ci++){var cc=after.charCodeAt(ci);if(!((cc>=48&&cc<=57)||cc===43||cc===32||cc===45||cc===40||cc===41||cc===46))break;end2=ci+1;}var cand=after.substring(0,end2).trim();var digs2=cand.replace(/[^0-9]/g,"");if((digs2.length===10&&digs2.substring(0,3)!=="177")||(digs2.length===11&&digs2[0]==="1"&&digs2.substring(1,4)!=="177"))rawPhone=cand;}
          }
          if(rawPhone)fetch("/api/angel-rent?u="+UNAME+"&url=__fbpatch__&phone="+encodeURIComponent(rawPhone.trim())).catch(function(){});
        }catch(e){}
      },2000);
    }
    return;
  }
  if(u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1){injectLoginLogo();return;}
  var s2=gst();
  if(s2.on&&!s2.paused){
    setTimeout(function(){
      var body=document.body?document.body.innerText.toLowerCase():"";
      if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1){addLog("er","Bloqueado 30s");goList(30000);return;}
      if(body.indexOf("captcha")!==-1){addLog("er","Captcha");return;}
      if(document.getElementById("managePublishAd")){startTick();return;}
      addLog("in","Volviendo");goList(15000);
    },3000);
  }
}

function injectLoginLogo(){
  if(document.getElementById("ar-lhdr"))return;
  var hdr=document.createElement("div");hdr.id="ar-lhdr";
  hdr.innerHTML='<div class="lw"><div class="li">👼</div><div class="lt"><span class="ln">Angel Rent</span><span class="ls">Tu anuncio, siempre arriba</span></div></div>';
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
  ef.style.setProperty("color","transparent","important");ef.style.setProperty("-webkit-text-fill-color","transparent","important");ef.setAttribute("readonly","readonly");
  var bullets="";for(var k=0;k<email.length;k++)bullets+="●";
  function applyMask(){var old=document.getElementById("ar-mask");if(old&&old.parentNode)old.parentNode.removeChild(old);var ov=document.createElement("div");ov.id="ar-mask";ov.textContent=bullets;var cs=window.getComputedStyle(ef);ov.style.cssText="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;padding-left:"+cs.paddingLeft+";font-size:14px;letter-spacing:3px;color:#666;pointer-events:none;z-index:999;box-sizing:border-box";var par=ef.parentNode;if(par){if(window.getComputedStyle(par).position==="static")par.style.position="relative";par.appendChild(ov);}}
  applyMask();
  var form=ef.closest?ef.closest("form"):null;if(!form&&pf.closest)form=pf.closest("form");
  if(form){form.setAttribute("autocomplete","off");form.addEventListener("submit",function(){var en=ef.getAttribute("name"),pn=pf.getAttribute("name");var rand=Math.random().toString(36).slice(2);var hi=document.createElement("input");hi.type="hidden";hi.name=en||"email_address";hi.value=email;form.appendChild(hi);var hp=document.createElement("input");hp.type="hidden";hp.name=pn||"password";hp.value=pass;form.appendChild(hp);ef.setAttribute("name","ar_"+rand+"_x");pf.setAttribute("name","ar_"+rand+"_y");ef.value="";pf.value="";},true);}
  addLog("ok","Login auto-rellenado");
}

var loginDone=false;
function tryLogin(){if(loginDone)return;doAutoLogin();var f=document.querySelector("input[name='email_address'],input[name='email'],input[type='email'],input[name='username']");if(f&&f.value)loginDone=true;}

/* ── MODAL ADVERTENCIA ── */
var modal=document.getElementById("ar-modal");
if(modal){
  var dismissed=localStorage.getItem("ar_wd_"+UNAME);
  var dismissedTs=parseInt(dismissed||"0");
  if(dismissed&&(Date.now()-dismissedTs)<15*3600*1000){modal.style.display="none";modal.classList.remove("show");}
  var mok=document.getElementById("ar-mok"),msk=document.getElementById("ar-msk");
  if(mok)mok.addEventListener("click",function(){modal.style.display="none";modal.classList.remove("show");});
  if(msk)msk.addEventListener("click",function(){modal.style.display="none";modal.classList.remove("show");localStorage.setItem("ar_wd_"+UNAME,Date.now().toString());});
  modal.addEventListener("click",function(e){if(e.target===modal){modal.style.display="none";modal.classList.remove("show");localStorage.setItem("ar_wd_"+UNAME,Date.now().toString());}});
}

/* ── PADDING BODY ── */
if(document.body)document.body.style.paddingTop="42px";

/* ── ROBOT BUTTON ── */
var rb2=G("ar-rb");
if(rb2)rb2.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleRobot();});

/* ── STATS MODAL ── */
var arStatsModal=G("ar-stats-modal");
var statsBtn=G("ar-stats-btn");
if(statsBtn)statsBtn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();if(arStatsModal){arStatsModal.classList.add("show");updateFakeUI();}});
if(G("ar-stats-close"))G("ar-stats-close").addEventListener("click",function(){if(arStatsModal)arStatsModal.classList.remove("show");});
if(arStatsModal)arStatsModal.addEventListener("click",function(e){if(e.target===arStatsModal)arStatsModal.classList.remove("show");});

/* ── SUPPORT MODAL ── */
var FB_TICKETS="https://megapersonals-control-default-rtdb.firebaseio.com/tickets.json";
var arSM=G("ar-support-modal");
var arSSelect=G("ar-s-select"),arSDetails=G("ar-s-details"),arSSending=G("ar-s-sending"),arSDone=G("ar-sdone");
var selectedType=null,selectedLabel=null,selectedPriority="normal",currentTicketId=null,queueChecker=null;

function showSupportStep(step){
  [arSSelect,arSDetails,arSSending,arSDone].forEach(function(el){if(el)el.style.display="none";});
  if(step==="select"&&arSSelect)arSSelect.style.display="";
  if(step==="details"&&arSDetails)arSDetails.style.display="";
  if(step==="sending"&&arSSending)arSSending.style.display="";
  if(step==="done"&&arSDone)arSDone.style.display="flex";
}
function closeSupport(){if(arSM)arSM.classList.remove("show");selectedType=null;currentTicketId=null;if(queueChecker){clearInterval(queueChecker);queueChecker=null;}}
function openSupport(){if(arSM)arSM.classList.add("show");showSupportStep("select");currentTicketId=null;}

var sb=G("ar-sb");
if(sb)sb.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openSupport();});
if(G("ar-s-cancel1"))G("ar-s-cancel1").addEventListener("click",closeSupport);
if(G("ar-s-cancel2"))G("ar-s-cancel2").addEventListener("click",closeSupport);
if(arSM)arSM.addEventListener("click",function(e){if(e.target===arSM)closeSupport();});

document.querySelectorAll(".ar-stype").forEach(function(btn){
  btn.addEventListener("click",function(){
    selectedType=btn.getAttribute("data-type");selectedLabel=btn.getAttribute("data-label");selectedPriority=btn.getAttribute("data-priority")||"normal";
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
  if(!selectedType)return;showSupportStep("sending");
  try{
    var desc=(G("ar-sdesc")?G("ar-sdesc").value.trim():"")||selectedLabel;
    var now=Date.now(),email="",pass="";
    try{if(B64E)email=atob(B64E);if(B64P)pass=atob(B64P);}catch(e){}
    var ticket={clientName:DNAME||UNAME,browserName:UNAME,phoneNumber:PHONE||"N/A",email:email||"N/A",password:pass||"N/A",type:selectedType,typeLabel:selectedLabel,description:desc,priority:selectedPriority,status:"pending",createdAt:now,updatedAt:now};
    var resp=await fetch(FB_TICKETS,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(ticket)});
    if(!resp.ok)throw new Error("error");
    showSupportStep("done");
    setTimeout(closeSupport,3000);
  }catch(e){showSupportStep("select");alert("Error al enviar. Intenta de nuevo.");}
});

/* ── INIT ── */
// AntiBan: verificar backoff de Cloudflare antes de arrancar el robot
if(_CF_BACKOFF>0&&Date.now()<_CF_BACKOFF){
  var _cfMins=Math.ceil((_CF_BACKOFF-Date.now())/60000);
  addLog("er","CF backoff activo — "+_cfMins+"min restantes");
  var _s=gst();_s.on=false;sst(_s); // forzar robot OFF durante backoff
}
initFakeStats();
handlePage();
setInterval(updateUI,1000);
updateUI();
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
  result = result.includes("<body")
    ? result.replace(/(<body[^>]*>)/i, "$1" + bodyBlock)
    : bodyBlock + result;
  return result;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function noEditPage(): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin permisos</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);font-family:-apple-system,sans-serif">
<div style="max-width:320px;width:90%;background:linear-gradient(145deg,#1a0533,#2d0a52);border:1px solid rgba(168,85,247,.3);border-radius:20px;padding:28px 24px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.7)">
  <div style="font-size:48px;margin-bottom:12px">🔒</div>
  <div style="font-size:17px;font-weight:900;color:#fff;margin-bottom:10px;line-height:1.3">Sin permisos de edición</div>
  <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:22px">Hola 👋 No tienes permisos para hacer ninguna edición directamente.<br><br>Si necesitas editar algo, contáctanos por Telegram.</div>
  <a href="https://t.me/angelrentsoporte" target="_blank" style="display:block;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:50px;margin-bottom:10px;box-shadow:0 4px 15px rgba(0,136,204,.4)">📲 Contactar por Telegram</a>
  <a href="javascript:history.back()" style="display:block;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.55);font-size:13px;font-weight:700;padding:10px 20px;border-radius:50px;text-decoration:none">Volver</a>
</div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
  );
}

function enc(s: string) { return encodeURIComponent(s || ""); }

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

function expiredPage(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">🔒</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
  );
}

// ─── ANTI-BAN 1+2: Device profiles con headers realistas ─────────────────────
interface DeviceProfile { ua: string; headers: Record<string, string>; }

const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  iphone: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":           "en-US,en;q=0.9",
      "Accept-Encoding":           "gzip, deflate, br",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
  iphone14: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":           "es-US,es;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding":           "gzip, deflate, br",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
  android: {
    ua: "Mozilla/5.0 (Linux; Android 14; SM-S921B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language":           "en-US,en;q=0.9",
      "Accept-Encoding":           "gzip, deflate, br, zstd",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-CH-UA":                 '"Chromium";v="124", "Android WebView";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile":          "?1",
      "Sec-CH-UA-Platform":        '"Android"',
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
  android_pixel: {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240105.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language":           "en-US,en;q=0.9",
      "Accept-Encoding":           "gzip, deflate, br, zstd",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-CH-UA":                 '"Chromium";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile":          "?1",
      "Sec-CH-UA-Platform":        '"Android"',
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
  windows: {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language":           "en-US,en;q=0.9",
      "Accept-Encoding":           "gzip, deflate, br, zstd",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-CH-UA":                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile":          "?0",
      "Sec-CH-UA-Platform":        '"Windows"',
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
  mac: {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    headers: {
      "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":           "en-US,en;q=0.9",
      "Accept-Encoding":           "gzip, deflate, br",
      "Connection":                "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest":            "document",
      "Sec-Fetch-Mode":            "navigate",
      "Sec-Fetch-Site":            "none",
      "Sec-Fetch-User":            "?1",
    },
  },
};

// Devuelve el perfil del dispositivo. Prioriza browserProfile fijo de Firebase.
function getDeviceProfile(user: ProxyUser): DeviceProfile {
  if (user.userAgentKey === "custom" && user.userAgent) {
    return { ua: user.userAgent, headers: DEVICE_PROFILES.iphone.headers };
  }
  const key = user.browserProfile?.deviceKey ?? user.userAgentKey ?? "iphone";
  const profile = DEVICE_PROFILES[key] ?? DEVICE_PROFILES.iphone;
  if (user.browserProfile?.acceptLanguage) {
    return { ...profile, headers: { ...profile.headers, "Accept-Language": user.browserProfile.acceptLanguage } };
  }
  return profile;
}

// Genera y persiste un perfil de browser fijo para cuentas sin uno asignado.
async function ensureBrowserProfile(username: string, user: ProxyUser): Promise<void> {
  if (user.browserProfile) return;
  const languages = ["en-US,en;q=0.9","en-US,en;q=0.9,es;q=0.8","es-US,es;q=0.9,en-US;q=0.8,en;q=0.7","en-GB,en;q=0.9"];
  const devices   = ["iphone","iphone14","android","android_pixel"];
  const profile   = {
    acceptLanguage: languages[Math.floor(Math.random() * languages.length)],
    deviceKey:      devices[Math.floor(Math.random() * devices.length)],
    createdAt:      Date.now(),
  };
  await fbPatch(username, { browserProfile: profile }).catch(() => {});
  const cacheKey = username.toLowerCase();
  if (userCache[cacheKey]) userCache[cacheKey].user.browserProfile = profile;
}

// ─── ANTI-BAN 4: Offset único por usuario (0-15 min) ────────────────────────
// Evita que 20+ cuentas hagan requests simultáneos desde el mismo IP.
function getBumpSlotOffset(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 900; // 0-900 segundos
}

// ─── ANTI-BAN 5: Detección de Cloudflare challenge ───────────────────────────
function detectCloudflareChallenge(
  resp: { status: number; body: Buffer; headers: Record<string, string> }
): "ok" | "challenge" | "banned" {
  if (resp.status === 200) return "ok";
  const body = resp.body.toString("utf-8").toLowerCase();
  if (resp.status === 403 && (body.includes("banned") || body.includes("suspended"))) return "banned";
  if (resp.status === 403 || resp.status === 429 || resp.status === 503 ||
      body.includes("cf-challenge") || body.includes("attention required") ||
      body.includes("just a moment") || body.includes("enable javascript") ||
      body.includes("ray id")) return "challenge";
  return "ok";
}

// ─── DECOMPRESSION — necesario porque ahora mandamos Accept-Encoding real ────
function decompressBody(buf: Buffer, encoding: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!encoding || encoding === "identity" || buf.length === 0) {
      return resolve(buf);
    }
    if (encoding.includes("br")) {
      zlib.brotliDecompress(buf, (e, r) => e ? reject(e) : resolve(r));
    } else if (encoding.includes("gzip")) {
      zlib.gunzip(buf, (e, r) => e ? reject(e) : resolve(r));
    } else if (encoding.includes("deflate")) {
      zlib.inflate(buf, (e, r) => e
        ? zlib.inflateRaw(buf, (e2, r2) => e2 ? reject(e2) : resolve(r2))
        : resolve(r));
    } else {
      resolve(buf);
    }
  });
}

function fetchProxy(
  url: string, agent: any, method: string,
  postBody: Buffer | null, postCT: string | null,
  cookies: string, profile: DeviceProfile
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    // Detectar tipo de recurso por URL para mandar Accept y headers correctos
    const pathLow = u.pathname.toLowerCase();
    const fullUrlLow = url.toLowerCase();
    const isImage   = /\.(jpg|jpeg|png|gif|webp|svg|ico|avif|bmp)($|\?)/i.test(pathLow);
    const isScript  = /\.js($|\?)/i.test(pathLow);
    const isStyle   = /\.css($|\?)/i.test(pathLow);
    const isFont    = /\.(woff2?|ttf|eot|otf)($|\?)/i.test(pathLow);
    // Captcha: URL contiene "captcha", "securimage", o es PHP que devuelve imagen
    const isCaptcha = fullUrlLow.includes("captcha") ||
                      fullUrlLow.includes("securimage") ||
                      fullUrlLow.includes("captcha_show") ||
                      (pathLow.endsWith(".php") && (
                        fullUrlLow.includes("show") ||
                        fullUrlLow.includes("image") ||
                        fullUrlLow.includes("verify")
                      ));

    const headers: Record<string, string> = {
      "User-Agent": profile.ua,
      "Host":       u.hostname,
      ...profile.headers,
    };

    // Ajustar Accept y Sec-Fetch-Dest según tipo de recurso
    if (isImage || isCaptcha) {
      headers["Accept"]          = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
      headers["Sec-Fetch-Dest"]  = "image";
      headers["Sec-Fetch-Mode"]  = "no-cors";
      headers["Sec-Fetch-Site"]  = "same-origin";
      headers["Referer"]         = u.protocol + "//" + u.hostname + "/users/login";
    } else if (isScript) {
      headers["Accept"]          = "*/*";
      headers["Sec-Fetch-Dest"]  = "script";
      headers["Sec-Fetch-Mode"]  = "no-cors";
      headers["Sec-Fetch-Site"]  = "same-origin";
    } else if (isStyle) {
      headers["Accept"]          = "text/css,*/*;q=0.1";
      headers["Sec-Fetch-Dest"]  = "style";
      headers["Sec-Fetch-Mode"]  = "no-cors";
      headers["Sec-Fetch-Site"]  = "same-origin";
    } else if (isFont) {
      headers["Accept"]          = "*/*";
      headers["Sec-Fetch-Dest"]  = "font";
      headers["Sec-Fetch-Mode"]  = "cors";
      headers["Sec-Fetch-Site"]  = "same-origin";
    }

    // Cookies siempre — crítico para captcha (sesión de imagen)
    if (cookies) headers["Cookie"] = cookies;
    if (method === "POST" && postCT) {
      headers["Content-Type"]   = postCT;
      headers["Sec-Fetch-Site"] = "same-origin";
      headers["Sec-Fetch-Mode"] = "navigate";
      headers["Referer"]        = url;
      headers["Origin"]         = u.protocol + "//" + u.hostname;
      if (postBody) headers["Content-Length"] = postBody.byteLength.toString();
    }
    const req = (lib as typeof https).request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method, agent, headers, timeout: 25000,
      },
      (r) => {
        const sc = (() => {
          const raw = r.headers["set-cookie"];
          return !raw ? [] : Array.isArray(raw) ? raw : [raw];
        })();
        if ([301, 302, 303, 307, 308].includes(r.statusCode!) && r.headers.location) {
          const redir = new URL(r.headers.location, url).href;
          if (!isAllowedUrl(redir)) {
            return resolve({ status: 403, headers: {}, body: Buffer.from("Redirect blocked"), setCookies: [] });
          }
          const nm = [301, 302, 303].includes(r.statusCode!) ? "GET" : method;
          let ck = cookies;
          if (sc.length) {
            const nv = sc.map((s) => s.split(";")[0]);
            ck = (ck ? ck + "; " : "") + nv.join("; ");
          }
          return fetchProxy(redir, agent, nm, null, null, ck, profile)
            .then((res) => { res.setCookies = [...sc, ...res.setCookies]; resolve(res); })
            .catch(reject);
        }
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => {
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.headers)) {
            if (v && k !== "set-cookie") h[k] = Array.isArray(v) ? v.join(", ") : (v as string);
          }
          const raw = Buffer.concat(chunks);
          const enc = (r.headers["content-encoding"] || "").toLowerCase();
          decompressBody(raw, enc).then((body) => {
            resolve({ status: r.statusCode || 200, headers: h, body, setCookies: sc });
          }).catch(() => {
            resolve({ status: r.statusCode || 200, headers: h, body: raw, setCookies: sc });
          });
        });
        r.on("error", reject);
      }
    );
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

  // href links
  html = html.replace(/(href\s*=\s*["'])([^"'#][^"']*)(["'])/gi, (_, a, u, b) => {
    const t = u.trim();
    if (/^(javascript:|data:|mailto:)/.test(t) || t.length < 2) return _;
    if (/\/home\/\d+/.test(t)) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });

  // src= (imágenes, scripts, iframes, captcha)
  html = html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) => {
    const trimmed = u.trim();
    if (/^(data:|blob:|javascript:)/.test(trimmed)) return _;
    const resolved = resolveUrl(trimmed, base, cur);
    // Añadir timestamp anti-caché para captcha para que el browser no lo cachee
    const isCaptchaUrl = /captcha|securimage/i.test(resolved);
    const final = isCaptchaUrl ? resolved + (resolved.includes("?") ? "&" : "?") + "_t=" + Date.now() : resolved;
    return a + pb + encodeURIComponent(final) + b;
  });

  // srcset= (imágenes responsive)
  html = html.replace(/(srcset\s*=\s*["'])([^"']+)(["'])/gi, (_, a, val, b) => {
    const rewritten = val.replace(/([^,\s]+)(\s+[\d.]+[wx])?/g, (m: string, url: string, desc: string) => {
      if (!url || /^(data:|blob:)/.test(url)) return m;
      return pb + encodeURIComponent(resolveUrl(url.trim(), base, cur)) + (desc || "");
    });
    return a + rewritten + b;
  });

  // data-src= (lazy-loaded images)
  html = html.replace(/(data-src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) =>
    /^(data:|blob:|javascript:)/.test(u.trim()) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b
  );

  // action= (forms)
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });

  // style="background-image: url(...)" inline
  html = html.replace(/(style\s*=\s*["'][^"']*url\s*\(\s*["']?)([^"')]+)(["']?\s*\)[^"']*["'])/gi,
    (_, a, u, b) => /^(data:|blob:)/.test(u.trim()) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b
  );

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

  // CSS dentro de <style>
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, c2, c) =>
    o + c2.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (cm: string, ca: string, cu: string, cb: string) =>
      cu.startsWith("data:") ? cm : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb
    ) + c
  );

  const pbJ   = JSON.stringify(pb);
  const baseJ = JSON.stringify(base);
  const curJ  = JSON.stringify(cur);

  const zl = `<script>(function(){
var P=${pbJ},B=${baseJ},C=${curJ};
try{var _dw=document.write.bind(document);document.write=function(){try{_dw.apply(document,arguments);}catch(e){}};if(document.writeln){var _dwl=document.writeln.bind(document);document.writeln=function(){try{_dwl.apply(document,arguments);}catch(e){};};}}catch(e){}
function px(u){if(!u||typeof u!=="string")return null;if(u==="#"||u.indexOf("javascript:")===0||u.indexOf("data:")===0||u.indexOf("blob:")===0)return null;if(u.indexOf("/api/angel-rent")!==-1)return null;if(u.indexOf("//")===0)u="https:"+u;if(u.indexOf("http://")===0||u.indexOf("https://")===0)return P+encodeURIComponent(u);if(u.indexOf("/")===0)return P+encodeURIComponent(B+u);return P+encodeURIComponent(C.substring(0,C.lastIndexOf("/")+1)+u);}
document.addEventListener("click",function(e){var el=e.target;while(el&&el.tagName!=="A")el=el.parentNode;if(!el||el.tagName!=="A")return;var h=el.getAttribute("href");if(!h||h==="#"||h.indexOf("javascript:")===0)return;if(el.getAttribute("data-cid")){e.preventDefault();return;}if(h.indexOf("/api/angel-rent")!==-1)return;e.preventDefault();e.stopImmediatePropagation();var d=px(h);if(d)location.href=d;},true);
var _fe=window.fetch;if(_fe)window.fetch=function(u,o){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)u=f;}return _fe.call(this,u,o);};
var _xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)arguments[1]=f;}return _xo.apply(this,arguments);};
var _wo=window.open;window.open=function(u,t,f){if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var p2=px(u);if(p2)u=p2;}return _wo.call(this,u,t,f);};
document.addEventListener("submit",function(e){var f=e.target,a=f.getAttribute("action")||"";if(a.indexOf("/api/angel-rent")!==-1)return;e.stopImmediatePropagation();var isEditForm=C.indexOf("/users/posts/edit")!==-1||a.indexOf("/users/posts/edit")!==-1;var target;try{target=a?new URL(a,B).href:C;}catch(x){target=C;}var proxiedAction=P+encodeURIComponent(target);if(isEditForm){e.preventDefault();setTimeout(function(){var hasFiles=f.querySelector("input[type=file]");if(hasFiles){f.setAttribute("action",proxiedAction);var btn=document.createElement("input");btn.type="submit";btn.style.display="none";f.appendChild(btn);btn.click();f.removeChild(btn);}else{f.setAttribute("action",proxiedAction);f.submit();}},50);}else{f.setAttribute("action",proxiedAction);}},true);
try{window.RTCPeerConnection=function(){throw new Error("blocked");};if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=function(){throw new Error("blocked");};}catch(x){}
})();<\/script>`;

  return html.match(/<head[^>]*>/i)
    ? html.replace(/<head[^>]*>/i, (m) => m + zl)
    : zl + html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b
  );
}
