import { initializeApp, getApps } from "firebase/app";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  push,
  remove,
  type Database,
} from "firebase/database";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCnFuJqTuAXWYcg5N9rz0eNgQDj7JFEEjw",
  authDomain: "megapersonals-control.firebaseapp.com",
  databaseURL: "https://megapersonals-control-default-rtdb.firebaseio.com",
  projectId: "megapersonals-control",
  storageBucket: "megapersonals-control.firebasestorage.app",
  messagingSenderId: "530333025314",
  appId: "1:530333025314:web:f61e35f980195be437367b"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database: Database = getDatabase(app);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export interface RentalRemaining {
  days: number;
  hours: number;
  minutes: number;
  isDebt?: boolean;
}

export interface RepublishStatus {
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  nextRepublishAt: string;
}

export interface NotificationConfig {
  email: {
    active: boolean;
    address: string;
  };
  eventos: {
    republicacion: boolean;
    error: boolean;
    renta7dias: boolean;
    renta3dias: boolean;
    renta24horas: boolean;
    renta12horas: boolean;
  };
}

// 🆕 INTERFACE PARA POST INDIVIDUAL
export interface PostData {
  postId: string;
  clientName: string;
  phoneNumber: string;
  city: string;
  location: string;
  postName?: string;
  name?: string;
  age?: number;
  headline?: string;
  body?: string;
  isPaused: boolean;
  rentalExpiration: string;
  rentalRemaining: RentalRemaining;
  republishStatus?: RepublishStatus;
  lastUpdate: string;
  postUrl?: string;
  postIdCapturedAt?: number;
  notificationConfig?: NotificationConfig;
}

// 🆕 INTERFACE PARA NAVEGADOR CON MULTI-POST
export interface BrowserData {
  browserName: string;
  uniqueId?: string;
  manuallyCreated?: boolean;
  isMultiPost?: boolean;
  postCount?: number;
  currentPostIndex?: number;
  postIds?: string[];
  posts?: Record<string, PostData>;
  isPaused: boolean;
  republishStatus: RepublishStatus;
  lastUpdate: string;
  editInProgress?: boolean;
  editLog?: string;
  editLogType?: "error" | "success" | "info" | "warning";
  captchaWaiting?: boolean;
  captchaImage?: string;
  waitingToPublish?: boolean;
  lastScreenshot?: string;
  connectionStatus?: "online" | "offline" | "error";
  lastHeartbeat?: string;
  lastError?: {
    context: string;
    message: string;
    timestamp: string;
    stack?: string;
  };
  consecutiveErrors?: number;
  currentUrl?: string;
  pageTitle?: string;
  activePostId?: string;
  clientName?: string;
  phoneNumber?: string;
  city?: string;
  location?: string;
  postName?: string;
  name?: string;
  age?: number;
  headline?: string;
  body?: string;
  rentalExpiration?: string;
  rentalRemaining?: RentalRemaining;
  postId?: string;
  postUrl?: string;
  postIdCapturedAt?: number;
  notificationConfig?: NotificationConfig;
  createdAt?: string;
  isBanned?: boolean;
  bannedAt?: string;
}

export interface SearchResult {
  type: "single" | "multi";
  browserName: string;
  clientName?: string;
  phoneNumber?: string;
  city?: string;
  location?: string;
  postName?: string;
  isPaused?: boolean;
  rentalExpiration?: string;
  rentalRemaining?: RentalRemaining;
  republishStatus?: RepublishStatus;
  postId?: string;
  postData?: PostData;
  fullData: BrowserData;
}

// =====================================================================
// 🆕 INTERFACES FINANCIERAS — Pagos y Costos de Ban
// =====================================================================
export interface PaymentRecord {
  amount: number;
  browserName: string;
  postId: string;
  clientName: string;
  timestamp: string;
}

export interface BanCostRecord {
  amount: number;
  browserName: string;
  timestamp: string;
  url?: string;
}

export interface WeeklyFinancials {
  totalPayments: number;
  totalBans: number;
  paymentCount: number;
  banCount: number;
  netProfit: number;
  payments: Record<string, PaymentRecord>;
  bans: Record<string, BanCostRecord>;
}

export interface WeeklyStats {
  weekId: string;
  startDate: string;
  endDate: string;
  bannedAccounts: string[];
  renewals: number;
  newClients: string[];
  totalClients: number;
  totalRevenue?: number;
  totalPayments?: number;
  totalBanCosts?: number;
  paymentCount?: number;
  banCostCount?: number;
  netProfit?: number;
}

export interface StatsEvent {
  type: "ban" | "renewal" | "newClient" | "payment" | "banCost";
  browserName: string;
  clientName?: string;
  timestamp: string;
  weekId: string;
  details?: any;
  amount?: number;
}

// =====================================================================
// 🆕 INTERFACES DEL SISTEMA DE LICENCIAS MEGABOT
// Ruta en Firebase: /megabot_licenses/{licenseKey}/
// =====================================================================

export type LicensePlan = "basico" | "pro";
export type LicenseStatus = "active" | "inactive" | "expired" | "suspended";

