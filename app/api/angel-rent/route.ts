// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT - DISEÑO ULTRA MODERNO 2024
// Interfaz minimalista con glassmorphism, micro-interacciones y mobile-first
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
    if (user.rentalEnd) {
      const expirationDate = new Date(user.rentalEnd + "T00:00:00");
      expirationDate.setDate(expirationDate.getDate() + 1);
      if (new Date() > expirationDate) {
        return expiredPage("Plan Expirado", "Tu plan vencio el " + user.rentalEnd + ".");
      }
    }
    const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
    const decoded = decodeURIComponent(targetUrl);
    if (decoded.includes("/users/posts/edit")) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin permisos</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:340px;width:90%;background:#18181b;border:1px solid #27272a;border-radius:20px;padding:32px 24px;text-align:center">
  <div style="width:56px;height:56px;margin:0 auto 16px;background:#27272a;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px">🔒</div>
  <div style="font-size:18px;font-weight:700;color:#fafafa;margin-bottom:8px">Sin permisos de edición</div>
  <div style="font-size:14px;color:#71717a;line-height:1.6;margin-bottom:24px">No tienes permisos para editar directamente. Contacta soporte si necesitas hacer cambios.</div>
  <a href="https://t.me/angelrentsoporte" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#3b82f6;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px;margin-bottom:12px">Contactar Soporte</a>
  <a href="javascript:history.back()" style="display:block;background:transparent;border:1px solid #27272a;color:#a1a1aa;font-size:14px;font-weight:500;padding:12px 20px;border-radius:12px;text-decoration:none">Volver</a>
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
  
  let endTimestamp = 0;
  if (user.rentalEnd) {
    const expDate = new Date(user.rentalEnd + "T00:00:00");
    expDate.setDate(expDate.getDate() + 1);
    endTimestamp = expDate.getTime();
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
  };

  let daysLeft = 999;
  if (user.rentalEnd) {
    daysLeft = Math.floor((endTimestamp - Date.now()) / 86400000);
  }
  const showWarn = daysLeft >= 0 && daysLeft <= 3;
  const warnDays = daysLeft;

  // ═══════════════════════════════════════════════════════════════════
  // CSS MODERNO - DISEÑO MINIMALISTA Y ELEGANTE
  // ═══════════════════════════════════════════════════════════════════
  const css = `<style id="ar-css">
/* ─── Variables de diseño ─────────────────────────────────────────────── */
:root {
  --ar-bg: #09090b;
  --ar-card: #18181b;
  --ar-border: #27272a;
  --ar-border-hover: #3f3f46;
  --ar-text: #fafafa;
  --ar-text-muted: #71717a;
  --ar-text-dim: #52525b;
  --ar-primary: #3b82f6;
  --ar-primary-hover: #2563eb;
  --ar-success: #22c55e;
  --ar-warning: #f59e0b;
  --ar-danger: #ef4444;
  --ar-accent: #8b5cf6;
}

/* ─── Barra superior moderna ──────────────────────────────────────────── */
#ar-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483647;
  background: rgba(9, 9, 11, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--ar-border);
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  font-family: system-ui, -apple-system, sans-serif;
}
#ar-bar::-webkit-scrollbar { display: none; }

/* ─── Logo y marca ────────────────────────────────────────────────────── */
.ar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 16px;
  border-right: 1px solid var(--ar-border);
  margin-right: 8px;
  flex-shrink: 0;
}
.ar-logo {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
.ar-brand-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--ar-text);
  letter-spacing: -0.3px;
}

/* ─── Chips de estado ─────────────────────────────────────────────────── */
.ar-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 20px;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.ar-chip:hover {
  border-color: var(--ar-border-hover);
  background: #1f1f23;
}
.ar-chip-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ar-text-muted);
}
.ar-chip-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--ar-text);
  font-variant-numeric: tabular-nums;
}
.ar-chip-value.success { color: var(--ar-success); }
.ar-chip-value.warning { color: var(--ar-warning); }
.ar-chip-value.danger { color: var(--ar-danger); }
.ar-chip-value.accent { color: var(--ar-accent); }

/* ─── Indicador de estado del robot ───────────────────────────────────── */
.ar-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ar-text-dim);
  transition: all 0.3s ease;
}
.ar-status-dot.active {
  background: var(--ar-success);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2), 0 0 12px rgba(34, 197, 94, 0.5);
  animation: ar-pulse 2s ease-in-out infinite;
}
.ar-status-dot.paused {
  background: var(--ar-warning);
  animation: ar-blink 1.5s ease-in-out infinite;
}
@keyframes ar-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2), 0 0 12px rgba(34, 197, 94, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.1), 0 0 20px rgba(34, 197, 94, 0.3); }
}
@keyframes ar-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ─── Responsive para móviles ─────────────────────────────────────────── */
@media (max-width: 768px) {
  #ar-bar {
    height: 52px;
    padding: 0 8px;
    gap: 6px;
  }
  .ar-brand {
    padding-right: 12px;
    margin-right: 4px;
  }
  .ar-logo {
    width: 28px;
    height: 28px;
    font-size: 14px;
    border-radius: 8px;
  }
  .ar-brand-text { display: none; }
  .ar-chip {
    padding: 5px 10px;
    gap: 4px;
  }
  .ar-chip-label { font-size: 9px; }
  .ar-chip-value { font-size: 12px; }
  .ar-hide-mobile { display: none !important; }
}

@media (max-width: 480px) {
  #ar-bar { height: 48px; }
  .ar-chip {
    padding: 4px 8px;
    border-radius: 16px;
  }
  .ar-chip-label { font-size: 8px; letter-spacing: 0.3px; }
  .ar-chip-value { font-size: 11px; }
}

/* ─── Botones flotantes modernos ──────────────────────────────────────── */
#ar-btns {
  position: fixed;
  bottom: 24px;
  right: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
}

.ar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  border-radius: 14px;
  font-weight: 600;
  font-size: 14px;
  padding: 14px 20px;
  font-family: system-ui, -apple-system, sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}
.ar-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
}
.ar-btn:active {
  transform: scale(0.97);
}
.ar-btn-icon {
  font-size: 18px;
  line-height: 1;
}

/* Botón del robot */
#ar-rb {
  background: var(--ar-card);
  color: var(--ar-text-muted);
  border: 1px solid var(--ar-border);
}
#ar-rb.active {
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}
#ar-rb.active:hover {
  box-shadow: 0 8px 28px rgba(34, 197, 94, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

/* Botón de soporte */
#ar-sb {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  border: none;
}
#ar-sb:hover {
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

/* Botón de estadísticas */
#ar-stats-btn {
  background: var(--ar-card);
  color: var(--ar-text);
  border: 1px solid var(--ar-border);
}
#ar-stats-btn:hover {
  border-color: var(--ar-border-hover);
  background: #1f1f23;
}

/* ─── Responsive para botones ─────────────────────────────────────────── */
@media (max-width: 768px) {
  #ar-btns {
    bottom: 20px;
    right: 12px;
    gap: 10px;
  }
  .ar-btn {
    padding: 12px 16px;
    font-size: 13px;
    border-radius: 12px;
    gap: 6px;
  }
  .ar-btn-icon { font-size: 16px; }
}

@media (max-width: 480px) {
  #ar-btns {
    bottom: 16px;
    right: 10px;
    gap: 8px;
  }
  .ar-btn {
    padding: 10px 14px;
    font-size: 12px;
    border-radius: 10px;
  }
  .ar-btn-icon { font-size: 15px; }
  .ar-btn-text { display: none; }
  .ar-btn { padding: 12px; border-radius: 12px; }
}

/* ─── Notificaciones flotantes ────────────────────────────────────────── */
#ar-notify {
  position: fixed;
  bottom: 200px;
  right: 16px;
  z-index: 2147483647;
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 16px;
  padding: 16px;
  max-width: 280px;
  display: none;
  animation: ar-slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
@keyframes ar-slide-in {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
.ar-notify-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.ar-notify-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--ar-success), #16a34a);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.ar-notify-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--ar-text);
}
.ar-notify-msg {
  font-size: 13px;
  color: var(--ar-text-muted);
  line-height: 1.5;
}

@media (max-width: 480px) {
  #ar-notify {
    bottom: auto;
    top: 60px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
}

/* ─── Modales modernos ────────────────────────────────────────────────── */
.ar-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483648;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}
.ar-modal.show { display: flex; }

.ar-modal-content {
  background: var(--ar-bg);
  border: 1px solid var(--ar-border);
  border-radius: 24px 24px 0 0;
  padding: 24px 20px 32px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  animation: ar-modal-up 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: system-ui, -apple-system, sans-serif;
}
@keyframes ar-modal-up {
  from { opacity: 0; transform: translateY(100px); }
  to { opacity: 1; transform: translateY(0); }
}

.ar-modal-header {
  text-align: center;
  margin-bottom: 24px;
}
.ar-modal-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  background: var(--ar-card);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}
.ar-modal-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--ar-text);
  margin-bottom: 6px;
}
.ar-modal-subtitle {
  font-size: 14px;
  color: var(--ar-text-muted);
}

/* ─── Tarjetas de estadísticas ────────────────────────────────────────── */
.ar-stat-card {
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}
.ar-stat-card:hover {
  border-color: var(--ar-border-hover);
}
.ar-stat-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ar-text-muted);
  margin-bottom: 8px;
}
.ar-stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--ar-text);
  letter-spacing: -1px;
  margin-bottom: 4px;
}
.ar-stat-desc {
  font-size: 13px;
  color: var(--ar-text-dim);
}
.ar-stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 6px 12px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ar-success);
}

/* ─── Opciones de soporte ─────────────────────────────────────────────── */
.ar-support-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 14px;
  cursor: pointer;
  width: 100%;
  margin-bottom: 10px;
  transition: all 0.2s ease;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: left;
}
.ar-support-option:hover {
  border-color: var(--ar-primary);
  background: rgba(59, 130, 246, 0.05);
}
.ar-support-option:active {
  transform: scale(0.98);
}
.ar-support-icon {
  width: 44px;
  height: 44px;
  background: var(--ar-bg);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.ar-support-text { flex: 1; }
.ar-support-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ar-text);
  margin-bottom: 2px;
}
.ar-support-desc {
  font-size: 13px;
  color: var(--ar-text-muted);
}
.ar-badge-urgent {
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ar-danger);
}

/* ─── Inputs y botones de formulario ──────────────────────────────────── */
.ar-input {
  width: 100%;
  padding: 14px 16px;
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 12px;
  color: var(--ar-text);
  font-size: 14px;
  font-family: system-ui, -apple-system, sans-serif;
  resize: none;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}
.ar-input:focus {
  border-color: var(--ar-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.ar-input::placeholder {
  color: var(--ar-text-dim);
}

.ar-btn-primary {
  width: 100%;
  padding: 14px;
  background: var(--ar-primary);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: system-ui, -apple-system, sans-serif;
  transition: all 0.2s ease;
}
.ar-btn-primary:hover {
  background: var(--ar-primary-hover);
}
.ar-btn-primary:active {
  transform: scale(0.98);
}
.ar-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ar-btn-secondary {
  width: 100%;
  padding: 12px;
  background: transparent;
  color: var(--ar-text-muted);
  border: 1px solid var(--ar-border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: system-ui, -apple-system, sans-serif;
  transition: all 0.2s ease;
}
.ar-btn-secondary:hover {
  border-color: var(--ar-border-hover);
  color: var(--ar-text);
}

.ar-btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--ar-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}
.ar-btn-back:hover {
  color: var(--ar-text);
}

/* ─── Modal de advertencia de vencimiento ─────────────────────────────── */
#ar-warn-modal .ar-modal-content {
  text-align: center;
  padding: 32px 24px;
}
.ar-warn-days {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 16px;
  font-size: 28px;
  font-weight: 800;
  color: var(--ar-warning);
  margin: 16px 0;
}
.ar-warn-text {
  font-size: 14px;
  color: var(--ar-text-muted);
  line-height: 1.7;
  margin-bottom: 24px;
}
.ar-warn-text strong {
  color: var(--ar-text);
}

/* ─── Header de login ─────────────────────────────────────────────────── */
#ar-login-header {
  display: block;
  background: var(--ar-bg);
  border-bottom: 1px solid var(--ar-border);
  padding: 20px;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}
.ar-login-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: var(--ar-card);
  border: 1px solid var(--ar-border);
  border-radius: 16px;
  padding: 10px 20px 10px 12px;
}
.ar-login-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.ar-login-text { text-align: left; }
.ar-login-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--ar-text);
}
.ar-login-tagline {
  font-size: 11px;
  color: var(--ar-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ─── Spinner de carga ────────────────────────────────────────────────── */
.ar-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--ar-border);
  border-top-color: var(--ar-primary);
  border-radius: 50%;
  animation: ar-spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes ar-spin {
  to { transform: rotate(360deg); }
}

/* ─── Estado de éxito ─────────────────────────────────────────────────── */
.ar-success-state {
  text-align: center;
  padding: 32px 0;
}
.ar-success-icon {
  width: 64px;
  height: 64px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin: 0 auto 16px;
}
.ar-success-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ar-success);
  margin-bottom: 8px;
}
.ar-success-msg {
  font-size: 14px;
  color: var(--ar-text-muted);
}

/* ─── Cola de espera ──────────────────────────────────────────────────── */
.ar-queue-container {
  text-align: center;
  padding: 24px 0;
}
.ar-queue-position {
  width: 80px;
  height: 80px;
  background: var(--ar-card);
  border: 2px solid var(--ar-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}
.ar-queue-number {
  font-size: 32px;
  font-weight: 800;
  color: var(--ar-primary);
}
.ar-queue-label {
  font-size: 14px;
  color: var(--ar-text);
  font-weight: 600;
  margin-bottom: 8px;
}
.ar-queue-msg {
  font-size: 13px;
  color: var(--ar-text-muted);
  margin-bottom: 20px;
}
.ar-queue-progress {
  width: 100%;
  height: 6px;
  background: var(--ar-card);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 24px;
}
.ar-queue-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ar-primary), var(--ar-accent));
  border-radius: 3px;
  transition: width 0.5s ease;
}

/* ─── Promo bar minimalista ───────────────────────────────────────────── */
#ar-promo {
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  z-index: 2147483646;
  background: var(--ar-card);
  border-bottom: 1px solid var(--ar-border);
  padding: 8px 16px;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--ar-text-muted);
  display: none;
  animation: ar-promo-in 0.3s ease;
}
#ar-promo strong { color: var(--ar-text); }
@keyframes ar-promo-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ar-promo-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@media (max-width: 768px) {
  #ar-promo {
    top: 52px;
    font-size: 11px;
    padding: 6px 12px;
  }
}
</style>`;

  const modalHtml = showWarn ? `
<div id="ar-warn-modal" class="ar-modal show">
  <div class="ar-modal-content">
    <div class="ar-modal-icon" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2)">⏰</div>
    <div class="ar-modal-title">Tu renta vence pronto</div>
    <div class="ar-warn-days">${warnDays === 0 ? "HOY" : warnDays === 1 ? "1 día" : warnDays + " días"}</div>
    <p class="ar-warn-text">${warnDays === 0
      ? "Tu plan <strong>vence hoy</strong>. Si no renuevas, tu anuncio dejará de republicarse automáticamente."
      : `Tu plan vence en <strong>${warnDays} día${warnDays > 1 ? "s" : ""}</strong>. Renueva pronto para no perder el servicio.`
    }</p>
    <button class="ar-btn-primary" id="ar-warn-ok" style="background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:12px">Contactar para renovar</button>
    <button class="ar-btn-secondary" id="ar-warn-skip">Recordar después</button>
  </div>
</div>` : "";

  const uiHtml = `
${modalHtml}
<div id="ar-bar">
  <div class="ar-brand">
    <div class="ar-logo">👼</div>
    <span class="ar-brand-text">Angel Rent</span>
  </div>
  <div class="ar-chip">
    <span class="ar-chip-label">Usuario</span>
    <span class="ar-chip-value" id="ar-uname" style="color:var(--ar-text-muted)"></span>
  </div>
  <div class="ar-chip">
    <span class="ar-chip-label">Renta</span>
    <span class="ar-chip-value success" id="ar-rent">...</span>
  </div>
  <div class="ar-chip">
    <div class="ar-status-dot" id="ar-dot"></div>
    <span class="ar-chip-label">Robot</span>
    <span class="ar-chip-value" id="ar-status" style="color:var(--ar-text-dim)">OFF</span>
  </div>
  <div class="ar-chip" id="ar-cd-chip" style="display:none">
    <span class="ar-chip-label">Próximo</span>
    <span class="ar-chip-value accent" id="ar-cd">--:--</span>
  </div>
  <div class="ar-chip" id="ar-cnt-chip" style="display:none">
    <span class="ar-chip-label">Bumps</span>
    <span class="ar-chip-value accent" id="ar-cnt">0</span>
  </div>
  <div class="ar-chip ar-hide-mobile">
    <span class="ar-chip-label">Vistas</span>
    <span class="ar-chip-value success" id="ar-views">...</span>
  </div>
  <div class="ar-chip ar-hide-mobile">
    <span class="ar-chip-label">Boost</span>
    <span class="ar-chip-value warning">x2.5</span>
  </div>
</div>

<div id="ar-promo"><span id="ar-promo-txt"></span></div>

<div id="ar-notify">
  <div class="ar-notify-header">
    <div class="ar-notify-icon">👤</div>
    <div class="ar-notify-title" id="notify-title">Nuevo cliente</div>
  </div>
  <div class="ar-notify-msg" id="notify-msg">Alguien vio tu anuncio</div>
</div>

<div id="ar-btns">
  <button id="ar-stats-btn" class="ar-btn">
    <span class="ar-btn-icon">📊</span>
    <span class="ar-btn-text">Estadísticas</span>
  </button>
  <button id="ar-rb" class="ar-btn">
    <span class="ar-btn-icon" id="ar-ri">⚡</span>
    <span class="ar-btn-text" id="ar-rl">Robot OFF</span>
  </button>
  <button id="ar-sb" class="ar-btn">
    <span class="ar-btn-icon">💬</span>
    <span class="ar-btn-text">Soporte</span>
  </button>
</div>

<div id="ar-stats-modal" class="ar-modal">
  <div class="ar-modal-content">
    <div class="ar-modal-header">
      <div class="ar-modal-icon">📊</div>
      <div class="ar-modal-title">Estadísticas</div>
      <div class="ar-modal-subtitle">Rendimiento en tiempo real</div>
    </div>
    
    <div class="ar-stat-card">
      <div class="ar-stat-label">Vistas Totales</div>
      <div class="ar-stat-value" id="stat-total-views">0</div>
      <div class="ar-stat-desc">en las últimas 24 horas</div>
      <span class="ar-stat-badge">↗ +127% vs ayer</span>
    </div>

    <div class="ar-stat-card">
      <div class="ar-stat-label">Clientes Interesados</div>
      <div class="ar-stat-value" id="stat-interested">0</div>
      <div class="ar-stat-desc">han guardado o contactado</div>
      <span class="ar-stat-badge">↗ +89% esta semana</span>
    </div>

    <div class="ar-stat-card">
      <div class="ar-stat-label">Posición en Búsqueda</div>
      <div class="ar-stat-value" style="color:var(--ar-warning)">#<span id="stat-ranking">3</span></div>
      <div class="ar-stat-desc">en tu ciudad</div>
      <span class="ar-stat-badge">↗ Subiste 12 posiciones</span>
    </div>

    <div class="ar-stat-card">
      <div class="ar-stat-label">Boost Activo</div>
      <div class="ar-stat-value" style="color:var(--ar-warning)">x<span id="stat-boost">2.5</span></div>
      <div class="ar-stat-desc">multiplicador de visibilidad</div>
      <span class="ar-stat-badge">Máxima potencia</span>
    </div>

    <button class="ar-btn-secondary" id="ar-stats-close" style="margin-top:8px">Cerrar</button>
  </div>
</div>

<div id="ar-support-modal" class="ar-modal">
  <div class="ar-modal-content">
    <div id="ar-s-select">
      <div class="ar-modal-header">
        <div class="ar-modal-icon">💬</div>
        <div class="ar-modal-title">Soporte</div>
        <div class="ar-modal-subtitle">¿En qué podemos ayudarte?</div>
      </div>
      
      <button class="ar-support-option" data-type="activation" data-label="Activación nueva" data-priority="urgent">
        <div class="ar-support-icon">🚀</div>
        <div class="ar-support-text">
          <div class="ar-support-title">Activación nueva</div>
          <div class="ar-support-desc">Crear anuncio por primera vez</div>
        </div>
        <span class="ar-badge-urgent">Urgente</span>
      </button>
      
      <button class="ar-support-option" data-type="photo_change" data-label="Cambiar fotos" data-priority="normal">
        <div class="ar-support-icon">📸</div>
        <div class="ar-support-text">
          <div class="ar-support-title">Cambiar fotos</div>
          <div class="ar-support-desc">Actualizar las fotos del anuncio</div>
        </div>
      </button>
      
      <button class="ar-support-option" data-type="number_change" data-label="Cambiar número" data-priority="urgent">
        <div class="ar-support-icon">📱</div>
        <div class="ar-support-text">
          <div class="ar-support-title">Cambiar número</div>
          <div class="ar-support-desc">Cambiar el teléfono de contacto</div>
        </div>
        <span class="ar-badge-urgent">Urgente</span>
      </button>
      
      <button class="ar-support-option" data-type="other" data-label="Otra consulta" data-priority="normal">
        <div class="ar-support-icon">❓</div>
        <div class="ar-support-text">
          <div class="ar-support-title">Otra consulta</div>
          <div class="ar-support-desc">Otra solicitud o pregunta</div>
        </div>
      </button>
      
      <button class="ar-btn-secondary" id="ar-s-cancel1" style="margin-top:8px">Cancelar</button>
    </div>
    
    <div id="ar-s-details" style="display:none">
      <button class="ar-btn-back" id="ar-sback">← Volver</button>
      <div class="ar-modal-header">
        <div class="ar-modal-icon" id="ar-s-icon">📝</div>
        <div class="ar-modal-title" id="ar-s-dtitle">Detalles</div>
        <div class="ar-modal-subtitle" id="ar-s-dsub">Agrega información adicional</div>
      </div>
      
      <div id="ar-s-photo-hint" style="display:none;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;text-align:center;color:#60a5fa">
        Cuando te atiendan, envía tus fotos a <a href="https://t.me/Soportetecnico2323" target="_blank" style="color:#3b82f6;font-weight:600">@Soportetecnico2323</a>
      </div>
      
      <textarea class="ar-input" id="ar-sdesc" rows="3" placeholder="Describe tu solicitud (opcional)..." style="margin-bottom:16px"></textarea>
      <button class="ar-btn-primary" id="ar-s-send" style="margin-bottom:12px">Enviar Solicitud</button>
      <button class="ar-btn-secondary" id="ar-s-cancel2">Cancelar</button>
    </div>
    
    <div id="ar-s-sending" style="display:none;text-align:center;padding:48px 0">
      <div class="ar-spinner" style="margin-bottom:20px"></div>
      <p style="color:var(--ar-text-muted);font-size:14px">Enviando solicitud...</p>
    </div>
    
    <div id="ar-s-queue" style="display:none">
      <div class="ar-queue-container">
        <div class="ar-queue-position">
          <span class="ar-queue-number" id="ar-queue-position">1</span>
        </div>
        <div class="ar-queue-label">Tu posición en la cola</div>
        <div class="ar-queue-msg" id="ar-queue-msg">Espera estimada: 5 minutos</div>
        <div class="ar-queue-progress">
          <div class="ar-queue-progress-fill" id="ar-queue-progress-fill" style="width:50%"></div>
        </div>
        <button class="ar-btn-secondary" id="ar-s-cancel-queue">Cancelar espera</button>
      </div>
    </div>
    
    <div id="ar-sdone" style="display:none">
      <div class="ar-success-state">
        <div class="ar-success-icon">✓</div>
        <div class="ar-success-title">Solicitud enviada</div>
        <div class="ar-success-msg">Te avisaremos cuando te estén atendiendo</div>
      </div>
    </div>
  </div>
</div>`;

  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},B64E=${V.b64e},B64P=${V.b64p},PHONE=${V.phone},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;

