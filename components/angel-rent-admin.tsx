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
  defaultUrl?: string;
  siteEmail?: string; sitePass?: string;
  notes?: string; active?: boolean;
  createdAt?: string; updatedAt?: string;
  robotOn?: boolean; robotPaused?: boolean;
  cookies?: string; cookieTs?: number;
  phoneNumber?: string;
}

const UA_OPTS = [
  { value: "iphone",        label: "📱 iPhone 15 — Safari" },
  { value: "iphone14",      label: "📱 iPhone 14 — Safari" },
  { value: "android",       label: "🤖 Galaxy S24 — Chrome" },
  { value: "android_pixel", label: "🤖 Pixel 8 — Chrome" },
  { value: "windows",       label: "💻 Windows 10 — Chrome" },
  { value: "windows11",     label: "💻 Windows 11 — Edge" },
  { value: "mac",           label: "🍎 MacBook — Safari" },
  { value: "custom",        label: "✏️ Personalizado" },
];

const UA_SHORT: Record<string, string> = {
  iphone: "📱 iPhone 15", iphone14: "📱 iPhone 14",
  android: "🤖 Galaxy S24", android_pixel: "🤖 Pixel 8",
  windows: "💻 Win 10", windows11: "💻 Win 11",
  mac: "🍎 Mac", custom: "✏️ Custom",
};

// ── User-Agent generators ─────────────────────────────────────────────────────
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

function rentalDays(u: User) {
  if (!u.rentalEnd) return 9999;
  return Math.ceil((new Date(u.rentalEnd + "T23:59:59").getTime() - Date.now()) / 86400000);
}

