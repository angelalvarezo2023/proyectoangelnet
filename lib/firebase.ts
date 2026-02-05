import { initializeApp, getApps } from "firebase/app";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  push,
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
  postId: string; // ID único del post (ej: "post_50233388")
  clientName: string;
  phoneNumber: string;
  city: string;
  location: string;
  postName?: string;
  
  // Campos de edición (extraídos del formulario)
  name?: string;
  age?: number;
  headline?: string;
  body?: string;
  
  // Estado individual del post
  isPaused: boolean;
  rentalExpiration: string;
  rentalRemaining: RentalRemaining;
  
  // Republicación (compartida a nivel navegador, pero se muestra aquí)
  republishStatus?: RepublishStatus;
  
  // Metadata
  lastUpdate: string;
  postUrl?: string;
  postIdCapturedAt?: number;
  
  // Notificaciones (opcional, por post)
  notificationConfig?: NotificationConfig;
}

// 🆕 INTERFACE PARA NAVEGADOR CON MULTI-POST
export interface BrowserData {
  browserName: string;
  uniqueId?: string;
  manuallyCreated?: boolean;
  
  // 🆕 Multi-post flags
  isMultiPost?: boolean; // true si tiene múltiples posts
  postCount?: number; // Cantidad de posts activos (2, 3, etc)
  currentPostIndex?: number; // Índice actual de rotación
  postIds?: string[]; // Array de IDs ["post_50233388", "post_50280395"]
  
  // 🆕 Posts individuales (solo si isMultiPost = true)
  posts?: Record<string, PostData>; // { "post_50233388": {...}, "post_50280395": {...} }
  
  // Datos compartidos del navegador
  isPaused: boolean; // Pausa general (afecta todos los posts)
  republishStatus: RepublishStatus; // Tiempo compartido
  lastUpdate: string;
  
  // Estado del sistema
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
  
  // 🆕 Post activo actual (para compatibilidad con sistema anterior)
  activePostId?: string; // ID del post que se está mostrando/editando
  
  // Campos legacy (para navegadores single-post)
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
  
  // Estadísticas
  createdAt?: string;
  isBanned?: boolean;
  bannedAt?: string;
}

// 🆕 INTERFACE PARA BÚSQUEDA (puede retornar post individual o navegador completo)
export interface SearchResult {
  type: "single" | "multi"; // single = navegador antiguo, multi = post dentro de multi-post
  browserName: string;
  
  // Si es single, estos campos están a nivel raíz
  clientName?: string;
  phoneNumber?: string;
  city?: string;
  location?: string;
  postName?: string;
  isPaused?: boolean;
  rentalExpiration?: string;
  rentalRemaining?: RentalRemaining;
  republishStatus?: RepublishStatus;
  
  // Si es multi, apunta a un post específico
  postId?: string; // ID del post encontrado
  postData?: PostData; // Datos del post específico
  
  // Data completa (para mostrar en dashboard)
  fullData: BrowserData;
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
}

export interface StatsEvent {
  type: "ban" | "renewal" | "newClient";
  browserName: string;
  clientName?: string;
  timestamp: string;
  weekId: string;
  details?: any;
}