function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

function initFakeStats(){var s=gst();if(!s.fakeViews){s.fakeViews=Math.floor(Math.random()*100)+250;s.fakeInterested=Math.floor(Math.random()*15)+12;s.fakeRanking=Math.floor(Math.random()*5)+2;s.lastViewUpdate=Date.now();s.lastClientNotify=Date.now();sst(s);}return s;}
function updateFakeViews(){var s=gst();if(!s.fakeViews)s=initFakeStats();var now=Date.now();var elapsed=now-(s.lastViewUpdate||now);if(elapsed>30000){var increment=Math.floor(Math.random()*3)+1;s.fakeViews+=increment;s.lastViewUpdate=now;if(s.fakeViews%5===0){s.fakeInterested=(s.fakeInterested||12)+1;}if(Math.random()>0.9&&s.fakeRanking>1){s.fakeRanking--;}sst(s);}return s;}

function showClientNotification(){
  var notify=document.getElementById("ar-notify");
  if(!notify)return;
  var msgs=["Alguien vio tu perfil","Nuevo cliente en tu zona","Cliente interesado","Alguien guardó tu anuncio","Vista desde tu ciudad"];
  var titles=["Actividad reciente","Nuevo cliente","Te están viendo","Interés alto","Cliente potencial"];
  document.getElementById("notify-title").textContent=titles[Math.floor(Math.random()*titles.length)];
  document.getElementById("notify-msg").textContent=msgs[Math.floor(Math.random()*msgs.length)];
  notify.style.display="block";
  notify.style.animation="ar-slide-in .4s cubic-bezier(.4,0,.2,1)";
  setTimeout(function(){
    notify.style.opacity="0";
    notify.style.transition="opacity .3s";
    setTimeout(function(){notify.style.display="none";notify.style.opacity="1";notify.style.transition="";},300);
  },4000);
}

