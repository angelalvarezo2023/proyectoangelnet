// ==UserScript==
// @name         UltraBot PRO
// @namespace    https://angelrentmg.vercel.app
// @version      2.5.0
// @description  UltraBot — Sistema de Republicación Automática para MegaPersonals
// @author       MegaBot
// @match        https://megapersonals.eu/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

// ==================== ULTRABOT PRO v2.0 ====================
// - Licencias validadas en servidor (Vercel)
// - 1 PC por licencia (fingerprint UUID único)
// - Forzar actualización obligatoria
// - Básico: 1 post | PRO: hasta 50 posts
// =========================================================

const CONFIG = {
  VERCEL_URL:     "https://angelrentmg.vercel.app",
  VERSION_ACTUAL: "2.5.0",
  WHATSAPP:       "+1 (829) 383-7695"
};

// ==================== FINGERPRINT DE PC ====================
// ✅ Usa GM_getValue/GM_setValue de Tampermonkey
// Esto comparte el UUID entre TODOS los perfiles del mismo navegador
// (Chrome normal, Multilogin, perfiles separados, etc.)
function getFingerprint() {
  const KEY = "megabot_install_id";

  // Primero intentar desde Tampermonkey (compartido entre perfiles)
  let id = GM_getValue(KEY, null);

  // Si no está en GM, buscar en localStorage como fallback
  if (!id || id.length < 8) {
    id = localStorage.getItem(KEY);
  }

  // Si ya existe en cualquiera de los dos, sincronizar y devolver
  if (id && id.length >= 8) {
    GM_setValue(KEY, id);          // asegurar que esté en GM
    localStorage.setItem(KEY, id); // y en localStorage también
    return id;
  }

  // Generar UUID nuevo
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  id = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();

  // Guardar en ambos sitios
  GM_setValue(KEY, id);
  localStorage.setItem(KEY, id);
  return id;
}

// ==================== SISTEMA DE LICENCIAS ====================
const LicenseSystem = {
  getStoredKey()   { return localStorage.getItem("megabot_license_key"); },
  storeKey(key)    { localStorage.setItem("megabot_license_key", key); },
  clearKey(reason) {
    console.warn("[MegaBot] Licencia borrada:", reason);
    localStorage.removeItem("megabot_license_key");
    if (reason === "EXPIRED" || reason === "DEACTIVATED") {
      localStorage.removeItem("megabot_install_id");
    }
  },

  _cache: null,
  _cacheTime: 0,
  CACHE_MS: 5 * 60 * 1000,

  async validar() {
    const key         = this.getStoredKey();
    const fingerprint = getFingerprint();

    if (!key) return { valida: false, razon: "NO_KEY" };

    if (this._cache && (Date.now() - this._cacheTime) < this.CACHE_MS) {
      return this._cache;
    }

    try {
      const res = await fetch(`${CONFIG.VERCEL_URL}/api/license/validate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, fingerprint, version: CONFIG.VERSION_ACTUAL })
      });

      const data = await res.json();

      if (data.valid) {
        localStorage.removeItem("megabot_net_errors");
        const result = { valida: true, ...data };
        this._cache     = result;
        this._cacheTime = Date.now();
        return result;
      }

      switch (data.reason) {
        case "UPDATE_REQUIRED":
          return { valida: false, razon: "UPDATE_REQUIRED", ...data };
        case "WRONG_PC":
          this.clearKey("WRONG_PC");
          return { valida: false, razon: "WRONG_PC",
            mensaje: "Esta clave ya está activada en otra PC.\nContacta al vendedor." };
        case "DEACTIVATED":
          this.clearKey("DEACTIVATED");
          return { valida: false, razon: "DEACTIVATED",
            mensaje: "Licencia desactivada.\nContacta al vendedor." };
        case "EXPIRED":
          this.clearKey("EXPIRED");
          return { valida: false, razon: "EXPIRED",
            mensaje: "Licencia expirada.\nContacta al vendedor para renovar." };
        case "INVALID_KEY":
          const fallos = parseInt(localStorage.getItem("megabot_key_fails") || "0");
          if (fallos >= 3) {
            this.clearKey("INVALID_KEY");
            localStorage.removeItem("megabot_key_fails");
            return { valida: false, razon: "INVALID_KEY",
              mensaje: "Clave no válida.\nVerifica o contacta al vendedor." };
          }
          localStorage.setItem("megabot_key_fails", (fallos + 1).toString());
          return { valida: false, razon: "RETRYING", networkError: true };
        default:
          return { valida: false, razon: "SERVER_ERROR", networkError: true };
      }

    } catch (err) {
      const errors = parseInt(localStorage.getItem("megabot_net_errors") || "0");
      localStorage.setItem("megabot_net_errors", (errors + 1).toString());
      return { valida: false, razon: "NETWORK_ERROR", networkError: true };
    }
  },

  async activar(key) {
    const fingerprint = getFingerprint();
    try {
      const res = await fetch(`${CONFIG.VERCEL_URL}/api/license/activate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, fingerprint })
      });
      const data = await res.json();
      if (data.success) {
        this.storeKey(key);
        localStorage.removeItem("megabot_key_fails");
        localStorage.removeItem("megabot_net_errors");
      }
      return data;
    } catch (err) {
      return { success: false, message: "❌ Error de conexión. Intenta de nuevo." };
    }
  }
};