export interface MegaBotLicense {
  key: string;
  clientName: string;
  whatsapp?: string;
  email?: string;
  plan: LicensePlan;
  active: boolean;
  // Multi-perfil: lista de fingerprints registrados
  fingerprints: string[];
  maxPerfiles?: number;
  fingerprint?: string | null;
  createdAt: string;
  expiresAt: string;
  activatedAt: string | null;
  lastValidatedAt: string | null;
  notes?: string;
  suspendedReason?: string;
}

export interface CreateLicenseParams {
  clientName: string;
  plan: LicensePlan;
  days: number;                   // Días de duración
  whatsapp?: string;
  email?: string;
  notes?: string;
  customKey?: string;             // Si quieres definir la clave tú mismo
}

export interface LicenseValidationResult {
  valid: boolean;
  reason?: "INVALID_KEY" | "DEACTIVATED" | "EXPIRED" | "WRONG_PC" | "UPDATE_REQUIRED" | "SERVER_ERROR";
  license?: MegaBotLicense;
  currentVersion?: string;
  updateUrl?: string;
}

export interface LicenseStats {
  total: number;
  active: number;
  inactive: number;
  expired: number;
  pro: number;
  basico: number;
  linkedToPC: number;
  notLinked: number;
}

// =====================================================================
// 🆕 API DE LICENCIAS MEGABOT
// =====================================================================