function startClientNotifications(){var s=gst();if(!s.on||s.paused)return;var now=Date.now();var elapsed=now-(s.lastClientNotify||now);var interval=(Math.random()*180000)+120000;if(elapsed>interval){showClientNotification();s.lastClientNotify=now;sst(s);}}

function updateFakeUI(){
  var s=updateFakeViews();
  var viewsEl=document.getElementById("ar-views");
  if(viewsEl)viewsEl.textContent=s.fakeViews||"...";
  var statsModal=document.getElementById("ar-stats-modal");
  if(statsModal&&statsModal.classList.contains("show")){
    var totalViews=document.getElementById("stat-total-views");
    var interested=document.getElementById("stat-interested");
    var ranking=document.getElementById("stat-ranking");
    if(totalViews)totalViews.textContent=s.fakeViews||0;
    if(interested)interested.textContent=s.fakeInterested||0;
    if(ranking)ranking.textContent=s.fakeRanking||3;
  }
  if(s.on&&!s.paused){startClientNotifications();}
}

var PROMOS=[
  "<strong>Angel Rent</strong> — Tu anuncio, siempre arriba",
  "Contacto: <strong>829-383-7695</strong>",
  "Robot 24/7 activo",
  "Servicio #1 en MegaPersonals",
  "Boost Premium activado"
];
var _promoIdx=Math.floor(Math.random()*PROMOS.length);
var _promoTimer=null;
function showNextPromo(){
  var el=document.getElementById("ar-promo");
  var txt=document.getElementById("ar-promo-txt");
  if(!el||!txt)return;
  txt.innerHTML=PROMOS[_promoIdx % PROMOS.length];
  _promoIdx++;
  el.style.animation="ar-promo-in .3s ease";
  el.style.display="block";
  document.body.style.paddingTop="88px";
  _promoTimer=setTimeout(function(){
    el.style.animation="ar-promo-out .3s ease forwards";
    setTimeout(function(){
      el.style.display="none";
      document.body.style.paddingTop="56px";
      _promoTimer=setTimeout(showNextPromo,25000);
    },300);
  },8000);
}
setTimeout(showNextPromo,5000);

