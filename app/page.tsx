"use client";
import { useState, useEffect, useRef } from "react";

import {
  FB_URL,
  ADMIN_PASSWORD,
  WHATSAPP_NUMERO,
  imagenViaProxy,
} from "./lib/constants";
import type {
  EditRequestFields,
  EditRequest,
  PostCapturedData,
  PostData,
  ClientData,
  Step,
} from "./lib/types";
import { US_LOCATIONS } from "./lib/usLocations";
import EstilosGlobales from "./components/EstilosGlobales";
import VistaClienteMP from "./components/VistaClienteMP";
import EstilosVistaClienteMP from "./components/EstilosVistaClienteMP";

// ============================================================
// ESTILOS DEL LOGIN VICE CITY — replica fiel del render
// El logo central está hecho en HTML/CSS (no usa imagen externa)
// ============================================================
const VICE_CITY_STYLES = `
/* Wrapper: position fixed para ocupar TODA la pantalla sin que el wrapper del sistema lo limite */
.vc-page-search {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  /* iOS: scroll suave con momentum */
  -webkit-overflow-scrolling: touch;
  /* Forzar GPU compositing para evitar flickering en iOS Safari */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  /* Gradiente Vice City de respaldo si las imágenes no cargan */
  background:
    radial-gradient(ellipse at 50% 70%, rgba(255, 77, 122, 0.4) 0%, rgba(122, 31, 94, 0.6) 30%, rgba(74, 17, 69, 0.85) 60%, #1a0a1f 100%),
    linear-gradient(180deg, #2a0d3a 0%, #4a1145 30%, #7a1f5e 60%, #1a0a1f 100%);
  background-color: #1a0a1f;
  z-index: 9999;
}

/* Imágenes de fondo como <img> (más confiable en iOS Safari que background-image) */
.vc-bg-img {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  object-fit: cover;
  object-position: center center;
  z-index: 0;
  pointer-events: none;
  /* Forzar GPU compositing - evita flickering en iOS Safari */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  will-change: transform;
}

.vc-bg-img.vc-bg-desktop { display: block; }
.vc-bg-img.vc-bg-mobile { display: none; }

/* En móvil/pantallas verticales: cambiar a la imagen vertical */
@media (max-width: 768px), (max-aspect-ratio: 3/4) {
  .vc-bg-img.vc-bg-desktop { display: none; }
  .vc-bg-img.vc-bg-mobile { display: block; }
}

/* ============= LADO IZQUIERDO ============= */
.vc-left-side {
  position: absolute;
  left: 6%;
  top: 10%;
  width: 30%;
  max-width: 480px;
  z-index: 5;
  pointer-events: none;
}

.vc-logo-big {
  width: 100%;
  height: auto;
  display: block;
  margin-bottom: 26px;
  filter: drop-shadow(0 6px 22px rgba(0, 0, 0, 0.5));
}

.vc-megapersonals-sign {
  width: 82%;
  max-width: 380px;
  height: auto;
  display: block;
  margin-bottom: 22px;
  filter: drop-shadow(0 4px 14px rgba(255, 61, 138, 0.4));
}

.vc-description {
  color: white;
  font-size: 15px;
  line-height: 1.6;
  max-width: 340px;
  font-weight: 500;
  margin: 0;
  text-shadow:
    0 2px 6px rgba(0, 0, 0, 0.9),
    0 0 14px rgba(0, 0, 0, 0.7);
}

/* ============= LADO DERECHO ============= */
.vc-right-side {
  position: absolute;
  right: 2%;
  top: 18%;
  width: 14%;
  max-width: 230px;
  z-index: 5;
  pointer-events: none;
}

.vc-los-santos-sign {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 4px 18px rgba(255, 61, 138, 0.5));
}

/* ============= TARJETA CENTRAL ============= */
.vc-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px 180px;
  position: relative;
  z-index: 10;
}

.vc-card {
  background: rgba(18, 6, 28, 0.88);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 61, 138, 0.18);
  border-radius: 28px;
  padding: 44px 48px 36px;
  width: 100%;
  max-width: 500px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.6),
    0 0 50px rgba(255, 61, 138, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  animation: vcFadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  /* Forzar GPU compositing para evitar flickering en iOS Safari */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

@keyframes vcFadeIn {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============= LOGO HECHO EN HTML/CSS (no imagen) ============= */
.vc-logo-block {
  text-align: center;
  margin-bottom: 28px;
}

.vc-logo-av-wrap {
  display: inline-flex;
  align-items: flex-end;
  gap: 0;
  position: relative;
  line-height: 0.85;
  margin-bottom: 0;
}

.vc-logo-a, .vc-logo-v {
  font-family: 'Arial Black', 'Helvetica Neue', sans-serif;
  font-size: 110px;
  font-weight: 900;
  font-style: italic;
  line-height: 0.9;
  letter-spacing: -3px;
}

.vc-logo-a {
  color: #ffffff;
  -webkit-text-stroke: 5px #000;
  paint-order: stroke fill;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5));
}

.vc-logo-v {
  color: #ff3d8a;
  -webkit-text-stroke: 5px #000;
  paint-order: stroke fill;
  position: relative;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5));
}

.vc-logo-palm {
  position: absolute;
  right: 6px;
  bottom: 18px;
  font-size: 36px;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.4));
  z-index: 2;
}

.vc-logo-name {
  font-family: 'Brush Script MT', 'Pacifico', cursive;
  font-size: 38px;
  font-style: italic;
  font-weight: 600;
  line-height: 1;
  margin-top: 2px;
  letter-spacing: -0.5px;
}

.vc-name-angel {
  color: white;
  text-shadow:
    0 2px 6px rgba(0, 0, 0, 0.6),
    0 0 12px rgba(255, 255, 255, 0.15);
}

.vc-name-vercel {
  color: #ff3d8a;
  text-shadow:
    0 0 12px rgba(255, 61, 138, 0.6),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

.vc-logo-tagline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 4px;
  margin-top: 14px;
  text-transform: uppercase;
}

.vc-tagline-line {
  flex: 0 0 28px;
  height: 1px;
  background: rgba(255, 61, 138, 0.55);
}

/* ============= INPUT Y BOTONES ============= */
.vc-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #ff3d8a;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.vc-label-palm {
  font-size: 15px;
  line-height: 1;
}

.vc-input-wrap {
  position: relative;
  margin-bottom: 24px;
}

.vc-input-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  pointer-events: none;
  opacity: 0.7;
}

.vc-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 61, 138, 0.32);
  border-radius: 14px;
  padding: 18px 18px 18px 54px;
  color: white;
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.vc-input::placeholder { color: rgba(255, 255, 255, 0.4); }

.vc-input:focus {
  border-color: #ff3d8a;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 4px rgba(255, 61, 138, 0.12);
}

.vc-btn {
  width: 100%;
  background: linear-gradient(95deg, #ff2a8a 0%, #ff4d7a 38%, #ff6b3d 72%, #ff9a3d 100%);
  border: none;
  border-radius: 14px;
  padding: 20px 22px;
  color: white;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1.2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-transform: uppercase;
  transition: all 0.2s ease;
  font-family: inherit;
  box-shadow:
    0 10px 28px rgba(255, 61, 138, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.vc-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(255, 61, 138, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.vc-btn:active:not(:disabled) { transform: translateY(0); }
.vc-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.vc-btn-icon, .vc-btn-arrow { font-size: 18px; line-height: 1; }
.vc-btn-arrow { margin-left: 4px; }

.vc-divider {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 61, 138, 0.4);
  margin: 26px auto 18px;
  box-shadow: 0 0 8px rgba(255, 61, 138, 0.4);
}

.vc-admin-btn {
  width: 100%;
  background: transparent;
  border: none;
  color: #ffc864;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  transition: color 0.2s;
  font-family: inherit;
}

.vc-admin-btn:hover { color: #ffd989; }
.vc-admin-btn-text { text-decoration: underline; text-underline-offset: 4px; }

.vc-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
  text-align: center;
  animation: vcShake 0.4s ease-in-out;
}

@keyframes vcShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}

/* ============= FEATURES ABAJO (3 cards) ============= */
.vc-features {
  position: absolute;
  bottom: 70px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 70px;
  z-index: 5;
  padding: 0 30px;
}

.vc-feature {
  display: flex;
  align-items: center;
  gap: 16px;
}

.vc-feature-icon {
  font-size: 38px;
  line-height: 1;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgba(255, 61, 138, 0.6));
}

.vc-feature-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
}

.vc-feature-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #ff3d8a;
}

.vc-feature-desc {
  font-size: 13px;
  color: white;
  line-height: 1.4;
  max-width: 200px;
  font-weight: 500;
}

/* ============= FOOTER ============= */
.vc-footer {
  position: absolute;
  bottom: 22px;
  left: 0;
  right: 0;
  text-align: center;
  color: white;
  font-size: 14px;
  z-index: 5;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
  padding: 0 20px;
}

.vc-footer-divider { margin: 0 12px; opacity: 0.5; }

.vc-footer-los-santos {
  font-family: 'Brush Script MT', 'Pacifico', cursive;
  color: #ff3d8a;
  font-size: 17px;
  font-style: italic;
  text-shadow:
    0 0 10px rgba(255, 61, 138, 0.5),
    0 2px 4px rgba(0, 0, 0, 0.6);
}

/* ============= ADAPTACIONES POR PANTALLA ============= */

/* Pantallas medianas-grandes */
@media (max-width: 1400px) {
  .vc-left-side { width: 30%; top: 12%; }
  .vc-logo-big { margin-bottom: 22px; }
  .vc-features { gap: 50px; }
}

@media (max-width: 1200px) {
  .vc-left-side { width: 28%; top: 11%; }
  .vc-description { font-size: 14px; }
  .vc-features { gap: 30px; }
  .vc-feature-desc { font-size: 12px; max-width: 170px; }
  .vc-feature-icon { font-size: 32px; }
}

/* Tablet o pantalla más cuadrada (aspect ratio < 4/3): ocultar elementos laterales */
@media (max-width: 1024px), (max-aspect-ratio: 4/3) {
  .vc-left-side, .vc-right-side { display: none; }
  .vc-wrap { padding: 30px 20px 220px; }
  .vc-features {
    bottom: 90px;
    flex-wrap: wrap;
    gap: 30px;
  }
  .vc-feature {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
  }
  .vc-feature-desc { max-width: 160px; font-size: 12px; }
}

/* Móvil o pantalla vertical (aspect ratio < 3/4): ocultar features y simplificar */
@media (max-width: 768px), (max-aspect-ratio: 3/4) {
  .vc-features { display: none; }
  .vc-wrap { padding: 40px 16px 70px; }
  .vc-card {
    padding: 36px 26px 30px;
    border-radius: 24px;
    /* iOS Safari: quitar backdrop-filter causa flickering combinado con position:fixed.
       Compensamos con fondo más opaco para mantener el efecto visual. */
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(18, 6, 28, 0.94);
  }
  .vc-logo-a, .vc-logo-v { font-size: 84px; -webkit-text-stroke: 4px #000; }
  .vc-logo-palm { font-size: 28px; bottom: 14px; right: 4px; }
  .vc-logo-name { font-size: 32px; }
  .vc-logo-tagline { font-size: 10px; letter-spacing: 3px; gap: 8px; }
  .vc-tagline-line { flex: 0 0 22px; }
  .vc-label { font-size: 11px; letter-spacing: 1.5px; }
  .vc-input { padding: 16px 16px 16px 50px; font-size: 14px; }
  .vc-btn { font-size: 14px; padding: 18px 18px; letter-spacing: 1px; }
  .vc-admin-btn { font-size: 13px; }
  .vc-footer { font-size: 12px; bottom: 16px; }
  .vc-footer-los-santos { font-size: 14px; }
  .vc-footer-divider { display: block; opacity: 0; height: 4px; }
}

/* Móvil muy pequeño */
@media (max-width: 380px) {
  .vc-card { padding: 30px 22px 26px; }
  .vc-logo-a, .vc-logo-v { font-size: 72px; }
  .vc-logo-name { font-size: 28px; }
}
`;

