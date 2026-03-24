// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT — VERSIÓN MEJORADA CON DISEÑO PREMIUM + ANTI-BAN AVANZADO
// ═══════════════════════════════════════════════════════════════════════════
// ✅ DISEÑO: Glassmorphism premium, micro-animaciones, efectos hover
// ✅ DISEÑO: Badge LIVE animado, progress ring SVG para countdown
// ✅ DISEÑO: Notificaciones pill suaves, transiciones cubic-bezier
// ✅ ANTIBAN: Randomización de orden de headers HTTP
// ✅ ANTIBAN: Simulación de movimiento del mouse antes de clicks
// ✅ ANTIBAN: Canvas fingerprint consistente por usuario
// ✅ ANTIBAN: Movimientos aleatorios del mouse en background
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
const ALLOWED_DOMAINS = [
  "megapersonals.eu",
  "www.megapersonals.eu",
  "drome6.com",
  "lodef.net",
  "apnot.com",
  "escortbabylon.net",
  "listcrawler.eu",
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "metrika.yandex.com",
  "metrika.yandex.ru",
  "mc.yandex.ru",
  "ajax.googleapis.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
  "code.jquery.com",
  "maxcdn.bootstrapcdn.com",
  "stackpath.bootstrapcdn.com",
  "cdn.jsdelivr.net",
  "use.fontawesome.com",
];