(function(){
  var modal=document.createElement("div");
  modal.id="ar-noedit-modal";
  modal.className="ar-modal";
  modal.innerHTML='<div class="ar-modal-content" style="text-align:center;padding:32px 24px"><div class="ar-modal-icon">🔒</div><div class="ar-modal-title">Sin permisos</div><div class="ar-modal-subtitle" style="margin-bottom:24px">No tienes permisos para editar. Contacta soporte si necesitas cambios.</div><a href="https://t.me/angelrentsoporte" target="_blank" class="ar-btn-primary" style="display:block;text-decoration:none;text-align:center;margin-bottom:12px">Contactar Soporte</a><button id="ar-noedit-close" class="ar-btn-secondary">Cerrar</button></div>';
  document.body.appendChild(modal);
  document.getElementById("ar-noedit-close").addEventListener("click",function(){modal.classList.remove("show");});
  modal.addEventListener("click",function(e){if(e.target===modal)modal.classList.remove("show");});
})();

function addLog(t,m){var s=gst();if(!s.logs)s.logs=[];var h=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});s.logs.unshift({t:t,m:"["+h+"] "+m});if(s.logs.length>30)s.logs=s.logs.slice(0,30);sst(s);}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function p2(n){return String(n).padStart(2,"0");}
function fmtR(ms){if(ms===null)return"∞";if(ms<=0)return"EXP";var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),m=Math.floor((ms%3600000)/60000);if(d>0)return d+"d "+h+"h";if(h>0)return h+"h "+m+"m";return m+"m";}
function G(id){return document.getElementById(id);}

