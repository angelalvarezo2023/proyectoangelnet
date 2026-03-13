"use client";
import { useState, useEffect, useCallback } from "react";
const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";
const ADMIN_PASS = "rolex"; // ← Cambia esto
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
}
const UA_SHORT: Record<string, string> = {
  iphone: "📱 iPhone 15", iphone14: "📱 iPhone 14",
  android: "🤖 Galaxy S24", android_pixel: "🤖 Pixel 8",
  windows: "💻 Win 10", windows11: "💻 Win 11",
  mac: "🍎 Mac", custom: "✏️ Custom",
};
const UA_IPHONES = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.6167.171 Mobile/15E148 Safari/604.1",
];
const UA_ANDROID = [
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
];
const UA_PC = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
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

// ── Días restantes (puede ser negativo = vencido) ────────────────────────────
function rentalDays(u: User) {
  if (!u.rentalEnd) return 9999;
  let exp: number;
  if (u.rentalEndTimestamp) {
    exp = u.rentalEndTimestamp;
  } else {
    // Fallback UTC para evitar diferencias de zona horaria
    const [y, m, d] = u.rentalEnd.split("-").map(Number);
    exp = Date.UTC(y, m - 1, d, 23, 59, 59);
  }
  return Math.floor((exp - Date.now()) / 86400000);
}

// ── Tiempo restante real en días + horas desde rentalEndTimestamp ─────────────
function remainingFromTimestamp(ts: number | undefined, rentalEnd: string | undefined): { days: number; hours: number } {
  let exp = 0;
  if (ts) {
    exp = ts;
  } else if (rentalEnd) {
    const [y, m, d] = rentalEnd.split("-").map(Number);
    exp = Date.UTC(y, m - 1, d, 23, 59, 59);
  }
  if (!exp) return { days: 30, hours: 0 };
  const diffMs = exp - Date.now();
  // Calcular en minutos para mayor precisión
  const totalMins = Math.trunc(diffMs / 60000); // minutos totales (negativo = deuda)
  const totalHoursFloor = Math.trunc(totalMins / 60);
  const days = Math.trunc(totalHoursFloor / 24);
  const hours = Math.abs(totalHoursFloor % 24);
  // Si hay deuda pero days=0, devolver hours negativo para indicar deuda sub-24h
  // Usamos days=-0 no existe, así que si totalMins<0 y days=0, forzamos days negativo como señal
  if (totalMins < 0 && days === 0) {
    return { days: -0.001, hours }; // señal de deuda < 1 día
  }
  return { days, hours };
}

const F = {
  input: {
    width: "100%", boxSizing: "border-box" as const,
    background: "#0f172a", border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 8, padding: "8px 10px", color: "#fff",
    fontSize: 13, outline: "none",
  },
  label: {
    display: "block" as const, fontSize: 10,
    color: "rgba(255,255,255,.35)", textTransform: "uppercase" as const,
    letterSpacing: ".5px", marginBottom: 4, marginTop: 12,
  },
};

