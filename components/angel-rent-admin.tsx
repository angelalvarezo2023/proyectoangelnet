"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";
const ADMIN_PASS = "rolex";

interface User {
  name?: string;
  proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string;
  userAgentKey?: string; userAgent?: string;
  rentalStart?: string; rentalEnd?: string;
  rentalEndTimestamp?: number;
  defaultUrl?: string;
  siteEmail?: string; sitePass?: string;
  notes?: string; active?: boolean;
  createdAt?: string; updatedAt?: string;
  robotOn?: boolean; robotPaused?: boolean;
  cookies?: string; cookieTs?: number;
  phoneNumber?: string;
  rentalDays?: number; rentalHours?: number;
  bumpInterval?: number;
  lastBump?: number;
  bumpsToday?: number;
  bumpsTotal?: number;
}

const UA_SHORT: Record<string, string> = {
  iphone: "iPhone", iphone14: "iPhone 14",
  android: "Galaxy", android_pixel: "Pixel",
  windows: "Windows", windows11: "Win 11",
  mac: "Mac", custom: "Custom",
};

const UA_IPHONES = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
];
const UA_ANDROID = [
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36",
];
const UA_PC = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function genUA(type: "iphone"|"android"|"pc"): string {
  const list = type === "iphone" ? UA_IPHONES : type === "android" ? UA_ANDROID : UA_PC;
  return list[Math.floor(Math.random() * list.length)];
}

const BLANK = {
  username: "", name: "", proxyHost: "", proxyPort: "",
  proxyUser: "", proxyPass: "", userAgentKey: "iphone", userAgent: "",
  rentalStart: "", rentalEnd: "", defaultUrl: "https://megapersonals.eu",
  siteEmail: "", sitePass: "", notes: "", active: true,
};

function fmtExpiry(u: User): { label: string; sub: string; color: string; isDebt: boolean; isOk: boolean; isWarning: boolean; diffMs: number } {
  if (!u.rentalEnd && !u.rentalEndTimestamp) return { label: "Sin limite", sub: "", color: "#64748b", isDebt: false, isOk: false, isWarning: false, diffMs: Infinity };
  // Priorizar rentalEndTimestamp (mas preciso), si no calcular desde rentalEnd
  const exp = u.rentalEndTimestamp || new Date(u.rentalEnd + "T23:59:59").getTime();
  const diffMs = exp - Date.now();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  const remH = Math.floor((diffMs % 86400000) / 3600000);
  const expDate = new Date(exp);
  const dateFmt = expDate.toLocaleDateString("es", { day: "2-digit", month: "short" });
  
  if (diffMs < 0) {
    const debtMs = Math.abs(diffMs);
    const dd = Math.floor(debtMs / 86400000);
    const dh = Math.floor((debtMs % 86400000) / 3600000);
    const lbl = dd > 0 ? `-${dd}d ${dh}h` : `-${dh}h`;
    return { label: lbl, sub: dateFmt, color: "#f97316", isDebt: true, isOk: false, isWarning: false, diffMs };
  }
  if (diffH < 24) {
    return { label: `${diffH}h`, sub: "hoy", color: "#ef4444", isDebt: false, isOk: false, isWarning: true, diffMs };
  }
  if (diffD <= 3) {
    return { label: `${diffD}d ${remH}h`, sub: dateFmt, color: "#eab308", isDebt: false, isOk: false, isWarning: true, diffMs };
  }
  return { label: `${diffD}d`, sub: dateFmt, color: "#22c55e", isDebt: false, isOk: true, isWarning: false, diffMs };
}

