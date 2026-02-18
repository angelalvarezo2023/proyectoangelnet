// app/api/angel-rent/route.ts
import { type NextRequest } from "next/server";
import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 30;

interface ProxyUser {
  name?: string;
  proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string;
  userAgentKey?: string; userAgent?: string;
  rentalEnd?: string; rentalStart?: string;
  defaultUrl?: string;
  siteEmail?: string; sitePass?: string;
  notes?: string; active?: boolean;
}
interface FetchResult {
  status: number; headers: Record<string,string>;
  body: Buffer; setCookies: string[];
}

export async function GET(req: NextRequest) { return handle(req,"GET"); }
export async function POST(req: NextRequest) { return handle(req,"POST"); }
export async function OPTIONS() { return new Response("",{status:200,headers:cors()}); }

async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const targetUrl = sp.get("url"), username = sp.get("u");
  if (!targetUrl) return jres(400,{error:"Falta ?url="});
  if (!username)  return jres(400,{error:"Falta ?u=usuario"});
  try {
    const user = await getUser(username);
    if (!user) return jres(403,{error:"Usuario no encontrado"});
    if (!user.active) return expiredPage("Cuenta Desactivada","Tu cuenta fue desactivada.");
    if (user.rentalEnd && new Date() > new Date(user.rentalEnd+"T23:59:59"))
      return expiredPage("Plan Expirado","Tu plan venció el "+user.rentalEnd+".");
    const {proxyHost:PH="",proxyPort:PT="",proxyUser:PU="",proxyPass:PP=""} = user;
    if (!PH||!PT) return jres(400,{error:"Proxy no configurado"});
    const decoded = decodeURIComponent(targetUrl);
    const proxyUrl = PU&&PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    const pb = `/api/angel-rent?u=${enc(username)}&url=`;
    let postBody:string|null=null, postCT:string|null=null;
    if (method==="POST") { postBody=await req.text(); postCT=req.headers.get("content-type")||"application/x-www-form-urlencoded"; }
    const cookies = req.headers.get("cookie")||"";
    const ua = getUA(user);
    const resp = await fetchProxy(decoded,agent,method,postBody,postCT,cookies,ua);
    const ct = resp.headers["content-type"]||"";
    const rh = new Headers(cors());
    resp.setCookies.forEach(c=>rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi,"").replace(/Secure;?\s*/gi,"").replace(/SameSite=\w+;?\s*/gi,"SameSite=Lax; ")
    ));
    if (ct.includes("text/html")) {
      let html = resp.body.toString("utf-8");
      html = rewriteHtml(html, new URL(decoded).origin, pb, decoded);
      html = injectAll(html, decoded, username, user);
      rh.set("Content-Type","text/html; charset=utf-8");
      return new Response(html,{status:200,headers:rh});
    }
    if (ct.includes("text/css")) {
      rh.set("Content-Type","text/css");
      return new Response(rewriteCss(resp.body.toString("utf-8"),new URL(decoded).origin,pb),{status:200,headers:rh});
    }
    if (ct.includes("javascript")||ct.includes("text/")) {
      rh.set("Content-Type",ct);
      return new Response(resp.body.toString("utf-8"),{status:200,headers:rh});
    }
    rh.set("Content-Type",ct);
    rh.set("Cache-Control","public, max-age=3600");
    return new Response(resp.body,{status:200,headers:rh});
  } catch(err:any) {
    console.error("[AR]",err.message);
    return jres(500,{error:err.message});
  }
}

// ── Firebase ─────────────────────────────────────────────────────────────────
async function getUser(u:string):Promise<ProxyUser|null> {
  return new Promise((res,rej)=>{
    https.get(`${FB_URL}/proxyUsers/${u.toLowerCase()}.json`,r=>{
      let d=""; r.on("data",c=>d+=c);
      r.on("end",()=>{try{res(JSON.parse(d));}catch{res(null);}});
      r.on("error",rej);
    }).on("error",rej);
  });
}