export const LicenseAPI = {

  // ------------------------------------------------------------------
  // Generar clave única en formato MEGA-XXXX-XXXX
  // ------------------------------------------------------------------
  generateKey(clientName?: string): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const rand = (n: number) =>
      Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    if (clientName) {
      // Usar las primeras 4 letras del nombre (sin espacios ni acentos)
      const prefix = clientName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
        .substring(0, 4)
        .padEnd(4, "X");
      return `MEGA-${prefix}-${rand(4)}`;
    }

    return `MEGA-${rand(4)}-${rand(4)}`;
  },

  // ------------------------------------------------------------------
  // Crear una nueva licencia
  // ------------------------------------------------------------------
  async createLicense(params: CreateLicenseParams): Promise<{ success: boolean; key?: string; error?: string }> {
    try {
      const key = params.customKey?.trim().toUpperCase() || this.generateKey(params.clientName);

      // Verificar que la clave no exista ya
      const existing = await get(ref(database, `megabot_licenses/${key}`));
      if (existing.exists()) {
        return { success: false, error: "Esa clave ya existe. Usa otra clave." };
      }

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + params.days);

      const license: MegaBotLicense = {
        key,
        clientName: params.clientName.trim(),
        plan: params.plan,
        active: true,
        fingerprints: [],
        maxPerfiles: params.plan === 'pro' ? 6 : 3,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        activatedAt: null,
        lastValidatedAt: null,
        whatsapp: params.whatsapp?.trim() || "",
        email: params.email?.trim() || "",
        notes: params.notes?.trim() || "",
      };

      await set(ref(database, `megabot_licenses/${key}`), license);
      return { success: true, key };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Obtener una licencia por clave
  // ------------------------------------------------------------------
  async getLicense(key: string): Promise<MegaBotLicense | null> {
    try {
      const snapshot = await get(ref(database, `megabot_licenses/${key.toUpperCase()}`));
      return snapshot.exists() ? (snapshot.val() as MegaBotLicense) : null;
    } catch {
      return null;
    }
  },

  // ------------------------------------------------------------------
  // Obtener TODAS las licencias
  // ------------------------------------------------------------------
  async getAllLicenses(): Promise<Record<string, MegaBotLicense>> {
    try {
      const snapshot = await get(ref(database, "megabot_licenses"));
      return snapshot.val() || {};
    } catch {
      return {};
    }
  },

  // ------------------------------------------------------------------
  // Escuchar cambios en tiempo real (para el panel de admin)
  // ------------------------------------------------------------------
  listenToAllLicenses(callback: (licenses: Record<string, MegaBotLicense>) => void) {
    const licensesRef = ref(database, "megabot_licenses");
    return onValue(licensesRef, (snapshot) => {
      callback(snapshot.val() || {});
    });
  },

  // ------------------------------------------------------------------
  // Activar / Desactivar una licencia
  // ------------------------------------------------------------------
  async setActive(key: string, active: boolean, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: Partial<MegaBotLicense> = { active };
      if (!active && reason) updates.suspendedReason = reason;
      if (active) updates.suspendedReason = "";

      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Extender la expiración de una licencia (suma días a la fecha actual)
  // ------------------------------------------------------------------
  async extendLicense(key: string, days: number): Promise<{ success: boolean; newExpiry?: string; error?: string }> {
    try {
      const license = await this.getLicense(key);
      if (!license) return { success: false, error: "Licencia no encontrada" };

      // Si ya expiró, extender desde hoy; si aún vigente, extender desde la fecha actual
      const base = new Date(license.expiresAt) > new Date()
        ? new Date(license.expiresAt)
        : new Date();

      base.setDate(base.getDate() + days);
      const newExpiry = base.toISOString();

      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
        expiresAt: newExpiry,
        active: true,             // Reactivar si estaba desactivada
        suspendedReason: "",
      });

      return { success: true, newExpiry };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Resetear la PC vinculada (para transferir a otra PC)
  // ------------------------------------------------------------------
  getMaxPerfiles(plan: LicensePlan, maxPersonalizado?: number): number {
    if (maxPersonalizado && maxPersonalizado > 0) return maxPersonalizado;
    return plan === 'pro' ? 6 : 3;
  },

  async agregarPerfiles(key: string, cantidad: number = 3): Promise<{ success: boolean; nuevoMax?: number; error?: string }> {
    try {
      const license = await this.getLicense(key);
      if (!license) return { success: false, error: 'Licencia no encontrada' };
      const actualMax = this.getMaxPerfiles(license.plan, license.maxPerfiles);
      const nuevoMax  = actualMax + cantidad;
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), { maxPerfiles: nuevoMax });
      return { success: true, nuevoMax };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async reducirPerfiles(key: string, cantidad: number = 3): Promise<{ success: boolean; nuevoMax?: number; error?: string }> {
    try {
      const license = await this.getLicense(key);
      if (!license) return { success: false, error: 'Licencia no encontrada' };
      const actualMax  = this.getMaxPerfiles(license.plan, license.maxPerfiles);
      const defaultMax = license.plan === 'pro' ? 6 : 3;
      const nuevoMax   = Math.max(defaultMax, actualMax - cantidad);
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), { maxPerfiles: nuevoMax });
      return { success: true, nuevoMax };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async resetFingerprint(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
        fingerprints: [],
        fingerprint: null,
        activatedAt: null,
        maxPerfiles: 0,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Cambiar el plan de una licencia
  // ------------------------------------------------------------------
  async changePlan(key: string, plan: LicensePlan): Promise<{ success: boolean; error?: string }> {
    try {
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), { plan });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Actualizar notas internas
  // ------------------------------------------------------------------
  async updateNotes(key: string, notes: string): Promise<{ success: boolean; error?: string }> {
    try {
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), { notes });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Eliminar una licencia permanentemente
  // ------------------------------------------------------------------
  async deleteLicense(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await remove(ref(database, `megabot_licenses/${key.toUpperCase()}`));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // ------------------------------------------------------------------
  // Validar licencia + fingerprint (llamado desde el API route de Vercel)
  // Retorna resultado completo para que el servidor decida qué responder
  // ------------------------------------------------------------------
  async validateLicense(key: string, fingerprint: string): Promise<LicenseValidationResult> {
    try {
      const license = await this.getLicense(key);

      if (!license) return { valid: false, reason: "INVALID_KEY" };
      if (!license.active) return { valid: false, reason: "DEACTIVATED", license };
      if (new Date(license.expiresAt) <= new Date()) return { valid: false, reason: "EXPIRED", license };

      // Normalizar: compatibilidad con licencias antiguas (fingerprint singular)
      const fingerprints: string[] = license.fingerprints?.length
        ? [...license.fingerprints]
        : license.fingerprint ? [license.fingerprint] : [];

      const maxPerfiles = this.getMaxPerfiles(license.plan, license.maxPerfiles);

      // Ya está registrado este perfil → OK
      if (fingerprints.includes(fingerprint)) {
        await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
          lastValidatedAt: new Date().toISOString(),
        });
        return { valid: true, license };
      }

      // Límite de perfiles alcanzado
      if (fingerprints.length >= maxPerfiles) {
        return { valid: false, reason: "WRONG_PC", license };
      }

      // Nuevo perfil dentro del límite → agregar
      fingerprints.push(fingerprint);
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
        fingerprints,
        activatedAt: license.activatedAt || new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
      });

      return { valid: true, license };
    } catch (error) {
      return { valid: false, reason: "SERVER_ERROR" };
    }
  },

  // ------------------------------------------------------------------
  // Activar licencia desde el userscript (primera vez)
  // ------------------------------------------------------------------
  async activateLicense(
    key: string,
    fingerprint: string
  ): Promise<{ success: boolean; message: string; license?: MegaBotLicense }> {
    try {
      const license = await this.getLicense(key);

      if (!license) return { success: false, message: "❌ Clave no encontrada.\nVerifica que la escribiste bien." };
      if (!license.active) return { success: false, message: "❌ Licencia desactivada.\nContacta al vendedor." };
      if (new Date(license.expiresAt) <= new Date()) return { success: false, message: "❌ Licencia expirada.\nContacta al vendedor para renovar." };

      // Normalizar fingerprints (compatibilidad con licencias antiguas)
      const fingerprints: string[] = license.fingerprints?.length
        ? [...license.fingerprints]
        : license.fingerprint ? [license.fingerprint] : [];

      const maxPerfiles = this.getMaxPerfiles(license.plan, license.maxPerfiles);

      // Este perfil ya está registrado → bienvenido de nuevo
      if (fingerprints.includes(fingerprint)) {
        await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
          lastValidatedAt: new Date().toISOString(),
        });
        return { success: true, message: `✅ ¡Bienvenido de nuevo, ${license.clientName}!`, license };
      }

      // Límite de perfiles alcanzado
      if (fingerprints.length >= maxPerfiles) {
        return {
          success: false,
          message: `❌ Límite de perfiles alcanzado (${maxPerfiles}/${maxPerfiles}).\nContacta al vendedor para ampliar o transferir la licencia.`,
        };
      }

      // Nuevo perfil dentro del límite → registrar
      fingerprints.push(fingerprint);
      await update(ref(database, `megabot_licenses/${key.toUpperCase()}`), {
        fingerprints,
        activatedAt: license.activatedAt || new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
      });

      const restantes = maxPerfiles - fingerprints.length;
      return {
        success: true,
        message: `✅ ¡Activado!\n\nBienvenido ${license.clientName}\nPerfil ${fingerprints.length}/${maxPerfiles} registrado.`,
        license,
      };
    } catch (error) {
      return { success: false, message: "❌ Error del servidor. Intenta de nuevo." };
    }
  },

  // ------------------------------------------------------------------
  // Estadísticas del panel de admin
  // ------------------------------------------------------------------
  async getStats(): Promise<LicenseStats> {
    try {
      const all = await this.getAllLicenses();
      const now = new Date();
      const licenses = Object.values(all);

      return {
        total:      licenses.length,
        active:     licenses.filter(l => l.active && new Date(l.expiresAt) > now).length,
        inactive:   licenses.filter(l => !l.active).length,
        expired:    licenses.filter(l => new Date(l.expiresAt) <= now).length,
        pro:        licenses.filter(l => l.plan === "pro").length,
        basico:     licenses.filter(l => l.plan === "basico").length,
        linkedToPC: licenses.filter(l => (l.fingerprints?.length ?? 0) > 0 || l.fingerprint != null).length,
        notLinked:  licenses.filter(l => (l.fingerprints?.length ?? 0) === 0 && !l.fingerprint).length,
      };
    } catch {
      return { total:0, active:0, inactive:0, expired:0, pro:0, basico:0, linkedToPC:0, notLinked:0 };
    }
  },

  // ------------------------------------------------------------------
  // Obtener licencias que expiran pronto (para alertas en el panel)
  // ------------------------------------------------------------------
  async getExpiringLicenses(withinDays: number = 3): Promise<MegaBotLicense[]> {
    try {
      const all = await this.getAllLicenses();
      const now = new Date();
      const threshold = new Date(now.getTime() + withinDays * 86400000);

      return Object.values(all).filter(l => {
        const exp = new Date(l.expiresAt);
        return l.active && exp > now && exp <= threshold;
      }).sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    } catch {
      return [];
    }
  },

  // ------------------------------------------------------------------
  // Helper: días restantes de una licencia
  // ------------------------------------------------------------------
  getDaysRemaining(license: MegaBotLicense): number {
    const diff = new Date(license.expiresAt).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  },

  // ------------------------------------------------------------------
  // Helper: estado legible de una licencia
  // ------------------------------------------------------------------
  getStatus(license: MegaBotLicense): LicenseStatus {
    if (!license.active) return "suspended";
    if (new Date(license.expiresAt) <= new Date()) return "expired";
    return "active";
  },
};