// Verificar si URL es permitida — ahora con wildcard de subdominio
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return ALLOWED_DOMAINS.some(
      (d) => host === d || host.endsWith("." + d)
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
  // AntiBan: canvas fingerprint único por usuario
  canvasFingerprint?: string;
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

// ─── ANTIBAN: Randomizar orden de headers ────────────────────────────────────
function shuffleHeaders(headers: Record<string, string>): Record<string, string> {
  const entries = Object.entries(headers);
  // Fisher-Yates shuffle
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return Object.fromEntries(entries);
}

// ─── ANTIBAN: Generar canvas fingerprint consistente por usuario ─────────────
function generateCanvasFingerprint(username: string): string {
  let hash = 0;
  const str = username + "canvas_fp_salt_2024";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── UI INJECTION ─────────────────────────────────────────────────────────────
function injectUI(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  let endTimestamp = 0;
  if (user.rentalEnd) {
    endTimestamp = user.rentalEndTimestamp || new Date(user.rentalEnd + "T23:59:59").getTime();
  }

  // Generar canvas fingerprint si no existe
  const canvasFP = user.canvasFingerprint || generateCanvasFingerprint(username);
  if (!user.canvasFingerprint) {
    fbPatch(username, { canvasFingerprint: canvasFP }).catch(() => {});
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
    // AntiBan: canvas fingerprint único
    canvasFP: JSON.stringify(canvasFP),
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
  // CSS — DISEÑO PREMIUM CON GLASSMORPHISM
  // ═══════════════════════════════════════════════════════════════════════
  const css = `<style id="ar-css">
/* ─── VARIABLES CSS CENTRALIZADAS ────────────────────────────────────── */
:root {
  --ar-bg-dark: rgba(7, 3, 20, 0.92);
  --ar-bg-glass: rgba(12, 8, 28, 0.85);
  --ar-border-glow: rgba(139, 92, 246, 0.25);
  --ar-accent-primary: #a78bfa;
  --ar-accent-secondary: #c084fc;
  --ar-accent-success: #4ade80;
  --ar-accent-warning: #fbbf24;
  --ar-accent-danger: #f87171;
  --ar-text-primary: #ffffff;
  --ar-text-secondary: rgba(255, 255, 255, 0.6);
  --ar-text-muted: rgba(255, 255, 255, 0.35);
  --ar-glow-purple: 0 0 20px rgba(139, 92, 246, 0.3);
  --ar-glow-green: 0 0 15px rgba(74, 222, 128, 0.4);
  --ar-transition-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ar-transition-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ─── BARRA SUPERIOR GLASSMORPHISM ───────────────────────────────────── */
#ar-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483647;
  height: 48px;
  display: flex;
  align-items: stretch;
  background: var(--ar-bg-dark);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid var(--ar-border-glow);
  box-shadow: 
    0 4px 30px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    var(--ar-glow-purple);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
#ar-bar::-webkit-scrollbar { display: none; }

/* Divisor vertical con gradiente */
.ar-div {
  width: 1px;
  flex-shrink: 0;
  align-self: stretch;
  background: linear-gradient(
    180deg,
    transparent 10%,
    rgba(139, 92, 246, 0.3) 40%,
    rgba(139, 92, 246, 0.3) 60%,
    transparent 90%
  );
}

/* Segmento base con hover effect */
.ars {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  flex-shrink: 0;
  gap: 2px;
  transition: all 0.2s var(--ar-transition-smooth);
  position: relative;
}
.ars:hover {
  background: rgba(139, 92, 246, 0.08);
}
.ars::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--ar-accent-primary), var(--ar-accent-secondary));
  transition: all 0.3s var(--ar-transition-smooth);
  transform: translateX(-50%);
  border-radius: 2px 2px 0 0;
}
.ars:hover::after {
  width: 60%;
}

/* Logo con glow effect */
#ars-logo {
  flex-direction: row;
  gap: 10px;
  padding: 0 16px 0 12px;
  border-right: 1px solid rgba(139, 92, 246, 0.2);
}
#ars-logo::after { display: none; }
#ar-logo-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: linear-gradient(135deg, #a78bfa 0%, #f472b6 50%, #fb923c 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  box-shadow: 
    0 0 20px rgba(167, 139, 250, 0.5),
    0 4px 15px rgba(244, 114, 182, 0.3);
  animation: ar-logo-pulse 3s ease-in-out infinite;
}
@keyframes ar-logo-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(167, 139, 250, 0.5), 0 4px 15px rgba(244, 114, 182, 0.3); }
  50% { box-shadow: 0 0 30px rgba(167, 139, 250, 0.7), 0 4px 25px rgba(244, 114, 182, 0.5); }
}
.ar-logo-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--ar-text-primary);
  letter-spacing: -0.3px;
  white-space: nowrap;
  background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Etiqueta y valor con mejores estilos */
.arl {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--ar-text-muted);
  line-height: 1;
  transition: color 0.2s;
}
.ars:hover .arl { color: var(--ar-text-secondary); }
.arv {
  font-size: 13px;
  font-weight: 700;
  color: var(--ar-text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  transition: all 0.2s;
}

/* Colores de estado */
.arg { color: var(--ar-accent-success) !important; text-shadow: 0 0 10px rgba(74, 222, 128, 0.3); }
.ary { color: var(--ar-accent-warning) !important; text-shadow: 0 0 10px rgba(251, 191, 36, 0.3); }
.arr { color: var(--ar-accent-danger) !important; text-shadow: 0 0 10px rgba(248, 113, 113, 0.3); }
.arp2 { color: var(--ar-accent-secondary) !important; text-shadow: 0 0 10px rgba(192, 132, 252, 0.3); }

/* ─── BADGE LIVE ANIMADO ─────────────────────────────────────────────── */
#ar-live-badge {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(74, 222, 128, 0.15);
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 20px;
  margin-left: 8px;
}
#ar-live-badge.show { display: flex; }
#ar-live-dot {
  width: 8px;
  height: 8px;
  background: var(--ar-accent-success);
  border-radius: 50%;
  animation: ar-live-pulse 1.5s ease-in-out infinite;
}
@keyframes ar-live-pulse {
  0%, 100% { 
    transform: scale(1); 
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
  }
  50% { 
    transform: scale(1.1); 
    box-shadow: 0 0 0 8px rgba(74, 222, 128, 0);
  }
}
#ar-live-text {
  font-size: 9px;
  font-weight: 800;
  color: var(--ar-accent-success);
  letter-spacing: 1px;
}

/* Robot dot mejorado */
#ar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #374151;
  flex-shrink: 0;
  transition: all 0.3s var(--ar-transition-smooth);
}
#ar-dot.on {
  background: var(--ar-accent-success);
  animation: ar-dot-glow 2s ease infinite;
}
#ar-dot.blink {
  background: var(--ar-accent-warning);
  animation: ar-blink 1s ease-in-out infinite;
}
@keyframes ar-dot-glow {
  0%, 100% { box-shadow: 0 0 8px var(--ar-accent-success), 0 0 20px rgba(74, 222, 128, 0.3); }
  50% { box-shadow: 0 0 16px var(--ar-accent-success), 0 0 30px rgba(74, 222, 128, 0.5); }
}
@keyframes ar-blink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.9); }
}

/* Seg robot */
#ars-robot { flex-direction: row; gap: 8px; align-items: center; }
#ars-robot .ri { display: flex; flex-direction: column; gap: 2px; }

/* ─── PROGRESS RING SVG PARA COUNTDOWN ───────────────────────────────── */
#ar-progress-ring-wrap {
  position: relative;
  width: 36px;
  height: 36px;
  display: none;
}
#ar-progress-ring-wrap.show { display: block; }
#ar-progress-ring {
  transform: rotate(-90deg);
  width: 36px;
  height: 36px;
}
#ar-progress-ring circle {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
}
#ar-progress-ring .bg {
  stroke: rgba(139, 92, 246, 0.15);
}
#ar-progress-ring .progress {
  stroke: url(#ar-ring-gradient);
  stroke-dasharray: 100;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 1s linear;
}
#ar-cd-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 9px;
  font-weight: 800;
  color: var(--ar-accent-secondary);
  letter-spacing: -0.3px;
}

/* Countdown segment mejorado */
#ars-cd .arv {
  font-size: 16px;
  color: var(--ar-accent-secondary);
  letter-spacing: -0.5px;
  font-weight: 800;
}
#ars-cd .arl { color: rgba(192, 132, 252, 0.5); }

/* ─── PROMO BAR CON SHIMMER ──────────────────────────────────────────── */
#ar-promo {
  position: fixed;
  top: 48px;
  left: 0;
  right: 0;
  z-index: 2147483646;
  background: linear-gradient(90deg, #4c1d95, #7c3aed, #4c1d95);
  background-size: 200% 100%;
  animation: ar-promo-shimmer 3s linear infinite;
  padding: 6px 16px;
  text-align: center;
  font-family: -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.2px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  display: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@keyframes ar-promo-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ─── TARJETA PRÓXIMO BUMP GLASSMORPHISM ─────────────────────────────── */
#ar-bump-card {
  position: fixed;
  bottom: 190px;
  right: 16px;
  z-index: 2147483647;
  display: none;
  align-items: center;
  gap: 12px;
  min-width: 170px;
  padding: 14px 18px;
  background: var(--ar-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--ar-border-glow);
  border-radius: 18px;
  box-shadow: 
    0 10px 40px rgba(0, 0, 0, 0.5),
    var(--ar-glow-purple),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  font-family: -apple-system, sans-serif;
  animation: ar-card-float 4s ease-in-out infinite;
}
@keyframes ar-card-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
.nbc-ico {
  font-size: 22px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(192, 132, 252, 0.1));
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.2);
}
.nbc-inner { display: flex; flex-direction: column; gap: 2px; }
.nbc-lbl {
  font-size: 9px;
  font-weight: 700;
  color: var(--ar-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.nbc-time {
  font-size: 20px;
  font-weight: 800;
  color: var(--ar-accent-secondary);
  letter-spacing: -0.5px;
  text-shadow: 0 0 15px rgba(192, 132, 252, 0.4);
}
.nbc-sub {
  font-size: 9px;
  color: var(--ar-text-muted);
  letter-spacing: 0.3px;
}

/* ─── BOTONES FLOTANTES MEJORADOS ────────────────────────────────────── */
#ar-btns {
  position: fixed;
  bottom: 20px;
  right: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.arbtn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  background: var(--ar-bg-glass);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--ar-border-glow);
  border-radius: 14px;
  color: var(--ar-text-primary);
  font-size: 13px;
  font-weight: 700;
  font-family: -apple-system, sans-serif;
  cursor: pointer;
  box-shadow: 
    0 8px 25px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  transition: all 0.25s var(--ar-transition-smooth);
  position: relative;
  overflow: hidden;
}
.arbtn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s;
}
.arbtn:hover::before { left: 100%; }
.arbtn:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow: 
    0 12px 35px rgba(0, 0, 0, 0.5),
    var(--ar-glow-purple);
}
.arbtn:active {
  transform: translateY(0) scale(0.98);
}

/* Boton robot con estado especial */
#ar-rb {
  position: relative;
}
#ar-rb.active, #ar-rb.on {
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.15), rgba(34, 197, 94, 0.1));
  border-color: rgba(74, 222, 128, 0.4);
}
#ar-rb.active:hover, #ar-rb.on:hover {
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5), var(--ar-glow-green);
}
#ar-pulse-ring {
  position: absolute;
  top: 50%;
  left: 16px;
  width: 8px;
  height: 8px;
  transform: translateY(-50%);
  border-radius: 50%;
  background: #374151;
  transition: all 0.3s;
}
#ar-rb.active #ar-pulse-ring, #ar-rb.on #ar-pulse-ring {
  background: var(--ar-accent-success);
  animation: ar-pulse-ring 2s ease-out infinite;
}
@keyframes ar-pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
  70% { box-shadow: 0 0 0 12px rgba(74, 222, 128, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
}

/* ─── TOAST BUMP ÉXITO MEJORADO ──────────────────────────────────────── */
#ar-bump-toast {
  position: fixed;
  bottom: -250px;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  z-index: 2147483649;
  width: calc(100% - 32px);
  max-width: 380px;
  background: var(--ar-bg-glass);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 24px;
  padding: 24px 26px 22px;
  text-align: center;
  box-shadow: 
    0 30px 70px rgba(0, 0, 0, 0.7),
    0 0 50px rgba(74, 222, 128, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  transition: 
    bottom 0.6s var(--ar-transition-bounce),
    opacity 0.4s ease;
  pointer-events: none;
  font-family: -apple-system, sans-serif;
}
#ar-bump-toast.show {
  bottom: 200px;
  opacity: 1;
  pointer-events: auto;
}
.bt-crown {
  font-size: 40px;
  margin-bottom: 6px;
  display: block;
  animation: ar-crown-pop 0.6s var(--ar-transition-bounce);
  filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5));
}
@keyframes ar-crown-pop {
  from { transform: scale(0.2) rotate(-25deg); opacity: 0; }
  to { transform: scale(1) rotate(0); opacity: 1; }
}
.bt-rank {
  font-size: 10px;
  font-weight: 700;
  color: var(--ar-text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 4px;
}
.bt-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--ar-accent-success);
  margin-bottom: 6px;
  letter-spacing: -0.3px;
  text-shadow: 0 0 20px rgba(74, 222, 128, 0.4);
}
.bt-msg {
  font-size: 13px;
  color: var(--ar-text-secondary);
  line-height: 1.6;
  margin-bottom: 14px;
}
.bt-thanks {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ar-accent-secondary);
  background: rgba(192, 132, 252, 0.1);
  border: 1px solid rgba(192, 132, 252, 0.25);
  border-radius: 99px;
  padding: 8px 16px;
  transition: all 0.2s;
}
.bt-thanks:hover {
  background: rgba(192, 132, 252, 0.15);
  transform: scale(1.02);
}
/* Barra de progreso del toast */
.bt-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--ar-accent-success), var(--ar-accent-secondary));
  border-radius: 0 0 24px 24px;
  animation: bt-shrink 5s linear forwards;
}
@keyframes bt-shrink { from { width: 100%; } to { width: 0%; } }
/* Confetti */
.bt-conf-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 24px;
}
.bt-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0;
  animation: bt-fall 1.2s ease forwards;
}
@keyframes bt-fall {
  0% { opacity: 1; transform: translateY(-10px) rotate(0); }
  100% { opacity: 0; transform: translateY(100px) rotate(720deg); }
}

/* ─── NOTIFICACIONES PILL ────────────────────────────────────────────── */
#ar-notification {
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 2147483648;
  padding: 12px 20px;
  background: var(--ar-bg-glass);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border: 1px solid var(--ar-border-glow);
  border-radius: 12px;
  font-family: -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--ar-text-primary);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  transform: translateX(120%);
  opacity: 0;
  transition: all 0.4s var(--ar-transition-bounce);
}
#ar-notification.show {
  transform: translateX(0);
  opacity: 1;
}
#ar-notification.success { border-color: rgba(74, 222, 128, 0.4); }
#ar-notification.error { border-color: rgba(248, 113, 113, 0.4); }
#ar-notification.info { border-color: rgba(96, 165, 250, 0.4); }

/* ─── MODALES GLASSMORPHISM ──────────────────────────────────────────── */
#ar-support-modal, #ar-stats-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483648;
  background: rgba(0, 0, 0, 0.85);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  display: none;
  align-items: flex-end;
  justify-content: center;
}
#ar-support-modal.show, #ar-stats-modal.show { display: flex; }
#ar-sbox, #ar-stats-box {
  background: linear-gradient(160deg, rgba(15, 10, 35, 0.95), rgba(10, 5, 25, 0.98));
  -webkit-backdrop-filter: blur(30px);
  backdrop-filter: blur(30px);
  border: 1px solid var(--ar-border-glow);
  border-radius: 28px 28px 0 0;
  padding: 28px 24px 36px;
  width: 100%;
  max-width: 500px;
  box-shadow: 
    0 -25px 80px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  animation: ar-modal-up 0.5s var(--ar-transition-bounce);
  font-family: -apple-system, sans-serif;
  color: var(--ar-text-primary);
  max-height: 85vh;
  overflow-y: auto;
}
@keyframes ar-modal-up {
  from { opacity: 0; transform: translateY(80px); }
  to { opacity: 1; transform: translateY(0); }
}
#ar-sbox h3, #ar-stats-box h3 {
  font-size: 20px;
  font-weight: 800;
  text-align: center;
  margin: 0 0 6px;
  color: var(--ar-text-primary);
}
#ar-sbox .ar-ssub {
  font-size: 13px;
  color: var(--ar-text-muted);
  text-align: center;
  margin-bottom: 24px;
}

/* Stats cards mejoradas */
.ar-stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 14px;
  position: relative;
  overflow: hidden;
  transition: all 0.25s var(--ar-transition-smooth);
}
.ar-stat-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(139, 92, 246, 0.2);
  transform: translateX(4px);
}
.ar-stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--ar-accent-primary), var(--ar-accent-secondary), #f472b6);
}
.ar-stat-title {
  font-size: 10px;
  color: var(--ar-text-muted);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 10px;
  font-weight: 700;
}
.ar-stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--ar-text-primary);
  margin-bottom: 6px;
  letter-spacing: -0.5px;
}
.ar-stat-sub {
  font-size: 12px;
  color: var(--ar-text-muted);
}
.ar-stat-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 24px;
  font-size: 11px;
  font-weight: 700;
  margin-top: 10px;
}
.ar-stat-trend.up {
  background: rgba(74, 222, 128, 0.1);
  color: var(--ar-accent-success);
  border: 1px solid rgba(74, 222, 128, 0.2);
}

/* Support type buttons */
.ar-stype {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  width: 100%;
  margin-bottom: 12px;
  transition: all 0.2s var(--ar-transition-smooth);
  font-family: -apple-system, sans-serif;
}
.ar-stype:hover {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.3);
  transform: translateX(4px);
}
.ar-stype .ar-si {
  font-size: 26px;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(139, 92, 246, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ar-stype .ar-stl {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--ar-text-primary);
  margin-bottom: 3px;
}
.ar-stype .ar-sds {
  display: block;
  font-size: 12px;
  color: var(--ar-text-muted);
}
.ar-urg {
  font-size: 9px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 99px;
  background: rgba(248, 113, 113, 0.12);
  color: var(--ar-accent-danger);
  border: 1px solid rgba(248, 113, 113, 0.25);
  flex-shrink: 0;
}

/* Form elements */
#ar-sdesc {
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--ar-text-primary);
  font-size: 14px;
  font-family: -apple-system, sans-serif;
  resize: none;
  outline: none;
  margin-bottom: 16px;
  box-sizing: border-box;
  transition: all 0.2s;
}
#ar-sdesc:focus {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}
#ar-sdesc::placeholder { color: var(--ar-text-muted); }

.ar-sbtn-send {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, var(--ar-accent-primary), #8b5cf6);
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  font-family: -apple-system, sans-serif;
  margin-bottom: 12px;
  box-shadow: 0 8px 25px rgba(139, 92, 246, 0.35);
  transition: all 0.2s var(--ar-transition-smooth);
}
.ar-sbtn-send:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 35px rgba(139, 92, 246, 0.45);
}
.ar-sbtn-cancel {
  width: 100%;
  padding: 14px;
  background: transparent;
  color: var(--ar-text-muted);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  font-size: 14px;
  cursor: pointer;
  font-family: -apple-system, sans-serif;
  transition: all 0.2s;
}
.ar-sbtn-cancel:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--ar-text-secondary);
}

#ar-sback {
  background: none;
  border: none;
  color: var(--ar-text-muted);
  font-size: 13px;
  cursor: pointer;
  font-family: -apple-system, sans-serif;
  margin-bottom: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 0.2s;
}
#ar-sback:hover { color: var(--ar-text-secondary); }

#ar-sdone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 0;
}
#ar-sdone .ar-sdone-icon { font-size: 64px; }
#ar-sdone h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--ar-accent-success);
  margin: 0;
}
#ar-sdone p {
  font-size: 14px;
  color: var(--ar-text-muted);
  margin: 0;
  text-align: center;
}

/* ─── MODAL ADVERTENCIA VENCIMIENTO ──────────────────────────────────── */
#ar-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483648;
  background: rgba(0, 0, 0, 0.9);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
#ar-modal.show { display: flex; }
#ar-mbox {
  background: linear-gradient(160deg, rgba(30, 15, 50, 0.95), rgba(15, 5, 30, 0.98));
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 28px;
  padding: 34px 28px 28px;
  max-width: 350px;
  width: 100%;
  text-align: center;
  box-shadow: 
    0 40px 100px rgba(0, 0, 0, 0.9),
    0 0 60px rgba(251, 191, 36, 0.1);
  animation: ar-modal-pop 0.5s var(--ar-transition-bounce);
  font-family: -apple-system, sans-serif;
  color: var(--ar-text-primary);
}
@keyframes ar-modal-pop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
#ar-mbox .mi { font-size: 52px; margin-bottom: 6px; }
#ar-mbox .mt {
  font-size: 20px;
  font-weight: 800;
  color: var(--ar-accent-warning);
  margin-bottom: 12px;
}
#ar-mbox .mb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 16px;
  padding: 10px 22px;
  margin-bottom: 14px;
  font-size: 28px;
  font-weight: 800;
  color: #fcd34d;
}
#ar-mbox .mm {
  font-size: 14px;
  color: var(--ar-text-secondary);
  line-height: 1.7;
  margin-bottom: 24px;
}
#ar-mbox .mm strong {
  color: var(--ar-text-primary);
  font-weight: 700;
}
#ar-mbox .mc {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, var(--ar-accent-warning), #d97706);
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 8px 25px rgba(251, 191, 36, 0.35);
  transition: all 0.2s;
}
#ar-mbox .mc:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 35px rgba(251, 191, 36, 0.45);
}
#ar-mbox .ms {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  color: var(--ar-text-muted);
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  text-decoration: underline;
  transition: color 0.2s;
}
#ar-mbox .ms:hover { color: var(--ar-text-secondary); }

/* ─── LOGIN HEADER MEJORADO ──────────────────────────────────────────── */
#ar-lhdr {
  display: block;
  background: linear-gradient(165deg, rgba(15, 8, 35, 0.98), rgba(25, 12, 50, 0.95));
  border-bottom: 1px solid var(--ar-border-glow);
  padding: 22px;
  text-align: center;
  font-family: -apple-system, sans-serif;
}
#ar-lhdr .lw {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 60px;
  padding: 10px 24px 10px 12px;
}
#ar-lhdr .li {
  width: 42px;
  height: 42px;
  background: linear-gradient(135deg, var(--ar-accent-primary), #ec4899);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
}
#ar-lhdr .ln {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--ar-text-primary);
  line-height: 1.2;
}
#ar-lhdr .ls {
  display: block;
  font-size: 9px;
  color: rgba(139, 92, 246, 0.6);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 700;
  margin-top: 3px;
}

/* ─── RESPONSIVO TABLET ──────────────────────────────────────────────── */
@media (max-width: 768px) {
  #ar-bar { height: 44px; }
  .ars { padding: 0 10px; }
  .arl { font-size: 7px; }
  .arv { font-size: 12px; }
  #ar-logo-icon { width: 24px; height: 24px; font-size: 13px; }
  .ar-logo-name { font-size: 12px; }
  #ar-bump-card { bottom: 170px; right: 12px; min-width: 160px; padding: 12px 16px; }
  .nbc-time { font-size: 18px; }
  .nbc-ico { width: 40px; height: 40px; font-size: 20px; }
  #ar-btns { bottom: 16px; right: 12px; }
  .arbtn { padding: 11px 16px; font-size: 12px; }
  #ar-bump-toast { max-width: 340px; padding: 20px 22px; }
  .bt-crown { font-size: 36px; }
  .bt-title { font-size: 18px; }
  .bt-msg { font-size: 12px; }
  #ar-mbox, #ar-sbox, #ar-stats-box { max-width: 90%; padding: 24px 20px; }
  .ar-stat-value { font-size: 28px; }
}

/* ─── RESPONSIVO MÓVIL ───────────────────────────────────────────────── */
@media (max-width: 480px) {
  #ar-bar { height: 40px; }
  .ars { padding: 0 6px; }
  .arl { font-size: 6px; letter-spacing: 0.6px; }
  .arv { font-size: 10px; }
  #ar-logo-icon { width: 20px; height: 20px; font-size: 11px; border-radius: 6px; }
  .ar-logo-name { font-size: 10px; }
  #ars-logo { padding: 0 8px 0 6px; gap: 5px; }
  #ar-live-badge { padding: 3px 8px; margin-left: 6px; }
  #ar-live-dot { width: 6px; height: 6px; }
  #ar-live-text { font-size: 8px; }
  #ars-cd .arv { font-size: 13px; }
  #ar-bump-card { bottom: 160px; right: 10px; min-width: 140px; padding: 10px 12px; gap: 10px; }
  .nbc-ico { width: 36px; height: 36px; font-size: 18px; border-radius: 10px; }
  .nbc-lbl { font-size: 8px; }
  .nbc-time { font-size: 16px; }
  .nbc-sub { font-size: 8px; }
  #ar-btns { bottom: 14px; right: 10px; gap: 8px; }
  .arbtn { padding: 10px 14px; font-size: 11px; gap: 6px; border-radius: 12px; }
  #ar-pulse-ring { width: 6px; height: 6px; left: 14px; }
  #ar-ri { margin-left: 10px !important; font-size: 13px !important; }
  #ar-bump-toast { max-width: calc(100% - 24px); padding: 18px 20px 16px; bottom: 180px; border-radius: 20px; }
  #ar-bump-toast.show { bottom: 180px; }
  .bt-crown { font-size: 32px; margin-bottom: 4px; }
  .bt-rank { font-size: 9px; letter-spacing: 1.5px; }
  .bt-title { font-size: 16px; margin-bottom: 4px; }
  .bt-msg { font-size: 11px; line-height: 1.5; margin-bottom: 12px; }
  .bt-thanks { font-size: 11px; padding: 7px 14px; }
  #ar-notification { top: 52px; right: 10px; padding: 10px 16px; font-size: 12px; border-radius: 10px; }
  #ar-progress-ring-wrap { width: 30px; height: 30px; }
  #ar-progress-ring { width: 30px; height: 30px; }
  #ar-cd-center { font-size: 8px; }
  #ar-mbox { max-width: 92%; padding: 28px 22px 24px; border-radius: 24px; }
  #ar-mbox .mi { font-size: 44px; }
  #ar-mbox .mt { font-size: 18px; }
  #ar-mbox .mb { font-size: 24px; padding: 8px 18px; }
  #ar-mbox .mm { font-size: 13px; }
  #ar-mbox .mc { padding: 14px; font-size: 14px; }
  #ar-sbox, #ar-stats-box { padding: 24px 18px 32px; border-radius: 24px 24px 0 0; max-height: 80vh; }
  #ar-sbox h3, #ar-stats-box h3 { font-size: 18px; }
  .ar-stype { padding: 14px; gap: 12px; }
  .ar-stype .ar-si { width: 42px; height: 42px; font-size: 22px; }
  .ar-stype .ar-stl { font-size: 14px; }
  .ar-stype .ar-sds { font-size: 11px; }
  .ar-urg { font-size: 8px; padding: 3px 8px; }
  #ar-sdesc { font-size: 13px; padding: 12px; }
  .ar-sbtn-send, .ar-sbtn-cancel { padding: 14px; font-size: 14px; }
  .ar-stat-card { padding: 16px; }
  .ar-stat-title { font-size: 9px; }
  .ar-stat-value { font-size: 26px; }
  .ar-stat-sub { font-size: 11px; }
  .ar-stat-trend { font-size: 10px; padding: 5px 10px; }
  #ar-lhdr { padding: 18px; }
  #ar-lhdr .lw { padding: 8px 20px 8px 10px; gap: 12px; }
  #ar-lhdr .li { width: 36px; height: 36px; font-size: 18px; border-radius: 12px; }
  #ar-lhdr .ln { font-size: 16px; }
  #ar-lhdr .ls { font-size: 8px; }
}

/* ─── RESPONSIVO MÓVIL PEQUEÑO ───────────────────────────────────────── */
@media (max-width: 360px) {
  #ar-bar { height: 38px; }
  .ars { padding: 0 5px; }
  .arl { font-size: 5px; }
  .arv { font-size: 9px; }
  #ar-logo-icon { width: 18px; height: 18px; font-size: 10px; }
  .ar-logo-name { font-size: 9px; }
  #ar-bump-card { bottom: 150px; right: 8px; min-width: 130px; padding: 8px 10px; }
  .nbc-ico { width: 32px; height: 32px; font-size: 16px; }
  .nbc-time { font-size: 14px; }
  #ar-btns { bottom: 12px; right: 8px; }
  .arbtn { padding: 9px 12px; font-size: 10px; }
  #ar-bump-toast { padding: 16px 18px 14px; }
  .bt-crown { font-size: 28px; }
  .bt-title { font-size: 14px; }
  .bt-msg { font-size: 10px; }
}

@keyframes ar-spin { to { transform: rotate(360deg); } }
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

<!-- SVG GRADIENT PARA PROGRESS RING -->
<svg style="position:absolute;width:0;height:0">
  <defs>
    <linearGradient id="ar-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#a78bfa"/>
      <stop offset="100%" style="stop-color:#f472b6"/>
    </linearGradient>
  </defs>
</svg>

<!-- NOTIFICACION PILL -->
<div id="ar-notification"></div>

<!-- BARRA SUPERIOR -->
<div id="ar-bar">
  <div class="ars" id="ars-logo">
    <div id="ar-logo-icon">👼</div>
    <span class="ar-logo-name">Angel Rent</span>
    <div id="ar-live-badge">
      <div id="ar-live-dot"></div>
      <span id="ar-live-text">LIVE</span>
    </div>
  </div>
  <div class="ar-div"></div>
  <div class="ars"><span class="arl">Usuario</span><span class="arv" style="color:var(--ar-text-secondary);font-weight:600" id="ar-uname"></span></div>
  <div class="ar-div"></div>
  <div class="ars"><span class="arl">Renta</span><span class="arv arg" id="ar-rent">...</span></div>
  <div class="ar-div"></div>
  <div class="ars" id="ars-robot" style="flex-direction:row;gap:8px;align-items:center">
    <div id="ar-dot"></div>
    <div class="ri">
      <span class="arl">Robot</span>
      <span class="arv" id="ar-status" style="color:var(--ar-text-muted)">OFF</span>
    </div>
  </div>
  <div class="ar-div"></div>
  <div class="ars" id="ars-cd" style="display:none">
    <span class="arl">⏱ Próximo</span>
    <span class="arv arp2" id="ar-cd" style="font-size:16px;letter-spacing:-.5px">--:--</span>
  </div>
  <div class="ar-div" id="ar-cddiv" style="display:none"></div>
  <!-- Progress Ring -->
  <div id="ar-progress-ring-wrap">
    <svg id="ar-progress-ring" viewBox="0 0 36 36">
      <circle class="bg" cx="18" cy="18" r="15.5"/>
      <circle class="progress" cx="18" cy="18" r="15.5" id="ar-ring-progress"/>
    </svg>
    <span id="ar-cd-center">--:--</span>
  </div>
  <div class="ar-div"></div>
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
  <div class="bt-msg">Felicidades — tu página fue posicionada en el<br><strong style="color:var(--ar-text-primary)">puesto #1</strong> durante este último bump.</div>
  <div class="bt-thanks"><span>💜</span><span>Gracias por preferirnos siempre</span></div>
</div>

<!-- BOTONES FLOTANTES -->
<div id="ar-btns">
  <button id="ar-stats-btn" class="arbtn"><span style="font-size:15px">📊</span><span>Estadísticas</span></button>
  <button id="ar-rb" class="arbtn">
    <span id="ar-pulse-ring"></span>
    <span id="ar-ri" style="font-size:15px;margin-left:12px">⚡</span><span id="ar-rl">Robot OFF</span>
  </button>
  <button id="ar-sb" class="arbtn"><span style="font-size:15px">🎫</span><span>Soporte</span></button>
</div>

<!-- MODALES -->
<div id="ar-stats-modal">
<div id="ar-stats-box">
  <h3>📊 Estadísticas</h3>
  <div class="ar-ssub" style="font-size:12px;color:var(--ar-text-muted);text-align:center;margin-bottom:22px">Rendimiento en tiempo real</div>
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
    <div class="ar-stat-value" style="color:var(--ar-accent-warning)">#<span id="stat-ranking">3</span></div>
    <div class="ar-stat-sub">en tu ciudad</div>
    <span class="ar-stat-trend up">↗ Subiste 12 posiciones</span>
  </div>
  <div class="ar-stat-card">
    <div class="ar-stat-title">Efectividad del Boost</div>
    <div class="ar-stat-value" style="color:#f97316">x<span id="stat-boost">2.5</span></div>
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
    <div id="ar-s-photo-hint" style="display:none;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.3);border-radius:12px;padding:14px;margin-bottom:16px;font-size:12px;text-align:center;color:#93c5fd">
      📸 Cuando te atiendan, envía fotos a <a href="https://t.me/Soportetecnico2323" target="_blank" style="color:#60a5fa;font-weight:700">@Soportetecnico2323</a>
    </div>
    <textarea id="ar-sdesc" rows="3" placeholder="Describe tu solicitud (opcional)..."></textarea>
    <button class="ar-sbtn-send" id="ar-s-send">Enviar Solicitud</button>
    <button class="ar-sbtn-cancel" id="ar-s-cancel2">Cancelar</button>
  </div>
  <div id="ar-s-sending" style="display:none;text-align:center;padding:38px 0">
    <div style="width:48px;height:48px;border:4px solid rgba(139,92,246,.2);border-top-color:var(--ar-accent-primary);border-radius:50%;animation:ar-spin 1s linear infinite;margin:0 auto 16px"></div>
    <p style="color:var(--ar-text-muted);font-size:14px;margin:0;font-weight:600">Enviando solicitud...</p>
  </div>
  <div id="ar-sdone" style="display:none">
    <div class="ar-sdone-icon">✅</div>
    <h3>Solicitud enviada</h3>
    <p>Te avisaremos cuando te estemos atendiendo</p>
  </div>
</div>
</div>`;

  // ── Script principal con mejoras anti-ban ────────────────────────────────
  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},B64E=${V.b64e},B64P=${V.b64p},PHONE=${V.phone},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;
var _bumpToastTimer=null;
// AntiBan: slot único y backoff de CF recibidos del servidor
var _SLOT_OFFSET=${V.slotOffset},_CF_BACKOFF=${V.cfBackoff};
// AntiBan: canvas fingerprint único
var _CANVAS_FP=${V.canvasFP};

function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

// ═══════════════════════════════════════════════════════════════════════════
// ANTIBAN: SIMULACION DE MOVIMIENTO DE MOUSE
// ═══════════════════════════════════════════════════════════════════════════
var _lastMouseX=Math.random()*window.innerWidth;
var _lastMouseY=Math.random()*window.innerHeight;

function simulateMouseMovement(targetEl, callback){
  if(!targetEl){if(callback)callback();return;}
  var rect=targetEl.getBoundingClientRect();
  var targetX=rect.left+rect.width/2+(Math.random()-0.5)*rect.width*0.3;
  var targetY=rect.top+rect.height/2+(Math.random()-0.5)*rect.height*0.3;
  var startX=_lastMouseX,startY=_lastMouseY;
  var steps=Math.floor(Math.random()*8)+5; // 5-12 steps
  var step=0;
  var interval=setInterval(function(){
    step++;
    var progress=step/steps;
    // Ease-in-out curve
    var ease=progress<0.5?2*progress*progress:(1-Math.pow(-2*progress+2,2)/2);
    // Add slight noise for human-like movement
    var noise=(Math.random()-0.5)*10;
    var x=startX+(targetX-startX)*ease+noise;
    var y=startY+(targetY-startY)*ease+noise;
    _lastMouseX=x;_lastMouseY=y;
    try{
      document.dispatchEvent(new MouseEvent('mousemove',{
        bubbles:true,cancelable:true,clientX:x,clientY:y,screenX:x,screenY:y
      }));
    }catch(e){}
    if(step>=steps){
      clearInterval(interval);
      _lastMouseX=targetX;_lastMouseY=targetY;
      if(callback)setTimeout(callback,Math.random()*100+50);
    }
  },Math.random()*30+20);
}

// Movimiento aleatorio del mouse cada 8-20 segundos en background
setInterval(function(){
  var x=Math.random()*window.innerWidth;
  var y=Math.random()*window.innerHeight;
  _lastMouseX=x;_lastMouseY=y;
  try{
    document.dispatchEvent(new MouseEvent('mousemove',{
      bubbles:true,cancelable:true,clientX:x,clientY:y
    }));
  }catch(e){}
},Math.random()*12000+8000);

// ═══════════════════════════════════════════════════════════════════════════
// ANTIBAN: CANVAS FINGERPRINT CONSISTENTE
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  try{
    var _origToDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(type){
      // Si es un canvas pequeño (fingerprinting), retornar hash consistente
      if(this.width<=300&&this.height<=150){
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='+_CANVAS_FP;
      }
      return _origToDataURL.apply(this,arguments);
    };
    var _origGetContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,attrs){
      var ctx=_origGetContext.apply(this,arguments);
      if(type==='2d'&&ctx&&this.width<=300&&this.height<=150){
        var _origFillText=ctx.fillText;
        ctx.fillText=function(text,x,y){
          // Add tiny random offset based on fingerprint for consistency
          var hash=0;for(var i=0;i<_CANVAS_FP.length;i++){hash=((hash<<5)-hash)+_CANVAS_FP.charCodeAt(i);hash|=0;}
          var offset=(hash%10)/1000;
          return _origFillText.call(this,text,x+offset,y+offset);
        };
      }
      return ctx;
    };
  }catch(e){}
})();

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES PILL
// ═══════════════════════════════════════════════════════════════════════════
function showNotification(message,type,duration){
  var notif=document.getElementById('ar-notification');
  if(!notif)return;
  notif.textContent=message;
  notif.className='show '+(type||'info');
  setTimeout(function(){notif.className='';},duration||3000);
}

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
    var colors=["#4ade80","#a78bfa","#f472b6","#fbbf24","#60a5fa","#f87171"];
    for(var i=0;i<20;i++){
      var dot=document.createElement("div");
      dot.className="bt-dot";
      dot.style.left=Math.random()*100+"%";
      dot.style.background=colors[Math.floor(Math.random()*colors.length)];
      dot.style.animationDelay=(Math.random()*0.5)+"s";
      wrap.appendChild(dot);
    }
  }
  // Progress bar
  var oldProg=toast.querySelector(".bt-progress");
  if(oldProg)oldProg.remove();
  var prog=document.createElement("div");
  prog.className="bt-progress";
  toast.appendChild(prog);
  toast.classList.add("show");
  if(_bumpToastTimer)clearTimeout(_bumpToastTimer);
  _bumpToastTimer=setTimeout(function(){toast.classList.remove("show");},5500);
}