function updateUI(){
  var s=gst(),on=!!s.on,paused=!!s.paused,cnt=s.cnt||0,nextAt=s.nextAt||0;
  
  if(G("ar-uname"))G("ar-uname").textContent=DNAME;
  
  var rl=rentLeft(),re=G("ar-rent");
  if(re){
    re.textContent=fmtR(rl);
    re.className="ar-chip-value";
    if(rl===null||rl>259200000)re.classList.add("success");
    else if(rl>86400000)re.classList.add("warning");
    else re.classList.add("danger");
  }
  
  var dot=G("ar-dot");
  if(dot){
    dot.className="ar-status-dot";
    if(on&&!paused)dot.classList.add("active");
    else if(on&&paused)dot.classList.add("paused");
  }
  
  var st=G("ar-status");
  if(st){
    if(!on){
      st.textContent="OFF";
      st.style.color="var(--ar-text-dim)";
    }else if(paused){
      st.textContent="Pausado";
      st.style.color="var(--ar-warning)";
    }else{
      st.textContent="Activo";
      st.style.color="var(--ar-success)";
    }
  }
  
  var cdChip=G("ar-cd-chip");
  if(on&&!paused){
    if(cdChip)cdChip.style.display="";
    var left=Math.max(0,Math.floor((nextAt-Date.now())/1000));
    if(G("ar-cd"))G("ar-cd").textContent=p2(Math.floor(left/60))+":"+p2(left%60);
  }else if(cdChip)cdChip.style.display="none";
  
  var cntChip=G("ar-cnt-chip");
  if(on){
    if(cntChip)cntChip.style.display="";
    if(G("ar-cnt"))G("ar-cnt").textContent=String(cnt);
  }else if(cntChip)cntChip.style.display="none";
  
  var rb=G("ar-rb");
  if(rb){
    rb.className=on?"ar-btn active":"ar-btn";
    if(G("ar-rl"))G("ar-rl").textContent=on?"Robot ON":"Robot OFF";
  }
  
  updateFakeUI();
}

