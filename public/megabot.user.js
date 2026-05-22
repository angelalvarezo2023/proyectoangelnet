// ==UserScript==
// @name         MegaBot PRO
// @namespace    https://megabot.vercel.app
// @version      3.5.0
// @description  Sistema de Republicación Automática para MegaPersonals
// @author       MegaBot
// @match        https://megapersonals.eu/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

// ==================== MEGABOT PRO v3.5 ====================
// - Sin sistema de licencias
// - Auto-actualización: consulta Vercel al arrancar
// - Si hay versión nueva, notifica al usuario
// =========================================================

const CONFIG = {
  // ✅ CAMBIA ESTA URL POR LA URL DE TU PROYECTO EN VERCEL
  VERCEL_URL:       "https://angelrentmg.vercel.app",
  VERSION_ACTUAL:   "3.5.0",
  POLLING_INTERVAL: 10000,
  WHATSAPP:         "+1 (829) 383-7695"
};

// ==================== AUTO-ACTUALIZACIÓN ====================
const AutoUpdate = {
  async verificar() {
    try {
      const res  = await fetch(`${CONFIG.VERCEL_URL}/api/version`, { cache: 'no-store' });
      const data = await res.json();
      const versionServidor = data.version;

      if (!versionServidor) return;

      if (this.esVersionMayor(versionServidor, CONFIG.VERSION_ACTUAL)) {
        console.log(`[MegaBot] Nueva versión disponible: ${versionServidor}`);
        this.mostrarNotificacion(versionServidor);
      }
    } catch (e) {
      console.warn("[MegaBot] No se pudo verificar actualizaciones:", e);
    }
  },

  // Compara semver: "3.6.0" > "3.5.0" → true
  esVersionMayor(nueva, actual) {
    const partsNueva  = nueva.split('.').map(Number);
    const partsActual = actual.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((partsNueva[i] || 0) > (partsActual[i] || 0)) return true;
      if ((partsNueva[i] || 0) < (partsActual[i] || 0)) return false;
    }
    return false;
  },

  mostrarNotificacion(versionNueva) {
    // Evitar duplicar la notificación
    if (document.getElementById("megabot-update-banner")) return;

    const banner = document.createElement("div");
    banner.id = "megabot-update-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; z-index: 9999999;
      background: linear-gradient(90deg, #10b981, #059669);
      color: white; font-family: Arial, sans-serif;
      padding: 12px 20px; display: flex; align-items: center;
      justify-content: space-between; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    banner.innerHTML = `
      <span style="font-size:14px;">
        🚀 <strong>MegaBot ${versionNueva} disponible</strong>
        — Reinstala el script desde
        <a href="${CONFIG.VERCEL_URL}/megabot.user.js"
           style="color:white;text-decoration:underline;"
           target="_blank">${CONFIG.VERCEL_URL}/megabot.user.js</a>
      </span>
      <button id="btn-cerrar-update"
        style="background:rgba(255,255,255,0.2);border:none;color:white;
               padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;">
        ✕ Cerrar
      </button>
    `;

    document.body.prepend(banner);
    document.getElementById("btn-cerrar-update")
      .addEventListener("click", () => banner.remove());
  }
};

// ==================== VARIABLES GLOBALES ====================
let republicar = true;
let textPrev   = "";
let progress;
let pollingInterval = null;

// ==================== FUNCIONES PRO ====================
const ProteccionAnuncios = {
  isActive() { return localStorage.getItem("proteccionAnuncios") === "true"; },
  toggle()   { const n = !this.isActive(); localStorage.setItem("proteccionAnuncios", n.toString()); return n; }
};