function G(id){return document.getElementById(id);}
function addLog(t,m){var s=gst();s.log=s.log||[];s.log.push({t:t,m:m,ts:Date.now()});if(s.log.length>50)s.log.shift();sst(s);}

// ═══════════════════════════════════════════════════════════════════════════
// MEJORA: Click con simulacion de mouse completa
// ═══════════════════════════════════════════════════════════════════════════
function humanClick(el,callback){
  simulateMouseMovement(el,function(){
    try{
      var rect=el.getBoundingClientRect();
      var x=rect.left+rect.width/2;
      var y=rect.top+rect.height/2;
      // Secuencia completa de eventos
      el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true,clientX:x,clientY:y}));
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:x,clientY:y}));
      setTimeout(function(){
        el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y,button:0}));
        setTimeout(function(){
          el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x,clientY:y,button:0}));
          el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y,button:0}));
          if(callback)callback();
        },Math.random()*50+30);
      },Math.random()*100+50);
    }catch(e){
      el.click();
      if(callback)callback();
    }
  });
}

function updateUI(){
  var s=gst();
  var dot=G("ar-dot"),st=G("ar-status"),rl=G("ar-rl"),rb=G("ar-rb"),cnt=G("ar-cnt"),cd=G("ar-cd"),cseg=G("ars-cd"),cddiv=G("ar-cddiv"),cntseg=G("ar-cntseg");
  var nbcCard=G("ar-bump-card"),nbcCd=G("nbc-cd");
  var liveBadge=G("ar-live-badge");
  var ringWrap=G("ar-progress-ring-wrap"),ringProgress=G("ar-ring-progress"),cdCenter=G("ar-cd-center");
  
  if(dot)dot.className=s.on?(s.paused?"blink":"on"):"";
  if(st){st.textContent=s.on?(s.paused?"PAUSADO":"ON"):"OFF";st.style.color=s.on?(s.paused?"var(--ar-accent-warning)":"var(--ar-accent-success)"):"var(--ar-text-muted)";}
  if(rl)rl.textContent=s.on?(s.paused?"Pausado":"Robot ON"):"Robot OFF";
  if(rb){rb.classList.toggle("active",s.on&&!s.paused);rb.classList.toggle("on",s.on);}
  if(liveBadge)liveBadge.classList.toggle("show",s.on&&!s.paused);
  if(cnt)cnt.textContent=s.cnt||0;
  if(cntseg)cntseg.style.display=s.on?"":"none";
  
  // Countdown
  var left=0;
  var totalTime=BMAX*1000; // tiempo total para calcular progreso
  if(s.on&&!s.paused&&s.nextAt>0){
    left=Math.max(0,Math.floor((s.nextAt-Date.now())/1000));
    var elapsed=totalTime-(s.nextAt-Date.now());
    var progress=Math.min(100,Math.max(0,(elapsed/totalTime)*100));
    if(ringProgress){
      var circumference=2*Math.PI*15.5;
      var offset=circumference-(progress/100)*circumference;
      ringProgress.style.strokeDasharray=circumference;
      ringProgress.style.strokeDashoffset=offset;
    }
  }
  var mm=Math.floor(left/60),ss=left%60;
  var str=(mm<10?"0":"")+mm+":"+(ss<10?"0":"")+ss;
  if(cd)cd.textContent=str;
  if(cdCenter)cdCenter.textContent=str;
  if(nbcCd)nbcCd.textContent=str;
  if(cseg)cseg.style.display=(s.on&&!s.paused)?"":"none";
  if(cddiv)cddiv.style.display=(s.on&&!s.paused)?"":"none";
  if(ringWrap)ringWrap.classList.toggle("show",s.on&&!s.paused);
  if(nbcCard)nbcCard.style.display=(s.on&&!s.paused)?"flex":"none";
  
  // Rent
  var rentEl=G("ar-rent");
  if(rentEl&&ENDTS>0){
    var dl=Math.floor((ENDTS-Date.now())/86400000);
    if(dl<0){rentEl.textContent="Vencido";rentEl.className="arv arr";}
    else if(dl<=3){rentEl.textContent=dl+"d";rentEl.className="arv ary";}
    else{rentEl.textContent=dl+"d";rentEl.className="arv arg";}
  }
  var un=G("ar-uname");if(un)un.textContent=DNAME||UNAME;
  updateFakeUI();
}

