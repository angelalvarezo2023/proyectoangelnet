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
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  setCookies: string[];
}

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
export async function OPTIONS() { return new Response("", { status: 200, headers: cors() }); }

async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const targetUrl = sp.get("url");
  const username = sp.get("u");
  if (!targetUrl) return jres(400, { error: "Falta ?url=" });
  if (!username)  return jres(400, { error: "Falta ?u=usuario" });

  try {
    const user = await getUser(username);
    if (!user) return jres(403, { error: "Usuario no encontrado" });
    if (!user.active) return expired("Cuenta Desactivada", "Tu cuenta fue desactivada. Contacta al administrador.");
    if (user.rentalEnd && new Date() > new Date(user.rentalEnd + "T23:59:59"))
      return expired("Plan Expirado", "Tu plan venció el " + user.rentalEnd + ". Contacta al administrador.");

    const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
    if (!PH || !PT) return jres(400, { error: "Proxy no configurado" });

    const decoded = decodeURIComponent(targetUrl);
    const proxyUrl = PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    const pb = `/api/angel-rent?u=${enc(username)}&url=`;

    let postBody: string | null = null, postCT: string | null = null;
    if (method === "POST") {
      postBody = await req.text();
      postCT = req.headers.get("content-type") || "application/x-www-form-urlencoded";
    }

    const cookies = req.headers.get("cookie") || "";
    const ua = getUA(user);
    const resp = await fetchProxy(decoded, agent, method, postBody, postCT, cookies, ua);
    const ct = resp.headers["content-type"] || "";

    const rh = new Headers(cors());
    resp.setCookies.forEach(c => rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi,"").replace(/Secure;?\s*/gi,"").replace(/SameSite=\w+;?\s*/gi,"SameSite=Lax; ")
    ));

    if (ct.includes("text/html")) {
      let html = resp.body.toString("utf-8");
      html = rewriteHtml(html, new URL(decoded).origin, pb, decoded);
      html = injectToolbar(html, decoded, username, user);
      rh.set("Content-Type", "text/html; charset=utf-8");
      return new Response(html, { status: 200, headers: rh });
    }
    if (ct.includes("text/css")) {
      rh.set("Content-Type", "text/css");
      return new Response(rewriteCss(resp.body.toString("utf-8"), new URL(decoded).origin, pb), { status: 200, headers: rh });
    }
    if (ct.includes("javascript") || ct.includes("text/")) {
      rh.set("Content-Type", ct);
      return new Response(resp.body.toString("utf-8"), { status: 200, headers: rh });
    }
    rh.set("Content-Type", ct);
    rh.set("Cache-Control", "public, max-age=3600");
    return new Response(resp.body, { status: 200, headers: rh });

  } catch (err: any) {
    console.error("[AR]", err.message);
    return jres(500, { error: err.message });
  }
}