function schedNext(){var secs=BMIN+Math.floor(Math.random()*(BMAX-BMIN));var s=gst();s.nextAt=Date.now()+secs*1000;sst(s);addLog("in","Proximo bump en "+Math.floor(secs/60)+"m "+(secs%60)+"s");}
function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}
function rnd(n){return Math.floor(Math.random()*n);}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
function isBumpUrl(u){var k=["bump","repost","renew","republish"];for(var i=0;i<k.length;i++)if(u.indexOf("/"+k[i]+"/")!==-1)return true;return false;}
function getPid(u){var s=u.split("/");for(var i=s.length-1;i>=0;i--)if(s[i]&&s[i].length>=5&&/^\\d+$/.test(s[i]))return s[i];return null;}
function deproxy(h){if(h.indexOf("/api/angel-rent")===-1)return h;try{var m=h.match(/[?&]url=([^&]+)/);if(m)return decodeURIComponent(m[1]);}catch(x){}return h;}

async function doBump(){
  var s=gst();if(!s.on||s.paused)return;
  addLog("in","Republicando...");schedNext();
  setTimeout(function(){
    showClientNotification();
    s=gst();
    var views=Math.floor(Math.random()*8)+5;
    s.fakeViews=(s.fakeViews||250)+views;
    s.fakeInterested=(s.fakeInterested||12)+Math.floor(views/3);
    sst(s);updateFakeUI();
  },2000);
  
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
        await wait(300+rnd(400));
        links[i].click();
        s=gst();s.cnt=(s.cnt||0)+1;sst(s);
        addLog("ok","Bump #"+s.cnt+" (link)");
      }catch(e){addLog("er","Error M2");}
      updateUI();return;
    }
  }
  
  var ids=[];
  var al=document.querySelectorAll("a[href]");
  for(var j=0;j<al.length;j++){
    var pid=getPid(deproxy(al[j].getAttribute("href")||""));
    if(pid&&ids.indexOf(pid)===-1)ids.push(pid);
  }
  var dels=document.querySelectorAll("[data-id],[data-post-id]");
  for(var k=0;k<dels.length;k++){
    var did=dels[k].getAttribute("data-id")||dels[k].getAttribute("data-post-id")||"";
    if(/^\\d{5,}$/.test(did)&&ids.indexOf(did)===-1)ids.push(did);
  }
  
  if(ids.length){
    for(var n=0;n<ids.length;n++){
      try{
        var r=await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[n]),{credentials:"include",redirect:"follow"});
        if(r.ok){
          var txt=await r.text();
          if(txt.indexOf("blocked")!==-1||txt.indexOf("Attention")!==-1)addLog("er","Bloqueado");
          else{s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt);}
        }else addLog("er","HTTP "+r.status);
      }catch(e2){addLog("er","Fetch err");}
      if(n<ids.length-1)await wait(1500+rnd(2000));
    }
  }else{addLog("er","No encontre post");}
  updateUI();
}

function startTick(){
  if(TICK)return;
  TICK=setInterval(function(){
    var s=gst();
    if(s.on && !s.paused && s.nextAt>0 && Date.now()>=s.nextAt){
      doBump();
    }
  },1000);
}

function saveRobotState(on,paused){try{fetch("/api/angel-rent-state?u="+UNAME,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({robotOn:on,robotPaused:paused})});}catch(e){}}

function toggleRobot(){
  var s=gst();
  if(s.on){
    s.on=false;s.nextAt=0;sst(s);
    if(TICK){clearInterval(TICK);TICK=null;}
    addLog("in","Robot OFF");
    saveRobotState(false,false);
  }else{
    s.on=true;s.paused=false;s.cnt=0;sst(s);
    addLog("ok","Robot ON - bumps 16-20 min");
    saveRobotState(true,false);
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
        var b=btns[i];
        setTimeout(function(){try{b.click();}catch(e){}goList(2000);},500);
        return;
      }
    }
  },400);
  setTimeout(function(){if(!done){clearInterval(chk);goList(600);}},8000);
}