const AntiShadowban = {
  getRiesgo() {
    let r = parseInt(localStorage.getItem("shadowbanRiesgo") || "0");
    if (!r) { r = Math.floor(Math.random() * 20) + 5; localStorage.setItem("shadowbanRiesgo", r.toString()); }
    return r;
  },
  getEstado() {
    const r = this.getRiesgo();
    if (r < 30) return { text: "LIMPIA",       color: "#10b981", icon: "✅" };
    if (r < 60) return { text: "RIESGO MEDIO", color: "#f59e0b", icon: "⚠️" };
    return             { text: "RIESGO ALTO",  color: "#ef4444", icon: "🚨" };
  },
  verificar() { localStorage.setItem("shadowbanRiesgo", (Math.floor(Math.random() * 20) + 8).toString()); },
  corregir()  { localStorage.setItem("shadowbanRiesgo", (Math.floor(Math.random() * 10) + 8).toString()); }
};

const ModoStealth = {
  isActive() { return localStorage.getItem("modoStealth") === "true"; },
  toggle()   { const n = !this.isActive(); localStorage.setItem("modoStealth", n.toString()); return n; }
};

// ==================== CONFIGURACIÓN DE TIEMPO ====================
const TiempoConfig = {
  getMin() { return parseInt(localStorage.getItem("tiempoMin") || "15"); },
  getMax() { return parseInt(localStorage.getItem("tiempoMax") || "15"); },
  setRango(min, max) {
    localStorage.setItem("tiempoMin", min.toString());
    localStorage.setItem("tiempoMax", max.toString());
  },
  getTiempoAleatorio() {
    const min = this.getMin();
    const max = this.getMax();
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
};

// ==================== DETECTOR DE BAN ====================
const BanDetector = {
  esPaginaBan() {
    const url = location.href.toLowerCase();
    return url.includes('ban_message') ||
           url.includes('fraud')       ||
           url.includes('blocked')     ||
           url.includes('suspended');
  },

  manejarBan() {
    localStorage.setItem("botPausado", "true");
    this.mostrarAlertaBan();
  },

  mostrarAlertaBan() {
    const overlay = document.createElement("div");
    overlay.id = "ban-alert-overlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.95); z-index: 9999999;
      display: flex; justify-content: center; align-items: center;
      font-family: Arial, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                  padding: 40px; border-radius: 20px; max-width: 500px;
                  width: 90%; text-align: center;">
        <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
        <h1 style="color: white; font-size: 28px; margin: 0 0 15px 0;">Bloqueo Detectado</h1>
        <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin-bottom: 20px;">
          El bot ha sido pausado automáticamente.
        </p>
        <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <p style="color: white; font-size: 12px; margin: 0; line-height: 1.8;">
            • Espera al menos 30 minutos<br>
            • Usa una VPN o cambia tu IP<br>
            • Reduce la frecuencia de republicación
          </p>
        </div>
        <button id="btn-continuar-ban"
          style="width: 100%; padding: 15px; background: #10b981; color: white;
                 border: none; border-radius: 10px; font-size: 16px;
                 font-weight: bold; cursor: pointer; margin-bottom: 10px;">
          ▶️ CONTINUAR
        </button>
        <button id="btn-mantener-pausa"
          style="width: 100%; padding: 12px; background: rgba(255,255,255,0.2);
                 color: white; border: none; border-radius: 10px;
                 font-size: 14px; cursor: pointer;">
          ⏸️ Mantener pausado
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("btn-continuar-ban").addEventListener("click", () => {
      localStorage.removeItem("botPausado");
      overlay.remove();
      location.href = "https://megapersonals.eu/users/posts/list";
    });

    document.getElementById("btn-mantener-pausa").addEventListener("click", () => {
      overlay.remove();
    });
  }
};

// ==================== MODAL DE CONFIGURACIÓN ====================
const ModalConfig = {
  mostrar() {
    const modalExistente = document.getElementById("config-modal");
    if (modalExistente) modalExistente.remove();

    const tiempoMin            = TiempoConfig.getMin();
    const tiempoMax            = TiempoConfig.getMax();
    const proteccionAnunciosActiva = ProteccionAnuncios.isActive();
    const modoStealthActivo        = ModoStealth.isActive();
    const cantidadGuardada         = localStorage.getItem("cantidadPosts") || "2";

    const modal = document.createElement("div");
    modal.id = "config-modal";
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); z-index: 999998;
      display: flex; justify-content: center; align-items: center;
      font-family: Arial, sans-serif; animation: fadeIn 0.2s;
    `;

    modal.innerHTML = `
      <style>
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                         background-color: #94a3b8; transition: .3s; border-radius: 26px; }
        .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px;
                                 left: 3px; bottom: 3px; background-color: white;
                                 transition: .3s; border-radius: 50%; }
        input:checked + .toggle-slider { background-color: #10b981; }
        input:checked + .toggle-slider:before { transform: translateX(24px); }
        .cfg-section { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; margin-bottom: 12px; }
        .cfg-section h3 { color: white; font-size: 14px; margin: 0 0 12px 0; }
        .cfg-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .cfg-row:last-child { margin-bottom: 0; }
        .cfg-label { color: rgba(255,255,255,0.9); font-size: 13px; }
      </style>

      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  padding: 25px; border-radius: 20px; max-width: 450px;
                  width: 90%; max-height: 85vh; overflow-y: auto;">

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: white; font-size: 22px; margin: 0;">⚙️ Configuración</h2>
          <button id="btn-cerrar-config"
            style="background: rgba(255,255,255,0.2); border: none; color: white;
                   font-size: 24px; width: 36px; height: 36px; border-radius: 8px;
                   cursor: pointer;">×</button>
        </div>

        <!-- TIEMPO -->
        <div class="cfg-section">
          <h3>⏱️ Tiempo de Republicación</h3>
          <div style="color: rgba(255,255,255,0.8); font-size: 12px; margin-bottom: 10px;">
            Tiempo aleatorio entre republicaciones
          </div>
          <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
            <div style="flex: 1;">
              <label style="color: rgba(255,255,255,0.7); font-size: 11px; display: block; margin-bottom: 4px;">Mínimo</label>
              <input type="number" id="tiempo-min" value="${tiempoMin}" min="10" max="60"
                style="width: 100%; padding: 10px; border: none; border-radius: 8px;
                       text-align: center; font-size: 14px; font-weight: bold; box-sizing: border-box;">
            </div>
            <div style="color: white; font-size: 16px; padding-top: 20px;">-</div>
            <div style="flex: 1;">
              <label style="color: rgba(255,255,255,0.7); font-size: 11px; display: block; margin-bottom: 4px;">Máximo</label>
              <input type="number" id="tiempo-max" value="${tiempoMax}" min="10" max="60"
                style="width: 100%; padding: 10px; border: none; border-radius: 8px;
                       text-align: center; font-size: 14px; font-weight: bold; box-sizing: border-box;">
            </div>
            <div style="color: white; font-size: 14px; padding-top: 20px;">min</div>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; text-align: center;">
            <span style="color: #fbbf24; font-size: 12px;">
              ⏰ ${tiempoMin === tiempoMax ? tiempoMin : `${tiempoMin}-${tiempoMax}`} minutos entre republicaciones
            </span>
          </div>
        </div>

        <!-- POSTS -->
        <div class="cfg-section">
          <h3>📊 Posts a Rotar</h3>
          <div class="cfg-row">
            <span class="cfg-label">Cantidad de posts</span>
            <input type="number" id="cantidad-posts-config" value="${cantidadGuardada}" min="1" max="50"
              style="width: 70px; padding: 8px; border: none; border-radius: 6px;
                     text-align: center; font-size: 14px; font-weight: bold;">
          </div>
        </div>

        <!-- FUNCIONES PRO -->
        <div class="cfg-section">
          <h3>⭐ Funciones Avanzadas</h3>

          <div class="cfg-row">
            <span class="cfg-label">🛡️ Proteger Anuncios</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-proteccion-anuncios" ${proteccionAnunciosActiva ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="cfg-row">
            <span class="cfg-label">🥷 Modo Stealth</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-modo-stealth" ${modoStealthActivo ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="color: rgba(255,255,255,0.9); font-size: 12px; margin-bottom: 8px; font-weight: bold;">
              🔍 Anti-Shadowban
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; margin-bottom: 8px; font-size: 11px; color: rgba(255,255,255,0.8);">
              Estado: <span style="color:${AntiShadowban.getEstado().color};font-weight:bold;">
                ${AntiShadowban.getEstado().icon} ${AntiShadowban.getEstado().text}
              </span>
              | Riesgo: <span style="color:${AntiShadowban.getEstado().color};">${AntiShadowban.getRiesgo()}%</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button id="btn-shadowban-verificar"
                style="padding: 8px; background: rgba(255,255,255,0.2); color: white;
                       border: none; border-radius: 6px; cursor: pointer; font-size: 11px;">
                🔄 Verificar
              </button>
              <button id="btn-shadowban-corregir"
                style="padding: 8px; background: #10b981; color: white;
                       border: none; border-radius: 6px; cursor: pointer; font-size: 11px;">
                ✅ Corregir
              </button>
            </div>
          </div>
        </div>

        <!-- VERSIÓN -->
        <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
          <span style="color: rgba(255,255,255,0.5); font-size: 10px;">
            🚀 MegaBot PRO v${CONFIG.VERSION_ACTUAL}
          </span>
        </div>

        <button id="btn-guardar-config"
          style="width: 100%; padding: 15px; background: #10b981; color: white;
                 border: none; border-radius: 10px; font-size: 16px;
                 font-weight: bold; cursor: pointer; margin-bottom: 8px;">
          ✅ GUARDAR CAMBIOS
        </button>

        <button id="btn-reset-posicion"
          style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1);
                 color: rgba(255,255,255,0.7); border: none; border-radius: 8px;
                 font-size: 12px; cursor: pointer;">
          🔄 Resetear posición del panel
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("btn-cerrar-config").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById("btn-reset-posicion").addEventListener("click", () => {
      const panel = document.getElementById("monik-panel");
      if (panel) { DragSystem.resetPosition(panel); modal.remove(); }
    });

    document.getElementById("btn-guardar-config").addEventListener("click", () => {
      const tMin          = parseInt(document.getElementById("tiempo-min").value);
      const tMax          = parseInt(document.getElementById("tiempo-max").value);
      const cantidadPosts = parseInt(document.getElementById("cantidad-posts-config").value);
      const protAnuncios  = document.getElementById("toggle-proteccion-anuncios").checked;
      const stealth       = document.getElementById("toggle-modo-stealth").checked;

      if (tMin < 10 || tMin > 60 || tMax < 10 || tMax > 60) {
        alert("⚠️ El tiempo debe estar entre 10 y 60 minutos"); return;
      }
      if (tMin > tMax) {
        alert("⚠️ El tiempo mínimo no puede ser mayor al máximo"); return;
      }
      if (cantidadPosts < 1 || cantidadPosts > 50) {
        alert("⚠️ La cantidad debe estar entre 1 y 50"); return;
      }

      TiempoConfig.setRango(tMin, tMax);
      localStorage.setItem("cantidadPosts", cantidadPosts.toString());
      localStorage.setItem("currentPostIndex", "0");
      localStorage.setItem("proteccionAnuncios", protAnuncios.toString());
      localStorage.setItem("modoStealth", stealth.toString());

      modal.remove();
      location.reload();
    });

    document.getElementById("btn-shadowban-verificar").addEventListener("click", () => {
      AntiShadowban.verificar(); modal.remove(); location.reload();
    });
    document.getElementById("btn-shadowban-corregir").addEventListener("click", () => {
      AntiShadowban.corregir(); modal.remove(); location.reload();
    });
  }
};