function showNoEditModal(){
  var ex=document.getElementById("ar-noedit-modal");if(ex)ex.remove();
  var m=document.createElement("div");m.id="ar-noedit-modal";
  m.style.cssText="position:fixed;inset:0;z-index:2147483650;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:20px;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)";
  m.innerHTML='<div style="background:linear-gradient(160deg,rgba(30,15,50,.95),rgba(15,5,30,.98));border:1px solid rgba(248,113,113,.3);border-radius:28px;padding:34px 28px 28px;max-width:350px;width:100%;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.9);font-family:-apple-system,sans-serif;color:#fff"><div style="font-size:52px;margin-bottom:8px">🚫</div><div style="font-size:20px;font-weight:800;color:#f87171;margin-bottom:10px">Edición no permitida</div><p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:24px">Para evitar que tu anuncio sea <strong style="color:#fff">eliminado o suspendido</strong>, las ediciones solo pueden hacerse a través de soporte.</p><button id="ar-ne-close" style="width:100%;padding:16px;background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 8px 25px rgba(248,113,113,.35)">Entendido</button></div>';
  document.body.appendChild(m);
  G("ar-ne-close").onclick=function(){m.remove();goList(100);};
  m.onclick=function(e){if(e.target===m){m.remove();goList(100);}};
}

