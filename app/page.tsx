"use client";
import { useState, useEffect, useRef } from "react";

// ============================================================
// Imports de archivos separados (refactor):
// - Constantes globales y helper de proxy de imágenes
// - Tipos TypeScript (interfaces y types)
// - Datos de ubicaciones US
// ============================================================
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

  // Estados del flujo de edición del cliente
  const [editConfirmPost, setEditConfirmPost] = useState<string | null>(null); // muestra modal de confirmación inicial
  const [editFormPost, setEditFormPost] = useState<string | null>(null);       // muestra modal de edición
  const [editStep, setEditStep] = useState<"fields" | "captcha">("fields");    // qué pantalla del modal
  const [editFields, setEditFields] = useState<EditRequestFields>({});         // valores que el cliente está editando
  const [editOriginalFields, setEditOriginalFields] = useState<EditRequestFields>({}); // valores originales (para comparar)
  const [editCaptchaCode, setEditCaptchaCode] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Estados del modal de selección de ubicación (city)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [expandedState, setExpandedState] = useState<string | null>(null);

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
    const SEMANA = 7 * 24 * 60 * 60 * 1000;

    // Si el post YA tiene renta (vencida o no), el nuevo periodo se cuenta
    // desde la fecha de vencimiento original. Asi, si el cliente pago tarde,
    // el tiempo que estuvo en deuda se le descuenta automaticamente.
    // Si nunca tuvo renta, se cuenta desde ahora.
    const base = post.rentExpiresAt || Date.now();
    const newExpiry = base + SEMANA;

    // Reactivar el post solo si el nuevo vencimiento queda en el futuro.
    // (Si la deuda era mayor a lo pagado, seguiria vencido y pausado.)
    const reactivar = newExpiry > Date.now() && post.rentPaused;

    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    if (reactivar) {
      updates.status = "active";
      updates.rentPaused = false;
    }

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...post, ...updates },
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

    // El modal "Establecer" cuenta desde AHORA (renta limpia, sin cobrar deuda).
    // Usalo cuando quieras dar tiempo fresco. Para cobrar deuda usa el boton +7d.
    const newExpiry = Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;

    const post = clientData.posts[rentModalPost];
    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    // Si estaba pausado por renta vencida, reactivarlo
    if (post.rentPaused) {
      updates.status = "active";
      updates.rentPaused = false;
    }

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${rentModalPost}.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [rentModalPost]: { ...post, ...updates },
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

  // ===========================================================
  // FLUJO DE EDICIÓN DEL CLIENTE
  // ===========================================================

  // Verifica si esta cuenta ya tiene una edición activa (en cualquier post).
  // Por regla: solo una edición a la vez por cuenta.
  const hayEdicionActiva = (): string | null => {
    if (!clientData) return null;
    for (const [pid, post] of Object.entries(clientData.posts)) {
      const s = post.editRequest?.status;
      if (s === "captcha_pendiente" || s === "captcha_listo" || s === "listo_para_publicar") {
        return pid;
      }
    }
    return null;
  };

  // Tracker de último intento de borrado por editRequest (postId:finishedAt → timestamp).
  // Usamos Map (no Set) para permitir reintentos: si Firebase no propagó el DELETE
  // a tiempo y el polling trae la editRequest de vuelta, reintentamos cada 3 segundos.
  const ultimoBorradoRef = useRef<Map<string, number>>(new Map());

  // Limpia automáticamente solicitudes terminadas/fallidas tras 5 segundos.
  // Si Firebase no propaga el DELETE y vuelve a llegar la editRequest en el polling,
  // reintentamos cada 3s hasta que efectivamente desaparezca. Esto evita que el mensaje
  // "Cambios aplicados" se quede pegado por minutos.
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

      // Reintentar máximo cada 3 segundos
      if (now - ultimoIntento < 3000) return;
      ultimoBorradoRef.current.set(clave, now);

      // SIEMPRE actualizar el estado local INMEDIATAMENTE.
      // Si el polling trae la editRequest de vuelta, este código se ejecuta otra vez
      // y la vuelve a quitar del estado local. El mensaje no se queda pegado.
      setClientData((prev) => {
        if (!prev || !prev.posts[postId]) return prev;
        const existing = prev.posts[postId].editRequest;
        // Solo borrar si sigue siendo la MISMA editRequest (no una nueva)
        if (!existing) return prev;
        const existingFinish = existing.appliedAt || existing.failedAt;
        if (existingFinish !== finishedAt) return prev;
        const newPost = { ...prev.posts[postId] };
        delete newPost.editRequest;
        return {
          ...prev,
          posts: { ...prev.posts, [postId]: newPost },
        };
      });

      // Borrar de Firebase (idempotente: si ya no existe, no pasa nada)
      await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, {
        method: "DELETE",
      });
    });
  }, [now, clientData, clientKey]);

  // Paso 1: el cliente toca "Editar publicación" en una tarjeta
  const iniciarEdicion = (postId: string) => {
    const existente = hayEdicionActiva();
    if (existente && existente !== postId) {
      alert(`⚠️ Ya tienes una edición en curso en otro post (#${existente}). Termina o cancela esa primero.`);
      return;
    }
    setEditConfirmPost(postId);
  };

  // Paso 2: el cliente confirma. Creamos la solicitud en Firebase con estado "captcha_pendiente"
  const confirmarEdicion = async () => {
    if (!editConfirmPost || !clientData) return;

    const editRequest: EditRequest = {
      status: "captcha_pendiente",
      requestedAt: Date.now(),
    };

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editConfirmPost}/editRequest.json`, {
      method: "PUT",
      body: JSON.stringify(editRequest),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [editConfirmPost]: { ...clientData.posts[editConfirmPost], editRequest },
      },
    });

    setEditConfirmPost(null);
  };

  // Paso 3: el cliente toca "Editar ahora" cuando el captcha ya está listo.
  // Abrimos el formulario en la pantalla 1 (campos editables, sin captcha aún).
  const abrirFormularioEdicion = (postId: string) => {
    if (!clientData) return;
    const post = clientData.posts[postId];
    if (!post.editRequest || post.editRequest.status !== "captcha_listo") return;

    // Pre-llenar los campos con los valores actuales que capturó el bot
    const current: EditRequestFields = {
      name: post.editRequest.currentValues?.name || "",
      age: post.editRequest.currentValues?.age || "",
      title: post.editRequest.currentValues?.title || "",
      body: post.editRequest.currentValues?.body || "",
      cityName: post.editRequest.currentValues?.cityName || "",
      location: post.editRequest.currentValues?.location || "",
    };
    setEditFields(current);
    setEditOriginalFields(current); // guardar copia para comparar después
    setEditCaptchaCode("");
    setEditStep("fields"); // empezar en la pantalla 1
    setEditFormPost(postId);
  };

  // Validación de los campos antes de avanzar al captcha
  const validarCampos = (): string | null => {
    if (!editFields.title?.trim()) return "El titular (Headline) no puede estar vacío";
    if (!editFields.body?.trim()) return "La descripción (Body) no puede estar vacía";
    return null;
  };

  // Avanzar de pantalla "fields" a "captcha"
  const irAlCaptcha = () => {
    const err = validarCampos();
    if (err) {
      alert("⚠️ " + err);
      return;
    }
    setEditStep("captcha");
  };

  // Volver de "captcha" a "fields" para editar los campos
  const volverAFields = () => {
    setEditStep("fields");
  };

  // Paso 4: el cliente envía el formulario completo (campos modificados + captcha)
  const enviarEdicion = async () => {
    if (!editFormPost || !clientData) return;
    if (!editCaptchaCode.trim()) {
      alert("⚠️ Escribe el código del captcha");
      return;
    }
    const errCampos = validarCampos();
    if (errCampos) {
      alert("⚠️ " + errCampos);
      setEditStep("fields");
      return;
    }

    // Construir 'fields' SOLO con los campos que el cliente realmente cambió
    // Comparando contra los valores originales que capturó el bot.
    const cambios: EditRequestFields = {};
    (Object.keys(editFields) as (keyof EditRequestFields)[]).forEach((key) => {
      const valNuevo = (editFields[key] || "").trim();
      const valOriginal = (editOriginalFields[key] || "").trim();
      if (valNuevo !== valOriginal) {
        cambios[key] = valNuevo;
      }
    });

    setEditSubmitting(true);

    const updates: Partial<EditRequest> = {
      status: "listo_para_publicar",
      captchaCode: editCaptchaCode.trim(),
      fields: cambios, // SOLO los campos modificados
    };

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editFormPost}/editRequest.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    const post = clientData.posts[editFormPost];
    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [editFormPost]: {
          ...post,
          editRequest: { ...(post.editRequest as EditRequest), ...updates } as EditRequest,
        },
      },
    });

    setEditSubmitting(false);
    setEditFormPost(null);
  };

  // Cancelar edición en cualquier momento (antes de "aplicada")
  const cancelarEdicion = async (postId: string) => {
    if (!confirm("¿Cancelar la edición de este post?")) return;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, {
      method: "DELETE",
    });

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

  // Selector de ubicación: el usuario eligió una ciudad de un estado
  const seleccionarCiudad = (ciudad: string, abrev: string) => {
    setEditFields({ ...editFields, cityName: `${ciudad}, ${abrev}` });
    setShowLocationPicker(false);
    setExpandedState(null);
  };

  // Abre el modal del selector
  const abrirSelectorUbicacion = () => {
    setExpandedState(null);
    setShowLocationPicker(true);
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
      return { status: "none" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays: 0, debtHours: 0 };
    }

    const diff = post.rentExpiresAt - now;
    if (diff <= 0) {
      // Renta vencida: calcular el tiempo que lleva en deuda
      const debtMs = now - post.rentExpiresAt;
      const debtTotalHours = Math.floor(debtMs / (60 * 60 * 1000));
      const debtDays = Math.floor(debtTotalHours / 24);
      const debtHours = debtTotalHours % 24;
      return { status: "expired" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays, debtHours };
    }

    const totalHours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    // Advertencia cuando queda 1 día (24h) o menos
    const isWarning = totalHours <= 24;

    return { status: "active" as const, days, hours, isWarning, totalHours, debtDays: 0, debtHours: 0 };
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

  const filteredClients = Object.entries(allClients)
    .filter(([key, data]) => {
      if (!adminFilter) return true;
      const query = adminFilter.toLowerCase();
      return data.displayName?.toLowerCase().includes(query) || key.includes(query);
    })
    // Ordenar por urgencia: cuenta baneada > en deuda > por vencer > con renta > sin renta > inactivo
    .sort(([, a], [, b]) => {
      const score = (data: ClientData) => {
        // Cuenta baneada: máxima urgencia (necesita atención inmediata)
        if (data.banned) return 0;

        // Sacar la fecha más urgente entre todos sus posts
        const posts = Object.values(data.posts || {});
        if (!posts.length) return 6; // sin posts: lo último

        // Buscar la renta más cercana a vencer (o ya vencida)
        const fechas = posts
          .map((p) => p.rentExpiresAt)
          .filter((x): x is number => typeof x === "number");

        if (!fechas.length) return 5; // ningún post con renta configurada

        const minFecha = Math.min(...fechas);
        const diff = minFecha - now;

        if (diff <= 0) return 1; // en deuda
        if (diff <= 24 * 3600 * 1000) return 2; // por vencer (<= 24h)
        if (diff <= 7 * 24 * 3600 * 1000) return 3; // próximo (<= 7d)
        return 4; // tiempo lejano
      };

      const sA = score(a);
      const sB = score(b);
      if (sA !== sB) return sA - sB;

      // Empate: por nombre alfabético
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

  // Calcular contador de baneos por semana (últimos 7 días)
  const baneosEstaSemana = Object.values(allClients).filter(
    (c) => c.banned && c.bannedAt && now - c.bannedAt <= 7 * 24 * 3600 * 1000
  ).length;

  return (
    <>
      <EstilosGlobales />

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
                    <div className={`stat-pill banned ${baneosEstaSemana > 0 ? "alert" : ""}`}>
                      <div className="stat-pill-icon">🚫</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Baneos esta semana</div>
                        <div className="stat-pill-value">{baneosEstaSemana}</div>
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

                    // Estado de renta agregado del cliente
                    const postsConRenta = posts.filter((p) => p.rentExpiresAt);
                    let rentSummary: { type: "expired" | "warning" | "active" | "none"; text: string; count?: number } = {
                      type: "none",
                      text: "Sin renta",
                    };

                    if (postsConRenta.length > 0) {
                      const expired = postsConRenta.filter((p) => p.rentExpiresAt! <= now);
                      const activeRent = postsConRenta.filter((p) => p.rentExpiresAt! > now);
                      const warning = activeRent.filter((p) => p.rentExpiresAt! - now <= 24 * 60 * 60 * 1000);

                      if (expired.length > 0) {
                        // Tomar la deuda más grande (más urgente)
                        const maxDebt = Math.max(...expired.map((p) => now - p.rentExpiresAt!));
                        const debtDays = Math.floor(maxDebt / (24 * 60 * 60 * 1000));
                        const debtHours = Math.floor((maxDebt % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        rentSummary = {
                          type: "expired",
                          text: `${expired.length} en deuda · ${debtDays}d ${debtHours}h`,
                          count: expired.length,
                        };
                      } else if (warning.length > 0) {
                        // Tomar el que vence más pronto
                        const minTime = Math.min(...warning.map((p) => p.rentExpiresAt! - now));
                        const totalHours = Math.floor(minTime / (60 * 60 * 1000));
                        const h = totalHours;
                        const m = Math.floor((minTime % (60 * 60 * 1000)) / (60 * 1000));
                        rentSummary = {
                          type: "warning",
                          text: `${warning.length} por vencer · ${h}h ${m}m`,
                          count: warning.length,
                        };
                      } else if (activeRent.length > 0) {
                        // Tomar el que vence más pronto entre los activos
                        const minTime = Math.min(...activeRent.map((p) => p.rentExpiresAt! - now));
                        const totalHours = Math.floor(minTime / (60 * 60 * 1000));
                        const days = Math.floor(totalHours / 24);
                        const hours = totalHours % 24;
                        rentSummary = {
                          type: "active",
                          text: `Próximo: ${days}d ${hours}h`,
                        };
                      }
                    }

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

                        {/* Estado de renta del cliente */}
                        <div className={`client-rent ${rentSummary.type}`}>
                          <span className="client-rent-icon">
                            {rentSummary.type === "expired" ? "🔴" :
                             rentSummary.type === "warning" ? "🟡" :
                             rentSummary.type === "active" ? "🟢" : "⚪"}
                          </span>
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
                <p className="banned-subtitle">
                  Tu cuenta de MegaPersonals fue bloqueada por la plataforma.
                </p>
                <div className="banned-info">
                  <p>
                    Esto puede deberse a actividad detectada como inusual o a una violación de las
                    políticas de MegaPersonals. Tu publicación NO está activa en este momento.
                  </p>
                  {clientData.bannedAt && (
                    <p className="banned-date">
                      Detectado: {new Date(clientData.bannedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <a
                  className="banned-whatsapp"
                  href={`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
                    `Hola Angel, mi cuenta (${clientData.displayName}) aparece como BLOQUEADA. ¿Qué puedo hacer?`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span style={{ fontSize: 22 }}>💬</span> Contactar con Angel
                </a>
                <button
                  className="banned-back"
                  onClick={goBack}
                >
                  ← Volver al inicio
                </button>
              </div>
            </div>
          )}

          {step === "cards" && clientData && !(clientData.banned && !isAdmin) && (
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
                        className={`post-card ${isPaused ? "paused" : "active"} ${rent.isWarning || rent.status === "expired" ? "warning" : ""}`}
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

                        {/* BANNER - cuando queda 1 día o menos, O cuando ya venció (en deuda) */}
                        {(rent.isWarning || rent.status === "expired") && (
                          <div className="pc-warning">
                            <div className="pc-warning-header">
                              <span className="pc-warning-icon">⚠️</span>
                              <span className="pc-warning-title">
                                {rent.status === "expired" ? "Renta vencida" : "Advertencia"}
                              </span>
                            </div>
                            <div className="pc-warning-text">
                              {rent.status === "expired" ? (
                                <>
                                  Este post está <strong>pausado</strong> porque la renta llegó a 0. El tiempo sigue
                                  corriendo como <strong>deuda ({rent.debtDays}d {rent.debtHours}h)</strong>. Al renovar
                                  se descontará ese tiempo. Contacta con <strong>Angel</strong> por WhatsApp.
                                </>
                              ) : (
                                <>
                                  Este post se <strong>pausará automáticamente</strong> cuando el tiempo de renta
                                  llegue a 0, y el tiempo seguirá corriendo como <strong>deuda</strong>. Para reactivarlo,
                                  contacta con <strong>Angel</strong> por WhatsApp y renueva.
                                </>
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
                            <div className="pc-rent-label">
                              🎫 {rent.status === "active" ? "Renta activa" : rent.status === "expired" ? "Renta vencida" : "Sin renta"}
                            </div>
                            <div className="pc-rent-value">
                              {rent.status === "active"
                                ? `${rent.days}d ${rent.hours}h restantes`
                                : rent.status === "expired"
                                ? `En deuda: ${rent.debtDays}d ${rent.debtHours}h`
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

                          {/* Botón de Editar dinámico según estado de la solicitud */}
                          {(() => {
                            const er = post.editRequest;
                            if (!er || er.status === "aplicada" || er.status === "fallida") {
                              return (
                                <button className="action-btn btn-edit" onClick={() => iniciarEdicion(postId)}>
                                  ✏ Editar publicación
                                </button>
                              );
                            }

                            if (er.status === "captcha_pendiente") {
                              return (
                                <div className="edit-status pending">
                                  <div className="edit-status-info">
                                    <span className="edit-status-spinner">🔄</span>
                                    <div>
                                      <div className="edit-status-title">Generando captcha...</div>
                                      <div className="edit-status-sub">Esperando turno del sistema (1-15 min)</div>
                                    </div>
                                  </div>
                                  <button className="edit-cancel-btn" onClick={() => cancelarEdicion(postId)}>
                                    Cancelar
                                  </button>
                                </div>
                              );
                            }

                            if (er.status === "captcha_listo") {
                              const minRestantes = er.expiresAt
                                ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000))
                                : 0;
                              return (
                                <div className="edit-status ready">
                                  <button className="action-btn btn-edit-ready" onClick={() => abrirFormularioEdicion(postId)}>
                                    🔐 Editar ahora ({minRestantes}min)
                                  </button>
                                  <button className="edit-cancel-btn small" onClick={() => cancelarEdicion(postId)}>
                                    Cancelar
                                  </button>
                                </div>
                              );
                            }

                            if (er.status === "listo_para_publicar") {
                              return (
                                <div className="edit-status publishing">
                                  <span className="edit-status-spinner">⏳</span>
                                  <span>Publicando cambios...</span>
                                </div>
                              );
                            }

                            return null;
                          })()}

                          {/* Mensaje breve cuando ya se aplicó o falló */}
                          {post.editRequest?.status === "aplicada" && (
                            <div className="edit-status applied">✅ Cambios aplicados</div>
                          )}
                          {post.editRequest?.status === "fallida" && (
                            <div className="edit-status failed">
                              ✗ Edición fallida
                              {post.editRequest.failReason ? `: ${post.editRequest.failReason}` : ""}
                            </div>
                          )}
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

        {/* MODAL: Confirmar inicio de edición */}
        {editConfirmPost && (
          <div className="modal-overlay" onClick={() => setEditConfirmPost(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">✏️ Editar publicación</div>
              <div className="modal-subtitle">
                Vas a editar el post <code style={{ color: "var(--accent)" }}>#{editConfirmPost}</code>
              </div>

              <div style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 14,
                padding: 18,
                marginBottom: 24,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--gray-300)"
              }}>
                <div style={{ fontWeight: 700, color: "var(--info)", marginBottom: 8 }}>
                  ¿Cómo funciona?
                </div>
                <div>
                  1. El sistema generará un <strong>captcha de verificación</strong> en su próximo turno (1-15 min).<br/>
                  2. Te avisaremos aquí cuando esté listo, y verás un botón <strong>"Editar ahora"</strong>.<br/>
                  3. Al abrir, podrás resolver el captcha y editar todos los campos (menos teléfono).<br/>
                  4. Tendrás <strong>15 minutos</strong> para enviar antes de que caduque.
                </div>
              </div>

              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setEditConfirmPost(null)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={confirmarEdicion}>
                  Iniciar edición
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Formulario de edición estilo MegaPersonals 1:1 */}
        {editFormPost && clientData && clientData.posts[editFormPost]?.editRequest && (
          <div className="mp-overlay" onClick={() => !editSubmitting && setEditFormPost(null)}>
            <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const er = clientData.posts[editFormPost].editRequest as EditRequest;
                const minRest = er.expiresAt
                  ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000))
                  : 0;
                const secRest = er.expiresAt
                  ? Math.max(0, Math.floor((er.expiresAt - now) / 1000) % 60)
                  : 0;

                return (
                  <>
                    {/* Botón X cerrar (esquina superior derecha) */}
                    <button
                      className="mp-close-x"
                      onClick={() => !editSubmitting && setEditFormPost(null)}
                      title="Cerrar"
                    >
                      <img src="/megapersonals-img/close_bump_to_top_modal.png" alt="Cerrar" />
                    </button>

                    {/* Timer flotante */}
                    <div className="mp-timer">⏱ {minRest}:{secRest.toString().padStart(2, "0")}</div>

                    {/* Bordes decorativos rosa */}
                    <div className="mp-topborder"></div>
                    <div className="mp-leftborder"></div>
                    <div className="mp-rightborder"></div>
                    <div className="mp-bottomborder"></div>

                    {/* Logo de header */}
                    <div className="mp-header-logo">
                      <img src="/megapersonals-img/megapersonalsPageHeader2.png" alt="MegaPersonals" />
                    </div>

                    {/* ============ PESTAÑA 1: DATOS ============ */}
                    {editStep === "fields" && (
                      <div className="mp-stage">
                        <div className="mp-banner">
                          <img src="/megapersonals-img/writepost1_devilgirl.png" alt="Create Post" />
                        </div>

                        <form className="mp-form" onSubmit={(e) => e.preventDefault()}>
                          {/* I AM / I SEE */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">I AM:</label>
                              <select className="mp-input mp-disabled" disabled value="1">
                                <option value="1">A woman</option>
                              </select>
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">I SEE:</label>
                              <input
                                className="mp-input mp-disabled"
                                type="text"
                                disabled
                                value="Men"
                                readOnly
                              />
                            </div>
                          </div>

                          {/* Name / Age */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">Name/Alias:</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.name || ""}
                                onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                              />
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">Age:</label>
                              <select
                                className="mp-input"
                                value={editFields.age || "25"}
                                onChange={(e) => setEditFields({ ...editFields, age: e.target.value })}
                              >
                                {Array.from({ length: 82 }, (_, i) => i + 18).map((a) => (
                                  <option key={a} value={a}>{a}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Headline */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Headline: *</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.title || ""}
                                onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Body */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Body: *</label>
                              <textarea
                                className="mp-input mp-textarea"
                                value={editFields.body || ""}
                                onChange={(e) => setEditFields({ ...editFields, body: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* City / Phone */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">City:</label>
                              <button
                                type="button"
                                className="mp-input mp-city-btn"
                                onClick={abrirSelectorUbicacion}
                              >
                                {editFields.cityName || "Click to select"}
                              </button>
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">Phone:</label>
                              <div className="mp-phone-wrapper">
                                <input
                                  className="mp-input mp-disabled mp-phone-code"
                                  type="text"
                                  disabled
                                  value="+1"
                                  readOnly
                                />
                                <input
                                  className="mp-input mp-disabled mp-phone-number"
                                  type="text"
                                  disabled
                                  value={er.currentValues?.name ? "(no editable)" : ""}
                                  readOnly
                                />
                              </div>
                            </div>
                          </div>

                          {/* Location/Area */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Location/Area:</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.location || ""}
                                onChange={(e) => setEditFields({ ...editFields, location: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Botón Next */}
                          <div className="mp-button-row">
                            <button
                              type="button"
                              className="mp-btn-next"
                              onClick={irAlCaptcha}
                              aria-label="Next"
                            >
                              <span style={{ visibility: "hidden" }}>Next</span>
                            </button>
                          </div>

                          {/* Cancelar */}
                          <div className="mp-cancel-row">
                            <button
                              type="button"
                              className="mp-cancel"
                              onClick={() => cancelarEdicion(editFormPost)}
                              disabled={editSubmitting}
                            >
                              Cancelar edición
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* ============ PESTAÑA 2: CAPTCHA + FOTOS ============ */}
                    {editStep === "captcha" && (
                      <div className="mp-stage">
                        <div className="mp-banner">
                          <img src="/megapersonals-img/writepost2_devilgirl.png" alt="Add Pics & Video" />
                        </div>

                        {/* Photos in this Ad (deshabilitado) */}
                        <div className="mp-section-locked">
                          <div className="mp-section-title">
                            <span className="mp-letter">A</span> Photos in this Ad:
                          </div>
                          <div className="mp-locked-content">
                            <div className="mp-locked-msg">
                              🔒 Prohibido temporalmente
                              <div className="mp-locked-sub">El cambio de fotos solo lo puede hacer Angel directamente</div>
                            </div>
                            <div className="mp-photos-grid">
                              {Array.from({ length: 12 }, (_, i) => (
                                <div key={i} className="mp-photo-cell">
                                  <img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Videos (deshabilitado) */}
                        <div className="mp-section-locked">
                          <div className="mp-section-title">
                            <span className="mp-letter mp-letter-c">C</span> Videos: <span style={{ fontWeight: 400, fontSize: 14, color: "#666" }}>(optional)</span>
                          </div>
                          <div className="mp-locked-content">
                            <div className="mp-locked-msg">
                              🔒 Prohibido temporalmente
                            </div>
                            <div className="mp-videos-grid">
                              {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="mp-photo-cell">
                                  <img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Captcha */}
                        <div className="mp-captcha-section">
                          {er.captchaUrl && (
                            <div className="mp-captcha-image-wrapper">
                              <img className="mp-captcha-image" src={er.captchaUrl} alt="Captcha" />
                              <div className="mp-captcha-reload" title="No se puede recargar">
                                <img src="/megapersonals-img/reloadButton.png" alt="reload" />
                              </div>
                            </div>
                          )}
                          <input
                            type="text"
                            className="mp-input mp-captcha-input"
                            placeholder="Enter code from the picture"
                            value={editCaptchaCode}
                            onChange={(e) => setEditCaptchaCode(e.target.value)}
                            autoFocus
                          />
                        </div>

                        {/* Botones Back y Publish */}
                        <div className="mp-buttons-final">
                          <button
                            type="button"
                            className="mp-btn-back"
                            onClick={volverAFields}
                            disabled={editSubmitting}
                            aria-label="Back"
                          >
                            <span style={{ visibility: "hidden" }}>Back</span>
                          </button>
                          <button
                            type="button"
                            className="mp-btn-publish"
                            onClick={enviarEdicion}
                            disabled={editSubmitting}
                            aria-label="Publish"
                          >
                            <span style={{ visibility: "hidden" }}>{editSubmitting ? "..." : "Publish"}</span>
                          </button>
                        </div>

                        {/* Cancelar */}
                        <div className="mp-cancel-row">
                          <button
                            type="button"
                            className="mp-cancel"
                            onClick={() => cancelarEdicion(editFormPost)}
                            disabled={editSubmitting}
                          >
                            Cancelar edición
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}


        {/* MODAL: Selector de ubicación (estilo MegaPersonals) */}
        {showLocationPicker && (
          <div className="modal-overlay" onClick={() => { setShowLocationPicker(false); setExpandedState(null); }}>
            <div className="location-modal" onClick={(e) => e.stopPropagation()}>
              <button
                className="location-close-btn"
                onClick={() => { setShowLocationPicker(false); setExpandedState(null); }}
                aria-label="Cerrar"
              >
                ✕
              </button>
              <div className="location-title">Choose a Location</div>

              {/* United States es el ÚNICO continente disponible */}
              <button className="location-region-btn">
                United States
              </button>

              <div className="location-states-list">
                {Object.entries(US_LOCATIONS).map(([estado, info]) => {
                  const expanded = expandedState === estado;
                  return (
                    <div key={estado} className="location-state-group">
                      <button
                        className={`location-state-btn ${expanded ? "expanded" : ""}`}
                        onClick={() => setExpandedState(expanded ? null : estado)}
                      >
                        <span>{estado}</span>
                        <span className="location-state-icon">{expanded ? "−" : "+"}</span>
                      </button>
                      {expanded && (
                        <div className="location-cities-list">
                          {info.ciudades.map((ciudad) => (
                            <button
                              key={ciudad}
                              className="location-city-btn"
                              onClick={() => seleccionarCiudad(ciudad, info.abrev)}
                            >
                              {ciudad}
                            </button>
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
    </>
  );
}