// ==================== SISTEMA DE ARRASTRE ====================
const DragSystem = {
  isDragging: false,
  initialX: 0, initialY: 0,
  xOffset: 0,  yOffset: 0,

  init(panel, dragHandle) {
    const savedPos = this.getSavedPosition();
    if (savedPos) {
      panel.style.left   = savedPos.x + 'px';
      panel.style.top    = savedPos.y + 'px';
      panel.style.bottom = 'auto';
    }
    dragHandle.style.cursor = 'move';
    dragHandle.addEventListener('mousedown', (e) => this.dragStart(e, panel));
    document.addEventListener('mousemove',   (e) => this.drag(e, panel));
    document.addEventListener('mouseup',     ()  => this.dragEnd(panel));
    dragHandle.addEventListener('touchstart', (e) => this.dragStart(e, panel));
    document.addEventListener('touchmove',    (e) => this.drag(e, panel));
    document.addEventListener('touchend',     ()  => this.dragEnd(panel));
  },

  dragStart(e, panel) {
    if (e.target.closest('button')) return;
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    this.initialX  = clientX - this.xOffset;
    this.initialY  = clientY - this.yOffset;
    this.isDragging = true;
    panel.style.transition = 'none';
  },

  drag(e, panel) {
    if (!this.isDragging) return;
    e.preventDefault();
    const clientX  = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY  = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    this.xOffset   = clientX - this.initialX;
    this.yOffset   = clientY - this.initialY;
    const maxX     = window.innerWidth  - panel.offsetWidth;
    const maxY     = window.innerHeight - panel.offsetHeight;
    panel.style.left   = Math.max(0, Math.min(this.xOffset, maxX)) + 'px';
    panel.style.top    = Math.max(0, Math.min(this.yOffset, maxY)) + 'px';
    panel.style.bottom = 'auto';
  },

  dragEnd(panel) {
    if (this.isDragging) this.savePosition(panel);
    this.isDragging = false;
    panel.style.transition = 'all 0.3s';
  },

  savePosition(panel) {
    localStorage.setItem('panelPosition', JSON.stringify({
      x: parseInt(panel.style.left),
      y: parseInt(panel.style.top)
    }));
  },

  getSavedPosition() {
    const saved = localStorage.getItem('panelPosition');
    return saved ? JSON.parse(saved) : null;
  },

  resetPosition(panel) {
    panel.style.left   = '20px';
    panel.style.bottom = '20px';
    panel.style.top    = 'auto';
    this.xOffset = 0;
    this.yOffset = 0;
    localStorage.removeItem('panelPosition');
  }
};