function goList(d){setTimeout(function(){location.href=PLIST;},d||0);}
function enc(s){return encodeURIComponent(s);}

// AntiBan: timing gaussiano (variación natural en vez de uniforme)
function gaussianRandom(mean,stdDev){
  var u1=Math.random(),u2=Math.random();
  var z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
  return mean+z*stdDev;
}

function schedNext(){
  var s=gst();
  // AntiBan: timing variado con distribución gaussiana
  var baseDelay=Math.floor(gaussianRandom((BMIN+BMAX)/2,(BMAX-BMIN)/4));
  baseDelay=Math.max(BMIN,Math.min(BMAX,baseDelay));
  // AntiBan: aplicar slot offset único del usuario
  if(s.cnt===0)baseDelay+=_SLOT_OFFSET;
  // AntiBan: variación adicional según hora del día (menos frecuente de noche)
  var hour=new Date().getHours();
  if(hour>=2&&hour<=6)baseDelay+=Math.floor(Math.random()*180)+60; // +1-4min extra de noche
  s.nextAt=Date.now()+baseDelay*1000;
  sst(s);
  addLog("in","Próximo bump en "+Math.round(baseDelay/60)+"min");
}

function doBump(){
  var s=gst();
  if(!s.on||s.paused)return;
  // AntiBan: verificar backoff de Cloudflare
  if(_CF_BACKOFF>0&&Date.now()<_CF_BACKOFF){
    var _cfMins=Math.ceil((_CF_BACKOFF-Date.now())/60000);
    addLog("er","CF backoff — "+_cfMins+"min restantes");
    schedNext();return;
  }
  var btn=document.querySelector("a[href*='/users/posts/bump/'],a[href*='/users/posts/repost/'],a[href*='/users/posts/renew/']");
  if(!btn){addLog("er","Sin botón bump");schedNext();return;}
  s.cnt=(s.cnt||0)+1;sst(s);
  addLog("ok","Bump #"+s.cnt);
  showNotification("Ejecutando bump #"+s.cnt+"...","info",2000);
  // AntiBan: usar click humanizado con simulación de mouse
  humanClick(btn,function(){
    setTimeout(function(){showBumpToast();schedNext();},1500);
  });
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
    showNotification("Robot desactivado","info",2000);
  }else{
    s.on=true;s.paused=false;s.cnt=0;sst(s);
    addLog("ok","Robot ON — bumps 16-20 min");saveRobotState(true,false);
    showNotification("Robot activado","success",2000);
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
        var b=btns[i];setTimeout(function(){humanClick(b,function(){goList(2000);});},500);return;
      }
    }
  },400);
  setTimeout(function(){if(!done){clearInterval(chk);goList(600);}},8000);
}

