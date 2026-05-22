"use client";

import { useState, useEffect, useCallback } from "react";
import { LicenseAPI, type MegaBotLicense, type LicensePlan, type LicenseStats } from "@/lib/firebase";

function daysRemaining(iso: string) { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" }); }
function copyText(t: string) { navigator.clipboard.writeText(t).catch(() => {}); }

const C = {
  bg: "#0d0407", card: "#160a0d", border: "#3d1a20",
  accent: "#8b1a2a", accent2: "#b91c3a", red: "#dc2626", wine: "#6b0f1a",
  gold: "#f59e0b", green: "#10b981", text: "#f5e6e8", muted: "#9b7280",
};

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 10px", borderRadius:999, fontSize:11, fontWeight:700, color, background:bg, border:`1px solid ${color}33` }}>{label}</span>;
}

function StatCard({ icon, label, value, accent }: { icon:string; label:string; value:number; accent:string }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"18px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:`0 0 0 1px ${accent}22, 0 4px 24px #00000060` }}>
      <div style={{ width:46, height:46, borderRadius:12, background:`${accent}22`, border:`1px solid ${accent}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{icon}</div>
      <div>
        <div style={{ color:C.muted, fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>{label}</div>
        <div style={{ color:C.text, fontSize:26, fontWeight:800, lineHeight:1.2 }}>{value}</div>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose:()=>void; onCreated:()=>void }) {
  const [form, setForm] = useState({ clientName:"", plan:"basico" as LicensePlan, days:30, whatsapp:"", notes:"", customKey:"" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [created, setCreated] = useState<string|null>(null);

  const inp = { width:"100%", padding:"11px 14px", borderRadius:10, background:"#1a080d", border:`1px solid ${C.border}`, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" as const };

  const submit = async () => {
    if (!form.clientName.trim()) { setError("El nombre es obligatorio"); return; }
    setLoading(true); setError("");
    const res = await LicenseAPI.createLicense(form);
    setLoading(false);
    if (res.success && res.key) { setCreated(res.key); onCreated(); }
    else setError(res.error || "Error desconocido");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, width:"100%", maxWidth:440, boxShadow:`0 0 60px ${C.wine}44` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ color:C.text, fontWeight:700, fontSize:17 }}>➕ Nueva Licencia</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:22, cursor:"pointer" }}>×</button>
        </div>
        {created ? (
          <div style={{ padding:28, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ color:C.text, fontWeight:700, fontSize:18, marginBottom:16 }}>¡Licencia creada!</div>
            <div style={{ background:"#0a1a0f", border:"1px solid #10b98144", borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ color:C.muted, fontSize:11, marginBottom:4 }}>CLAVE DE ACTIVACIÓN</div>
              <div style={{ color:C.green, fontFamily:"monospace", fontSize:20, fontWeight:800 }}>{created}</div>
            </div>
            <button onClick={() => copyText(created)} style={{ width:"100%", padding:"11px", background:C.green, color:"#fff", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer", marginBottom:8 }}>📋 Copiar clave</button>
            <button onClick={onClose} style={{ width:"100%", padding:"10px", background:"transparent", color:C.muted, border:`1px solid ${C.border}`, borderRadius:10, cursor:"pointer" }}>Cerrar</button>
          </div>
        ) : (
          <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>NOMBRE DEL CLIENTE *</label>
              <input value={form.clientName} onChange={e => setForm(f=>({...f,clientName:e.target.value}))} placeholder="Ej: Andy García" style={inp} />
            </div>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>PLAN</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {(["basico","pro"] as LicensePlan[]).map(p => (
                  <button key={p} onClick={() => setForm(f=>({...f,plan:p}))} style={{ padding:"10px", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer", border:`1px solid ${form.plan===p?C.accent2:C.border}`, background:form.plan===p?`${C.accent}44`:"transparent", color:form.plan===p?C.text:C.muted }}>
                    {p==="pro" ? "⭐ PRO — 6 perfiles" : "📦 Básico — 3 perfiles"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>DURACIÓN</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:8 }}>
                {[7,15,30,90].map(d => (
                  <button key={d} onClick={() => setForm(f=>({...f,days:d}))} style={{ padding:"8px 4px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", border:`1px solid ${form.days===d?C.accent2:C.border}`, background:form.days===d?`${C.accent}44`:"transparent", color:form.days===d?C.text:C.muted }}>{d}d</button>
                ))}
              </div>
              <input type="number" value={form.days} min={1} onChange={e => setForm(f=>({...f,days:parseInt(e.target.value)||30}))} style={inp} />
            </div>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>WHATSAPP</label>
              <input value={form.whatsapp} onChange={e => setForm(f=>({...f,whatsapp:e.target.value}))} placeholder="+1829..." style={inp} />
            </div>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>CLAVE PERSONALIZADA (opcional)</label>
              <input value={form.customKey} onChange={e => setForm(f=>({...f,customKey:e.target.value.toUpperCase()}))} placeholder="MEGA-XXXX-XXXX" style={{...inp,fontFamily:"monospace"}} />
            </div>
            <div>
              <label style={{ color:C.muted, fontSize:11, fontWeight:600, display:"block", marginBottom:6 }}>NOTAS</label>
              <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inp,resize:"none"}} />
            </div>
            {error && <div style={{ background:"#2a0a0d", border:`1px solid ${C.red}44`, borderRadius:10, padding:"10px 14px", color:"#f87171", fontSize:13 }}>⚠️ {error}</div>}
            <button onClick={submit} disabled={loading} style={{ width:"100%", padding:"13px", borderRadius:10, fontWeight:700, fontSize:14, background:loading?C.wine:`linear-gradient(135deg,${C.accent2},${C.wine})`, color:"#fff", border:"none", cursor:loading?"not-allowed":"pointer", boxShadow:`0 4px 20px ${C.wine}66` }}>
              {loading ? "⏳ Creando..." : "✅ Crear Licencia"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtendModal({ license, onClose, onDone }: { license:MegaBotLicense; onClose:()=>void; onDone:()=>void }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => { setLoading(true); await LicenseAPI.extendLicense(license.key, days); setLoading(false); setDone(true); onDone(); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:20, width:"100%", maxWidth:360, padding:24, boxShadow:`0 0 60px ${C.wine}44` }}>
        <div style={{ color:C.text, fontWeight:700, fontSize:17, marginBottom:16 }}>📅 Extender — {license.clientName}</div>
        {done ? (
          <div style={{ textAlign:"center", padding:"16px 0" }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
            <div style={{ color:C.green, fontWeight:600, marginBottom:16 }}>+{days} días agregados</div>
            <button onClick={onClose} style={{ width:"100%", padding:10, background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, cursor:"pointer" }}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{ color:C.muted, fontSize:12, marginBottom:14 }}>Expira: <span style={{color:C.text}}>{fmtDate(license.expiresAt)}</span> · <span style={{color:daysRemaining(license.expiresAt)<0?C.red:C.green}}>{daysRemaining(license.expiresAt)<0?`Expirada hace ${Math.abs(daysRemaining(license.expiresAt))}d`:`${daysRemaining(license.expiresAt)}d restantes`}</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:12 }}>
              {[7,15,30,90].map(d => <button key={d} onClick={()=>setDays(d)} style={{ padding:"8px 4px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", border:`1px solid ${days===d?C.accent2:C.border}`, background:days===d?`${C.accent}44`:"transparent", color:days===d?C.text:C.muted }}>+{d}d</button>)}
            </div>
            <input type="number" value={days} min={1} onChange={e=>setDays(parseInt(e.target.value)||30)} style={{ width:"100%", padding:"10px 14px", borderRadius:10, background:"#1a080d", border:`1px solid ${C.border}`, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:14 }} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <button onClick={onClose} style={{ padding:10, background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, cursor:"pointer" }}>Cancelar</button>
              <button onClick={submit} disabled={loading} style={{ padding:10, background:`linear-gradient(135deg,${C.accent2},${C.wine})`, border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer" }}>{loading?"⏳...":"+"+days+" días"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LicenseRow({ license, onExtend, onRefresh }: { license:MegaBotLicense; onExtend:(l:MegaBotLicense)=>void; onRefresh:()=>void }) {
  const [busy, setBusy]       = useState<string|null>(null);
  const [copied, setCopied]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const days         = daysRemaining(license.expiresAt);
  const isExpired    = days <= 0;
  const isSoon       = days > 0 && days <= 3;
  const status       = LicenseAPI.getStatus(license);
  const maxPerfiles  = LicenseAPI.getMaxPerfiles(license.plan, license.maxPerfiles);
  const defaultMax   = license.plan === "pro" ? 6 : 3;
  const perfiles     = license.fingerprints?.length ?? (license.fingerprint ? 1 : 0);
  const pct          = maxPerfiles > 0 ? (perfiles / maxPerfiles) * 100 : 0;
  const barColor     = pct >= 100 ? C.red : pct >= 66 ? C.gold : C.green;

  const act = async (key: string, fn: () => Promise<any>) => { setBusy(key); await fn(); setBusy(null); onRefresh(); };
  const handleCopy = () => { copyText(license.key); setCopied(true); setTimeout(()=>setCopied(false),1500); };

  return (
    <div style={{ background:C.card, border:`1px solid ${isExpired?C.red+"55":isSoon?C.gold+"44":C.border}`, borderRadius:16, overflow:"hidden", boxShadow:status==="active"?`0 0 0 1px ${C.accent}22`:"none" }}>
      
      <div style={{ padding:"16px 20px", display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <button onClick={handleCopy} style={{ fontFamily:"monospace", fontSize:13, color:C.accent2, background:"none", border:"none", cursor:"pointer", padding:0 }}>{license.key}</button>
            <span style={{ color:C.muted, fontSize:11 }}>{copied?"✓ copiado":"📋"}</span>
          </div>
          <div style={{ color:C.text, fontWeight:700, fontSize:15 }}>{license.clientName}</div>
          {license.whatsapp && <a href={`https://wa.me/${license.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ color:C.green, fontSize:12, textDecoration:"none" }}>📞 {license.whatsapp}</a>}
          {license.notes && <div style={{ color:C.muted, fontSize:11, marginTop:2, fontStyle:"italic" }}>📝 {license.notes}</div>}
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          <Badge label={license.plan==="pro"?"⭐ PRO":"📦 Básico"} color={license.plan==="pro"?C.gold:"#60a5fa"} bg={license.plan==="pro"?"#451a0344":"#1e3a5f44"} />
          {status==="active"&&!isSoon && <Badge label="✅ Activa"       color={C.green} bg="#0a2e1e44" />}
          {status==="active"&& isSoon && <Badge label={`⚠️ ${days}d`}  color={C.gold}  bg="#2d1f0044" />}
          {status==="expired"          && <Badge label="❌ Expirada"    color={C.red}   bg="#2a070744" />}
          {status==="suspended"        && <Badge label="⏸ Suspendida"  color={C.muted} bg="#1a0e1044" />}
        </div>

        <div style={{ textAlign:"right", fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>
          <div>Creada: {fmtDate(license.createdAt)}</div>
          <div style={{ color:isExpired?C.red:isSoon?C.gold:C.muted }}>Expira: {fmtDate(license.expiresAt)} ({isExpired?`-${Math.abs(days)}d`:`${days}d`})</div>
          {license.lastValidatedAt && <div>Último uso: {fmtDate(license.lastValidatedAt)}</div>}
        </div>
      </div>

      {/* Perfiles */}
      <div style={{ padding:"0 20px 14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ color:C.muted, fontSize:11, fontWeight:600 }}>PERFILES REGISTRADOS</span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:barColor, fontSize:13, fontWeight:800 }}>{perfiles}/{maxPerfiles}</span>
            <button onClick={()=>act("add",()=>LicenseAPI.agregarPerfiles(license.key,3))} disabled={busy==="add"} style={{ padding:"3px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:`1px solid ${C.accent2}`, background:`${C.accent}33`, color:C.text }}>
              {busy==="add"?"...":"+3 perfiles"}
            </button>
            {maxPerfiles > defaultMax && (
              <button onClick={()=>act("rem",()=>LicenseAPI.reducirPerfiles(license.key,3))} disabled={busy==="rem"} style={{ padding:"3px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:`1px solid ${C.border}`, background:"transparent", color:C.muted }}>
                {busy==="rem"?"...":"-3"}
              </button>
            )}
          </div>
        </div>
        <div style={{ height:6, background:"#1a080d", borderRadius:999, overflow:"hidden" }}>
          <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background:barColor, borderRadius:999, transition:"width 0.4s" }} />
        </div>
        {perfiles > 0 && (
          <div style={{ marginTop:8 }}>
            <button onClick={()=>setExpanded(e=>!e)} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", padding:0 }}>
              {expanded?"▲ Ocultar IDs":`▼ Ver ${perfiles} perfil${perfiles!==1?"es":""} registrado${perfiles!==1?"s":""}`}
            </button>
            {expanded && (
              <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:6 }}>
                {(license.fingerprints?.length?license.fingerprints:license.fingerprint?[license.fingerprint]:[]).map((fp,i) => (
                  <span key={fp} style={{ fontFamily:"monospace", fontSize:10, padding:"3px 8px", background:"#1a080d", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted }}>
                    #{i+1} {fp}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`, display:"flex", flexWrap:"wrap", gap:8 }}>
        <button onClick={()=>onExtend(license)} style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${C.green}44`, background:`${C.green}11`, color:C.green }}>📅 Extender</button>
        <button onClick={()=>act("tog",()=>LicenseAPI.setActive(license.key,!license.active))} disabled={busy==="tog"} style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${license.active?C.gold+"44":C.green+"44"}`, background:license.active?`${C.gold}11`:`${C.green}11`, color:license.active?C.gold:C.green }}>
          {busy==="tog"?"⏳...":license.active?"⏸ Suspender":"▶️ Activar"}
        </button>
        <button onClick={()=>{if(confirm(`¿Resetear todos los perfiles de ${license.clientName}?`))act("rst",()=>LicenseAPI.resetFingerprint(license.key));}} disabled={busy==="rst"} style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"1px solid #60a5fa44", background:"#60a5fa11", color:"#60a5fa" }}>
          {busy==="rst"?"⏳...":"🖥️ Resetear perfiles"}
        </button>
        <button onClick={handleCopy} style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${C.muted}44`, background:`${C.muted}11`, color:C.muted }}>📋 Copiar clave</button>
        <button onClick={()=>{if(confirm(`¿Eliminar licencia de ${license.clientName}?`))act("del",()=>LicenseAPI.deleteLicense(license.key));}} disabled={busy==="del"} style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${C.red}44`, background:`${C.red}11`, color:C.red, marginLeft:"auto" }}>
          {busy==="del"?"⏳...":"🗑️"}
        </button>
      </div>
    </div>
  );
}

export default function MegaBotLicenciasPage() {
  const [licenses, setLicenses] = useState<Record<string,MegaBotLicense>>({});
  const [stats, setStats]       = useState<LicenseStats|null>(null);
  const [expiring, setExpiring] = useState<MegaBotLicense[]>([]);
  const [search, setSearch]     = useState("");
  const [fStatus, setFStatus]   = useState<"all"|"active"|"expired"|"suspended">("all");
  const [fPlan, setFPlan]       = useState<"all"|"pro"|"basico">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [extTarget, setExtTarget]   = useState<MegaBotLicense|null>(null);

  const loadStats = useCallback(async () => {
    const [s,e] = await Promise.all([LicenseAPI.getStats(), LicenseAPI.getExpiringLicenses(3)]);
    setStats(s); setExpiring(e);
  },[]);

  useEffect(() => {
    const unsub = LicenseAPI.listenToAllLicenses(data => { setLicenses(data); loadStats(); });
    return () => unsub();
  },[loadStats]);

  const filtered = Object.values(licenses).filter(l => {
    const q = search.toLowerCase();
    if (q && !l.clientName.toLowerCase().includes(q) && !l.key.toLowerCase().includes(q)) return false;
    if (fPlan !== "all" && l.plan !== fPlan) return false;
    if (fStatus !== "all" && LicenseAPI.getStatus(l) !== fStatus) return false;
    return true;
  }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const fb = (active:boolean, onClick:()=>void, label:string) => (
    <button onClick={onClick} style={{ padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${active?C.accent2:C.border}`, background:active?`${C.accent}44`:"transparent", color:active?C.text:C.muted }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"24px 16px", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:`linear-gradient(135deg,${C.accent2},${C.wine})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, boxShadow:`0 4px 20px ${C.wine}66` }}>🤖</div>
              <h1 style={{ color:C.text, fontSize:24, fontWeight:800, margin:0 }}>MegaBot Licencias</h1>
            </div>
            <p style={{ color:C.muted, fontSize:13, margin:0 }}>Panel de administración — tiempo real</p>
          </div>
          <button onClick={()=>setShowCreate(true)} style={{ padding:"11px 20px", borderRadius:12, fontWeight:700, fontSize:14, background:`linear-gradient(135deg,${C.accent2},${C.wine})`, color:"#fff", border:"none", cursor:"pointer", boxShadow:`0 4px 20px ${C.wine}66` }}>
            ➕ Nueva Licencia
          </button>
        </div>

        {stats && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:20 }}>
            <StatCard icon="🔑" label="Total"     value={stats.total}   accent={C.accent2} />
            <StatCard icon="✅" label="Activas"   value={stats.active}  accent={C.green} />
            <StatCard icon="❌" label="Expiradas" value={stats.expired} accent={C.red} />
            <StatCard icon="⭐" label="PRO"       value={stats.pro}     accent={C.gold} />
          </div>
        )}

        {expiring.length > 0 && (
          <div style={{ background:"#1a0d00", border:`1px solid ${C.gold}44`, borderRadius:14, padding:"14px 18px", marginBottom:20 }}>
            <div style={{ color:C.gold, fontWeight:700, fontSize:13, marginBottom:8 }}>⚠️ {expiring.length} licencia{expiring.length>1?"s":""} expira{expiring.length===1?"":"n"} en 3 días</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {expiring.map(l => <span key={l.key} style={{ fontSize:11, padding:"3px 10px", background:"#2d1f0044", border:`1px solid ${C.gold}33`, borderRadius:6, color:C.gold }}>{l.clientName} — {daysRemaining(l.expiresAt)}d</span>)}
            </div>
          </div>
        )}

        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:20 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nombre o clave..."
            style={{ width:"100%", padding:"10px 14px", borderRadius:10, background:"#1a080d", border:`1px solid ${C.border}`, color:C.text, fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:12 }} />
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {fb(fStatus==="all",    ()=>setFStatus("all"),       "Todas")}
            {fb(fStatus==="active", ()=>setFStatus("active"),    "✅ Activas")}
            {fb(fStatus==="expired",()=>setFStatus("expired"),   "❌ Expiradas")}
            {fb(fStatus==="suspended",()=>setFStatus("suspended"),"⏸ Suspendidas")}
            <div style={{ width:1, background:C.border, margin:"0 4px" }} />
            {fb(fPlan==="all",    ()=>setFPlan("all"),    "Todos")}
            {fb(fPlan==="pro",    ()=>setFPlan("pro"),    "⭐ PRO")}
            {fb(fPlan==="basico", ()=>setFPlan("basico"), "📦 Básico")}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:C.muted }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔑</div>
              <div style={{ fontSize:14 }}>{Object.keys(licenses).length===0?"No hay licencias aún. Crea la primera.":"No hay resultados."}</div>
            </div>
          ) : (
            <>
              <div style={{ color:C.muted, fontSize:12, paddingLeft:4 }}>{filtered.length} licencia{filtered.length!==1?"s":""}</div>
              {filtered.map(l => <LicenseRow key={l.key} license={l} onExtend={setExtTarget} onRefresh={loadStats} />)}
            </>
          )}
        </div>
      </div>

      {showCreate && <CreateModal onClose={()=>setShowCreate(false)} onCreated={loadStats} />}
      {extTarget   && <ExtendModal license={extTarget} onClose={()=>setExtTarget(null)} onDone={()=>{loadStats();setExtTarget(null);}} />}
    </div>
  );
}