// ── Main injection ────────────────────────────────────────────────────────────
function injectAll(html:string, curUrl:string, username:string, user:ProxyUser):string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  // Rental info
  let rentalEndTs = 0, rentalEndStr = "";
  if (user.rentalEnd) {
    rentalEndTs = new Date(user.rentalEnd+"T23:59:59").getTime();
    rentalEndStr = user.rentalEnd;
  }

  // Safe strings for JS embedding
  const sPb  = pb.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
  const sCur = curUrl.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
  const sName = (user.name||username).replace(/"/g,"&quot;");

  // Credentials: base64 encoded
  const b64e = Buffer.from(user.siteEmail||"").toString("base64");
  const b64p = Buffer.from(user.sitePass||"").toString("base64");

  const css = `<style>
:root{--ar-purple:#a855f7;--ar-pink:#ec4899;--ar-bg:rgba(8,4,18,.96)}
.__ar_wrap{all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none}
.__ar_bar{
  pointer-events:all;
  display:flex;align-items:center;gap:10px;
  background:var(--ar-bg);
  border-bottom:1px solid rgba(168,85,247,.2);
  padding:6px 14px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:12px;color:#fff;
  backdrop-filter:blur(16px);
}
.__ar_logo{font-size:18px;cursor:pointer;user-select:none}
.__ar_seg{display:flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:20px}
.__ar_seg .lbl{font-size:9px;color:rgba(168,85,247,.6);text-transform:uppercase;letter-spacing:.8px;font-weight:600}
.__ar_seg .val{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff}
.__ar_seg .val.green{color:#22c55e} .__ar_seg .val.yellow{color:#f59e0b} .__ar_seg .val.red{color:#ef4444}
.__ar_sep{width:1px;height:20px;background:rgba(255,255,255,.08)}
.__ar_dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.__ar_dot.on{background:#22c55e;box-shadow:0 0 5px rgba(34,197,94,.7)}
.__ar_dot.off{background:#6b7280}
.__ar_dot.wait{background:#f59e0b;animation:__ar_blink 1s infinite}
@keyframes __ar_blink{0%,100%{opacity:1}50%{opacity:.1}}
.__ar_pbar_wrap{flex:1;min-width:60px;max-width:120px;height:4px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
.__ar_pbar{height:100%;background:linear-gradient(90deg,var(--ar-purple),var(--ar-pink));border-radius:99px;transition:width .8s linear}
.__ar_btn{
  pointer-events:all;
  padding:4px 12px;border:none;border-radius:20px;cursor:pointer;
  font-size:11px;font-weight:700;transition:.15s;
  font-family:-apple-system,sans-serif;
}
.__ar_btn.toggle{background:rgba(168,85,247,.15);color:#a855f7;border:1px solid rgba(168,85,247,.25)}
.__ar_btn.toggle:hover{background:rgba(168,85,247,.25)}
.__ar_btn.toggle.active{background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-color:transparent}
.__ar_btn.info{background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.08)}
.__ar_btn.info:hover{background:rgba(255,255,255,.1);color:#fff}
.__ar_spacer{flex:1}

/* popup */
.__ar_popup{
  pointer-events:all;
  position:fixed;top:44px;left:50%;transform:translateX(-50%);
  width:320px;background:var(--ar-bg);
  border:1px solid rgba(168,85,247,.2);border-radius:16px;
  display:none;overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.7);
  font-family:-apple-system,sans-serif;
  z-index:2147483646;
  animation:__ar_pop_in .15s ease-out;
}
@keyframes __ar_pop_in{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.__ar_popup.show{display:block}
.__ar_pop_head{padding:14px 16px 10px;background:linear-gradient(135deg,rgba(168,85,247,.12),rgba(236,72,153,.06));border-bottom:1px solid rgba(255,255,255,.05)}
.__ar_pop_head .title{font-size:14px;font-weight:800;color:#fff} .__ar_pop_head .sub{font-size:10px;color:rgba(255,255,255,.3);margin-top:2px}
.__ar_pop_row{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)}
.__ar_pop_row .k{font-size:10px;color:rgba(255,255,255,.3)} .__ar_pop_row .v{font-size:12px;font-weight:700;color:#fff}
.__ar_pop_row .v.green{color:#22c55e} .__ar_pop_row .v.yellow{color:#f59e0b} .__ar_pop_row .v.red{color:#ef4444} .__ar_pop_row .v.purple{color:#a855f7}
.__ar_pop_log{max-height:80px;overflow-y:auto;padding:8px 16px;background:rgba(0,0,0,.2)}
.__ar_pop_log .entry{font-size:9px;color:rgba(255,255,255,.25);padding:1px 0}
.__ar_pop_log .ok{color:#22c55e} .__ar_pop_log .er{color:#f472b6} .__ar_pop_log .in{color:#a855f7}

/* login mask */
.__ar_mask_wrap{position:relative;display:inline-block;width:100%}
.__ar_mask{
  position:absolute;inset:0;
  display:flex;align-items:center;
  padding:0 8px;
  font-size:14px;letter-spacing:3px;color:#555;
  pointer-events:none;user-select:none;
  font-family:monospace;
}
</style>`;

  const script = `<script>
(function(){
"use strict";
// ── CONFIG ────────────────────────────────────────────────────────────────
var PB = "${sPb}";
var CUR = "${sCur}";
var USERNAME = "${username.replace(/"/g,'\\"')}";
var RENTAL_END_TS = ${rentalEndTs};
var RENTAL_END_STR = "${rentalEndStr}";
var B64E = "${b64e}";
var B64P = "${b64p}";
var BUMP_BASE = 900;
var BUMP_VAR = 181; // 900-1080 seconds (15-18 min)
var PLIST = PB + encodeURIComponent("https://megapersonals.eu/users/posts/list");
var SK = "__ar_" + USERNAME; // sessionStorage key

// ── STATE ─────────────────────────────────────────────────────────────────
function getState() {
  try { return JSON.parse(sessionStorage.getItem(SK)) || {}; } catch(e) { return {}; }
}
function saveState(s) {
  try { sessionStorage.setItem(SK, JSON.stringify(s)); } catch(e) {} 
}
function st() {
  var s = getState();
  return {
    on:    !!s.on,
    cnt:   s.cnt   || 0,
    nextAt:s.nextAt || 0,
    total: s.total  || 0,
    logs:  s.logs   || []
  };
}

// ── SCHEDULE NEXT BUMP ────────────────────────────────────────────────────
function schedNext() {
  var secs = BUMP_BASE + Math.floor(Math.random() * BUMP_VAR);
  var s = getState();
  s.total = secs;
  s.nextAt = Date.now() + secs * 1000;
  saveState(s);
  addLog("in", "Proximo bump en " + Math.floor(secs/60) + "m " + secs%60 + "s");
}

// ── LOG ───────────────────────────────────────────────────────────────────
function addLog(type, msg) {
  var s = getState();
  if (!s.logs) s.logs = [];
  var t = new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  s.logs.unshift({type:type, msg:"[" + t + "] " + msg});
  if (s.logs.length > 20) s.logs = s.logs.slice(0,20);
  saveState(s);
  renderLog();
}

function renderLog() {
  var el = document.getElementById("__ar_log");
  if (!el) return;
  var logs = getState().logs || [];
  el.innerHTML = logs.map(function(l){
    return '<div class="entry ' + l.type + '">' + l.msg + '</div>';
  }).join("");
}

// ── RENTAL COUNTDOWN ──────────────────────────────────────────────────────
function getRentalLeft() {
  if (!RENTAL_END_TS) return null;
  return Math.max(0, RENTAL_END_TS - Date.now());
}

function formatMs(ms) {
  if (ms === null) return {d:"∞",h:"--",m:"--",s:"--",total:ms};
  var secs = Math.floor(ms/1000);
  var d = Math.floor(secs/86400);
  var h = Math.floor((secs%86400)/3600);
  var m = Math.floor((secs%3600)/60);
  var s = secs%60;
  return {d:d,h:h,m:m,s:s,total:ms};
}

function pad(n) { return String(n).padStart(2,"0"); }

// ── UI UPDATE ─────────────────────────────────────────────────────────────
function updateUI() {
  var state = st();
  var dot = document.getElementById("__ar_dot");
  var bLbl = document.getElementById("__ar_blbl");
  var bBtn = document.getElementById("__ar_btoggle");
  var cdEl = document.getElementById("__ar_cd");
  var pbarEl = document.getElementById("__ar_pbar");

  // Bump button state
  if (dot) dot.className = "__ar_dot " + (state.on ? "on" : "off");
  if (bLbl) bLbl.textContent = state.on ? "Auto-bump ON" : "Auto-bump OFF";
  if (bBtn) {
    if (state.on) bBtn.classList.add("active"); else bBtn.classList.remove("active");
  }

  // Bump countdown
  var left = state.on ? Math.max(0, Math.floor((state.nextAt - Date.now())/1000)) : 0;
  var bm = Math.floor(left/60), bs = left%60;
  var bStr = state.on ? (pad(bm)+":"+pad(bs)) : "--:--";
  if (cdEl) cdEl.textContent = bStr;

  // Progress bar
  if (pbarEl && state.total > 0) {
    var pct = state.on ? Math.max(0, Math.min(100, (left/state.total)*100)) : 0;
    pbarEl.style.width = pct + "%";
  } else if (pbarEl) {
    pbarEl.style.width = "0%";
  }

  // Rental in popup
  var rl = getRentalLeft();
  var rf = formatMs(rl);
  var rdEl = document.getElementById("__ar_rd");
  var rhEl = document.getElementById("__ar_rh");
  var rmEl = document.getElementById("__ar_rm");
  if (rdEl) rdEl.textContent = rf.d;
  if (rhEl) rhEl.textContent = typeof rf.h === "number" ? rf.h : rf.h;
  if (rmEl) rmEl.textContent = typeof rf.m === "number" ? rf.m : rf.m;

  // Rental bar label
  var rLblEl = document.getElementById("__ar_rlbl");
  if (rLblEl) {
    if (rl === null) { rLblEl.textContent = "Plan ilimitado"; rLblEl.className = "v green"; }
    else if (rl <= 0) { rLblEl.textContent = "Expirado!"; rLblEl.className = "v red"; }
    else {
      var rd2 = Math.ceil(rl/86400000);
      var col = rd2 <= 1 ? "red" : rd2 <= 3 ? "yellow" : "green";
      rLblEl.textContent = rd2 + (rd2===1?" dia":" dias") + " restantes";
      rLblEl.className = "v " + col;
    }
  }

  // Bump count in popup
  var bcEl = document.getElementById("__ar_bcnt");
  if (bcEl) bcEl.textContent = String(state.cnt);

  // Bump next in popup
  var bnEl = document.getElementById("__ar_bnxt");
  if (bnEl) bnEl.textContent = state.on ? (pad(bm)+":"+pad(bs)) : "--:--";

  // Bar: rental compact
  var barREl = document.getElementById("__ar_bar_rent");
  if (barREl) {
    if (rl === null) { barREl.textContent = "∞"; barREl.className = "val green"; }
    else if (rl <= 0) { barREl.textContent = "EXP"; barREl.className = "val red"; }
    else {
      var rd3 = Math.ceil(rl/86400000);
      barREl.textContent = rd3 + "d";
      barREl.className = "val " + (rd3<=1?"red":rd3<=3?"yellow":"green");
    }
  }
}

// ── BUMP LOGIC ────────────────────────────────────────────────────────────
function goList(ms) {
  setTimeout(function(){ window.location.href = PLIST; }, ms||1500);
}

async function doBump() {
  var s = getState();
  if (!s.on) return;

  var dot = document.getElementById("__ar_dot");
  if (dot) dot.className = "__ar_dot wait";
  addLog("in","Republicando...");
  schedNext();

  // Method 1: #managePublishAd
  var pb = document.getElementById("managePublishAd");
  if (pb) {
    try {
      pb.scrollIntoView({behavior:"smooth",block:"center"});
      await pause(300 + rnd(500));
      pb.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
      await pause(100 + rnd(200));
      pb.click();
      s = getState(); s.cnt++; saveState(s);
      addLog("ok","Bump #" + s.cnt + " enviado (boton)");
    } catch(e) {}
    return;
  }

  // Method 2: bump/repost links
  var links = Array.from(document.querySelectorAll("a[href]"));
  for (var i=0; i<links.length; i++) {
    var h = links[i].getAttribute("href")||"", realH = h;
    try {
      if (h.includes("/api/angel-rent")) {
        var mm = h.match(/[?&]url=([^&]+)/);
        if (mm) realH = decodeURIComponent(mm[1]);
      }
    } catch(x) {}
    if (/(\/)(bump|repost|renew|republish)(\/\d+)/.test(realH)) {
      try {
        links[i].scrollIntoView({behavior:"smooth",block:"center"});
        await pause(300 + rnd(500));
        links[i].click();
        s = getState(); s.cnt++; saveState(s);
        addLog("ok","Bump #" + s.cnt + " (link)");
      } catch(e) {}
      return;
    }
  }

  // Method 3: fetch by post ID
  var ids = [];
  links.forEach(function(a) {
    var h2 = a.getAttribute("href")||"", rh2 = h2;
    try {
      if (h2.includes("/api/angel-rent")) { var mm2=h2.match(/[?&]url=([^&]+)/); if(mm2) rh2=decodeURIComponent(mm2[1]); }
    } catch(x){}
    var m1=rh2.match(/\/(bump|repost|renew|edit|detail|view)\/(\d{5,})/);
    if (m1&&m1[2]&&ids.indexOf(m1[2])===-1) ids.push(m1[2]);
    var m2=rh2.match(/users\/posts\/[a-z]+\/(\d{5,})/);
    if (m2&&m2[1]&&ids.indexOf(m2[1])===-1) ids.push(m2[1]);
  });
  document.querySelectorAll("[data-id],[data-post-id]").forEach(function(el){
    var id=el.getAttribute("data-id")||el.getAttribute("data-post-id")||"";
    if (/^\d{5,}$/.test(id)&&ids.indexOf(id)===-1) ids.push(id);
  });

  if (ids.length) {
    for (var j=0; j<ids.length; j++) {
      try {
        var r = await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[j]),{credentials:"include",redirect:"follow"});
        if (r.ok) {
          var txt = await r.text();
          if (txt.includes("blocked")||txt.includes("Attention")) { addLog("er","Bloqueado #"+ids[j]); }
          else { s=getState(); s.cnt++; saveState(s); addLog("ok","Bump #"+s.cnt+" (fetch "+ids[j]+")"); }
        } else { addLog("er","HTTP "+r.status+" #"+ids[j]); }
      } catch(e) { addLog("er","Error: "+String(e.message||e)); }
      if (j<ids.length-1) await pause(1500+rnd(2000));
    }
  } else {
    addLog("er","No se encontraron posts");
    var s2=getState(); if(s2.on && CUR.indexOf("/users/posts/list")===-1) goList(3000);
  }
  updateUI();
}

// ── PAGE HANDLER (runs once on load) ──────────────────────────────────────
function handlePage() {
  var u = CUR;
  
  // Success pages → click OK and go back to list
  if (u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1) {
    addLog("ok","Publicado exitosamente");
    autoClickOK();
    return;
  }
  if (/\/users\/posts\/(bump|repost|renew)\/\d+/.test(u)) {
    setTimeout(function(){ autoClickOK(); goList(2000); }, 2000);
    return;
  }
  if (u.indexOf("/error")!==-1||u.indexOf("/404")!==-1) {
    var s=getState(); if(s.on) goList(3000);
    return;
  }
  // Post list page → start tick
  if (u.indexOf("/users/posts/list")!==-1||u.indexOf("/users/posts")!==-1) {
    startTick();
    return;
  }
  // Login page → do NOT start tick (wait for login)
  if (u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1) {
    return;
  }
  // Edit page → do NOT bump
  if (u.indexOf("/users/posts/edit/")!==-1) {
    return;
  }
  // Unknown page → if bump on, check content then go list
  var s3=getState();
  if (s3.on) {
    setTimeout(function(){
      var body = (document.body ? document.body.innerText : "").toLowerCase();
      if (body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1) {
        addLog("er","Bloqueado - esperando 30s"); goList(30000); return;
      }
      if (body.indexOf("captcha")!==-1) { addLog("er","Captcha - resuelve manualmente"); return; }
      if (document.getElementById("managePublishAd")) { startTick(); return; }
      addLog("in","Pagina desconocida - volviendo"); goList(15000);
    }, 3000);
  }
}

function autoClickOK() {
  var done = false;
  var chk = setInterval(function(){
    if (done) return;
    var btns = document.querySelectorAll("button,a,input[type=button],input[type=submit]");
    for (var i=0;i<btns.length;i++){
      var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();
      if (t==="ok"||t==="okay"||t==="done"||t==="continue"||t==="continuar"){
        done=true; clearInterval(chk);
        setTimeout(function(){try{btns[i].click();}catch(e){}; goList(2000);}, 500);
        return;
      }
    }
  }, 400);
  setTimeout(function(){ if(!done){clearInterval(chk); goList(500);} }, 8000);
}

// ── TICK ──────────────────────────────────────────────────────────────────
var tickHandle = null;
function startTick() {
  if (tickHandle) return;
  tickHandle = setInterval(function(){
    var s = getState();
    if (!s.on) return;
    updateUI();
    if (Date.now() >= s.nextAt && s.nextAt > 0) doBump();
  }, 1000);
}

// ── POWER TOGGLE ──────────────────────────────────────────────────────────
window.__ar_power = function() {
  var s = getState();
  if (s.on) {
    s.on = false; s.nextAt = 0; saveState(s);
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    addLog("in","Auto-bump desactivado");
  } else {
    s.on = true; s.cnt = 0; saveState(s);
    addLog("ok","Auto-bump activado");
    schedNext();
    startTick();
    doBump();
  }
  updateUI();
};

// ── POPUP TOGGLE ──────────────────────────────────────────────────────────
var popOpen = false;
window.__ar_popup = function() {
  popOpen = !popOpen;
  var p = document.getElementById("__ar_popup");
  if (p) { if(popOpen) p.classList.add("show"); else p.classList.remove("show"); }
};

// ── AUTO-LOGIN ────────────────────────────────────────────────────────────
// Approach: fill fields with real values, then overlay visual mask showing bullets
function doAutoLogin() {
  if (!B64E) return;
  var email, pass;
  try { email = atob(B64E); pass = atob(B64P); } catch(e) { return; }
  if (!email || !pass) return;

  // Find email field
  var ef = document.querySelector('input[name="email_address"]') ||
           document.querySelector('input[name="email"]') ||
           document.querySelector('input[type="email"]') ||
           document.querySelector('input[name="username"]') ||
           document.querySelector('input[name="login"]');
  if (!ef) {
    // Try by placeholder
    var inps = document.querySelectorAll('input[type="text"],input:not([type])');
    for (var i=0; i<inps.length; i++) {
      var pl = (inps[i].getAttribute("placeholder")||"").toLowerCase();
      if (pl.indexOf("email")!==-1||pl.indexOf("user")!==-1||pl.indexOf("mail")!==-1) { ef=inps[i]; break; }
    }
  }

  var pf = document.querySelector('input[type="password"]') ||
           document.querySelector('input[name="password"]') ||
           document.querySelector('input[name="pass"]');

  if (!ef || !pf) return;

  // Set values using native setter (works even with framework-controlled inputs)
  function setVal(el, val) {
    var nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (nv && nv.set) { nv.set.call(el, val); }
    else { el.value = val; }
    ["input","change","blur"].forEach(function(ev) {
      el.dispatchEvent(new Event(ev, {bubbles:true}));
    });
  }

  setVal(ef, email);
  setVal(pf, pass);

  // Visual mask: make email field text invisible, overlay asterisk display
  applyMask(ef, email);
  // Password already shows dots (type=password) — no need to mask

  // Unlock on submit (allow form to send real values)
  var form = ef.closest("form") || pf.closest("form");
  if (form) {
    var unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      removeMask(ef);
    }
    form.addEventListener("submit", unlock, true);
    var sub = form.querySelector('button[type="submit"],input[type="submit"],input[type="image"]');
    if (!sub) sub = form.querySelector("button");
    if (sub) sub.addEventListener("click", unlock, true);
  }
}

function applyMask(input, realValue) {
  // Make the input text transparent
  input.style.cssText += ";color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important";
  input.setAttribute("readonly","readonly");
  input.setAttribute("autocomplete","off");

  // Create overlay that shows bullets
  var bullets = "";
  for (var i=0; i<realValue.length; i++) bullets += "●";

  var mask = document.createElement("div");
  mask.className = "__ar_mask";
  mask.id = "__ar_emask_" + Date.now();
  mask.textContent = bullets;
  mask.style.cssText = [
    "position:absolute",
    "top:0","left:0","right:0","bottom:0",
    "display:flex","align-items:center",
    "padding:" + getComputedStyle(input).padding,
    "font-size:18px",
    "letter-spacing:2px",
    "color:" + (getComputedStyle(input).color||"#333"),
    "pointer-events:none",
    "user-select:none",
    "z-index:999",
  ].join(";");

  // Wrap input
  var parent = input.parentNode;
  if (parent && getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }
  if (parent) parent.appendChild(mask);
  input._arMaskId = mask.id;
}

function removeMask(input) {
  if (input._arMaskId) {
    var m = document.getElementById(input._arMaskId);
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  input.style.color = "";
  input.style.webkitTextFillColor = "";
  input.style.caretColor = "";
  input.removeAttribute("readonly");
}

// Try auto-login multiple times
var loginDone = false;
function tryLogin() {
  if (loginDone) return;
  doAutoLogin();
  var ef2 = document.querySelector('input[name="email_address"],input[name="email"],input[type="email"],input[name="username"]');
  if (ef2 && ef2.value) loginDone = true;
}
setTimeout(tryLogin, 600);
setTimeout(tryLogin, 1500);
setTimeout(tryLogin, 3000);
var loginRetry = setInterval(function(){ tryLogin(); if(loginDone) clearInterval(loginRetry); }, 1000);
setTimeout(function(){ clearInterval(loginRetry); }, 20000);

// ── UTILS ─────────────────────────────────────────────────────────────────
function rnd(n) { return Math.floor(Math.random()*n); }
function pause(ms) { return new Promise(function(r){ setTimeout(r,ms); }); }

// ── BUILD HTML TOOLBAR ────────────────────────────────────────────────────
function buildBar() {
  var wrap = document.createElement("div");
  wrap.className = "__ar_wrap";

  var bar = document.createElement("div");
  bar.className = "__ar_bar";
  bar.innerHTML = [
    '<span class="__ar_logo" onclick="__ar_popup()" title="Angel Rent">👼</span>',
    '<div class="__ar_seg">',
      '<div class="__ar_dot off" id="__ar_dot"></div>',
      '<span class="lbl">Bump</span>',
      '<span class="val" id="__ar_cd">--:--</span>',
    '</div>',
    '<div class="__ar_pbar_wrap"><div class="__ar_pbar" id="__ar_pbar" style="width:0%"></div></div>',
    '<div class="__ar_sep"></div>',
    '<div class="__ar_seg">',
      '<span class="lbl">Renta</span>',
      '<span class="val green" id="__ar_bar_rent">...</span>',
    '</div>',
    '<div class="__ar_sep"></div>',
    '<span id="__ar_blbl" style="font-size:10px;color:rgba(255,255,255,.3)">Auto-bump OFF</span>',
    '<span class="__ar_spacer"></span>',
    '<button class="__ar_btn toggle" id="__ar_btoggle" onclick="__ar_power()">⏻ Auto-bump</button>',
    '<button class="__ar_btn info" onclick="__ar_popup()">&#9776; Info</button>',
  ].join("");
  wrap.appendChild(bar);

  // Popup
  var popup = document.createElement("div");
  popup.className = "__ar_popup";
  popup.id = "__ar_popup";
  popup.innerHTML = [
    '<div class="__ar_pop_head">',
      '<div class="title">👼 Angel Rent</div>',
      '<div class="sub">${sName} &middot; ${username}</div>',
    '</div>',

    // Rental section
    '<div class="__ar_pop_row">',
      '<span class="k">⏰ Renta restante</span>',
      '<span class="v" id="__ar_rlbl">...</span>',
    '</div>',
    '<div class="__ar_pop_row" style="justify-content:center;gap:12px;padding-bottom:12px">',
      '<div style="text-align:center;background:rgba(168,85,247,.07);border:1px solid rgba(168,85,247,.1);border-radius:10px;padding:8px 14px">',
        '<div style="font-size:22px;font-weight:900;color:#a855f7;font-variant-numeric:tabular-nums" id="__ar_rd">-</div>',
        '<div style="font-size:8px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.5px">Dias</div>',
      '</div>',
      '<div style="text-align:center;background:rgba(168,85,247,.07);border:1px solid rgba(168,85,247,.1);border-radius:10px;padding:8px 14px">',
        '<div style="font-size:22px;font-weight:900;color:#a855f7;font-variant-numeric:tabular-nums" id="__ar_rh">-</div>',
        '<div style="font-size:8px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.5px">Horas</div>',
      '</div>',
      '<div style="text-align:center;background:rgba(168,85,247,.07);border:1px solid rgba(168,85,247,.1);border-radius:10px;padding:8px 14px">',
        '<div style="font-size:22px;font-weight:900;color:#a855f7;font-variant-numeric:tabular-nums" id="__ar_rm">-</div>',
        '<div style="font-size:8px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.5px">Min</div>',
      '</div>',
    '</div>',

    // Bump section
    '<div class="__ar_pop_row">',
      '<span class="k">🔄 Auto-republica</span>',
      '<span class="v purple" id="__ar_bcnt">0</span>',
    '</div>',
    '<div class="__ar_pop_row">',
      '<span class="k">⏱ Proximo bump</span>',
      '<span class="v" id="__ar_bnxt">--:--</span>',
    '</div>',
    '<div class="__ar_pop_row" style="border:none;padding-bottom:4px">',
      '<span class="k">Estado</span>',
      '<button class="__ar_btn toggle" id="__ar_ptoggle" onclick="__ar_power()" style="font-size:10px;padding:3px 10px">⏻ Toggle</button>',
    '</div>',

    // Log
    '<div class="__ar_pop_log" id="__ar_log"></div>',
    '<div style="padding:8px 16px;text-align:right"><button class="__ar_btn info" onclick="__ar_popup()" style="font-size:10px">Cerrar</button></div>',
  ].join("");
  wrap.appendChild(popup);

  // Push page content down so bar doesn't cover it
  document.body.style.paddingTop = "38px";
  document.body.insertBefore(wrap, document.body.firstChild);
}

// ── KEEP POPUP ID CORRECT ─────────────────────────────────────────────────
// The popup div id conflicts with the function name — rename div reference
window.__ar_popup = function() {
  popOpen = !popOpen;
  var p = document.getElementById("__ar_popup");
  if (p) { if(popOpen) p.classList.add("show"); else p.classList.remove("show"); }
};

// ── INIT ──────────────────────────────────────────────────────────────────
buildBar();
handlePage();
// Tick to update UI every second
setInterval(updateUI, 1000);
updateUI();
renderLog();
// If already on and was bumping before page load, restart tick
var _initState = getState();
if (_initState.on) startTick();

})();
</script>`;

  const block = css + script;
  return html.includes("<body") ? html.replace(/(<body[^>]*>)/i,"$1"+block) : block+html;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function enc(s:string){return encodeURIComponent(s||"");}
function cors():Record<string,string>{
  return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
}
function jres(s:number,b:object){
  return new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json",...cors()}});
}
function expiredPage(title:string,msg:string){
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">&#x1F512;</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    {status:403,headers:{"Content-Type":"text/html; charset=utf-8",...cors()}}
  );
}