export default function Home() {
  const [step, setStep] = useState<Step>("search");
  const [searchName, setSearchName] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [allClients, setAllClients] = useState<Record<string, ClientData>>({});
  const [adminFilter, setAdminFilter] = useState("");
  const [heartbeats, setHeartbeats] = useState<Record<string, { browserName?: string; lastSeen: number; url?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [rentModalPost, setRentModalPost] = useState<string | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
  const [rentDays, setRentDays] = useState("7");
  const [rentHours, setRentHours] = useState("0");
  const [editConfirmPost, setEditConfirmPost] = useState<string | null>(null);
  const [editFormPost, setEditFormPost] = useState<string | null>(null);
  const [editStep, setEditStep] = useState<"fields" | "captcha">("fields");
  const [editFields, setEditFields] = useState<EditRequestFields>({});
  const [editOriginalFields, setEditOriginalFields] = useState<EditRequestFields>({});
  const [editCaptchaCode, setEditCaptchaCode] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [postIdActualMP, setPostIdActualMP] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("isAdmin") === "true") {
      setIsAdmin(true);
      setStep("admin-list");
      loadAllClients();
      loadHeartbeats();
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
    const interval = setInterval(() => { loadAllClients(); loadHeartbeats(); }, 10000);
    return () => clearInterval(interval);
  }, [step, isAdmin]);

  const loadAllClients = async () => {
    try {
      const res = await fetch(`${FB_URL}/clients.json`);
      const data = await res.json();
      setAllClients(data || {});
    } catch (e) { console.error("Error loading clients", e); }
  };

  const loadHeartbeats = async () => {
    try {
      const res = await fetch(`${FB_URL}/heartbeats.json`);
      const data = await res.json();
      setHeartbeats(data || {});
    } catch (e) { console.error("Error loading heartbeats", e); }
  };

  const searchClient = async () => {
    if (!searchName.trim()) { setError("Ingresa un nombre"); return; }
    setLoading(true); setError("");
    const key = searchName.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    try {
      const res = await fetch(`${FB_URL}/clients/${key}.json`);
      const data = await res.json();
      if (data && data.posts) {
        setClientKey(key); setClientData(data); setStep("cards");
      } else { setError("No encontramos publicaciones para este cliente"); }
    } catch (e) { setError("Error de conexión"); }
    setLoading(false);
  };

  const selectClient = (key: string, data: ClientData) => {
    setClientKey(key); setClientData(data); setStep("cards");
  };

  const togglePostStatus = async (postId: string, currentStatus: string) => {
    if (!clientData) return;
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/status.json`, {
      method: "PUT", body: JSON.stringify(newStatus),
    });
    setClientData({ ...clientData, posts: { ...clientData.posts, [postId]: { ...clientData.posts[postId], status: newStatus as "active" | "paused" } } });
  };

  const solicitarEliminarPost = async (postId: string) => {
    if (!clientData) return;
    try {
      const cliente = clientKey;
      await fetch(`${FB_URL}/postsEliminados/${postId}.json`, { method: "PUT", body: JSON.stringify({ cliente, eliminadoAt: Date.now(), eliminadoPor: "admin" }) });
      await fetch(`${FB_URL}/clients/${cliente}/posts/${postId}.json`, { method: "DELETE" });
      await fetch(`${FB_URL}/postsIndex/${postId}.json`, { method: "DELETE" });
      const nuevoPosts = { ...clientData.posts };
      delete nuevoPosts[postId];
      setClientData({ ...clientData, posts: nuevoPosts });
      setDeletePostId(null); setDeleteConfirmStep(0);
    } catch (e) { alert("Error al eliminar el post."); console.error(e); }
  };

  const cancelarEliminacion = () => { setDeletePostId(null); setDeleteConfirmStep(0); };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem("isAdmin", "true");
      setShowAdminLogin(false); setAdminPass(""); setAdminError("");
      setStep("admin-list"); loadAllClients();
    } else { setAdminError("Contraseña incorrecta"); }
  };

  const logoutAdmin = () => {
    setIsAdmin(false); localStorage.removeItem("isAdmin");
    setStep("search"); setClientData(null); setClientKey("");
  };

  const verAnuncio = (postId: string) => {
    window.open(`https://megapersonals.eu/public/escort_post_detail/${postId}`, "_blank");
  };

  const renovarWhatsApp = (postId: string) => {
    const mensaje = `Hola Angel, quiero renovar la renta del post: #${postId}`;
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  const renovarRenta = async (postId: string) => {
    if (!clientData) return;
    const post = clientData.posts[postId];
    const SEMANA = 7 * 24 * 60 * 60 * 1000;
    const base = post.rentExpiresAt || Date.now();
    const newExpiry = base + SEMANA;
    const reactivar = newExpiry > Date.now() && post.rentPaused;
    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    if (reactivar) { updates.status = "active"; updates.rentPaused = false; }
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}.json`, { method: "PATCH", body: JSON.stringify(updates) });
    setClientData({ ...clientData, posts: { ...clientData.posts, [postId]: { ...post, ...updates } } });
  };

  const abrirModalRenta = (postId: string) => { setRentModalPost(postId); setRentDays("7"); setRentHours("0"); };

  const guardarRenta = async () => {
    if (!rentModalPost || !clientData) return;
    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;
    if (days === 0 && hours === 0) { alert("⚠️ Ingresa al menos 1 día o 1 hora"); return; }
    const newExpiry = Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;
    const post = clientData.posts[rentModalPost];
    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    if (post.rentPaused) { updates.status = "active"; updates.rentPaused = false; }
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${rentModalPost}.json`, { method: "PATCH", body: JSON.stringify(updates) });
    setClientData({ ...clientData, posts: { ...clientData.posts, [rentModalPost]: { ...post, ...updates } } });
    setRentModalPost(null);
  };

  const quitarRenta = async (postId: string) => {
    if (!clientData) return;
    if (!confirm("¿Quitar la renta de este post?")) return;
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/rentExpiresAt.json`, { method: "PUT", body: JSON.stringify(null) });
    setClientData({ ...clientData, posts: { ...clientData.posts, [postId]: { ...clientData.posts[postId], rentExpiresAt: null } } });
  };

  const hayEdicionActiva = (): string | null => {
    if (!clientData) return null;
    for (const [pid, post] of Object.entries(clientData.posts)) {
      const s = post.editRequest?.status;
      if (s === "captcha_pendiente" || s === "captcha_listo" || s === "listo_para_publicar") return pid;
    }
    return null;
  };

  const ultimoBorradoRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!clientData) return;
    Object.entries(clientData.posts).forEach(async ([postId, post]) => {
      const er = post.editRequest;
      if (!er) return;
      const s = er.status;
      const finishedAt = er.appliedAt || er.failedAt;
      if (!finishedAt || (s !== "aplicada" && s !== "fallida")) return;
      if (now - finishedAt <= 5000) return;
      const clave = `${postId}:${finishedAt}`;
      const ultimoIntento = ultimoBorradoRef.current.get(clave) || 0;
      if (now - ultimoIntento < 3000) return;
      ultimoBorradoRef.current.set(clave, now);
      setClientData((prev) => {
        if (!prev || !prev.posts[postId]) return prev;
        const existing = prev.posts[postId].editRequest;
        if (!existing) return prev;
        const existingFinish = existing.appliedAt || existing.failedAt;
        if (existingFinish !== finishedAt) return prev;
        const newPost = { ...prev.posts[postId] };
        delete newPost.editRequest;
        return { ...prev, posts: { ...prev.posts, [postId]: newPost } };
      });
      await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, { method: "DELETE" });
    });
  }, [now, clientData, clientKey]);

  const iniciarEdicion = (postId: string) => {
    const existente = hayEdicionActiva();
    if (existente && existente !== postId) {
      alert(`⚠️ Ya tienes una edición en curso en otro post (#${existente}). Termina o cancela esa primero.`);
      return;
    }
    setEditConfirmPost(postId);
  };

  const confirmarEdicion = async () => {
    if (!editConfirmPost || !clientData) return;
    const editRequest: EditRequest = { status: "captcha_pendiente", requestedAt: Date.now() };
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editConfirmPost}/editRequest.json`, { method: "PUT", body: JSON.stringify(editRequest) });
    setClientData({ ...clientData, posts: { ...clientData.posts, [editConfirmPost]: { ...clientData.posts[editConfirmPost], editRequest } } });
    setEditConfirmPost(null);
  };

  const abrirFormularioEdicion = (postId: string) => {
    if (!clientData) return;
    const post = clientData.posts[postId];
    if (!post.editRequest || post.editRequest.status !== "captcha_listo") return;
    const current: EditRequestFields = {
      name: post.editRequest.currentValues?.name || "",
      age: post.editRequest.currentValues?.age || "",
      title: post.editRequest.currentValues?.title || "",
      body: post.editRequest.currentValues?.body || "",
      cityName: post.editRequest.currentValues?.cityName || "",
      location: post.editRequest.currentValues?.location || "",
    };
    setEditFields(current); setEditOriginalFields(current);
    setEditCaptchaCode(""); setEditStep("fields"); setEditFormPost(postId);
  };

  const validarCampos = (): string | null => {
    if (!editFields.title?.trim()) return "El titular (Headline) no puede estar vacío";
    if (!editFields.body?.trim()) return "La descripción (Body) no puede estar vacía";
    return null;
  };

  const irAlCaptcha = () => {
    const err = validarCampos();
    if (err) { alert("⚠️ " + err); return; }
    setEditStep("captcha");
  };

  const volverAFields = () => setEditStep("fields");

  const enviarEdicion = async () => {
    if (!editFormPost || !clientData) return;
    if (!editCaptchaCode.trim()) { alert("⚠️ Escribe el código del captcha"); return; }
    const errCampos = validarCampos();
    if (errCampos) { alert("⚠️ " + errCampos); setEditStep("fields"); return; }
    const cambios: EditRequestFields = {};
    type StringKey = "name" | "age" | "title" | "body" | "cityName" | "location";
    const camposString: StringKey[] = ["name", "age", "title", "body", "cityName", "location"];
    for (const key of camposString) {
      const valNuevo = String(editFields[key] || "").trim();
      const valOriginal = String(editOriginalFields[key] || "").trim();
      if (valNuevo !== valOriginal) cambios[key] = valNuevo;
    }
    if (cambios.cityName !== undefined && editFields.cityId !== undefined) cambios.cityId = editFields.cityId;
    setEditSubmitting(true);
    const updates: Partial<EditRequest> = { status: "listo_para_publicar", captchaCode: editCaptchaCode.trim(), fields: cambios };
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editFormPost}/editRequest.json`, { method: "PATCH", body: JSON.stringify(updates) });
    const post = clientData.posts[editFormPost];
    setClientData({ ...clientData, posts: { ...clientData.posts, [editFormPost]: { ...post, editRequest: { ...(post.editRequest as EditRequest), ...updates } as EditRequest } } });
    setEditSubmitting(false); setEditFormPost(null);
  };

  const cancelarEdicion = async (postId: string) => {
    if (!confirm("¿Cancelar la edición de este post?")) return;
    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, { method: "DELETE" });
    if (clientData) {
      const newPosts = { ...clientData.posts };
      if (newPosts[postId]) {
        const { editRequest, ...rest } = newPosts[postId];
        newPosts[postId] = rest;
      }
      setClientData({ ...clientData, posts: newPosts });
    }
    setEditFormPost(null);
  };

  const seleccionarCiudad = (ciudad: { cid: number; name: string }, abrev: string) => {
    setEditFields({ ...editFields, cityName: `${ciudad.name}, ${abrev}`, cityId: ciudad.cid });
    setShowLocationPicker(false); setExpandedState(null);
  };

  const abrirSelectorUbicacion = () => { setExpandedState(null); setShowLocationPicker(true); };

  const formatTime = (timestamp: number) => {
    const diff = timestamp - now;
    if (diff <= 0) return { mins: "00", secs: "00", total: 0 };
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return { mins: mins.toString().padStart(2, "0"), secs: secs.toString().padStart(2, "0"), total: totalSecs };
  };

  const getProgress = (post: PostData) => {
    const start = post.lastBumpAt || post.addedAt;
    const total = post.nextBumpAt - start;
    const elapsed = now - start;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const getRentInfo = (post: PostData) => {
    if (!post.rentExpiresAt) return { status: "none" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays: 0, debtHours: 0 };
    const diff = post.rentExpiresAt - now;
    if (diff <= 0) {
      const debtMs = now - post.rentExpiresAt;
      const debtTotalHours = Math.floor(debtMs / (60 * 60 * 1000));
      const debtDays = Math.floor(debtTotalHours / 24);
      const debtHours = debtTotalHours % 24;
      return { status: "expired" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays, debtHours };
    }
    const totalHours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const isWarning = totalHours <= 24;
    return { status: "active" as const, days, hours, isWarning, totalHours, debtDays: 0, debtHours: 0 };
  };

  const goBack = () => {
    if (isAdmin) { setStep("admin-list"); setClientData(null); setClientKey(""); }
    else { setStep("search"); setSearchName(""); setClientData(null); setClientKey(""); setError(""); }
  };

  const getGlobalStats = () => {
    let totalPosts = 0, activePosts = 0, pausedPosts = 0;
    const totalClients = Object.keys(allClients).length;
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

  const filteredClients = Object.entries(allClients)
    .filter(([key, data]) => {
      if (!adminFilter) return true;
      const query = adminFilter.toLowerCase();
      return data.displayName?.toLowerCase().includes(query) || key.includes(query);
    })
    .sort(([, a], [, b]) => {
      const score = (data: ClientData) => {
        if (data.banned) return 0;
        const posts = Object.values(data.posts || {});
        if (!posts.length) return 6;
        const fechas = posts.map((p) => p.rentExpiresAt).filter((x): x is number => typeof x === "number");
        if (!fechas.length) return 5;
        const minFecha = Math.min(...fechas);
        const diff = minFecha - now;
        if (diff <= 0) return 1;
        if (diff <= 24 * 3600 * 1000) return 2;
        if (diff <= 7 * 24 * 3600 * 1000) return 3;
        return 4;
      };
      const sA = score(a); const sB = score(b);
      if (sA !== sB) return sA - sB;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

  const baneosEstaSemana = Object.values(allClients).filter((c) => c.banned && c.bannedAt && now - c.bannedAt <= 7 * 24 * 3600 * 1000).length;

  return (
    <>
      <EstilosGlobales />
      <EstilosVistaClienteMP />

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

      {/* ===== LOGIN VICE CITY — FUERA del wrapper .page (position fixed cubre toda la pantalla) ===== */}
      {step === "search" && (
        <>
          <style dangerouslySetInnerHTML={{ __html: VICE_CITY_STYLES }} />
          <div className="vc-page-search">
            {/* Imágenes de fondo (en <img> en lugar de background-image porque iOS Safari tiene bugs con position:fixed + background-image) */}
            <img src="/vice-bg.png" alt="" className="vc-bg-img vc-bg-desktop" />
            <img src="/vice-bg-mobile.png" alt="" className="vc-bg-img vc-bg-mobile" />

            {/* Lado izquierdo - logo grande + cartel + descripción */}
            <div className="vc-left-side">
              <img src="/angel-vercel-logo.png" alt="AngelVercel" className="vc-logo-big" />
              <img src="/megapersonals-neon.png" alt="MegaPersonals" className="vc-megapersonals-sign" />
              <p className="vc-description">
                El panel premium de control para gestionar, optimizar y dominar tus campañas publicitarias.
              </p>
            </div>

            {/* Lado derecho - sello Los Santos */}
            <div className="vc-right-side">
              <img src="/los-santos.png" alt="Los Santos" className="vc-los-santos-sign" />
            </div>

            {/* Tarjeta central */}
            <div className="vc-wrap">
              <div className="vc-card">
                {/* Logo construido en HTML/CSS para que sea idéntico al render */}
                <div className="vc-logo-block">
                  <div className="vc-logo-av-wrap">
                    <span className="vc-logo-a">A</span>
                    <span className="vc-logo-v">V</span>
                    <span className="vc-logo-palm">🌴</span>
                  </div>
                  <div className="vc-logo-name">
                    <span className="vc-name-angel">Angel</span><span className="vc-name-vercel">Vercel</span>
                  </div>
                  <div className="vc-logo-tagline">
                    <span className="vc-tagline-line"></span>
                    Panel premium de control
                    <span className="vc-tagline-line"></span>
                  </div>
                </div>

                <label className="vc-label">
                  <span className="vc-label-palm">🌴</span>
                  Nombre del cliente
                </label>

                <div className="vc-input-wrap">
                  <span className="vc-input-icon">👤</span>
                  <input
                    type="text"
                    className="vc-input"
                    placeholder="Ej: Carla, María, Sofía..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchClient()}
                    autoFocus
                  />
                </div>

                {error && <div className="vc-error">{error}</div>}

                <button className="vc-btn" onClick={searchClient} disabled={loading}>
                  <span className="vc-btn-icon">🌴</span>
                  {loading ? "Buscando..." : "Acceder al panel"}
                  <span className="vc-btn-arrow">→</span>
                </button>

                <div className="vc-divider"></div>

                <button className="vc-admin-btn" onClick={() => setShowAdminLogin(true)}>
                  🔒 <span className="vc-admin-btn-text">Acceso administrador</span>
                </button>
              </div>
            </div>

            {/* Features 3 cards */}
            <div className="vc-features">
              <div className="vc-feature">
                <div className="vc-feature-icon">💎</div>
                <div className="vc-feature-text">
                  <div className="vc-feature-title">PREMIUM</div>
                  <div className="vc-feature-desc">Funciones exclusivas para resultados reales.</div>
                </div>
              </div>
              <div className="vc-feature">
                <div className="vc-feature-icon">📈</div>
                <div className="vc-feature-text">
                  <div className="vc-feature-title">EFICIENTE</div>
                  <div className="vc-feature-desc">Optimiza tus campañas y maximiza tu ROI.</div>
                </div>
              </div>
              <div className="vc-feature">
                <div className="vc-feature-icon">🛡️</div>
                <div className="vc-feature-text">
                  <div className="vc-feature-title">SEGURO</div>
                  <div className="vc-feature-desc">Tus datos y campañas siempre protegidos.</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="vc-footer">
              © 2024 AngelVercel. Todos los derechos reservados.
              <span className="vc-footer-divider">|</span>
              <span className="vc-footer-los-santos">Los Santos, SA</span>
            </div>

            {/* Modal admin login (montado dentro del fixed para que se vea por encima) */}
            {showAdminLogin && (
              <div className="modal-overlay" onClick={() => setShowAdminLogin(false)} style={{ zIndex: 10000 }}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-title">🔐 Acceso Administrador</div>
                  <div className="modal-subtitle">Ingresa la contraseña de administrador</div>
                  <div style={{ marginBottom: 20 }}>
                    <input type="password" className="search-input" placeholder="Contraseña" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleAdminLogin()} autoFocus />
                  </div>
                  {adminError && <div className="error-msg">{adminError}</div>}
                  <div className="modal-actions">
                    <button className="modal-btn modal-btn-secondary" onClick={() => setShowAdminLogin(false)}>Cancelar</button>
                    <button className="modal-btn modal-btn-primary" onClick={handleAdminLogin}>Entrar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== RESTO DEL SISTEMA — sólo se muestra cuando step !== "search" ===== */}
      {step !== "search" && (
        <div className="page">
          <div className="content">
            {step === "admin-list" && isAdmin && (
              <div>
                <div className="dash-header">
                  <div className="dash-greeting">
                    <h1>Panel <span>Administrador</span></h1>
                    <p>Lista completa de clientes<span className="admin-badge">⚡ ADMIN</span></p>
                  </div>
                  <div className="header-actions">
                    <button className="btn-secondary" onClick={loadAllClients}>🔄 Actualizar</button>
                    <button className="btn-back" onClick={logoutAdmin}>🔓 Salir</button>
                  </div>
                </div>

                {(() => {
                  const stats = getGlobalStats();
                  return (
                    <div className="stats-row">
                      <div className="stat-pill clients"><div className="stat-pill-icon">👥</div><div className="stat-pill-info"><div className="stat-pill-label">Clientes</div><div className="stat-pill-value">{stats.totalClients}</div></div></div>
                      <div className="stat-pill total"><div className="stat-pill-icon">📊</div><div className="stat-pill-info"><div className="stat-pill-label">Publicaciones</div><div className="stat-pill-value">{stats.totalPosts}</div></div></div>
                      <div className="stat-pill active"><div className="stat-pill-icon">✨</div><div className="stat-pill-info"><div className="stat-pill-label">Activas</div><div className="stat-pill-value">{stats.activePosts}</div></div></div>
                      <div className="stat-pill paused"><div className="stat-pill-icon">⏸️</div><div className="stat-pill-info"><div className="stat-pill-label">Pausadas</div><div className="stat-pill-value">{stats.pausedPosts}</div></div></div>
                      <div className={`stat-pill banned ${baneosEstaSemana > 0 ? "alert" : ""}`}><div className="stat-pill-icon">🚫</div><div className="stat-pill-info"><div className="stat-pill-label">Baneos esta semana</div><div className="stat-pill-value">{baneosEstaSemana}</div></div></div>
                    </div>
                  );
                })()}

                {Object.keys(heartbeats).length > 0 && (
                  <div className="chrome-monitor">
                    <div className="chrome-monitor-header">
                      <h2>🖥 Estado de los Chromes</h2>
                      <span className="chrome-monitor-count">{Object.keys(heartbeats).length} conectados</span>
                    </div>
                    <div className="chrome-monitor-grid">
                      {Object.entries(heartbeats)
                        .filter(([, info]) => { if (!info || !info.lastSeen) return false; return now - info.lastSeen < 24 * 60 * 60 * 1000; })
                        .sort(([, a], [, b]) => (b.lastSeen || 0) - (a.lastSeen || 0))
                        .map(([botId, info]) => {
                          const silencio = now - (info.lastSeen || 0);
                          const minutos = Math.floor(silencio / 60000);
                          const segundos = Math.floor((silencio % 60000) / 1000);
                          const estado = silencio < 2 * 60 * 1000 ? "ok" : silencio < 5 * 60 * 1000 ? "warn" : "down";
                          const tiempoLabel = minutos < 1 ? `${segundos}s` : minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
                          const browserName = info.browserName || `(${botId.substring(0, 12)})`;
                          return (
                            <div key={botId} className={`chrome-monitor-card ${estado}`}>
                              <div className="chrome-monitor-status-dot" />
                              <div className="chrome-monitor-card-info">
                                <div className="chrome-monitor-name">{browserName}</div>
                                <div className="chrome-monitor-time">
                                  {estado === "ok" && `Activo · ${tiempoLabel}`}
                                  {estado === "warn" && `⚠️ Lento · ${tiempoLabel}`}
                                  {estado === "down" && `🚨 Caído · ${tiempoLabel}`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="admin-filter-bar">
                  <input type="text" placeholder="🔍 Filtrar clientes por nombre..." value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} />
                </div>

                <div className="clients-grid">
                  {filteredClients.length === 0 ? (
                    <div className="clients-empty">
                      <div style={{ fontSize: 56, marginBottom: 20 }}>📭</div>
                      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: "var(--white)" }}>
                        {Object.keys(allClients).length === 0 ? "Sin clientes" : "Sin resultados"}
                      </div>
                      <div style={{ fontSize: 14 }}>
                        {Object.keys(allClients).length === 0 ? "Aún no hay clientes registrados" : "Intenta con otro nombre"}
                      </div>
                    </div>
                  ) : (
                    filteredClients.map(([key, data]) => {
                      const posts = data.posts ? Object.values(data.posts) : [];
                      const total = posts.length;
                      const active = posts.filter((p) => p.status === "active").length;
                      const paused = posts.filter((p) => p.status === "paused").length;
                      const initial = (data.displayName || key).charAt(0).toUpperCase();
                      const navegadores = Array.from(new Set(posts.map((p) => p.browserName).filter((b): b is string => !!b)));
                      const postsConRenta = posts.filter((p) => p.rentExpiresAt);
                      let rentSummary: { type: "expired" | "warning" | "active" | "none"; text: string; count?: number } = { type: "none", text: "Sin renta" };
                      const postsBaneados = posts.filter((p) => p.banned);
                      const tieneBaneados = postsBaneados.length > 0;
                      let tiempoBaneadoTexto = "";
                      if (tieneBaneados) {
                        const conRentaRestante = postsBaneados.filter((p) => typeof p.rentRemainingMs === "number");
                        if (conRentaRestante.length > 0) {
                          const minMs = Math.min(...conRentaRestante.map((p) => p.rentRemainingMs!));
                          const totalHrs = Math.floor(minMs / (60 * 60 * 1000));
                          const days = Math.floor(totalHrs / 24);
                          const hours = totalHrs % 24;
                          tiempoBaneadoTexto = days > 0 ? `${days}d ${hours}h restantes` : `${hours}h restantes`;
                        } else { tiempoBaneadoTexto = "sin renta configurada"; }
                      }
                      if (postsConRenta.length > 0) {
                        const expired = postsConRenta.filter((p) => p.rentExpiresAt! <= now);
                        const activeRent = postsConRenta.filter((p) => p.rentExpiresAt! > now);
                        const warning = activeRent.filter((p) => p.rentExpiresAt! - now <= 24 * 60 * 60 * 1000);
                        if (expired.length > 0) {
                          const maxDebt = Math.max(...expired.map((p) => now - p.rentExpiresAt!));
                          const debtDays = Math.floor(maxDebt / (24 * 60 * 60 * 1000));
                          const debtHours = Math.floor((maxDebt % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                          rentSummary = { type: "expired", text: `${expired.length} en deuda · ${debtDays}d ${debtHours}h`, count: expired.length };
                        } else if (warning.length > 0) {
                          const minTime = Math.min(...warning.map((p) => p.rentExpiresAt! - now));
                          const h = Math.floor(minTime / (60 * 60 * 1000));
                          const m = Math.floor((minTime % (60 * 60 * 1000)) / (60 * 1000));
                          rentSummary = { type: "warning", text: `${warning.length} por vencer · ${h}h ${m}m`, count: warning.length };
                        } else if (activeRent.length > 0) {
                          const minTime = Math.min(...activeRent.map((p) => p.rentExpiresAt! - now));
                          const totalHours = Math.floor(minTime / (60 * 60 * 1000));
                          const days = Math.floor(totalHours / 24);
                          const hours = totalHours % 24;
                          rentSummary = { type: "active", text: `Próximo: ${days}d ${hours}h` };
                        }
                      }
                      return (
                        <div key={key} className="client-card" onClick={() => selectClient(key, data)}>
                          <div className="client-card-header">
                            <div className="client-avatar">{initial}</div>
                            <div className="client-info">
                              <div className="client-name">{data.displayName || key}</div>
                              <div className="client-handle">@{key}</div>
                              {navegadores.length > 0 && <div className="client-browsers" title={`Navegadores: ${navegadores.join(", ")}`}>🖥 {navegadores.join(", ")}</div>}
                            </div>
                          </div>
                          <div className="client-stats">
                            <div className="client-stat total"><div className="client-stat-value">{total}</div><div className="client-stat-label">Total</div></div>
                            <div className="client-stat active"><div className="client-stat-value">{active}</div><div className="client-stat-label">Activas</div></div>
                            <div className="client-stat paused"><div className="client-stat-value">{paused}</div><div className="client-stat-label">Pausadas</div></div>
                          </div>
                          {tieneBaneados && (
                            <div className="client-banned-pill">
                              <span className="client-banned-icon">🚫</span>
                              <div className="client-banned-info">
                                <div className="client-banned-title">{postsBaneados.length} POST{postsBaneados.length > 1 ? "S" : ""} BLOQUEADO{postsBaneados.length > 1 ? "S" : ""}</div>
                                <div className="client-banned-sub">Renta pausada · {tiempoBaneadoTexto}</div>
                              </div>
                            </div>
                          )}
                          <div className={`client-rent ${rentSummary.type}`}>
                            <span className="client-rent-icon">{rentSummary.type === "expired" ? "🔴" : rentSummary.type === "warning" ? "🟡" : rentSummary.type === "active" ? "🟢" : "⚪"}</span>
                            <span className="client-rent-text">{rentSummary.text}</span>
                          </div>
                          <button className="client-action">Abrir panel →</button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {step === "cards" && clientData && clientData.banned && !isAdmin && (
              <div className="banned-screen">
                <div className="banned-card">
                  <div className="banned-icon">🚫</div>
                  <h1 className="banned-title">CUENTA BLOQUEADA</h1>
                  <p className="banned-subtitle">Tu cuenta de MegaPersonals fue bloqueada por la plataforma.</p>
                  <div className="banned-info">
                    <p>Esto puede deberse a actividad detectada como inusual o a una violación de las políticas de MegaPersonals. Tu publicación NO está activa en este momento.</p>
                    {clientData.bannedAt && <p className="banned-date">Detectado: {new Date(clientData.bannedAt).toLocaleString()}</p>}
                  </div>
                  <a className="banned-whatsapp" href={`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(`Hola Angel, mi cuenta (${clientData.displayName}) aparece como BLOQUEADA. ¿Qué puedo hacer?`)}`} target="_blank" rel="noopener noreferrer">
                    <span style={{ fontSize: 22 }}>💬</span> Contactar con Angel
                  </a>
                  <button className="banned-back" onClick={goBack}>← Volver al inicio</button>
                </div>
              </div>
            )}

            {step === "cards" && clientData && !(clientData.banned && !isAdmin) && !isAdmin && (() => {
              const postIdsOrdenados = Object.entries(clientData.posts).sort(([, a], [, b]) => (a.addedAt || 0) - (b.addedAt || 0)).map(([id]) => id);
              const postActual = postIdActualMP && clientData.posts[postIdActualMP] ? postIdActualMP : postIdsOrdenados[0];
              if (!postActual) {
                return (
                  <div style={{ padding: 60, textAlign: "center", color: "#555" }}>
                    <h2>No tienes publicaciones registradas</h2>
                    <p>Contacta con Angel para registrar tu primer anuncio.</p>
                    <button onClick={goBack} style={{ marginTop: 20, padding: "10px 20px" }}>← Volver</button>
                  </div>
                );
              }
              return (
                <VistaClienteMP
                  clientData={clientData}
                  clientKey={clientKey}
                  postIdActual={postActual}
                  postIdsOrdenados={postIdsOrdenados}
                  now={now}
                  isAdmin={isAdmin}
                  onCambiarPost={(newId) => setPostIdActualMP(newId)}
                  onEditClick={(pid) => {
                    const p = clientData.posts[pid];
                    const er = p?.editRequest;
                    if (!er || er.status === "aplicada" || er.status === "fallida") iniciarEdicion(pid);
                    else if (er.status === "captcha_listo") abrirFormularioEdicion(pid);
                  }}
                  onPausarToggle={(pid) => {
                    const p = clientData.posts[pid];
                    if (p) togglePostStatus(pid, p.status);
                  }}
                  onAbrirConfigRenta={(pid) => abrirModalRenta(pid)}
                  onLogout={goBack}
                />
              );
            })()}

            {step === "cards" && clientData && !(clientData.banned && !isAdmin) && isAdmin && (
              <div>
                <div className="dash-header">
                  <div className="dash-greeting">
                    <h1>{isAdmin ? "Panel de" : "Hola,"} <span>{clientData.displayName}</span></h1>
                    <p>Control de publicaciones{isAdmin && <span className="admin-badge">⚡ ADMIN</span>}</p>
                  </div>
                  <div className="header-actions">
                    <button className="btn-back" onClick={goBack}>← {isAdmin ? "Volver a lista" : "Cerrar sesión"}</button>
                  </div>
                </div>

                <div className="stats-row">
                  <div className="stat-pill total"><div className="stat-pill-icon">📊</div><div className="stat-pill-info"><div className="stat-pill-label">Total</div><div className="stat-pill-value">{Object.keys(clientData.posts || {}).length}</div></div></div>
                  <div className="stat-pill active"><div className="stat-pill-icon">✨</div><div className="stat-pill-info"><div className="stat-pill-label">Activas</div><div className="stat-pill-value">{Object.values(clientData.posts || {}).filter((p) => p.status === "active").length}</div></div></div>
                  <div className="stat-pill paused"><div className="stat-pill-icon">⏸️</div><div className="stat-pill-info"><div className="stat-pill-label">Pausadas</div><div className="stat-pill-value">{Object.values(clientData.posts || {}).filter((p) => p.status === "paused").length}</div></div></div>
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
                        <div key={postId} className={`post-card ${isPaused ? "paused" : "active"} ${rent.isWarning || rent.status === "expired" ? "warning" : ""}`}>
                          <div className="pc-mesh">
                            <div className="pc-mesh-content">
                              <div className="pc-id-block">
                                <div className="pc-id-tiny">Publicación</div>
                                <div className="pc-id-big"><span className="hash">#</span>{postId}</div>
                                {post.browserName && <div className="pc-browser">🖥 {post.browserName}</div>}
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
                                <circle className="pc-ring-progress" cx="100" cy="100" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
                              </svg>
                              <div className="pc-ring-center">
                                {isPaused ? (
                                  <><div className="pc-time-value">⏸</div><div className="pc-time-label">Pausado</div></>
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
                          {(rent.isWarning || rent.status === "expired") && (
                            <div className="pc-warning">
                              <div className="pc-warning-header">
                                <span className="pc-warning-icon">⚠️</span>
                                <span className="pc-warning-title">{rent.status === "expired" ? "Renta vencida" : "Advertencia"}</span>
                              </div>
                              <div className="pc-warning-text">
                                {rent.status === "expired" ? (
                                  <>Este post está <strong>pausado</strong> porque la renta llegó a 0. El tiempo sigue corriendo como <strong>deuda ({rent.debtDays}d {rent.debtHours}h)</strong>. Al renovar se descontará ese tiempo. Contacta con <strong>Angel</strong> por WhatsApp.</>
                                ) : (
                                  <>Este post se <strong>pausará automáticamente</strong> cuando el tiempo de renta llegue a 0, y el tiempo seguirá corriendo como <strong>deuda</strong>. Para reactivarlo, contacta con <strong>Angel</strong> por WhatsApp y renueva.</>
                                )}
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
                              <div className="pc-rent-label">🎫 {rent.status === "active" ? "Renta activa" : rent.status === "expired" ? "Renta vencida" : "Sin renta"}</div>
                              <div className="pc-rent-value">
                                {rent.status === "active" ? `${rent.days}d ${rent.hours}h restantes` : rent.status === "expired" ? `En deuda: ${rent.debtDays}d ${rent.debtHours}h` : "No establecida"}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="pc-rent-actions">
                                <button className="rent-btn renew" onClick={() => renovarRenta(postId)} title="Agregar 7 días">+7d</button>
                                <button className="rent-btn" onClick={() => abrirModalRenta(postId)} title="Establecer renta">⚙</button>
                                {rent.status !== "none" && <button className="rent-btn remove" onClick={() => quitarRenta(postId)} title="Quitar renta">✕</button>}
                              </div>
                            )}
                          </div>
                          <div className="pc-meta-grid">
                            <div className="pc-meta-cell">
                              <div className="pc-meta-label">Último bump</div>
                              <div className="pc-meta-value">{post.lastBumpAt ? new Date(post.lastBumpAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                            </div>
                            <div className="pc-meta-cell">
                              <div className="pc-meta-label">Registrado</div>
                              <div className="pc-meta-value">{new Date(post.addedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}</div>
                            </div>
                          </div>
                          <div className="pc-actions">
                            <div className="pc-actions-row">
                              <button className={`action-btn ${isPaused ? "btn-resume" : "btn-pause"}`} onClick={() => togglePostStatus(postId, post.status)}>
                                {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                              </button>
                              <button className="action-btn btn-view" onClick={() => verAnuncio(postId)}>👁 Ver anuncio</button>
                              <button className="action-btn btn-delete-post" onClick={() => { setDeletePostId(postId); setDeleteConfirmStep(0); }} title="Eliminar este post del sistema">🗑 Eliminar</button>
                            </div>
                            {(() => {
                              const er = post.editRequest;
                              if (!er || er.status === "aplicada" || er.status === "fallida") {
                                if (er?.status === "aplicada") return <div className="edit-status applied"><span>✅ Cambios aplicados</span></div>;
                                if (er?.status === "fallida") return (
                                  <div className="edit-status failed">
                                    <span>✗ Edición falló{er.failReason ? `: ${er.failReason}` : ""}</span>
                                    <button className="edit-cancel-btn small" onClick={() => cancelarEdicion(postId)}>Cerrar</button>
                                  </div>
                                );
                                return null;
                              }
                              if (er.status === "captcha_pendiente") return (
                                <div className="edit-status pending">
                                  <div className="edit-status-info">
                                    <span className="edit-status-spinner">🔄</span>
                                    <div>
                                      <div className="edit-status-title">Generando captcha...</div>
                                      <div className="edit-status-sub">Esperando turno del sistema (1-15 min)</div>
                                    </div>
                                  </div>
                                  <button className="edit-cancel-btn" onClick={() => cancelarEdicion(postId)}>Cancelar</button>
                                </div>
                              );
                              if (er.status === "captcha_listo") {
                                const minRestantes = er.expiresAt ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000)) : 0;
                                return (
                                  <div className="edit-status ready">
                                    <div className="edit-status-info">
                                      <span className="edit-status-spinner">📸</span>
                                      <div>
                                        <div className="edit-status-title">Captcha listo</div>
                                        <div className="edit-status-sub">Esperando que el cliente lo resuelva ({minRestantes}min)</div>
                                      </div>
                                    </div>
                                    <button className="edit-cancel-btn small" onClick={() => cancelarEdicion(postId)}>Cancelar</button>
                                  </div>
                                );
                              }
                              if (er.status === "listo_para_publicar") {
                                const msHastaBump = Math.max(0, post.nextBumpAt - now);
                                const minHastaBump = Math.floor(msHastaBump / 60000);
                                const segHastaBump = Math.floor((msHastaBump % 60000) / 1000);
                                if (msHastaBump <= 0) return <div className="edit-status publishing"><span className="edit-status-spinner">⏳</span><span>Publicando cambios...</span></div>;
                                return (
                                  <div className="edit-status waiting-bump">
                                    <span className="edit-status-spinner">⏳</span>
                                    <span>Haciendo cambios — {minHastaBump > 0 ? `${minHastaBump} min ${segHastaBump.toString().padStart(2, "0")}s` : `${segHastaBump}s`} restantes</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modales — sólo visibles fuera de la pantalla de login */}
          {deletePostId && (
            <div className="modal-overlay" onClick={cancelarEliminacion}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="modal-title" style={{ color: "#ef4444" }}>⚠️ Eliminar este post</div>
                <div className="modal-subtitle">Post <code style={{ color: "var(--accent)" }}>#{deletePostId}</code></div>
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 16, margin: "16px 0", color: "#fca5a5", fontSize: 13, lineHeight: 1.5 }}>
                  <strong>Esto eliminará el post de:</strong>
                  <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                    <li>MegaPersonals (el bot lo borrará automáticamente)</li>
                    <li>Tu sistema (Firebase + lista del bot)</li>
                  </ul>
                  <p style={{ margin: "12px 0 0", fontWeight: 700 }}>Esta acción NO se puede deshacer.</p>
                </div>
                {deleteConfirmStep === 0 ? (
                  <>
                    <button className="modal-btn modal-btn-danger" onClick={() => setDeleteConfirmStep(1)} style={{ width: "100%" }}>🗑 Continuar</button>
                    <button className="modal-btn modal-btn-cancel" onClick={cancelarEliminacion} style={{ width: "100%", marginTop: 8 }}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "center", marginBottom: 12, color: "#fca5a5", fontSize: 14, fontWeight: 700 }}>¿Estás 100% seguro? Confirma una vez más.</div>
                    <button className="modal-btn modal-btn-danger" onClick={() => solicitarEliminarPost(deletePostId)} style={{ width: "100%" }}>🗑 SÍ, ELIMINAR</button>
                    <button className="modal-btn modal-btn-cancel" onClick={cancelarEliminacion} style={{ width: "100%", marginTop: 8 }}>No, volver atrás</button>
                  </>
                )}
              </div>
            </div>
          )}

          {rentModalPost && (
            <div className="modal-overlay" onClick={() => setRentModalPost(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">🎫 Establecer Renta</div>
                <div className="modal-subtitle">Post <code style={{ color: "var(--accent)" }}>#{rentModalPost}</code> · La renta se calcula desde ahora</div>
                <div className="modal-row">
                  <div className="modal-field"><label>Días</label><input type="number" min="0" max="365" value={rentDays} onChange={(e) => setRentDays(e.target.value)} autoFocus /></div>
                  <div className="modal-field"><label>Horas</label><input type="number" min="0" max="23" value={rentHours} onChange={(e) => setRentHours(e.target.value)} /></div>
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn-secondary" onClick={() => setRentModalPost(null)}>Cancelar</button>
                  <button className="modal-btn modal-btn-primary" onClick={guardarRenta}>Guardar</button>
                </div>
              </div>
            </div>
          )}

          {editConfirmPost && (
            <div className="modal-overlay" onClick={() => setEditConfirmPost(null)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">✏️ Editar publicación</div>
                <div className="modal-subtitle">Vas a editar el post <code style={{ color: "var(--accent)" }}>#{editConfirmPost}</code></div>
                <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 14, padding: 18, marginBottom: 24, fontSize: 13, lineHeight: 1.6, color: "var(--gray-300)" }}>
                  <div style={{ fontWeight: 700, color: "var(--info)", marginBottom: 8 }}>¿Cómo funciona?</div>
                  <div>
                    1. El sistema generará un <strong>captcha de verificación</strong> en su próximo turno (1-15 min).<br/>
                    2. Te avisaremos aquí cuando esté listo, y verás un botón <strong>"Editar ahora"</strong>.<br/>
                    3. Al abrir, podrás resolver el captcha y editar todos los campos (menos teléfono).<br/>
                    4. Tendrás <strong>15 minutos</strong> para enviar antes de que caduque.
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn-secondary" onClick={() => setEditConfirmPost(null)}>Cancelar</button>
                  <button className="modal-btn modal-btn-primary" onClick={confirmarEdicion}>Iniciar edición</button>
                </div>
              </div>
            </div>
          )}

          {editFormPost && clientData && clientData.posts[editFormPost]?.editRequest && (
            <div className="mp-overlay" onClick={() => !editSubmitting && setEditFormPost(null)}>
              <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const er = clientData.posts[editFormPost].editRequest as EditRequest;
                  const minRest = er.expiresAt ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000)) : 0;
                  const secRest = er.expiresAt ? Math.max(0, Math.floor((er.expiresAt - now) / 1000) % 60) : 0;
                  return (
                    <>
                      <button className="mp-close-x" onClick={() => !editSubmitting && setEditFormPost(null)} title="Cerrar">
                        <img src="/megapersonals-img/close_bump_to_top_modal.png" alt="Cerrar" />
                      </button>
                      <div className="mp-timer">⏱ {minRest}:{secRest.toString().padStart(2, "0")}</div>
                      <div className="mp-topborder"></div>
                      <div className="mp-leftborder"></div>
                      <div className="mp-rightborder"></div>
                      <div className="mp-bottomborder"></div>
                      <div className="mp-header-logo">
                        <img src="/megapersonals-img/megapersonalsPageHeader2.png" alt="MegaPersonals" />
                      </div>
                      {editStep === "fields" && (
                        <div className="mp-stage">
                          <div className="mp-banner"><img src="/megapersonals-img/writepost1_devilgirl.png" alt="Create Post" /></div>
                          <form className="mp-form" onSubmit={(e) => e.preventDefault()}>
                            <div className="mp-row mp-row-2">
                              <div className="mp-field"><label className="mp-label">I AM:</label><select className="mp-input mp-disabled" disabled value="1"><option value="1">A woman</option></select></div>
                              <div className="mp-field"><label className="mp-label">I SEE:</label><input className="mp-input mp-disabled" type="text" disabled value="Men" readOnly /></div>
                            </div>
                            <div className="mp-row mp-row-2">
                              <div className="mp-field"><label className="mp-label">Name/Alias:</label><input className="mp-input" type="text" value={editFields.name || ""} onChange={(e) => setEditFields({ ...editFields, name: e.target.value })} /></div>
                              <div className="mp-field">
                                <label className="mp-label">Age:</label>
                                <select className="mp-input" value={editFields.age || "25"} onChange={(e) => setEditFields({ ...editFields, age: e.target.value })}>
                                  {Array.from({ length: 82 }, (_, i) => i + 18).map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="mp-row"><div className="mp-field mp-field-full"><label className="mp-label">Headline: *</label><input className="mp-input" type="text" value={editFields.title || ""} onChange={(e) => setEditFields({ ...editFields, title: e.target.value })} /></div></div>
                            <div className="mp-row"><div className="mp-field mp-field-full"><label className="mp-label">Body: *</label><textarea className="mp-input mp-textarea" value={editFields.body || ""} onChange={(e) => setEditFields({ ...editFields, body: e.target.value })} /></div></div>
                            <div className="mp-row mp-row-2">
                              <div className="mp-field"><label className="mp-label">City:</label><button type="button" className="mp-input mp-city-btn" onClick={abrirSelectorUbicacion}>{editFields.cityName || "Click to select"}</button></div>
                              <div className="mp-field">
                                <label className="mp-label">Phone:</label>
                                <div className="mp-phone-wrapper">
                                  <input className="mp-input mp-disabled mp-phone-code" type="text" disabled value="+1" readOnly />
                                  <input className="mp-input mp-disabled mp-phone-number" type="text" disabled value={er.currentValues?.name ? "(no editable)" : ""} readOnly />
                                </div>
                              </div>
                            </div>
                            <div className="mp-row"><div className="mp-field mp-field-full"><label className="mp-label">Location/Area:</label><input className="mp-input" type="text" value={editFields.location || ""} onChange={(e) => setEditFields({ ...editFields, location: e.target.value })} /></div></div>
                            <div className="mp-button-row"><button type="button" className="mp-btn-next" onClick={irAlCaptcha} aria-label="Next"><span style={{ visibility: "hidden" }}>Next</span></button></div>
                            <div className="mp-cancel-row"><button type="button" className="mp-cancel" onClick={() => cancelarEdicion(editFormPost)} disabled={editSubmitting}>Cancelar edición</button></div>
                          </form>
                        </div>
                      )}
                      {editStep === "captcha" && (
                        <div className="mp-stage">
                          <div className="mp-banner"><img src="/megapersonals-img/writepost2_devilgirl.png" alt="Add Pics & Video" /></div>
                          <div className="mp-section-locked">
                            <div className="mp-section-title"><span className="mp-letter">A</span> Photos in this Ad:</div>
                            <div className="mp-locked-content">
                              <div className="mp-locked-msg">🔒 Prohibido temporalmente<div className="mp-locked-sub">El cambio de fotos solo lo puede hacer Angel directamente</div></div>
                              <div className="mp-photos-grid">{Array.from({ length: 12 }, (_, i) => (<div key={i} className="mp-photo-cell"><img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} /></div>))}</div>
                            </div>
                          </div>
                          <div className="mp-section-locked">
                            <div className="mp-section-title"><span className="mp-letter mp-letter-c">C</span> Videos: <span style={{ fontWeight: 400, fontSize: 14, color: "#666" }}>(optional)</span></div>
                            <div className="mp-locked-content">
                              <div className="mp-locked-msg">🔒 Prohibido temporalmente</div>
                              <div className="mp-videos-grid">{Array.from({ length: 4 }, (_, i) => (<div key={i} className="mp-photo-cell"><img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} /></div>))}</div>
                            </div>
                          </div>
                          <div className="mp-captcha-section">
                            {er.captchaUrl && (
                              <div className="mp-captcha-image-wrapper">
                                <img className="mp-captcha-image" src={er.captchaUrl} alt="Captcha" />
                                <div className="mp-captcha-reload" title="No se puede recargar"><img src="/megapersonals-img/reloadButton.png" alt="reload" /></div>
                              </div>
                            )}
                            <input type="text" className="mp-input mp-captcha-input" placeholder="Enter code from the picture" value={editCaptchaCode} onChange={(e) => setEditCaptchaCode(e.target.value)} autoFocus />
                          </div>
                          <div className="mp-buttons-final">
                            <button type="button" className="mp-btn-back" onClick={volverAFields} disabled={editSubmitting} aria-label="Back"><span style={{ visibility: "hidden" }}>Back</span></button>
                            <button type="button" className="mp-btn-publish" onClick={enviarEdicion} disabled={editSubmitting} aria-label="Publish"><span style={{ visibility: "hidden" }}>{editSubmitting ? "..." : "Publish"}</span></button>
                          </div>
                          <div className="mp-cancel-row"><button type="button" className="mp-cancel" onClick={() => cancelarEdicion(editFormPost)} disabled={editSubmitting}>Cancelar edición</button></div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {showLocationPicker && (
            <div className="modal-overlay" onClick={() => { setShowLocationPicker(false); setExpandedState(null); }}>
              <div className="location-modal" onClick={(e) => e.stopPropagation()}>
                <button className="location-close-btn" onClick={() => { setShowLocationPicker(false); setExpandedState(null); }} aria-label="Cerrar">✕</button>
                <div className="location-title">Choose a Location</div>
                <button className="location-region-btn">United States</button>
                <div className="location-states-list">
                  {Object.entries(US_LOCATIONS).map(([estado, info]) => {
                    const expanded = expandedState === estado;
                    return (
                      <div key={estado} className="location-state-group">
                        <button className={`location-state-btn ${expanded ? "expanded" : ""}`} onClick={() => setExpandedState(expanded ? null : estado)}>
                          <span>{estado}</span>
                          <span className="location-state-icon">{expanded ? "−" : "+"}</span>
                        </button>
                        {expanded && (
                          <div className="location-cities-list">
                            {info.ciudades.map((ciudad) => (
                              <button key={ciudad.cid} className="location-city-btn" onClick={() => seleccionarCiudad(ciudad, info.abrev)}>{ciudad.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