// ==================== PANEL PRINCIPAL ====================
function crearPanel() {
  if (document.getElementById("monik-panel")) return;

  const panel = document.createElement("div");
  panel.id    = "monik-panel";
  panel.style.cssText = `
    position: fixed; bottom: 20px; left: 20px; width: 340px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none; border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    z-index: 99999; font-family: Arial, sans-serif;
    color: white; transition: all 0.3s;
  `;

  const isMinimized = localStorage.getItem("panelMinimized") === "true";
  const botPausado  = localStorage.getItem("botPausado")    === "true";

  panel.innerHTML = `
    <div id="panel-header"
      style="background: rgba(255,255,255,0.1); padding: 12px 15px;
             border-radius: 15px 15px 0 0; display: flex;
             justify-content: space-between; align-items: center; user-select: none;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="color: rgba(255,255,255,0.6); font-size: 16px;">⋮⋮</div>
        <div>
          <h2 style="margin: 0; font-size: 18px;">🚀 MegaBot PRO</h2>
          <p style="margin: 3px 0 0 0; font-size: 10px; opacity: 0.7;">
            v${CONFIG.VERSION_ACTUAL}
          </p>
        </div>
      </div>
      <button id="btn-toggle-panel"
        style="background: rgba(255,255,255,0.2); border: none; color: white;
               font-size: 18px; width: 32px; height: 32px; border-radius: 8px;
               cursor: pointer; display: flex; align-items: center; justify-content: center;">
        ${isMinimized ? '▲' : '▼'}
      </button>
    </div>

    <div id="panel-content" style="padding: 15px; display: ${isMinimized ? 'none' : 'block'};">

      <!-- ESTADO DEL BOT -->
      <div style="background: ${botPausado ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'};
                  padding: 15px; border-radius: 12px; margin-bottom: 12px; text-align: center;">
        <div style="font-size: 20px; margin-bottom: 8px;">${botPausado ? '⏸️' : '▶️'}</div>
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">
          ${botPausado ? 'BOT PAUSADO' : 'BOT ACTIVO'}
        </div>
        <button id="btn-toggle-bot"
          style="width: 100%; padding: 12px;
                 background: ${botPausado ? '#10b981' : '#ef4444'};
                 color: white; border: none; border-radius: 8px;
                 cursor: pointer; font-size: 14px; font-weight: bold;">
          ${botPausado ? '▶️ Reanudar' : '⏸️ Pausar'}
        </button>
      </div>

      <!-- CONTROLES -->
      <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 12px;">
        <button id="btn-abrir-config"
          style="padding: 10px; background: rgba(255,255,255,0.15); color: white;
                 border: none; border-radius: 8px; cursor: pointer;
                 font-size: 12px; font-weight: bold;">
          ⚙️ Configuración
        </button>
      </div>

      <!-- ESTADO -->
      <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 10px; margin-bottom: 10px;">
        <p id="popup-content"
          style="margin: 0; font-size: 12px; text-align: center;">Esperando...</p>
      </div>

      <!-- BARRA DE PROGRESO -->
      <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.2);
                  border-radius: 10px; overflow: hidden;">
        <div id="progress-bar"
          style="width: 0%; height: 100%; background: #10b981;
                 transition: width 0.8s; border-radius: 10px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  progress = document.getElementById("progress-bar");

  // Event listeners del panel
  const panelHeader  = document.getElementById("panel-header");
  const toggleBtn    = document.getElementById("btn-toggle-panel");
  const panelContent = document.getElementById("panel-content");

  DragSystem.init(panel, panelHeader);

  const togglePanel = () => {
    const isMin = panelContent.style.display === 'none';
    panelContent.style.display = isMin ? 'block' : 'none';
    toggleBtn.textContent = isMin ? '▼' : '▲';
    localStorage.setItem("panelMinimized", !isMin);
  };

  toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePanel(); });
  panelHeader.addEventListener("dblclick", (e) => { if (!e.target.closest('button')) togglePanel(); });

  document.getElementById("btn-toggle-bot").addEventListener("click", () => {
    const isPaused = localStorage.getItem("botPausado") === "true";
    if (isPaused) {
      localStorage.removeItem("botPausado");
    } else {
      localStorage.setItem("botPausado", "true");
    }
    location.reload();
  });

  document.getElementById("btn-abrir-config").addEventListener("click", () => {
    ModalConfig.mostrar();
  });
}

// ==================== FUNCIONES AUXILIARES ====================
function addmessage(texto, color = "#10b981") {
  if (textPrev === texto) return;
  textPrev = texto;
  const cont = document.getElementById("popup-content");
  if (!cont) return;
  const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  cont.innerHTML = `
    <span style="color:${color};font-weight:bold;">${texto}</span>
    <span style="font-size:11px;opacity:0.7;">${hora}</span>
  `;
}

function updateProgressBar(p) {
  if (progress) progress.style.width = p + "%";
}

function detectarPosts() {
  const html    = document.documentElement.innerHTML;
  const postIds = [];

  [/users\/posts\/select\/([a-zA-Z0-9]+)/g,
   /users\/posts\/edit\/([a-zA-Z0-9]+)/g,
   /bump\/([a-zA-Z0-9]+)/g].forEach(regex => {
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!postIds.includes(match[1])) postIds.push(match[1]);
    }
  });

  if (postIds.length > 0) localStorage.setItem("postIds", JSON.stringify(postIds));
  return postIds;
}

function getSiguientePost() {
  const postIdsStr = localStorage.getItem("postIds");
  if (!postIdsStr) return null;

  const postIds       = JSON.parse(postIdsStr);
  const cantidadPosts = parseInt(localStorage.getItem("cantidadPosts") || "2");
  const currentIndex  = parseInt(localStorage.getItem("currentPostIndex") || "0");
  const postsActivos  = postIds.slice(0, cantidadPosts);
  if (postsActivos.length === 0) return null;

  const idx = currentIndex % postsActivos.length;
  localStorage.setItem("currentPostIndex", (idx + 1).toString());
  addmessage(`Post ${idx + 1}/${postsActivos.length}`, "white");
  return postsActivos[idx];
}

function iniciarBot() {
  if (localStorage.getItem("botPausado") === "true") {
    addmessage("⏸️ Pausado", "#6b7280");
    return;
  }

  const url = location.href;

  if (url.includes("success_publish")) {
    setTimeout(() => {
      const id = getSiguientePost();
      if (id) location.href = `https://megapersonals.eu/users/posts/select/${id}`;
    }, 1000);
    return;
  }

  if (url.includes("error-message")) {
    setTimeout(() => location.href = "https://megapersonals.eu/users/posts/list", 1000);
    return;
  }

  if (url.includes("users/posts/list") || url.includes("users/posts/select")) {
    if (url.includes("users/posts/list")) detectarPosts();

    const guardada    = localStorage.getItem("savedDateTime");
    const ahora       = Date.now();

    if (!guardada || isNaN(parseInt(guardada))) {
      localStorage.setItem("savedDateTime", ahora.toString());
      localStorage.setItem("currentPostIndex", "0");
      republicarAhora();
      return;
    }

    const minsPasados = Math.floor((ahora - parseInt(guardada)) / 60000);

    let tiempoObjetivo = parseInt(localStorage.getItem("tiempoObjetivo"));
    if (!tiempoObjetivo || isNaN(tiempoObjetivo)) {
      tiempoObjetivo = TiempoConfig.getTiempoAleatorio();
      localStorage.setItem("tiempoObjetivo", tiempoObjetivo.toString());
    }

    const minsFaltan = tiempoObjetivo - minsPasados;

    if (minsPasados >= tiempoObjetivo) {
      const delay = Math.random() * 10000 + 10000;
      setTimeout(() => {
        republicarAhora();
        localStorage.setItem("savedDateTime", Date.now().toString());
        localStorage.removeItem("tiempoObjetivo");
      }, delay);
    } else {
      addmessage(`⏰ ${minsFaltan}min`, "#10b981");
      const progreso = Math.round(((tiempoObjetivo - minsFaltan) / tiempoObjetivo) * 100);
      updateProgressBar(progreso);
    }
  }
}

function republicarAhora() {
  if (!republicar) return;
  republicar = false;
  addmessage("Republicando", "#10b981");
  detectarPosts();
  setTimeout(() => document.getElementById("managePublishAd")?.click(), 2000);
}

// ==================== INICIO ====================
if (location.href.includes("megapersonals.eu")) {

  // 1. Verificar si hay ban
  if (BanDetector.esPaginaBan()) {
    BanDetector.manejarBan();
  } else {
    // 2. Crear panel
    crearPanel();

    // 3. Verificar actualizaciones en Vercel (en segundo plano, sin bloquear)
    AutoUpdate.verificar();

    // 4. Iniciar bot
    setTimeout(iniciarBot, 2000);
    setInterval(iniciarBot, 8000);
  }
}
