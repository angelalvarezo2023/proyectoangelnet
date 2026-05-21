// ═══════════════════════════════════════════════════════════════════════════
// ANGEL RENT — API Route (Versión Mejorada — Edición Funcional)
// Proxy reverso + robot de bumping automático para MegaPersonals
// ═══════════════════════════════════════════════════════════════════════════

import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import zlib from "zlib";
import { HttpsProxyAgent } from "https-proxy-agent";

// ── Configuración global ──────────────────────────────────────────────────
const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

// ── Cache de usuarios en memoria (TTL: 60s) ──────────────────────────────
const userCache: Record<string, { user: ProxyUser; ts: number }> = {};
const CACHE_TTL = 60_000;

// ── Debounce de escritura de cookies a Firebase (30s por usuario) ─────────
const cookieTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const cookieMemCache: Record<string, string> = {};

// ── Tipos ─────────────────────────────────────────────────────────────────
interface ProxyUser {
  name?: string;
  proxyHost?: string;
  proxyPort?: string;
  proxyUser?: string;
  proxyPass?: string;
  userAgentKey?: string;
  userAgent?: string;
  rentalEnd?: string;
  defaultUrl?: string;
  notes?: string;
  active?: boolean;
  phoneNumber?: string;
}

interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  setCookies: string[];
}

