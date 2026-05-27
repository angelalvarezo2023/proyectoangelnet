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

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
        setError("No encontramos publicaciones para este cliente");
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

  const formatTime = (timestamp: number) => {
    const diff = timestamp - now;
    if (diff <= 0) return { value: "Ahora", unit: "" };

    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    if (mins > 0) return { value: `${mins}:${secs.toString().padStart(2, "0")}`, unit: "min" };
    return { value: `${secs}`, unit: "seg" };
  };

  const getProgress = (nextBumpAt: number, addedAt: number) => {
    const total = nextBumpAt - addedAt;
    const elapsed = now - addedAt;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #050508;
          --bg-2: #0a0a12;
          --card: #0f0f1a;
          --card-2: #161624;
          --card-hover: #1c1c2e;
          --primary: #c41e3a;
          --primary-light: #ff3859;
          --gold: #d4af5f;
          --gold-light: #ffd47a;
          --white: #f5f5fa;
          --muted: #6b6b85;
          --border: rgba(255,255,255,0.08);
          --border-light: rgba(255,255,255,0.12);
          --success: #10b981;
          --success-glow: rgba(16,185,129,0.4);
          --danger: #ef4444;
          --danger-glow: rgba(239,68,68,0.4);
        }

        html, body { background: var(--bg); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 56px 56px;
          pointer-events: none;
          z-index: 0;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }

        .glow-1 {
          position: fixed;
          top: -150px;
          left: -150px;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(196,30,58,0.18) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .glow-2 {
          position: fixed;
          bottom: -100px;
          right: -100px;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,175,95,0.12) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .content {
          position: relative;
          z-index: 1;
          max-width: 1240px;
          margin: 0 auto;
        }

        /* ============ SEARCH SCREEN ============ */
        .search-container {
          min-height: 88vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-card {
          background: linear-gradient(180deg, var(--card) 0%, var(--bg-2) 100%);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 52px 44px;
          max-width: 460px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
          position: relative;
        }

        .search-card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 70%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .logo-orb {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(196,30,58,0.4), rgba(196,30,58,0.05));
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 30px;
          position: relative;
          box-shadow: 0 0 60px rgba(196,30,58,0.25), inset 0 0 20px rgba(196,30,58,0.1);
        }

        .logo-orb::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.15);
        }

        .logo-orb span { font-size: 36px; }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 30px;
          letter-spacing: -0.5px;
          margin-bottom: 8px;
        }

        .brand span { color: var(--primary); }

        .tagline {
          font-size: 14px;
          color: var(--muted);
          margin-bottom: 40px;
          letter-spacing: 0.3px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
          text-align: left;
        }

        .input-label {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1.8px;
          font-weight: 600;
        }

        .search-input {
          width: 100%;
          padding: 18px 22px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
          color: var(--white);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(196,30,58,0.12);
        }

        .btn-primary {
          width: 100%;
          padding: 18px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 32px rgba(196,30,58,0.35);
          letter-spacing: 0.3px;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--primary-light);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(196,30,58,0.45);
        }

        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .error-msg {
          color: var(--danger);
          font-size: 13px;
          margin-top: 4px;
        }

        /* ============ CARDS SCREEN ============ */
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 40px;
          padding-bottom: 28px;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 20px;
        }

        .header-info h1 {
          font-family: 'Syne', sans-serif;
          font-size: 32px;
          font-weight: 800;
          margin-bottom: 6px;
          letter-spacing: -0.5px;
        }

        .header-info h1 span { color: var(--primary); }

        .header-info p {
          color: var(--muted);
          font-size: 14px;
          font-weight: 500;
        }

        .btn-back {
          padding: 12px 22px;
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-back:hover {
          background: var(--card-hover);
          border-color: var(--primary);
          transform: translateX(-2px);
        }

        /* ============ STATS ============ */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-bottom: 40px;
        }

        .stat-card {
          background: linear-gradient(135deg, var(--card) 0%, var(--bg-2) 100%);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 22px;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, currentColor, transparent);
          opacity: 0.4;
        }

        .stat-card.gold { color: var(--gold); }
        .stat-card.green { color: var(--success); }
        .stat-card.red { color: var(--danger); }

        .stat-card .stat-label {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 600;
          margin-bottom: 10px;
        }

        .stat-card .stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 38px;
          font-weight: 800;
          line-height: 1;
        }

        /* ============ POST CARDS - PRODUCT STYLE ============ */
        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 24px;
        }

        .post-card {
          background: linear-gradient(180deg, var(--card) 0%, var(--bg-2) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          overflow: hidden;
          position: relative;
          transition: all 0.4s cubic-bezier(0.22,1,0.36,1);
          animation: fadeUp 0.5s ease-out both;
          display: flex;
          flex-direction: column;
        }

        .post-card:hover {
          border-color: var(--border-light);
          transform: translateY(-6px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        .post-card.active:hover {
          box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.3);
        }

        .post-card.paused {
          opacity: 0.85;
        }

        .post-card.paused:hover {
          box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.3);
        }

        /* Top accent line */
        .post-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--success), transparent);
          opacity: 0.8;
        }

        .post-card.paused::before {
          background: linear-gradient(90deg, var(--danger), transparent);
        }

        /* Glow effect when active */
        .post-card.active::after {
          content: '';
          position: absolute;
          top: -1px;
          right: -1px;
          width: 120px;
          height: 120px;
          background: radial-gradient(circle, rgba(16,185,129,0.15), transparent 70%);
          pointer-events: none;
        }

        /* HEADER OF CARD */
        .pc-header {
          padding: 24px 24px 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .pc-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(196,30,58,0.25) 0%, rgba(212,175,95,0.1) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          border: 1px solid rgba(196,30,58,0.25);
          flex-shrink: 0;
        }

        .pc-badge {
          font-size: 10px;
          padding: 6px 12px;
          border-radius: 100px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .pc-badge.active {
          background: rgba(16,185,129,0.12);
          color: var(--success);
          border: 1px solid rgba(16,185,129,0.3);
        }

        .pc-badge.paused {
          background: rgba(239,68,68,0.12);
          color: var(--danger);
          border: 1px solid rgba(239,68,68,0.3);
        }

        .pc-badge .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .pc-badge.active .dot {
          box-shadow: 0 0 8px currentColor;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* TITLE */
        .pc-title {
          padding: 0 24px;
          margin-bottom: 4px;
        }

        .pc-title .pc-id {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }

        .pc-title .pc-id .hash {
          color: var(--muted);
          font-weight: 600;
        }

        .pc-title .pc-subtitle {
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.5px;
        }

        /* TIMER SECTION - PRODUCT STYLE */
        .pc-timer {
          margin: 24px;
          padding: 24px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 18px;
          position: relative;
          overflow: hidden;
        }

        .pc-timer.paused {
          background: rgba(239,68,68,0.04);
          border-color: rgba(239,68,68,0.15);
        }

        .pc-timer-label {
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .pc-timer-value {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 16px;
        }

        .pc-timer-value .num {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          line-height: 1;
          color: var(--gold);
          font-variant-numeric: tabular-nums;
          letter-spacing: -1px;
        }

        .pc-timer-value .unit {
          font-size: 14px;
          color: var(--muted);
          font-weight: 500;
        }

        .pc-timer.paused .pc-timer-value .num {
          color: var(--danger);
        }

        /* Progress bar */
        .pc-progress {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.05);
          border-radius: 100px;
          overflow: hidden;
          position: relative;
        }

        .pc-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--success), var(--gold));
          border-radius: 100px;
          transition: width 1s linear;
          position: relative;
        }

        .pc-progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .pc-progress.paused .pc-progress-fill {
          background: var(--danger);
          opacity: 0.3;
        }

        .pc-progress.paused .pc-progress-fill::after {
          display: none;
        }

        /* META INFO */
        .pc-meta {
          padding: 0 24px;
          margin-bottom: 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .pc-meta-item {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
        }

        .pc-meta-item .label {
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .pc-meta-item .value {
          font-size: 13px;
          color: var(--white);
          font-weight: 600;
        }

        /* ACTIONS */
        .pc-actions {
          padding: 0 24px 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: auto;
        }

        .action-btn {
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.2px;
        }

        .btn-pause {
          background: var(--danger);
          color: white;
          box-shadow: 0 4px 16px rgba(239,68,68,0.25);
        }

        .btn-pause:hover {
          background: #dc2626;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(239,68,68,0.35);
        }

        .btn-resume {
          background: var(--success);
          color: white;
          box-shadow: 0 4px 16px rgba(16,185,129,0.25);
        }

        .btn-resume:hover {
          background: #059669;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(16,185,129,0.35);
        }

        .btn-edit {
          background: var(--card-2);
          color: var(--white);
          border: 1px solid var(--border-light);
        }

        .btn-edit:hover {
          border-color: var(--gold);
          color: var(--gold);
          background: rgba(212,175,95,0.05);
        }

        /* Empty state */
        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 80px 20px;
          color: var(--muted);
          background: var(--card);
          border: 1px dashed var(--border-light);
          border-radius: 24px;
        }

        .empty-state-icon { font-size: 56px; margin-bottom: 20px; }
        .empty-state-text { font-size: 16px; font-weight: 500; margin-bottom: 8px; color: var(--white); }
        .empty-state-sub { font-size: 13px; }

        /* Mobile */
        @media (max-width: 640px) {
          .page { padding: 16px; }
          .header-bar { flex-direction: column; align-items: flex-start; }
          .header-info h1 { font-size: 24px; }
          .posts-grid { grid-template-columns: 1fr; gap: 16px; }
          .stat-card .stat-value { font-size: 28px; }
          .pc-timer-value .num { font-size: 36px; }
        }
      `}</style>

      <div className="page">
        <div className="glow-1" />
        <div className="glow-2" />

        <div className="content">
          {step === "search" && (
            <div className="search-container">
              <div className="search-card">
                <div className="logo-orb">
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
                  {loading ? "Buscando..." : "Acceder al panel"}
                </button>
              </div>
            </div>
          )}

          {step === "cards" && clientData && (
            <div>
              <div className="header-bar">
                <div className="header-info">
                  <h1>
                    Hola, <span>{clientData.displayName}</span>
                  </h1>
                  <p>{Object.keys(clientData.posts || {}).length} publicaciones en tu panel</p>
                </div>
                <button className="btn-back" onClick={goBack}>
                  ← Salir
                </button>
              </div>

              <div className="stats-row">
                <div className="stat-card gold">
                  <div className="stat-label">Total publicaciones</div>
                  <div className="stat-value">{Object.keys(clientData.posts || {}).length}</div>
                </div>
                <div className="stat-card green">
                  <div className="stat-label">Activas</div>
                  <div className="stat-value">
                    {Object.values(clientData.posts || {}).filter((p) => p.status === "active").length}
                  </div>
                </div>
                <div className="stat-card red">
                  <div className="stat-label">Pausadas</div>
                  <div className="stat-value">
                    {Object.values(clientData.posts || {}).filter((p) => p.status === "paused").length}
                  </div>
                </div>
              </div>

              <div className="posts-grid">
                {Object.entries(clientData.posts || {}).length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-text">Sin publicaciones</div>
                    <div className="empty-state-sub">Aún no hay publicaciones registradas</div>
                  </div>
                ) : (
                  Object.entries(clientData.posts).map(([postId, post]) => {
                    const isPaused = post.status === "paused";
                    const time = formatTime(post.nextBumpAt);
                    const progress = isPaused ? 0 : getProgress(post.nextBumpAt, post.lastBumpAt || post.addedAt);

                    return (
                      <div key={postId} className={`post-card ${isPaused ? "paused" : "active"}`}>
                        <div className="pc-header">
                          <div className="pc-icon">📌</div>
                          <span className={`pc-badge ${isPaused ? "paused" : "active"}`}>
                            <span className="dot"></span>
                            {isPaused ? "Pausado" : "Activo"}
                          </span>
                        </div>

                        <div className="pc-title">
                          <div className="pc-id">
                            <span className="hash">#</span>
                            {postId}
                          </div>
                          <div className="pc-subtitle">Publicación clasificada</div>
                        </div>

                        <div className={`pc-timer ${isPaused ? "paused" : ""}`}>
                          <div className="pc-timer-label">
                            {isPaused ? "⏸️ Publicación pausada" : "⏰ Próximo bump en"}
                          </div>
                          <div className="pc-timer-value">
                            <span className="num">{isPaused ? "—" : time.value}</span>
                            <span className="unit">{!isPaused && time.unit}</span>
                          </div>
                          <div className={`pc-progress ${isPaused ? "paused" : ""}`}>
                            <div className="pc-progress-fill" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="pc-meta">
                          <div className="pc-meta-item">
                            <div className="label">Último bump</div>
                            <div className="value">
                              {post.lastBumpAt
                                ? new Date(post.lastBumpAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </div>
                          </div>
                          <div className="pc-meta-item">
                            <div className="label">Registrado</div>
                            <div className="value">
                              {new Date(post.addedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}
                            </div>
                          </div>
                        </div>

                        <div className="pc-actions">
                          <button
                            className={`action-btn ${isPaused ? "btn-resume" : "btn-pause"}`}
                            onClick={() => togglePostStatus(postId, post.status)}
                          >
                            {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                          </button>
                          <button className="action-btn btn-edit" onClick={() => alert("✨ Próximamente disponible!")}>
                            ✏ Editar
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