function handlePage(){
  var u=CUR;
  var RK="ar_ret_"+UNAME;
  var now=Date.now();
  
  setTimeout(function(){
    function blockButton(selector,label){
      var btn=document.querySelector(selector);
      if(btn){
        btn.style.opacity="0.4";
        btn.style.cursor="not-allowed";
        btn.style.pointerEvents="none";
        btn.setAttribute("disabled","true");
        addLog("in","Bloqueado: "+label);
      }
    }
    
    blockButton("a[href*='/users/posts/edit']","Edit Post");
    blockButton("a[href*='/users/posts/create']","Write New");
    blockButton("#delete-post-id","Remove Post");
    blockButton("a[href*='/users/posts/delete']","Remove Post");
    
    var allLinks=document.querySelectorAll("a,button");
    for(var i=0;i<allLinks.length;i++){
      var el=allLinks[i];
      var text=(el.innerText||el.textContent||"").trim().toUpperCase();
      var href=(el.getAttribute("href")||"").toLowerCase();
      
      if(text.indexOf("EDIT POST")!==-1||
         text.indexOf("WRITE NEW")!==-1||
         text.indexOf("REMOVE POST")!==-1||
         text.indexOf("DELETE POST")!==-1||
         text.indexOf("DELETE ACCOUNT")!==-1){
        
        el.style.opacity="0.4";
        el.style.cursor="not-allowed";
        el.style.filter="grayscale(1)";
        
        el.addEventListener("click",function(e){
          e.preventDefault();
          e.stopPropagation();
          var modal=document.getElementById("ar-noedit-modal");
          if(modal)modal.classList.add("show");
        },true);
      }
      
      if(href.indexOf("/edit")!==-1||
         href.indexOf("/create")!==-1||
         href.indexOf("/delete")!==-1){
        
        if(href.indexOf("/bump")===-1&&href.indexOf("/repost")===-1){
          el.style.opacity="0.4";
          el.style.cursor="not-allowed";
          el.style.filter="grayscale(1)";
          
          el.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();
            var modal=document.getElementById("ar-noedit-modal");
            if(modal)modal.classList.add("show");
          },true);
        }
      }
    }
  },1000);
  
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
        
        if(el.style.opacity!=="0.4"){
          el.style.opacity="0.4";
          el.style.cursor="not-allowed";
          el.style.filter="grayscale(1)";
          
          el.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();
            var modal=document.getElementById("ar-noedit-modal");
            if(modal)modal.classList.add("show");
          },true);
        }
      }
    }
  },3000);
  
  if(u.indexOf("/users/posts/edit/")!==-1){
    var m=document.getElementById("ar-noedit-modal");
    if(m)m.classList.add("show");
    return;
  }
  
  var retRaw=null;try{retRaw=localStorage.getItem(RK);}catch(e){}
  if(retRaw){
    var retObj=null;try{retObj=JSON.parse(retRaw);}catch(e){}
    if(retObj&&retObj.url&&(now-retObj.ts)<60000){
      try{localStorage.removeItem(RK);}catch(e){}
      setTimeout(function(){location.href=retObj.url;},500);
      return;
    }
    try{localStorage.removeItem(RK);}catch(e){}
  }
  
  if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1||u.indexOf("success_renew")!==-1){
    addLog("ok","Publicado!");autoOK();return;
  }
  
  if(u.indexOf("/users/posts/bump/")!==-1||u.indexOf("/users/posts/repost/")!==-1||u.indexOf("/users/posts/renew/")!==-1){
    setTimeout(function(){autoOK();goList(2000);},1500);return;
  }
  
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){
    var s=gst();if(s.on)goList(3000);return;
  }
  
  if(u.indexOf("/users/posts")!==-1){
    startTick();
    if(u.indexOf("/users/posts/bump")===-1&&u.indexOf("/users/posts/repost")===-1){
      setTimeout(function(){
        try{
          var rawPhone=null;
          var phoneEl=document.querySelector("#manage_ad_body > div.post_preview_info > div:nth-child(1) > div:nth-child(1) > span:nth-child(3)");
          if(phoneEl) rawPhone=(phoneEl.innerText||phoneEl.textContent||"").trim();
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
  
  if(u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1){
    injectLoginLogo();
    setTimeout(tryLogin,300);
    return;
  }
}

function injectLoginLogo(){
  if(document.getElementById("ar-login-header"))return;
  var hdr=document.createElement("div");
  hdr.id="ar-login-header";
  hdr.innerHTML='<div class="ar-login-badge"><div class="ar-login-icon">👼</div><div class="ar-login-text"><span class="ar-login-name">Angel Rent</span><span class="ar-login-tagline">Tu anuncio, siempre arriba</span></div></div>';
  var form=document.querySelector("form");
  if(form&&form.parentNode)form.parentNode.insertBefore(hdr,form);
  else if(document.body)document.body.insertBefore(hdr,document.body.firstChild);
}

function doAutoLogin(){
  if(!B64E)return;
  var email,pass;
  try{email=atob(B64E);pass=atob(B64P);}catch(e){return;}
  if(!email||!pass)return;
  
  var ef=document.querySelector("input[name='email_address']")||document.querySelector("input[name='email']")||document.querySelector("input[type='email']")||document.querySelector("input[name='username']");
  if(!ef){
    var inps=document.querySelectorAll("input");
    for(var i=0;i<inps.length;i++){
      var pl=(inps[i].getAttribute("placeholder")||"").toLowerCase();
      if(pl.indexOf("email")!==-1||pl.indexOf("user")!==-1){
        ef=inps[i];break;
      }
    }
  }
  
  var pf=document.querySelector("input[type='password']")||document.querySelector("input[name='password']");
  if(!ef||!pf||ef.value)return;
  
  function setVal(e2,v){
    try{
      var p=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");
      if(p&&p.set)p.set.call(e2,v);else e2.value=v;
    }catch(x){e2.value=v;}
    try{e2.dispatchEvent(new Event("input",{bubbles:true}));}catch(x){}
    try{e2.dispatchEvent(new Event("change",{bubbles:true}));}catch(x){}
  }
  
  setVal(ef,email);
  setVal(pf,pass);
  ef.style.setProperty("color","transparent","important");
  ef.style.setProperty("-webkit-text-fill-color","transparent","important");
  ef.setAttribute("readonly","readonly");
  
  var bullets="";
  for(var k=0;k<email.length;k++)bullets+="●";
  
  function applyMask(){
    var old=document.getElementById("ar-mask");
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    var ov=document.createElement("div");
    ov.id="ar-mask";
    ov.textContent=bullets;
    var cs=window.getComputedStyle(ef);
    ov.style.cssText="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;padding-left:"+cs.paddingLeft+";font-size:14px;letter-spacing:3px;color:#666;pointer-events:none;z-index:999;box-sizing:border-box";
    var par=ef.parentNode;
    if(par){
      if(window.getComputedStyle(par).position==="static")par.style.position="relative";
      par.appendChild(ov);
    }
  }
  applyMask();
  setTimeout(applyMask,500);
}

var loginDone=false;
function tryLogin(){if(loginDone)return;doAutoLogin();var f=document.querySelector("input[name='email_address'],input[name='email'],input[type='email']");if(f&&f.value)loginDone=true;}

var warnModal=document.getElementById("ar-warn-modal");
if(warnModal){
  var dismissed=localStorage.getItem("ar_wd_"+UNAME);
  var dismissedTs=parseInt(dismissed||"0");
  if(dismissed && (Date.now()-dismissedTs) < 15*3600*1000){
    warnModal.style.display="none";
    warnModal.classList.remove("show");
  }
  var wok=document.getElementById("ar-warn-ok");
  var wsk=document.getElementById("ar-warn-skip");
  if(wok)wok.addEventListener("click",function(){
    warnModal.classList.remove("show");
    window.open("https://t.me/angelrentsoporte","_blank");
  });
  if(wsk)wsk.addEventListener("click",function(){
    warnModal.classList.remove("show");
    localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());
  });
  warnModal.addEventListener("click",function(e){
    if(e.target===warnModal){
      warnModal.classList.remove("show");
      localStorage.setItem("ar_wd_"+UNAME, Date.now().toString());
    }
  });
}

if(document.body)document.body.style.paddingTop="56px";
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
var arSQueue=G("ar-s-queue");
var arSDone=G("ar-sdone");
var selectedType=null,selectedLabel=null,selectedPriority="normal";
var currentTicketId=null;
var queueChecker=null;

function showSupportStep(step){
  [arSSelect,arSDetails,arSSending,arSQueue,arSDone].forEach(function(el){if(el)el.style.display="none";});
  if(step==="select"&&arSSelect)arSSelect.style.display="";
  if(step==="details"&&arSDetails)arSDetails.style.display="";
  if(step==="sending"&&arSSending)arSSending.style.display="";
  if(step==="queue"&&arSQueue)arSQueue.style.display="";
  if(step==="done"&&arSDone)arSDone.style.display="";
}

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
  var msgEl=G("ar-queue-msg");
  var progressBar=G("ar-queue-progress-fill");
  
  if(posEl)posEl.textContent=position;
  
  if(msgEl){
    if(position===1){
      msgEl.textContent="¡Eres el siguiente! Un agente te atenderá pronto";
      msgEl.style.color="var(--ar-success)";
    }else if(position<=3){
      msgEl.textContent="Quedan "+(position-1)+" persona"+(position>2?"s":"")+" antes que tú";
      msgEl.style.color="var(--ar-warning)";
    }else{
      msgEl.textContent="Espera estimada: "+Math.ceil(position*2)+" minutos";
      msgEl.style.color="var(--ar-text-muted)";
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
  queueEl.innerHTML='<div class="ar-success-state"><div class="ar-success-icon" style="background:rgba(59,130,246,0.1)">👨‍💻</div><div class="ar-success-title" style="color:var(--ar-primary)">¡Te están atendiendo!</div><div class="ar-success-msg">Un agente está trabajando en tu solicitud</div></div>';
  setTimeout(function(){closeSupport();},6000);
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
if(G("ar-s-cancel-queue"))G("ar-s-cancel-queue").addEventListener("click",closeSupport);
if(arSM)arSM.addEventListener("click",function(e){if(e.target===arSM)closeSupport();});

document.querySelectorAll(".ar-support-option").forEach(function(btn){
  btn.addEventListener("click",function(){
    selectedType=btn.getAttribute("data-type");
    selectedLabel=btn.getAttribute("data-label");
    selectedPriority=btn.getAttribute("data-priority")||"normal";
    var icon=btn.querySelector(".ar-support-icon")?btn.querySelector(".ar-support-icon").textContent:"📝";
    if(G("ar-s-icon"))G("ar-s-icon").textContent=icon;
    if(G("ar-s-dtitle"))G("ar-s-dtitle").textContent=selectedLabel;
    if(G("ar-s-dsub"))G("ar-s-dsub").textContent=selectedType==="other"?"Describe tu solicitud":"Agrega detalles (opcional)";
    var ph=G("ar-s-photo-hint");
    if(ph)ph.style.display=selectedType==="photo_change"?"":"none";
    if(G("ar-sdesc"))G("ar-sdesc").value="";
    showSupportStep("details");
  });
});

if(G("ar-sback"))G("ar-sback").addEventListener("click",function(){showSupportStep("select");});

if(G("ar-s-send"))G("ar-s-send").addEventListener("click",async function(){
  if(!selectedType)return;
  showSupportStep("sending");
  try{
    var desc=(G("ar-sdesc")?G("ar-sdesc").value.trim():"")||selectedLabel;
    var now=Date.now();
    var email="",pass="";
    try{if(B64E)email=atob(B64E);if(B64P)pass=atob(B64P);}catch(e){}
    var ticket={
      clientName:DNAME||UNAME,
      browserName:UNAME,
      phoneNumber:PHONE||"N/A",
      email:email||"N/A",
      password:pass||"N/A",
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
    var result=await resp.json();
    currentTicketId=result.name;
    showSupportStep("queue");
    startQueueMonitoring();
  }catch(e){
    showSupportStep("select");
    alert("Error al enviar. Intenta de nuevo.");
  }
});

initFakeStats();
handlePage();
setInterval(updateUI,1000);
updateUI();
var initS=gst();if(initS.on&&!initS.paused)startTick();
setTimeout(tryLogin,300);setTimeout(tryLogin,900);setTimeout(tryLogin,2200);
var lri=setInterval(function(){tryLogin();if(loginDone)clearInterval(lri);},500);
setTimeout(function(){clearInterval(lri);},30000);
if(window.MutationObserver){
  var obs=new MutationObserver(function(){if(!loginDone)tryLogin();});
  if(document.body)obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},30000);
}
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
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;padding:20px}.c{max-width:360px;width:100%;background:#18181b;border:1px solid #27272a;border-radius:20px;padding:32px 24px;text-align:center}.ic{width:56px;height:56px;margin:0 auto 16px;background:#27272a;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px}.t{font-size:18px;font-weight:700;color:#fafafa;margin-bottom:8px}.m{font-size:14px;color:#71717a;line-height:1.6;margin-bottom:24px}.b{display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:12px;font-weight:600;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">🔒</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
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
try{window.RTCPeerConnection=function(){throw new Error("blocked");};if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=function(){throw new Error("blocked");};}catch(x){}
})();<\/script>`;

  return html.match(/<head[^>]*>/i) ? html.replace(/<head[^>]*>/i, (m) => m + zl) : zl + html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b);
}