const UA_MAP:Record<string,string>={
  iphone:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone14:"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  android:"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  android_pixel:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  windows:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  windows11:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  mac:"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};
function getUA(u:ProxyUser){
  if(u.userAgentKey==="custom"&&u.userAgent)return u.userAgent;
  return UA_MAP[u.userAgentKey||""]||UA_MAP.iphone;
}

// ── Fetch via proxy ────────────────────────────────────────────────────────────
function fetchProxy(url:string,agent:any,method:string,postBody:string|null,postCT:string|null,cookies:string,ua:string):Promise<FetchResult>{
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const lib=u.protocol==="https:"?https:http;
    const headers:Record<string,string>={
      "User-Agent":ua,"Accept":"text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language":"en-US,en;q=0.5","Accept-Encoding":"identity",
      "Host":u.hostname,"Connection":"keep-alive",
    };
    if(cookies)headers["Cookie"]=cookies;
    if(method==="POST"&&postCT){
      headers["Content-Type"]=postCT;
      if(postBody)headers["Content-Length"]=Buffer.byteLength(postBody).toString();
    }
    const req=(lib as typeof https).request({
      hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),
      path:u.pathname+u.search,method,agent,headers,timeout:25000,
    },(r)=>{
      const sc=(()=>{const raw=r.headers["set-cookie"];return !raw?[]:Array.isArray(raw)?raw:[raw];})();
      if([301,302,303,307,308].includes(r.statusCode!)&&r.headers.location){
        const redir=new URL(r.headers.location,url).href;
        const nm=[301,302,303].includes(r.statusCode!)?"GET":method;
        let ck=cookies;
        if(sc.length){const nv=sc.map(s=>s.split(";")[0]);ck=(ck?ck+"; ":"")+nv.join("; ");}
        return fetchProxy(redir,agent,nm,null,null,ck,ua)
          .then(res=>{res.setCookies=[...sc,...res.setCookies];resolve(res);})
          .catch(reject);
      }
      const chunks:Buffer[]=[];
      r.on("data",(c:Buffer)=>chunks.push(c));
      r.on("end",()=>{
        const h:Record<string,string>={};
        for(const[k,v]of Object.entries(r.headers))if(v&&k!=="set-cookie")h[k]=Array.isArray(v)?v.join(", "):v as string;
        resolve({status:r.statusCode||200,headers:h,body:Buffer.concat(chunks),setCookies:sc});
      });
      r.on("error",reject);
    });
    req.on("error",reject);
    req.on("timeout",()=>{req.destroy();reject(new Error("Timeout"));});
    if(method==="POST"&&postBody)req.write(postBody);
    req.end();
  });
}

