"use client";
import { useState, useEffect, useRef } from "react";

const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";

interface User {
  name?: string;
  rentalEnd?: string;
  rentalEndTimestamp?: number;
  active?: boolean;
  robotOn?: boolean;
  robotPaused?: boolean;
  defaultUrl?: string;
  notes?: string;
  nextBumpAt?: number;   // timestamp del próximo bump, guardado por el robot
  bumpCount?: number;    // total bumps de la sesión, guardado por el robot
}

interface Ticket {
  username: string;
  message: string;
  createdAt: string;
  status: "open" | "closed";
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getUsername(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("u") || "";
}

function fmtCountdown(expTs: number): { label: string; detail: string; pct: number; urgent: boolean; expired: boolean } {
  const diffMs = expTs - Date.now();
  if (diffMs <= 0) {
    const debt = Math.abs(diffMs);
    const dd = Math.floor(debt / 86400000);
    const dh = Math.floor((debt % 86400000) / 3600000);
    const dm = Math.floor((debt % 3600000) / 60000);
    const lbl = dd > 0 ? `Vencida hace ${dd}d ${dh}h` : dh > 0 ? `Vencida hace ${dh}h ${dm}m` : `Vencida hace ${dm}m`;
    return { label: lbl, detail: "", pct: 0, urgent: true, expired: true };
  }
  const d = Math.floor(diffMs / 86400000);
  const h = Math.floor((diffMs % 86400000) / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const expDate = new Date(expTs);
  const detail = expDate.toLocaleDateString("es", { weekday: "long", day: "2-digit", month: "long" })
    + " a las "
    + expDate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  // pct: 100% = 30 días, escala descendente
  const pct = Math.min(100, Math.max(0, (diffMs / (30 * 86400000)) * 100));
  return { label, detail, pct, urgent: d < 1, expired: false };
}

function fmtNextBump(nextAt: number): string {
  if (!nextAt || nextAt <= Date.now()) return "";
  const diffMs = nextAt - Date.now();
  const m = Math.floor(diffMs / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  if (m >= 60) { const h = Math.floor(m / 60); return `en ${h}h ${m % 60}m`; }
  return m > 0 ? `en ${m}m ${s}s` : `en ${s}s`;
}

// sessionStorage no se comparte entre pestañas — leemos estado del robot desde Firebase
// bumpCount viene del sessionStorage solo si estamos en la misma pestaña (no aplica aquí)
// nextAt tampoco está en Firebase, solo en sessionStorage del cliente activo
// Solución: el robot guarda nextAt en Firebase también (via syncState)
function getSessionState(username: string): { bumpCount: number; nextAt: number; on: boolean; paused: boolean } {
  // Esta función ya no se usa directamente — el estado viene de Firebase via load()
  return { bumpCount: 0, nextAt: 0, on: false, paused: false };
}

export default function AngelRentCliente() {
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bumpCount, setBumpCount] = useState(0);
  const [nextBumpAt, setNextBumpAt] = useState(0);
  const [ticketMsg, setTicketMsg] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [togglingRobot, setTogglingRobot] = useState(false);
  const [toast, setToast] = useState("");
  const timerRef = useRef<any>(null);
  const [now, setNow] = useState(Date.now());

  // Tick cada segundo para countdown del bump en tiempo real
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    const u = getUsername();
    if (!u) { setLoading(false); setNotFound(true); return; }
    setUsername(u);
    load(u);
  }, []);

  // Polling de Firebase cada 3s para actualizar bumps, nextBumpAt y estado del robot
  useEffect(() => {
    if (!username) return;
    const refresh = async () => {
      try {
        const r = await fetch(`${FB}/proxyUsers/${username}.json`);
        const data = await r.json();
        if (data) {
          setUser(data);
          setBumpCount(data.bumpCount || 0);
          setNextBumpAt(data.nextBumpAt || 0);
        }
      } catch {}
    };
    refresh();
    const iv = setInterval(refresh, 3000); // Polling cada 3 segundos para mejor sincronización
    return () => clearInterval(iv);
  }, [username]);

  async function load(u: string) {
    setLoading(true);
    try {
      const r = await fetch(`${FB}/proxyUsers/${u}.json`);
      const data = await r.json();
      if (!data) { setNotFound(true); return; }
      setUser(data);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function toggleRobot() {
    if (!user || !username) return;
    setTogglingRobot(true);
    try {
      const newPaused = !user.robotPaused;
      await fetch(`${FB}/proxyUsers/${username}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotPaused: newPaused }),
      });
      setUser(u => u ? { ...u, robotPaused: newPaused } : u);
      showToast(newPaused ? "⏸ Robot pausado" : "▶ Robot reanudado");
    } finally {
      setTogglingRobot(false);
    }
  }

  async function sendTicket() {
    if (!ticketMsg.trim() || !username) return;
    setTicketBusy(true);
    try {
      const ticket: Ticket = {
        username,
        message: ticketMsg.trim(),
        createdAt: new Date().toISOString(),
        status: "open",
      };
      await fetch(`${FB}/tickets.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ticket),
      });
      setTicketSent(true);
      setTicketMsg("");
      showToast("✓ Mensaje enviado");
    } finally {
      setTicketBusy(false);
    }
  }