// =====================================================================
// FIREBASE API (sin cambios)
// =====================================================================
export const FirebaseAPI = {
  calculateRentalRemaining(rentalExpiration: string): RentalRemaining {
    const diff = new Date(rentalExpiration).getTime() - new Date().getTime();
    
    if (diff <= 0) {
      const debtDiff = Math.abs(diff);
      return {
        days: -Math.floor(debtDiff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((debtDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((debtDiff % (1000 * 60 * 60)) / (1000 * 60)),
        isDebt: true,
      };
    }
    
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      isDebt: false,
    };
  },

  async createManualUser(browserName: string, days: number, hours: number) {
    try {
      const now = new Date();
      const expirationDate = new Date(now);
      expirationDate.setDate(expirationDate.getDate() + days);
      expirationDate.setHours(expirationDate.getHours() + hours);

      const uniqueId = Math.random().toString(36).substring(2, 10).toUpperCase();

      const userData: BrowserData = {
        browserName: browserName,
        uniqueId: uniqueId,
        phoneNumber: "Manual",
        city: "Manual",
        location: "Manual",
        isPaused: false,
        rentalExpiration: expirationDate.toISOString(),
        rentalRemaining: this.calculateRentalRemaining(expirationDate.toISOString()),
        republishStatus: {
          totalSeconds: 900,
          elapsedSeconds: 0,
          remainingSeconds: 900,
          nextRepublishAt: new Date(now.getTime() + 900000).toISOString(),
        },
        lastUpdate: now.toISOString(),
        manuallyCreated: true,
        connectionStatus: "offline",
        lastHeartbeat: now.toISOString(),
        consecutiveErrors: 0,
        createdAt: now.toISOString(),
        isBanned: false,
        isMultiPost: false,
      };

      await set(ref(database, `browsers/${browserName}`), userData);
      await StatsAPI.registerNewClient(browserName);
      
      return { success: true, uniqueId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async generateUniqueId(browserName: string) {
    try {
      const uniqueId = Math.random().toString(36).substring(2, 10).toUpperCase();
      await set(ref(database, `browsers/${browserName}/uniqueId`), uniqueId);
      return uniqueId;
    } catch (error) {
      console.error("Error generating uniqueId:", error);
      return null;
    }
  },

  async findBrowserByClientName(clientName: string): Promise<SearchResult | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      if (!browsers) return null;

      const cleanSearch = clientName.trim().toLowerCase();

      for (const [browserName, browserData] of Object.entries(browsers)) {
        const data = browserData as BrowserData;
        
        if (!data.isMultiPost) {
          const browserClientName = (data.clientName || "").trim().toLowerCase();
          if (browserClientName === cleanSearch) {
            return {
              type: "single",
              browserName: data.browserName,
              clientName: data.clientName,
              phoneNumber: data.phoneNumber,
              city: data.city,
              location: data.location,
              postName: data.postName,
              isPaused: data.isPaused,
              rentalExpiration: data.rentalExpiration,
              rentalRemaining: data.rentalRemaining,
              republishStatus: data.republishStatus,
              fullData: data,
            };
          }
        }
        
        if (data.isMultiPost && data.posts) {
          for (const [postId, postData] of Object.entries(data.posts)) {
            const post = postData as PostData;
            const postClientName = (post.clientName || "").trim().toLowerCase();
            if (postClientName === cleanSearch) {
              return {
                type: "multi",
                browserName: data.browserName,
                postId: postId,
                postData: post,
                clientName: post.clientName,
                phoneNumber: post.phoneNumber,
                city: post.city,
                location: post.location,
                postName: post.postName,
                isPaused: post.isPaused,
                rentalExpiration: post.rentalExpiration,
                rentalRemaining: post.rentalRemaining,
                republishStatus: data.republishStatus,
                fullData: data,
              };
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error("[findBrowserByClientName Error]:", error);
      return null;
    }
  },

  async findAllBrowsersByClientName(clientName: string): Promise<SearchResult[]> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      if (!browsers) return [];

      const cleanSearch = clientName.trim().toLowerCase();
      const results: SearchResult[] = [];

      for (const [browserName, browserData] of Object.entries(browsers)) {
        const data = browserData as BrowserData;
        
        if (!data.isMultiPost) {
          const browserClientName = (data.clientName || "").trim().toLowerCase();
          if (browserClientName === cleanSearch) {
            results.push({
              type: "single",
              browserName: data.browserName,
              clientName: data.clientName,
              phoneNumber: data.phoneNumber,
              city: data.city,
              location: data.location,
              postName: data.postName,
              isPaused: data.isPaused,
              rentalExpiration: data.rentalExpiration,
              rentalRemaining: data.rentalRemaining,
              republishStatus: data.republishStatus,
              fullData: data,
            });
          }
        }
        
        if (data.isMultiPost && data.posts) {
          for (const [postId, postData] of Object.entries(data.posts)) {
            const post = postData as PostData;
            const postClientName = (post.clientName || "").trim().toLowerCase();
            if (postClientName === cleanSearch) {
              results.push({
                type: "multi",
                browserName: data.browserName,
                postId: postId,
                postData: post,
                clientName: post.clientName,
                phoneNumber: post.phoneNumber,
                city: post.city,
                location: post.location,
                postName: post.postName,
                isPaused: post.isPaused,
                rentalExpiration: post.rentalExpiration,
                rentalRemaining: post.rentalRemaining,
                republishStatus: data.republishStatus,
                fullData: data,
              });
            }
          }
        }
      }
      return results;
    } catch (error) {
      console.error("[findAllBrowsersByClientName Error]:", error);
      return [];
    }
  },

  async findBrowserByUniqueId(uniqueId: string): Promise<BrowserData | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      if (!browsers) return null;
      for (const [, data] of Object.entries(browsers)) {
        if ((data as BrowserData).uniqueId === uniqueId) {
          return data as BrowserData;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  async getAllBrowsers(): Promise<Record<string, BrowserData>> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      return snapshot.val() || {};
    } catch {
      return {};
    }
  },

  listenToAllBrowsers(callback: (browsers: Record<string, BrowserData>) => void) {
    const browsersRef = ref(database, "browsers");
    const unsubscribe = onValue(browsersRef, (snapshot) => {
      callback(snapshot.val() || {});
    });
    return unsubscribe;
  },

  async findBrowserByName(browserName: string): Promise<BrowserData | null> {
    try {
      const snapshot = await get(ref(database, `browsers/${browserName}`));
      return snapshot.val();
    } catch {
      return null;
    }
  },

  async findBrowser(phoneNumber: string): Promise<BrowserData | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      if (!browsers) return null;

      const cleanPhone = phoneNumber.replace(/\D/g, "");

      for (const [, data] of Object.entries(browsers)) {
        const browserPhone = ((data as BrowserData).phoneNumber || "").replace(/\D/g, "");
        if (browserPhone === cleanPhone) {
          return data as BrowserData;
        }
      }

      if (cleanPhone.length >= 10) {
        const last10 = cleanPhone.slice(-10);
        for (const [, data] of Object.entries(browsers)) {
          const browserPhone = ((data as BrowserData).phoneNumber || "").replace(/\D/g, "");
          if (browserPhone.endsWith(last10)) {
            return data as BrowserData;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  async sendCommand(browserName: string, actionType: string, payload: Record<string, unknown> = {}) {
    try {
      const commandId = Date.now().toString();
      await set(ref(database, `commands/${browserName}/${commandId}`), {
        type: actionType,
        ...payload,
        timestamp: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async togglePausePost(browserName: string, postId: string | undefined, newState: boolean) {
    try {
      const browserData = await this.findBrowserByName(browserName);
      if (!browserData) {
        return { success: false, error: "Navegador no encontrado" };
      }

      const commandType = newState ? 'pause' : 'resume';
      await this.sendCommand(browserName, commandType, postId ? { postId } : {});
      
      console.log(`[FirebaseAPI]: Comando ${commandType} enviado a ${browserName}`);

      if (!browserData.isMultiPost || !postId) {
        await update(ref(database, `browsers/${browserName}`), {
          isPaused: newState,
          lastUpdate: new Date().toISOString(),
        });
        return { success: true };
      }

      await update(ref(database, `browsers/${browserName}/posts/${postId}`), {
        isPaused: newState,
        lastUpdate: new Date().toISOString(),
      });
      await update(ref(database, `browsers/${browserName}`), {
        lastUpdate: new Date().toISOString(),
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async togglePause(browserName: string, newState: boolean) {
    return this.togglePausePost(browserName, undefined, newState);
  },

  async forceRepublish(browserName: string) {
    try {
      const totalSeconds = 900 + Math.floor(Math.random() * 181);
      const now = new Date();
      
      await update(ref(database, `browsers/${browserName}`), {
        republishStatus: {
          totalSeconds: totalSeconds,
          elapsedSeconds: 0,
          remainingSeconds: totalSeconds,
          nextRepublishAt: new Date(now.getTime() + totalSeconds * 1000).toISOString(),
        },
        lastUpdate: now.toISOString(),
      });

      const commandId = Date.now().toString();
      await set(ref(database, `commands/${browserName}/${commandId}`), {
        type: "republish",
        timestamp: now.toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async updateBrowserField(browserName: string, field: string, value: any) {
    try {
      await update(ref(database, `browsers/${browserName}`), {
        [field]: value,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async updatePostField(browserName: string, postId: string, field: string, value: any) {
    try {
      await update(ref(database, `browsers/${browserName}/posts/${postId}`), {
        [field]: value,
        lastUpdate: new Date().toISOString(),
      });
      await update(ref(database, `browsers/${browserName}`), {
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  listenToBrowser(browserName: string, callback: (data: BrowserData) => void) {
    const browserRef = ref(database, `browsers/${browserName}`);
    const unsubscribe = onValue(browserRef, (snapshot) => {
      const data = snapshot.val();
      if (data) callback(data);
    });
    return unsubscribe;
  },

  async deleteBrowser(browserName: string) {
    try {
      await set(ref(database, `browsers/${browserName}`), null);
      await set(ref(database, `commands/${browserName}`), null);
      await set(ref(database, `notifications/${browserName}`), null);
      await set(ref(database, `lastNotified/${browserName}`), null);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async getNotificationConfig(browserName: string): Promise<NotificationConfig | null> {
    try {
      const notifRef = ref(database, `notifications/${browserName}`);
      const snapshot = await get(notifRef);
      if (snapshot.exists()) {
        return snapshot.val() as NotificationConfig;
      }
      return {
        email: { active: false, address: "" },
        eventos: {
          republicacion: true,
          error: true,
          renta7dias: true,
          renta3dias: true,
          renta24horas: true,
          renta12horas: true,
        },
      };
    } catch (error) {
      console.error("Error obteniendo configuración:", error);
      return null;
    }
  },

  async saveNotificationConfig(browserName: string, config: NotificationConfig) {
    try {
      await set(ref(database, `notifications/${browserName}`), config);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async sendTestEmail(browserName: string, email: string) {
    try {
      const response = await fetch("/api/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          browserName,
          tipo: "test",
          config: { email },
        }),
      });
      const result = await response.json();
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
};

// =====================================================================
// STATS API (sin cambios)
// =====================================================================
export const StatsAPI = {
  getCurrentWeekId(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  },

  getExtensionWeekKey(): string {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.ceil((now.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
    const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  },

  getWeekRange(weekId: string): { start: Date; end: Date } {
    const [year, week] = weekId.split('-W');
    const firstDayOfYear = new Date(parseInt(year), 0, 1);
    const daysToFirstMonday = (8 - firstDayOfYear.getDay()) % 7;
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(firstDayOfYear.getDate() + daysToFirstMonday);
    
    const start = new Date(firstMonday);
    start.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  },

  async registerBan(browserName: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      await update(ref(database, `browsers/${browserName}`), {
        isBanned: true,
        bannedAt: now,
      });
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "ban",
        browserName,
        timestamp: now,
        weekId,
      });
      
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      
      if (!currentStats.bannedAccounts.includes(browserName)) {
        currentStats.bannedAccounts.push(browserName);
      }
      
      await set(statsRef, currentStats);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async registerRenewal(browserName: string, days: number) {
    try {
      if (days < 7) return { success: true };
      
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "renewal",
        browserName,
        days,
        timestamp: now,
        weekId,
      });
      
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      currentStats.renewals += 1;
      
      await set(statsRef, currentStats);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async registerNewClient(browserName: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "newClient",
        browserName,
        timestamp: now,
        weekId,
      });
      
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      
      if (!currentStats.newClients.includes(browserName)) {
        currentStats.newClients.push(browserName);
      }
      
      const allBrowsers = await FirebaseAPI.getAllBrowsers();
      let totalCount = 0;
      Object.values(allBrowsers).forEach(browser => {
        if (browser.isMultiPost && browser.posts) {
          totalCount += browser.postCount || Object.keys(browser.posts).length;
        } else {
          totalCount += 1;
        }
      });
      currentStats.totalClients = totalCount;
      
      await set(statsRef, currentStats);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async getWeeklyFinancials(weekKey?: string): Promise<WeeklyFinancials> {
    const key = weekKey || this.getExtensionWeekKey();
    const empty: WeeklyFinancials = {
      totalPayments: 0, totalBans: 0, paymentCount: 0,
      banCount: 0, netProfit: 0, payments: {}, bans: {},
    };

    try {
      const snapshot = await get(ref(database, `stats/weekly/${key}`));
      if (!snapshot.exists()) return empty;

      const data = snapshot.val();
      const totals = data.totals || {};
      const payments = data.payments || {};
      const bans = data.bans || {};
      const totalPayments = totals.totalPayments || 0;
      const totalBans = totals.totalBans || 0;

      return {
        totalPayments,
        totalBans,
        paymentCount: totals.paymentCount || Object.keys(payments).length,
        banCount: totals.banCount || Object.keys(bans).length,
        netProfit: totalPayments - totalBans,
        payments,
        bans,
      };
    } catch (error) {
      console.error("[StatsAPI] Error getting weekly financials:", error);
      return empty;
    }
  },

  listenToWeeklyFinancials(callback: (financials: WeeklyFinancials) => void) {
    const weekKey = this.getExtensionWeekKey();
    const weekRef = ref(database, `stats/weekly/${weekKey}`);
    const unsubscribe = onValue(weekRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        callback({
          totalPayments: 0, totalBans: 0, paymentCount: 0,
          banCount: 0, netProfit: 0, payments: {}, bans: {},
        });
        return;
      }
      const totals = data.totals || {};
      const payments = data.payments || {};
      const bans = data.bans || {};
      const totalPayments = totals.totalPayments || 0;
      const totalBans = totals.totalBans || 0;
      callback({
        totalPayments,
        totalBans,
        paymentCount: totals.paymentCount || Object.keys(payments).length,
        banCount: totals.banCount || Object.keys(bans).length,
        netProfit: totalPayments - totalBans,
        payments,
        bans,
      });
    });
    return unsubscribe;
  },

  async recordPaymentFromDashboard(amount: number, postId?: string, clientName?: string, browserName?: string) {
    try {
      const weekKey = this.getExtensionWeekKey();
      const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const paymentData: PaymentRecord = {
        amount,
        browserName: browserName || 'dashboard',
        postId: postId || 'manual',
        clientName: clientName || 'Manual',
        timestamp: new Date().toISOString(),
      };

      await set(ref(database, `stats/weekly/${weekKey}/payments/${paymentId}`), paymentData);

      const totalsRef = ref(database, `stats/weekly/${weekKey}/totals`);
      const totalsSnap = await get(totalsRef);
      const totals = totalsSnap.val() || {};

      await update(totalsRef, {
        totalPayments: (totals.totalPayments || 0) + amount,
        paymentCount: (totals.paymentCount || 0) + 1,
      });

      await update(ref(database, `stats/weekly/${weekKey}/meta`), {
        weekKey,
        lastUpdated: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async recordBanCostFromDashboard(amount: number, browserName?: string) {
    try {
      const weekKey = this.getExtensionWeekKey();
      const banId = `ban_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const banData: BanCostRecord = {
        amount,
        browserName: browserName || 'dashboard',
        timestamp: new Date().toISOString(),
      };

      await set(ref(database, `stats/weekly/${weekKey}/bans/${banId}`), banData);

      const totalsRef = ref(database, `stats/weekly/${weekKey}/totals`);
      const totalsSnap = await get(totalsRef);
      const totals = totalsSnap.val() || {};

      await update(totalsRef, {
        totalBans: (totals.totalBans || 0) + amount,
        banCount: (totals.banCount || 0) + 1,
      });

      await update(ref(database, `stats/weekly/${weekKey}/meta`), {
        weekKey,
        lastUpdated: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  async getFinancialsHistory(count: number = 12): Promise<Array<{ weekKey: string; financials: WeeklyFinancials }>> {
    try {
      const snapshot = await get(ref(database, `stats/weekly`));
      if (!snapshot.exists()) return [];

      const allWeeks = snapshot.val();
      const results: Array<{ weekKey: string; financials: WeeklyFinancials }> = [];

      for (const [weekKey, weekData] of Object.entries(allWeeks)) {
        const data = weekData as any;
        const totals = data.totals || {};
        const payments = data.payments || {};
        const bans = data.bans || {};
        const totalPayments = totals.totalPayments || 0;
        const totalBans = totals.totalBans || 0;

        results.push({
          weekKey,
          financials: {
            totalPayments,
            totalBans,
            paymentCount: totals.paymentCount || Object.keys(payments).length,
            banCount: totals.banCount || Object.keys(bans).length,
            netProfit: totalPayments - totalBans,
            payments,
            bans,
          },
        });
      }

      results.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
      return results.slice(0, count);
    } catch (error) {
      console.error("[StatsAPI] Error getting financials history:", error);
      return [];
    }
  },

  createEmptyWeekStats(weekId: string): WeeklyStats {
    const { start, end } = this.getWeekRange(weekId);
    return {
      weekId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bannedAccounts: [],
      renewals: 0,
      newClients: [],
      totalClients: 0,
    };
  },

  async getCurrentWeekStats(): Promise<WeeklyStats> {
    try {
      const weekId = this.getCurrentWeekId();
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);

      let stats: WeeklyStats;
      if (snapshot.exists()) {
        stats = snapshot.val() as WeeklyStats;
      } else {
        stats = this.createEmptyWeekStats(weekId);
      }

      const financials = await this.getWeeklyFinancials();
      stats.totalPayments = financials.totalPayments;
      stats.totalBanCosts = financials.totalBans;
      stats.paymentCount = financials.paymentCount;
      stats.banCostCount = financials.banCount;
      stats.netProfit = financials.netProfit;

      return stats;
    } catch (error) {
      return this.createEmptyWeekStats(this.getCurrentWeekId());
    }
  },

  async getWeeksHistory(count: number = 12): Promise<WeeklyStats[]> {
    try {
      const statsRef = ref(database, `stats/weeks`);
      const snapshot = await get(statsRef);
      if (!snapshot.exists()) return [];

      const weeksData = snapshot.val();
      const weeks: WeeklyStats[] = Object.values(weeksData);

      const financialsHistory = await this.getFinancialsHistory(count);
      const financialsMap = new Map(financialsHistory.map(f => [f.weekKey, f.financials]));

      for (const week of weeks) {
        const fin = financialsMap.get(week.weekId);
        if (fin) {
          week.totalPayments = fin.totalPayments;
          week.totalBanCosts = fin.totalBans;
          week.paymentCount = fin.paymentCount;
          week.banCostCount = fin.banCount;
          week.netProfit = fin.netProfit;
        }
      }

      weeks.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      return weeks.slice(0, count);
    } catch (error) {
      return [];
    }
  },

  async getWeekEvents(weekId: string): Promise<StatsEvent[]> {
    try {
      const eventsRef = ref(database, `stats/events/${weekId}`);
      const snapshot = await get(eventsRef);
      if (!snapshot.exists()) return [];

      const eventsData = snapshot.val();
      const events: StatsEvent[] = Object.values(eventsData);
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return events;
    } catch (error) {
      return [];
    }
  },

  listenToCurrentWeekStats(callback: (stats: WeeklyStats) => void) {
    const weekId = this.getCurrentWeekId();
    const statsRef = ref(database, `stats/weeks/${weekId}`);
    const unsubscribe = onValue(statsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        callback(data as WeeklyStats);
      } else {
        callback(this.createEmptyWeekStats(weekId));
      }
    });
    return unsubscribe;
  },
};

export const ADMIN_PASSWORD = "admin123";

export const CONTACT = {
  whatsapp: "18293837695",
  email: "angel15dobleu@gmail.com",
};

export const SERVICES = [
  {
    id: "proxy",
    icon: "rocket",
    title: "Proxies Premium",
    subtitle: "Los mejores del mercado",
    description: "Proxies rápidos y confiables para tus necesidades.",
    features: ["Alta velocidad", "IP dedicadas", "Soporte 24/7", "Uptime 99.9%"],
    price: "$20/mes",
    stock: 15,
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    id: "sale",
    icon: "diamond",
    title: "Cuentas Venta",
    subtitle: "Verificadas y seguras",
    description: "Cuentas verificadas listas para usar inmediatamente.",
    features: ["100% verificadas", "Sin restricciones", "Entrega inmediata", "Garantía incluida"],
    price: "Consultar",
    stock: 8,
    gradient: "from-emerald-500 to-green-500",
  },
  {
    id: "rental",
    icon: "bolt",
    title: "Renta de Cuentas",
    subtitle: "2 planes disponibles",
    description: "Plan Básico ($125/sem): Republica cada 30 min. Plan Premium ($200/sem): Republica cada 15 min con panel web privado.",
    features: ["Plan Básico: $125", "Plan Premium: $200", "Atención personalizada", "Control total"],
    price: "Desde $125",
    stock: 20,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "megabot",
    icon: "bot",
    title: "MegaBot PRO",
    subtitle: "Automatización inteligente",
    description: "Sistema de republicación automática con detección de bans y sincronización multi-PC.",
    features: ["Republicación automática", "Detección de bloqueos", "Control remoto desde celular", "Sincronización multi-PC"],
    price: "Desde $19.99",
    stock: 99,
    gradient: "from-purple-500 to-pink-500",
  },
];
