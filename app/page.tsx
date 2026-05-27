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
    if (diff <= 0) return { mins: "00", secs: "00", total: 0 };

    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    return {
      mins: mins.toString().padStart(2, "0"),
      secs: secs.toString().padStart(2, "0"),
      total: totalSecs,
    };
  };

  const getProgress = (post: PostData) => {
    const start = post.lastBumpAt || post.addedAt;
    const total = post.nextBumpAt - start;
    const elapsed = now - start;
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-0: #030305;
          --bg-1: #07070d;
          --bg-2: #0a0a14;
          --bg-3: #0f0f1c;
          --surface: rgba(255,255,255,0.03);
          --surface-2: rgba(255,255,255,0.05);
          --primary: #c41e3a;
          --primary-2: #ff3859;
          --primary-glow: rgba(196,30,58,0.35);
          --accent: #d4af5f;
          --accent-2: #ffd47a;
          --white: #fafafa;
          --gray-50: #f5f5f7;
          --gray-300: #a0a0b0;
          --gray-500: #6b6b85;
          --gray-700: #3a3a4a;
          --border: rgba(255,255,255,0.06);
          --border-2: rgba(255,255,255,0.1);
          --success: #10b981;
          --success-glow: rgba(16,185,129,0.4);
          --danger: #ef4444;
          --danger-glow: rgba(239,68,68,0.4);
        }

        html, body { background: var(--bg-0); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 32px 24px;
          position: relative;
          overflow-x: hidden;
        }

        /* Animated mesh background */
        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 70%, rgba(212,175,95,0.08) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.05) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
          animation: meshMove 20s ease-in-out infinite;
        }

        @keyframes meshMove {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(2deg); }
        }

        .page::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 64px 64px;
          pointer-events: none;
          z-index: 0;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }

        .content {
          position: relative;
          z-index: 1;
          max-width: 1320px;
          margin: 0 auto;
        }

        /* ============================================
           SEARCH SCREEN
           ============================================ */
        .search-container {
          min-height: 88vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 56px 48px;
          max-width: 480px;
          width: 100%;
          text-align: center;
          box-shadow:
            0 0 120px rgba(0,0,0,0.5),
            0 1px 0 rgba(255,255,255,0.04) inset,
            0 0 0 1px var(--border) inset;
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        .search-card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 80%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0.6;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .logo-orb {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(196,30,58,0.5), rgba(196,30,58,0.05));
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 32px;
          position: relative;
          box-shadow:
            0 0 80px rgba(196,30,58,0.3),
            inset 0 0 24px rgba(196,30,58,0.15);
        }

        .logo-orb::after {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.15);
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        .logo-orb span { font-size: 40px; }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 34px;
          letter-spacing: -0.8px;
          margin-bottom: 10px;
        }

        .brand span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .tagline {
          font-size: 14px;
          color: var(--gray-500);
          margin-bottom: 44px;
          letter-spacing: 0.5px;
          font-weight: 500;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          text-align: left;
        }

        .input-label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
        }

        .search-input {
          width: 100%;
          padding: 20px 24px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          color: var(--white);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: all 0.3s;
        }

        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(196,30,58,0.12);
          background: var(--bg-2);
        }

        .btn-primary {
          width: 100%;
          padding: 20px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow:
            0 8px 32px rgba(196,30,58,0.4),
            0 1px 0 rgba(255,255,255,0.15) inset;
          letter-spacing: 0.3px;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 12px 40px rgba(196,30,58,0.5),
            0 1px 0 rgba(255,255,255,0.2) inset;
        }

        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .error-msg {
          color: var(--danger);
          font-size: 13px;
          margin-top: -16px;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px;
        }

        /* ============================================
           HEADER OF DASHBOARD
           ============================================ */
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 48px;
          padding: 24px 28px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          flex-wrap: wrap;
          gap: 16px;
        }

        .dash-greeting h1 {
          font-family: 'Syne', sans-serif;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }

        .dash-greeting h1 span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .dash-greeting p {
          color: var(--gray-500);
          font-size: 14px;
          font-weight: 500;
        }

        .btn-back {
          padding: 12px 22px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-back:hover {
          background: var(--surface-2);
          border-color: var(--primary);
          transform: translateX(-3px);
        }

        /* ============================================
           STATS PILLS - Pill-shaped premium stats
           ============================================ */
        .stats-row {
          display: flex;
          gap: 14px;
          margin-bottom: 40px;
          flex-wrap: wrap;
        }

        .stat-pill {
          flex: 1;
          min-width: 180px;
          padding: 18px 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 18px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.3s;
        }

        .stat-pill:hover {
          border-color: var(--border-2);
          transform: translateY(-2px);
        }

        .stat-pill-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }

        .stat-pill.total .stat-pill-icon {
          background: linear-gradient(135deg, rgba(212,175,95,0.2) 0%, rgba(212,175,95,0.05) 100%);
          border: 1px solid rgba(212,175,95,0.2);
        }

        .stat-pill.active .stat-pill-icon {
          background: linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }

        .stat-pill.paused .stat-pill-icon {
          background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }

        .stat-pill-info { flex: 1; min-width: 0; }

        .stat-pill-label {
          font-size: 11px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .stat-pill-value {
          font-family: 'Syne', sans-serif;
          font-size: 28px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.5px;
        }

        .stat-pill.total .stat-pill-value { color: var(--accent); }
        .stat-pill.active .stat-pill-value { color: var(--success); }
        .stat-pill.paused .stat-pill-value { color: var(--danger); }

        /* ============================================
           PREMIUM POST CARDS - Stripe/Apple style
           ============================================ */
        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 24px;
        }

        .post-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 28px;
          overflow: hidden;
          transition: all 0.5s cubic-bezier(0.22,1,0.36,1);
          animation: fadeUp 0.6s ease-out both;
        }

        .post-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 28px;
          padding: 1px;
          background: linear-gradient(135deg, var(--success) 0%, transparent 50%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.5;
          pointer-events: none;
        }

        .post-card.paused::before {
          background: linear-gradient(135deg, var(--danger) 0%, transparent 50%);
        }

        .post-card:hover {
          transform: translateY(-8px);
          box-shadow:
            0 30px 60px rgba(0,0,0,0.6),
            0 0 0 1px rgba(255,255,255,0.05);
        }

        .post-card.active:hover::before { opacity: 1; }
        .post-card.paused { opacity: 0.92; }

        /* TOP MESH HEADER */
        .pc-mesh {
          position: relative;
          height: 110px;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.25) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(212,175,95,0.15) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.1) 0%, transparent 50%);
          overflow: hidden;
        }

        .post-card.paused .pc-mesh {
          background:
            radial-gradient(at 20% 30%, rgba(239,68,68,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(107,107,133,0.1) 0%, transparent 50%);
          filter: grayscale(0.3);
        }

        .pc-mesh::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, transparent 60%, var(--bg-2) 100%);
        }

        .pc-mesh-content {
          position: relative;
          z-index: 1;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          height: 100%;
        }

        .pc-id-block { display: flex; flex-direction: column; }

        .pc-id-tiny {
          font-size: 10px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2.5px;
          font-weight: 700;
          margin-bottom: 6px;
          opacity: 0.7;
        }

        .pc-id-big {
          font-family: 'JetBrains Mono', monospace;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: var(--white);
        }

        .pc-id-big .hash { color: var(--gray-500); }

        .pc-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(10px);
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-badge.active {
          color: var(--success);
          border: 1px solid rgba(16,185,129,0.3);
        }

        .pc-badge.paused {
          color: var(--danger);
          border: 1px solid rgba(239,68,68,0.3);
        }

        .pc-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .pc-badge.active .pc-badge-dot {
          box-shadow: 0 0 12px currentColor;
          animation: dotPulse 1.5s infinite;
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        /* CIRCULAR TIMER - The hero element */
        .pc-timer-section {
          padding: 4px 24px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .pc-ring-container {
          position: relative;
          width: 200px;
          height: 200px;
          margin-bottom: 20px;
        }

        .pc-ring-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .pc-ring-bg {
          fill: none;
          stroke: rgba(255,255,255,0.05);
          stroke-width: 8;
        }

        .pc-ring-progress {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
          transition: stroke-dashoffset 1s linear;
        }

        .post-card.active .pc-ring-progress {
          stroke: url(#gradActive);
        }

        .post-card.paused .pc-ring-progress {
          stroke: url(#gradPaused);
          opacity: 0.5;
        }

        .pc-ring-center {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .pc-time-value {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -2px;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--white) 0%, var(--gray-300) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .post-card.paused .pc-time-value {
          background: linear-gradient(135deg, var(--gray-500) 0%, var(--gray-700) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pc-time-divider {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          color: var(--gray-700);
          margin: 0 2px;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .pc-time-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-top: 8px;
        }

        .pc-time-row {
          display: flex;
          align-items: flex-end;
        }

        .pc-time-status {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2.5px;
          font-weight: 600;
          padding: 6px 14px;
          background: rgba(255,255,255,0.04);
          border-radius: 100px;
          border: 1px solid var(--border);
        }

        /* META GRID */
        .pc-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 0 24px;
          margin-bottom: 20px;
        }

        .pc-meta-cell {
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          transition: all 0.2s;
        }

        .pc-meta-cell:hover {
          background: var(--surface-2);
          border-color: var(--border-2);
        }

        .pc-meta-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .pc-meta-value {
          font-size: 14px;
          color: var(--white);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        /* ACTIONS */
        .pc-actions {
          padding: 0 24px 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .action-btn {
          padding: 16px 20px;
          border: none;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.3px;
          position: relative;
          overflow: hidden;
        }

        .action-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .action-btn:hover::before { opacity: 1; }

        .btn-pause {
          background: linear-gradient(135deg, var(--danger) 0%, #dc2626 100%);
          color: white;
          box-shadow:
            0 8px 24px rgba(239,68,68,0.35),
            0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-pause:hover { transform: translateY(-2px); }

        .btn-resume {
          background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
          color: white;
          box-shadow:
            0 8px 24px rgba(16,185,129,0.35),
            0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-resume:hover { transform: translateY(-2px); }

        .btn-edit {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .btn-edit:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(212,175,95,0.06);
        }

        /* EMPTY STATE */
        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 100px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 28px;
        }

        .empty-state-icon { font-size: 64px; margin-bottom: 24px; }
        .empty-state-text { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--white); }
        .empty-state-sub { font-size: 14px; color: var(--gray-500); }

        /* MOBILE */
        @media (max-width: 640px) {
          .page { padding: 20px 16px; }
          .dash-header { flex-direction: column; align-items: flex-start; padding: 20px; }
          .dash-greeting h1 { font-size: 24px; }
          .posts-grid { grid-template-columns: 1fr; gap: 16px; }
          .pc-ring-container { width: 180px; height: 180px; }
          .pc-time-value, .pc-time-divider { font-size: 38px; }
          .stat-pill { min-width: 100%; }
        }
      `}</style>

      {/* SVG Gradients */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gradActive" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#d4af5f" />
            <stop offset="100%" stopColor="#c41e3a" />
          </linearGradient>
          <linearGradient id="gradPaused" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#6b6b85" />
          </linearGradient>
        </defs>
      </svg>

      <div className="page">
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
                <div className="tagline">Panel premium de control</div>

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

                <button className="btn-primary" onClick={searchClient} disabled={loading}>
                  {loading ? "Buscando..." : "Acceder al panel"}
                </button>
              </div>
            </div>
          )}

          {step === "cards" && clientData && (
            <div>
              <div className="dash-header">
                <div className="dash-greeting">
                  <h1>
                    Hola, <span>{clientData.displayName}</span>
                  </h1>
                  <p>Panel de control de publicaciones</p>
                </div>
                <button className="btn-back" onClick={goBack}>
                  ← Cerrar sesión
                </button>
              </div>

              <div className="stats-row">
                <div className="stat-pill total">
                  <div className="stat-pill-icon">📊</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Total</div>
                    <div className="stat-pill-value">{Object.keys(clientData.posts || {}).length}</div>
                  </div>
                </div>
                <div className="stat-pill active">
                  <div className="stat-pill-icon">✨</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Activas</div>
                    <div className="stat-pill-value">
                      {Object.values(clientData.posts || {}).filter((p) => p.status === "active").length}
                    </div>
                  </div>
                </div>
                <div className="stat-pill paused">
                  <div className="stat-pill-icon">⏸️</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Pausadas</div>
                    <div className="stat-pill-value">
                      {Object.values(clientData.posts || {}).filter((p) => p.status === "paused").length}
                    </div>
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
                    const progress = isPaused ? 0 : getProgress(post);

                    // Ring calculations
                    const radius = 90;
                    const circumference = 2 * Math.PI * radius;
                    const offset = circumference - (progress / 100) * circumference;

                    return (
                      <div key={postId} className={`post-card ${isPaused ? "paused" : "active"}`}>
                        <div className="pc-mesh">
                          <div className="pc-mesh-content">
                            <div className="pc-id-block">
                              <div className="pc-id-tiny">Publicación</div>
                              <div className="pc-id-big">
                                <span className="hash">#</span>
                                {postId}
                              </div>
                            </div>
                            <span className={`pc-badge ${isPaused ? "paused" : "active"}`}>
                              <span className="pc-badge-dot"></span>
                              {isPaused ? "Pausado" : "En vivo"}
                            </span>
                          </div>
                        </div>

                        <div className="pc-timer-section">
                          <div className="pc-ring-container">
                            <svg className="pc-ring-svg" viewBox="0 0 200 200">
                              <circle className="pc-ring-bg" cx="100" cy="100" r={radius} />
                              <circle
                                className="pc-ring-progress"
                                cx="100"
                                cy="100"
                                r={radius}
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                              />
                            </svg>
                            <div className="pc-ring-center">
                              {isPaused ? (
                                <>
                                  <div className="pc-time-value">⏸</div>
                                  <div className="pc-time-label">Pausado</div>
                                </>
                              ) : (
                                <>
                                  <div className="pc-time-row">
                                    <span className="pc-time-value">{time.mins}</span>
                                    <span className="pc-time-divider">:</span>
                                    <span className="pc-time-value">{time.secs}</span>
                                  </div>
                                  <div className="pc-time-label">Próximo bump</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="pc-meta-grid">
                          <div className="pc-meta-cell">
                            <div className="pc-meta-label">Último bump</div>
                            <div className="pc-meta-value">
                              {post.lastBumpAt
                                ? new Date(post.lastBumpAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </div>
                          </div>
                          <div className="pc-meta-cell">
                            <div className="pc-meta-label">Registrado</div>
                            <div className="pc-meta-value">
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