// ─── small reusable input ───────────────────────────────────────────────────
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
    setUseLocalProxy(false);
    setEditing(null); setModal(true);
  };

  const openEdit = (k: string) => {
    const u = users[k];
    setForm({ ...BLANK, ...u, username: k });
    // Detect device type from userAgentKey
    const key = u.userAgentKey || "iphone";
    setDeviceType(key.startsWith("android") || key === "android" ? "android" : key === "windows" || key === "windows11" || key === "mac" || key === "pc" ? "pc" : "iphone");
    // Compute remaining days from rentalEnd
    if (u.rentalEnd) {
      const diff = Math.max(0, new Date(u.rentalEnd + "T23:59:59").getTime() - Date.now());
      setRentDays(String(Math.floor(diff / 86400000)));
      setRentHours(String(Math.floor((diff % 86400000) / 3600000)));
    } else { setRentDays("30"); setRentHours("0"); }
    setUseLocalProxy(!u.proxyHost);
    setEditing(k); setModal(true);
  };

  const save = async () => {
    const key = form.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key) { alert("Username inválido"); return; }

    // Compute rentalEnd from days + hours
    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;
    const rentalEnd = new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString().split("T")[0];
    const rentalStart = new Date().toISOString().split("T")[0];

    // Determine userAgentKey from deviceType
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
      defaultUrl: form.defaultUrl || "https://megapersonals.eu",
      siteEmail: form.siteEmail, sitePass: form.sitePass,
      notes: form.notes, active: form.active,
      phoneNumber: (form as any).phoneNumber || "",
      updatedAt: new Date().toISOString(),
      ...(editing ? {} : { createdAt: new Date().toISOString() }),
    };
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

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // ─── AUTH ────────────────────────────────────────────────────────────────
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

  // ─── STATS ───────────────────────────────────────────────────────────────
  const keys = Object.keys(users).sort();
  const stats = {
    total: keys.length,
    active: keys.filter(k => users[k].active).length,
    expiring: keys.filter(k => { const d = rentalDays(users[k]); return !!users[k].rentalEnd && d > 0 && d <= 3; }).length,
    expired: keys.filter(k => !!users[k].rentalEnd && rentalDays(users[k]) <= 0).length,
  };

  // ─── MAIN ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a0a1a", minHeight: "100vh", color: "#fff", fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>👼</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>Angel Rent · Admin</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {toast && <span style={{ fontSize: 12, color: "#22c55e", padding: "6px 12px", background: "rgba(34,197,94,.1)", borderRadius: 8, border: "1px solid rgba(34,197,94,.2)" }}>{toast}</span>}
            <button onClick={openNew} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Nuevo Usuario</button>
            <button onClick={load} style={{ padding: "8px 12px", background: "rgba(255,255,255,.07)", color: "#aaa", border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>🔄</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { n: stats.total,    l: "Total",       c: "#3b82f6" },
            { n: stats.active,   l: "Activos",     c: "#22c55e" },
            { n: stats.expiring, l: "Por vencer",  c: "#f59e0b" },
            { n: stats.expired,  l: "Expirados",   c: "#ef4444" },
          ].map(({ n, l, c }) => (
            <div key={l} style={{ background: "#111827", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: c }}>{n}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".5px", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, overflow: "auto" }}>
          {busy ? (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.25)", fontSize: 13 }}>Cargando...</div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.25)", fontSize: 13 }}>No hay usuarios. Crea uno arriba.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>{["Usuario", "Nombre", "Proxy / Device", "Renta", "Estado", "🤖 Robot", "📞 Teléfono", "Acciones"].map(h => (
                  <th key={h} style={{ background: "rgba(255,255,255,.03)", textAlign: "left", padding: "10px 14px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".5px", color: "rgba(255,255,255,.3)", whiteSpace: "nowrap" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {keys.map(k => {
                  const u = users[k];
                  const days = rentalDays(u);
                  const rentColor = !u.rentalEnd ? "rgba(255,255,255,.2)" : days <= 0 ? "#ef4444" : days <= 3 ? "#ef4444" : days <= 7 ? "#f59e0b" : "#22c55e";
                  const rentLabel = !u.rentalEnd ? "∞" : days <= 0 ? "Expirado" : days + "d";

                  return (
                    <tr key={k} style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}><strong>{k}</strong></td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "rgba(255,255,255,.7)" }}>{u.name || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 11 }}>
                        {u.proxyHost
                          ? <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{u.proxyHost}:{u.proxyPort}</span>
                          : <span style={{ color: "rgba(255,255,255,.2)", fontSize: 10 }}>Sin proxy</span>}
                        <br />
                        <span style={{ fontSize: 10, color: "#64748b" }}>{UA_SHORT[u.userAgentKey || "iphone"] || "📱"}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>
                        <span style={{ display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: rentColor + "22", color: rentColor, border: `1px solid ${rentColor}44` }}>
                          {rentLabel}
                        </span>
                        {u.rentalEnd && <div style={{ fontSize: 9, color: "rgba(255,255,255,.18)", marginTop: 2 }}>{u.rentalEnd}</div>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: u.active ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: u.active ? "#22c55e" : "#ef4444", border: `1px solid ${u.active ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}` }}>
                          {u.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {u.robotOn === true ? (
                          u.robotPaused ? (
                            <span style={{ display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.2)" }}>⏸ Pausado</span>
                          ) : (
                            <span style={{ display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: "rgba(34,197,94,.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,.2)" }}>⚡ ON</span>
                          )
                        ) : (
                          <span style={{ display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 99, fontWeight: 700, background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.25)", border: "1px solid rgba(255,255,255,.08)" }}>OFF</span>
                        )}
                        {u.cookieTs && <div style={{ fontSize: 8, color: "rgba(255,255,255,.2)", marginTop: 2 }}>Cookie: {Math.round((Date.now() - u.cookieTs) / 3600000)}h atrás</div>}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>
                        {u.phoneNumber ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "monospace", color: "#c084fc", fontWeight: 700, fontSize: 11 }}>{u.phoneNumber}</span>
                            <button onClick={async () => {
                              await fetch(`${FB}/proxyUsers/${k}/phoneNumber.json`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: "null" });
                              showToast("📞 Teléfono borrado"); await load();
                            }} title="Borrar teléfono" style={{ padding: "2px 6px", fontSize: 9, background: "rgba(239,68,68,.2)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)", borderRadius: 4, cursor: "pointer" }}>✕</button>
                          </div>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,.15)", fontSize: 10 }}>Auto-detectando...</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[
                            { ico: "✏️", bg: "#3b82f6", fn: () => openEdit(k) },
                            { ico: u.active ? "⛔" : "✅", bg: u.active ? "#ef4444" : "#22c55e", fn: () => toggle(k) },
                            { ico: "🔗", bg: "rgba(255,255,255,.08)", fn: () => copyLink(k) },
                            { ico: "🗑️", bg: "rgba(255,255,255,.06)", fn: () => del(k) },
                          ].map(({ ico, bg, fn }) => (
                            <button key={ico} onClick={fn} style={{ padding: "5px 9px", fontSize: 11, background: bg, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>{ico}</button>
                          ))}
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

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
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

            {/* Local IP toggle */}
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

            {/* 3 big device buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {([["iphone","📱","iPhone"],["android","🤖","Android"],["pc","💻","PC"]] as const).map(([type, icon, label]) => (
                <button key={type} onClick={() => { setDeviceType(type); set("userAgent", ""); }}
                  style={{ padding: "12px 6px", borderRadius: 10, border: `1px solid ${deviceType === type ? "rgba(168,85,247,.6)" : "rgba(255,255,255,.08)"}`, background: deviceType === type ? "rgba(168,85,247,.15)" : "rgba(255,255,255,.03)", color: deviceType === type ? "#c084fc" : "rgba(255,255,255,.5)", cursor: "pointer", fontWeight: 800, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>{label}
                </button>
              ))}
            </div>

            {/* User Agent field + buttons */}
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

            {/* RENTA */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>📅 Tiempo de Renta</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={F.label}>Días</label>
                <input type="number" min="0" style={F.input} value={rentDays} onChange={e => setRentDays(e.target.value)} placeholder="30" />
              </div>
              <div>
                <label style={F.label}>Horas</label>
                <input type="number" min="0" max="23" style={F.input} value={rentHours} onChange={e => setRentHours(e.target.value)} placeholder="0" />
              </div>
            </div>
            {/* Quick preset buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" as const }}>
              {[["7d","7","0"],["15d","15","0"],["30d","30","0"],["1d","1","0"],["12h","0","12"]].map(([label,d,h]) => (
                <button key={label} onClick={() => { setRentDays(d); setRentHours(h); }}
                  style={{ padding: "5px 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  {label}
                </button>
              ))}
            </div>
            {(parseInt(rentDays)||0) + (parseInt(rentHours)||0) > 0 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 8, fontSize: 11, color: "#4ade80", fontWeight: 700 }}>
                ✅ Renta: {parseInt(rentDays)||0}d {parseInt(rentHours)||0}h → vence {new Date(Date.now() + ((parseInt(rentDays)||0)*86400+(parseInt(rentHours)||0)*3600)*1000).toLocaleDateString("es")}
              </div>
            )}

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

            <label style={F.label}>📞 Teléfono del anuncio</label>
            <input style={F.input} value={(form as any).phoneNumber || ""} onChange={e => set("phoneNumber", e.target.value)} placeholder="+1 754 703 6858" />

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
