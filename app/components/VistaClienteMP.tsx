// VistaClienteMP — Vista del cliente con estilo MegaPersonals 1:1
//
// Replica visualmente la página /users/posts/list de MegaPersonals para que el
// cliente se sienta familiar al editar su anuncio. Reemplaza las tarjetas
// oscuras anteriores cuando step === "cards" y el cliente NO es admin.
//
// Funcionalidades:
// - Logo y banner "Manage Posts" estilo MegaPersonals
// - 4 botones grandes (Edit Post / Write New / Remove Post / Bump to Top)
//   * Solo "Edit Post" es funcional → abre el modal de edición existente
//   * Los otros 3 muestran modal "Prohibido — contacta Angel por WhatsApp"
// - Botón extra "Pausar/Reanudar" estilo MegaPersonals
//   * Bloqueado durante edición (con mensaje claro al cliente)
//   * Cooldown de 10 seg después de cada cambio para prevenir desync con el bot
// - Botón "Pagar Renta por WhatsApp" estilo WhatsApp cuando hay warning o deuda
// - Vista del post actual: headline, info, body, fotos vía proxy
// - Cronómetro de próximo bump + info de renta (integrados al estilo)
// - Flechas ← → para navegar si tiene varios posts
// - NO muestra "Your other posts" (decisión del usuario)

import { useState, useEffect } from "react";
import type { ClientData, PostData } from "../lib/types";
import { imagenViaProxy, WHATSAPP_NUMERO } from "../lib/constants";
import BotonSoporte from "./BotonSoporte";

interface VistaClienteMPProps {
  clientData: ClientData;
  clientKey: string;
  postIdActual: string;
  postIdsOrdenados: string[]; // todos los IDs ordenados por addedAt
  now: number;
  isAdmin: boolean;

  // Callbacks que llegan desde page.tsx para manejar acciones
  onCambiarPost: (newPostId: string) => void;
  onEditClick: (postId: string) => void;
  onPausarToggle: (postId: string) => void;
  onAbrirConfigRenta: (postId: string) => void; // solo admin
  onLogout: () => void;

  // Props nuevas (opcionales para mantener compatibilidad)
  tieneEdicionEnProceso?: boolean;
  pauseCooldownMs?: number;
  onPagarRentaWhatsApp?: (postId: string) => void;
}

