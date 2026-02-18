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
  rentalEnd?: string; rentalStart?: string; defaultUrl?: string;
  siteEmail?: string; sitePass?: string; notes?: string; active?: boolean;
}
interface FetchResult { status: number; headers: Record<string,string>; body: Buffer; setCookies: string[]; }

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
export async function OPTIONS() { return new Response("", { status: 200, headers: cors() }); }

async function handle(req: NextRequest, method: string): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const targetUrl = sp.get("url"), username = sp.get("u");
  if (!targetUrl) return jres(400, { error: "Falta ?url=" });
  if (!username)  return jres(400, { error: "Falta ?u=usuario" });
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
    const ua = getUA(user);
    const resp = await fetchProxy(decoded, agent, method, postBody, postCT, cookies, ua);
    const ct = resp.headers["content-type"] || "";
    const rh = new Headers(cors());
    resp.setCookies.forEach(c => rh.append("Set-Cookie",
      c.replace(/Domain=[^;]+;?\s*/gi, "").replace(/Secure;?\s*/gi, "").replace(/SameSite=\w+;?\s*/gi, "SameSite=Lax; ")
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

// ── Toolbar injection ─────────────────────────────────────────────────────────
function injectToolbar(html: string, curUrl: string, username: string, user: ProxyUser): string {
  const pb = `/api/angel-rent?u=${enc(username)}&url=`;

  // All values as simple JS-safe strings (no template literals in injected JS)
  const jsPb       = JSON.stringify(pb);
  const jsCur      = JSON.stringify(curUrl);
  const jsUser     = JSON.stringify(username);
  const jsName     = JSON.stringify(user.name || username);
  const jsEndTs    = user.rentalEnd ? String(new Date(user.rentalEnd + "T23:59:59").getTime()) : "0";
  const jsEndStr   = JSON.stringify(user.rentalEnd || "");
  const jsB64E     = JSON.stringify(Buffer.from(user.siteEmail || "").toString("base64"));
  const jsB64P     = JSON.stringify(Buffer.from(user.sitePass  || "").toString("base64"));
  const jsPlist    = JSON.stringify(`/api/angel-rent?u=${enc(username)}&url=${encodeURIComponent("https://megapersonals.eu/users/posts/list")}`);

  // Use a unique prefix to avoid conflicts
  const ID = "__arv4";

  const css = `<style id="${ID}css">
#${ID}wrap{position:fixed!important;top:0!important;left:0!important;right:0!important;z-index:2147483647!important;pointer-events:none!important;font-family:-apple-system,BlinkMacSystemFont,sans-serif!important}
#${ID}bar{pointer-events:all!important;display:flex!important;align-items:center!important;gap:8px!important;background:rgba(10,4,22,.95)!important;border-bottom:1px solid rgba(168,85,247,.3)!important;padding:6px 12px!important;color:#fff!important;font-size:12px!important;height:36px!important;box-sizing:border-box!important}
.${ID}seg{display:flex!important;align-items:center!important;gap:5px!important;padding:3px 10px!important;background:rgba(255,255,255,.05)!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:20px!important}
.${ID}lbl{font-size:9px!important;color:rgba(168,85,247,.7)!important;text-transform:uppercase!important;letter-spacing:.8px!important;font-weight:600!important}
.${ID}val{font-size:12px!important;font-weight:800!important;font-variant-numeric:tabular-nums!important;color:#fff!important;min-width:30px!important}
.${ID}green{color:#22c55e!important} .${ID}yellow{color:#f59e0b!important} .${ID}red{color:#ef4444!important} .${ID}purple{color:#a855f7!important}
#${ID}dot{width:8px!important;height:8px!important;border-radius:50%!important;background:#6b7280!important;flex-shrink:0!important}
#${ID}dot.on{background:#22c55e!important;box-shadow:0 0 6px #22c55e!important}
#${ID}dot.wait{background:#f59e0b!important;animation:${ID}blink 1s infinite!important}
@keyframes ${ID}blink{0%,100%{opacity:1}50%{opacity:.1}}
#${ID}pbarwrap{width:80px!important;height:4px!important;background:rgba(255,255,255,.1)!important;border-radius:99px!important;overflow:hidden!important}
#${ID}pbar{height:100%!important;background:linear-gradient(90deg,#a855f7,#ec4899)!important;border-radius:99px!important;width:0%!important;transition:width .8s linear!important}
.${ID}spacer{flex:1!important}
.${ID}btn{pointer-events:all!important;padding:4px 12px!important;border:none!important;border-radius:16px!important;cursor:pointer!important;font-size:11px!important;font-weight:700!important;transition:.15s!important;font-family:-apple-system,sans-serif!important}
#${ID}powerbtn{background:rgba(168,85,247,.15)!important;color:#a855f7!important;border:1px solid rgba(168,85,247,.3)!important}
#${ID}powerbtn.active{background:linear-gradient(135deg,#a855f7,#ec4899)!important;color:#fff!important;border-color:transparent!important}
#${ID}infobtn{background:rgba(255,255,255,.07)!important;color:rgba(255,255,255,.6)!important;border:1px solid rgba(255,255,255,.1)!important}
#${ID}panel{
  pointer-events:all!important;
  position:fixed!important;top:40px!important;left:50%!important;transform:translateX(-50%)!important;
  width:300px!important;background:rgba(10,4,22,.98)!important;
  border:1px solid rgba(168,85,247,.25)!important;border-radius:14px!important;
  display:none;overflow:hidden!important;
  box-shadow:0 20px 60px rgba(0,0,0,.8)!important;
  z-index:2147483646!important;color:#fff!important;
  font-family:-apple-system,sans-serif!important;font-size:12px!important;
}
#${ID}panel.show{display:block!important}
.${ID}phead{padding:12px 14px 8px!important;background:linear-gradient(135deg,rgba(168,85,247,.12),rgba(236,72,153,.06))!important;border-bottom:1px solid rgba(255,255,255,.06)!important}
.${ID}phead .t{font-size:13px!important;font-weight:800!important;color:#fff!important}
.${ID}phead .s{font-size:10px!important;color:rgba(255,255,255,.3)!important;margin-top:2px!important}
.${ID}prow{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:8px 14px!important;border-bottom:1px solid rgba(255,255,255,.04)!important}
.${ID}pk{font-size:10px!important;color:rgba(255,255,255,.3)!important}
.${ID}pv{font-size:12px!important;font-weight:700!important;color:#fff!important}
.${ID}boxes{display:flex!important;justify-content:center!important;gap:8px!important;padding:10px 14px!important;border-bottom:1px solid rgba(255,255,255,.04)!important}
.${ID}box{text-align:center!important;background:rgba(168,85,247,.06)!important;border:1px solid rgba(168,85,247,.1)!important;border-radius:10px!important;padding:8px 12px!important;min-width:58px!important}
.${ID}box .n{font-size:22px!important;font-weight:900!important;color:#a855f7!important;font-variant-numeric:tabular-nums!important}
.${ID}box .u{font-size:8px!important;color:rgba(255,255,255,.25)!important;text-transform:uppercase!important;letter-spacing:.5px!important;margin-top:2px!important}
.${ID}log{max-height:70px!important;overflow-y:auto!important;padding:8px 14px!important;background:rgba(0,0,0,.2)!important}
.${ID}logentry{font-size:9px!important;padding:1px 0!important;color:rgba(255,255,255,.25)!important}
.${ID}logok{color:#22c55e!important} .${ID}loger{color:#f472b6!important} .${ID}login{color:#a855f7!important}
</style>`;

  const html2 = `
<div id="${ID}wrap">
  <div id="${ID}bar">
    <span style="font-size:18px;cursor:pointer" onclick="${ID}togglePanel()" title="Angel Rent">&#x1F47C;</span>
    <div class="${ID}seg">
      <div id="${ID}dot"></div>
      <span class="${ID}lbl">Bump</span>
      <span class="${ID}val" id="${ID}cd">--:--</span>
    </div>
    <div id="${ID}pbarwrap"><div id="${ID}pbar"></div></div>
    <div style="width:1px;height:20px;background:rgba(255,255,255,.08)"></div>
    <div class="${ID}seg">
      <span class="${ID}lbl">Renta</span>
      <span class="${ID}val ${ID}green" id="${ID}rent">...</span>
    </div>
    <div style="width:1px;height:20px;background:rgba(255,255,255,.08)"></div>
    <span id="${ID}stlbl" style="font-size:10px;color:rgba(255,255,255,.3)">Auto-bump OFF</span>
    <span class="${ID}spacer"></span>
    <button class="${ID}btn" id="${ID}powerbtn" onclick="${ID}toggleBump()">&#x23FB; Auto-bump</button>
    <button class="${ID}btn" id="${ID}infobtn" onclick="${ID}togglePanel()">&#9432; Info</button>
  </div>
  <div id="${ID}panel">
    <div class="${ID}phead">
      <div class="t">&#x1F47C; Angel Rent</div>
      <div class="s" id="${ID}pname">...</div>
    </div>
    <div class="${ID}prow"><span class="${ID}pk">&#x23F0; Renta</span><span class="${ID}pv" id="${ID}rlbl">...</span></div>
    <div class="${ID}boxes">
      <div class="${ID}box"><div class="n" id="${ID}rd">-</div><div class="u">Dias</div></div>
      <div class="${ID}box"><div class="n" id="${ID}rh">-</div><div class="u">Horas</div></div>
      <div class="${ID}box"><div class="n" id="${ID}rm">-</div><div class="u">Min</div></div>
    </div>
    <div class="${ID}prow"><span class="${ID}pk">&#x1F504; Bumps realizados</span><span class="${ID}pv ${ID}purple" id="${ID}bcnt">0</span></div>
    <div class="${ID}prow"><span class="${ID}pk">&#x23F1; Proximo bump</span><span class="${ID}pv" id="${ID}bnxt">--:--</span></div>
    <div class="${ID}prow" style="border:none;padding-bottom:10px">
      <span class="${ID}pk">Estado actual</span>
      <button class="${ID}btn" id="${ID}pbtn" onclick="${ID}toggleBump()" style="font-size:10px;padding:3px 10px;background:rgba(168,85,247,.15);color:#a855f7;border:1px solid rgba(168,85,247,.3)">Toggle</button>
    </div>
    <div class="${ID}log" id="${ID}log"></div>
    <div style="padding:8px 14px;text-align:right">
      <button class="${ID}btn" onclick="${ID}togglePanel()" style="background:rgba(255,255,255,.07);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.1);font-size:10px">Cerrar</button>
    </div>
  </div>
</div>`;

  // NOTE: All JS values are injected using JSON.stringify above — fully escaped, no template literal issues
  const script = `<script>
(function(){
var PB=${jsPb};
var CUR=${jsCur};
var UNAME=${jsUser};
var DNAME=${jsName};
var ENDTS=${jsEndTs};
var ENDSTR=${jsEndStr};
var B64E=${jsB64E};
var B64P=${jsB64P};
var PLIST=${jsPlist};
var SK="__arst_"+UNAME;
var PO=false;
var TICK=null;
var ID="${ID}";

// --- STATE (sessionStorage) ---
function gst(){try{return JSON.parse(sessionStorage.getItem(SK))||{};}catch(e){return{};}}
function sst(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}
function getOn(){return !!gst().on;}
function getCnt(){return gst().cnt||0;}
function getNextAt(){return gst().nextAt||0;}
function getTotal(){return gst().total||0;}
function getLogs(){return gst().logs||[];}

// --- LOG ---
function addLog(type,msg){
  var s=gst();
  if(!s.logs)s.logs=[];
  var tm=new Date().toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  s.logs.unshift({t:type,m:"["+tm+"] "+msg});
  if(s.logs.length>20)s.logs=s.logs.slice(0,20);
  sst(s);
  renderLog();
}
function renderLog(){
  var el=document.getElementById(ID+"log");
  if(!el)return;
  var logs=getLogs();
  el.innerHTML=logs.map(function(l){
    return "<div class='"+ID+"logentry "+ID+"log"+l.t+"'>"+l.m+"</div>";
  }).join("");
}

// --- RENTAL ---
function getRentLeft(){
  if(!ENDTS)return null;
  return Math.max(0,ENDTS-Date.now());
}
function pad2(n){return String(n).padStart(2,"0");}

// --- UI UPDATE ---
function updateUI(){
  var on=getOn(),cnt=getCnt(),nextAt=getNextAt(),total=getTotal();
  var left=on?Math.max(0,Math.floor((nextAt-Date.now())/1000)):0;
  var bm=Math.floor(left/60),bs=left%60;
  var bstr=on?(pad2(bm)+":"+pad2(bs)):"--:--";

  var dot=document.getElementById(ID+"dot");
  var cd=document.getElementById(ID+"cd");
  var pbar=document.getElementById(ID+"pbar");
  var stlbl=document.getElementById(ID+"stlbl");
  var powerbtn=document.getElementById(ID+"powerbtn");
  var bcnt=document.getElementById(ID+"bcnt");
  var bnxt=document.getElementById(ID+"bnxt");
  var pbtn=document.getElementById(ID+"pbtn");

  if(dot)dot.className=on?"on":"";
  if(cd)cd.textContent=bstr;
  if(stlbl)stlbl.textContent=on?"Auto-bump ON":"Auto-bump OFF";
  if(powerbtn){if(on)powerbtn.classList.add("active");else powerbtn.classList.remove("active");}
  if(bcnt)bcnt.textContent=String(cnt);
  if(bnxt)bnxt.textContent=bstr;
  if(pbar&&total>0){pbar.style.width=(on?Math.max(0,Math.min(100,left/total*100)):0)+"%";}

  // Rental
  var rl=getRentLeft();
  var rentEl=document.getElementById(ID+"rent");
  var rlbl=document.getElementById(ID+"rlbl");
  var rdEl=document.getElementById(ID+"rd");
  var rhEl=document.getElementById(ID+"rh");
  var rmEl=document.getElementById(ID+"rm");

  if(rl===null){
    if(rentEl){rentEl.textContent="Ilimit";rentEl.className=ID+"val "+ID+"green";}
    if(rlbl){rlbl.textContent="Plan ilimitado";rlbl.className=ID+"pv "+ID+"green";}
    if(rdEl)rdEl.textContent="inf";
    if(rhEl)rhEl.textContent="--";
    if(rmEl)rmEl.textContent="--";
  }else if(rl<=0){
    if(rentEl){rentEl.textContent="EXP";rentEl.className=ID+"val "+ID+"red";}
    if(rlbl){rlbl.textContent="Expirado!";rlbl.className=ID+"pv "+ID+"red";}
    if(rdEl)rdEl.textContent="0";
    if(rhEl)rhEl.textContent="0";
    if(rmEl)rmEl.textContent="0";
  }else{
    var rds=Math.floor(rl/86400000);
    var rhs=Math.floor((rl%86400000)/3600000);
    var rms=Math.floor((rl%3600000)/60000);
    var col=rds<=1?ID+"red":rds<=3?ID+"yellow":ID+"green";
    if(rentEl){rentEl.textContent=rds+"d";rentEl.className=ID+"val "+col;}
    if(rlbl){rlbl.textContent=rds+"d "+rhs+"h "+rms+"m";rlbl.className=ID+"pv "+col;}
    if(rdEl)rdEl.textContent=String(rds);
    if(rhEl)rhEl.textContent=String(rhs);
    if(rmEl)rmEl.textContent=String(rms);
  }

  // Name
  var pname=document.getElementById(ID+"pname");
  if(pname)pname.textContent=DNAME+" \u00b7 "+UNAME;
}

// --- SCHEDULE ---
function schedNext(){
  var secs=900+Math.floor(Math.random()*181);
  var s=gst();s.total=secs;s.nextAt=Date.now()+secs*1000;sst(s);
  addLog("in","Proximo bump en "+Math.floor(secs/60)+"m "+secs%60+"s");
}

function goList(ms){setTimeout(function(){window.location.href=PLIST;},ms||1500);}

// --- BUMP ---
function rnd(n){return Math.floor(Math.random()*n);}
function pause(ms){return new Promise(function(r){setTimeout(r,ms);});}

async function doBump(){
  var s=gst();if(!s.on)return;
  var dot=document.getElementById(ID+"dot");if(dot)dot.className="wait";
  addLog("in","Republicando...");
  schedNext();

  // Method 1: #managePublishAd
  var btn=document.getElementById("managePublishAd");
  if(btn){
    try{
      btn.scrollIntoView({behavior:"smooth",block:"center"});
      await pause(300+rnd(500));
      btn.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
      await pause(100+rnd(200));
      btn.click();
      s=gst();s.cnt++;sst(s);
      addLog("ok","Bump #"+s.cnt+" (boton)");
    }catch(e){}
    updateUI();return;
  }

  // Method 2: bump/repost links
  var links=Array.from(document.querySelectorAll("a[href]"));
  for(var i=0;i<links.length;i++){
    var h=links[i].getAttribute("href")||"",realH=h;
    try{if(h.includes("/api/angel-rent")){var mm=h.match(/[?&]url=([^&]+)/);if(mm)realH=decodeURIComponent(mm[1]);}}catch(x){}
    if(/(\/)(bump|repost|renew|republish)(\/\d+)/.test(realH)){
      try{
        links[i].scrollIntoView({behavior:"smooth",block:"center"});
        await pause(300+rnd(400));
        links[i].click();
        s=gst();s.cnt++;sst(s);
        addLog("ok","Bump #"+s.cnt+" (link)");
      }catch(e){}
      updateUI();return;
    }
  }

  // Method 3: fetch by post ID
  var ids=[];
  Array.from(document.querySelectorAll("a[href]")).forEach(function(a){
    var h2=a.getAttribute("href")||"",rh2=h2;
    try{if(h2.includes("/api/angel-rent")){var mm2=h2.match(/[?&]url=([^&]+)/);if(mm2)rh2=decodeURIComponent(mm2[1]);}}catch(x){}
    var m1=rh2.match(/\/(bump|repost|renew|edit|detail|view)\/(\d{5,})/);
    if(m1&&m1[2]&&ids.indexOf(m1[2])===-1)ids.push(m1[2]);
    var m2=rh2.match(/users\/posts\/[a-z]+\/(\d{5,})/);
    if(m2&&m2[1]&&ids.indexOf(m2[1])===-1)ids.push(m2[1]);
  });
  document.querySelectorAll("[data-id],[data-post-id]").forEach(function(el){
    var id2=el.getAttribute("data-id")||el.getAttribute("data-post-id")||"";
    if(/^\d{5,}$/.test(id2)&&ids.indexOf(id2)===-1)ids.push(id2);
  });

  if(ids.length){
    for(var j=0;j<ids.length;j++){
      try{
        var r=await fetch(PB+encodeURIComponent("https://megapersonals.eu/users/posts/bump/"+ids[j]),{credentials:"include",redirect:"follow"});
        if(r.ok){
          var txt=await r.text();
          if(txt.includes("blocked")||txt.includes("Attention")){addLog("er","Bloqueado #"+ids[j]);}
          else{s=gst();s.cnt++;sst(s);addLog("ok","Bump #"+s.cnt+" ok");}
        }else{addLog("er","HTTP "+r.status);}
      }catch(e2){addLog("er",String(e2.message||e2));}
      if(j<ids.length-1)await pause(1500+rnd(2000));
    }
  }else{
    addLog("er","No se encontraron posts");
    var sc=gst();if(sc.on&&CUR.indexOf("/users/posts/list")===-1)goList(3000);
  }
  updateUI();
}

// --- TICK ---
function startTick(){
  if(TICK)return;
  TICK=setInterval(function(){
    var s=gst();if(!s.on)return;
    updateUI();
    if(Date.now()>=s.nextAt&&s.nextAt>0)doBump();
  },1000);
}

// --- POWER ---
window[ID+"toggleBump"]=function(){
  var s=gst();
  if(s.on){
    s.on=false;s.nextAt=0;sst(s);
    if(TICK){clearInterval(TICK);TICK=null;}
    addLog("in","Auto-bump desactivado");
  }else{
    s.on=true;s.cnt=0;sst(s);
    addLog("ok","Auto-bump activado");
    schedNext();
    startTick();
    doBump();
  }
  updateUI();
};

// --- PANEL TOGGLE ---
window[ID+"togglePanel"]=function(){
  PO=!PO;
  var p=document.getElementById(ID+"panel");
  if(p){if(PO)p.classList.add("show");else p.classList.remove("show");}
};

// --- AUTO-CLICK OK ---
function autoClickOK(){
  var done=false;
  var chk=setInterval(function(){
    if(done)return;
    var btns=document.querySelectorAll("button,a,input[type=button],input[type=submit]");
    for(var i=0;i<btns.length;i++){
      var t=(btns[i].innerText||btns[i].value||"").trim().toLowerCase();
      if(t==="ok"||t==="okay"||t==="done"||t==="continue"||t==="continuar"){
        done=true;clearInterval(chk);
        setTimeout(function(){try{btns[i].click();}catch(e){}goList(2000);},500);
        return;
      }
    }
  },400);
  setTimeout(function(){if(!done){clearInterval(chk);goList(500);}},8000);
}

// --- PAGE HANDLER ---
function handlePage(){
  var u=CUR;
  if(u.indexOf("success_publish")!==-1||u.indexOf("success_bump")!==-1||u.indexOf("success_repost")!==-1){
    addLog("ok","Publicado exitosamente");autoClickOK();return;
  }
  if(/\/users\/posts\/(bump|repost|renew)\/\d+/.test(u)){
    setTimeout(function(){autoClickOK();goList(2000);},2000);return;
  }
  if(u.indexOf("/error")!==-1||u.indexOf("/404")!==-1){
    var s=gst();if(s.on)goList(3000);return;
  }
  if(u.indexOf("/users/posts")!==-1){startTick();return;}
  if(u.indexOf("/login")!==-1||u.indexOf("/users/login")!==-1||u.indexOf("/sign_in")!==-1){return;}
  if(u.indexOf("/users/posts/edit/")!==-1){return;}
  var s2=gst();
  if(s2.on){
    setTimeout(function(){
      var body=(document.body?document.body.innerText:"").toLowerCase();
      if(body.indexOf("attention required")!==-1||body.indexOf("just a moment")!==-1){addLog("er","Bloqueado 30s");goList(30000);return;}
      if(body.indexOf("captcha")!==-1){addLog("er","Captcha - manual");return;}
      if(document.getElementById("managePublishAd")){startTick();return;}
      addLog("in","Pagina desconocida - volviendo");goList(15000);
    },3000);
  }
}

// --- AUTO-LOGIN ---
function doAutoLogin(){
  if(!B64E)return;
  var email,pass;
  try{email=atob(B64E);pass=atob(B64P);}catch(e){return;}
  if(!email||!pass)return;

  var ef=document.querySelector("input[name='email_address']")||
         document.querySelector("input[name='email']")||
         document.querySelector("input[type='email']")||
         document.querySelector("input[name='username']")||
         document.querySelector("input[name='login']");

  if(!ef){
    var inps=document.querySelectorAll("input[type='text'],input:not([type])");
    for(var i=0;i<inps.length;i++){
      var pl=(inps[i].getAttribute("placeholder")||"").toLowerCase();
      if(pl.indexOf("email")!==-1||pl.indexOf("user")!==-1||pl.indexOf("mail")!==-1){ef=inps[i];break;}
    }
  }
  var pf=document.querySelector("input[type='password']")||
         document.querySelector("input[name='password']")||
         document.querySelector("input[name='pass']");

  if(!ef||!pf)return;

  function setVal(el,val){
    var nv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");
    if(nv&&nv.set){nv.set.call(el,val);}else{el.value=val;}
    ["input","change","blur"].forEach(function(ev){el.dispatchEvent(new Event(ev,{bubbles:true}));});
  }

  setVal(ef,email);
  setVal(pf,pass);

  // Mask email field visually with overlay of bullets
  ef.style.cssText+="color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:#555!important";
  ef.setAttribute("readonly","readonly");

  // Overlay showing bullets
  var bullets="";for(var k=0;k<email.length;k++)bullets+="\u25CF";
  var ov=document.createElement("div");
  ov.textContent=bullets;
  var cs=window.getComputedStyle(ef);
  ov.style.cssText=[
    "position:absolute","top:0","left:0","right:0","bottom:0",
    "display:flex","align-items:center",
    "padding:"+cs.paddingTop+" "+cs.paddingRight+" "+cs.paddingBottom+" "+cs.paddingLeft,
    "font-size:16px","letter-spacing:2px","color:#555",
    "pointer-events:none","user-select:none","z-index:100",
    "background:transparent"
  ].join(";");

  var par=ef.parentNode;
  if(par){
    var pcs=window.getComputedStyle(par);
    if(pcs.position==="static")par.style.position="relative";
    par.appendChild(ov);
  }

  // Unlock on submit
  var form=ef.closest("form")||pf.closest("form");
  if(form){
    function unlock(){
      ef.removeAttribute("readonly");
      ef.style.color="";ef.style.webkitTextFillColor="";ef.style.caretColor="";
      if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);
    }
    form.addEventListener("submit",unlock,true);
    var sub=form.querySelector("button[type='submit'],input[type='submit'],input[type='image']");
    if(!sub)sub=form.querySelector("button");
    if(sub)sub.addEventListener("click",unlock,true);
  }

  addLog("ok","Login auto-llenado");
}

var loginDone=false;
function tryLogin(){
  if(loginDone)return;
  doAutoLogin();
  var ef2=document.querySelector("input[name='email_address'],input[name='email'],input[type='email'],input[name='username']");
  if(ef2&&ef2.value)loginDone=true;
}
setTimeout(tryLogin,500);
setTimeout(tryLogin,1200);
setTimeout(tryLogin,2500);
var lrv=setInterval(function(){tryLogin();if(loginDone)clearInterval(lrv);},800);
setTimeout(function(){clearInterval(lrv);},20000);

// --- INIT ---
// Push page down so bar doesn't cover content
document.body.style.paddingTop="38px";
handlePage();
setInterval(updateUI,1000);
updateUI();
renderLog();
var initS=gst();if(initS.on)startTick();

})();
</script>`;

  const block = css + html2 + script;
  return html.includes("<body") ? html.replace(/(<body[^>]*>)/i, "$1" + block) : block + html;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function enc(s: string) { return encodeURIComponent(s || ""); }
function cors(): Record<string,string> {
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

const UA_MAP: Record<string,string> = {
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

// ── Fetch via proxy ────────────────────────────────────────────────────────────
function fetchProxy(url: string, agent: any, method: string, postBody: string | null, postCT: string | null, cookies: string, ua: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const headers: Record<string,string> = {
      "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5", "Accept-Encoding": "identity",
      "Host": u.hostname, "Connection": "keep-alive",
    };
    if (cookies) headers["Cookie"] = cookies;
    if (method === "POST" && postCT) {
      headers["Content-Type"] = postCT;
      if (postBody) headers["Content-Length"] = Buffer.byteLength(postBody).toString();
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
          .then(res => { res.setCookies = [...sc, ...res.setCookies]; resolve(res); })
          .catch(reject);
      }
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => {
        const h: Record<string,string> = {};
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

// ── HTML/CSS rewrite ───────────────────────────────────────────────────────────
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
  html = html.replace(/(href\s*=\s*["'])([^"'#]+)(["'])/gi, (_, a, u, b) => {
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
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, o, css, c) =>
    o + css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (cm: string, ca: string, cu: string, cb: string) =>
      cu.startsWith("data:") ? cm : ca + pb + encodeURIComponent(resolveUrl(cu.trim(), base, cur)) + cb) + c);

  const zl = `<script>(function(){
var P=${JSON.stringify(pb)},B=${JSON.stringify(base)},C=${JSON.stringify(cur)};
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
var _wo=window.open;window.open=function(u,t,f){if(u&&typeof u==="string"&&u.indexOf("/api/angel-rent")===-1){var p2=px(u);if(p2)u=p2;}return _wo.call(this,u,t,f);};
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

  return html.match(/<head[^>]*>/i) ? html.replace(/<head[^>]*>/i, "$&" + zl) : zl + html;
}

function rewriteCss(css: string, base: string, pb: string): string {
  return css.replace(/(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi, (_, a, u, b) =>
    u.startsWith("data:") ? _ : a + pb + encodeURIComponent(resolveUrl(u.trim(), base, base + "/")) + b);
}
