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
// - Vista del post actual: headline, info, body, fotos vía proxy
// - Cronómetro de próximo bump + info de renta (integrados al estilo)
// - Flechas ← → para navegar si tiene varios posts
// - NO muestra "Your other posts" (decisión del usuario)

import { useState } from "react";
import type { ClientData, PostData } from "../lib/types";
import { imagenViaProxy, WHATSAPP_NUMERO } from "../lib/constants";

interface VistaClienteMPProps {
  clientData: ClientData;
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
}

export default function VistaClienteMP({
  clientData,
  postIdActual,
  postIdsOrdenados,
  now,
  isAdmin,
  onCambiarPost,
  onEditClick,
  onPausarToggle,
  onAbrirConfigRenta,
  onLogout,
}: VistaClienteMPProps) {
  const post: PostData | undefined = clientData.posts[postIdActual];
  const [modalProhibido, setModalProhibido] = useState<string | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null);

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

  // Mensaje WhatsApp para botones prohibidos
  const whatsappLink = (accion: string) =>
    `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
      `Hola Angel, quiero ${accion} en mi cuenta (${clientData.displayName})`
    )}`;

  const handleClickProhibido = (accion: string) => {
    setModalProhibido(accion);
  };

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
            disabled={enEdicion && !editAplicada && !editFallida}
            title={enEdicion ? "Ya hay una edición en curso" : "Editar este post"}
          >
            Edit Post
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
          >
            {pausado ? "▶ Reanudar Anuncio" : "⏸ Pausar Anuncio"}
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
          ) : enEdicion && (esperandoCaptcha || captchaListo) ? (
            <div className="vcmp-status vcmp-status-editing">
              ✏️ Edición en curso — ve a tu pestaña de edición para continuar
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

        {/* Caja de info de RENTA — siempre visible para el cliente */}
        {rentInfo && (
          <div className="vcmp-rent-row">
            {rentInfo.status === "deuda" ? (
              <div className="vcmp-rent vcmp-rent-debt">
                <div className="vcmp-rent-icon">💰</div>
                <div className="vcmp-rent-text">
                  <div className="vcmp-rent-title">RENTA VENCIDA</div>
                  <div className="vcmp-rent-sub">En deuda: {rentInfo.days}d {rentInfo.hours}h — contacta a Angel para reactivar</div>
                </div>
              </div>
            ) : rentInfo.isWarning ? (
              <div className="vcmp-rent vcmp-rent-warning">
                <div className="vcmp-rent-icon">⚠️</div>
                <div className="vcmp-rent-text">
                  <div className="vcmp-rent-title">Renta vence pronto</div>
                  <div className="vcmp-rent-sub">Quedan: {rentInfo.days}d {rentInfo.hours}h</div>
                </div>
              </div>
            ) : (
              <div className="vcmp-rent vcmp-rent-active">
                <div className="vcmp-rent-icon">📅</div>
                <div className="vcmp-rent-text">
                  <div className="vcmp-rent-title">Renta activa</div>
                  <div className="vcmp-rent-sub">
                    {rentInfo.days > 0 ? `${rentInfo.days} día${rentInfo.days !== 1 ? "s" : ""} ` : ""}
                    {rentInfo.hours} hora{rentInfo.hours !== 1 ? "s" : ""} restantes
                  </div>
                </div>
              </div>
            )}
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
    </div>
  );
}
