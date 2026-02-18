"use client";

import { useState, useEffect } from "react";

const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";

export default function AngelRentLogin() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const last = localStorage.getItem("ar_user");
      if (last) setUsername(last);
    } catch {}
  }, []);

  const login = async () => {
    const name = username.trim().toLowerCase();
    if (!name) { setError("Ingresa tu usuario"); return; }

    setLoading(true);
    setError("");

    try {
      const resp = await fetch(`${FB}/proxyUsers/${name}.json`);
      const user = await resp.json();

      if (!user) { setError("Usuario no encontrado"); setLoading(false); return; }
      if (!user.active) { setError("Cuenta desactivada. Contacta al administrador."); setLoading(false); return; }

      if (user.rentalEnd) {
        const days = Math.ceil(
          (new Date(user.rentalEnd + "T23:59:59").getTime() - Date.now()) / 86400000
        );
        if (days <= 0) { setError("Tu plan ha expirado. Contacta al administrador."); setLoading(false); return; }
      }

      try { localStorage.setItem("ar_user", name); } catch {}

      const url = user.defaultUrl || "https://megapersonals.eu";
      setTimeout(() => {
        window.location.href = `/api/angel-rent?u=${encodeURIComponent(name)}&url=${encodeURIComponent(url)}`;
      }, 600);
    } catch (e: any) {
      setError("Error de conexión: " + e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "linear-gradient(135deg, #0f0515 0%, #1a0a2e 40%, #16082a 100%)",
    }}>
      {/* Radial glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 30% 20%, rgba(168,85,247,.08), transparent 50%), radial-gradient(circle at 70% 80%, rgba(236,72,153,.06), transparent 50%)" }} />

      <div style={{
        maxWidth: 380, width: "100%",
        background: "rgba(20,10,35,.85)",
        border: "1px solid rgba(168,85,247,.15)",
        borderRadius: 24,
        padding: "40px 32px",
        boxShadow: "0 20px 60px rgba(0,0,0,.5), 0 0 80px rgba(168,85,247,.05)",
        textAlign: "center",
        position: "relative",
        backdropFilter: "blur(20px)",
      }}>
        {/* Glow decorations */}
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", filter: "blur(80px)", background: "#a855f7", top: -60, left: -40, opacity: .15, pointerEvents: "none", zIndex: -1 }} />
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", filter: "blur(80px)", background: "#ec4899", bottom: -60, right: -40, opacity: .15, pointerEvents: "none", zIndex: -1 }} />

        <div style={{ fontSize: 56, marginBottom: 12, filter: "drop-shadow(0 4px 12px rgba(168,85,247,.3))" }}>👼</div>

        <h1 style={{
          fontSize: 26, marginBottom: 4,
          background: "linear-gradient(135deg, #a855f7, #ec4899)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontWeight: 800, letterSpacing: "-.5px",
        }}>
          Angel Rent
        </h1>
        <p style={{ color: "rgba(255,255,255,.35)", fontSize: 12, marginBottom: 32 }}>
          Ingresa tu usuario para continuar
        </p>

        {/* Input */}
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 10, color: "rgba(168,85,247,.6)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, fontWeight: 600 }}>
            Usuario
          </label>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && !loading && login()}
            placeholder="Tu usuario..."
            autoFocus
            autoComplete="off"
            disabled={loading}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(168,85,247,.06)",
              border: "1px solid rgba(168,85,247,.12)",
              borderRadius: 14, padding: "13px 16px",
              color: "#fff", fontSize: 15, outline: "none",
            }}
          />
        </div>

        {/* Button */}
        <button
          onClick={login}
          disabled={loading}
          style={{
            width: "100%", padding: "14px", border: "none", borderRadius: 14,
            fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
            color: "#fff", opacity: loading ? .6 : 1,
            boxShadow: "0 4px 20px rgba(168,85,247,.3)",
            marginTop: 8,
          }}
        >
          {loading ? "Conectando..." : "Ingresar"}
        </button>

        {/* Error */}
        {error && (
          <div style={{ color: "#f472b6", fontSize: 12, marginTop: 14, padding: "10px", background: "rgba(236,72,153,.08)", border: "1px solid rgba(236,72,153,.15)", borderRadius: 10 }}>
            {error}
          </div>
        )}

        {/* Hidden admin link */}
        <div style={{ marginTop: 28, fontSize: 10 }}>
          <a href="/angel-rent-admin" style={{ color: "rgba(255,255,255,.04)", textDecoration: "none" }}
            onMouseOver={e => (e.currentTarget.style.color = "rgba(255,255,255,.12)")}
            onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,.04)")}
          >·</a>
        </div>
      </div>
    </div>
  );
}