// ============================================
// PANEL DE CLIENTE
// ============================================
function ClientPanel({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [countdown, setCountdown] = useState("--:--");
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const loadUser = useCallback(async () => {
    try {
      const r = await fetch(`${FB}/proxyUsers/${userId}.json`);
      const data = await r.json();
      if (!data) {
        setError("Usuario no encontrado");
      } else if (!data.active) {
        setError("Cuenta inactiva");
      } else {
        setUser(data);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadUser(); }, [loadUser]);

  // Countdown timer
  useEffect(() => {
    if (!user?.robotOn || user?.robotPaused) {
      setCountdown("--:--");
      return;
    }
    
    const interval = user.bumpInterval || 30;
    const lastBump = user.lastBump || Date.now();
    
    const tick = () => {
      const nextBump = lastBump + (interval * 60 * 1000);
      const remaining = nextBump - Date.now();
      
      if (remaining <= 0) {
        setCountdown("00:00");
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      }
    };
    
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [user?.robotOn, user?.robotPaused, user?.bumpInterval, user?.lastBump]);

  const togglePause = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await fetch(`${FB}/proxyUsers/${userId}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotPaused: !user.robotPaused }),
      });
      setUser({ ...user, robotPaused: !user.robotPaused });
      showToast(user.robotPaused ? "Robot reanudado" : "Robot pausado");
    } catch {
      showToast("Error al cambiar estado");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ width: 48, height: 48, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#8b5cf6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Cargando...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", padding: 20 }}>
      <div style={{ textAlign: "center", color: "#fff", maxWidth: 300 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px", color: "#ef4444" }}>!</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{error}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Contacta al administrador</div>
      </div>
    </div>
  );

  if (!user) return null;

  const exp = fmtExpiry(user);
  const robotActive = user.robotOn && !user.robotPaused;
  const rentPercent = exp.diffMs > 0 ? Math.min(100, (exp.diffMs / (30 * 86400000)) * 100) : 0;

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "20px 16px" }}>
      
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#22c55e", color: "#fff", padding: "10px 20px", borderRadius: 99, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(34,197,94,0.4)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 12px", boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}>
          {user.name?.charAt(0).toUpperCase() || userId.charAt(0).toUpperCase()}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Hola, {user.name || userId}</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Panel de control</p>
      </div>

      {/* Countdown Card */}
      <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Proximo Bump</div>
        <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "monospace", color: robotActive ? "#22c55e" : "rgba(255,255,255,0.3)", lineHeight: 1, marginBottom: 12 }}>
          {countdown}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: robotActive ? "#22c55e" : user.robotOn ? "#eab308" : "#64748b", boxShadow: robotActive ? "0 0 12px #22c55e" : "none" }} />
          <span style={{ fontSize: 13, color: robotActive ? "#22c55e" : user.robotOn ? "#eab308" : "rgba(255,255,255,0.4)" }}>
            {robotActive ? "Robot activo" : user.robotOn ? "Pausado" : "Robot inactivo"}
          </span>
        </div>
      </div>

      {/* Control Button */}
      {user.robotOn && (
        <button
          onClick={togglePause}
          disabled={busy}
          style={{
            width: "100%",
            padding: 18,
            marginBottom: 16,
            borderRadius: 16,
            border: "none",
            background: user.robotPaused
              ? "linear-gradient(135deg, #22c55e, #16a34a)"
              : "linear-gradient(135deg, #f97316, #ea580c)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
            boxShadow: user.robotPaused
              ? "0 8px 32px rgba(34,197,94,0.3)"
              : "0 8px 32px rgba(249,115,22,0.3)",
          }}
        >
          {busy ? "..." : user.robotPaused ? "Reanudar Robot" : "Pausar Robot"}
        </button>
      )}

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>Bumps Hoy</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa" }}>{user.bumpsToday || 0}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>Total Bumps</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#818cf8" }}>{user.bumpsTotal || 0}</div>
        </div>
      </div>

      {/* Rental Time Card */}
      <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: `1px solid ${exp.isDebt ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Tiempo de Renta</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: exp.color }}>{exp.label}</div>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `${exp.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            {exp.isDebt ? "!" : exp.isWarning ? "!" : ""}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div style={{ height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${rentPercent}%`, background: exp.color, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
        
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {exp.isDebt ? "Renta vencida - Contacta al admin" : exp.sub ? `Vence: ${exp.sub}` : "Sin limite de tiempo"}
        </div>
      </div>

      {/* Config Info */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Configuracion</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Intervalo</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>{user.bumpInterval || 30} min</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Dispositivo</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>{UA_SHORT[user.userAgentKey || "iphone"] || "iPhone"}</span>
          </div>
          {user.lastBump && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Ultimo bump</span>
              <span style={{ color: "#a78bfa", fontWeight: 600 }}>
                {new Date(user.lastBump).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; margin: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ============================================
// PANEL DE ADMIN
// ============================================
function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [users, setUsers] = useState<Record<string, User>>({});
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [toast, setToast] = useState("");
  const [deviceType, setDeviceType] = useState<"iphone"|"android"|"pc">("iphone");
  const [rentDays, setRentDays] = useState("30");
  const [rentHours, setRentHours] = useState("0");
  const [useLocalProxy, setUseLocalProxy] = useState(false);
  const [rentMode, setRentMode] = useState<"set"|"add">("set");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("ar_admin") === "ok") {
      setAuthed(true);
      load();
    }
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`${FB}/proxyUsers.json`);
      setUsers((await r.json()) || {});
    } catch (e: any) { alert("Error: " + e.message); }
    finally { setBusy(false); }
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2500); }

  const doLogin = () => {
    if (pass === ADMIN_PASS) {
      localStorage.setItem("ar_admin", "ok");
      setAuthed(true); load();
    } else alert("Contrasena incorrecta");
  };

  const openNew = () => {
    setForm({ ...BLANK });
    setDeviceType("iphone");
    setRentDays("30"); setRentHours("0");
    setRentMode("set");
    setUseLocalProxy(false);
    setEditing(null); setModal(true);
  };

  const openEdit = (k: string) => {
    const u = users[k] as any;
    setForm({ ...BLANK, ...u, username: k });
    const key = u.userAgentKey || "iphone";
    setDeviceType(
      key.startsWith("android") || key === "android" ? "android"
      : key === "windows" || key === "windows11" || key === "mac" || key === "pc" ? "pc"
      : "iphone"
    );
    setRentDays("0");
    setRentHours("0");
    setRentMode("add");
    setUseLocalProxy(!u.proxyHost);
    setEditing(k); setModal(true);
  };

  const save = async () => {
    const key = form.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key) { alert("Username invalido"); return; }

    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;
    const isNegInput = days < 0 || hours < 0;
    const sign = isNegInput ? -1 : 1;
    const inputMs = sign * ((Math.abs(days) * 86400000) + (Math.abs(hours) * 3600000));

    let rentalEndTimestamp: number;
    if (rentMode === "set") {
      rentalEndTimestamp = Date.now() + inputMs;
    } else {
      const currentTs = (form as any).rentalEndTimestamp || Date.now();
      rentalEndTimestamp = currentTs + inputMs;
    }
    const expDate = new Date(rentalEndTimestamp);
    const rentalEnd = expDate.toISOString().split("T")[0];
    const rentalStart = new Date().toISOString().split("T")[0];

    const uaKey = deviceType === "android" ? "android" : deviceType === "pc" ? "windows" : "iphone";
    const data: User = {
      name: form.name,
      proxyHost: useLocalProxy ? "" : form.proxyHost,
      proxyPort: useLocalProxy ? "" : form.proxyPort,
      proxyUser: useLocalProxy ? "" : form.proxyUser,
      proxyPass: useLocalProxy ? "" : form.proxyPass,
      userAgentKey: uaKey,
      userAgent: form.userAgent || "",
      rentalStart, rentalEnd,
      rentalEndTimestamp,
      defaultUrl: form.defaultUrl || "https://megapersonals.eu",
      siteEmail: form.siteEmail, sitePass: form.sitePass,
      notes: form.notes, active: form.active,
      phoneNumber: (form as any).phoneNumber || "",
      updatedAt: new Date().toISOString(),
      ...(editing ? {} : { createdAt: new Date().toISOString() }),
      rentalDays: days,
      rentalHours: hours,
    } as any;

    await fetch(`${FB}/proxyUsers/${key}.json`, {
      method: editing ? "PATCH" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setModal(false); showToast("Guardado"); await load();
  };

  const toggle = async (k: string) => {
    await fetch(`${FB}/proxyUsers/${k}.json`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !users[k].active }),
    });
    showToast(users[k].active ? "Desactivado" : "Activado");
    load();
  };

  const del = async (k: string) => {
    if (!confirm(`Eliminar "${k}"?`)) return;
    await fetch(`${FB}/proxyUsers/${k}.json`, { method: "DELETE" });
    showToast("Eliminado");
    load();
  };

  const copyLink = (k: string) => {
    const url = `${window.location.origin}/api/angel-rent?u=${k}&url=${encodeURIComponent(users[k].defaultUrl || "https://megapersonals.eu")}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link copiado")).catch(() => prompt("Copia:", url));
  };

  const copyClientLink = (k: string) => {
    // Genera link del panel cliente usando la misma pagina con parametro
    const url = `${window.location.origin}${window.location.pathname}?cliente=${k}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link cliente copiado")).catch(() => prompt("Link:", url));
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Auth screen
  if (!authed) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", padding: 20 }}>
      <div style={{ maxWidth: 320, width: "100%", background: "rgba(15,23,42,0.8)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px", boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}>A</div>
        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Angel Rent</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 28 }}>Panel de Administracion</p>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doLogin()}
          placeholder="Contrasena"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 15, outline: "none", textAlign: "center", marginBottom: 16 }}
        />
        <button onClick={doLogin} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
          Entrar
        </button>
      </div>
    </div>
  );

  const keys = Object.keys(users).sort();
  const filteredKeys = keys.filter(k => {
    if (!search) return true;
    const u = users[k];
    const s = search.toLowerCase();
    return k.toLowerCase().includes(s) || (u.name?.toLowerCase().includes(s)) || (u.phoneNumber?.includes(s));
  });

  const stats = {
    total: keys.length,
    active: keys.filter(k => users[k].active).length,
    expired: keys.filter(k => fmtExpiry(users[k]).isDebt).length,
  };

  const previewDays = parseInt(rentDays) || 0;
  const previewHours = parseInt(rentHours) || 0;
  const previewIsNeg = previewDays < 0 || previewHours < 0;
  const previewSign = previewIsNeg ? -1 : 1;
  const previewInputMs = previewSign * ((Math.abs(previewDays) * 86400000) + (Math.abs(previewHours) * 3600000));
  const previewFinalTs = rentMode === "set"
    ? Date.now() + previewInputMs
    : ((form as any).rentalEndTimestamp || Date.now()) + previewInputMs;
  const previewMs = previewFinalTs - Date.now();
  const previewExp = new Date(previewFinalTs);

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100dvh", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#22c55e", color: "#fff", padding: "10px 20px", borderRadius: 99, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(34,197,94,0.4)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "rgba(15,15,20,0.95)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800 }}>A</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Angel Rent</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{stats.total} usuarios</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={load} disabled={busy} style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "rgba(255,255,255,0.6)", fontSize: 16, cursor: "pointer" }}>
              {busy ? "..." : "\u21BB"}
            </button>
            <button onClick={openNew} style={{ height: 40, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>+</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { n: stats.total, l: "Total", c: "#6366f1", bg: "rgba(99,102,241,0.1)" },
            { n: stats.active, l: "Activos", c: "#22c55e", bg: "rgba(34,197,94,0.1)" },
            { n: stats.expired, l: "Deuda", c: "#f97316", bg: "rgba(249,115,22,0.1)" },
          ].map(({ n, l, c, bg }) => (
            <div key={l} style={{ background: bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: c, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar usuario..."
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px 12px 42px", color: "#fff", fontSize: 14, outline: "none" }}
          />
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", fontSize: 16 }}>&#128269;</span>
        </div>

        {/* User List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 100 }}>
          {busy ? (
            <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
          ) : filteredKeys.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>
              {search ? "Sin resultados" : "Sin usuarios"}
            </div>
          ) : (
            filteredKeys.map(k => {
              const u = users[k];
              const exp = fmtExpiry(u);
              const isExpanded = expandedUser === k;
              
              return (
                <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${!u.active ? "rgba(255,255,255,0.05)" : exp.isDebt ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)"}`, borderRadius: 16, overflow: "hidden" }}>
                  
                  {/* Main Row */}
                  <div 
                    onClick={() => setExpandedUser(isExpanded ? null : k)}
                    style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12, cursor: "pointer" }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: u.active ? (exp.isDebt ? "rgba(249,115,22,0.15)" : "rgba(99,102,241,0.15)") : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, color: u.active ? (exp.isDebt ? "#f97316" : "#818cf8") : "rgba(255,255,255,0.3)" }}>
                      {u.name?.charAt(0).toUpperCase() || k.charAt(0).toUpperCase()}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: u.active ? "#fff" : "rgba(255,255,255,0.4)" }}>{k}</span>
                        {!u.active && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(255,255,255,0.4)" }}>OFF</span>}
                        {u.robotOn && !u.robotPaused && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(34,197,94,0.15)", borderRadius: 4, color: "#22c55e" }}>BOT</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                        {u.name || "Sin nombre"}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: exp.color }}>{exp.label}</div>
                      {exp.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{exp.sub}</div>}
                    </div>
                    
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>&#9660;</div>
                  </div>
                  
                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", background: "rgba(0,0,0,0.2)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, fontSize: 11 }}>
                        <span style={{ padding: "4px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6, color: "rgba(255,255,255,0.5)" }}>
                          {u.proxyHost ? `${u.proxyHost}:${u.proxyPort}` : "IP Local"}
                        </span>
                        <span style={{ padding: "4px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6, color: "rgba(255,255,255,0.5)" }}>
                          {UA_SHORT[u.userAgentKey || "iphone"] || "iPhone"}
                        </span>
                      </div>
                      
                      {/* Botones 5 columnas */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(k); }} style={{ padding: "10px 4px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, color: "#818cf8", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14 }}>&#9998;</span>
                          <span>Editar</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); toggle(k); }} style={{ padding: "10px 4px", background: u.active ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${u.active ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`, borderRadius: 10, color: u.active ? "#ef4444" : "#22c55e", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14 }}>{u.active ? "\u2298" : "\u2713"}</span>
                          <span>{u.active ? "Desact" : "Activar"}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); copyLink(k); }} style={{ padding: "10px 4px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14 }}>&#128279;</span>
                          <span>Proxy</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); copyClientLink(k); }} style={{ padding: "10px 4px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10, color: "#a78bfa", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14 }}>&#128100;</span>
                          <span>Cliente</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); del(k); }} style={{ padding: "10px 4px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14 }}>\u2715</span>
                          <span>Borrar</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }}>
          <div style={{ background: "#1a1a24", borderRadius: "24px 24px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "90dvh", overflowY: "auto" }}>
            
            <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, margin: "0 auto 16px" }} />
            
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, textAlign: "center" }}>
              {editing ? `Editar: ${editing}` : "Nuevo Usuario"}
            </h3>

            {!editing && (
              <>
                <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Username</label>
                <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 16 }} 
                  value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} placeholder="username" />
              </>
            )}

            <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Nombre</label>
            <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 16 }} 
              value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="Nombre completo" />

            {/* Proxy */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: useLocalProxy ? 0 : 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Proxy</span>
                <button onClick={() => setUseLocalProxy(!useLocalProxy)} style={{ padding: "6px 12px", background: useLocalProxy ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${useLocalProxy ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: useLocalProxy ? "#22c55e" : "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>
                  {useLocalProxy ? "IP Local" : "Externo"}
                </button>
              </div>
              {!useLocalProxy && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                  <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} 
                    value={form.proxyHost || ""} onChange={e => set("proxyHost", e.target.value)} placeholder="IP/Host" />
                  <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} 
                    value={form.proxyPort || ""} onChange={e => set("proxyPort", e.target.value)} placeholder="Puerto" />
                  <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} 
                    value={form.proxyUser || ""} onChange={e => set("proxyUser", e.target.value)} placeholder="Usuario" />
                  <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} 
                    value={form.proxyPass || ""} onChange={e => set("proxyPass", e.target.value)} placeholder="Password" />
                </div>
              )}
            </div>

            {/* Device Type */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {([["iphone","iPhone"],["android","Android"],["pc","PC"]] as const).map(([type, label]) => (
                <button key={type} onClick={() => { setDeviceType(type); set("userAgent", ""); }}
                  style={{ padding: "14px 8px", borderRadius: 12, border: `1px solid ${deviceType === type ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`, background: deviceType === type ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.03)", color: deviceType === type ? "#c4b5fd" : "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  {label}
                </button>
              ))}
            </div>

            <button onClick={() => set("userAgent", genUA(deviceType))}
              style={{ width: "100%", padding: 12, marginBottom: 16, borderRadius: 10, border: "1px solid rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.1)", color: "#c4b5fd", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              Generar User Agent
            </button>

            {/* Rent Time - Simplificado para rentas semanales */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Tiempo de Renta</div>
              
              {/* Botones rapidos de semanas */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                <button onClick={() => { setRentMode("add"); setRentDays("7"); setRentHours("0"); }}
                  style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.15)", color: "#22c55e", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  +1 Sem
                </button>
                <button onClick={() => { setRentMode("add"); setRentDays("14"); setRentHours("0"); }}
                  style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.15)", color: "#22c55e", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  +2 Sem
                </button>
                <button onClick={() => { setRentMode("add"); setRentDays("21"); setRentHours("0"); }}
                  style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.15)", color: "#22c55e", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  +3 Sem
                </button>
                <button onClick={() => { setRentMode("add"); setRentDays("30"); setRentHours("0"); }}
                  style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.15)", color: "#22c55e", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  +1 Mes
                </button>
              </div>

              {/* Modo manual colapsable */}
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Ajuste manual</summary>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <button onClick={() => setRentMode("set")} style={{ padding: "8px", borderRadius: 8, border: `1px solid ${rentMode === "set" ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`, background: rentMode === "set" ? "rgba(99,102,241,0.15)" : "transparent", color: rentMode === "set" ? "#a5b4fc" : "rgba(255,255,255,0.4)", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                      Establecer
                    </button>
                    <button onClick={() => setRentMode("add")} style={{ padding: "8px", borderRadius: 8, border: `1px solid ${rentMode === "add" ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`, background: rentMode === "add" ? "rgba(34,197,94,0.15)" : "transparent", color: rentMode === "add" ? "#86efac" : "rgba(255,255,255,0.4)", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
                      Agregar
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>DIAS</div>
                      <input type="number" style={{ width: "100%", boxSizing: "border-box", textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px", fontSize: 18, fontWeight: 700, color: "#fff", outline: "none" }}
                        value={rentDays} onChange={e => setRentDays(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>HORAS</div>
                      <input type="number" style={{ width: "100%", boxSizing: "border-box", textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px", fontSize: 18, fontWeight: 700, color: "#fff", outline: "none" }}
                        value={rentHours} onChange={e => setRentHours(e.target.value)} />
                    </div>
                  </div>
                </div>
              </details>

              {previewInputMs > 0 && (
                <div style={{ padding: 12, background: previewMs > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 10, fontSize: 12 }}>
                  {previewMs > 0 ? (
                    <>
                      <div style={{ color: "#22c55e", fontWeight: 700 }}>
                        Quedara con {Math.floor(previewMs / 86400000)}d {Math.floor((previewMs % 86400000) / 3600000)}h
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 }}>
                        Vence: {previewExp.toLocaleDateString("es", { day: "2-digit", month: "short" })} {previewExp.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "#ef4444", fontWeight: 700 }}>Sigue en deuda</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none" }} 
                value={form.siteEmail || ""} onChange={e => set("siteEmail", e.target.value)} placeholder="Email sitio" />
              <input style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none" }} 
                value={form.sitePass || ""} onChange={e => set("sitePass", e.target.value)} placeholder="Password sitio" />
            </div>

            <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none", marginBottom: 16 }} 
              value={form.defaultUrl || ""} onChange={e => set("defaultUrl", e.target.value)} placeholder="URL por defecto" />

            <input style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none", marginBottom: 16 }} 
              value={form.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Notas" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              <button onClick={() => set("active", true)} style={{ padding: 12, borderRadius: 10, border: `1px solid ${form.active ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`, background: form.active ? "rgba(34,197,94,0.15)" : "transparent", color: form.active ? "#22c55e" : "rgba(255,255,255,0.4)", cursor: "pointer", fontWeight: 600 }}>
                Activo
              </button>
              <button onClick={() => set("active", false)} style={{ padding: 12, borderRadius: 10, border: `1px solid ${!form.active ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`, background: !form.active ? "rgba(239,68,68,0.15)" : "transparent", color: !form.active ? "#ef4444" : "rgba(255,255,255,0.4)", cursor: "pointer", fontWeight: 600 }}>
                Inactivo
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
              <button onClick={() => setModal(false)} style={{ padding: 14, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
                Cancelar
              </button>
              <button onClick={save} style={{ padding: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL - DETECTA ADMIN O CLIENTE
// ============================================
export default function AngelRentPanel() {
  const searchParams = useSearchParams();
  const clienteId = searchParams.get("cliente");
  
  // Si hay parametro ?cliente=xxx muestra panel de cliente
  if (clienteId) {
    return <ClientPanel userId={clienteId} />;
  }
  
  // Si no, muestra panel de admin
  return <AdminPanel />;
}