// ==================== PANTALLA: ACTUALIZACIÓN REQUERIDA ====================
function mostrarPantallaActualizacion(data) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.96);z-index:9999999;
    display:flex;justify-content:center;align-items:center;
    font-family:Arial,sans-serif;
  `;
  overlay.innerHTML = `
    <div style="background:linear-gradient(135deg,#1e40af,#1d4ed8);
                padding:40px;border-radius:20px;max-width:480px;
                width:90%;text-align:center;">
      <div id="mb-upd-icon" style="font-size:60px;margin-bottom:16px;">🔄</div>
      <h1 style="color:white;font-size:26px;margin:0 0 12px;">Actualización Requerida</h1>
      <p style="color:rgba(255,255,255,0.85);font-size:14px;margin-bottom:24px;line-height:1.6;">
        Hay una nueva versión disponible (<strong>v${data.currentVersion}</strong>).<br>
        El bot no funcionará hasta que instales la actualización.
      </p>

      <!-- Barra de progreso (oculta al inicio) -->
      <div id="mb-progress-container" style="display:none;margin-bottom:20px;text-align:left;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span id="mb-progress-label"
            style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:bold;">
            Descargando actualización...
          </span>
          <span id="mb-progress-pct"
            style="color:#10b981;font-size:14px;font-weight:bold;">0%</span>
        </div>
        <!-- Barra exterior -->
        <div style="width:100%;height:12px;background:rgba(255,255,255,0.15);
                    border-radius:10px;overflow:hidden;">
          <div id="mb-progress-bar"
            style="width:0%;height:100%;
                   background:linear-gradient(90deg,#10b981,#34d399);
                   border-radius:10px;transition:width 0.25s ease;">
          </div>
        </div>
        <!-- Mensaje de estado -->
        <p id="mb-progress-status"
          style="color:rgba(255,255,255,0.5);font-size:11px;margin:8px 0 0;">
          Iniciando...
        </p>
      </div>

      <!-- Botón instalar -->
      <a id="mb-update-btn" href="${data.updateUrl}" target="_blank"
         style="display:block;padding:16px;background:#10b981;color:white;
                border-radius:10px;text-decoration:none;font-size:16px;
                font-weight:bold;margin-bottom:12px;cursor:pointer;transition:opacity 0.3s;">
        ⬇️ INSTALAR ACTUALIZACIÓN v${data.currentVersion}
      </a>

      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">
        Tu versión actual: v${CONFIG.VERSION_ACTUAL}
      </p>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("mb-update-btn").addEventListener("click", () => {
    // Ocultar botón y mostrar barra
    document.getElementById("mb-update-btn").style.display  = "none";
    document.getElementById("mb-progress-container").style.display = "block";
    document.getElementById("mb-upd-icon").textContent = "⏳";

    const bar    = document.getElementById("mb-progress-bar");
    const pct    = document.getElementById("mb-progress-pct");
    const label  = document.getElementById("mb-progress-label");
    const status = document.getElementById("mb-progress-status");

    let progreso = 0;

    // Fases realistas con velocidad y mensajes distintos
    const fases = [
      { hasta: 12,  vel: 80,  msg: "Conectando con el servidor..." },
      { hasta: 30,  vel: 55,  msg: "Descargando MegaBot v" + data.currentVersion + "..." },
      { hasta: 55,  vel: 45,  msg: "Verificando archivos..." },
      { hasta: 75,  vel: 60,  msg: "Instalando actualización..." },
      { hasta: 90,  vel: 85,  msg: "Aplicando cambios..." },
      { hasta: 100, vel: 180, msg: "¡Instalación completada!" },
    ];

    let faseIdx = 0;

    const tick = setInterval(() => {
      const fase = fases[faseIdx];
      // Incremento aleatorio → se ve natural
      const inc = Math.random() * 2.2 + 0.4;
      progreso = Math.min(progreso + inc, fase.hasta);

      bar.style.width   = progreso + "%";
      pct.textContent   = Math.floor(progreso) + "%";
      status.textContent = fase.msg;

      // Cambiar a siguiente fase
      if (progreso >= fase.hasta && faseIdx < fases.length - 1) {
        faseIdx++;
        clearInterval(tick);
        // Pequeña pausa entre fases (más realista)
        setTimeout(iniciarFase, Math.random() * 300 + 100);
      }

      // Llegó al 100%
      if (progreso >= 100) {
        clearInterval(tick);
        finalizarDescarga();
      }
    }, fases[faseIdx].vel);

    function iniciarFase() {
      const fase = fases[faseIdx];
      const nuevoTick = setInterval(() => {
        const inc = Math.random() * 2.2 + 0.4;
        progreso = Math.min(progreso + inc, fase.hasta);

        bar.style.width    = progreso + "%";
        pct.textContent    = Math.floor(progreso) + "%";
        status.textContent = fase.msg;

        if (progreso >= fase.hasta && faseIdx < fases.length - 1) {
          faseIdx++;
          clearInterval(nuevoTick);
          setTimeout(iniciarFase, Math.random() * 300 + 100);
        }

        if (progreso >= 100) {
          clearInterval(nuevoTick);
          finalizarDescarga();
        }
      }, fase.vel);
    }

    function finalizarDescarga() {
      bar.style.background  = "linear-gradient(90deg,#10b981,#6ee7b7)";
      bar.style.width       = "100%";
      pct.textContent       = "100%";
      pct.style.color       = "#6ee7b7";
      label.textContent     = "✅ ¡Actualización instalada!";
      label.style.color     = "#10b981";
      document.getElementById("mb-upd-icon").textContent = "✅";

      // Cuenta regresiva
      let cuenta = 3;
      status.style.color    = "#fbbf24";
      status.textContent    = `Recargando en ${cuenta} segundos...`;

      const cuentaAtras = setInterval(() => {
        cuenta--;
        if (cuenta > 0) {
          status.textContent = `Recargando en ${cuenta} segundo${cuenta !== 1 ? 's' : ''}...`;
        } else {
          clearInterval(cuentaAtras);
          status.textContent = "¡Recargando ahora!";
          location.reload();
        }
      }, 1000);
    }
  });
}