// ── HTML/CSS rewrite ───────────────────────────────────────────────────────────
function resolveUrl(url:string,base:string,cur:string):string{
  try{
    if(/^(data:|blob:|javascript:|#|mailto:)/.test(url))return url;
    if(url.startsWith("//"))return "https:"+url;
    if(/^https?:\/\//.test(url))return url;
    if(url.startsWith("/"))return base+url;
    return cur.substring(0,cur.lastIndexOf("/")+1)+url;
  }catch{return url;}
}

function rewriteHtml(html:string,base:string,pb:string,cur:string):string{
  html=html.replace(/<base[^>]*>/gi,"");
  html=html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"");
  html=html.replace(/(href\s*=\s*["'])([^"'#]+)(["'])/gi,(_,a,u,b)=>{
    const t=u.trim();
    if(/^(javascript:|data:|mailto:)/.test(t)||t.length<2)return _;
    return a+pb+encodeURIComponent(resolveUrl(t,base,cur))+b;
  });
  html=html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi,(_,a,u,b)=>
    /^(data:|blob:|javascript:)/.test(u)?_:a+pb+encodeURIComponent(resolveUrl(u.trim(),base,cur))+b);
  html=html.replace(/(action\s*=\s*["'])([^"']*)(["'])/gi,(_,a,u,b)=>{
    if(!u||u==="#")return a+pb+encodeURIComponent(cur)+b;
    return a+pb+encodeURIComponent(resolveUrl(u.trim(),base,cur))+b;
  });
  html=html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,(_,o,css2,c)=>
    o+css2.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,(cm:string,ca:string,cu:string,cb:string)=>
      cu.startsWith("data:")?cm:ca+pb+encodeURIComponent(resolveUrl(cu.trim(),base,cur))+cb)+c);

  const zl=`<script>(function(){
var P="${pb.replace(/"/g,'\\"')}",B="${base}",C="${cur.replace(/"/g,'\\"')}";
function px(u){
  if(!u||typeof u!=="string")return null;
  if(u==="#"||u.indexOf("javascript:")===0||u.indexOf("data:")===0||u.indexOf("blob:")===0||u.indexOf("/api/angel-rent")!==-1)return null;
  if(u.indexOf("//")===0)u="https:"+u;
  if(/^https?:\\/\\//.test(u))return P+encodeURIComponent(u);
  if(u.indexOf("/")===0)return P+encodeURIComponent(B+u);
  return P+encodeURIComponent(C.substring(0,C.lastIndexOf("/")+1)+u);
}
document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
  var h=a.getAttribute("href");
  if(!h||h==="#"||h.indexOf("javascript:")===0||h.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();e.stopImmediatePropagation();var d=px(h);if(d)location.href=d;
},true);
var _fe=window.fetch;if(_fe)window.fetch=function(u,o){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)u=f;}return _fe.call(this,u,o);};
var _xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var f=px(u);if(f)arguments[1]=f;}return _xo.apply(this,arguments);};
var _wo=window.open;window.open=function(u,t,f){if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var p=px(u);if(p)u=p;}return _wo.call(this,u,t,f);};
document.addEventListener("submit",function(e){
  var f=e.target,a=f.getAttribute("action")||"";if(a.indexOf("/api/angel-rent")!==-1)return;
  e.preventDefault();e.stopImmediatePropagation();
  var r;try{r=a?new URL(a,B).href:C;}catch(x){r=C;}
  var n=document.createElement("form");n.method=f.method||"POST";n.action=P+encodeURIComponent(r);n.style.display="none";
  var d=new FormData(f);for(var p of d.entries()){var i=document.createElement("input");i.type="hidden";i.name=p[0];i.value=p[1];n.appendChild(i);}
  document.body.appendChild(n);n.submit();
},true);
try{window.RTCPeerConnection=function(){throw new Error("blocked");};window.webkitRTCPeerConnection=function(){throw new Error("blocked");};}catch(x){}
})();<\/script>`;

  return html.match(/<head[^>]*>/i)?html.replace(/<head[^>]*>/i,"$&"+zl):zl+html;
}

function rewriteCss(css:string,base:string,pb:string):string{
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,(_,a,u,b)=>
    u.startsWith("data:")?_:a+pb+encodeURIComponent(resolveUrl(u.trim(),base,base+"/"))+b);
}
