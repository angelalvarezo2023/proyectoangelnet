"use client";
import { useState, useEffect } from "react";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
const ADMIN_PASSWORD = "admin2024";
const WHATSAPP_NUMERO = "18293837695"; // Número de Angel (sin + ni espacios)

interface PostData {
  status: "active" | "paused";
  nextBumpAt: number;
  lastBumpAt: number | null;
  addedAt: number;
  url: string;
  rentExpiresAt?: number | null;
}

interface ClientData {
  displayName: string;
  posts: Record<string, PostData>;
}

type Step = "search" | "admin-list" | "cards";

export default function Home() {
  const [step, setStep] = useState<Step>("search");
  const [searchName, setSearchName] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [allClients, setAllClients] = useState<Record<string, ClientData>>({});
  const [adminFilter, setAdminFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [rentModalPost, setRentModalPost] = useState<string | null>(null);
  const [rentDays, setRentDays] = useState("7");
  const [rentHours, setRentHours] = useState("0");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("isAdmin") === "true") {
      setIsAdmin(true);
      setStep("admin-list");
      loadAllClients();
    }
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

  useEffect(() => {
    if (step !== "admin-list" || !isAdmin) return;
    const interval = setInterval(() => loadAllClients(), 10000);
    return () => clearInterval(interval);
  }, [step, isAdmin]);

  const loadAllClients = async () => {
    try {
      const res = await fetch(`${FB_URL}/clients.json`);
      const data = await res.json();
      setAllClients(data || {});
    } catch (e) {
      console.error("Error loading clients", e);
    }
  };

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

  const selectClient = (key: string, data: ClientData) => {
    setClientKey(key);
    setClientData(data);
    setStep("cards");
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

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem("isAdmin", "true");
      setShowAdminLogin(false);
      setAdminPass("");
      setAdminError("");
      setStep("admin-list");
      loadAllClients();
    } else {
      setAdminError("Contraseña incorrecta");
    }
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem("isAdmin");
    setStep("search");
    setClientData(null);
    setClientKey("");
  };

  const verAnuncio = (postId: string) => {
    window.open(`https://megapersonals.eu/public/escort_post_detail/${postId}`, "_blank");
  };

  const renovarWhatsApp = (postId: string) => {
    const mensaje = `Hola Angel, quiero renovar la renta del post: #${postId}`;
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const renovarRenta = async (postId: string) => {
    if (!clientData) return;

    const post = clientData.posts[postId];
    const currentExpiry = post.rentExpiresAt && post.rentExpiresAt > now ? post.rentExpiresAt : now;
    const newExpiry = currentExpiry + 7 * 24 * 60 * 60 * 1000;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/rentExpiresAt.json`, {
      method: "PUT",
      body: JSON.stringify(newExpiry),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...post, rentExpiresAt: newExpiry },
      },
    });
  };

  const abrirModalRenta = (postId: string) => {
    setRentModalPost(postId);
    setRentDays("7");
    setRentHours("0");
  };

  const guardarRenta = async () => {
    if (!rentModalPost || !clientData) return;

    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;

    if (days === 0 && hours === 0) {
      alert("⚠️ Ingresa al menos 1 día o 1 hora");
      return;
    }

    const newExpiry = Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${rentModalPost}/rentExpiresAt.json`, {
      method: "PUT",
      body: JSON.stringify(newExpiry),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [rentModalPost]: { ...clientData.posts[rentModalPost], rentExpiresAt: newExpiry },
      },
    });

    setRentModalPost(null);
  };

  const quitarRenta = async (postId: string) => {
    if (!clientData) return;
    if (!confirm("¿Quitar la renta de este post?")) return;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/rentExpiresAt.json`, {
      method: "PUT",
      body: JSON.stringify(null),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...clientData.posts[postId], rentExpiresAt: null },
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

  const getRentInfo = (post: PostData) => {
    if (!post.rentExpiresAt) {
      return { status: "none" as const, days: 0, hours: 0, isWarning: false, totalHours: 0 };
    }

    const diff = post.rentExpiresAt - now;
    if (diff <= 0) {
      return { status: "expired" as const, days: 0, hours: 0, isWarning: false, totalHours: 0 };
    }

    const totalHours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    // Advertencia cuando queda 1 día (24h) o menos
    const isWarning = totalHours <= 24;

    return { status: "active" as const, days, hours, isWarning, totalHours };
  };

  const goBack = () => {
    if (isAdmin) {
      setStep("admin-list");
      setClientData(null);
      setClientKey("");
    } else {
      setStep("search");
      setSearchName("");
      setClientData(null);
      setClientKey("");
      setError("");
    }
  };

  const getGlobalStats = () => {
    let totalPosts = 0;
    let activePosts = 0;
    let pausedPosts = 0;
    let totalClients = Object.keys(allClients).length;

    Object.values(allClients).forEach((client) => {
      if (client.posts) {
        const posts = Object.values(client.posts);
        totalPosts += posts.length;
        activePosts += posts.filter((p) => p.status === "active").length;
        pausedPosts += posts.filter((p) => p.status === "paused").length;
      }
    });

    return { totalClients, totalPosts, activePosts, pausedPosts };
  };

  const filteredClients = Object.entries(allClients).filter(([key, data]) => {
    if (!adminFilter) return true;
    const query = adminFilter.toLowerCase();
    return data.displayName?.toLowerCase().includes(query) || key.includes(query);
  });

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
          --accent: #d4af5f;
          --accent-2: #ffd47a;
          --white: #fafafa;
          --gray-300: #a0a0b0;
          --gray-500: #6b6b85;
          --gray-700: #3a3a4a;
          --border: rgba(255,255,255,0.06);
          --border-2: rgba(255,255,255,0.1);
          --success: #10b981;
          --danger: #ef4444;
          --warning: #f59e0b;
          --info: #3b82f6;
          --whatsapp: #25d366;
        }

        html, body { background: var(--bg-0); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 32px 24px;
          position: relative;
          overflow-x: hidden;
        }

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
          box-shadow: 0 0 120px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
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
          box-shadow: 0 0 80px rgba(196,30,58,0.3), inset 0 0 24px rgba(196,30,58,0.15);
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
          box-shadow: 0 8px 32px rgba(196,30,58,0.4), 0 1px 0 rgba(255,255,255,0.15) inset;
          letter-spacing: 0.3px;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(196,30,58,0.5), 0 1px 0 rgba(255,255,255,0.2) inset;
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

        .admin-link {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          font-size: 12px;
          color: var(--gray-500);
        }

        .admin-link button {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
          font-family: inherit;
        }

        .admin-link button:hover { color: var(--accent-2); }

        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
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
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .admin-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-actions { display: flex; gap: 10px; align-items: center; }

        .btn-back, .btn-secondary {
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

        .btn-back:hover { background: var(--surface-2); border-color: var(--primary); }
        .btn-secondary:hover { background: var(--surface-2); border-color: var(--accent); }

        .stats-row {
          display: flex;
          gap: 14px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        .stat-pill {
          flex: 1;
          min-width: 180px;
          padding: 18px 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.3s;
        }

        .stat-pill:hover { border-color: var(--border-2); transform: translateY(-2px); }

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

        .stat-pill.clients .stat-pill-icon {
          background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.05) 100%);
          border: 1px solid rgba(59,130,246,0.2);
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
        .stat-pill.clients .stat-pill-value { color: var(--info); }
        .stat-pill.total .stat-pill-value { color: var(--accent); }
        .stat-pill.active .stat-pill-value { color: var(--success); }
        .stat-pill.paused .stat-pill-value { color: var(--danger); }

        .admin-filter-bar {
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .admin-filter-bar input {
          flex: 1;
          padding: 16px 22px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
          color: var(--white);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .admin-filter-bar input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.1);
        }

        .clients-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 18px;
        }

        .client-card {
          position: relative;
          padding: 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 22px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
          animation: fadeUp 0.5s ease-out both;
        }

        .client-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, var(--primary), var(--accent), transparent);
          opacity: 0.6;
        }

        .client-card:hover {
          transform: translateY(-6px);
          border-color: var(--accent);
          box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,95,0.2);
        }

        .client-card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }

        .client-avatar {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 6px 20px rgba(196,30,58,0.3);
        }

        .client-info { flex: 1; min-width: 0; }

        .client-name {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .client-handle {
          font-size: 12px;
          color: var(--gray-500);
          font-family: 'JetBrains Mono', monospace;
        }

        .client-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
        }

        .client-stat {
          padding: 10px 8px;
          background: var(--surface);
          border-radius: 10px;
          text-align: center;
        }

        .client-stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 4px;
        }

        .client-stat.total .client-stat-value { color: var(--accent); }
        .client-stat.active .client-stat-value { color: var(--success); }
        .client-stat.paused .client-stat-value { color: var(--danger); }

        .client-stat-label {
          font-size: 9px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 700;
        }

        .client-action {
          width: 100%;
          padding: 12px;
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          color: var(--white);
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
        }

        .client-card:hover .client-action {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          border-color: var(--accent);
          color: #1a1a1a;
        }

        .clients-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 80px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 24px;
        }

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

        .post-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        }

        .post-card.paused { opacity: 0.92; }

        /* Warning glow en el borde de la card */
        .post-card.warning {
          border-color: rgba(245,158,11,0.4);
          box-shadow: 0 0 0 1px rgba(245,158,11,0.2), 0 0 30px rgba(245,158,11,0.1);
        }

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
          background: linear-gradient(180deg, transparent 60%, var(--bg-2) 100%);
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

        .pc-badge.active { color: var(--success); border: 1px solid rgba(16,185,129,0.3); }
        .pc-badge.paused { color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

        .pc-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .pc-badge.active .pc-badge-dot {
          box-shadow: 0 0 12px currentColor;
          animation: dotPulse 1.5s infinite;
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .pc-timer-section {
          padding: 4px 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .pc-ring-container {
          position: relative;
          width: 200px;
          height: 200px;
          margin-bottom: 8px;
        }

        .pc-ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }

        .pc-ring-bg { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 8; }

        .pc-ring-progress {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
          transition: stroke-dashoffset 1s linear;
        }

        .post-card.active .pc-ring-progress { stroke: url(#gradActive); }
        .post-card.paused .pc-ring-progress { stroke: url(#gradPaused); opacity: 0.5; }

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

        .pc-time-row { display: flex; align-items: flex-end; }

        /* ===== BANNER DE ADVERTENCIA ===== */
        .pc-warning {
          margin: 0 24px 20px;
          padding: 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%);
          border: 1px solid rgba(245,158,11,0.4);
          position: relative;
          overflow: hidden;
          animation: warningPulse 2s ease-in-out infinite;
        }

        @keyframes warningPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.2); }
          50% { box-shadow: 0 0 0 4px rgba(245,158,11,0.08); }
        }

        .pc-warning-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pc-warning-icon {
          font-size: 18px;
          animation: shake 0.8s ease-in-out infinite;
        }

        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        .pc-warning-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--warning);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-warning-text {
          font-size: 12px;
          color: var(--gray-300);
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .pc-warning-text strong { color: var(--white); }

        .pc-warning-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, var(--whatsapp) 0%, #1da851 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 6px 20px rgba(37,211,102,0.3);
        }

        .pc-warning-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 26px rgba(37,211,102,0.45);
        }

        .pc-rent {
          margin: 0 24px 20px;
          padding: 16px 18px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pc-rent.active {
          background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }
        .pc-rent.expired {
          background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .pc-rent.none {
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .pc-rent-info { display: flex; flex-direction: column; }

        .pc-rent-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pc-rent-value {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .pc-rent.active .pc-rent-value { color: var(--success); }
        .pc-rent.expired .pc-rent-value { color: var(--danger); }
        .pc-rent.none .pc-rent-value { color: var(--gray-500); font-size: 14px; }

        .pc-rent-actions { display: flex; gap: 6px; }

        .rent-btn {
          padding: 8px 12px;
          background: var(--bg-3);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .rent-btn:hover { border-color: var(--accent); color: var(--accent); }

        .rent-btn.renew {
          background: linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%);
          border-color: rgba(16,185,129,0.3);
          color: var(--success);
        }

        .rent-btn.renew:hover {
          background: linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.1) 100%);
        }

        .rent-btn.remove:hover { border-color: var(--danger); color: var(--danger); }

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

        .pc-actions {
          padding: 0 24px 24px;
          display: grid;
          gap: 10px;
        }

        .pc-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .action-btn {
          padding: 14px 18px;
          border: none;
          border-radius: 14px;
          font-size: 13px;
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
          box-shadow: 0 6px 20px rgba(239,68,68,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-resume {
          background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(16,185,129,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-pause:hover, .btn-resume:hover { transform: translateY(-2px); }

        .btn-view {
          background: linear-gradient(135deg, var(--info) 0%, #2563eb 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(59,130,246,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-view:hover { transform: translateY(-2px); }

        .btn-edit {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .btn-edit:hover { border-color: var(--accent); color: var(--accent); background: rgba(212,175,95,0.06); }

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
        .empty-state-sub { font-size: 14px; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card {
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          padding: 36px 32px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        .modal-title {
          font-family: 'Syne', sans-serif;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .modal-subtitle {
          font-size: 13px;
          color: var(--gray-500);
          margin-bottom: 28px;
        }

        .modal-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 24px;
        }

        .modal-field { display: flex; flex-direction: column; }
        .modal-field label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .modal-field input {
          padding: 16px 20px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          color: var(--white);
          font-size: 18px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          text-align: center;
          outline: none;
          transition: all 0.2s;
        }

        .modal-field input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.12);
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .modal-btn {
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-btn-primary {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          box-shadow: 0 6px 20px rgba(212,175,95,0.3);
        }

        .modal-btn-primary:hover { transform: translateY(-2px); }

        .modal-btn-secondary {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .modal-btn-secondary:hover { background: var(--bg-3); }

        @media (max-width: 640px) {
          .page { padding: 20px 16px; }
          .dash-header { flex-direction: column; align-items: flex-start; padding: 20px; }
          .dash-greeting h1 { font-size: 24px; }
          .posts-grid, .clients-grid { grid-template-columns: 1fr; gap: 16px; }
          .pc-ring-container { width: 180px; height: 180px; }
          .pc-time-value, .pc-time-divider { font-size: 38px; }
          .stat-pill { min-width: 100%; }
          .pc-rent { flex-direction: column; align-items: flex-start; }
          .pc-rent-actions { width: 100%; }
          .rent-btn { flex: 1; justify-content: center; }
        }
      `}</style>

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

                <div className="admin-link">
                  <button onClick={() => setShowAdminLogin(true)}>🔐 Acceso administrador</button>
                </div>
              </div>
            </div>
          )}

          {step === "admin-list" && isAdmin && (
            <div>
              <div className="dash-header">
                <div className="dash-greeting">
                  <h1>
                    Panel <span>Administrador</span>
                  </h1>
                  <p>
                    Lista completa de clientes
                    <span className="admin-badge">⚡ ADMIN</span>
                  </p>
                </div>
                <div className="header-actions">
                  <button className="btn-secondary" onClick={loadAllClients}>
                    🔄 Actualizar
                  </button>
                  <button className="btn-back" onClick={logoutAdmin}>
                    🔓 Salir
                  </button>
                </div>
              </div>

              {(() => {
                const stats = getGlobalStats();
                return (
                  <div className="stats-row">
                    <div className="stat-pill clients">
                      <div className="stat-pill-icon">👥</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Clientes</div>
                        <div className="stat-pill-value">{stats.totalClients}</div>
                      </div>
                    </div>
                    <div className="stat-pill total">
                      <div className="stat-pill-icon">📊</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Publicaciones</div>
                        <div className="stat-pill-value">{stats.totalPosts}</div>
                      </div>
                    </div>
                    <div className="stat-pill active">
                      <div className="stat-pill-icon">✨</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Activas</div>
                        <div className="stat-pill-value">{stats.activePosts}</div>
                      </div>
                    </div>
                    <div className="stat-pill paused">
                      <div className="stat-pill-icon">⏸️</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Pausadas</div>
                        <div className="stat-pill-value">{stats.pausedPosts}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="admin-filter-bar">
                <input
                  type="text"
                  placeholder="🔍 Filtrar clientes por nombre..."
                  value={adminFilter}
                  onChange={(e) => setAdminFilter(e.target.value)}
                />
              </div>

              <div className="clients-grid">
                {filteredClients.length === 0 ? (
                  <div className="clients-empty">
                    <div style={{ fontSize: 56, marginBottom: 20 }}>📭</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: "var(--white)" }}>
                      {Object.keys(allClients).length === 0 ? "Sin clientes" : "Sin resultados"}
                    </div>
                    <div style={{ fontSize: 14 }}>
                      {Object.keys(allClients).length === 0
                        ? "Aún no hay clientes registrados"
                        : "Intenta con otro nombre"}
                    </div>
                  </div>
                ) : (
                  filteredClients.map(([key, data]) => {
                    const posts = data.posts ? Object.values(data.posts) : [];
                    const total = posts.length;
                    const active = posts.filter((p) => p.status === "active").length;
                    const paused = posts.filter((p) => p.status === "paused").length;
                    const initial = (data.displayName || key).charAt(0).toUpperCase();

                    return (
                      <div key={key} className="client-card" onClick={() => selectClient(key, data)}>
                        <div className="client-card-header">
                          <div className="client-avatar">{initial}</div>
                          <div className="client-info">
                            <div className="client-name">{data.displayName || key}</div>
                            <div className="client-handle">@{key}</div>
                          </div>
                        </div>

                        <div className="client-stats">
                          <div className="client-stat total">
                            <div className="client-stat-value">{total}</div>
                            <div className="client-stat-label">Total</div>
                          </div>
                          <div className="client-stat active">
                            <div className="client-stat-value">{active}</div>
                            <div className="client-stat-label">Activas</div>
                          </div>
                          <div className="client-stat paused">
                            <div className="client-stat-value">{paused}</div>
                            <div className="client-stat-label">Pausadas</div>
                          </div>
                        </div>

                        <button className="client-action">Abrir panel →</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {step === "cards" && clientData && (
            <div>
              <div className="dash-header">
                <div className="dash-greeting">
                  <h1>
                    {isAdmin ? "Panel de" : "Hola,"} <span>{clientData.displayName}</span>
                  </h1>
                  <p>
                    Control de publicaciones
                    {isAdmin && <span className="admin-badge">⚡ ADMIN</span>}
                  </p>
                </div>
                <div className="header-actions">
                  <button className="btn-back" onClick={goBack}>
                    ← {isAdmin ? "Volver a lista" : "Cerrar sesión"}
                  </button>
                </div>
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
                    const rent = getRentInfo(post);

                    const radius = 90;
                    const circumference = 2 * Math.PI * radius;
                    const offset = circumference - (progress / 100) * circumference;

                    return (
                      <div
                        key={postId}
                        className={`post-card ${isPaused ? "paused" : "active"} ${rent.isWarning ? "warning" : ""}`}
                      >
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

                        {/* BANNER DE ADVERTENCIA - solo cuando queda 1 día o menos */}
                        {rent.isWarning && (
                          <div className="pc-warning">
                            <div className="pc-warning-header">
                              <span className="pc-warning-icon">⚠️</span>
                              <span className="pc-warning-title">Advertencia</span>
                            </div>
                            <div className="pc-warning-text">
                              Este post se <strong>pausará automáticamente</strong> y luego será{" "}
                              <strong>eliminado</strong> cuando el tiempo de renta llegue a 0. Para renovar, contacta con{" "}
                              <strong>Angel</strong> por WhatsApp.
                            </div>
                            <button className="pc-warning-btn" onClick={() => renovarWhatsApp(postId)}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.522l4.625-1.476A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-5.226-1.526l-.375-.237-3.872 1.013 1.035-3.776-.244-.388A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                              </svg>
                              Renovar por WhatsApp
                            </button>
                          </div>
                        )}

                        <div className={`pc-rent ${rent.status}`}>
                          <div className="pc-rent-info">
                            <div className="pc-rent-label">
                              🎫 {rent.status === "active" ? "Renta activa" : rent.status === "expired" ? "Renta vencida" : "Sin renta"}
                            </div>
                            <div className="pc-rent-value">
                              {rent.status === "active"
                                ? `${rent.days}d ${rent.hours}h restantes`
                                : rent.status === "expired"
                                ? "Renovar para reactivar"
                                : "No establecida"}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="pc-rent-actions">
                              <button className="rent-btn renew" onClick={() => renovarRenta(postId)} title="Agregar 7 días">
                                +7d
                              </button>
                              <button className="rent-btn" onClick={() => abrirModalRenta(postId)} title="Establecer renta">
                                ⚙
                              </button>
                              {rent.status !== "none" && (
                                <button className="rent-btn remove" onClick={() => quitarRenta(postId)} title="Quitar renta">
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
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
                          <div className="pc-actions-row">
                            <button
                              className={`action-btn ${isPaused ? "btn-resume" : "btn-pause"}`}
                              onClick={() => togglePostStatus(postId, post.status)}
                            >
                              {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                            </button>
                            <button className="action-btn btn-view" onClick={() => verAnuncio(postId)}>
                              👁 Ver anuncio
                            </button>
                          </div>
                          <button className="action-btn btn-edit" onClick={() => alert("✨ Próximamente disponible!")}>
                            ✏ Editar publicación
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

        {showAdminLogin && (
          <div className="modal-overlay" onClick={() => setShowAdminLogin(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">🔐 Acceso Administrador</div>
              <div className="modal-subtitle">Ingresa la contraseña de administrador</div>
              <div style={{ marginBottom: 20 }}>
                <input
                  type="password"
                  className="search-input"
                  placeholder="Contraseña"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAdminLogin()}
                  autoFocus
                />
              </div>
              {adminError && <div className="error-msg">{adminError}</div>}
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setShowAdminLogin(false)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={handleAdminLogin}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}

        {rentModalPost && (
          <div className="modal-overlay" onClick={() => setRentModalPost(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">🎫 Establecer Renta</div>
              <div className="modal-subtitle">
                Post <code style={{ color: "var(--accent)" }}>#{rentModalPost}</code> · La renta se calcula desde ahora
              </div>
              <div className="modal-row">
                <div className="modal-field">
                  <label>Días</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={rentDays}
                    onChange={(e) => setRentDays(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="modal-field">
                  <label>Horas</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={rentHours}
                    onChange={(e) => setRentHours(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setRentModalPost(null)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={guardarRenta}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