// ── Firebase ──────────────────────────────────────────────────────────────────
async function getUser(u: string): Promise<ProxyUser | null> {
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers/${u.toLowerCase()}.json`, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
      r.on("error", rej);
    }).on("error", rej);
  });
}

// ── Toolbar + Auto-bump + Auto-login ─────────────────────────────────────────
function injectToolbar(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb  = `/api/angel-rent?u=${enc(username)}&url=`;

  // Rental countdown
  let rd = -1, rh2 = 0, rm = 0, re = "";
  if (user.rentalEnd) {
    const diff = new Date(user.rentalEnd + "T23:59:59").getTime() - Date.now();
    if (diff > 0) { rd = Math.floor(diff/86400000); rh2 = Math.floor((diff%86400000)/3600000); rm = Math.floor((diff%3600000)/60000); }
    else rd = 0;
    re = user.rentalEnd;
  }

  // Safe JS string values — escape backslash first, then quotes
  const sPb  = pb.replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$/g,"\\$");
  const sCur = curUrl.replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$/g,"\\$");
  const sName = (user.name || username).replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  // Credentials as base64 — safe to embed directly
  const b64e = Buffer.from(user.siteEmail || "").toString("base64");
  const b64p = Buffer.from(user.sitePass  || "").toString("base64");

  const css = `
<style>
.__ar{all:initial}.__ar *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.__ar_bar{position:fixed;bottom:16px;left:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;background:rgba(10,5,20,.93);border:1px solid rgba(168,85,247,.25);border-radius:16px;padding:8px 14px;backdrop-filter:blur(12px);box-shadow:0 4px 20px rgba(0,0,0,.5);color:#fff;font-size:12px;cursor:pointer}
.__ar_dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.__ar_dot.on{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,.6)}
.__ar_dot.off{background:#ef4444}
.__ar_dot.wait{background:#f59e0b;animation:ar_bl 1.2s infinite}
@keyframes ar_bl{0%,100%{opacity:1}50%{opacity:.2}}
.__ar_cd{font-weight:700;color:#a855f7;min-width:40px;font-variant-numeric:tabular-nums}
.__ar_pow{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,.5);transition:.2s}
.__ar_pow:hover{transform:scale(1.08)}.__ar_pow:active{transform:scale(.93)}
.__ar_pow.on{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
.__ar_pow.off{background:linear-gradient(135deg,#6b7280,#4b5563);color:#fff}
.__ar_pop{position:fixed;bottom:76px;left:16px;z-index:2147483646;width:300px;max-width:calc(100vw - 32px);background:rgba(10,5,20,.97);border:1px solid rgba(168,85,247,.2);border-radius:18px;color:#fff;display:none;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.7)}
.__ar_pop.show{display:block;animation:ar_in .18s ease-out}
@keyframes ar_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.__ar_ph{background:linear-gradient(135deg,rgba(168,85,247,.15),rgba(236,72,153,.08));padding:14px 16px 10px;border-bottom:1px solid rgba(168,85,247,.08)}
.__ar_ph .t{font-size:13px;font-weight:700}.__ar_ph .u{font-size:10px;color:rgba(255,255,255,.3);margin-top:2px}
.__ar_pr{padding:12px 16px;border-bottom:1px solid rgba(168,85,247,.05)}
.__ar_pr .rl{font-size:8px;color:rgba(168,85,247,.4);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:6px}
.__ar_pr .rt{display:flex;gap:6px;justify-content:center}
.__ar_rb{text-align:center;background:rgba(168,85,247,.05);border:1px solid rgba(168,85,247,.08);border-radius:8px;padding:6px 10px;min-width:52px}
.__ar_rb .rn{font-size:20px;font-weight:900;color:#a855f7;font-variant-numeric:tabular-nums}
.__ar_rb .ru{font-size:7px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.5px;margin-top:1px}
.__ar_rexp{font-size:9px;color:rgba(255,255,255,.2);text-align:center;margin-top:6px}
.__ar_bp{padding:12px 16px}
.__ar_bl2{font-size:8px;color:rgba(168,85,247,.4);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:6px}
.__ar_brow{display:flex;justify-content:space-between;align-items:center;padding:4px 0}
.__ar_bk{font-size:10px;color:rgba(255,255,255,.35)}.__ar_bv{font-size:11px;font-weight:700}
.__ar_bv.on{color:#22c55e}.__ar_bv.off{color:rgba(255,255,255,.2)}
.__ar_bn{text-align:center;margin-top:6px;padding:8px;background:rgba(168,85,247,.04);border-radius:8px;display:none}
.__ar_bn .bt{font-size:22px;font-weight:900;color:#a855f7;font-variant-numeric:tabular-nums}
.__ar_bbar{height:2px;background:rgba(168,85,247,.08);border-radius:99px;margin-top:4px;overflow:hidden}
.__ar_bf{height:100%;background:linear-gradient(90deg,#a855f7,#ec4899);border-radius:99px;transition:width 1s linear}
.__ar_log{max-height:44px;overflow-y:auto;font-size:8px;color:rgba(255,255,255,.2);margin-top:6px}
.__ar_log .ok{color:#22c55e}.__ar_log .er{color:#f472b6}.__ar_log .in{color:#a855f7}
</style>`;

  const html2 = `
<div class="__ar">
  <div class="__ar_bar" id="__ar_bar" onclick="__ar_toggle()">
    <div class="__ar_dot off" id="__ar_dot"></div>
    <span id="__ar_lbl">Apagado</span>
    <span class="__ar_cd" id="__ar_cd">--:--</span>
  </div>
  <button class="__ar_pow off" id="__ar_pow" onclick="__ar_power()">&#x23FB;</button>
  <div class="__ar_pop" id="__ar_pop">
    <div class="__ar_ph"><div class="t">&#x1F47C; Angel Rent</div><div class="u">${sName}</div></div>
    <div class="__ar_pr">
      <div class="rl">&#x23F0; Tiempo restante</div>
      <div class="rt">
        <div class="__ar_rb"><div class="rn" id="__ar_rd">${rd < 0 ? "&#x221E;" : rd}</div><div class="ru">D&iacute;as</div></div>
        <div class="__ar_rb"><div class="rn" id="__ar_rh">${rd < 0 ? "--" : rh2}</div><div class="ru">Horas</div></div>
        <div class="__ar_rb"><div class="rn" id="__ar_rm">${rd < 0 ? "--" : rm}</div><div class="ru">Min</div></div>
      </div>
      <div class="__ar_rexp">${re ? "Vence: " + re : "Plan ilimitado"}</div>
    </div>
    <div class="__ar_bp">
      <div class="__ar_bl2">&#x1F504; Auto Republicaci&oacute;n</div>
      <div class="__ar_brow"><span class="__ar_bk">Estado</span><span class="__ar_bv off" id="__ar_bst">Apagado</span></div>
      <div class="__ar_brow"><span class="__ar_bk">Bumps</span><span class="__ar_bv" id="__ar_bcnt" style="color:#a855f7">0</span></div>
      <div class="__ar_bn" id="__ar_bn">
        <div class="bt" id="__ar_btime">00:00</div>
        <div class="__ar_bbar"><div class="__ar_bf" id="__ar_bf" style="width:100%"></div></div>
      </div>
      <div class="__ar_log" id="__ar_log"></div>
    </div>
  </div>
</div>`;

  // Use concatenation instead of template literals to avoid escaping issues
  const script = `
<script>
(function(){
var PB="${sPb}",CUR="${sCur}",SS=sessionStorage,KEY="__ar_s";
var LURL="https://megapersonals.eu/users/posts/list";
var PLIST=PB+encodeURIComponent(LURL);

function ld(){try{return JSON.parse(SS.getItem(KEY))||{}}catch(e){return{}}}
function sv(s){try{SS.setItem(KEY,JSON.stringify(s))}catch(e){}}
function gs(){var s=ld();return{on:!!s.on,nextAt:s.nextAt||0,cnt:s.cnt||0,logs:s.logs||[],total:s.total||0}}
var st=gs();

function ri(){return 900+Math.floor(Math.random()*181)}

function addLog(t,m){
  var tm=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  st.logs.unshift({t:t,m:"["+tm+"] "+m});
  if(st.logs.length>30)st.logs=st.logs.slice(0,30);
  sv(st);renderLog();
}
function renderLog(){
  var el=document.getElementById("__ar_log");
  if(!el)return;
  el.innerHTML=st.logs.map(function(l){return'<div class="'+l.t+'">'+l.m+'</div>'}).join('');
}

function ui(){
  var dot=document.getElementById("__ar_dot");
  if(!dot)return;
  var lbl=document.getElementById("__ar_lbl"),cd=document.getElementById("__ar_cd");
  var pow=document.getElementById("__ar_pow"),bst=document.getElementById("__ar_bst");
  var bcnt=document.getElementById("__ar_bcnt"),bn=document.getElementById("__ar_bn");
  if(st.on){
    var left=Math.max(0,Math.floor((st.nextAt-Date.now())/1000));
    var mm=Math.floor(left/60),ss=left%60;
    var ts=(mm<10?"0":"")+mm+":"+(ss<10?"0":"")+ss;
    dot.className="__ar_dot on";
    if(lbl)lbl.textContent="Activo";
    if(cd)cd.textContent=ts;
    if(pow)pow.className="__ar_pow on";
    if(bst){bst.textContent="Activo";bst.className="__ar_bv on";}
    if(bn)bn.style.display="block";
    var bt=document.getElementById("__ar_btime"),bf=document.getElementById("__ar_bf");
    if(bt)bt.textContent=ts;
    if(bf&&st.total>0)bf.style.width=Math.max(0,Math.min(100,left/st.total*100))+"%";
  }else{
    dot.className="__ar_dot off";
    if(lbl)lbl.textContent="Apagado";
    if(cd)cd.textContent="--:--";
    if(pow)pow.className="__ar_pow off";
    if(bst){bst.textContent="Apagado";bst.className="__ar_bv off";}
    if(bn)bn.style.display="none";
  }
  if(bcnt)bcnt.textContent=String(st.cnt);
}

function schedNext(){
  var s=ri();st.total=s;st.nextAt=Date.now()+(s*1000);sv(st);
  addLog("in","Proximo en "+Math.floor(s/60)+"m "+s%60+"s");ui();
}

function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}

function findOK(){
  var btns=document.querySelectorAll("button,a,input[type=button],input[type=submit]");
  for(var i=0;i<btns.length;i++){
    var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();
    if(t==="ok"||t==="okay"||t==="continue"||t==="continuar"||t==="accept"||t==="aceptar"||t==="done"||t==="got it")return btns[i];
  }
  return null;
}

function autoOK(){
  var done=false;
  var chk=setInterval(function(){
    if(done)return;
    var b=findOK();
    if(b){done=true;clearInterval(chk);setTimeout(function(){try{b.click();}catch(e){}goList(2000);},500);}
  },500);
  setTimeout(function(){if(!done){clearInterval(chk);goList(500);}},8000);
}

var tickInterval=null;

async function doBump(){
  if(!st.on)return;
  var dot=document.getElementById("__ar_dot"),lbl=document.getElementById("__ar_lbl");
  if(dot)dot.className="__ar_dot wait";
  if(lbl)lbl.textContent="Republicando...";
  addLog("in","Republicando...");
  schedNext();

  // Method 1: #managePublishAd button
  var pb=document.getElementById("managePublishAd");
  if(pb){
    st.cnt++;sv(st);
    try{
      pb.scrollIntoView({behavior:"smooth",block:"center"});
      await new Promise(function(r){setTimeout(r,400+Math.random()*500);});
      pb.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
      await new Promise(function(r){setTimeout(r,150);});
      pb.click();
    }catch(e){}
    return;
  }

  // Method 2: bump/repost links
  var links=document.querySelectorAll("a[href]");
  for(var i=0;i<links.length;i++){
    var h=links[i].getAttribute("href")||"",d=h;
    try{if(h.includes("/api/angel-rent")){var mm2=h.match(/[?&]url=([^&]+)/);if(mm2)d=decodeURIComponent(mm2[1]);}}catch(x){}
    if(/(\/)(bump|repost|renew|republish)(\/\d+)/.test(d)){
      st.cnt++;sv(st);
      try{
        links[i].scrollIntoView({behavior:"smooth",block:"center"});
        await new Promise(function(r){setTimeout(r,400+Math.random()*500);});
        links[i].click();
      }catch(e){}
      return;
    }
  }

  // Method 3: fetch bump by post ID
  var ids=[];
  document.querySelectorAll("a[href]").forEach(function(a){
    var h=a.getAttribute("href")||"",dd=h;
    try{if(h.includes("/api/angel-rent")){var mm3=h.match(/[?&]url=([^&]+)/);if(mm3)dd=decodeURIComponent(mm3[1]);}}catch(x){}
    var m1=dd.match(/\/(bump|repost|renew|edit|detail|view)\/(\d{5,})/);
    if(m1&&m1[2]&&ids.indexOf(m1[2])===-1)ids.push(m1[2]);
    var m2=dd.match(/users\/posts\/[a-z]+\/(\d{5,})/);
    if(m2&&m2[1]&&ids.indexOf(m2[1])===-1)ids.push(m2[1]);
  });
  document.querySelectorAll("[data-id],[data-post-id]").forEach(function(el){
    var id=el.getAttribute("data-id")||el.getAttribute("data-post-id")||"";
    if(/^\d{5,}$/.test(id)&&ids.indexOf(id)===-1)ids.push(id);
  });

  if(ids.length){
    for(var j=0;j<ids.length;j++){
      try{
        var burl=PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[j]);
        var r=await fetch(burl,{credentials:"include",redirect:"follow"});
        if(r.ok){
          var txt=await r.text();
          if(txt.includes("blocked")||txt.includes("Attention Required")){
            addLog("er","Bloqueado #"+ids[j]);
          }else{
            st.cnt++;sv(st);addLog("ok","Bump #"+st.cnt+" ok");
          }
        }else{
          addLog("er","HTTP "+r.status+" #"+ids[j]);
        }
      }catch(e){addLog("er",String(e.message||e));}
      if(j<ids.length-1)await new Promise(function(r){setTimeout(r,1500+Math.random()*2000);});
    }
  }else{
    addLog("er","No posts encontrados");
    if(st.on&&CUR.indexOf("/users/posts/list")===-1)goList(3000);
  }
  ui();
}

function tock(){
  if(!st.on)return;
  st=gs();
  if(Date.now()>=st.nextAt&&st.nextAt>0)doBump();
  ui();
}

window.__ar_power=function(){
  if(st.on){
    st.on=false;st.nextAt=0;sv(st);
    if(tickInterval){clearInterval(tickInterval);tickInterval=null;}
    addLog("in","Apagado");ui();
  }else{
    st.on=true;st.cnt=0;sv(st);
    addLog("ok","Encendido");
    tickInterval=setInterval(tock,1000);
    ui();doBump();
  }
};

var popOpen=false;
window.__ar_toggle=function(){
  var p=document.getElementById("__ar_pop");
  if(!p)return;
  popOpen=!popOpen;
  if(popOpen)p.classList.add("show");else p.classList.remove("show");
};

// Page handler
(function(){
  var u=CUR;
  if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1||u.indexOf("success_renew")!==-1){
    addLog("ok","Publicado exitosamente");autoOK();return;
  }
  if((u.indexOf("/success")!==-1||u.indexOf("/pending")!==-1)&&u.indexOf("/users/posts/")===-1){
    autoOK();return;
  }
  if(/\/users\/posts\/(bump|repost|renew)\/\d+/.test(u)){
    setTimeout(function(){var b=findOK();if(b){b.click();goList(2000);}else goList(2000);},3000);return;
  }
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1||u.indexOf("/500")!==-1){
    if(st.on)goList(3000);return;
  }
  if(u.indexOf("/login")!==-1||u.indexOf("/sign_in")!==-1||u.indexOf("/users/login")!==-1){return;}
  if(u.indexOf("/users/posts/edit/")!==-1){return;}
  if(u.indexOf("/users/posts/list")!==-1||u.indexOf("/users/posts")!==-1){
    if(st.on&&!tickInterval)tickInterval=setInterval(tock,1000);
    ui();return;
  }
  if(st.on){
    setTimeout(function(){
      var body=(document.body?document.body.innerText:"").toLowerCase();
      if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1||body.indexOf("blocked")!==-1||body.indexOf("too many requests")!==-1){
        addLog("er","Bloqueado — reintento 30s");goList(30000);return;
      }
      if(body.indexOf("captcha")!==-1||body.indexOf("security check")!==-1){
        addLog("er","Captcha — resuelve manualmente");return;
      }
      if(body.indexOf("account suspended")!==-1||body.indexOf("account banned")!==-1){
        addLog("er","Cuenta suspendida");st.on=false;sv(st);ui();return;
      }
      if(document.getElementById("managePublishAd")||document.querySelector(".manage-list,.post-list-item"))return;
      addLog("in","Pagina desconocida — volviendo");goList(15000);
    },2500);
  }
})();

// Keep alive
setInterval(function(){st=gs();if(st.on&&!tickInterval)tickInterval=setInterval(tock,1000);ui();},3000);
renderLog();ui();
if(st.on&&!tickInterval)tickInterval=setInterval(tock,1000);

// ── AUTO-LOGIN ────────────────────────────────────────────────────────────
var _E="${b64e}",_P="${b64p}";
if(_E){
  var _fillDone=false;
  function _fill(){
    if(_fillDone)return;
    try{
      var ev=atob(_E),pv=atob(_P);
      if(!ev)return;
      // Find email field
      var ef=document.querySelector('input[name="email_address"]')||
             document.querySelector('input[name="email"]')||
             document.querySelector('input[type="email"]')||
             document.querySelector('input[name="username"]')||
             document.querySelector('input[name="login"]');
      // Fallback: any text input with email/user in placeholder
      if(!ef){
        var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
        for(var _i=0;_i<inputs.length;_i++){
          var _pl=(inputs[_i].getAttribute("placeholder")||"").toLowerCase();
          if(_pl.indexOf("email")!==-1||_pl.indexOf("user")!==-1||_pl.indexOf("name")!==-1){ef=inputs[_i];break;}
        }
      }
      // Find password field
      var pf=document.querySelector('input[type="password"]')||
             document.querySelector('input[name="password"]')||
             document.querySelector('input[name="pass"]');
      if(!ef||!pf)return;
      if(ef.value&&pf.value){_fillDone=true;return;}
      // Set values using native setter (works with React/jQuery)
      var nv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");
      if(nv&&nv.set){nv.set.call(ef,ev);nv.set.call(pf,pv);}
      else{ef.value=ev;pf.value=pv;}
      // Fire events
      ["input","change","blur"].forEach(function(evName){
        ef.dispatchEvent(new Event(evName,{bubbles:true}));
        pf.dispatchEvent(new Event(evName,{bubbles:true}));
      });
      // Hide visually
      ef.style.cssText+=";color:transparent!important;text-shadow:0 0 0 #555!important";
      ef.setAttribute("readonly","readonly");
      pf.setAttribute("readonly","readonly");
      // Unlock on submit
      var form=ef.closest("form")||pf.closest("form");
      if(form){
        var _unlock=function(){
          ef.removeAttribute("readonly");pf.removeAttribute("readonly");
          ef.style.color="";ef.style.textShadow="";
        };
        form.addEventListener("submit",_unlock,true);
        var _sub=form.querySelector('button[type="submit"],input[type="submit"],input[type="image"],button:not([type])');
        if(_sub)_sub.addEventListener("click",_unlock,true);
      }
      _fillDone=true;
    }catch(_x){}
  }
  // Try multiple times
  setTimeout(_fill,800);
  setTimeout(_fill,1500);
  setTimeout(_fill,3000);
  var _fillInterval=setInterval(function(){_fill();if(_fillDone)clearInterval(_fillInterval);},1000);
  setTimeout(function(){clearInterval(_fillInterval);},15000);
}

})();
</script>`;

  const block = css + html2 + script;
  return html.includes("<body") ? html.replace(/(<body[^>]*>)/i, "$1" + block) : block + html;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function enc(s: string) { return encodeURIComponent(s || ""); }
function cors(): Record<string,string> {
  return {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
}
function jres(s: number, b: object) {
  return new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json",...cors()}});
}
function expired(title: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angel Rent</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0515,#1a0a2e);padding:20px}.c{max-width:360px;width:100%;background:rgba(20,10,35,.9);border:1px solid rgba(236,72,153,.2);border-radius:24px;padding:36px 28px;text-align:center}.ic{font-size:52px;margin-bottom:12px}.t{font-size:20px;font-weight:800;color:#f472b6;margin-bottom:8px}.m{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:20px}.b{display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style></head><body><div class="c"><div class="ic">&#x1F512;</div><div class="t">${title}</div><p class="m">${msg}</p><a class="b" href="/angel-rent">Volver</a></div></body></html>`,
    {status:403,headers:{"Content-Type":"text/html; charset=utf-8",...cors()}}
  );
}

const UA_MAP: Record<string,string> = {
  iphone:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone14:"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  android:"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  android_pixel:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  windows:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  windows11:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  mac:"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};
function getUA(u: ProxyUser) {
  if(u.userAgentKey==="custom"&&u.userAgent)return u.userAgent;
  return UA_MAP[u.userAgentKey||""]||UA_MAP.iphone;
}

// ── Fetch via proxy ────────────────────────────────────────────────────────────
function fetchProxy(url: string, agent: any, method: string, postBody: string|null, postCT: string|null, cookies: string, ua: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol==="https:" ? https : http;
    const headers: Record<string,string> = {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Host": u.hostname,
      "Connection": "keep-alive",
    };
    if(cookies) headers["Cookie"]=cookies;
    if(method==="POST"&&postCT){
      headers["Content-Type"]=postCT;
      if(postBody)headers["Content-Length"]=Buffer.byteLength(postBody).toString();
    }
    const req=(lib as typeof https).request({
      hostname:u.hostname, port:u.port||(u.protocol==="https:"?443:80),
      path:u.pathname+u.search, method, agent, headers, timeout:25000,
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
function resolveUrl(url: string, base: string, cur: string): string {
  try{
    if(/^(data:|blob:|javascript:|#|mailto:)/.test(url))return url;
    if(url.startsWith("//"))return "https:"+url;
    if(/^https?:\/\//.test(url))return url;
    if(url.startsWith("/"))return base+url;
    return cur.substring(0,cur.lastIndexOf("/")+1)+url;
  }catch{return url;}
}

function rewriteHtml(html: string, base: string, pb: string, cur: string): string {
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
  html=html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,(_,o,css,c)=>
    o+css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,(cm:string,ca:string,cu:string,cb:string)=>
      cu.startsWith("data:")?cm:ca+pb+encodeURIComponent(resolveUrl(cu.trim(),base,cur))+cb)+c);

  // Zero-leak proxy script
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
  var d=new FormData(f);
  for(var p of d.entries()){var i=document.createElement("input");i.type="hidden";i.name=p[0];i.value=p[1];n.appendChild(i);}
  document.body.appendChild(n);n.submit();
},true);
try{window.RTCPeerConnection=function(){throw new Error("blocked");};window.webkitRTCPeerConnection=function(){throw new Error("blocked");};}catch(x){}
})();<\/script>`;

  return html.match(/<head[^>]*>/i)?html.replace(/<head[^>]*>/i,"$&"+zl):zl+html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,(_,a,u,b)=>
    u.startsWith("data:")?_:a+pb+encodeURIComponent(resolveUrl(u.trim(),base,base+"/"))+b);
}
