// app/api/angel-rent/route.ts
import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

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
  try {
    const user = await getUser(username);
    if (!user) return jres(403, { error: "Usuario no encontrado" });
    if (!user.active) return expiredPage("Cuenta Desactivada", "Tu cuenta fue desactivada.");
    if (user.rentalEnd && new Date() > new Date(user.rentalEnd + "T23:59:59"))
      return expiredPage("Plan Expirado", "Tu plan venció el " + user.rentalEnd + ".");
    const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
    if (!PH || !PT) return jres(400, { error: "Proxy no configurado" });
    const decoded = decodeURIComponent(targetUrl);
    const proxyUrl = PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    const pb = `/api/angel-rent?u=${enc(username)}&url=`;
    let postBody: string | null = null, postCT: string | null = null;
    if (method === "POST") { postBody = await req.text(); postCT = req.headers.get("content-type") || "application/x-www-form-urlencoded"; }
    const cookies = req.headers.get("cookie") || "";
    const resp = await fetchProxy(decoded, agent, method, postBody, postCT, cookies, getUA(user));
    const ct = resp.headers["content-type"] || "";
    const rh = new Headers(cors());
    resp.setCookies.forEach(c => rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi, "").replace(/Secure;?\s*/gi, "").replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
    ));
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
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers/${u.toLowerCase()}.json`, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
      r.on("error", rej);
    }).on("error", rej);
  });
}

// ─── UI INJECTION ─────────────────────────────────────────────────────────────
function injectUI(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  // Safely encode all values for JS using JSON.stringify (handles all special chars)
  const V = {
    pb:     JSON.stringify(pb),
    cur:    JSON.stringify(curUrl),
    uname:  JSON.stringify(username),
    name:   JSON.stringify(user.name || username),
    endTs:  user.rentalEnd ? String(new Date(user.rentalEnd + "T23:59:59").getTime()) : "0",
    b64e:   JSON.stringify(Buffer.from(user.siteEmail || "").toString("base64")),
    b64p:   JSON.stringify(Buffer.from(user.sitePass  || "").toString("base64")),
    plist:  JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`),
  };

  const css = `
<style id="ar-css">
#ar-info{
  position:fixed;top:0;left:0;right:0;z-index:2147483647;
  background:linear-gradient(135deg,rgba(10,4,22,.97),rgba(20,8,40,.97));
  border-bottom:1px solid rgba(168,85,247,.25);
  display:flex;align-items:center;gap:12px;
  padding:0 16px;height:34px;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;color:#fff;
  backdrop-filter:blur(12px);
}
#ar-info .chip{
  display:flex;align-items:center;gap:5px;
  padding:2px 10px;border-radius:20px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);
  white-space:nowrap;
}
#ar-info .chip .lbl{font-size:9px;color:rgba(168,85,247,.7);text-transform:uppercase;letter-spacing:.7px;font-weight:700}
#ar-info .chip .val{font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff}
.ar-green{color:#22c55e!important}.ar-yellow{color:#f59e0b!important}.ar-red{color:#ef4444!important}.ar-purple{color:#a855f7!important}
#ar-dot{width:7px;height:7px;border-radius:50%;background:#6b7280;transition:.3s}
#ar-dot.on{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,.7)}
#ar-dot.blink{background:#f59e0b;animation:ar-blink 1s infinite}
@keyframes ar-blink{0%,100%{opacity:1}50%{opacity:.15}}
#ar-info .spacer{flex:1}
#ar-sep{width:1px;height:18px;background:rgba(255,255,255,.08)}

/* 2 Floating buttons bottom-right */
#ar-btns{
  position:fixed;bottom:24px;right:20px;z-index:2147483647;
  display:flex;flex-direction:column;gap:10px;align-items:flex-end;
}
.ar-fab{
  display:flex;align-items:center;gap:8px;
  padding:10px 18px;border:none;cursor:pointer;
  border-radius:50px;font-weight:800;font-size:13px;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  box-shadow:0 6px 24px rgba(0,0,0,.5);
  transition:transform .15s,box-shadow .15s,background .2s;
  white-space:nowrap;
}
.ar-fab:hover{transform:scale(1.05);box-shadow:0 8px 30px rgba(0,0,0,.6)}
.ar-fab:active{transform:scale(.95)}
#ar-robot-btn{background:linear-gradient(135deg,#6b7280,#4b5563);color:#fff}
#ar-robot-btn.on{background:linear-gradient(135deg,#22c55e,#16a34a)}
#ar-pause-btn{background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff}
#ar-pause-btn.paused{background:linear-gradient(135deg,#f59e0b,#d97706)}
</style>`;

  const html2 = `
<div id="ar-info">
  <div class="chip">
    <span class="lbl">&#x1F47C;</span>
    <span class="val" id="ar-name" style="color:rgba(255,255,255,.5);font-weight:500;font-size:10px"></span>
  </div>
  <div id="ar-sep"></div>
  <div class="chip">
    <span class="lbl">Renta</span>
    <span class="val ar-green" id="ar-rent">...</span>
  </div>
  <div id="ar-dot"></div>
  <div class="chip">
    <span class="lbl">Robot</span>
    <span class="val" id="ar-status" style="color:rgba(255,255,255,.3)">Apagado</span>
  </div>
  <div class="chip" id="ar-countdown-wrap" style="display:none">
    <span class="lbl">Proximo bump</span>
    <span class="val ar-purple" id="ar-cd">--:--</span>
  </div>
  <span class="spacer"></span>
  <div class="chip" style="font-size:9px;color:rgba(255,255,255,.2)" id="ar-bumpcnt-wrap" style="display:none">
    <span class="lbl">Bumps</span>
    <span class="val ar-purple" id="ar-bumpcnt">0</span>
  </div>
</div>

<div id="ar-btns">
  <button id="ar-robot-btn" class="ar-fab">&#x26A1; Robot OFF</button>
  <button id="ar-pause-btn" class="ar-fab">&#x23F8; Pausar</button>
</div>`;

  // ── SCRIPT: All logic here, using event listeners (no onclick attributes) ──
  const script = `
<script>
(function(){
"use strict";

// ── CONFIG (values injected safely via JSON.stringify) ────────────────────────
var PB    = ${V.pb};
var CUR   = ${V.cur};
var UNAME = ${V.uname};
var DNAME = ${V.name};
var ENDTS = ${V.endTs};
var B64E  = ${V.b64e};
var B64P  = ${V.b64p};
var PLIST = ${V.plist};

// Bump interval: 16-20 minutes (960-1200 seconds) random
var BUMP_MIN = 960;
var BUMP_MAX = 1200;

var SK = "ar_" + UNAME; // sessionStorage key
var TICK = null;

// ── STATE ─────────────────────────────────────────────────────────────────────
function gst() { try { return JSON.parse(sessionStorage.getItem(SK) || "{}"); } catch(e) { return {}; } }
function sst(s) { try { sessionStorage.setItem(SK, JSON.stringify(s)); } catch(e) {} }

// ── LOG (simple array in state) ───────────────────────────────────────────────
function log(t, m) {
  var s = gst();
  if (!s.logs) s.logs = [];
  var h = new Date().toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit"});
  s.logs.unshift({t:t, m:"["+h+"] "+m});
  if (s.logs.length > 30) s.logs = s.logs.slice(0, 30);
  sst(s);
}

// ── RENTAL ────────────────────────────────────────────────────────────────────
function rentLeft() {
  if (!ENDTS) return null;
  return Math.max(0, ENDTS - Date.now());
}
function p2(n) { return String(n).padStart(2, "0"); }
function fmtMs(ms) {
  if (ms === null) return "Ilimitado";
  if (ms <= 0) return "EXPIRADO";
  var s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400);
  var h = Math.floor((s % 86400) / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

// ── UI UPDATE ─────────────────────────────────────────────────────────────────
function updateUI() {
  var s = gst();
  var on = !!s.on;
  var paused = !!s.paused;
  var cnt = s.cnt || 0;
  var nextAt = s.nextAt || 0;
  var total = s.total || 1;

  // Name
  var nameEl = document.getElementById("ar-name");
  if (nameEl) nameEl.textContent = DNAME;

  // Rental
  var rl = rentLeft();
  var rentEl = document.getElementById("ar-rent");
  if (rentEl) {
    rentEl.textContent = fmtMs(rl);
    rentEl.className = "val";
    if (rl === null) rentEl.classList.add("ar-green");
    else if (rl <= 0) rentEl.classList.add("ar-red");
    else if (rl < 86400000) rentEl.classList.add("ar-yellow");
    else rentEl.classList.add("ar-green");
  }

  // Robot dot + status
  var dot = document.getElementById("ar-dot");
  var statusEl = document.getElementById("ar-status");
  if (dot) {
    dot.className = on ? (paused ? "" : "on") : "";
    if (on && !paused) dot.className = "on";
    else if (on && paused) dot.className = "blink";
  }
  if (statusEl) {
    if (!on) { statusEl.textContent = "Apagado"; statusEl.style.color = "rgba(255,255,255,.3)"; }
    else if (paused) { statusEl.textContent = "Pausado"; statusEl.style.color = "#f59e0b"; }
    else { statusEl.textContent = "Activo"; statusEl.style.color = "#22c55e"; }
  }

  // Countdown
  var cdWrap = document.getElementById("ar-countdown-wrap");
  var cdEl = document.getElementById("ar-cd");
  if (on && !paused) {
    if (cdWrap) cdWrap.style.display = "";
    var left = Math.max(0, Math.floor((nextAt - Date.now()) / 1000));
    var bm = Math.floor(left / 60), bs = left % 60;
    if (cdEl) cdEl.textContent = p2(bm) + ":" + p2(bs);
  } else {
    if (cdWrap) cdWrap.style.display = "none";
  }

  // Bump count
  var bcWrap = document.getElementById("ar-bumpcnt-wrap");
  var bcEl = document.getElementById("ar-bumpcnt");
  if (on) {
    if (bcWrap) bcWrap.style.display = "";
    if (bcEl) bcEl.textContent = String(cnt);
  } else {
    if (bcWrap) bcWrap.style.display = "none";
  }

  // Robot button
  var robotBtn = document.getElementById("ar-robot-btn");
  if (robotBtn) {
    if (on) {
      robotBtn.textContent = "\u26A1 Robot ON";
      robotBtn.className = "ar-fab on";
    } else {
      robotBtn.textContent = "\u26A1 Robot OFF";
      robotBtn.className = "ar-fab";
    }
  }

  // Pause button
  var pauseBtn = document.getElementById("ar-pause-btn");
  if (pauseBtn) {
    if (paused) {
      pauseBtn.textContent = "\u25B6 Reanudar";
      pauseBtn.className = "ar-fab paused";
    } else {
      pauseBtn.textContent = "\u23F8 Pausar";
      pauseBtn.className = "ar-fab";
    }
  }
}

// ── SCHEDULE NEXT BUMP ────────────────────────────────────────────────────────
function schedNext() {
  var secs = BUMP_MIN + Math.floor(Math.random() * (BUMP_MAX - BUMP_MIN));
  var s = gst(); s.total = secs; s.nextAt = Date.now() + secs * 1000; sst(s);
  log("in", "Proximo bump en " + Math.floor(secs / 60) + "m " + (secs % 60) + "s");
}

function goList(ms) { setTimeout(function() { window.location.href = PLIST; }, ms || 1500); }

// ── BUMP ──────────────────────────────────────────────────────────────────────
function rnd(n) { return Math.floor(Math.random() * n); }
function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function isBumpUrl(url) {
  // Check if url contains bump/repost/renew/republish pattern
  var parts = ["bump", "repost", "renew", "republish"];
  for (var i = 0; i < parts.length; i++) {
    if (url.indexOf("/" + parts[i] + "/") !== -1) return true;
  }
  return false;
}

function extractPostId(url) {
  // Extract numeric post ID from URL (5+ digits)
  var segments = url.split("/");
  for (var i = segments.length - 1; i >= 0; i--) {
    if (segments[i].match && /^\d{5,}$/.test(segments[i])) return segments[i];
  }
  return null;
}

async function doBump() {
  var s = gst();
  if (!s.on || s.paused) return;
  log("in", "Republicando...");
  schedNext();

  // Method 1: #managePublishAd button
  var btn = document.getElementById("managePublishAd");
  if (btn) {
    try {
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      await wait(300 + rnd(500));
      btn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await wait(100 + rnd(200));
      btn.click();
      s = gst(); s.cnt = (s.cnt || 0) + 1; sst(s);
      log("ok", "Bump #" + s.cnt + " (boton publicar)");
    } catch(e) { log("er", "Error boton: " + e.message); }
    updateUI(); return;
  }

  // Method 2: look for bump/repost links
  var links = document.querySelectorAll("a[href]");
  for (var i = 0; i < links.length; i++) {
    var rawH = links[i].getAttribute("href") || "";
    var realH = rawH;
    // Decode proxied URLs
    if (rawH.indexOf("/api/angel-rent") !== -1) {
      try {
        var mm = rawH.match(/[?&]url=([^&]+)/);
        if (mm) realH = decodeURIComponent(mm[1]);
      } catch(x) {}
    }
    if (isBumpUrl(realH)) {
      try {
        links[i].scrollIntoView({ behavior: "smooth", block: "center" });
        await wait(300 + rnd(400));
        links[i].click();
        s = gst(); s.cnt = (s.cnt || 0) + 1; sst(s);
        log("ok", "Bump #" + s.cnt + " (link)");
      } catch(e) { log("er", "Error link: " + e.message); }
      updateUI(); return;
    }
  }

  // Method 3: fetch bump by post ID
  var ids = [];
  var allLinks = document.querySelectorAll("a[href]");
  for (var j = 0; j < allLinks.length; j++) {
    var h = allLinks[j].getAttribute("href") || "";
    var rh = h;
    if (h.indexOf("/api/angel-rent") !== -1) {
      try { var m2 = h.match(/[?&]url=([^&]+)/); if (m2) rh = decodeURIComponent(m2[1]); } catch(x) {}
    }
    var pid = extractPostId(rh);
    if (pid && ids.indexOf(pid) === -1) ids.push(pid);
  }
  // Also check data attributes
  var dataEls = document.querySelectorAll("[data-id],[data-post-id]");
  for (var k = 0; k < dataEls.length; k++) {
    var did = dataEls[k].getAttribute("data-id") || dataEls[k].getAttribute("data-post-id") || "";
    if (did.length >= 5 && /^\d+$/.test(did) && ids.indexOf(did) === -1) ids.push(did);
  }

  if (ids.length > 0) {
    for (var n = 0; n < ids.length; n++) {
      try {
        var burl = PB + encodeURIComponent("https://megapersonals.eu/users/posts/bump/" + ids[n]);
        var r = await fetch(burl, { credentials: "include", redirect: "follow" });
        if (r.ok) {
          var txt = await r.text();
          if (txt.indexOf("blocked") !== -1 || txt.indexOf("Attention") !== -1) {
            log("er", "Bloqueado #" + ids[n]);
          } else {
            s = gst(); s.cnt = (s.cnt || 0) + 1; sst(s);
            log("ok", "Bump #" + s.cnt + " (fetch #" + ids[n] + ")");
          }
        } else { log("er", "HTTP " + r.status); }
      } catch(e2) { log("er", "Fetch error: " + (e2.message || e2)); }
      if (n < ids.length - 1) await wait(1500 + rnd(2000));
    }
  } else {
    log("er", "No se encontraron posts para bump");
    var sc = gst();
    if (sc.on && !sc.paused && CUR.indexOf("/users/posts/list") === -1) goList(3000);
  }
  updateUI();
}

// ── TICK ──────────────────────────────────────────────────────────────────────
function startTick() {
  if (TICK) return;
  TICK = setInterval(function() {
    var s = gst();
    if (!s.on || s.paused) return;
    updateUI();
    if (s.nextAt > 0 && Date.now() >= s.nextAt) doBump();
  }, 1000);
}

// ── POWER TOGGLE ──────────────────────────────────────────────────────────────
function toggleRobot() {
  var s = gst();
  if (s.on) {
    // Turn OFF
    s.on = false; s.nextAt = 0; sst(s);
    if (TICK) { clearInterval(TICK); TICK = null; }
    log("in", "Robot desactivado");
  } else {
    // Turn ON
    s.on = true; s.paused = false; s.cnt = 0; sst(s);
    log("ok", "Robot activado");
    schedNext();
    startTick();
    doBump();
  }
  updateUI();
}

// ── PAUSE TOGGLE ──────────────────────────────────────────────────────────────
function togglePause() {
  var s = gst();
  if (!s.on) { log("in", "Activa el robot primero"); return; }
  s.paused = !s.paused; sst(s);
  log("in", s.paused ? "Pausado" : "Reanudado");
  updateUI();
}

// ── AUTO-CLICK OK on success pages ────────────────────────────────────────────
function autoOK() {
  var done = false;
  var chk = setInterval(function() {
    if (done) return;
    var btns = document.querySelectorAll("button,a,input[type=button],input[type=submit]");
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].innerText || btns[i].value || "").trim().toLowerCase();
      if (t === "ok" || t === "okay" || t === "done" || t === "continue" || t === "continuar") {
        done = true; clearInterval(chk);
        setTimeout(function() { try { btns[i].click(); } catch(e) {} goList(2000); }, 500);
        return;
      }
    }
  }, 400);
  setTimeout(function() { if (!done) { clearInterval(chk); goList(600); } }, 8000);
}

// ── PAGE HANDLER ──────────────────────────────────────────────────────────────
function handlePage() {
  var u = CUR;
  // Success pages
  if (u.indexOf("success_publish") !== -1 || u.indexOf("success_bump") !== -1 || u.indexOf("success_repost") !== -1 || u.indexOf("success_renew") !== -1) {
    log("ok", "Publicado exitosamente!"); autoOK(); return;
  }
  // Bump/repost confirmation pages
  if (u.indexOf("/users/posts/bump/") !== -1 || u.indexOf("/users/posts/repost/") !== -1 || u.indexOf("/users/posts/renew/") !== -1) {
    setTimeout(function() { autoOK(); goList(2000); }, 1500); return;
  }
  // Error pages
  if (u.indexOf("/error") !== -1 || u.indexOf("/404") !== -1) {
    var s = gst(); if (s.on) goList(3000); return;
  }
  // Post list - start tick
  if (u.indexOf("/users/posts/list") !== -1 || u.indexOf("/users/posts") !== -1) {
    startTick(); return;
  }
  // Login / edit - do nothing special
  if (u.indexOf("/login") !== -1 || u.indexOf("/users/login") !== -1 || u.indexOf("/sign_in") !== -1) return;
  if (u.indexOf("/users/posts/edit/") !== -1) return;
  // Unknown pages while robot is on
  var s2 = gst();
  if (s2.on && !s2.paused) {
    setTimeout(function() {
      var body = document.body ? document.body.innerText.toLowerCase() : "";
      if (body.indexOf("attention required") !== -1 || body.indexOf("just a moment") !== -1) {
        log("er", "Bloqueado - esperando 30s"); goList(30000); return;
      }
      if (body.indexOf("captcha") !== -1) { log("er", "Captcha detectado"); return; }
      if (document.getElementById("managePublishAd")) { startTick(); return; }
      log("in", "Pagina desconocida - volviendo"); goList(15000);
    }, 3000);
  }
}

// ── AUTO-LOGIN ────────────────────────────────────────────────────────────────
function doAutoLogin() {
  if (!B64E) return;
  var email, pass;
  try { email = atob(B64E); pass = atob(B64P); } catch(e) { return; }
  if (!email || !pass) return;

  // Find email input
  var ef = document.querySelector("input[name='email_address']")
        || document.querySelector("input[name='email']")
        || document.querySelector("input[type='email']")
        || document.querySelector("input[name='username']")
        || document.querySelector("input[name='login']");

  if (!ef) {
    // Fallback: any input with email/user in placeholder
    var allInputs = document.querySelectorAll("input");
    for (var i = 0; i < allInputs.length; i++) {
      var pl = (allInputs[i].getAttribute("placeholder") || "").toLowerCase();
      if (pl.indexOf("email") !== -1 || pl.indexOf("user") !== -1 || pl.indexOf("mail") !== -1) {
        ef = allInputs[i]; break;
      }
    }
  }

  var pf = document.querySelector("input[type='password']")
         || document.querySelector("input[name='password']")
         || document.querySelector("input[name='pass']");

  if (!ef || !pf) return;
  if (ef.value && pf.value) return; // already filled

  // Set values using native setter (works with any JS framework)
  function setVal(el, val) {
    try {
      var proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (proto && proto.set) proto.set.call(el, val);
      else el.value = val;
    } catch(e) { el.value = val; }
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch(e) {}
    try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
  }

  setVal(ef, email);
  setVal(pf, pass);

  // Visual mask for email field: make text invisible, show bullets overlay
  ef.style.setProperty("color", "transparent", "important");
  ef.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  ef.style.setProperty("caret-color", "#888", "important");
  ef.setAttribute("readonly", "readonly");
  ef.setAttribute("autocomplete", "off");

  // Create bullet overlay
  var bullets = "";
  for (var k = 0; k < email.length; k++) bullets += "\u25CF";

  var ov = document.createElement("div");
  ov.id = "ar-login-mask";
  ov.textContent = bullets;
  var cs = window.getComputedStyle(ef);
  ov.style.cssText = [
    "position:absolute", "top:0", "left:0", "right:0", "bottom:0",
    "display:flex", "align-items:center",
    "padding-left:" + cs.paddingLeft,
    "padding-right:" + cs.paddingRight,
    "font-size:14px", "letter-spacing:3px", "color:#666",
    "pointer-events:none", "user-select:none",
    "z-index:999", "background:transparent", "box-sizing:border-box"
  ].join(";");

  var par = ef.parentNode;
  if (par) {
    if (window.getComputedStyle(par).position === "static") par.style.position = "relative";
    par.appendChild(ov);
  }

  // Unlock real value on form submit
  var form = ef.closest ? ef.closest("form") : null;
  if (!form && pf.closest) form = pf.closest("form");
  if (form) {
    var unlocked = false;
    function unlock() {
      if (unlocked) return; unlocked = true;
      ef.removeAttribute("readonly");
      ef.style.removeProperty("color");
      ef.style.removeProperty("-webkit-text-fill-color");
      ef.style.removeProperty("caret-color");
      var m = document.getElementById("ar-login-mask");
      if (m && m.parentNode) m.parentNode.removeChild(m);
    }
    form.addEventListener("submit", unlock, true);
    // Also unlock on submit button click
    var subBtn = form.querySelector("input[type='submit'],input[type='image'],button[type='submit']");
    if (!subBtn) subBtn = form.querySelector("button");
    if (subBtn) subBtn.addEventListener("click", unlock, true);
    // Also unlock on mousedown (handles some edge cases)
    form.addEventListener("mousedown", function(e) {
      var t = e.target;
      var bt = (t.type || "").toLowerCase();
      if (bt === "submit" || bt === "image" || (t.tagName === "BUTTON")) unlock();
    }, true);
  }

  log("ok", "Login auto-rellenado");
}

var loginDone = false;
function tryLogin() {
  if (loginDone) return;
  doAutoLogin();
  var ef2 = document.querySelector("input[name='email_address'],input[name='email'],input[type='email'],input[name='username']");
  if (ef2 && ef2.value) { loginDone = true; }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
// Add padding to push content below the info bar
document.addEventListener("DOMContentLoaded", function() {
  document.body.style.paddingTop = "38px";
});
// Also set immediately in case DOMContentLoaded already fired
if (document.body) document.body.style.paddingTop = "38px";

// Attach button event listeners (after DOM ready)
function attachButtons() {
  var robotBtn = document.getElementById("ar-robot-btn");
  var pauseBtn = document.getElementById("ar-pause-btn");
  if (robotBtn) robotBtn.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); toggleRobot(); });
  if (pauseBtn) pauseBtn.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); togglePause(); });
}

// Run immediately
attachButtons();
handlePage();
setInterval(updateUI, 1000);
updateUI();

// Resume tick if robot was on
var initS = gst();
if (initS.on && !initS.paused) startTick();

// Auto-login attempts
setTimeout(tryLogin, 400);
setTimeout(tryLogin, 1000);
setTimeout(tryLogin, 2000);
setTimeout(tryLogin, 4000);
var lri = setInterval(function() { tryLogin(); if (loginDone) clearInterval(lri); }, 600);
setTimeout(function() { clearInterval(lri); }, 30000);

// MutationObserver: try login whenever new inputs appear (handles dynamic forms)
if (window.MutationObserver) {
  var obs = new MutationObserver(function() { if (!loginDone) tryLogin(); });
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  setTimeout(function() { obs.disconnect(); }, 30000);
}

})();
</script>`;

  const block = css + html2 + script;
  if (html.includes("<body")) {
    return html.replace(/(<body[^>]*>)/i, "$1" + block);
  }
  return block + html;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function enc(s: string) { return encodeURIComponent(s || ""); }

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jres(s: number, b: object) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors() } });
}