export default function VistaClienteMP({
  clientData,
  clientKey,
  postIdActual,
  postIdsOrdenados,
  now,
  isAdmin,
  onCambiarPost,
  onEditClick,
  onPausarToggle,
  onAbrirConfigRenta,
  onLogout,
  tieneEdicionEnProceso = false,
  pauseCooldownMs = 0,
  onPagarRentaWhatsApp,
}: VistaClienteMPProps) {
  const post: PostData | undefined = clientData.posts[postIdActual];
  const [modalProhibido, setModalProhibido] = useState<string | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null);
  const [mostrarBackToTop, setMostrarBackToTop] = useState(false);

  // Mostrar botón "back to top" cuando el usuario haya bajado más de 300px
  useEffect(() => {
    const onScroll = () => {
      setMostrarBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // chequeo inicial
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollAlInicio = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!post) {
    return (
      <div className="vcmp-empty">
        <p>No se encontró el post.</p>
        <button onClick={onLogout}>Volver</button>
      </div>
    );
  }

  // Índice del post actual para las flechas de navegación
  const indiceActual = postIdsOrdenados.indexOf(postIdActual);
  const tieneAnterior = indiceActual > 0;
  const tieneSiguiente = indiceActual < postIdsOrdenados.length - 1;

  // Cronómetro de próximo bump
  const msHastaBump = Math.max(0, post.nextBumpAt - now);
  const minHastaBump = Math.floor(msHastaBump / 60000);
  const segHastaBump = Math.floor((msHastaBump % 60000) / 1000);
  const enEdicion = !!post.editRequest;
  const esperandoCaptcha = post.editRequest?.status === "captcha_pendiente";
  const captchaListo = post.editRequest?.status === "captcha_listo";
  const listoParaPublicar = post.editRequest?.status === "listo_para_publicar";
  const editAplicada = post.editRequest?.status === "aplicada";
  const editFallida = post.editRequest?.status === "fallida";

  // Cooldown del botón pausar (segundos restantes)
  const cooldownSegRestantes = Math.ceil(pauseCooldownMs / 1000);

  // Info de renta
  const rentInfo = (() => {
    if (!post.rentExpiresAt) return null;
    const diff = post.rentExpiresAt - now;
    if (diff <= 0) {
      // En deuda
      const debt = -diff;
      const days = Math.floor(debt / (24 * 3600 * 1000));
      const hours = Math.floor((debt % (24 * 3600 * 1000)) / (3600 * 1000));
      return { status: "deuda" as const, days, hours };
    }
    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
    const isWarning = diff <= 24 * 3600 * 1000;
    return { status: "active" as const, days, hours, isWarning };
  })();

  // Datos capturados del post (fotos + texto + info)
  // El bot llena post.data en cada bump. Si aún no hay data, mostramos placeholder.
  const datos = post.data;
  const fotos = datos?.images || [];
  const titulo = datos?.title || post.editRequest?.currentValues?.title || null;
  const cuerpo = datos?.body || post.editRequest?.currentValues?.body || null;
  const telefono = datos?.phone || null;
  const edad = datos?.age || post.editRequest?.currentValues?.age || null;
  const ciudad = datos?.city || post.editRequest?.currentValues?.cityName || null;
  const ubicacion = datos?.location || post.editRequest?.currentValues?.location || null;
  const nombre = post.editRequest?.currentValues?.name || null;

  // Estado pausado
  const pausado = post.status === "paused";

  // ¿Mostrar el botón "Pagar Renta por WhatsApp"?
  const mostrarBotonPagarRenta =
    rentInfo && (rentInfo.status === "deuda" || (rentInfo.status === "active" && rentInfo.isWarning));

  // Handler para pagar renta: usa el callback si existe, si no abre WhatsApp directo
  const handlePagarRenta = () => {
    if (onPagarRentaWhatsApp) {
      onPagarRentaWhatsApp(postIdActual);
    } else {
      const mensaje = `Hola Angel, quiero pagar la renta de mi anuncio (#${postIdActual}) - ${clientData.displayName}`;
      window.open(
        `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`,
        "_blank"
      );
    }
  };

  // Mensaje WhatsApp para botones prohibidos
  const whatsappLink = (accion: string) =>
    `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
      `Hola Angel, quiero ${accion} en mi cuenta (${clientData.displayName})`
    )}`;

  const handleClickProhibido = (accion: string) => {
    setModalProhibido(accion);
  };

  // Determinar estado del botón Pausar/Reanudar
  const pausarBloqueadoPorEdicion = tieneEdicionEnProceso;
  const pausarEnCooldown = pauseCooldownMs > 0;
  const pausarDisabled = pausarBloqueadoPorEdicion || pausarEnCooldown;

  let pausarLabel: string;
  let pausarTitle: string;
  if (pausarBloqueadoPorEdicion) {
    pausarLabel = pausado ? "🔒 Pausado (Editando)" : "🔒 No se puede pausar (Editando)";
    pausarTitle = "El robot está editando tu post. No necesitas pausar para editar.";
  } else if (pausarEnCooldown) {
    pausarLabel = `⏱ Espera ${cooldownSegRestantes}s`;
    pausarTitle = "Espera unos segundos para que el robot se sincronice";
  } else {
    pausarLabel = pausado ? "▶ Reanudar Anuncio" : "⏸ Pausar Anuncio";
    pausarTitle = pausado ? "Reanudar este anuncio" : "Pausar este anuncio";
  }

  return (
    <div className="vcmp-wrapper">
      {/* Botón flotante para cerrar sesión */}
      <button className="vcmp-logout" onClick={onLogout}>
        ← Cerrar sesión
      </button>

      <div className="vcmp-container">
        {/* Logo de MegaPersonals */}
        <div className="vcmp-logo">
          <img src="/megapersonals-img/megapersonalsHeaderLogo_v2.png" alt="MegaPersonals" />
        </div>

        {/* Banner "Manage Posts" — la imagen ya incluye chica diabla + cinta */}
        <div className="vcmp-banner">
          <img
            className="vcmp-banner-img"
            src="/megapersonals-img/megapersonalsHeaderBackground.png"
            alt="Manage Posts"
          />
        </div>

        {/* Los 4 botones grandes (sólo Edit Post funciona) */}
        <div className="vcmp-buttons-grid">
          <button
            className="vcmp-mbtn vcmp-mbtn-red"
            onClick={() => onEditClick(postIdActual)}
            disabled={
              // Deshabilitado SOLO cuando el captcha está pendiente (esperando turno)
              // o ya esperando bump para publicar. En captcha_listo SÍ funciona (entra al formulario).
              esperandoCaptcha || listoParaPublicar
            }
            title={
              esperandoCaptcha
                ? "Esperando captcha del sistema..."
                : captchaListo
                  ? "Captcha listo, toca para continuar"
                  : listoParaPublicar
                    ? "Cambios listos, esperando turno de bump"
                    : "Editar este post"
            }
          >
            {captchaListo ? "🔐 Continuar Edición" : "Edit Post"}
          </button>
          <button
            className="vcmp-mbtn vcmp-mbtn-blue"
            onClick={() => handleClickProhibido("crear un nuevo post (Write New)")}
          >
            Write New
          </button>
          <button
            className="vcmp-mbtn vcmp-mbtn-orange"
            onClick={() => handleClickProhibido("eliminar este post (Remove Post)")}
          >
            Remove Post
          </button>
          <button
            className="vcmp-mbtn vcmp-mbtn-cyan"
            onClick={() => handleClickProhibido("hacer Bump to Top manualmente")}
          >
            Bump to Top
          </button>
        </div>

        {/* Botón extra: Pausar/Reanudar (sólo lo ve el cliente, mismo estilo) */}
        <div className="vcmp-buttons-extra">
          <button
            className={`vcmp-mbtn ${pausado ? "vcmp-mbtn-green" : "vcmp-mbtn-purple"}`}
            onClick={() => onPausarToggle(postIdActual)}
            disabled={pausarDisabled}
            title={pausarTitle}
            style={pausarDisabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
          >
            {pausarLabel}
          </button>
          {isAdmin && (
            <button
              className="vcmp-mbtn vcmp-mbtn-gold"
              onClick={() => onAbrirConfigRenta(postIdActual)}
            >
              ⚙ Configurar Renta
            </button>
          )}
        </div>

        {/* Aviso si hay edición en proceso: explica al cliente que NO necesita pausar */}
        {pausarBloqueadoPorEdicion && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.1))",
              border: "1.5px solid rgba(59, 130, 246, 0.35)",
              borderRadius: 12,
              padding: "12px 16px",
              margin: "12px auto 0",
              maxWidth: 600,
              fontSize: 13,
              color: "#3b5298",
              fontWeight: 600,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            ℹ️ <strong>Aviso:</strong> Para editar tu anuncio NO necesitas pausar primero.
            El robot maneja todo automáticamente. El botón Pausar se reactiva cuando termine la edición.
          </div>
        )}

        {/* Separador decorativo */}
        <div className="vcmp-divider">
          <img
            src="/megapersonals-img/horizontal-divider__hight-contrast.png"
            alt=""
          />
        </div>

        {/* Estado del post / cronómetro de bump */}
        <div className="vcmp-status-row">
          {pausado ? (
            <div className="vcmp-status vcmp-status-paused">
              ⏸ PUBLICACIÓN PAUSADA
            </div>
          ) : enEdicion && listoParaPublicar && msHastaBump > 0 ? (
            <div className="vcmp-status vcmp-status-waiting">
              ⏳ Haciendo cambios — {minHastaBump > 0
                ? `${minHastaBump} min ${segHastaBump.toString().padStart(2, "0")}s`
                : `${segHastaBump}s`} restantes
            </div>
          ) : enEdicion && esperandoCaptcha ? (
            <div className="vcmp-status vcmp-status-editing">
              ⏳ Esperando captcha del sistema (puede tardar unos minutos)...
            </div>
          ) : enEdicion && captchaListo ? (
            <div className="vcmp-status vcmp-status-editing">
              📸 Captcha listo. Toca el botón "Edit Post" para continuar.
            </div>
          ) : editAplicada ? (
            <div className="vcmp-status vcmp-status-applied">
              ✅ Cambios aplicados exitosamente
            </div>
          ) : editFallida ? (
            <div className="vcmp-status vcmp-status-failed">
              ✗ Edición falló{post.editRequest?.failReason ? `: ${post.editRequest.failReason}` : ""}
            </div>
          ) : (
            <div className="vcmp-status vcmp-status-active">
              🟢 Próximo bump en{" "}
              <strong>
                {minHastaBump > 0
                  ? `${minHastaBump} min ${segHastaBump.toString().padStart(2, "0")}s`
                  : `${segHastaBump}s`}
              </strong>
            </div>
          )}
        </div>

        {/* Caja de info de RENTA — estilo MegaPersonals con cinta dorada */}
        {rentInfo && (
          <div className="vcmp-rent-row">
            <div className={`vcmp-rent ${
              rentInfo.status === "deuda"
                ? "vcmp-rent-debt"
                : rentInfo.isWarning
                  ? "vcmp-rent-warning"
                  : "vcmp-rent-active"
            }`}>
              <div className="vcmp-rent-ribbon">
                {rentInfo.status === "deuda" ? "EN DEUDA" : rentInfo.isWarning ? "POR VENCER" : "ACTIVA"}
              </div>
              <div className="vcmp-rent-content">
                <div className="vcmp-rent-icon">
                  {rentInfo.status === "deuda" ? "💰" : rentInfo.isWarning ? "⏰" : "✨"}
                </div>
                <div className="vcmp-rent-info">
                  <div className="vcmp-rent-label">
                    {rentInfo.status === "deuda" ? "Tu Renta Venció" : "Tiempo de Renta Restante"}
                  </div>
                  <div className="vcmp-rent-time">
                    {rentInfo.status === "deuda" ? (
                      <>
                        <span className="vcmp-rent-num">{rentInfo.days}</span>
                        <span className="vcmp-rent-unit">{rentInfo.days === 1 ? "día" : "días"}</span>
                        <span className="vcmp-rent-num">{rentInfo.hours}</span>
                        <span className="vcmp-rent-unit">{rentInfo.hours === 1 ? "hora" : "horas"}</span>
                      </>
                    ) : (
                      <>
                        {rentInfo.days > 0 && (
                          <>
                            <span className="vcmp-rent-num">{rentInfo.days}</span>
                            <span className="vcmp-rent-unit">{rentInfo.days === 1 ? "día" : "días"}</span>
                          </>
                        )}
                        <span className="vcmp-rent-num">{rentInfo.hours}</span>
                        <span className="vcmp-rent-unit">{rentInfo.hours === 1 ? "hora" : "horas"}</span>
                      </>
                    )}
                  </div>
                  {rentInfo.status === "deuda" && (
                    <div className="vcmp-rent-action">
                      💬 Contacta a Angel para reactivar
                    </div>
                  )}
                </div>
              </div>

              {/* Botón "Pagar Renta por WhatsApp" — visible en warning y deuda */}
              {mostrarBotonPagarRenta && (
                <button
                  onClick={handlePagarRenta}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    width: "calc(100% - 32px)",
                    margin: "16px 16px 18px",
                    background: "linear-gradient(135deg, #25d366 0%, #128c7e 100%)",
                    color: "white",
                    padding: "16px 24px",
                    borderRadius: 14,
                    fontWeight: 800,
                    fontSize: 15,
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    border: "none",
                    cursor: "pointer",
                    boxShadow:
                      "0 8px 22px rgba(37, 211, 102, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                    fontFamily: "inherit",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  }}
                  title="Pagar la renta de este anuncio por WhatsApp"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.522l4.625-1.476A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-5.226-1.526l-.375-.237-3.872 1.013 1.035-3.776-.244-.388A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                  </svg>
                  {rentInfo.status === "deuda" ? "Reactivar Anuncio - Pagar Renta" : "Pagar Renta por WhatsApp"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Título "Current Post" */}
        <div className="vcmp-current-post-title">CURRENT POST</div>

        {/* Caja del Headline */}
        {titulo && (
          <div className="vcmp-headline-box">
            <div className="vcmp-headline-text">{titulo}</div>
          </div>
        )}

        {/* Info (Phone, Age, City, Location) — estructura idéntica a MegaPersonals */}
        <div className="vcmp-info">
          {telefono && (
            <div className="vcmp-info-row">
              <span className="vcmp-info-label">Phone:</span>
              <span className="vcmp-info-value">{telefono}</span>
              {edad && (
                <>
                  <span className="vcmp-info-label vcmp-info-label-right">Age:</span>
                  <span className="vcmp-info-value">{edad}</span>
                </>
              )}
            </div>
          )}
          {!telefono && edad && (
            <div className="vcmp-info-row">
              <span className="vcmp-info-label">Age:</span>
              <span className="vcmp-info-value">{edad}</span>
            </div>
          )}
          {ciudad && (
            <div className="vcmp-info-row">
              <span className="vcmp-info-label">City:</span>
              <span className="vcmp-info-value">{ciudad}</span>
            </div>
          )}
          {ubicacion && (
            <div className="vcmp-info-row">
              <span className="vcmp-info-label">Location:</span>
              <span className="vcmp-info-value">{ubicacion}</span>
            </div>
          )}
          {nombre && (
            <div className="vcmp-info-row">
              <span className="vcmp-info-label">Name:</span>
              <span className="vcmp-info-value">{nombre}</span>
            </div>
          )}
          {!telefono && !edad && !ciudad && !ubicacion && (
            <div className="vcmp-info-empty">
              📋 Los datos del post se actualizarán cuando el bot pase por tu publicación
            </div>
          )}
        </div>

        {/* Caja del Body */}
        {cuerpo && (
          <div className="vcmp-body-box">
            <div className="vcmp-body-text">{cuerpo}</div>
          </div>
        )}

        {/* Carrusel de fotos con efecto fotograma */}
        {fotos.length > 0 ? (
          <div className="vcmp-photos">
            {fotos.map((url, i) => (
              <div key={i} className="vcmp-photo-frame" onClick={() => setFotoAmpliada(i)}>
                <img src={imagenViaProxy(url)} alt={`Foto ${i + 1}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="vcmp-photos-empty">
            📸 Las fotos se actualizarán cuando el bot pase por tu post (máx. 15 min)
          </div>
        )}

        {/* Datos del bump */}
        <div className="vcmp-published">
          <span>Post published:</span>
          <strong>{post.lastBumpAt ? new Date(post.lastBumpAt).toLocaleString() : "—"}</strong>
        </div>

        {/* Navegación entre posts (si tiene más de uno) */}
        {postIdsOrdenados.length > 1 && (
          <div className="vcmp-nav">
            <button
              className="vcmp-nav-btn"
              disabled={!tieneAnterior}
              onClick={() => onCambiarPost(postIdsOrdenados[indiceActual - 1])}
            >
              ← Anterior
            </button>
            <div className="vcmp-nav-counter">
              Post {indiceActual + 1} de {postIdsOrdenados.length}
            </div>
            <button
              className="vcmp-nav-btn"
              disabled={!tieneSiguiente}
              onClick={() => onCambiarPost(postIdsOrdenados[indiceActual + 1])}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Modal "Prohibido" cuando tocan Write New / Remove Post / Bump to Top */}
      {modalProhibido && (
        <div className="vcmp-modal-overlay" onClick={() => setModalProhibido(null)}>
          <div className="vcmp-prohibido-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vcmp-prohibido-icon">🔒</div>
            <h2>Función bloqueada</h2>
            <p>
              No tienes permiso para <strong>{modalProhibido}</strong>.
              <br />
              Solo Angel puede realizar esta acción. Contáctalo por WhatsApp.
            </p>
            <a
              className="vcmp-prohibido-whatsapp"
              href={whatsappLink(modalProhibido)}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 Contactar con Angel
            </a>
            <button className="vcmp-prohibido-close" onClick={() => setModalProhibido(null)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de foto ampliada */}
      {fotoAmpliada !== null && fotos[fotoAmpliada] && (
        <div className="vcmp-foto-overlay" onClick={() => setFotoAmpliada(null)}>
          <img
            className="vcmp-foto-grande"
            src={imagenViaProxy(fotos[fotoAmpliada])}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
          <button className="vcmp-foto-close" onClick={() => setFotoAmpliada(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Botón flotante "Back to top" (estilo MegaPersonals) */}
      {mostrarBackToTop && (
        <button
          className="vcmp-back-to-top"
          onClick={scrollAlInicio}
          aria-label="Volver al inicio"
          title="Volver al inicio"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12L5.4 13.4L11 7.8V20H13V7.8L18.6 13.4L20 12L12 4Z" fill="currentColor"/>
          </svg>
        </button>
      )}

      {/* Botón flotante de Soporte (esquina inferior derecha) */}
      <BotonSoporte
        clientData={clientData}
        clientKey={clientKey}
        postIdActual={postIdActual}
      />
    </div>
  );
}