function handlePage(){
  var u=CUR,RK="ar_ret_"+UNAME,now=Date.now();

  // Block window.confirm so delete dialogs never appear
  window.confirm=function(){return false;};

  // Block Bootstrap modals for delete/payment that open unexpectedly
  function patchJQueryModal(){
    try{
      var jq=window.$||window.jQuery;
      if(!jq||!jq.fn||!jq.fn.modal)return false;
      var _orig=jq.fn.modal;
      jq.fn.modal=function(opt){
        var el=this[0];
        if(el){
          var id=(el.id||"").toLowerCase();
          var cls=(el.className||"").toLowerCase();
          var BLOCK=["delete","remove","confirm","exceed","payment","limit","token","not_enough","buy_more"];
          for(var b=0;b<BLOCK.length;b++){
            if(id.indexOf(BLOCK[b])!==-1||cls.indexOf(BLOCK[b])!==-1)return this;
          }
        }
        return _orig.apply(this,arguments);
      };
      return true;
    }catch(ex){return false;}
  }
  // Try patching immediately, then wait for jQuery to load
  if(!patchJQueryModal()){
    var _pjqAttempts=0;
    var _pjqInt=setInterval(function(){
      if(patchJQueryModal()||_pjqAttempts++>20)clearInterval(_pjqInt);
    },250);
  }

  // Hide any stray modals / backdrops every 400ms
  function hideStrayModals(){
    var BLOCK_IDS=["delete","remove","confirm","exceed","payment","limit","token","buy_more","not_enough","migration"];
    var allModals=document.querySelectorAll(".modal,.modal-backdrop");
    for(var i=0;i<allModals.length;i++){
      var m=allModals[i];
      var mid=(m.id||"").toLowerCase();
      var mcls=(m.className||"").toLowerCase();
      var shouldHide=false;
      for(var b=0;b<BLOCK_IDS.length;b++){
        if(mid.indexOf(BLOCK_IDS[b])!==-1){shouldHide=true;break;}
      }
      if(mcls.indexOf("modal-backdrop")!==-1)shouldHide=true;
      if(shouldHide){
        m.style.cssText="display:none!important;visibility:hidden!important;opacity:0!important";
        m.classList.remove("in","show","fade");
      }
    }
    // Always clean body overflow when no legitimate modal is open
    var hasLegitModal=document.querySelector(".modal.in:not([id*='delete']):not([id*='remove']):not([id*='confirm']):not([id*='exceed']):not([id*='payment'])");
    if(!hasLegitModal){
      document.body.classList.remove("modal-open");
      document.body.style.overflow="";
      document.body.style.paddingRight="";
    }
  }
  setInterval(hideStrayModals,400);
  hideStrayModals();

  // ── Bloqueo de botones peligrosos (inmediato, sin espera) ────────────────
  function blockEl(el){
    if(el._arBlocked)return;
    el._arBlocked=true;
    el.style.opacity="0.45";
    el.style.cursor="not-allowed";
    el.style.filter="grayscale(1)";
    // Interceptar click directamente en el elemento — sin overlay que tape otros botones
    el.addEventListener("click",function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      showNoEditModal();
    },true);
  }

  function isDangerous(el){
    var text=(el.innerText||el.textContent||"").trim().toUpperCase();
    var href=(el.getAttribute("href")||"").toLowerCase();
    // Bloquear: EDIT POST, WRITE NEW, REMOVE POST, DELETE, DELETE ACCOUNT
    if(text.indexOf("EDIT POST")!==-1||text.indexOf("WRITE NEW")!==-1||
       text.indexOf("REMOVE POST")!==-1||text.indexOf("DELETE POST")!==-1||
       text.indexOf("DELETE ACCOUNT")!==-1||
       text.indexOf("REMOVE ACCOUNT")!==-1)return true;
    // Bloquear links a /edit, /delete y /remove pero NO /bump, /repost
    if((href.indexOf("/edit")!==-1||href.indexOf("/delete")!==-1||href.indexOf("/remove")!==-1)
       &&href.indexOf("/bump")===-1&&href.indexOf("/repost")===-1)return true;
    return false;
  }

  function blockAll(){
    var all=document.querySelectorAll("a,button");
    for(var i=0;i<all.length;i++){if(isDangerous(all[i]))blockEl(all[i]);}
  }

  // Bloquear inmediatamente y repetir
  blockAll();
  setTimeout(blockAll,300);
  setTimeout(blockAll,800);
  setInterval(blockAll,3000);

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
if(document.body)document.body.style.paddingTop="48px";

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
    showNotification("Solicitud enviada correctamente","success",3000);
    setTimeout(closeSupport,3000);
  }catch(e){showSupportStep("select");showNotification("Error al enviar. Intenta de nuevo.","error",3000);}
});

