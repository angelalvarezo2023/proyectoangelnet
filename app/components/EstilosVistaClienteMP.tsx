// EstilosVistaClienteMP — CSS específico de la vista cliente MegaPersonals.
// Se incluye una sola vez junto con VistaClienteMP.

const ESTILOS_VCMP = String.raw`
/* ============================================================
 * VISTA CLIENTE MEGAPERSONALS 1:1
 * Replica visual de la página /users/posts/list de MegaPersonals.
 * ============================================================ */

.vcmp-wrapper {
  position: relative;
  min-height: 100vh;
  background: rgb(253, 246, 251);
  font-family: Arial, "sans serif";
  color: #333;
  padding: 16px 0 50px;
}

.vcmp-logout {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid rgba(253, 52, 171, 0.4);
  color: #d63384;
  padding: 8px 16px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.vcmp-logout:hover {
  background: white;
  border-color: #d63384;
  transform: translateY(-1px);
}

.vcmp-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 12px;
  background: rgb(253, 246, 251);
  position: relative;
}

/* Logo — tamaño contenido para no estirarse */
.vcmp-logo {
  text-align: center;
  margin-bottom: 14px;
}

.vcmp-logo img {
  max-width: 380px;
  width: 70%;
  height: auto;
}

/* Banner "Manage Posts" — la imagen ya incluye chica diabla + cinta */
.vcmp-banner {
  width: 100%;
  margin-bottom: 18px;
  text-align: center;
}

.vcmp-banner-img {
  max-width: 100%;
  width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

/* Grid de 4 botones grandes */
.vcmp-buttons-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
  padding: 0 8px;
}

.vcmp-buttons-extra {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 14px;
  padding: 0 8px;
}

.vcmp-buttons-extra .vcmp-mbtn {
  max-width: 260px;
  margin: 0 auto;
  width: 100%;
}

/* Botones tipo MegaPersonals - gradientes con borde dorado, más compactos */
.vcmp-mbtn {
  position: relative;
  padding: 11px 6px;
  border: 3px solid #f4b945;
  border-radius: 40px;
  cursor: pointer;
  font-family: "Arial Black", Arial, sans-serif;
  font-size: 15px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5),
               -1px -1px 0 rgba(0, 0, 0, 0.3),
               2px 2px 4px rgba(0, 0, 0, 0.4);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.22),
              inset 0 -3px 0 rgba(0, 0, 0, 0.15),
              inset 0 2px 0 rgba(255, 255, 255, 0.4);
  transition: transform 0.1s, box-shadow 0.15s, filter 0.15s;
  outline: none;
}

.vcmp-mbtn:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.08);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3),
              inset 0 -4px 0 rgba(0, 0, 0, 0.15),
              inset 0 3px 0 rgba(255, 255, 255, 0.4);
}

.vcmp-mbtn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.15),
              inset 0 2px 0 rgba(255, 255, 255, 0.3);
}

.vcmp-mbtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Variantes de color */
.vcmp-mbtn-red {
  background: linear-gradient(180deg, #f56b8e 0%, #e44875 40%, #c22f5d 60%, #e44875 100%);
}

.vcmp-mbtn-blue {
  background: linear-gradient(180deg, #5b9eed 0%, #2f7adf 40%, #1d5fb8 60%, #2f7adf 100%);
}

.vcmp-mbtn-orange {
  background: linear-gradient(180deg, #ffa75e 0%, #ff823c 40%, #de6822 60%, #ff823c 100%);
}

.vcmp-mbtn-cyan {
  background: linear-gradient(180deg, #7fdaff 0%, #4cc4f6 40%, #2da6d8 60%, #4cc4f6 100%);
}

.vcmp-mbtn-green {
  background: linear-gradient(180deg, #6cd99e 0%, #3fc079 40%, #29a464 60%, #3fc079 100%);
}

.vcmp-mbtn-purple {
  background: linear-gradient(180deg, #b988e7 0%, #9b66d6 40%, #7e4cba 60%, #9b66d6 100%);
}

.vcmp-mbtn-gold {
  background: linear-gradient(180deg, #f5d27f 0%, #e8b860 40%, #c79944 60%, #e8b860 100%);
}

/* Separador decorativo */
.vcmp-divider {
  text-align: center;
  margin: 8px 0 4px;
}

.vcmp-divider img {
  max-width: 75%;
  height: auto;
}

/* Estado/status del post */
.vcmp-status-row {
  margin-bottom: 12px;
}

.vcmp-status {
  padding: 10px 16px;
  border-radius: 10px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.vcmp-status-active {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04));
  border: 1.5px solid rgba(16, 185, 129, 0.35);
  color: #047857;
}

.vcmp-status-active strong {
  color: #065f46;
  font-weight: 800;
}

.vcmp-status-warn {
  color: #b45309;
  font-weight: 600;
}

.vcmp-status-paused {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04));
  border: 1.5px solid rgba(245, 158, 11, 0.4);
  color: #b45309;
  font-weight: 700;
}

.vcmp-status-debt {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.04));
  border: 1.5px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  font-weight: 700;
}

.vcmp-status-waiting {
  background: linear-gradient(135deg, rgba(212, 175, 95, 0.12), rgba(212, 175, 95, 0.04));
  border: 1.5px solid rgba(212, 175, 95, 0.4);
  color: #a16207;
  font-weight: 700;
}

.vcmp-status-editing {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(59, 130, 246, 0.04));
  border: 1.5px solid rgba(59, 130, 246, 0.35);
  color: #1e40af;
  font-weight: 700;
}

.vcmp-status-applied {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.06));
  border: 1.5px solid rgba(16, 185, 129, 0.45);
  color: #047857;
  font-weight: 800;
}

.vcmp-status-failed {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
  border: 1.5px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  font-weight: 700;
}

/* ============================================================
 * CAJA DE RENTA — siempre visible para el cliente
 * ============================================================ */
.vcmp-rent-row {
  margin-bottom: 12px;
}

.vcmp-rent {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 12px;
  border: 2px solid;
}

.vcmp-rent-icon {
  font-size: 26px;
  flex-shrink: 0;
  line-height: 1;
}

.vcmp-rent-text {
  flex: 1;
  min-width: 0;
}

.vcmp-rent-title {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 1px;
  letter-spacing: 0.3px;
}

.vcmp-rent-sub {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.85;
}

.vcmp-rent-active {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.03));
  border-color: rgba(34, 197, 94, 0.35);
  color: #047857;
}

.vcmp-rent-warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04));
  border-color: rgba(245, 158, 11, 0.45);
  color: #b45309;
}

.vcmp-rent-debt {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
  border-color: rgba(239, 68, 68, 0.5);
  color: #b91c1c;
  animation: vcmpDebtPulse 2s ease-in-out infinite;
}

@keyframes vcmpDebtPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

/* "CURRENT POST" - título grande pero más compacto */
.vcmp-current-post-title {
  font-family: "Anton", "Arial Black", Impact, sans-serif;
  font-size: 32px;
  font-weight: 900;
  text-align: center;
  color: #1a1a1a;
  letter-spacing: 1.5px;
  margin: 8px 0 14px;
}

/* Caja del headline */
.vcmp-headline-box {
  position: relative;
  background: white;
  border: 2px solid rgba(220, 20, 60, 0.7);
  border-radius: 80px;
  padding: 12px 20px;
  margin-bottom: 16px;
  box-shadow: 0 3px 10px rgba(220, 20, 60, 0.08);
}

.vcmp-headline-text {
  font-size: 13px;
  line-height: 1.45;
  color: #333;
  text-align: center;
  font-weight: 600;
}

/* Info (Phone, Age, City, Location, Name) */
.vcmp-info {
  margin-bottom: 16px;
  padding: 0 8px;
  font-size: 13px;
}

.vcmp-info-row {
  display: flex;
  gap: 8px;
  margin-bottom: 5px;
  flex-wrap: wrap;
  align-items: baseline;
}

.vcmp-info-label {
  color: #c41e3a;
  font-weight: 700;
}

.vcmp-info-label-right {
  margin-left: auto;
}

.vcmp-info-value {
  color: #333;
  font-weight: 500;
}

.vcmp-info-empty {
  padding: 14px 18px;
  background: rgba(255,255,255,0.6);
  border: 1.5px dashed rgba(220,20,60,0.3);
  border-radius: 10px;
  text-align: center;
  color: #888;
  font-size: 13px;
  font-style: italic;
}

/* Caja del body (anuncio) */
.vcmp-body-box {
  background: white;
  border: 2px solid rgba(220, 20, 60, 0.4);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 18px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
}

.vcmp-body-text {
  font-size: 13px;
  line-height: 1.55;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Galería de fotos con efecto fotograma */
.vcmp-photos {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  margin-bottom: 24px;
}

.vcmp-photo-frame {
  position: relative;
  background: white;
  padding: 10px 18px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.15s;
  /* Efecto fotograma: puntos blancos en bordes laterales */
  background-image:
    radial-gradient(circle 4px at 9px 10px, transparent 50%, transparent 50%),
    radial-gradient(circle 4px at calc(100% - 9px) 10px, transparent 50%, transparent 50%);
}

.vcmp-photo-frame::before,
.vcmp-photo-frame::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0 8px,
      rgba(255, 255, 255, 0.95) 8px 16px
    );
  background-color: rgba(255, 100, 150, 0.15);
}

.vcmp-photo-frame::before {
  left: 0;
}

.vcmp-photo-frame::after {
  right: 0;
}

.vcmp-photo-frame img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 2px;
  position: relative;
  z-index: 1;
}

.vcmp-photo-frame:hover {
  transform: translateY(-2px);
}

.vcmp-photos-empty {
  text-align: center;
  padding: 30px 20px;
  background: rgba(255, 255, 255, 0.7);
  border: 2px dashed rgba(220, 20, 60, 0.3);
  border-radius: 12px;
  color: #666;
  font-size: 14px;
  margin-bottom: 24px;
}

/* Post published */
.vcmp-published {
  background: white;
  border: 1.5px solid rgba(220, 20, 60, 0.5);
  border-radius: 100px;
  padding: 10px 20px;
  margin: 20px 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.vcmp-published span {
  color: #555;
  font-weight: 500;
}

.vcmp-published strong {
  color: #c41e3a;
  font-weight: 700;
  font-style: italic;
}

/* Navegación entre posts */
.vcmp-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border: 2px solid rgba(220, 20, 60, 0.3);
  border-radius: 100px;
  padding: 8px 14px;
  margin-top: 24px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.06);
}

.vcmp-nav-btn {
  background: linear-gradient(180deg, #f5a8c8 0%, #d96fa1 100%);
  color: white;
  border: 2px solid #f4b945;
  padding: 8px 16px;
  border-radius: 100px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  transition: filter 0.15s;
}

.vcmp-nav-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.vcmp-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vcmp-nav-counter {
  font-size: 13px;
  color: #555;
  font-weight: 600;
}

/* Modal "Prohibido" */
.vcmp-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.vcmp-prohibido-modal {
  background: white;
  border-radius: 20px;
  padding: 32px 28px 24px;
  max-width: 380px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: vcmpModalIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes vcmpModalIn {
  from { transform: translateY(20px) scale(0.96); opacity: 0; }
  to { transform: none; opacity: 1; }
}

.vcmp-prohibido-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.vcmp-prohibido-modal h2 {
  color: #c41e3a;
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 12px;
}

.vcmp-prohibido-modal p {
  color: #555;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 20px;
}

.vcmp-prohibido-modal strong {
  color: #1a1a1a;
}

.vcmp-prohibido-whatsapp {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(180deg, #25d366 0%, #128c7e 100%);
  color: white;
  padding: 12px 24px;
  border-radius: 100px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
  transition: transform 0.15s;
  margin-bottom: 12px;
}

.vcmp-prohibido-whatsapp:hover {
  transform: translateY(-2px);
}

.vcmp-prohibido-close {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: transparent;
  border: 1px solid #ddd;
  color: #888;
  padding: 10px;
  border-radius: 100px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}

/* Foto ampliada (lightbox) */
.vcmp-foto-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  cursor: zoom-out;
}

.vcmp-foto-grande {
  max-width: 95%;
  max-height: 95vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
}

.vcmp-foto-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid white;
  color: white;
  font-size: 22px;
  cursor: pointer;
  font-family: inherit;
}

.vcmp-empty {
  padding: 60px 20px;
  text-align: center;
}

/* ============================================================
 * MOBILE — Optimizado para celulares (< 600px)
 * ============================================================ */
@media (max-width: 600px) {
  .vcmp-wrapper {
    padding: 14px 0 40px;
  }

  .vcmp-container {
    padding: 12px;
  }

  .vcmp-logout {
    font-size: 11px;
    padding: 6px 12px;
    top: 10px;
    left: 10px;
  }

  /* Logo más pequeño en mobile */
  .vcmp-logo {
    margin-bottom: 14px;
  }

  .vcmp-logo img {
    max-width: 75%;
  }

  /* Banner ocupa más ancho */
  .vcmp-banner {
    margin-bottom: 18px;
  }

  /* Botones grandes: más tap-friendly en mobile */
  .vcmp-buttons-grid {
    gap: 10px;
    margin-bottom: 12px;
  }

  .vcmp-mbtn {
    font-size: 13px;
    padding: 14px 4px;
    border-width: 3px;
    border-radius: 36px;
    letter-spacing: 0.5px;
  }

  .vcmp-buttons-extra {
    margin-bottom: 18px;
    gap: 10px;
  }

  /* Status / Renta */
  .vcmp-status {
    font-size: 13px;
    padding: 10px 14px;
  }

  .vcmp-rent {
    padding: 12px 14px;
    gap: 10px;
  }

  .vcmp-rent-icon {
    font-size: 26px;
  }

  .vcmp-rent-title {
    font-size: 14px;
  }

  .vcmp-rent-sub {
    font-size: 12px;
  }

  /* Título CURRENT POST */
  .vcmp-current-post-title {
    font-size: 28px;
    margin: 14px 0;
  }

  /* Headline */
  .vcmp-headline-box {
    padding: 12px 16px;
    border-radius: 60px;
  }

  .vcmp-headline-text {
    font-size: 13px;
  }

  /* Info */
  .vcmp-info-row {
    font-size: 13px;
    gap: 6px;
  }

  .vcmp-info-label-right {
    margin-left: auto;
  }

  /* Body */
  .vcmp-body-box {
    padding: 12px 14px;
  }

  .vcmp-body-text {
    font-size: 13px;
  }

  /* Fotos: mantener una columna, pero con menos padding */
  .vcmp-photos {
    gap: 10px;
    margin-bottom: 18px;
  }

  .vcmp-photo-frame {
    padding: 8px 14px;
  }

  .vcmp-photo-frame::before,
  .vcmp-photo-frame::after {
    width: 12px;
  }

  /* Post published */
  .vcmp-published {
    font-size: 12px;
    padding: 8px 14px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    border-radius: 16px;
  }

  /* Nav entre posts */
  .vcmp-nav {
    padding: 6px 10px;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .vcmp-nav-btn {
    font-size: 12px;
    padding: 6px 12px;
  }

  .vcmp-nav-counter {
    font-size: 12px;
    width: 100%;
    text-align: center;
    order: -1; /* contador arriba en mobile */
  }

  /* Modal prohibido */
  .vcmp-prohibido-modal {
    padding: 24px 18px 18px;
    border-radius: 16px;
  }

  .vcmp-prohibido-icon {
    font-size: 44px;
  }

  .vcmp-prohibido-modal h2 {
    font-size: 18px;
  }

  .vcmp-prohibido-modal p {
    font-size: 13px;
  }
}

/* Pantallas muy pequeñas (< 380px) */
@media (max-width: 380px) {
  .vcmp-mbtn {
    font-size: 12px;
    padding: 12px 2px;
    letter-spacing: 0;
  }

  .vcmp-current-post-title {
    font-size: 24px;
    letter-spacing: 1px;
  }

  .vcmp-buttons-grid {
    gap: 8px;
  }
}
`;

export default function EstilosVistaClienteMP() {
  return <style>{ESTILOS_VCMP}</style>;
}