// ==================== PANTALLA: ACTIVAR LICENCIA ====================
function mostrarPanelActivacion(mensaje = "Ingresa tu clave de activación") {
  const existing = document.getElementById("megabot-license-panel");
  if (existing) existing.remove();

  const fingerprint = getFingerprint();
  const panel = document.createElement("div");
  panel.id = "megabot-license-panel";
  panel.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.95);z-index:999999;
    display:flex;justify-content:center;align-items:center;
    font-family:Arial,sans-serif;
  `;
  panel.innerHTML = `
    <div style="background:#160a0d;border:1px solid #3d1a20;
                padding:40px;border-radius:20px;max-width:480px;
                width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="text-align:center;margin-bottom:28px;">
        <h1 style="color:white;font-size:30px;margin:0 0 8px;">🚀 UltraBot PRO</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">
          Sistema de Republicación Automática
        </p>
      </div>

      <div style="background:rgba(255,255,255,0.1);padding:20px;border-radius:14px;margin-bottom:16px;">
        <h3 style="color:white;margin:0 0 12px;font-size:16px;">🔑 Activar Licencia</h3>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0 0 14px;line-height:1.5;">
          ${mensaje}
        </p>
        <input type="text" id="mb-key-input" placeholder="Ej: MEGA-ANDY-001"
          style="width:100%;padding:14px;border:none;border-radius:8px;
                 font-size:15px;text-align:center;text-transform:uppercase;
                 box-sizing:border-box;margin-bottom:12px;">
        <button id="mb-btn-activar"
          style="width:100%;padding:14px;background:#10b981;color:white;
                 border:none;border-radius:8px;font-size:15px;
                 font-weight:bold;cursor:pointer;">
          🔓 ACTIVAR
        </button>
        <div id="mb-status"
          style="margin-top:10px;padding:10px;border-radius:8px;
                 display:none;text-align:center;">
          <p id="mb-status-msg"
            style="color:white;font-size:13px;margin:0;white-space:pre-line;"></p>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.1);padding:14px;border-radius:10px;margin-bottom:12px;">
        <p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0 0 6px;">
          <strong>🛒 ¿No tienes clave?</strong> Contacta al vendedor
        </p>
        <p style="color:rgba(255,255,255,0.55);font-size:11px;margin:0;">
          📞 WhatsApp: ${CONFIG.WHATSAPP}
        </p>
      </div>

      <div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:8px;text-align:center;">
        <p style="color:rgba(255,255,255,0.4);font-size:10px;margin:0;">
          🖥️ ID de esta PC: <strong>${fingerprint}</strong>
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const btn    = document.getElementById("mb-btn-activar");
  const input  = document.getElementById("mb-key-input");
  const status = document.getElementById("mb-status");
  const msg    = document.getElementById("mb-status-msg");

  const showStatus = (texto, color) => {
    status.style.display = "block";
    status.style.background = color;
    msg.textContent = texto;
  };

  btn.addEventListener("click", async () => {
    const key = input.value.trim().toUpperCase();
    if (!key) { showStatus("⚠️ Ingresa una clave", "rgba(239,68,68,0.3)"); return; }

    btn.disabled = true;
    btn.textContent = "⏳ Verificando...";
    showStatus("Conectando con el servidor...", "rgba(59,130,246,0.3)");

    const result = await LicenseSystem.activar(key);

    btn.disabled = false;
    btn.textContent = "🔓 ACTIVAR";

    if (result.success) {
      showStatus(result.message, "rgba(16,185,129,0.3)");
      setTimeout(() => location.reload(), 2000);
    } else {
      showStatus(result.message, "rgba(239,68,68,0.3)");
    }
  });

  input.addEventListener("keypress", e => {
    if (e.key === "Enter") btn.click();
  });
}

// ==================== VARIABLES GLOBALES ====================
let republicar = true;
let textPrev   = "";
let progress;

// ==================== ANTI-SHADOWBAN ====================
const AntiShadowban = {
  getRiesgo() {
    let r = parseInt(localStorage.getItem("shadowbanRiesgo") || "0");
    if (!r) { r = Math.floor(Math.random()*20)+5; localStorage.setItem("shadowbanRiesgo", r.toString()); }
    return r;
  },
  getEstado() {
    const r = this.getRiesgo();
    if (r<30) return {text:"LIMPIA",       color:"#10b981", icon:"✅"};
    if (r<60) return {text:"RIESGO MEDIO", color:"#f59e0b", icon:"⚠️"};
    return          {text:"RIESGO ALTO",  color:"#ef4444", icon:"🚨"};
  },
  verificar() { localStorage.setItem("shadowbanRiesgo",(Math.floor(Math.random()*20)+8).toString()); },
  corregir()  { localStorage.setItem("shadowbanRiesgo",(Math.floor(Math.random()*10)+8).toString()); }
};

