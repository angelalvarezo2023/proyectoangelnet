"use client";
import { useState, useEffect } from "react";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";

interface PostData {
  status: "active" | "paused";
  nextBumpAt: number;
  lastBumpAt: number | null;
  addedAt: number;
  url: string;
}

interface ClientData {
  displayName: string;
  posts: Record<string, PostData>;
}

export default function Home() {
  const [step, setStep] = useState<"search" | "cards">("search");
  const [searchName, setSearchName] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Actualizar tiempo cada segundo
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Polling cada 5 segundos para actualizar datos
  useEffect(() => {
    if (step !== "cards" || !clientKey) return;
    const interval = setInterval(async () => {
      const res = await fetch(`${FB_URL}/clients/${clientKey}.json`);
      const data = await res.json();
      if (data) setClientData(data);
    }, 5000);
    return () => clearInterval(interval);
  }, [step, clientKey]);

  const searchClient = async () => {
    if (!searchName.trim()) {
      setError("Ingresa un nombre");
      return;
    }

    setLoading(true);
    setError("");

    const key = searchName.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    try {
      const res = await fetch(`${FB_URL}/clients/${key}.json`);
      const data = await res.json();

      if (data && data.posts) {
        setClientKey(key);
        setClientData(data);
        setStep("cards");
      } else {
        setError("No encontramos posts para este cliente");
      }
    } catch (e) {
      setError("Error de conexión");
    }

    setLoading(false);
  };

  const togglePostStatus = async (postId: string, currentStatus: string) => {
    if (!clientData) return;

    const newStatus = currentStatus === "active" ? "paused" : "active";

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/status.json`, {
      method: "PUT",
      body: JSON.stringify(newStatus),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...clientData.posts[postId], status: newStatus as "active" | "paused" },
      },
    });
  };

  const formatTimeRemaining = (timestamp: number) => {
    const diff = timestamp - now;
    if (diff <= 0) return "Ahora";

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const goBack = () => {
    setStep("search");
    setSearchName("");
    setClientData(null);
    setClientKey("");
    setError("");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #09090f;
          --card: #111118;
          --card-light: #1a1a24;
          --primary: #c41e3a;
          --primary-glow: rgba(196, 30, 58, 0.25);
          --gold: #d4af5f;
          --white: #f0f0f5;
          --muted: #6b6b80;
          --border: rgba(255,255,255,0.07);
          --success: #10b981;
          --warning: #f59e0b;
          --danger: #ef4444;
        }

        html, body { background: var(--bg); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        .glow-tl {
          position: fixed;
          top: -120px;
          left: -120px;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(196,30,58,0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .glow-br {
          position: fixed;
          bottom: -100px;
          right: -100px;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,175,95,0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        .content { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; }

        /* SEARCH SCREEN */
        .search-container {
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 48px 40px;
          max-width: 460px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both;
          position: relative;
        }

        .search-card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .logo-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 28px;
          position: relative;
          background: rgba(196,30,58,0.06);
        }

        .logo-ring::after {
          content: '';
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.12);
        }

        .logo-ring span { font-size: 32px; }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 28px;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .brand span { color: var(--primary); }

        .tagline {
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 36px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .input-label {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          text-align: left;
        }

        .search-input {
          width: 100%;
          padding: 16px 20px;
          background: var(--card-light);
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--white);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(196,30,58,0.15);
        }

        .btn-primary {
          width: 100%;
          padding: 16px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 24px rgba(196,30,58,0.3);
        }

        .btn-primary:hover:not(:disabled) {
          background: #a51830;
          transform: translateY(-1px);
        }

        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .error-msg {
          color: var(--danger);
          font-size: 13px;
          margin-top: 8px;
        }

        /* CARDS SCREEN */
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }

        .header-info h1 {
          font-family: 'Syne', sans-serif;
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .header-info p { color: var(--muted); font-size: 13px; }

        .btn-back {
          padding: 10px 20px;
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--white);
          border-radius: 10px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-back:hover {
          background: var(--card-light);
          border-color: var(--primary);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px;
        }

        .stat-card .stat-label {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .stat-card .stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 32px;
          font-weight: 800;
        }

        .stat-card.green .stat-value { color: var(--success); }
        .stat-card.red .stat-value { color: var(--danger); }
        .stat-card.gold .stat-value { color: var(--gold); }

        /* POST CARDS */
        .posts-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .post-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 24px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 24px;
          align-items: center;
          transition: all 0.3s;
          animation: fadeUp 0.4s ease-out both;
          position: relative;
          overflow: hidden;
        }

        .post-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 4px;
          height: 100%;
          background: var(--success);
          transition: background 0.3s;
        }

        .post-card.paused::before { background: var(--danger); }

        .post-card:hover {
          border-color: rgba(196,30,58,0.3);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }

        .post-icon-box {
          width: 70px;
          height: 70px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(196,30,58,0.2) 0%, rgba(212,175,95,0.1) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          border: 1px solid rgba(196,30,58,0.2);
        }

        .post-info { min-width: 0; }

        .post-id-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }

        .post-id {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 700;
        }

        .badge {
          font-size: 10px;
          padding: 4px 10px;
          border-radius: 100px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .badge-active {
          background: rgba(16,185,129,0.15);
          color: var(--success);
          border: 1px solid rgba(16,185,129,0.3);
        }

        .badge-paused {
          background: rgba(239,68,68,0.15);
          color: var(--danger);
          border: 1px solid rgba(239,68,68,0.3);
        }

        .post-meta {
          display: flex;
          gap: 24px;
          color: var(--muted);
          font-size: 13px;
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-item strong {
          color: var(--white);
          font-weight: 500;
        }

        .meta-item.timer strong {
          color: var(--gold);
          font-family: 'Syne', sans-serif;
          font-weight: 700;
        }

        .post-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .action-btn {
          padding: 10px 16px;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-toggle-active {
          background: var(--danger);
          color: white;
        }

        .btn-toggle-active:hover { background: #dc2626; }

        .btn-toggle-paused {
          background: var(--success);
          color: white;
        }

        .btn-toggle-paused:hover { background: #059669; }

        .btn-edit {
          background: var(--card-light);
          color: var(--muted);
          border: 1px solid var(--border);
        }

        .btn-edit:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--muted);
        }

        .empty-state-icon { font-size: 48px; margin-bottom: 16px; }

        /* Tooltip / Toast */
        .toast {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--card);
          border: 1px solid var(--border);
          padding: 14px 24px;
          border-radius: 12px;
          z-index: 1000;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .post-card {
            grid-template-columns: 1fr;
            text-align: center;
            gap: 16px;
          }
          .post-icon-box { margin: 0 auto; }
          .post-meta { justify-content: center; }
          .post-actions { justify-content: center; flex-wrap: wrap; }
          .stat-card .stat-value { font-size: 26px; }
        }
      `}</style>

      <div className="page">
        <div className="glow-tl" />
        <div className="glow-br" />

        <div className="content">
          {step === "search" && (
            <div className="search-container">
              <div className="search-card">
                <div className="logo-ring">
                  <span>🔍</span>
                </div>

                <div className="brand">
                  Angel<span>Vercel</span>
                </div>
                <div className="tagline">Panel de control de publicaciones</div>

                <div className="input-group">
                  <label className="input-label">Nombre del cliente</label>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Ej: Carla, María, Sofía..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchClient()}
                    autoFocus
                  />
                </div>

                {error && <div className="error-msg">{error}</div>}

                <button
                  className="btn-primary"
                  onClick={searchClient}
                  disabled={loading}
                  style={{ marginTop: 12 }}
                >
                  {loading ? "Buscando..." : "🔓 Acceder"}
                </button>
              </div>
            </div>
          )}

          {step === "cards" && clientData && (
            <div>
              <div className="header-bar">
                <div className="header-info">
                  <h1>👋 Hola, {clientData.displayName}</h1>
                  <p>{Object.keys(clientData.posts || {}).length} publicaciones activas</p>
                </div>
                <button className="btn-back" onClick={goBack}>
                  ← Salir
                </button>
              </div>

              <div className="stats-row">
                <div className="stat-card gold">
                  <div className="stat-label">📋 Total</div>
                  <div className="stat-value">{Object.keys(clientData.posts || {}).length}</div>
                </div>
                <div className="stat-card green">
                  <div className="stat-label">▶️ Activos</div>
                  <div className="stat-value">
                    {Object.values(clientData.posts || {}).filter((p) => p.status === "active").length}
                  </div>
                </div>
                <div className="stat-card red">
                  <div className="stat-label">⏸️ Pausados</div>
                  <div className="stat-value">
                    {Object.values(clientData.posts || {}).filter((p) => p.status === "paused").length}
                  </div>
                </div>
              </div>

              <div className="posts-grid">
                {Object.entries(clientData.posts || {}).length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div>No tienes publicaciones registradas</div>
                  </div>
                ) : (
                  Object.entries(clientData.posts).map(([postId, post]) => {
                    const isPaused = post.status === "paused";
                    const timeText = isPaused ? "Pausado" : formatTimeRemaining(post.nextBumpAt);

                    return (
                      <div key={postId} className={`post-card ${isPaused ? "paused" : ""}`}>
                        <div className="post-icon-box">📌</div>

                        <div className="post-info">
                          <div className="post-id-row">
                            <div className="post-id">Post #{postId}</div>
                            <span className={`badge ${isPaused ? "badge-paused" : "badge-active"}`}>
                              {isPaused ? "Pausado" : "Activo"}
                            </span>
                          </div>

                          <div className="post-meta">
                            <div className="meta-item timer">
                              ⏰ Próximo bump: <strong>{timeText}</strong>
                            </div>
                            {post.lastBumpAt && (
                              <div className="meta-item">
                                Último: <strong>{new Date(post.lastBumpAt).toLocaleTimeString()}</strong>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="post-actions">
                          <button
                            className={`action-btn ${isPaused ? "btn-toggle-paused" : "btn-toggle-active"}`}
                            onClick={() => togglePostStatus(postId, post.status)}
                          >
                            {isPaused ? "▶️ Reanudar" : "⏸️ Pausar"}
                          </button>
                          <button
                            className="action-btn btn-edit"
                            onClick={() => alert("✨ Próximamente disponible!")}
                          >
                            ✏️ Editar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