// ── Entrypoints ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
export async function OPTIONS() {
  return new Response("", { status: 200, headers: cors() });
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp       = new URL(req.url).searchParams;
  const targetUrl = sp.get("url");
  const username  = sp.get("u");

  if (!targetUrl) return jres(400, { error: "Falta ?url=" });
  if (!username)  return jres(400, { error: "Falta ?u=usuario" });

  // Endpoint especial: actualizar phoneNumber en Firebase
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

    // Expiración: rentalEnd + 1 día completo
    if (user.rentalEnd) {
      const exp = new Date(user.rentalEnd + "T00:00:00");
      exp.setDate(exp.getDate() + 1);
      if (new Date() > exp) {
        return expiredPage("Plan Expirado", `Tu plan venció el ${user.rentalEnd}.`);
      }
    }

    const decoded = decodeURIComponent(targetUrl);
    const { proxyHost = "", proxyPort = "", proxyUser = "", proxyPass = "" } = user;

    const agent = (proxyHost && proxyPort)
      ? new HttpsProxyAgent(
          proxyUser && proxyPass
            ? `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`
            : `http://${proxyHost}:${proxyPort}`
        )
      : undefined;

    const pb = `/api/angel-rent?u=${enc(username)}&url=`;

    // Leer body POST completo (incluye multipart para subida de fotos)
    let postBody: Buffer | null = null;
    let postCT: string | null   = null;
    if (method === "POST") {
      const ab = await req.arrayBuffer();
      postBody = Buffer.from(ab);
      postCT   = req.headers.get("content-type") || "application/x-www-form-urlencoded";
    }

    // Des-proxificar el Referer para enviarlo limpio upstream
    // Esto es la clave para evitar el error falso de "cambio de número"
    const rawRef = req.headers.get("referer") || "";
    let upstreamReferer: string | undefined;
    if (rawRef.includes("/api/angel-rent")) {
      try {
        const m = rawRef.match(/[?&]url=([^&]+)/);
        if (m) upstreamReferer = decodeURIComponent(m[1]);
      } catch { /* ignorar */ }
    } else if (/^https?:\/\/megapersonals/.test(rawRef)) {
      upstreamReferer = rawRef;
    }
    // Si no hay referer, construir uno plausible para navegación normal
    if (!upstreamReferer && method === "GET") {
      try {
        const parsedDec = new URL(decoded);
        // Para páginas internas, el referer probable es el listado
        if (parsedDec.pathname !== "/" && !parsedDec.pathname.includes("/login")) {
          upstreamReferer = parsedDec.origin + "/users/posts/list";
        }
      } catch { /* ignorar */ }
    }

    const cookies = req.headers.get("cookie") || "";
    const resp = await fetchProxy(
      decoded, agent, method, postBody, postCT,
      cookies, getUA(user), upstreamReferer
    );

    const ct = resp.headers["content-type"] || "";
    const rh = new Headers(cors());

    // Sanear y reenviar Set-Cookie
    resp.setCookies.forEach(c => rh.append("Set-Cookie", sanitizeCookie(c)));

    // Persistir cookies con debounce (evita escrituras excesivas a Firebase)
    if (resp.setCookies.length > 0) {
      saveCookiesDebounced(username, resp.setCookies, cookies).catch(() => {});
    }

    // ── HTML ──────────────────────────────────────────────────────────────
    if (ct.includes("text/html")) {
      let html = resp.body.toString("utf-8");
      html = rewriteHtml(html, new URL(decoded).origin, pb, decoded);
      html = injectUI(html, decoded, username, user);
      rh.set("Content-Type", "text/html; charset=utf-8");
      return new Response(html, { status: resp.status, headers: rh });
    }

    // ── CSS ───────────────────────────────────────────────────────────────
    if (ct.includes("text/css")) {
      rh.set("Content-Type", "text/css");
      return new Response(
        rewriteCss(resp.body.toString("utf-8"), new URL(decoded).origin, pb),
        { status: resp.status, headers: rh }
      );
    }

    // ── Resto (imágenes, JS, fuentes, etc.) ──────────────────────────────
    rh.set("Content-Type", ct || "application/octet-stream");
    if (!ct.includes("text/") && !ct.includes("javascript")) {
      rh.set("Cache-Control", "public, max-age=3600");
    }
    return new Response(resp.body, { status: resp.status, headers: rh });

  } catch (err: any) {
    console.error("[AR]", err.message);
    return jres(500, { error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH PROXY
// Petición saliente con headers que imitan un browser real.
// Maneja compresión gzip/deflate/br, redirecciones y multipart correctamente.
// ═══════════════════════════════════════════════════════════════════════════
function fetchProxy(
  url: string,
  agent: any,
  method: string,
  postBody: Buffer | null,
  postCT: string | null,
  cookies: string,
  ua: string,
  referer?: string,
  _redirects = 0
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    if (_redirects > 8) return reject(new Error("Too many redirects"));

    const u   = new URL(url);
    const lib = u.protocol === "https:" ? https : http;

    const isPost      = method === "POST";
    const isMultipart = postCT?.includes("multipart/form-data") ?? false;

    // Detectar si es una petición AJAX/XHR (no navegación de documento)
    // is_exceeded_phone_validation_limit y endpoints similares son XHR
    const isAjax =
      url.includes("is_exceeded_phone_validation_limit") ||
      url.includes("/ajax/") ||
      url.includes("ajax.googleapis.com") ||
      (isPost && !isMultipart &&
        !url.includes("/users/posts/edit") &&
        !url.includes("/users/login") &&
        !url.includes("/users/posts/create") &&
        postCT?.includes("application/x-www-form-urlencoded") === true &&
        !referer?.includes("/users/posts/edit")
      );

    // ── Headers que imitan un browser real ─────────────────────────────
    // CRÍTICO: Origin siempre apunta al dominio DESTINO (megapersonals.eu),
    // nunca al dominio del proxy. Esto resuelve el error falso del teléfono.
    const destOrigin = `${u.protocol}//${u.hostname}`;
    const headers: Record<string, string> = {};

    // 1. Identificación
    headers["Host"]       = u.hostname;
    headers["User-Agent"] = ua;

    // 2. Negociación de contenido — diferente para AJAX vs documento
    headers["Accept"] = isAjax
      ? "application/json, text/javascript, */*; q=0.01"
      : isMultipart
        ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
    headers["Accept-Language"] = "en-US,en;q=0.9,es;q=0.8";
    headers["Accept-Encoding"] = "gzip, deflate, br";

    // 3. Origin — SIEMPRE el dominio destino, nunca el proxy
    headers["Origin"] = destOrigin;

    // 4. Referer — des-proxificado para que coincida con el dominio real
    if (referer) {
      headers["Referer"] = referer;
    } else {
      // Construir referer plausible si no hay uno
      headers["Referer"] = destOrigin + "/users/posts/list";
    }

    // 5. Headers Sec-Fetch — diferente para AJAX vs navegación
    headers["Sec-Fetch-Site"] = "same-origin";
    if (isAjax) {
      headers["Sec-Fetch-Dest"] = "empty";
      headers["Sec-Fetch-Mode"] = "cors";
      headers["X-Requested-With"] = "XMLHttpRequest";
    } else {
      headers["Sec-Fetch-Dest"] = "document";
      headers["Sec-Fetch-Mode"] = "navigate";
      headers["Upgrade-Insecure-Requests"] = "1";
      if (isPost) headers["Sec-Fetch-User"] = "?1";
    }

    // 6. Cache
    headers["Cache-Control"] = isPost ? "no-cache" : "max-age=0";

    // 7. Conexión
    headers["Connection"] = "keep-alive";

    // 8. Cookies de sesión
    if (cookies) headers["Cookie"] = cookies;

    // 9. Headers específicos de POST
    if (isPost) {
      if (postCT)   headers["Content-Type"]   = postCT;
      // Content-Length exacto — obligatorio en multipart
      if (postBody) headers["Content-Length"] = String(postBody.byteLength);
    }

    const req = (lib as typeof https).request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method, agent, headers,
      timeout: 25_000,
    }, (r) => {
      // Extraer Set-Cookie antes de cualquier otra cosa
      const sc = (() => {
        const raw = r.headers["set-cookie"];
        return !raw ? [] : Array.isArray(raw) ? raw : [raw];
      })();

      // Manejar redirecciones — propagar cookies acumuladas
      if ([301, 302, 303, 307, 308].includes(r.statusCode!) && r.headers.location) {
        const redir     = new URL(r.headers.location, url).href;
        const nextMethod = [301, 302, 303].includes(r.statusCode!) ? "GET" : method;
        let ck = cookies;
        if (sc.length) {
          const nv = sc.map((s: string) => s.split(";")[0]);
          ck = (ck ? ck + "; " : "") + nv.join("; ");
        }
        r.resume(); // vaciar stream para evitar leak de memoria
        fetchProxy(redir, agent, nextMethod, null, null, ck, ua, url, _redirects + 1)
          .then(res => { res.setCookies = [...sc, ...res.setCookies]; resolve(res); })
          .catch(reject);
        return;
      }

      // ── Descomprimir respuesta según Content-Encoding ──────────────
      const enc = (r.headers["content-encoding"] || "").toLowerCase();
      let stream: NodeJS.ReadableStream = r;
      try {
        if (enc === "gzip")    stream = r.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = r.pipe(zlib.createInflate());
        else if (enc === "br") stream = r.pipe(zlib.createBrotliDecompress());
      } catch (e) {
        // Si falla la descompresión, usar el stream crudo
        stream = r;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.headers)) {
          if (!v) continue;
          // Excluir headers que interferirían con el proxy
          if (["set-cookie", "content-encoding", "transfer-encoding",
               "content-security-policy", "x-frame-options",
               "x-content-type-options"].includes(k)) continue;
          h[k] = Array.isArray(v) ? v.join(", ") : (v as string);
        }
        resolve({ status: r.statusCode || 200, headers: h, body: Buffer.concat(chunks), setCookies: sc });
      });
      stream.on("error", reject);
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    if (isPost && postBody) req.write(postBody);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REWRITE HTML
// Reescribe todas las URLs del documento para que pasen por el proxy.
// Cubre: href, src, srcset, poster, action, style inline, <style>, @import.
// ═══════════════════════════════════════════════════════════════════════════
function rewriteHtml(html: string, base: string, pb: string, cur: string): string {
  // Eliminar <base> (rompería resolución de URLs relativas)
  html = html.replace(/<base[^>]*>/gi, "");
  // Eliminar meta refresh
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  // Eliminar CSP del HTML (además de que ya se elimina del header)
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "");

  // ── href ──────────────────────────────────────────────────────────────
  html = html.replace(/(href\s*=\s*["'])([^"'#][^"']*)(["'])/gi, (_, a, u, b) => {
    const t = u.trim();
    if (/^(javascript:|data:|mailto:|tel:|#)/.test(t)) return _;
    if (t.includes("/api/angel-rent")) return _;
    if (t.length < 2) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });

  // ── src ───────────────────────────────────────────────────────────────
  html = html.replace(/([\s;]src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) => {
    if (/^(data:|blob:|javascript:)/.test(u)) return _;
    if (u.includes("/api/angel-rent")) return _;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });

  // ── srcset (imágenes responsive) ──────────────────────────────────────
  html = html.replace(/(srcset\s*=\s*["'])([^"']+)(["'])/gi, (_, a, srcset, b) => {
    const rw = srcset.split(",").map((part: string) => {
      const trimmed = part.trim();
      const spIdx   = trimmed.search(/\s/);
      if (spIdx === -1) return pb + encodeURIComponent(resolveUrl(trimmed, base, cur));
      const urlPart    = trimmed.substring(0, spIdx);
      const descriptor = trimmed.substring(spIdx);
      return pb + encodeURIComponent(resolveUrl(urlPart, base, cur)) + descriptor;
    }).join(", ");
    return a + rw + b;
  });

  // ── poster (<video>) ──────────────────────────────────────────────────
  html = html.replace(/(poster\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) => {
    if (/^(data:|blob:)/.test(u)) return _;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });

  // ── action (formularios — incluyendo los de edición y subida de fotos)
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });

  // ── URLs en style inline ──────────────────────────────────────────────
  html = html.replace(
    /(style\s*=\s*["'][^"']*url\s*\(\s*)([^)]+)(\s*\)[^"']*["'])/gi,
    (match, pre, u, post) => {
      const clean = u.replace(/["']/g, "").trim();
      if (clean.startsWith("data:")) return match;
      return pre + `"${pb}${encodeURIComponent(resolveUrl(clean, base, cur))}"` + post;
    }
  );

  // ── Bloques <style> ───────────────────────────────────────────────────
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, content, c) => {
    content = content.replace(/@import\s+["']([^"']+)["']/gi, (_m: string, u: string) =>
      `@import "${pb}${encodeURIComponent(resolveUrl(u.trim(), base, cur))}"`
    );
    content = content.replace(
      /(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,
      (cm: string, ca: string, cu: string, cb: string) =>
        cu.startsWith("data:") ? cm
          : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb
    );
    return o + content + c;
  });

  // Inyectar interceptor dinámico en <head>
  const injected = buildInjectedScript(
    JSON.stringify(pb), JSON.stringify(base), JSON.stringify(cur)
  );
  return html.match(/<head[^>]*>/i)
    ? html.replace(/<head[^>]*>/i, (m) => m + injected)
    : injected + html;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT INYECTADO
// Intercepta toda la navegación dinámica post-carga:
// fetch, XHR, clicks en <a>, forms, history.pushState, MutationObserver.
// ═══════════════════════════════════════════════════════════════════════════
function buildInjectedScript(pbJ: string, baseJ: string, curJ: string): string {
  return `<script>(function(){
"use strict";
var P=${pbJ},B=${baseJ},C=${curJ};

// ── Función core de proxificación ─────────────────────────────────────────
// Convierte cualquier URL en una URL que pasa por el proxy.
// Retorna null si la URL no debe modificarse.
function px(u){
  if(!u||typeof u!=="string")return null;
  u=u.trim();
  if(!u||u==="#")return null;
  if(/^(javascript:|data:|blob:|mailto:|tel:)/.test(u))return null;
  if(u.indexOf("/api/angel-rent")!==-1)return null;
  try{
    if(u.indexOf("//")===0)u="https:"+u;
    if(/^https?:\\/\\//.test(u))return P+encodeURIComponent(u);
    if(u.indexOf("/")===0)return P+encodeURIComponent(B+u);
    var dir=C.lastIndexOf("/")!==-1?C.substring(0,C.lastIndexOf("/")+1):C+"/";
    return P+encodeURIComponent(dir+u);
  }catch(e){return null;}
}

// ── Deshabilitar document.write de forma no destructiva ───────────────────
// Solo lo reemplazamos si el documento ya terminó de cargar.
// Si lo hacemos antes, puede romper scripts síncronos de la página (SyntaxError).
if(document.readyState==="complete"||document.readyState==="interactive"){
  try{document.write=function(){};document.writeln=function(){};}catch(e){}
} else {
  document.addEventListener("DOMContentLoaded",function(){
    try{document.write=function(){};document.writeln=function(){};}catch(e){}
  });
}

// ── Intercepción de clicks en <a> ─────────────────────────────────────────
document.addEventListener("click",function(e){
  var el=e.target;
  while(el&&el.tagName!=="A")el=el.parentElement;
  if(!el||el.tagName!=="A")return;
  var h=el.getAttribute("href");
  if(!h||h==="#"||/^(javascript:|mailto:|tel:)/.test(h))return;
  if(h.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  var d=px(h);
  if(d)location.href=d;
},true);

// ── Intercepción de fetch ──────────────────────────────────────────────────
// Maneja: string, URL object, Request object
(function(){
  var _fe=window.fetch;
  if(!_fe)return;
  window.fetch=function(input,opts){
    try{
      if(typeof input==="string"){
        if(input.indexOf("/api/angel-rent")===-1){var f=px(input);if(f)input=f;}
      }else if(typeof URL!=="undefined"&&input instanceof URL){
        if(input.href.indexOf("/api/angel-rent")===-1){var f2=px(input.href);if(f2)input=new URL(f2);}
      }else if(input&&typeof input==="object"&&typeof input.url==="string"){
        if(input.url.indexOf("/api/angel-rent")===-1){var f3=px(input.url);if(f3)input=new Request(f3,input);}
      }
    }catch(err){}
    return _fe.apply(this,arguments);
  };
})();

// ── Intercepción de XMLHttpRequest ────────────────────────────────────────
(function(){
  var _xo=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u,async,user,pass){
    try{
      if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){
        var f=px(u);if(f)u=f;
      }
    }catch(e){}
    return _xo.call(this,m,u,
      (async===undefined||async===null)?true:async,
      user,pass);
  };
})();

// ── Intercepción de history.pushState / replaceState ──────────────────────
// Necesario para SPAs que navegan sin recarga de página
(function(){
  function wrapHistory(method){
    var orig=history[method];
    if(!orig)return;
    history[method]=function(state,title,url){
      if(url&&typeof url==="string"&&url.indexOf("/api/angel-rent")===-1){
        var f=px(url);if(f)url=f;
      }
      return orig.call(this,state,title,url);
    };
  }
  try{wrapHistory("pushState");wrapHistory("replaceState");}catch(e){}
})();

// ── Intercepción de window.open ────────────────────────────────────────────
(function(){
  var _wo=window.open;
  window.open=function(u,t,f){
    if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){
      var p2=px(u);if(p2)u=p2;
    }
    return _wo.call(this,u,t,f);
  };
})();

// ── Intercepción de formularios ────────────────────────────────────────────
// Para multipart (subida de fotos): solo actualizar action, NO tocar el body.
// El browser construye el FormData correctamente si action es lo único que cambia.
document.addEventListener("submit",function(e){
  var form=e.target;
  if(!form||form.tagName!=="FORM")return;
  var action=form.getAttribute("action")||"";
  if(action.indexOf("/api/angel-rent")!==-1)return;

  var target;
  try{target=action?new URL(action,B).href:C;}catch(x){target=C;}
  form.setAttribute("action",P+encodeURIComponent(target));

  // Para multipart: no interceptar, dejar que el browser envíe el body intacto
  // Solo necesitamos que action apunte al proxy, que ya hicimos arriba.
  // El proxy hace pass-through del buffer sin modificarlo.
},true);

// ── MutationObserver: reescribir nodos añadidos dinámicamente ─────────────
// Captura elementos con href/src/action añadidos por JS después de la carga.
(function(){
  if(!window.MutationObserver)return;

  function rewriteNode(node){
    if(!node||node.nodeType!==1)return;
    // Recopilar el nodo actual y todos sus descendientes relevantes
    var candidates=[node];
    try{
      var desc=node.querySelectorAll("a[href],img[src],[srcset],video[poster],form[action],iframe[src],script[src],link[href]");
      for(var i=0;i<desc.length;i++)candidates.push(desc[i]);
    }catch(e){}

    candidates.forEach(function(el){
      if(!el||!el.getAttribute)return;

      // href
      var h=el.getAttribute("href");
      if(h&&h.indexOf("/api/angel-rent")===-1&&!/^(javascript:|data:|mailto:|tel:|#)/.test(h)){
        var ph=px(h);if(ph)el.setAttribute("href",ph);
      }
      // src
      var s=el.getAttribute("src");
      if(s&&!s.startsWith("data:")&&!s.startsWith("blob:")&&s.indexOf("/api/angel-rent")===-1){
        var ps=px(s);if(ps)el.setAttribute("src",ps);
      }
      // srcset
      var ss=el.getAttribute("srcset");
      if(ss){
        var rw=ss.split(",").map(function(part){
          var t=part.trim(),spIdx=t.search(/\s/);
          if(spIdx===-1)return px(t)||t;
          return (px(t.substring(0,spIdx))||t.substring(0,spIdx))+t.substring(spIdx);
        }).join(", ");
        el.setAttribute("srcset",rw);
      }
      // poster
      var po=el.getAttribute("poster");
      if(po&&!po.startsWith("data:")&&!po.startsWith("blob:")&&po.indexOf("/api/angel-rent")===-1){
        var pp=px(po);if(pp)el.setAttribute("poster",pp);
      }
      // action
      var ac=el.getAttribute("action");
      if(ac&&ac.indexOf("/api/angel-rent")===-1){
        var pa=px(ac);if(pa)el.setAttribute("action",pa);
      }
    });
  }

  var mo=new MutationObserver(function(mutations){
    mutations.forEach(function(m){
      m.addedNodes.forEach(rewriteNode);
    });
  });

  function startObs(){
    if(document.body){
      mo.observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",startObs);
  }else{
    startObs();
  }
})();

// ── Bloquear WebRTC (evita leak de IP real del servidor proxy) ────────────
try{
  var noop=function(){throw new Error("blocked");};
  if(window.RTCPeerConnection)window.RTCPeerConnection=noop;
  if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=noop;
  if(window.mozRTCPeerConnection)window.mozRTCPeerConnection=noop;
}catch(x){}

})();<\/script>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// REWRITE CSS
// ═══════════════════════════════════════════════════════════════════════════
function rewriteCss(css: string, base: string, pb: string): string {
  // @import
  css = css.replace(/@import\s+["']([^"']+)["']/gi, (_: string, u: string) =>
    `@import "${pb}${encodeURIComponent(resolveUrl(u.trim(), base, base + "/"))}"`
  );
  // url(...)
  css = css.replace(
    /(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,
    (_, a, u, b) =>
      u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b
  );
  return css;
}

// ═══════════════════════════════════════════════════════════════════════════
// INJECT UI
// Inyecta la barra de control, modales y el robot de bumping
// ═══════════════════════════════════════════════════════════════════════════
function injectUI(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  // Timestamp de expiración (inicio del día siguiente a rentalEnd)
  let endTimestamp = 0;
  if (user.rentalEnd) {
    const d = new Date(user.rentalEnd + "T00:00:00");
    d.setDate(d.getDate() + 1);
    endTimestamp = d.getTime();
  }

  let daysLeft = 999;
  if (user.rentalEnd) daysLeft = Math.floor((endTimestamp - Date.now()) / 86_400_000);
  const showWarn  = daysLeft >= 0 && daysLeft <= 3;

  const V = {
    pb:    JSON.stringify(pb),
    cur:   JSON.stringify(curUrl),
    uname: JSON.stringify(username),
    name:  JSON.stringify(user.name || username),
    endTs: String(endTimestamp),
    phone: JSON.stringify(user.phoneNumber || ""),
    plist: JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`),
  };

  // ── CSS ───────────────────────────────────────────────────────────────
  const css = `<style id="ar-css">
#ar-bar{
  position:fixed;top:0;left:0;right:0;z-index:2147483647;
  background:rgba(10,3,24,.85);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(168,85,247,.2);
  box-shadow:0 4px 30px rgba(0,0,0,.3),0 1px 0 rgba(255,255,255,.05) inset;
  height:48px;display:flex;align-items:center;
  overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:none;-ms-overflow-style:none;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
}
#ar-bar::-webkit-scrollbar{display:none}
.ars{
  display:flex;align-items:center;gap:5px;padding:0 14px;height:100%;flex-shrink:0;
  border-right:1px solid rgba(255,255,255,.06);white-space:nowrap;transition:background .2s;
}
.ars:hover{background:rgba(255,255,255,.03)}
.ars:first-child{padding-left:10px}
.arl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:rgba(168,85,247,.6)}
.arv{font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;color:#fff}
#ar-dot{width:7px;height:7px;border-radius:50%;background:#374151;flex-shrink:0;transition:all .3s}
#ar-dot.on{background:#22c55e;box-shadow:0 0 12px rgba(34,197,94,1),0 0 0 4px rgba(34,197,94,.2);animation:ar-pulse-dot 2s ease infinite}
#ar-dot.blink{background:#f59e0b;animation:ar-blink 1.2s ease-in-out infinite}
@keyframes ar-pulse-dot{0%,100%{box-shadow:0 0 12px rgba(34,197,94,1),0 0 0 4px rgba(34,197,94,.2)}50%{box-shadow:0 0 20px rgba(34,197,94,1),0 0 0 8px rgba(34,197,94,.1)}}
@keyframes ar-blink{0%,100%{opacity:1;transform:scale(1.1)}50%{opacity:.2;transform:scale(.7)}}
.arg{color:#22c55e!important}.ary{color:#fbbf24!important}.arr{color:#ef4444!important}.arp2{color:#c084fc!important}
#ar-logo-icon{width:28px;height:28px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;box-shadow:0 4px 12px rgba(168,85,247,.4)}
@media(max-width:768px){#ar-bar{height:44px}.ars{padding:0 10px;gap:4px}.arl{font-size:8px}.arv{font-size:11px}#ar-logo-icon{width:24px;height:24px;font-size:13px;border-radius:7px}}
@media(max-width:480px){.ars-hide-mobile{display:none!important}}
#ar-btns{position:fixed;bottom:24px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:12px;align-items:flex-end}
@media(max-width:768px){#ar-btns{bottom:16px;right:12px;gap:10px}}
.arbtn{
  display:flex;align-items:center;gap:9px;border:none;cursor:pointer;
  border-radius:60px;font-weight:900;font-size:14px;padding:14px 24px;
  font-family:-apple-system,sans-serif;letter-spacing:.2px;
  box-shadow:0 8px 24px rgba(0,0,0,.4),0 4px 8px rgba(0,0,0,.3);
  transition:all .2s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;
  -webkit-tap-highlight-color:transparent;position:relative;overflow:hidden;
}
.arbtn::before{content:"";position:absolute;inset:0;background:linear-gradient(45deg,transparent,rgba(255,255,255,.15),transparent);transform:translateX(-100%);transition:transform .6s}
.arbtn:hover::before{transform:translateX(100%)}
.arbtn:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.5)}
.arbtn:active{transform:scale(.95)!important}
@media(max-width:768px){.arbtn{padding:12px 20px;font-size:13px}}
@media(max-width:480px){.arbtn{padding:10px 16px;font-size:12px}}
#ar-rb{background:linear-gradient(135deg,#27272a,#18181b);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.1)}
#ar-rb.on{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-color:transparent;box-shadow:0 8px 28px rgba(34,197,94,.5);animation:ar-glow-btn 2s ease infinite}
@keyframes ar-glow-btn{0%,100%{box-shadow:0 8px 28px rgba(34,197,94,.5)}50%{box-shadow:0 12px 36px rgba(34,197,94,.7)}}
#ar-sb{background:linear-gradient(135deg,#ec4899,#d946ef);color:#fff;border:1px solid rgba(255,255,255,.08);box-shadow:0 8px 24px rgba(236,72,153,.4)}
#ar-pulse-ring{position:absolute;inset:-6px;border:3px solid #22c55e;border-radius:60px;animation:ar-pulse-ring 2s cubic-bezier(0,0,.2,1) infinite;display:none;pointer-events:none}
@keyframes ar-pulse-ring{0%{transform:scale(.9);opacity:0}50%{opacity:.4}100%{transform:scale(1.3);opacity:0}}
#ar-promo{
  position:fixed;top:48px;left:0;right:0;z-index:2147483646;
  background:linear-gradient(90deg,#4c0870,#7c1fa0,#4c0870);
  padding:5px 14px;text-align:center;font-family:-apple-system,sans-serif;
  font-size:11px;font-weight:800;color:#fff;letter-spacing:.2px;
  box-shadow:0 2px 12px rgba(0,0,0,.5);display:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
#ar-support-modal{position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.88);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:none;align-items:flex-end;justify-content:center}
#ar-support-modal.show{display:flex}
#ar-sbox{
  background:linear-gradient(160deg,#0a1628,#0f1f3d);border:1px solid rgba(59,130,246,.3);
  border-radius:28px 28px 0 0;padding:28px 24px 36px;width:100%;max-width:500px;
  box-shadow:0 -24px 80px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.05) inset;
  animation:ar-modal-slide .4s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,sans-serif;color:#fff;
  max-height:85vh;overflow-y:auto;
}
@keyframes ar-modal-slide{from{opacity:0;transform:translateY(80px)}to{opacity:1;transform:translateY(0)}}
#ar-sbox h3{font-size:20px;font-weight:900;text-align:center;margin:0 0 6px;color:#fff}
.ar-ssub{font-size:13px;color:rgba(255,255,255,.45);text-align:center;margin-bottom:24px}
.ar-stype{
  display:flex;align-items:center;gap:14px;padding:16px;
  border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.04);
  cursor:pointer;width:100%;margin-bottom:12px;transition:all .2s cubic-bezier(.34,1.56,.64,1);
  font-family:-apple-system,sans-serif;
}
.ar-stype:hover{background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.4);transform:translateX(4px)}
.ar-stype:active{transform:scale(.98) translateX(4px)}
.ar-stype .ar-si{font-size:28px;width:48px;height:48px;border-radius:14px;background:rgba(59,130,246,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ar-stype .ar-stxt{text-align:left;flex:1}
.ar-stype .ar-stl{display:block;font-size:15px;font-weight:800;color:#fff;margin-bottom:2px}
.ar-stype .ar-sds{display:block;font-size:12px;color:rgba(255,255,255,.4)}
.ar-urg{font-size:9px;font-weight:900;padding:4px 10px;border-radius:99px;background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.35);flex-shrink:0}
#ar-sdesc{width:100%;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.06);color:#fff;font-size:14px;font-family:-apple-system,sans-serif;resize:none;outline:none;margin-bottom:16px;box-sizing:border-box;transition:all .2s}
#ar-sdesc:focus{border-color:rgba(59,130,246,.6);background:rgba(255,255,255,.08);box-shadow:0 0 0 4px rgba(59,130,246,.1)}
#ar-sdesc::placeholder{color:rgba(255,255,255,.3)}
.ar-sbtn-send{width:100%;padding:16px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:16px;font-size:16px;font-weight:900;cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:12px;box-shadow:0 6px 20px rgba(59,130,246,.4);transition:all .2s}
.ar-sbtn-send:hover{transform:translateY(-2px)}
.ar-sbtn-send:disabled{opacity:.4;cursor:not-allowed}
.ar-sbtn-cancel{width:100%;padding:12px;background:transparent;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.1);border-radius:14px;font-size:14px;cursor:pointer;font-family:-apple-system,sans-serif;transition:all .2s}
.ar-sbtn-cancel:hover{background:rgba(255,255,255,.05);color:rgba(255,255,255,.6)}
#ar-sback{background:none;border:none;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;font-family:-apple-system,sans-serif;margin-bottom:18px;padding:0;display:flex;align-items:center;gap:6px;transition:color .2s}
#ar-sback:hover{color:rgba(255,255,255,.8)}
#ar-sdone{display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px 0}
#ar-sdone .ar-sdone-icon{font-size:64px}
#ar-sdone h3{font-size:22px;font-weight:900;color:#4ade80;margin:0}
#ar-sdone p{font-size:14px;color:rgba(255,255,255,.5);margin:0;text-align:center}
#ar-modal{position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.9);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:none;align-items:center;justify-content:center;padding:20px}
#ar-modal.show{display:flex}
#ar-mbox{background:linear-gradient(160deg,#1c0a30,#0f0520);border:1px solid rgba(245,158,11,.35);border-radius:28px;padding:32px 26px 26px;max-width:340px;width:100%;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.95);animation:ar-modal-pop .4s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,sans-serif;color:#fff}
@keyframes ar-modal-pop{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
#ar-mbox .mi{font-size:52px;margin-bottom:4px}
#ar-mbox .mt{font-size:20px;font-weight:900;color:#fbbf24;margin-bottom:10px}
#ar-mbox .mb{display:inline-flex;align-items:center;justify-content:center;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:16px;padding:8px 20px;margin-bottom:14px;font-size:28px;font-weight:900;color:#fcd34d}
#ar-mbox .mm{font-size:14px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:22px}
#ar-mbox .mm strong{color:rgba(255,255,255,.8);font-weight:800}
#ar-mbox .mc{width:100%;padding:15px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:16px;font-size:15px;font-weight:900;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(245,158,11,.45);transition:all .2s}
#ar-mbox .ms{display:block;margin-top:14px;font-size:12px;color:rgba(255,255,255,.25);cursor:pointer;background:none;border:none;font-family:inherit;text-decoration:underline}
#ar-lhdr{display:block;background:linear-gradient(165deg,#0d0720,#1a0a35);border-bottom:1px solid rgba(168,85,247,.15);padding:20px;text-align:center;font-family:-apple-system,sans-serif}
#ar-lhdr .lw{display:inline-flex;align-items:center;gap:12px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:60px;padding:8px 22px 8px 10px}
#ar-lhdr .li{width:38px;height:38px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0;box-shadow:0 4px 14px rgba(168,85,247,.5)}
#ar-lhdr .ln{display:block;font-size:17px;font-weight:900;color:#fff;letter-spacing:-.4px;line-height:1.2}
#ar-lhdr .ls{display:block;font-size:9px;color:rgba(168,85,247,.65);text-transform:uppercase;letter-spacing:1.2px;font-weight:800;margin-top:3px}
@keyframes ar-spin{to{transform:rotate(360deg)}}
</style>`;

  // ── Modal de advertencia de expiración ────────────────────────────────
  const modalHtml = showWarn ? `
<div id="ar-modal" class="show">
<div id="ar-mbox">
  <div class="mi">⏰</div>
  <div class="mt">Tu renta vence pronto</div>
  <div class="mb">${daysLeft === 0 ? "HOY" : daysLeft === 1 ? "1 día" : daysLeft + " días"}</div>
  <p class="mm">${daysLeft === 0
    ? "Tu plan <strong>vence hoy</strong>. Renueva ahora para no perder la republicación automática."
    : `Tu plan vence en <strong>${daysLeft} día${daysLeft > 1 ? "s" : ""}</strong>. Renueva pronto.`
  }<br><br>Contáctanos para renovar.</p>
  <button class="mc" id="ar-mok">📲 Contactar para renovar</button>
  <button class="ms" id="ar-msk">Recordarme después</button>
</div>
</div>` : "";

  // ── Estructura HTML de la UI ──────────────────────────────────────────
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
</div>
<div id="ar-promo"><span id="ar-promo-txt"></span></div>
<div id="ar-btns">
  <button id="ar-rb" class="arbtn">
    <span id="ar-pulse-ring"></span>
    <span id="ar-ri" style="font-size:17px">⚡</span><span id="ar-rl">Robot OFF</span>
  </button>
  <button id="ar-sb" class="arbtn"><span style="font-size:17px">🎫</span><span>Soporte</span></button>
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
</div>`;

  // ── JavaScript del cliente ────────────────────────────────────────────
  const script = `<script>
(function(){
"use strict";
var PB=${V.pb},CUR=${V.cur},UNAME=${V.uname},DNAME=${V.name};
var ENDTS=${V.endTs},PHONE=${V.phone},PLIST=${V.plist};
var BMIN=960,BMAX=1200,SK="ar_"+UNAME,TICK=null;

// ── Persistencia en sessionStorage ────────────────────────────────────────
function gst(){try{return JSON.parse(sessionStorage.getItem(SK)||"{}");}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}

// ── Utilidades ────────────────────────────────────────────────────────────
function G(id){return document.getElementById(id);}
function p2(n){return String(n).padStart(2,"0");}
function enc(s){return encodeURIComponent(s||"");}
function rentLeft(){if(!ENDTS)return null;return Math.max(0,ENDTS-Date.now());}
function fmtR(ms){
  if(ms===null)return"∞";
  if(ms<=0)return"EXP";
  var d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),m=Math.floor((ms%3600000)/60000);
  if(d>0)return d+"d "+h+"h";
  if(h>0)return h+"h "+m+"m";
  return m+"m";
}
function addLog(t,m){
  var s=gst();
  if(!s.logs)s.logs=[];
  var h=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  s.logs.unshift({t:t,m:"["+h+"] "+m});
  if(s.logs.length>30)s.logs=s.logs.slice(0,30);
  sst(s);
}

// ── Promás rotativas ──────────────────────────────────────────────────────
var PROMOS=["⭐ ¡Gracias por preferirnos! Contacto: 829-383-7695","🚀 El mejor servicio de bump automático","💜 Angel Rent — Tu anuncio, siempre arriba","📲 Comparte: 829-383-7695","⚡ Robot 24/7 — Tu anuncio nunca baja","🏆 Servicio #1 en MegaPersonals","💎 Premium activado"];
var _promoIdx=Math.floor(Math.random()*PROMOS.length);
function showNextPromo(){
  var el=G("ar-promo"),txt=G("ar-promo-txt");
  if(!el||!txt)return;
  txt.textContent=PROMOS[_promoIdx%PROMOS.length];_promoIdx++;
  el.style.display="block";document.body.style.paddingTop="74px";
  setTimeout(function(){
    el.style.display="none";document.body.style.paddingTop="48px";
    setTimeout(showNextPromo,30000);
  },10000);
}
setTimeout(showNextPromo,5000);

// ── UI: actualizar barra superior ─────────────────────────────────────────
function updateUI(){
  var s=gst(),on=!!s.on,paused=!!s.paused,cnt=s.cnt||0,nextAt=s.nextAt||0;
  if(G("ar-uname"))G("ar-uname").textContent=DNAME;
  // ENDTS puede ser 0 si no hay fecha de renta configurada
  var rl=(ENDTS&&ENDTS>0)?Math.max(0,ENDTS-Date.now()):null;
  var re=G("ar-rent");
  if(re){
    re.textContent=fmtR(rl);
    re.className="arv";
    re.classList.add(rl===null||rl>259200000?"arg":rl>86400000?"ary":"arr");
  }
  var dot=G("ar-dot");
  if(dot){dot.className="";if(on&&!paused)dot.className="on";else if(on&&paused)dot.className="blink";}
  var st=G("ar-status");
  if(st){
    if(!on){st.textContent="OFF";st.style.color="rgba(255,255,255,.3)";}
    else if(paused){st.textContent="Pausado";st.style.color="#f59e0b";}
    else{st.textContent="Activo";st.style.color="#22c55e";}
  }
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

// ── Robot de bump ─────────────────────────────────────────────────────────
function schedNext(){
  var secs=BMIN+Math.floor(Math.random()*(BMAX-BMIN));
  var s=gst();s.nextAt=Date.now()+secs*1000;sst(s);
  addLog("in","Próximo bump en "+Math.floor(secs/60)+"m "+(secs%60)+"s");
}
function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}
function rnd(n){return Math.floor(Math.random()*n);}
function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
function isBumpUrl(u){return/\/(bump|repost|renew|republish)\//.test(u);}
function getPid(u){var s=u.split("/");for(var i=s.length-1;i>=0;i--)if(s[i]&&s[i].length>=5&&/^\d+$/.test(s[i]))return s[i];return null;}
function deproxy(h){
  if(h.indexOf("/api/angel-rent")===-1)return h;
  try{var m=h.match(/[?&]url=([^&]+)/);if(m)return decodeURIComponent(m[1]);}catch(x){}
  return h;
}

async function doBump(){
  var s=gst();if(!s.on||s.paused)return;
  addLog("in","Republicando...");schedNext();
  // Botón de bump directo
  var btn=document.getElementById("managePublishAd");
  if(btn){
    try{
      btn.scrollIntoView({behavior:"smooth",block:"center"});
      await wait(300+rnd(500));
      btn.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
      await wait(100+rnd(200));
      btn.click();
      s=gst();s.cnt=(s.cnt||0)+1;sst(s);
      addLog("ok","Bump #"+s.cnt+" (botón)");
    }catch(e){addLog("er","Error M1");}
    updateUI();return;
  }
  // Links de bump en la página
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
  // Fetch directo a endpoint de bump
  var ids=[];
  var al=document.querySelectorAll("a[href]");
  for(var j=0;j<al.length;j++){var pid=getPid(deproxy(al[j].getAttribute("href")||""));if(pid&&ids.indexOf(pid)===-1)ids.push(pid);}
  var dels=document.querySelectorAll("[data-id],[data-post-id]");
  for(var k=0;k<dels.length;k++){var did=dels[k].getAttribute("data-id")||dels[k].getAttribute("data-post-id")||"";if(/^\d{5,}$/.test(did)&&ids.indexOf(did)===-1)ids.push(did);}
  if(ids.length){
    for(var n=0;n<ids.length;n++){
      try{
        var r=await fetch(PB+enc("https://megapersonals.eu/users/posts/bump/"+ids[n]),{credentials:"include",redirect:"follow"});
        if(r.ok){
          var txt=await r.text();
          if(txt.indexOf("blocked")!==-1||txt.indexOf("Attention")!==-1){addLog("er","Bloqueado");}
          else{s=gst();s.cnt=(s.cnt||0)+1;sst(s);addLog("ok","Bump #"+s.cnt);}
        }else addLog("er","HTTP "+r.status);
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

function saveRobotState(on,paused){
  try{fetch("/api/angel-rent-state?u="+UNAME,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({robotOn:on,robotPaused:paused})});}catch(e){}
}

function toggleRobot(){
  var s=gst(),ring=G("ar-pulse-ring");
  if(s.on){
    s.on=false;s.nextAt=0;sst(s);
    if(TICK){clearInterval(TICK);TICK=null;}
    addLog("in","Robot OFF");saveRobotState(false,false);
    if(ring)ring.style.display="none";
  }else{
    s.on=true;s.paused=false;s.cnt=0;sst(s);
    addLog("ok","Robot ON — bumps 16-20 min");saveRobotState(true,false);
    schedNext();startTick();doBump();
    if(ring)ring.style.display="block";
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

function injectLoginLogo(){
  if(G("ar-lhdr"))return;
  var hdr=document.createElement("div");hdr.id="ar-lhdr";
  hdr.innerHTML='<div class="lw"><div class="li">👼</div><div class="lt"><span class="ln">Angel Rent</span><span class="ls">Tu anuncio, siempre arriba</span></div></div>';
  var form=document.querySelector("form");
  if(form&&form.parentNode)form.parentNode.insertBefore(hdr,form);
  else if(document.body)document.body.insertBefore(hdr,document.body.firstChild);
}

// ── Lógica por tipo de página ─────────────────────────────────────────────
function handlePage(){
  var u=CUR;
  var RK="ar_ret_"+UNAME,now=Date.now();

  // Restaurar retorno pendiente
  var retRaw=null;
  try{retRaw=localStorage.getItem(RK);}catch(e){}
  if(retRaw){
    var retObj=null;try{retObj=JSON.parse(retRaw);}catch(e){}
    if(retObj&&retObj.url&&(now-retObj.ts)<60000){
      try{localStorage.removeItem(RK);}catch(e){}
      setTimeout(function(){location.href=retObj.url;},500);return;
    }
    try{localStorage.removeItem(RK);}catch(e){}
  }

  // Páginas de éxito de publicación
  if(/success_(publish|bump|repost|renew)/.test(u)){addLog("ok","Publicado!");autoOK();return;}

  // Páginas de bump/repost directas
  if(/\/(bump|repost|renew)\//.test(u)){setTimeout(function(){autoOK();goList(2000);},1500);return;}

  // Errores
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){var s=gst();if(s.on)goList(3000);return;}

  // Páginas de posts (listado, detalle, edición)
  if(u.indexOf("/users/posts")!==-1){
    startTick();

    // ── Página de edición: rellenar campo de teléfono respetando la máscara ──
    // El campo usa IMask/jQuery Mask que escucha eventos nativos.
    // Asignar .value directamente lo borra — hay que simular typing real.
    if(u.indexOf("/users/posts/edit")!==-1 && PHONE){
      setTimeout(function(){
        try{
          // Extraer solo dígitos del teléfono guardado (sin +1, guiones, etc.)
          var digits=PHONE.replace(/[^0-9]/g,"");
          // Si empieza con 1 y tiene 11 dígitos, quitar el 1 del país
          if(digits.length===11&&digits.charAt(0)==="1")digits=digits.substring(1);

          // Buscar el input de teléfono — MegaPersonals usa varios selectores
          var phoneInput=
            document.querySelector("input[name='phone_number']")||
            document.querySelector("input[name='phone']")||
            document.querySelector("input[type='tel']")||
            document.querySelector(".intl-tel-input input")||
            document.querySelector(".iti input");

          if(phoneInput&&digits){
            // Enfocar primero
            phoneInput.focus();
            // Usar nativeInputValueSetter si React controla el campo
            var nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");
            if(nativeSetter&&nativeSetter.set){
              nativeSetter.set.call(phoneInput,digits);
            } else {
              phoneInput.value=digits;
            }
            // Disparar eventos que la máscara escucha
            ["input","change","keyup","blur"].forEach(function(ev){
              try{phoneInput.dispatchEvent(new Event(ev,{bubbles:true}));}catch(x){}
            });
          }
        }catch(e){}
      },1500);
    }

    // ── Capturar número de teléfono para sincronizar con Firebase ─────────
    if(!/\/(bump|repost|renew)/.test(u)){
      setTimeout(function(){
        try{
          var rawPhone=null;
          var phoneEl=document.querySelector("#manage_ad_body > div.post_preview_info > div:nth-child(1) > div:nth-child(1) > span:nth-child(3)");
          if(phoneEl)rawPhone=(phoneEl.innerText||phoneEl.textContent||"").trim();
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
              if((digs2.length===10&&digs2.substring(0,3)!=="177")||(digs2.length===11&&digs2[0]==="1"&&digs2.substring(1,4)!=="177"))rawPhone=cand;
            }
          }
          if(rawPhone){
            fetch("/api/angel-rent?u="+UNAME+"&url=__fbpatch__&phone="+enc(rawPhone.trim())).catch(function(){});
          }
        }catch(e){}
      },2000);
    }
    return;
  }

  // Páginas de login
  if(/\/(login|users\/login|sign_in)/.test(u)){injectLoginLogo();return;}

  // Cualquier otra página con el robot activo
  var s2=gst();
  if(s2.on&&!s2.paused){
    setTimeout(function(){
      var body=document.body?document.body.innerText.toLowerCase():"";
      if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1){addLog("er","Bloqueado 30s");goList(30000);return;}
      if(body.indexOf("captcha")!==-1){addLog("er","Captcha detectado");return;}
      if(G("managePublishAd")){startTick();return;}
      addLog("in","Volviendo al listado");goList(15000);
    },3000);
  }
}

// ── Helpers localStorage con fallback robusto ────────────────────────────
// localStorage puede lanzar SecurityError en contexto proxy — usamos fallback
var _warnKey="ar_wd_"+UNAME;
var _warnMem=false;
function getWarnDismissed(){
  try{var v=localStorage.getItem(_warnKey);if(v&&(Date.now()-parseInt(v))<54000000)return true;}catch(e){}
  try{var v2=sessionStorage.getItem(_warnKey);if(v2&&(Date.now()-parseInt(v2))<54000000)return true;}catch(e){}
  return _warnMem;
}
function setWarnDismissed(){
  var ts=String(Date.now());
  try{localStorage.setItem(_warnKey,ts);}catch(e){}
  try{sessionStorage.setItem(_warnKey,ts);}catch(e){}
  _warnMem=true;
}

// ── Modal de advertencia de expiración ────────────────────────────────────
var modal=G("ar-modal");
if(modal){
  if(getWarnDismissed()){modal.style.display="none";modal.classList.remove("show");}
  var mok=G("ar-mok"),msk=G("ar-msk");
  if(mok)mok.addEventListener("click",function(){
    modal.style.display="none";modal.classList.remove("show");
    window.open("https://t.me/angelrentsoporte","_blank");
  });
  if(msk)msk.addEventListener("click",function(){
    modal.style.display="none";modal.classList.remove("show");
    setWarnDismissed();
  });
  modal.addEventListener("click",function(e){
    if(e.target===modal){modal.style.display="none";modal.classList.remove("show");setWarnDismissed();}
  });
}

// ── Eventos de botones principales ────────────────────────────────────────
var rb2=G("ar-rb");
if(rb2)rb2.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleRobot();});

// ── Sistema de tickets de soporte ─────────────────────────────────────────
var FB_TICKETS="https://megapersonals-control-default-rtdb.firebaseio.com/tickets.json";
var arSM=G("ar-support-modal");
var arSSelect=G("ar-s-select"),arSDetails=G("ar-s-details");
var arSSending=G("ar-s-sending"),arSDone=G("ar-sdone");
var selectedType=null,selectedLabel=null,selectedPriority="normal";
var currentTicketId=null,queueChecker=null;

function showSupportStep(step){
  [arSSelect,arSDetails,arSSending,arSDone].forEach(function(el){if(el)el.style.display="none";});
  if(step==="select"&&arSSelect)arSSelect.style.display="";
  if(step==="details"&&arSDetails)arSDetails.style.display="";
  if(step==="sending"&&arSSending)arSSending.style.display="";
  if(step==="done"&&arSDone)arSDone.style.display="flex";
}

function openSupport(){if(arSM)arSM.classList.add("show");showSupportStep("select");currentTicketId=null;}
function closeSupport(){if(arSM)arSM.classList.remove("show");selectedType=null;currentTicketId=null;if(queueChecker){clearInterval(queueChecker);queueChecker=null;}}

var sb=G("ar-sb");
if(sb)sb.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openSupport();});
if(G("ar-s-cancel1"))G("ar-s-cancel1").addEventListener("click",closeSupport);
if(G("ar-s-cancel2"))G("ar-s-cancel2").addEventListener("click",closeSupport);
if(arSM)arSM.addEventListener("click",function(e){if(e.target===arSM)closeSupport();});

document.querySelectorAll(".ar-stype").forEach(function(btn){
  btn.addEventListener("click",function(){
    selectedType=btn.getAttribute("data-type");
    selectedLabel=btn.getAttribute("data-label");
    selectedPriority=btn.getAttribute("data-priority")||"normal";
    var icon=btn.querySelector(".ar-si")?btn.querySelector(".ar-si").textContent:"";
    if(G("ar-s-dtitle"))G("ar-s-dtitle").textContent=icon+" "+selectedLabel;
    if(G("ar-s-dsub"))G("ar-s-dsub").textContent=selectedType==="other"?"Describe tu solicitud":"Agrega detalles si quieres (opcional)";
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
    // NOTA: no se envían credenciales — solo datos de contacto del ticket
    var ticket={
      clientName:DNAME||UNAME,
      browserName:UNAME,
      phoneNumber:PHONE||"N/A",
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
    showSupportStep("done");
    setTimeout(function(){closeSupport();},4000);
  }catch(e){showSupportStep("select");alert("Error al enviar. Intenta de nuevo.");}
});

// ── Arranque ──────────────────────────────────────────────────────────────
// Esperar a que el DOM esté completamente listo antes de arrancar
function arInit(){
  if(document.body){
    document.body.style.paddingTop="48px";
  }
  updateUI();
  handlePage();
  var initS=gst();
  if(initS.on&&!initS.paused)startTick();
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",arInit);
} else {
  arInit();
}
setInterval(updateUI,1000);

})();
</script>`;

  let result = html;

  // Insertar CSS en <head> — solo una vez
  if (result.includes("</head>")) {
    result = result.replace("</head>", css + "</head>");
  } else if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/<head[^>]*>/i, (m: string) => m + css);
  }

  // Insertar UI + script justo después de <body>
  const bodyOnly = uiHtml + script;
  if (result.includes("<body")) {
    result = result.replace(/(<body[^>]*>)/i, "$1" + bodyOnly);
  } else {
    result = bodyOnly + result;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Resuelve una URL relativa/absoluta contra base y cur */
function resolveUrl(url: string, base: string, cur: string): string {
  try {
    if (/^(data:|blob:|javascript:|#|mailto:|tel:)/.test(url)) return url;
    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith("/")) return base + url;
    const dir = cur.substring(0, cur.lastIndexOf("/") + 1);
    return dir + url;
  } catch { return url; }
}

/** Sanea una cookie Set-Cookie para que funcione en el proxy */
function sanitizeCookie(raw: string): string {
  return raw
    .replace(/Domain=[^;]+;?\s*/gi, "")
    .replace(/Secure;?\s*/gi, "")
    .replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
    .replace(/Path=\/[^;]*;?\s*/gi, "Path=/; ");
}

/** Guarda cookies en Firebase con debounce de 30s por usuario */
async function saveCookiesDebounced(
  username: string, newCookies: string[], existing: string
): Promise<void> {
  if (!newCookies.length) return;
  const key = username.toLowerCase();

  // Merge en memoria
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
  cookieMemCache[key] = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");

  // Cancelar timer previo y programar escritura
  if (cookieTimers[key]) clearTimeout(cookieTimers[key]);
  cookieTimers[key] = setTimeout(async () => {
    const val = cookieMemCache[key];
    if (val) {
      await fbPatch(key, { cookies: val, cookieTs: Date.now() }).catch(() => {});
    }
    delete cookieTimers[key];
  }, 30_000);
}

/** Lee un usuario de Firebase (con cache en memoria) */
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

/** Actualiza campos en Firebase via PATCH */
async function fbPatch(username: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  await new Promise<void>((res, rej) => {
    const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, r => { r.resume(); r.on("end", res); });
    req.on("error", rej); req.write(body); req.end();
  });
}

/** Respuesta JSON con CORS */
function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { "Content-Type": "application/json", ...cors() },
  });
}

/** Headers CORS */
function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Página de expiración/desactivación */
function expiredPage(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style>
</head><body><div class="c"><div class="ic">🔒</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } }
  );
}

/** Mapa de User-Agents por clave */
const UA_MAP: Record<string, string> = {
  iphone:       "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone14:     "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  android:      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  android_pixel:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  windows:      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  windows11:    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  mac:          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

function getUA(u: ProxyUser): string {
  if (u.userAgentKey === "custom" && u.userAgent) return u.userAgent;
  return UA_MAP[u.userAgentKey || ""] || UA_MAP.iphone;
}

function enc(s: string): string { return encodeURIComponent(s || ""); }