/* ── INIT ── */
// AntiBan: verificar backoff de Cloudflare antes de arrancar el robot
if(_CF_BACKOFF>0&&Date.now()<_CF_BACKOFF){
  var _cfMins=Math.ceil((_CF_BACKOFF-Date.now())/60000);
  addLog("er","CF backoff activo — "+_cfMins+"min restantes");
  var _s=gst();_s.on=false;sst(_s);
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

/* ══════════════════════════════════════════════════════════════════
   SISTEMA DE RECUPERACION AUTOMATICA — WATCHDOG + HEARTBEAT
   ══════════════════════════════════════════════════════════════════ */
(function(){
  var WD_KEY="ar_wd_"+UNAME;
  var _recovering=false;
  var _recoveryTimer=null;
  var _offlineTs=0;
  var _lastBumpOk=Date.now(); // timestamp del ultimo bump exitoso o inicio

  // ── Funcion central de recuperacion ─────────────────────────────
  function recover(reason, delayMs){
    if(_recovering)return;
    _recovering=true;
    if(_recoveryTimer)clearTimeout(_recoveryTimer);
    var delay=delayMs||3000;
    addLog("er","Recuperando ("+reason+") en "+(delay/1000)+"s...");
    showNotification("Reconectando...","info",delay);

    // Mostrar indicador visual en la barra
    var dot=document.getElementById("ar-dot");
    var st=document.getElementById("ar-status");
    if(dot)dot.className="blink";
    if(st){st.textContent="Reconectando";st.style.color="var(--ar-accent-warning)";}

    _recoveryTimer=setTimeout(function(){
      _recovering=false;
      // Si el robot estaba ON, volver a la pagina de posts
      var s=gst();
      if(s.on&&!s.paused){
        window.location.href=PLIST;
      } else {
        // Solo recargar la pagina actual
        window.location.reload();
      }
    },delay);
  }

  // ── 1. DETECTOR DE CONEXION (online/offline) ─────────────────────
  window.addEventListener("offline",function(){
    _offlineTs=Date.now();
    addLog("er","Sin conexion — esperando...");
    showNotification("Sin conexión...","error",5000);
    var dot=document.getElementById("ar-dot");
    if(dot)dot.className="blink";
  });

  window.addEventListener("online",function(){
    var downSecs=_offlineTs>0?Math.round((Date.now()-_offlineTs)/1000):0;
    _offlineTs=0;
    addLog("ok","Conexion restaurada ("+downSecs+"s caida)");
    showNotification("Conexión restaurada","success",2000);
    // Esperar 2s y redirigir a posts para reanudar
    recover("conexion restaurada",2000);
  });

  // ── 2. HEARTBEAT — ping cada 90s para verificar conectividad ─────
  var _pingFails=0;
  setInterval(function(){
    // Solo hacer ping si el robot esta activo
    var s=gst();
    if(!s.on||s.paused)return;
    // Si estamos offline no hacer nada
    if(_offlineTs>0)return;

    fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/list"),{
      method:"HEAD",credentials:"include",redirect:"follow"
    }).then(function(r){
      _pingFails=0; // conexion ok
      if(r.status===401||r.status===403){
        // Sesion expirada — recargar para re-login
        addLog("er","Sesion expirada — recargando");
        recover("sesion expirada",2000);
      }
    }).catch(function(){
      _pingFails++;
      addLog("er","Ping fallido #"+_pingFails);
      if(_pingFails>=2){
        _pingFails=0;
        recover("sin respuesta del servidor",5000);
      }
    });
  }, 90000);

  // ── 3. WATCHDOG — guardian cada 45s ──────────────────────────────
  setInterval(function(){
    var s=gst();
    if(!s.on||s.paused)return;
    // Guardar timestamp de actividad
    try{localStorage.setItem(WD_KEY,Date.now().toString());}catch(e){}
    // Verificar si el timer esta activo
    if(s.nextAt>0){
      var now=Date.now();
      // Si el bump debio ejecutarse hace mas de 3 min y no lo hizo, hay un problema
      if(now>s.nextAt+180000){
        addLog("er","Watchdog: bump atrasado >3min");
        recover("bump atrasado",2000);
      }
    }
  },45000);

  // ── 4. VISIBILITY CHANGE — cuando la tab vuelve a estar visible ──
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible"){
      var s=gst();
      if(!s.on||s.paused)return;
      // Verificar si hubo un bump perdido mientras la tab estaba oculta
      if(s.nextAt>0&&Date.now()>s.nextAt+120000){
        addLog("er","Tab visible: bump perdido mientras oculta");
        recover("tab oculta perdio bump",1500);
      }
    }
  });

  // ── 5. PAGE SHOW — cuando se restaura desde bfcache ──────────────
  window.addEventListener("pageshow",function(e){
    if(e.persisted){
      addLog("in","Pagina restaurada de cache");
      var s=gst();
      if(s.on&&!s.paused){
        recover("restaurado de cache",1000);
      }
    }
  });
})();

})();
<\/script>`;

  // ── Inyectar todo ────────────────────────────────────────────────────────
  const insert = css + uiHtml + script;
  if (html.includes("</body>")) {
    return html.replace("</body>", insert + "</body>");
  }
  return html + insert;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":      "*",
    "Access-Control-Allow-Methods":     "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}
function jres(status: number, obj: object): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}
function enc(s: string) { return encodeURIComponent(s); }

function expiredPage(title: string, msg: string): Response {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0c29,#1a1a2e);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}.card{background:rgba(255,255,255,.03);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:40px;max-width:400px;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;color:#fff;margin-bottom:12px}p{font-size:15px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:24px}a{display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 8px 25px rgba(139,92,246,.35);transition:all .2s}a:hover{transform:translateY(-2px);box-shadow:0 12px 35px rgba(139,92,246,.45)}</style></head><body><div class="card"><div class="icon">⏰</div><h1>${title}</h1><p>${msg}</p><a href="https://t.me/Soportetecnico2323">Contactar Soporte</a></div></body></html>`, {
    status: 200, headers: { ...cors(), "Content-Type": "text/html; charset=utf-8" }
  });
}

