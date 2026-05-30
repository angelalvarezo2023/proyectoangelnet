// BotonSoporte — botón flotante de soporte en la vista cliente.
//
// Al tocarlo, abre un menú con 5 opciones de problemas comunes.
// Cada opción genera un mensaje pre-escrito y redirige al chat de
// Telegram de soporte (Angel). Las opciones de cambio de número y
// fotos piden datos extra antes de redirigir.
//
// Reglas especiales:
// - Cambio de fotos: solo 1 vez por semana. Si el cliente ya pidió en
//   los últimos 7 días, se bloquea con un mensaje informando cuánto
//   falta. Esto se guarda en post.lastPhotoChangeRequest.

import { useState } from "react";
import type { ClientData, PostData } from "../lib/types";
import { TELEGRAM_SOPORTE, FB_URL } from "../lib/constants";

interface BotonSoporteProps {
  clientData: ClientData;
  clientKey: string;
  postIdActual: string;
}

type Vista =
  | "menu"          // menú inicial con las 5 opciones
  | "num-input"     // input del nuevo número (cambiar número o cambiar fotos)
  | "fotos-info"    // info de cambio de fotos (con submenu)
  | "fotos-bloqueado"; // bloqueado por regla 1/semana

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export default function BotonSoporte({ clientData, clientKey, postIdActual }: BotonSoporteProps) {
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>("menu");
  const [contexto, setContexto] = useState<"numero" | "fotos">("numero");
  const [nuevoNumero, setNuevoNumero] = useState("");
  const [diasRestantesBloqueo, setDiasRestantesBloqueo] = useState(0);

  const post: PostData | undefined = clientData.posts[postIdActual];
  const navegador = post?.browserName || "sin nombre";
  const nombreCliente = clientData.displayName || clientKey;

  const cerrar = () => {
    setAbierto(false);
    setVista("menu");
    setNuevoNumero("");
  };

  // Construye el "pie" común de todos los mensajes con datos del cliente,
  // su post actual y su navegador (para que el soporte sepa dónde buscar).
  const piePersonalizado = () => {
    return `\n\n---\nCliente: ${nombreCliente}\nPost: #${postIdActual}\nNavegador: ${navegador}`;
  };

  const abrirTelegram = (mensaje: string) => {
    const url = `${TELEGRAM_SOPORTE}?text=${encodeURIComponent(mensaje + piePersonalizado())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    cerrar();
  };

  // --- Acciones del menú ---

  const reportarPaginaNoSube = () => {
    abrirTelegram(
      `Hola, soy ${nombreCliente}. Mi página no está subiendo, por favor revísala.`
    );
  };

  const reportarBloqueoPost = () => {
    abrirTelegram(
      `Hola, soy ${nombreCliente}. Creo que mi post se bloqueó, por favor revisarlo.`
    );
  };

  const reportarProblemaEdicion = () => {
    abrirTelegram(
      `Hola, soy ${nombreCliente}. Tuve un problema editando mi página, necesito ayuda.`
    );
  };

  const iniciarCambioNumero = () => {
    setContexto("numero");
    setNuevoNumero("");
    setVista("num-input");
  };

  const iniciarCambioFotos = () => {
    // Verificar regla "1 cambio de fotos por semana"
    if (post?.lastPhotoChangeRequest) {
      const transcurrido = Date.now() - post.lastPhotoChangeRequest;
      if (transcurrido < SIETE_DIAS_MS) {
        const dias = Math.ceil((SIETE_DIAS_MS - transcurrido) / (24 * 60 * 60 * 1000));
        setDiasRestantesBloqueo(dias);
        setVista("fotos-bloqueado");
        return;
      }
    }
    setVista("fotos-info");
  };

  const confirmarCambioFotosYaListo = () => {
    // El cliente dice que ya tiene el número nuevo → pedirlo
    setContexto("fotos");
    setNuevoNumero("");
    setVista("num-input");
  };

  const enviarSolicitud = async () => {
    const num = nuevoNumero.trim();
    if (!num) {
      alert("⚠️ Por favor escribe el nuevo número");
      return;
    }

    if (contexto === "numero") {
      abrirTelegram(
        `Hola, soy ${nombreCliente}. Quiero cambiar mi número.\nNuevo número: ${num}`
      );
    } else {
      // Cambio de fotos: registrar la solicitud en Firebase
      try {
        await fetch(
          `${FB_URL}/clients/${clientKey}/posts/${postIdActual}/lastPhotoChangeRequest.json`,
          {
            method: "PUT",
            body: JSON.stringify(Date.now()),
          }
        );
      } catch (e) {
        console.warn("No se pudo registrar la fecha del cambio de fotos:", e);
      }
      abrirTelegram(
        `Hola, soy ${nombreCliente}. Quiero cambiar mis fotos.\nTengo el número nuevo listo: ${num}`
      );
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        className="vcmp-soporte-btn"
        onClick={() => setAbierto(true)}
        aria-label="Soporte"
        title="Soporte"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="currentColor"
            d="M12 2C7 2 3 6 3 11v6c0 1.7 1.3 3 3 3h2v-8H5v-1c0-3.9 3.1-7 7-7s7 3.1 7 7v1h-3v8h3c1.7 0 3-1.3 3-3v-6c0-5-4-9-9-9zM7 14v4H6c-.6 0-1-.4-1-1v-3h2zm12 0v3c0 .6-.4 1-1 1h-1v-4h2z"
          />
        </svg>
      </button>

      {/* Modal */}
      {abierto && (
        <div className="vcmp-soporte-overlay" onClick={cerrar}>
          <div className="vcmp-soporte-modal" onClick={(e) => e.stopPropagation()}>
            <button className="vcmp-soporte-close" onClick={cerrar} aria-label="Cerrar">
              ✕
            </button>

            {/* === MENÚ PRINCIPAL === */}
            {vista === "menu" && (
              <>
                <div className="vcmp-soporte-header">
                  <div className="vcmp-soporte-icon-big">🎧</div>
                  <h2>Centro de Soporte</h2>
                  <p>¿En qué podemos ayudarte?</p>
                </div>

                <div className="vcmp-soporte-options">
                  <button className="vcmp-soporte-option" onClick={reportarPaginaNoSube}>
                    <span className="vcmp-soporte-emoji">🚫</span>
                    <div className="vcmp-soporte-option-text">
                      <strong>Mi página no está subiendo</strong>
                      <small>Revisar por qué no aparece</small>
                    </div>
                  </button>

                  <button className="vcmp-soporte-option" onClick={reportarBloqueoPost}>
                    <span className="vcmp-soporte-emoji">🔒</span>
                    <div className="vcmp-soporte-option-text">
                      <strong>Creo que mi post se bloqueó</strong>
                      <small>Revisar el estado del post</small>
                    </div>
                  </button>

                  <button className="vcmp-soporte-option" onClick={reportarProblemaEdicion}>
                    <span className="vcmp-soporte-emoji">✏️</span>
                    <div className="vcmp-soporte-option-text">
                      <strong>Problema editando mi página</strong>
                      <small>Tuve dificultades con la edición</small>
                    </div>
                  </button>

                  <button className="vcmp-soporte-option" onClick={iniciarCambioNumero}>
                    <span className="vcmp-soporte-emoji">📞</span>
                    <div className="vcmp-soporte-option-text">
                      <strong>Quiero cambiar mi número</strong>
                      <small>Actualizar el teléfono del anuncio</small>
                    </div>
                  </button>

                  <button className="vcmp-soporte-option" onClick={iniciarCambioFotos}>
                    <span className="vcmp-soporte-emoji">📸</span>
                    <div className="vcmp-soporte-option-text">
                      <strong>Quiero cambiar mis fotos</strong>
                      <small>Actualizar las imágenes (1 cambio por semana)</small>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* === INPUT DE NUEVO NÚMERO === */}
            {vista === "num-input" && (
              <>
                <div className="vcmp-soporte-header">
                  <div className="vcmp-soporte-icon-big">
                    {contexto === "numero" ? "📞" : "📸"}
                  </div>
                  <h2>
                    {contexto === "numero"
                      ? "Cambiar mi número"
                      : "Cambiar mis fotos"}
                  </h2>
                  <p>
                    Por favor, introduce el nuevo número de teléfono que vas a usar.
                  </p>
                </div>

                <input
                  type="tel"
                  className="vcmp-soporte-input"
                  placeholder="Ej: +1 380 555 0123"
                  value={nuevoNumero}
                  onChange={(e) => setNuevoNumero(e.target.value)}
                  autoFocus
                />

                <div className="vcmp-soporte-actions">
                  <button
                    className="vcmp-soporte-back"
                    onClick={() => setVista("menu")}
                  >
                    ← Atrás
                  </button>
                  <button
                    className="vcmp-soporte-submit"
                    onClick={enviarSolicitud}
                    disabled={!nuevoNumero.trim()}
                  >
                    💬 Enviar a soporte
                  </button>
                </div>
              </>
            )}

            {/* === INFO DE CAMBIO DE FOTOS === */}
            {vista === "fotos-info" && (
              <>
                <div className="vcmp-soporte-header">
                  <div className="vcmp-soporte-icon-big">📸</div>
                  <h2>Cambiar mis fotos</h2>
                </div>

                <div className="vcmp-soporte-info">
                  <p>
                    Para cambiar las fotos necesitas:
                  </p>
                  <ul>
                    <li>📞 Un <strong>número de teléfono nuevo</strong> sin uso previo</li>
                    <li>📅 Solo <strong>1 cambio permitido por semana</strong></li>
                  </ul>
                  <p>¿Ya tienes el número nuevo listo?</p>
                </div>

                <div className="vcmp-soporte-actions">
                  <button
                    className="vcmp-soporte-back"
                    onClick={() => setVista("menu")}
                  >
                    ← Cancelar
                  </button>
                  <button
                    className="vcmp-soporte-secondary"
                    onClick={cerrar}
                  >
                    Aún lo busco
                  </button>
                  <button
                    className="vcmp-soporte-submit"
                    onClick={confirmarCambioFotosYaListo}
                  >
                    ✓ Ya lo tengo
                  </button>
                </div>
              </>
            )}

            {/* === BLOQUEADO: ya hizo cambio esta semana === */}
            {vista === "fotos-bloqueado" && (
              <>
                <div className="vcmp-soporte-header">
                  <div className="vcmp-soporte-icon-big">⏳</div>
                  <h2>Espera un momento</h2>
                  <p>
                    Ya solicitaste un cambio de fotos hace poco.
                    <br />
                    Solo está permitido <strong>1 cambio por semana</strong>.
                  </p>
                </div>

                <div className="vcmp-soporte-info" style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#c41e3a" }}>
                    Disponible en {diasRestantesBloqueo} día{diasRestantesBloqueo !== 1 ? "s" : ""}
                  </p>
                  <p style={{ fontSize: 13 }}>
                    Si es urgente, contacta directamente al soporte por otro motivo.
                  </p>
                </div>

                <div className="vcmp-soporte-actions">
                  <button
                    className="vcmp-soporte-back"
                    onClick={() => setVista("menu")}
                  >
                    ← Volver al menú
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