export const FirebaseAPI = {
  calculateRentalRemaining(rentalExpiration: string): RentalRemaining {
    const diff = new Date(rentalExpiration).getTime() - new Date().getTime();
    
    if (diff <= 0) {
      // 🆕 DEUDA: Tiempo negativo
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
        isMultiPost: false, // 🆕 Por defecto es single-post
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

  // 🆕 BUSCAR POR NOMBRE DE CLIENTE (NUEVO - SOPORTA MULTI-POST)
  async findBrowserByClientName(clientName: string): Promise<SearchResult | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return null;

      const cleanSearch = clientName.trim().toLowerCase();

      // Buscar en todos los navegadores
      for (const [browserName, browserData] of Object.entries(browsers)) {
        const data = browserData as BrowserData;
        
        // 🔍 CASO 1: Navegador single-post (sistema antiguo)
        if (!data.isMultiPost) {
          const browserClientName = (data.clientName || "").trim().toLowerCase();
          
          if (browserClientName === cleanSearch || browserClientName.includes(cleanSearch)) {
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
        
        // 🔍 CASO 2: Navegador multi-post (buscar en posts)
        if (data.isMultiPost && data.posts) {
          for (const [postId, postData] of Object.entries(data.posts)) {
            const post = postData as PostData;
            const postClientName = (post.clientName || "").trim().toLowerCase();
            
            if (postClientName === cleanSearch || postClientName.includes(cleanSearch)) {
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
                republishStatus: data.republishStatus, // Compartido del navegador
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

  // 🆕 BUSCAR TODOS LOS POSTS DE UN CLIENTE (PUEDE HABER MÚLTIPLES)
  async findAllBrowsersByClientName(clientName: string): Promise<SearchResult[]> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return [];

      const cleanSearch = clientName.trim().toLowerCase();
      const results: SearchResult[] = [];

      for (const [browserName, browserData] of Object.entries(browsers)) {
        const data = browserData as BrowserData;
        
        // 🔍 CASO 1: Navegador single-post
        if (!data.isMultiPost) {
          const browserClientName = (data.clientName || "").trim().toLowerCase();
          
          if (browserClientName === cleanSearch || browserClientName.includes(cleanSearch)) {
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
        
        // 🔍 CASO 2: Navegador multi-post
        if (data.isMultiPost && data.posts) {
          for (const [postId, postData] of Object.entries(data.posts)) {
            const post = postData as PostData;
            const postClientName = (post.clientName || "").trim().toLowerCase();
            
            if (postClientName === cleanSearch || postClientName.includes(cleanSearch)) {
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

  // 🆕 COMANDOS PARA POSTS INDIVIDUALES
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

  // 🆕 PAUSAR POST INDIVIDUAL (MODIFICADO - AHORA ENVÍA COMANDO)
  async togglePausePost(browserName: string, postId: string | undefined, newState: boolean) {
    try {
      const browserData = await this.findBrowserByName(browserName);
      
      if (!browserData) {
        return { success: false, error: "Navegador no encontrado" };
      }

      // CASO 1: Navegador single-post (sistema antiguo)
      if (!browserData.isMultiPost || !postId) {
        await update(ref(database, `browsers/${browserName}`), {
          isPaused: newState,
          lastUpdate: new Date().toISOString(),
        });
        
        // 🆕 ENVIAR COMANDO AL BOT
        await this.sendCommand(browserName, newState ? 'pause' : 'resume');
        
        return { success: true };
      }

      // CASO 2: Navegador multi-post (pausar post específico)
      await update(ref(database, `browsers/${browserName}/posts/${postId}`), {
        isPaused: newState,
        lastUpdate: new Date().toISOString(),
      });

      // Actualizar timestamp del navegador
      await update(ref(database, `browsers/${browserName}`), {
        lastUpdate: new Date().toISOString(),
      });

      // 🆕 ENVIAR COMANDO AL BOT CON POST ID
      await this.sendCommand(browserName, newState ? 'pause' : 'resume', { postId });

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

  // 🆕 ACTUALIZAR CAMPO DE POST INDIVIDUAL
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
        email: {
          active: false,
          address: "",
        },
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

  async saveNotificationConfig(
    browserName: string,
    config: NotificationConfig
  ) {
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          browserName,
          tipo: "test",
          config: {
            email,
          },
        }),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
};

export const StatsAPI = {
  getCurrentWeekId(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
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
      
      console.log(`[Stats]: Ban registrado para ${browserName} en ${weekId}`);
      return { success: true };
    } catch (error) {
      console.error("[Stats Error]:", error);
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
      
      console.log(`[Stats]: Renovación registrada para ${browserName} en ${weekId}`);
      return { success: true };
    } catch (error) {
      console.error("[Stats Error]:", error);
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
      
      // 🆕 CALCULAR TOTAL CORRECTO INCLUYENDO MULTI-POST
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
      
      console.log(`[Stats]: Nuevo cliente registrado: ${browserName} en ${weekId}`);
      return { success: true };
    } catch (error) {
      console.error("[Stats Error]:", error);
      return { success: false, error: (error as Error).message };
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
      
      if (snapshot.exists()) {
        return snapshot.val() as WeeklyStats;
      }
      
      return this.createEmptyWeekStats(weekId);
    } catch (error) {
      console.error("[Stats Error]:", error);
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
      
      weeks.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      
      return weeks.slice(0, count);
    } catch (error) {
      console.error("[Stats Error]:", error);
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
      console.error("[Stats Error]:", error);
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