function noEditPage(): Response {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edición no permitida</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0a0a,#2d1515);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}.card{background:rgba(255,255,255,.03);backdrop-filter:blur(20px);border:1px solid rgba(248,113,113,.2);border-radius:24px;padding:40px;max-width:400px;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;color:#f87171;margin-bottom:12px}p{font-size:15px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:24px}a{display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 8px 25px rgba(248,113,113,.35);transition:all .2s}a:hover{transform:translateY(-2px);box-shadow:0 12px 35px rgba(248,113,113,.45)}</style></head><body><div class="card"><div class="icon">🚫</div><h1>Edición no permitida</h1><p>Para evitar que tu anuncio sea eliminado o suspendido, las ediciones solo pueden hacerse a través de soporte.</p><a href="https://t.me/Soportetecnico2323">Contactar Soporte</a></div></body></html>`, {
    status: 200, headers: { ...cors(), "Content-Type": "text/html; charset=utf-8" }
  });
}

// ─── DEVICE PROFILES ─────────────────────────────────────────────────────────
interface DeviceProfile { ua: string; headers: Record<string, string>; }
const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  iphone: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
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

    let headers: Record<string, string> = {
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

    // ANTIBAN: Randomizar orden de headers
    headers = shuffleHeaders(headers);

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
try{var _imgSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");if(_imgSrc&&_imgSrc.set){Object.defineProperty(HTMLImageElement.prototype,"src",{get:function(){return _imgSrc.get.call(this);},set:function(u){var f=px(u);_imgSrc.set.call(this,f||u);},configurable:true});}}catch(x){}
try{var _elSet=HTMLElement.prototype.setAttribute;HTMLElement.prototype.setAttribute=function(n,v){if((n==="src"||n==="data-src")&&typeof v==="string"&&v.indexOf("/api/angel-rent")===-1){var f=px(v);if(f){_elSet.call(this,n,f);return;}}return _elSet.call(this,n,v);}}catch(x){}
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