  // ── Pantallas de error ────────────────────────────────────────────────────
  const S = {
    page: { minHeight: "100vh", background: "#080b14", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" } as React.CSSProperties,
    card: { maxWidth: 420, width: "100%", background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 20, padding: 32, textAlign: "center" as const },
  };

  if (loading) return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>⏳</div>
        <div style={{ color: "rgba(255,255,255,.4)", fontSize: 14 }}>Cargando tu panel...</div>
      </div>
    </div>
  );

  if (notFound || !user) return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>👼</div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Angel Rent</div>
        <div style={{ color: "rgba(255,255,255,.35)", fontSize: 13 }}>No se encontró tu panel.<br />Verifica el link con tu administrador.</div>
      </div>
    </div>
  );

  if (!user.active) return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
        <div style={{ color: "#f87171", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Cuenta inactiva</div>
        <div style={{ color: "rgba(255,255,255,.35)", fontSize: 13 }}>Tu servicio está pausado.<br />Contacta a tu administrador para reactivarlo.</div>
      </div>
    </div>
  );

  // ── Datos de renta ────────────────────────────────────────────────────────
  const expTs = user.rentalEndTimestamp || (() => {
    if (!user.rentalEnd) return 0;
    const [y, m, d] = user.rentalEnd.split("-").map(Number);
    return Date.UTC(y, m - 1, d, 23, 59, 59);
  })();
  const countdown = expTs ? fmtCountdown(expTs) : null;
  const robotActive = user.robotOn === true;
  const robotPaused = user.robotPaused === true;

  const proxyUrl = user.defaultUrl || "https://megapersonals.eu";
  const proxyLink = `${typeof window !== "undefined" ? window.location.origin : ""}/api/angel-rent?u=${username}&url=${encodeURIComponent(proxyUrl)}`;

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080b14", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#fff" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#1e293b", border: "1px solid rgba(74,222,128,.3)", borderRadius: 99, padding: "10px 20px", fontSize: 13, color: "#4ade80", fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👼</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.3px" }}>Angel Rent</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>Hola, <span style={{ color: "#c084fc", fontWeight: 700 }}>{user.name || username}</span></div>
          </div>
        </div>

        {/* ── Card: Tiempo de renta ── */}
        <div style={{ background: "#0f1420", border: `1px solid ${countdown?.expired ? "rgba(251,146,60,.25)" : countdown?.urgent ? "rgba(248,113,113,.2)" : "rgba(255,255,255,.07)"}`, borderRadius: 18, padding: 24, marginBottom: 14 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.3)", marginBottom: 12 }}>Tiempo de renta</div>

          {countdown ? (
            <>
              {/* Número grande */}
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1px", color: countdown.expired ? "#fb923c" : countdown.urgent ? "#f87171" : "#4ade80", lineHeight: 1, marginBottom: 6 }}>
                {countdown.label}
              </div>
              {countdown.detail && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginBottom: 16 }}>
                  Vence el {countdown.detail}
                </div>
              )}
              {/* Barra de progreso */}
              {!countdown.expired && (
                <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    width: `${countdown.pct}%`,
                    background: countdown.urgent
                      ? "linear-gradient(90deg,#f87171,#fbbf24)"
                      : "linear-gradient(90deg,#6366f1,#a855f7,#4ade80)",
                    transition: "width .5s ease",
                  }} />
                </div>
              )}
              {countdown.expired && (
                <div style={{ fontSize: 12, color: "rgba(251,146,60,.7)", marginTop: 4 }}>
                  Contacta a tu administrador para renovar tu servicio.
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,.2)" }}>Sin límite</div>
          )}
        </div>

        {/* ── Card: Robot ── */}
        <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: 24, marginBottom: 14 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.3)", marginBottom: 16 }}>Robot de bumps</div>

          {!robotActive ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,.15)", flexShrink: 0 }} />
              <div style={{ fontSize: 14, color: "rgba(255,255,255,.3)" }}>Robot no iniciado</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              {/* Status + bumps */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 14, height: 14, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: robotPaused ? "#fbbf24" : "#4ade80", position: "absolute", top: 2, left: 2 }} />
                  {!robotPaused && (
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(74,222,128,.3)", position: "absolute", top: 0, left: 0, animation: "pulse 1.5s infinite" }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: robotPaused ? "#fbbf24" : "#4ade80" }}>
                    {robotPaused ? "Pausado" : "Activo"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 1 }}>
                    {bumpCount > 0 ? `${bumpCount} bump${bumpCount !== 1 ? "s" : ""} realizados` : "Sin bumps aún"}
                  </div>
                </div>
              </div>

              {/* Botón pausa/reanudar */}
              <button
                onClick={toggleRobot}
                disabled={togglingRobot}
                style={{
                  padding: "10px 20px", borderRadius: 12, border: "none", cursor: togglingRobot ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 13, letterSpacing: "-.2px",
                  background: robotPaused ? "linear-gradient(135deg,#16a34a,#4ade80)" : "linear-gradient(135deg,#d97706,#fbbf24)",
                  color: "#000", opacity: togglingRobot ? .6 : 1,
                  transition: "opacity .15s",
                }}>
                {togglingRobot ? "..." : robotPaused ? "▶ Reanudar" : "⏸ Pausar"}
              </button>
            </div>
          )}

          {/* Próximo bump */}
          {robotActive && !robotPaused && nextBumpAt > now && (() => {
            const diffMs = nextBumpAt - now;
            const totalSecs = Math.floor(diffMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            const pct = Math.min(100, Math.max(0, (1 - diffMs / (1200 * 1000)) * 100));
            return (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)" }}>Próximo bump</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#818cf8", fontVariantNumeric: "tabular-nums" as any }}>
                    {mins > 0 ? `${mins}m ${secs.toString().padStart(2,"0")}s` : `${secs}s`}
                  </div>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 99,
                    width: `${pct}%`,
                    background: "linear-gradient(90deg,#6366f1,#a855f7)",
                    transition: "width 1s linear",
                  }} />
                </div>
              </div>
            );
          })()}
          {robotActive && robotPaused && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 11, color: "rgba(251,191,36,.5)", textAlign: "center" }}>
              El robot está pausado — reanúdalo para continuar los bumps
            </div>
          )}
        </div>

        {/* ── Card: Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.25)", marginBottom: 8 }}>Bumps hoy</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#818cf8", lineHeight: 1 }}>{bumpCount}</div>
          </div>
          <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.25)", marginBottom: 8 }}>Robot</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4,
              color: !robotActive ? "#6b7280" : robotPaused ? "#fbbf24" : "#4ade80" }}>
              {!robotActive ? "○ Apagado" : robotPaused ? "⏸ Pausado" : "● Activo"}
            </div>
          </div>
        </div>

        {/* ── Card: Link ── */}
        <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: 20, marginBottom: 14 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.3)", marginBottom: 12 }}>Tu link de acceso</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#060910", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "9px 12px", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,.4)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {proxyLink}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(proxyLink)
                  .then(() => showToast("✓ Link copiado"))
                  .catch(() => {});
              }}
              style={{ padding: "9px 16px", background: "rgba(99,102,241,.2)", border: "1px solid rgba(99,102,241,.3)", borderRadius: 10, color: "#818cf8", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              Copiar
            </button>
          </div>
        </div>

        {/* ── Card: Ticket ── */}
        <div style={{ background: "#0f1420", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".8px", color: "rgba(255,255,255,.3)", marginBottom: 4 }}>Reportar un problema</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.25)", marginBottom: 14 }}>Tu mensaje llegará directamente a tu administrador</div>

          {ticketSent ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>Mensaje enviado</div>
              <div style={{ color: "rgba(255,255,255,.3)", fontSize: 12, marginTop: 4 }}>Tu administrador lo revisará pronto</div>
              <button onClick={() => setTicketSent(false)} style={{ marginTop: 16, padding: "8px 20px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "rgba(255,255,255,.5)", fontSize: 12, cursor: "pointer" }}>
                Enviar otro
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={ticketMsg}
                onChange={e => setTicketMsg(e.target.value)}
                placeholder="Describe el problema que tienes..."
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box", background: "#060910",
                  border: "1px solid rgba(255,255,255,.08)", borderRadius: 12,
                  padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                  resize: "none", fontFamily: "inherit",
                }}
              />
              <button
                onClick={sendTicket}
                disabled={!ticketMsg.trim() || ticketBusy}
                style={{
                  marginTop: 10, width: "100%", padding: "12px", borderRadius: 12, border: "none",
                  background: ticketMsg.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,.06)",
                  color: ticketMsg.trim() ? "#fff" : "rgba(255,255,255,.25)",
                  fontWeight: 800, fontSize: 14, cursor: ticketMsg.trim() ? "pointer" : "not-allowed",
                  transition: "all .15s",
                }}>
                {ticketBusy ? "Enviando..." : "Enviar mensaje"}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.12)", paddingBottom: 16 }}>
          Angel Rent · {username}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: .6; }
          50% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