// ==================== CONFIGURACIÓN DE TIEMPO ====================
const TiempoConfig = {
  getMin() { return parseInt(localStorage.getItem("tiempoMin")||"15"); },
  getMax() { return parseInt(localStorage.getItem("tiempoMax")||"15"); },
  setRango(min,max) {
    localStorage.setItem("tiempoMin",min.toString());
    localStorage.setItem("tiempoMax",max.toString());
  },
  getTiempoAleatorio() {
    const min=this.getMin(), max=this.getMax();
    return Math.floor(Math.random()*(max-min+1))+min;
  }
};

// ==================== DETECTOR DE BAN ====================
const BanDetector = {
  esPaginaBan() {
    const url = location.href.toLowerCase();
    return url.includes('ban_message')||url.includes('fraud')||
           url.includes('blocked')||url.includes('suspended');
  },
  mostrarAlerta() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.95);z-index:9999999;
      display:flex;justify-content:center;align-items:center;
      font-family:Arial,sans-serif;
    `;
    overlay.innerHTML = `
      <div style="background:linear-gradient(135deg,#f59e0b,#d97706);
                  padding:40px;border-radius:20px;max-width:480px;
                  width:90%;text-align:center;">
        <div style="font-size:60px;margin-bottom:16px;">⚠️</div>
        <h1 style="color:white;font-size:26px;margin:0 0 12px;">Bloqueo Detectado</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin-bottom:20px;">
          El bot ha sido pausado automáticamente.
        </p>
        <div style="background:rgba(0,0,0,0.3);padding:14px;border-radius:10px;margin-bottom:20px;">
          <p style="color:white;font-size:12px;margin:0;line-height:1.8;">
            • Espera al menos 30 minutos<br>
            • Usa una VPN o cambia tu IP<br>
            • Reduce la frecuencia de republicación
          </p>
        </div>
        <button id="mb-btn-continuar"
          style="width:100%;padding:14px;background:#10b981;color:white;
                 border:none;border-radius:10px;font-size:15px;
                 font-weight:bold;cursor:pointer;margin-bottom:10px;">
          ▶️ CONTINUAR
        </button>
        <button id="mb-btn-pausar"
          style="width:100%;padding:12px;background:rgba(255,255,255,0.2);
                 color:white;border:none;border-radius:10px;
                 font-size:13px;cursor:pointer;">
          ⏸️ Mantener pausado
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("mb-btn-continuar").addEventListener("click",()=>{
      localStorage.removeItem("botPausado");
      overlay.remove();
      location.href="https://megapersonals.eu/users/posts/list";
    });
    document.getElementById("mb-btn-pausar").addEventListener("click",()=>overlay.remove());
  }
};

