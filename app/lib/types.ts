// Tipos compartidos para todo el proyecto.
// Refactor: extraído de page.tsx para mejor organización.

export interface EditRequestFields {
  name?: string;
  age?: string;
  title?: string;
  body?: string;
  cityName?: string;
  location?: string;
}

export interface EditRequest {
  status: "captcha_pendiente" | "captcha_listo" | "listo_para_publicar" | "aplicada" | "fallida";
  requestedAt: number;
  capturedAt?: number;
  expiresAt?: number;
  appliedAt?: number;
  failedAt?: number;
  failReason?: string;
  captchaUrl?: string;
  captchaKey?: string;
  captchaCode?: string;
  currentValues?: EditRequestFields;
  fields?: EditRequestFields;
}

export interface PostCapturedData {
  capturedAt?: number;
  images?: string[];
  title?: string;
  body?: string;
  phone?: string;
  age?: string;
  city?: string;
  location?: string;
}

export interface PostData {
  status: "active" | "paused";
  nextBumpAt: number;
  lastBumpAt: number | null;
  addedAt: number;
  url: string;
  rentExpiresAt?: number | null;
  rentPaused?: boolean;
  rentRemainingMs?: number;
  rentPausedReason?: string;
  rentPausedAt?: number;
  banned?: boolean;
  bannedAt?: number;
  editRequest?: EditRequest | null;
  data?: PostCapturedData;
  browserName?: string | null;
  lastPhotoChangeRequest?: number;
}

export interface ClientData {
  displayName: string;
  posts: Record<string, PostData>;
  banned?: boolean;
  bannedAt?: number;
}

export type Step = "search" | "admin-list" | "cards";