export default function AngelRentAdmin() {
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
  const [rentMode, setRentMode] = useState<"set"|"add">("set"); // "set"=establecer, "add"=agregar

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
    } else alert("Contraseña incorrecta");
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

    // ✅ Calcular tiempo restante real con signo (negativo = deuda)
    const expTs = u.rentalEndTimestamp || (() => {
      if (!u.rentalEnd) return 0;
      const [y,m,d] = u.rentalEnd.split("-").map(Number);
      return Date.UTC(y,m-1,d,23,59,59);
    })();
    // En modo "add" siempre empezamos en 0 — el usuario ingresa cuánto tiempo NUEVO agrega
    // La deuda se descuenta automáticamente en save()
    setRentDays("0");
    setRentHours("0");
    setRentMode("add"); // default: agregar tiempo al existente
    setUseLocalProxy(!u.proxyHost);
    setEditing(k); setModal(true);
  };

  // ── Ajuste rápido de días sobre el tiempo actual ──────────────────────────
  const adjustDays = (delta: number) => {
    setRentDays(prev => {
      const currentDays = parseInt(prev) || 0;
      const currentHours = parseInt(rentHours) || 0;
      // Convertir todo a minutos totales con signo correcto
      const dSign = currentDays < 0 ? -1 : currentHours < 0 ? -1 : 1;
      const totalMinsNow = dSign * ((Math.abs(currentDays) * 1440) + (Math.abs(currentHours) * 60));
      const totalMinsNext = totalMinsNow + (delta * 1440);
      const isNeg = totalMinsNext < 0;
      const absMins = Math.abs(totalMinsNext);
      const nextDays = Math.floor(absMins / 1440);
      const nextHours = Math.floor((absMins % 1440) / 60);
      setRentHours(isNeg ? (nextDays > 0 ? String(nextHours) : String(-nextHours)) : String(nextHours));
      return isNeg ? (nextDays > 0 ? String(-nextDays) : "0") : String(nextDays);
    });
  };

  const save = async () => {
    const key = form.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key) { alert("Username inválido"); return; }

    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;
    // Determinar signo: si días<0 O horas<0, estamos en deuda
    const isNegInput = days < 0 || hours < 0;
    const sign = isNegInput ? -1 : 1;
    const inputMs = sign * ((Math.abs(days) * 86400000) + (Math.abs(hours) * 3600000));

    let rentalEndTimestamp: number;
    if (rentMode === "set") {
      // ESTABLECER: el tiempo ingresado es el tiempo total desde ahora
      rentalEndTimestamp = Date.now() + inputMs;
    } else {
      // AGREGAR: sumar sobre el timestamp actual (descontando deuda si existe)
      const currentTs = (form as any).rentalEndTimestamp || Date.now();
      // Si el cliente está vencido, currentTs < now, la suma naturalmente descuenta la deuda
      rentalEndTimestamp = currentTs + inputMs;
      // Si sigue en el pasado (deuda mayor que lo agregado), dejarlo así
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
      rentalEndTimestamp, // ✅ UTC puro, igual en todos los dispositivos
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
    setModal(false); showToast("✅ Guardado"); await load();
  };

  const toggle = async (k: string) => {
    await fetch(`${FB}/proxyUsers/${k}.json`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !users[k].active }),
    });
    load();
  };

  const del = async (k: string) => {
    if (!confirm(`¿Eliminar "${k}"?`)) return;
    await fetch(`${FB}/proxyUsers/${k}.json`, { method: "DELETE" });
    load();
  };

  const copyLink = (k: string) => {
    const url = `${window.location.origin}/api/angel-rent?u=${k}&url=${encodeURIComponent(users[k].defaultUrl || "https://megapersonals.eu")}`;
    navigator.clipboard.writeText(url)
      .then(() => showToast("🔗 Link copiado"))
      .catch(() => prompt("Copia este link:", url));
  };

  const copyClientLink = (k: string) => {
    const url = `${window.location.origin}/cliente?u=${k}`;
    navigator.clipboard.writeText(url)
      .then(() => showToast("👤 Link del cliente copiado"))
      .catch(() => prompt("Link del cliente:", url));
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a1a", padding: 20 }}>
      <div style={{ maxWidth: 340, width: "100%", background: "#111827", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: "#fff", fontSize: 18, marginBottom: 20 }}>Admin · Angel Rent</h2>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doLogin()}
          placeholder="Contraseña"
          style={{ ...F.input, textAlign: "center", marginBottom: 12 }}
        />
        <button onClick={doLogin} style={{ width: "100%", padding: 11, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Entrar
        </button>
      </div>
    </div>
  );

  // ─── STATS ────────────────────────────────────────────────────────────────
  const keys = Object.keys(users).sort();
  const stats = {
    total: keys.length,
    active: keys.filter(k => users[k].active).length,
    expiring: keys.filter(k => { const d = rentalDays(users[k]); return !!users[k].rentalEnd && d >= 0 && d <= 1; }).length,
    expired: keys.filter(k => !!users[k].rentalEnd && rentalDays(users[k]) <= 0).length,
  };

  // Calcular preview de expiración para el modal
  const previewDays = parseInt(rentDays) || 0;
  const previewHours = parseInt(rentHours) || 0;
  const previewIsNeg = previewDays < 0 || previewHours < 0;
  const previewSign = previewIsNeg ? -1 : 1;
  const previewInputMs = previewSign * ((Math.abs(previewDays) * 86400000) + (Math.abs(previewHours) * 3600000));
  // Calcular timestamp final según modo
  const previewFinalTs = rentMode === "set"
    ? Date.now() + previewInputMs
    : ((form as any).rentalEndTimestamp || Date.now()) + previewInputMs;
  const previewMs = previewFinalTs - Date.now(); // positivo = tiempo restante, negativo = deuda
  const previewExp = new Date(previewFinalTs);

  // helpers para formato de tiempo
  function fmtExpiry(u: User): { label: string; sub: string; color: string; bg: string } {
    if (!u.rentalEnd) return { label: "Sin límite", sub: "", color: "rgba(255,255,255,.3)", bg: "rgba(255,255,255,.05)" };
    const exp = u.rentalEndTimestamp || (() => { const [y,m,d] = u.rentalEnd!.split("-").map(Number); return Date.UTC(y,m-1,d,23,59,59); })();
    const diffMs = exp - Date.now();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    const remH = Math.floor((diffMs % 86400000) / 3600000);
    const expDate = new Date(exp);
    const dateFmt = expDate.toLocaleDateString("es", { day: "2-digit", month: "short" });
    const timeFmt = expDate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    if (diffMs < 0) {
      const debtMs = Math.abs(diffMs);
      const dd = Math.floor(debtMs / 86400000);
      const dh = Math.floor((debtMs % 86400000) / 3600000);
      const lbl = dd > 0 ? `Debe ${dd}d ${dh}h` : `Debe ${dh}h`;
      return { label: lbl, sub: `venció ${dateFmt}`, color: "#fb923c", bg: "rgba(251,146,60,.12)" };
    }
    if (diffH < 24) {
      return { label: `${diffH}h ${Math.floor((diffMs%3600000)/60000)}m`, sub: `hoy ${timeFmt}`, color: "#f87171", bg: "rgba(248,113,113,.12)" };
    }
    if (diffD <= 1) {
      return { label: `${diffD}d ${remH}h`, sub: `${dateFmt} ${timeFmt}`, color: "#f87171", bg: "rgba(248,113,113,.12)" };
    }
    if (diffD <= 3) {
      return { label: `${diffD}d ${remH}h`, sub: `${dateFmt} ${timeFmt}`, color: "#fbbf24", bg: "rgba(251,191,36,.12)" };
    }
    return { label: `${diffD}d ${remH}h`, sub: `${dateFmt} ${timeFmt}`, color: "#4ade80", bg: "rgba(74,222,128,.1)" };
  }

  // ─── MAIN ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#080b14", minHeight: "100vh", color: "#fff", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👼</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.3px" }}>Angel Rent</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".5px", textTransform: "uppercase" }}>Panel de control</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {toast && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4ade80", padding: "6px 14px", background: "rgba(74,222,128,.08)", borderRadius: 99, border: "1px solid rgba(74,222,128,.2)" }}>
                <span style={{ fontSize: 14 }}>✓</span> {toast}
              </div>
            )}
            <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "-.1px" }}>
              <span style={{ fontSize: 16 }}>+</span> Nuevo usuario
            </button>
            <button onClick={load} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, fontSize: 14, cursor: "pointer" }}>↻</button>
          </div>
        </div>

        {/* ── Stats cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { n: stats.total, l: "Total usuarios", c: "#818cf8", icon: "◈" },
            { n: stats.active, l: "Activos", c: "#4ade80", icon: "●" },
            { n: stats.expiring, l: "Por vencer hoy", c: "#fbbf24", icon: "◐" },
            { n: stats.expired, l: "Vencidos / deuda", c: "#f87171", icon: "○" },
          ].map(({ n, l, c, icon }) => (
            <div key={l} style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "16px 14px", position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>{l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: c, lineHeight: 1 }}>{n}</span>
                <span style={{ fontSize: 16, color: c, opacity: .4 }}>{icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table ── */}
        <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, overflow: "auto" }}>
          {busy ? (
            <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,.2)", fontSize: 13 }}>Cargando...</div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,.2)", fontSize: 13 }}>Sin usuarios. Crea uno arriba.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  {["Usuario / Nombre", "Proxy · Dispositivo", "Tiempo de renta", "Estado", "Robot", "Teléfono", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".6px", color: "rgba(255,255,255,.22)", fontWeight: 600, whiteSpace: "nowrap", background: "rgba(255,255,255,.02)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k, idx) => {
                  const u = users[k];
                  const { label: rentLabel, sub: rentSub, color: rentColor, bg: rentBg } = fmtExpiry(u);
                  const isEven = idx % 2 === 0;
                  return (
                    <tr key={k} style={{ borderTop: "1px solid rgba(255,255,255,.03)", background: isEven ? "transparent" : "rgba(255,255,255,.01)" }}>

                      {/* Usuario */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-.1px" }}>{k}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 1 }}>{u.name || "—"}</div>
                      </td>

                      {/* Proxy */}
                      <td style={{ padding: "12px 14px" }}>
                        {u.proxyHost
                          ? <div style={{ fontSize: 11, fontFamily: "monospace", color: "#7dd3fc" }}>{u.proxyHost}<span style={{ color: "rgba(255,255,255,.2)" }}>:{u.proxyPort}</span></div>
                          : <div style={{ fontSize: 10, color: "rgba(255,255,255,.15)" }}>IP local</div>}
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)", marginTop: 2 }}>{UA_SHORT[u.userAgentKey || "iphone"] || "—"}</div>
                      </td>

                      {/* Renta */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: rentColor, background: rentBg, padding: "3px 10px", borderRadius: 99, display: "inline-block" }}>
                            {rentLabel}
                          </span>
                          {rentSub && <span style={{ fontSize: 9, color: "rgba(255,255,255,.2)", paddingLeft: 2 }}>{rentSub}</span>}
                        </div>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: u.active ? "rgba(74,222,128,.1)" : "rgba(248,113,113,.1)", color: u.active ? "#4ade80" : "#f87171" }}>
                          {u.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      {/* Robot */}
                      <td style={{ padding: "12px 14px" }}>
                        {u.robotOn === true ? (
                          u.robotPaused
                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "rgba(251,191,36,.1)", color: "#fbbf24" }}>⏸ Pausa</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "rgba(74,222,128,.1)", color: "#4ade80" }}>⚡ ON</span>
                        ) : (
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 99, background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.2)" }}>OFF</span>
                        )}
                        {u.cookieTs && <div style={{ fontSize: 9, color: "rgba(255,255,255,.15)", marginTop: 2 }}>cookie {Math.round((Date.now()-u.cookieTs)/3600000)}h</div>}
                      </td>

                      {/* Teléfono */}
                      <td style={{ padding: "12px 14px" }}>
                        {u.phoneNumber ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c084fc", fontWeight: 700, letterSpacing: ".5px" }}>{u.phoneNumber}</span>
                            <button onClick={async () => {
                              await fetch(`${FB}/proxyUsers/${k}/phoneNumber.json`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: "null" });
                              showToast("Teléfono borrado"); await load();
                            }} style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,.2)", color: "#f87171", border: "none", borderRadius: 4, fontSize: 9, cursor: "pointer", flexShrink: 0 }}>✕</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,.12)" }}>—</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => openEdit(k)} title="Editar" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(99,102,241,.2)", color: "#818cf8", border: "1px solid rgba(99,102,241,.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>✎</button>
                          <button onClick={() => toggle(k)} title={u.active ? "Desactivar" : "Activar"} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: u.active ? "rgba(239,68,68,.15)" : "rgba(74,222,128,.15)", color: u.active ? "#f87171" : "#4ade80", border: `1px solid ${u.active ? "rgba(239,68,68,.25)" : "rgba(74,222,128,.25)"}`, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>{u.active ? "⊘" : "✓"}</button>
                          <button onClick={() => copyLink(k)} title="Copiar link proxy" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.4)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>⎘</button>
                          <button onClick={() => copyClientLink(k)} title="Link panel cliente" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(168,85,247,.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,.25)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>👤</button>
                          <button onClick={() => del(k)} title="Eliminar" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── MODAL ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: 24, maxWidth: 480, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 15, marginBottom: 16, color: "#fff" }}>
              {editing ? `✏️ Editar: ${editing}` : "➕ Nuevo Usuario"}
            </h3>

            {/* Username */}
            <label style={F.label}>Username (login)</label>
            <input style={{ ...F.input, opacity: editing ? .5 : 1 }} value={form.username} disabled={!!editing}
              onChange={e => set("username", e.target.value.toLowerCase())} placeholder="diana" />

            {/* Nombre */}
            <label style={F.label}>Nombre completo</label>
            <input style={F.input} value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="Diana Martinez" />

            {/* PROXY */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>🌐 Configuración de Proxy</div>
            <button onClick={() => setUseLocalProxy(!useLocalProxy)} style={{ width: "100%", padding: "8px 12px", marginBottom: 10, background: useLocalProxy ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.04)", border: `1px solid ${useLocalProxy ? "rgba(34,197,94,.4)" : "rgba(255,255,255,.1)"}`, borderRadius: 8, color: useLocalProxy ? "#4ade80" : "rgba(255,255,255,.5)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <span>{useLocalProxy ? "✅" : "○"}</span> Usar IP Local (sin proxy externo)
            </button>
            {!useLocalProxy && (<>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <div>
                  <label style={F.label}>IP / Host</label>
                  <input style={F.input} value={form.proxyHost || ""} onChange={e => set("proxyHost", e.target.value)} placeholder="192.168.1.1" />
                </div>
                <div>
                  <label style={F.label}>Puerto</label>
                  <input style={F.input} value={form.proxyPort || ""} onChange={e => set("proxyPort", e.target.value)} placeholder="8080" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={F.label}>Usuario proxy</label>
                  <input style={F.input} value={form.proxyUser || ""} onChange={e => set("proxyUser", e.target.value)} placeholder="user" />
                </div>
                <div>
                  <label style={F.label}>Password proxy</label>
                  <input style={F.input} value={form.proxyPass || ""} onChange={e => set("proxyPass", e.target.value)} placeholder="pass" />
                </div>
              </div>
            </>)}

            {/* DEVICE */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>📱 Dispositivo</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {([["iphone","📱","iPhone"],["android","🤖","Android"],["pc","💻","PC"]] as const).map(([type, icon, label]) => (
                <button key={type} onClick={() => { setDeviceType(type); set("userAgent", ""); }}
                  style={{ padding: "12px 6px", borderRadius: 10, border: `1px solid ${deviceType === type ? "rgba(168,85,247,.6)" : "rgba(255,255,255,.08)"}`, background: deviceType === type ? "rgba(168,85,247,.15)" : "rgba(255,255,255,.03)", color: deviceType === type ? "#c084fc" : "rgba(255,255,255,.5)", cursor: "pointer", fontWeight: 800, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={F.label}>User Agent</label>
                <input style={{ ...F.input, fontSize: 10 }} value={form.userAgent || ""} onChange={e => set("userAgent", e.target.value)} placeholder={`User agent de ${deviceType === "iphone" ? "iPhone" : deviceType === "android" ? "Android" : "PC"}...`} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <button onClick={() => set("userAgent", genUA(deviceType))}
                style={{ padding: "8px", borderRadius: 8, border: "1px solid rgba(168,85,247,.4)", background: "rgba(168,85,247,.1)", color: "#c084fc", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                🎲 Generar UA real
              </button>
              <button onClick={() => set("userAgent", "")}
                style={{ padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.4)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                📱 Usar UA del dispositivo
              </button>
            </div>
            {form.userAgent && (
              <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(168,85,247,.08)", border: "1px solid rgba(168,85,247,.2)", borderRadius: 8, fontSize: 9, color: "rgba(168,85,247,.8)", wordBreak: "break-all" as const }}>
                {form.userAgent}
              </div>
            )}

            {/* ── RENTA ── */}
            {/* ═══ SECCIÓN TIEMPO DE RENTA ═══ */}
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 12 }}>📅 Tiempo de Renta</div>

              {/* Selector de modo: Establecer / Agregar */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                <button onClick={() => setRentMode("set")}
                  style={{
                    padding: "12px 8px", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 12,
                    border: rentMode === "set" ? "2px solid #6366f1" : "1px solid rgba(255,255,255,.08)",
                    background: rentMode === "set" ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.03)",
                    color: rentMode === "set" ? "#a5b4fc" : "rgba(255,255,255,.35)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    transition: "all .15s",
                  }}>
                  <span style={{ fontSize: 20 }}>📌</span>
                  <span>Establecer</span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: rentMode === "set" ? "rgba(165,180,252,.7)" : "rgba(255,255,255,.2)", textAlign: "center", lineHeight: 1.4 }}>
                    Reemplaza el tiempo actual por el nuevo valor
                  </span>
                </button>
                <button onClick={() => setRentMode("add")}
                  style={{
                    padding: "12px 8px", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 12,
                    border: rentMode === "add" ? "2px solid #22c55e" : "1px solid rgba(255,255,255,.08)",
                    background: rentMode === "add" ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.03)",
                    color: rentMode === "add" ? "#4ade80" : "rgba(255,255,255,.35)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    transition: "all .15s",
                  }}>
                  <span style={{ fontSize: 20 }}>➕</span>
                  <span>Agregar</span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: rentMode === "add" ? "rgba(74,222,128,.7)" : "rgba(255,255,255,.2)", textAlign: "center", lineHeight: 1.4 }}>
                    Suma al tiempo restante (descuenta deuda)
                  </span>
                </button>
              </div>

              {/* Presets rápidos */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12 }}>
                {[["1d","1","0"],["7d","7","0"],["15d","15","0"],["30d","30","0"],["12h","0","12"]].map(([label,d,h]) => (
                  <button key={label} onClick={() => { setRentDays(d); setRentHours(h); }}
                    style={{
                      padding: "8px 16px", borderRadius: 99, cursor: "pointer", fontSize: 12, fontWeight: 800,
                      border: rentMode === "add" ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(99,102,241,.4)",
                      background: rentMode === "add"
                        ? (rentDays === d && rentHours === h ? "rgba(34,197,94,.25)" : "rgba(34,197,94,.06)")
                        : (rentDays === d && rentHours === h ? "rgba(99,102,241,.25)" : "rgba(99,102,241,.06)"),
                      color: rentMode === "add" ? "#4ade80" : "#a5b4fc",
                      transition: "all .15s",
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Input días + horas moderno */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6 }}>Días</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <button onClick={() => setRentDays(d => String(Math.max(0, (parseInt(d)||0) - 1)))}
                      style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.08)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <input type="number" min="0" style={{ width: 60, textAlign: "center", background: "transparent", border: "none", fontSize: 26, fontWeight: 900, color: "#fff", outline: "none", MozAppearance: "textfield" as any }}
                      value={rentDays} onChange={e => setRentDays(e.target.value)} />
                    <button onClick={() => setRentDays(d => String((parseInt(d)||0) + 1))}
                      style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.08)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>
                <div style={{ width: 1, height: 40, background: "rgba(255,255,255,.08)" }} />
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6 }}>Horas</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <button onClick={() => setRentHours(h => String(Math.max(0, (parseInt(h)||0) - 1)))}
                      style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.08)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <input type="number" min="0" max="23" style={{ width: 60, textAlign: "center", background: "transparent", border: "none", fontSize: 26, fontWeight: 900, color: "#fff", outline: "none", MozAppearance: "textfield" as any }}
                      value={rentHours} onChange={e => setRentHours(e.target.value)} />
                    <button onClick={() => setRentHours(h => String(Math.min(23, (parseInt(h)||0) + 1)))}
                      style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.08)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>
              </div>

              {/* Preview resultado */}
              {previewInputMs > 0 && previewMs > 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 10, fontSize: 11 }}>
                  {(() => {
                    const resultMs = previewMs;
                    const rDays = Math.floor(resultMs / 86400000);
                    const rHours = Math.floor((resultMs % 86400000) / 3600000);
                    const currentTs = (form as any).rentalEndTimestamp;
                    const hadDebt = currentTs && currentTs < Date.now();
                    const debtMs = hadDebt ? Date.now() - currentTs : 0;
                    const debtDays = Math.floor(debtMs / 86400000);
                    const debtHours = Math.floor((debtMs % 86400000) / 3600000);
                    return (
                      <div style={{ color: "#4ade80", fontWeight: 800, marginBottom: 4 }}>
                        ✅ Quedará con {rDays}d {rHours}h
                        {hadDebt && <span style={{ color: "rgba(255,255,255,.4)", fontWeight: 400 }}> (descontando {debtDays > 0 ? `${debtDays}d ${debtHours}h` : `${debtHours}h`} de deuda)</span>}
                      </div>
                    );
                  })()}
                  <div style={{ color: "rgba(255,255,255,.5)", fontSize: 10 }}>
                    Vence el <span style={{ color: "#fff", fontWeight: 700 }}>
                      {previewExp.toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} a las {previewExp.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              )}
              {previewInputMs > 0 && previewMs <= 0 && (() => {
                const debtMs = Math.abs(previewMs);
                const debtDays = Math.floor(debtMs / 86400000);
                const debtHours = Math.floor((debtMs % 86400000) / 3600000);
                const debtMins = Math.floor((debtMs % 3600000) / 60000);
                const debtLabel = debtDays > 0
                  ? `${debtDays}d ${debtHours}h`
                  : debtHours > 0 ? `${debtHours}h ${debtMins}m` : `${debtMins}m`;
                return (
                  <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 10, fontSize: 11 }}>
                    <div style={{ color: "#f87171", fontWeight: 800, marginBottom: 4 }}>
                      ⚠️ Deuda restante: {debtLabel} — el cliente sigue vencido
                    </div>
                    <div style={{ color: "rgba(255,255,255,.35)", fontSize: 10 }}>
                      Agrega más tiempo para saldar la deuda completa
                    </div>
                  </div>
                );
              })()}
              {previewInputMs === 0 && (() => {
                const currentTs = (form as any).rentalEndTimestamp;
                const hasDebt = currentTs && currentTs < Date.now();
                if (hasDebt) {
                  const debtMs0 = Date.now() - currentTs;
                  const dd = Math.floor(debtMs0 / 86400000);
                  const dh = Math.floor((debtMs0 % 86400000) / 3600000);
                  const dm = Math.floor((debtMs0 % 3600000) / 60000);
                  const lbl = dd > 0 ? `${dd}d ${dh}h` : dh > 0 ? `${dh}h ${dm}m` : `${dm}m`;
                  return (
                    <div style={{ padding: "12px 14px", background: "rgba(251,146,60,.07)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 10 }}>
                      <div style={{ color: "#fb923c", fontWeight: 800, fontSize: 12, marginBottom: 3 }}>⏰ Deuda actual: {lbl}</div>
                      <div style={{ color: "rgba(255,255,255,.35)", fontSize: 10 }}>
                        {rentMode === "add" ? "Ingresa cuánto tiempo quieres agregar — la deuda se descontará automáticamente" : "Ingresa el nuevo tiempo total que tendrá el cliente"}
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: "8px 14px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, fontSize: 11, color: "rgba(255,255,255,.25)" }}>
                    Ingresa días u horas para ver el resultado
                  </div>
                );
              })()}
            </div>
            {/* ════════════════════════════════════ */}
                        <label style={F.label}>URL por defecto</label>
            <input style={F.input} value={form.defaultUrl || ""} onChange={e => set("defaultUrl", e.target.value)} placeholder="https://megapersonals.eu" />

            {/* CREDENCIALES */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 4 }}>🔑 Credenciales del sitio (auto-login)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={F.label}>Email / usuario</label>
                <input style={F.input} value={form.siteEmail || ""} onChange={e => set("siteEmail", e.target.value)} placeholder="user@email.com" />
              </div>
              <div>
                <label style={F.label}>Password sitio</label>
                <input style={F.input} value={form.sitePass || ""} onChange={e => set("sitePass", e.target.value)} placeholder="contraseña" />
              </div>
            </div>
            <label style={F.label}>Notas</label>
            <input style={F.input} value={form.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="VIP, deuda, etc." />
            <label style={F.label}>Estado</label>
            <select style={{ ...F.input, marginTop: 0 }} value={form.active ? "true" : "false"} onChange={e => set("active", e.target.value === "true")}>
              <option value="true">✅ Activo</option>
              <option value="false">⛔ Inactivo</option>
            </select>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: 11, background: "rgba(255,255,255,.07)", color: "#aaa", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
              <button onClick={save} style={{ flex: 1, padding: 11, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