function expiredPage(title: string, msg: string) {
  const h = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">&#x1F512;</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`;
  return new Response(h, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", ...cors() } });
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

// ─── FETCH VIA PROXY ──────────────────────────────────────────────────────────
function fetchProxy(url: string, agent: any, method: string, postBody: string | null, postCT: string | null, cookies: string, ua: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Host": u.hostname,
      "Connection": "keep-alive",
    };
    if (cookies) headers["Cookie"] = cookies;
    if (method === "POST" && postCT) {
      headers["Content-Type"] = postCT;
      if (postBody) headers["Content-Length"] = Buffer.byteLength(postBody).toString();
    }
    const req = (lib as typeof https).request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method, agent, headers, timeout: 25000,
    }, (r) => {
      const sc = (() => {
        const raw = r.headers["set-cookie"];
        return !raw ? [] : Array.isArray(raw) ? raw : [raw];
      })();
      if ([301, 302, 303, 307, 308].includes(r.statusCode!) && r.headers.location) {
        const redir = new URL(r.headers.location, url).href;
        const nm = [301, 302, 303].includes(r.statusCode!) ? "GET" : method;
        let ck = cookies;
        if (sc.length) { const nv = sc.map(s => s.split(";")[0]); ck = (ck ? ck + "; " : "") + nv.join("; "); }
        return fetchProxy(redir, agent, nm, null, null, ck, ua)
          .then(res => { res.setCookies = [...sc, ...res.setCookies]; resolve(res); })
          .catch(reject);
      }
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.headers)) {
          if (v && k !== "set-cookie") h[k] = Array.isArray(v) ? v.join(", ") : v as string;
        }
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

