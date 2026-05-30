// Constantes y helpers globales del proyecto.
// Refactor: extraído de page.tsx para mejor organización.

export const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const ADMIN_PASSWORD = "admin2024";
export const WHATSAPP_NUMERO = "18293837695"; // Número de Angel (sin + ni espacios)

/**
 * Convierte una URL de MegaPersonals a una URL del proxy local en Vercel.
 * Esto permite que los clientes en RD (donde MegaPersonals está bloqueado) puedan
 * ver las fotos sin VPN. El proxy las pide desde Vercel y las sirve.
 */
export function imagenViaProxy(url?: string): string {
  if (!url) return "";
  if (!url.startsWith("http")) return url; // Ya es relativa, no necesita proxy
  return `/api/mp-image?url=${encodeURIComponent(url)}`;
}