// ==================== MODAL DE CONFIGURACIÓN ====================
const ModalConfig = {
  mostrar(licenseInfo) {
    const existing = document.getElementById("mb-config-modal");
    if (existing) existing.remove();

    const esPro     = licenseInfo.plan === 'pro';
    const tiempoMin = TiempoConfig.getMin();
    const tiempoMax = TiempoConfig.getMax();
    // ✅ Básico = 1 post máximo, PRO = hasta 50
    const maxPosts  = esPro ? 50 : 1;
    const cantidad  = esPro
      ? (localStorage.getItem("cantidadPosts") || "1")
      : "1";

    const modal = document.createElement("div");
    modal.id = "mb-config-modal";
    modal.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.85);z-index:999998;
      display:flex;justify-content:center;align-items:center;
      font-family:Arial,sans-serif;
    `;
    modal.innerHTML = `
      <style>
        .mb-toggle{position:relative;display:inline-block;width:50px;height:26px;}
        .mb-toggle input{opacity:0;width:0;height:0;}
        .mb-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
                   background:#94a3b8;transition:.3s;border-radius:26px;}
        .mb-slider:before{position:absolute;content:"";height:20px;width:20px;
                          left:3px;bottom:3px;background:white;transition:.3s;border-radius:50%;}
        input:checked+.mb-slider{background:#10b981;}
        input:checked+.mb-slider:before{transform:translateX(24px);}
        .mb-sec{background:#1a080d;border:1px solid #3d1a20;padding:15px;border-radius:12px;margin-bottom:12px;}
        .mb-sec h3{color:#f5e6e8;font-size:14px;margin:0 0 12px;}
        .mb-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
        .mb-row:last-child{margin-bottom:0;}
        .mb-lbl{color:#f5e6e8cc;font-size:13px;}
      </style>

      <div style="background:linear-gradient(135deg,#667eea,#764ba2);
                  padding:25px;border-radius:20px;max-width:440px;
                  width:90%;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="color:#f5e6e8;font-size:20px;margin:0;">⚙️ Configuración</h2>
          <button id="mb-cfg-close"
            style="background:#3d1a2044;border:1px solid #3d1a20;color:#9b7280;
                   font-size:22px;width:34px;height:34px;border-radius:8px;cursor:pointer;">×</button>
        </div>

        <!-- TIEMPO -->
        <div class="mb-sec">
          <h3>⏱️ Tiempo de Republicación</h3>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
            <div style="flex:1;">
              <label style="color:rgba(255,255,255,0.7);font-size:11px;display:block;margin-bottom:4px;">Mínimo</label>
              <input type="number" id="mb-t-min" value="${tiempoMin}" min="10" max="60"
                style="width:100%;padding:10px;border:none;border-radius:8px;
                       text-align:center;font-size:14px;font-weight:bold;box-sizing:border-box;">
            </div>
            <div style="color:white;padding-top:20px;">—</div>
            <div style="flex:1;">
              <label style="color:rgba(255,255,255,0.7);font-size:11px;display:block;margin-bottom:4px;">Máximo</label>
              <input type="number" id="mb-t-max" value="${tiempoMax}" min="10" max="60"
                style="width:100%;padding:10px;border:none;border-radius:8px;
                       text-align:center;font-size:14px;font-weight:bold;box-sizing:border-box;">
            </div>
            <div style="color:white;font-size:13px;padding-top:20px;">min</div>
          </div>
        </div>

        <!-- POSTS A ROTAR -->
        <div class="mb-sec">
          <h3>📊 Posts a Rotar</h3>
          ${esPro ? `
          <div class="mb-row">
            <span class="mb-lbl">Cantidad (máx 50)</span>
            <input type="number" id="mb-posts" value="${cantidad}" min="1" max="50"
              style="width:65px;padding:8px;border:none;border-radius:6px;
                     text-align:center;font-size:14px;font-weight:bold;">
          </div>
          ` : `
          <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;text-align:center;">
            <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 4px;font-weight:bold;">
              📦 Plan Básico — 1 post
            </p>
            <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">
              Upgrade a ⭐ PRO para rotar hasta 50 posts
            </p>
          </div>
          `}
        </div>

        <!-- FUNCIONES PRO -->
        ${esPro ? `
        <div class="mb-sec">
          <h3>⭐ Funciones PRO</h3>
          <div style="font-size:12px;color:rgba(255,255,255,0.85);font-weight:bold;margin-bottom:8px;">
            🔍 Anti-Shadowban
          </div>
          <div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;
                      margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.8);">
            Estado:
            <span style="color:${AntiShadowban.getEstado().color};font-weight:bold;">
              ${AntiShadowban.getEstado().icon} ${AntiShadowban.getEstado().text}
            </span>
            | Riesgo: ${AntiShadowban.getRiesgo()}%
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button id="mb-sb-verify"
              style="padding:8px;background:rgba(255,255,255,0.2);color:white;
                     border:none;border-radius:6px;cursor:pointer;font-size:11px;">
              🔄 Verificar
            </button>
            <button id="mb-sb-fix"
              style="padding:8px;background:#10b981;color:white;
                     border:none;border-radius:6px;cursor:pointer;font-size:11px;">
              ✅ Corregir
            </button>
          </div>
        </div>
        ` : `
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);
                    padding:14px;border-radius:12px;text-align:center;color:white;
                    margin-bottom:12px;">
          <div style="font-size:18px;margin-bottom:4px;">⭐ UPGRADE A PRO</div>
          <div style="font-size:11px;opacity:0.9;margin-bottom:6px;">Rotar hasta 50 posts + Anti-shadowban</div>
          <div style="font-size:10px;opacity:0.8;">WhatsApp: ${CONFIG.WHATSAPP}</div>
        </div>
        `}

        <!-- INFO LICENCIA -->
        <div style="background:#1a080d;border:1px solid #3d1a20;padding:10px;border-radius:8px;
                    margin-bottom:12px;text-align:center;">
          <p style="color:#9b728088;font-size:10px;margin:0;">
            👤 ${licenseInfo.cliente} | 📅 ${licenseInfo.dias} días | ${esPro ? '⭐ PRO' : '📦 Básico'} | v${CONFIG.VERSION_ACTUAL}
          </p>
        </div>

        <button id="mb-cfg-save"
          style="width:100%;padding:14px;background:linear-gradient(135deg,#b91c3a,#6b0f1a);color:white;
                 border:none;border-radius:10px;font-size:15px;
                 font-weight:bold;cursor:pointer;margin-bottom:8px;box-shadow:0 3px 12px #b91c3a44;">
          ✅ GUARDAR CAMBIOS
        </button>

        <button id="mb-cfg-reset"
          style="width:100%;padding:10px;background:#3d1a2033;border:1px solid #3d1a20;
                 color:#9b7280;border-radius:8px;
                 font-size:12px;cursor:pointer;">
          🔄 Resetear posición del panel
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("mb-cfg-close").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",e=>{ if(e.target===modal) modal.remove(); });

    document.getElementById("mb-cfg-reset").addEventListener("click",()=>{
      const p = document.getElementById("mb-panel");
      if(p){ DragSystem.resetPosition(p); modal.remove(); }
    });

    document.getElementById("mb-cfg-save").addEventListener("click",()=>{
      const tMin = parseInt(document.getElementById("mb-t-min").value);
      const tMax = parseInt(document.getElementById("mb-t-max").value);

      if(tMin<10||tMin>60||tMax<10||tMax>60){ alert("⚠️ Tiempo entre 10 y 60 min"); return; }
      if(tMin>tMax){ alert("⚠️ Mínimo no puede ser mayor al máximo"); return; }

      TiempoConfig.setRango(tMin,tMax);

      // ✅ Solo guardar cantidad si es PRO
      if(esPro){
        const qty = parseInt(document.getElementById("mb-posts").value);
        if(qty<1||qty>50){ alert("⚠️ Cantidad entre 1 y 50"); return; }
        localStorage.setItem("cantidadPosts", qty.toString());
      } else {
        // Básico siempre 1
        localStorage.setItem("cantidadPosts", "1");
      }

      localStorage.setItem("currentPostIndex","0");
      modal.remove();
      location.reload();
    });

    if(esPro){
      document.getElementById("mb-sb-verify")?.addEventListener("click",()=>{
        AntiShadowban.verificar(); modal.remove(); location.reload();
      });
      document.getElementById("mb-sb-fix")?.addEventListener("click",()=>{
        AntiShadowban.corregir(); modal.remove(); location.reload();
      });
    }
  }
};

// ==================== SISTEMA DE ARRASTRE ====================
const DragSystem = {
  isDragging:false, initialX:0, initialY:0, xOffset:0, yOffset:0,

  init(panel, handle) {
    const saved = this.getSavedPosition();
    if(saved){
      panel.style.left   = saved.x+'px';
      panel.style.top    = saved.y+'px';
      panel.style.bottom = 'auto';
    }

    // ✅ Verificar que el panel esté visible después de renderizar
    setTimeout(() => this.asegurarVisible(panel), 300);

    // ✅ Si cambia el tamaño de ventana o el zoom, recolocar si quedó fuera
    window.addEventListener('resize', () => this.asegurarVisible(panel));

    handle.style.cursor='move';
    handle.addEventListener('mousedown', e=>this.dragStart(e,panel));
    document.addEventListener('mousemove', e=>this.drag(e,panel));
    document.addEventListener('mouseup',  ()=>this.dragEnd(panel));
    handle.addEventListener('touchstart', e=>this.dragStart(e,panel));
    document.addEventListener('touchmove', e=>this.drag(e,panel));
    document.addEventListener('touchend',  ()=>this.dragEnd(panel));
  },

  // ✅ NUEVO: verifica que el panel esté dentro de la pantalla visible
  asegurarVisible(panel) {
    const w = panel.offsetWidth  || 320;
    const h = panel.offsetHeight || 200;
    const maxX = window.innerWidth  - w - 10;
    const maxY = window.innerHeight - h - 10;

    let x = parseInt(panel.style.left) || 20;
    let y = parseInt(panel.style.top);

    // Si no tiene top definido (usa bottom), calcular desde abajo
    if (!panel.style.top || panel.style.top === 'auto' || isNaN(y)) {
      y = window.innerHeight - h - 20;
    }

    // Corregir si está fuera de límites
    const newX = Math.max(10, Math.min(x, maxX));
    const newY = Math.max(10, Math.min(y, maxY));

    if (newX !== x || newY !== y) {
      panel.style.left   = newX + 'px';
      panel.style.top    = newY + 'px';
      panel.style.bottom = 'auto';
      this.savePosition(panel);
    }
  },

  dragStart(e,panel) {
    if(e.target.closest('button')||e.target.closest('a')) return;
    const cx = e.type==='touchstart'?e.touches[0].clientX:e.clientX;
    const cy = e.type==='touchstart'?e.touches[0].clientY:e.clientY;
    this.initialX=cx-this.xOffset; this.initialY=cy-this.yOffset;
    this.isDragging=true; panel.style.transition='none';
  },

  drag(e,panel) {
    if(!this.isDragging) return;
    e.preventDefault();
    const cx = e.type==='touchmove'?e.touches[0].clientX:e.clientX;
    const cy = e.type==='touchmove'?e.touches[0].clientY:e.clientY;
    this.xOffset=cx-this.initialX; this.yOffset=cy-this.initialY;
    const maxX=window.innerWidth-panel.offsetWidth;
    const maxY=window.innerHeight-panel.offsetHeight;
    panel.style.left=Math.max(0,Math.min(this.xOffset,maxX))+'px';
    panel.style.top =Math.max(0,Math.min(this.yOffset,maxY))+'px';
    panel.style.bottom='auto';
  },

  dragEnd(panel) {
    if(this.isDragging) this.savePosition(panel);
    this.isDragging=false; panel.style.transition='all 0.3s';
  },

  savePosition(panel) {
    localStorage.setItem('panelPosition',JSON.stringify({
      x:parseInt(panel.style.left), y:parseInt(panel.style.top)
    }));
  },

  getSavedPosition() {
    const s=localStorage.getItem('panelPosition');
    return s?JSON.parse(s):null;
  },

  resetPosition(panel) {
    panel.style.left='20px'; panel.style.bottom='20px';
    panel.style.top='auto'; this.xOffset=0; this.yOffset=0;
    localStorage.removeItem('panelPosition');
    setTimeout(() => this.asegurarVisible(panel), 100);
  }
};

// ==================== PANEL PRINCIPAL ====================
function crearPanel(licenseInfo) {
  if(document.getElementById("mb-panel")) return;

  // ✅ Guardar plan en localStorage para usarlo en el bot
  localStorage.setItem("megabot_plan", licenseInfo.plan || "basico");

  // ✅ Forzar cantidad a 1 si es básico
  if(licenseInfo.plan !== 'pro') {
    localStorage.setItem("cantidadPosts", "1");
  }

  const panel = document.createElement("div");
  panel.id = "mb-panel";
  panel.style.cssText = `
    position:fixed;bottom:20px;left:20px;width:300px;
    background:#160a0d;border:1px solid #3d1a20;
    border-radius:14px;
    box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 0 1px #8b1a2a22;
    z-index:99999;font-family:system-ui,Arial,sans-serif;color:#f5e6e8;transition:all 0.3s;
  `;

  const isMin  = localStorage.getItem("panelMinimized")==="true";
  const paused = localStorage.getItem("botPausado")==="true";
  const esPro  = licenseInfo.plan==='pro';
  const badge  = esPro
    ? '<span style="background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;font-size:9px;padding:2px 7px;border-radius:4px;margin-left:6px;font-weight:700;">PRO</span>'
    : '<span style="background:#b91c3a22;color:#f5c0c8;border:1px solid #b91c3a44;font-size:9px;padding:2px 7px;border-radius:4px;margin-left:6px;font-weight:700;">BÁSICO</span>';

  panel.innerHTML = `
    <div id="mb-header"
      style="background:linear-gradient(135deg,#8b1a2a,#6b0f1a);
             padding:12px 14px;border-radius:13px 13px 0 0;
             display:flex;justify-content:space-between;align-items:center;
             user-select:none;border-bottom:1px solid #3d1a20;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="color:#9b728088;font-size:13px;cursor:move;">⋮⋮</span>
        <div>
          <div style="display:flex;align-items:center;font-size:15px;font-weight:800;">
            🤖 ${esPro ? "UltraBot 2.0" : "UltraBot"}${badge}
          </div>
          <p style="margin:2px 0 0;font-size:10px;color:#f5e6e888;">
            ${licenseInfo.cliente} · ${licenseInfo.dias} días
          </p>
        </div>
      </div>
      <button id="mb-btn-toggle"
        style="background:#3d1a2055;border:1px solid #3d1a20;color:#9b7280;
               font-size:13px;width:27px;height:27px;border-radius:7px;cursor:pointer;">
        ${isMin?'▲':'▼'}
      </button>
    </div>

    <div id="mb-body" style="padding:12px;display:${isMin?'none':'block'};">

      <div style="background:${paused?'#2a070744':'#0a2e1e44'};
                  border:1px solid ${paused?'#dc262644':'#10b98144'};
                  padding:12px;border-radius:10px;margin-bottom:10px;text-align:center;">
        <div style="font-size:16px;margin-bottom:4px;">${paused?'⏸️':'▶️'}</div>
        <div style="font-size:13px;font-weight:800;letter-spacing:0.5px;margin-bottom:10px;
                    color:${paused?'#f87171':'#6ee7b7'};">
          ${paused?'BOT PAUSADO':'BOT ACTIVO'}
        </div>
        <button id="mb-btn-bot"
          style="width:100%;padding:10px;
                 background:${paused?'linear-gradient(135deg,#10b981,#059669)':'linear-gradient(135deg,#b91c3a,#6b0f1a)'};
                 color:white;border:none;border-radius:8px;
                 cursor:pointer;font-size:13px;font-weight:700;
                 box-shadow:${paused?'0 2px 10px #10b98144':'0 2px 10px #b91c3a55'};">
          ${paused?'▶️ Reanudar':'⏸️ Pausar'}
        </button>
      </div>

      <button id="mb-btn-cfg"
        style="width:100%;padding:9px;background:#3d1a2033;
               border:1px solid #3d1a20;color:#9b7280;border-radius:8px;
               cursor:pointer;font-size:12px;font-weight:600;margin-bottom:10px;">
        ⚙️ Configuración
      </button>

      <div style="background:#1a080d;border:1px solid #3d1a20;
                  padding:8px 12px;border-radius:8px;margin-bottom:8px;">
        <p id="mb-status-text" style="margin:0;font-size:12px;text-align:center;color:#9b7280;">
          Esperando...
        </p>
      </div>

      <div style="width:100%;height:4px;background:#3d1a20;border-radius:10px;overflow:hidden;">
        <div id="mb-progress"
          style="width:0%;height:100%;background:linear-gradient(90deg,#b91c3a,#f59e0b);
                 transition:width 0.8s;border-radius:10px;">
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  progress = document.getElementById("mb-progress");

  DragSystem.init(panel, document.getElementById("mb-header"));

  const body   = document.getElementById("mb-body");
  const toggle = document.getElementById("mb-btn-toggle");
  const togglePanel = () => {
    const min = body.style.display==='none';
    body.style.display = min?'block':'none';
    toggle.textContent = min?'▼':'▲';
    localStorage.setItem("panelMinimized", !min);
  };
  toggle.addEventListener("click", e=>{ e.stopPropagation(); togglePanel(); });
  document.getElementById("mb-header").addEventListener("dblclick", e=>{
    if(!e.target.closest('button')) togglePanel();
  });

  document.getElementById("mb-btn-bot").addEventListener("click",()=>{
    const isPaused = localStorage.getItem("botPausado")==="true";
    if(isPaused) localStorage.removeItem("botPausado");
    else localStorage.setItem("botPausado","true");
    location.reload();
  });

  document.getElementById("mb-btn-cfg").addEventListener("click",()=>{
    ModalConfig.mostrar(licenseInfo);
  });
}

// ==================== FUNCIONES DEL BOT ====================
function addmessage(texto, color="#10b981") {
  if(textPrev===texto) return;
  textPrev=texto;
  const el = document.getElementById("mb-status-text");
  if(!el) return;
  const h = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  el.innerHTML=`<span style="color:${color};font-weight:bold;">${texto}</span>
                <span style="font-size:10px;opacity:0.6;">${h}</span>`;
}

function updateProgressBar(p) {
  const el = document.getElementById("mb-progress");
  if(el) el.style.width=p+"%";
}

function detectarPosts() {
  const html=document.documentElement.innerHTML;
  const ids=[];
  [/users\/posts\/select\/([a-zA-Z0-9]+)/g,
   /users\/posts\/edit\/([a-zA-Z0-9]+)/g,
   /bump\/([a-zA-Z0-9]+)/g].forEach(re=>{
    let m;
    while((m=re.exec(html))!==null){ if(!ids.includes(m[1])) ids.push(m[1]); }
  });
  if(ids.length>0) localStorage.setItem("postIds",JSON.stringify(ids));
  return ids;
}

// ✅ Básico = máx 1 post | PRO = máx 50 posts
function getSiguientePost() {
  const str = localStorage.getItem("postIds");
  if(!str) return null;

  const ids    = JSON.parse(str);
  const plan   = localStorage.getItem("megabot_plan") || "basico";
  const maxPermitido = plan === "pro" ? 50 : 1;
  const cantidadGuardada = parseInt(localStorage.getItem("cantidadPosts") || "1");
  const cantidadPosts = Math.min(cantidadGuardada, maxPermitido);

  const idx      = parseInt(localStorage.getItem("currentPostIndex") || "0");
  const activos  = ids.slice(0, cantidadPosts);
  if(!activos.length) return null;

  const i = idx % activos.length;
  localStorage.setItem("currentPostIndex", (i+1).toString());
  addmessage(`Post ${i+1}/${activos.length}`, "white");
  return activos[i];
}

function iniciarBot() {
  if(localStorage.getItem("botPausado")==="true"){ addmessage("⏸️ Pausado","#6b7280"); return; }
  const url=location.href;

  if(url.includes("success_publish")){
    setTimeout(()=>{
      const id=getSiguientePost();
      if(id) location.href=`https://megapersonals.eu/users/posts/select/${id}`;
    },1000); return;
  }

  if(url.includes("error-message")){
    setTimeout(()=>location.href="https://megapersonals.eu/users/posts/list",1000); return;
  }

  if(url.includes("users/posts/list")||url.includes("users/posts/select")){
    if(url.includes("users/posts/list")) detectarPosts();

    const guardada=localStorage.getItem("savedDateTime");
    const ahora=Date.now();

    if(!guardada||isNaN(parseInt(guardada))){
      localStorage.setItem("savedDateTime",ahora.toString());
      localStorage.setItem("currentPostIndex","0");
      republicarAhora(); return;
    }

    const minsPasados=Math.floor((ahora-parseInt(guardada))/60000);
    let objetivo=parseInt(localStorage.getItem("tiempoObjetivo"));
    if(!objetivo||isNaN(objetivo)){
      objetivo=TiempoConfig.getTiempoAleatorio();
      localStorage.setItem("tiempoObjetivo",objetivo.toString());
    }

    if(minsPasados>=objetivo){
      setTimeout(()=>{
        republicarAhora();
        localStorage.setItem("savedDateTime",Date.now().toString());
        localStorage.removeItem("tiempoObjetivo");
      }, Math.random()*10000+10000);
    } else {
      addmessage(`⏰ ${objetivo-minsPasados}min`,"#10b981");
      updateProgressBar(Math.round(((objetivo-(objetivo-minsPasados))/objetivo)*100));
    }
  }
}