// ─── HTML REWRITE ─────────────────────────────────────────────────────────────
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

  // Rewrite href
  html = html.replace(/(href\s*=\s*["'])([^"'#][^"']*)(["'])/gi, (_, a, u, b) => {
    const t = u.trim();
    if (/^(javascript:|data:|mailto:)/.test(t) || t.length < 2) return _;
    return a + pb + encodeURIComponent(resolveUrl(t, base, cur)) + b;
  });
  // Rewrite src
  html = html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, (_, a, u, b) =>
    /^(data:|blob:|javascript:)/.test(u) ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b);
  // Rewrite action
  html = html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi, (_, a, u, b) => {
    if (!u || u === "#") return a + pb + encodeURIComponent(cur) + b;
    return a + pb + encodeURIComponent(resolveUrl(u.trim(), base, cur)) + b;
  });
  // Rewrite CSS url()
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, cssContent, c) =>
    o + cssContent.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (cm: string, ca: string, cu: string, cb: string) =>
      cu.startsWith("data:") ? cm : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb) + c);

  // Zero-leak script: intercept all navigation/requests
  // NOTE: Use JSON.stringify to safely embed values — avoids all escaping issues
  const pbJ = JSON.stringify(pb);
  const baseJ = JSON.stringify(base);
  const curJ = JSON.stringify(cur);

  const zl = `<script>(function(){
var P=${pbJ},B=${baseJ},C=${curJ};
function px(u){
  if(!u||typeof u!=="string")return null;
  var skip=["#","javascript:","data:","blob:","/api/angel-rent"];
  for(var i=0;i<skip.length;i++){if(u.indexOf(skip[i])===0||(skip[i].length>1&&u.indexOf(skip[i])!==-1)){}};
  if(u==="#")return null;
  if(u.indexOf("javascript:")===0)return null;
  if(u.indexOf("data:")===0)return null;
  if(u.indexOf("blob:")===0)return null;
  if(u.indexOf("/api/angel-rent")!==-1)return null;
  if(u.indexOf("//")===0)u="https:"+u;
  if(u.indexOf("http://")===0||u.indexOf("https://")===0)return P+encodeURIComponent(u);
  if(u.indexOf("/")===0)return P+encodeURIComponent(B+u);
  return P+encodeURIComponent(C.substring(0,C.lastIndexOf("/")+1)+u);
}
document.addEventListener("click",function(e){
  var el=e.target;
  while(el&&el.tagName!=="A")el=el.parentNode;
  if(!el||el.tagName!=="A")return;
  var h=el.getAttribute("href");
  if(!h||h==="#"||h.indexOf("javascript:")===0||h.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();e.stopImmediatePropagation();
  var d=px(h);if(d)location.href=d;
},true);
var _fe=window.fetch;
if(_fe)window.fetch=function(u,o){
  if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)u=f;}
  return _fe.call(this,u,o);
};
var _xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
  if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)arguments[1]=f;}
  return _xo.apply(this,arguments);
};
var _wo=window.open;
window.open=function(u,t,f){
  if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var p2=px(u);if(p2)u=p2;}
  return _wo.call(this,u,t,f);
};
document.addEventListener("submit",function(e){
  var f=e.target;
  var a=f.getAttribute("action")||"";
  if(a.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();e.stopImmediatePropagation();
  var target;
  try{target=a?new URL(a,B).href:C;}catch(x){target=C;}
  var n=document.createElement("form");
  n.method=f.method||"POST";
  n.action=P+encodeURIComponent(target);
  n.style.display="none";
  var d=new FormData(f);
  d.forEach(function(v,k){
    var i=document.createElement("input");
    i.type="hidden";i.name=k;i.value=v;n.appendChild(i);
  });
  document.body.appendChild(n);n.submit();
},true);
try{
  window.RTCPeerConnection=function(){throw new Error("blocked");};
  if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=function(){throw new Error("blocked");};
}catch(x){}
})();<\/script>`;

  if (html.match(/<head[^>]*>/i)) {
    return html.replace(/<head[^>]*>/i, (m) => m + zl);
  }
  return zl + html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b);
}