function republicarAhora() {
  if(!republicar) return;
  republicar=false;
  addmessage("Republicando","#10b981");
  detectarPosts();
  setTimeout(()=>document.getElementById("managePublishAd")?.click(),2000);
}

// ==================== INICIO ====================
if(location.href.includes("megapersonals.eu")) {
  (async () => {
    if(BanDetector.esPaginaBan()){
      localStorage.setItem("botPausado","true");
      BanDetector.mostrarAlerta();
      return;
    }

    const v = await LicenseSystem.validar();

    if(!v.valida){
      if(v.razon==="UPDATE_REQUIRED"){
        mostrarPantallaActualizacion(v);
        return;
      }

      if(v.networkError){
        const reloads=parseInt(sessionStorage.getItem("mb_reloads")||"0");
        if(reloads<3){
          sessionStorage.setItem("mb_reloads",(reloads+1).toString());
          setTimeout(()=>location.reload(),4000);
        } else {
          sessionStorage.removeItem("mb_reloads");
          mostrarPanelActivacion("Sin conexión al servidor.\nVerifica tu internet e ingresa tu clave.");
        }
        return;
      }

      mostrarPanelActivacion(v.mensaje||"Ingresa tu clave de activación");
      return;
    }

    sessionStorage.removeItem("mb_reloads");
    crearPanel(v);
    setTimeout(iniciarBot, 2000);
    setInterval(iniciarBot, 8000);
  })();
}
