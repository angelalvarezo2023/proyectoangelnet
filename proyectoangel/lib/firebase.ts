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
  apiKey: "AIzaSyABwJCZpBeCXu0-X16HpKnHoJXL4tVjTAY",
  authDomain: "megapersonals-4f24c.firebaseapp.com",
  databaseURL: "https://megapersonals-4f24c-default-rtdb.firebaseio.com",
  projectId: "megapersonals-4f24c",
  storageBucket: "megapersonals-4f24c.firebasestorage.app",
  messagingSenderId: "35208143914",
  appId: "1:35208143914:web:06ffcc05069eaf88af0f53",
  measurementId: "G-EMFS14MSGS"
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
  browserName: string;
  postSlot: 1 | 2; // Indica si es Post 1 o Post 2
  
  // Datos del cliente/post
  clientName: string;
  postName: string;
  age?: string;
  headline?: string;
  body?: string;
  city: string;
  location: string;
  phoneNumber: string;
  
  // Megapersonals info
  megaPostId?: string;
  megaPostUrl?: string;
  postIdCapturedAt?: number;
  
  // Estadísticas
  stats?: {
    totalRepublishes: number;
    lastRepublishAt: string;
    successRate?: number;
  };
  
  // Estado
  isActive: boolean;
  lastUpdate: string;
}

export interface BrowserData {
  browserName: string;
  
  // 🆕 MODO (single o double)
  mode?: "single" | "double";
  currentPost?: 1 | 2; // En modo double, indica cuál post publicará ahora
  
  // 🆕 REFERENCIAS A POSTS (modo double)
  post1Id?: string; // "BrowserName_Post1"
  post2Id?: string; // "BrowserName_Post2"
  
  // DATOS LEGACY (modo single) - mantener compatibilidad
  clientName?: string;
  phoneNumber?: string;
  city?: string;
  location?: string;
  postName?: string;
  postId?: string;
  postUrl?: string;
  postIdCapturedAt?: number;
  
  // Datos comunes (ambos modos)
  uniqueId?: string;
  isPaused: boolean;
  rentalExpiration: string;
  rentalRemaining: RentalRemaining;
  republishStatus: RepublishStatus;
  lastUpdate: string;
  manuallyCreated?: boolean;
  editInProgress?: boolean;
  editLog?: string;
  editLogType?: "error" | "success" | "info";
  captchaWaiting?: boolean;
  captchaImage?: string;
  notificationConfig?: NotificationConfig;
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
  
  // Estadísticas
  createdAt?: string;
  isBanned?: boolean;
  bannedAt?: string;
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
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0 };
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
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
        mode: "single", // 🆕 Por defecto modo single
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

  // 🆕 BUSCAR POR NOMBRE DE CLIENTE (incluye posts dual)
  async findAllBrowsersByClientName(clientName: string): Promise<Array<{browser: BrowserData, post?: PostData}>> {
    try {
      const cleanSearch = clientName.trim().toLowerCase();
      const results: Array<{browser: BrowserData, post?: PostData}> = [];

      // Buscar en navegadores
      const browsersSnapshot = await get(ref(database, "browsers"));
      const browsers = browsersSnapshot.val() || {};

      // Buscar en posts independientes
      const postsSnapshot = await get(ref(database, "posts"));
      const posts = postsSnapshot.val() || {};

      // Buscar en navegadores modo single
      for (const [, browserData] of Object.entries(browsers)) {
        const browser = browserData as BrowserData;
        
        if (browser.mode === "single" || !browser.mode) {
          const browserClientName = (browser.clientName || "").trim().toLowerCase();
          
          if (browserClientName === cleanSearch || browserClientName.includes(cleanSearch)) {
            results.push({ browser });
          }
        }
      }

      // Buscar en posts independientes (modo dual)
      for (const [, postData] of Object.entries(posts)) {
        const post = postData as PostData;
        const postClientName = (post.clientName || "").trim().toLowerCase();
        
        if (postClientName === cleanSearch || postClientName.includes(cleanSearch)) {
          const browser = browsers[post.browserName] as BrowserData;
          if (browser) {
            results.push({ browser, post });
          }
        }
      }

      return results;
    } catch (error) {
      console.error("Error en búsqueda:", error);
      return [];
    }
  },

  async findBrowserByClientName(clientName: string): Promise<BrowserData | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return null;

      const cleanSearch = clientName.trim().toLowerCase();

      for (const [, data] of Object.entries(browsers)) {
        const browserClientName = ((data as BrowserData).clientName || "").trim().toLowerCase();
        if (browserClientName === cleanSearch) {
          return data as BrowserData;
        }
      }

      for (const [, data] of Object.entries(browsers)) {
        const browserClientName = ((data as BrowserData).clientName || "").trim().toLowerCase();
        if (browserClientName.includes(cleanSearch)) {
          return data as BrowserData;
        }
      }

      return null;
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

  async togglePause(browserName: string, newState: boolean) {
    try {
      await update(ref(database, `browsers/${browserName}`), {
        isPaused: newState,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
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
      // Obtener info del browser antes de eliminar
      const browser = await this.findBrowserByName(browserName);
      
      // Si es modo dual, eliminar los posts también
      if (browser && browser.mode === "double") {
        if (browser.post1Id) {
          await remove(ref(database, `posts/${browser.post1Id}`));
        }
        if (browser.post2Id) {
          await remove(ref(database, `posts/${browser.post2Id}`));
        }
      }
      
      // Eliminar browser y datos relacionados
      await remove(ref(database, `browsers/${browserName}`));
      await remove(ref(database, `commands/${browserName}`));
      await remove(ref(database, `notifications/${browserName}`));
      await remove(ref(database, `lastNotified/${browserName}`));
      
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

  // 🆕 API PARA POSTS INDIVIDUALES
  
  // Obtener un post por ID
  async getPost(postId: string): Promise<PostData | null> {
    try {
      const snapshot = await get(ref(database, `posts/${postId}`));
      return snapshot.exists() ? snapshot.val() as PostData : null;
    } catch (error) {
      console.error("Error obteniendo post:", error);
      return null;
    }
  },

  // Obtener todos los posts de un navegador
  async getBrowserPosts(browserName: string): Promise<PostData[]> {
    try {
      const postsSnapshot = await get(ref(database, "posts"));
      const posts = postsSnapshot.val() || {};
      
      const browserPosts: PostData[] = [];
      for (const [, postData] of Object.entries(posts)) {
        const post = postData as PostData;
        if (post.browserName === browserName) {
          browserPosts.push(post);
        }
      }
      
      // Ordenar por postSlot
      browserPosts.sort((a, b) => a.postSlot - b.postSlot);
      return browserPosts;
    } catch (error) {
      console.error("Error obteniendo posts del navegador:", error);
      return [];
    }
  },

  // Escuchar cambios en un post
  listenToPost(postId: string, callback: (data: PostData | null) => void) {
    const postRef = ref(database, `posts/${postId}`);
    const unsubscribe = onValue(postRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as PostData : null);
    });
    return unsubscribe;
  },

  // Escuchar todos los posts
  listenToAllPosts(callback: (posts: Record<string, PostData>) => void) {
    const postsRef = ref(database, "posts");
    const unsubscribe = onValue(postsRef, (snapshot) => {
      callback(snapshot.val() || {});
    });
    return unsubscribe;
  },

  // 🆕 Activar/Desactivar modo dual
  async toggleDualMode(browserName: string, enableDual: boolean) {
    try {
      const browser = await this.findBrowserByName(browserName);
      if (!browser) {
        return { success: false, error: "Navegador no encontrado" };
      }

      if (enableDual) {
        // Activar modo dual
        const post1Id = `${browserName}_Post1`;
        const post2Id = `${browserName}_Post2`;

        // Crear posts si no existen
        const post1Exists = await get(ref(database, `posts/${post1Id}`));
        if (!post1Exists.exists()) {
          const post1: PostData = {
            postId: post1Id,
            browserName: browserName,
            postSlot: 1,
            clientName: browser.clientName || "Cliente 1",
            postName: browser.postName || "Post 1",
            city: browser.city || "",
            location: browser.location || "",
            phoneNumber: browser.phoneNumber || "",
            isActive: true,
            lastUpdate: new Date().toISOString(),
            stats: {
              totalRepublishes: 0,
              lastRepublishAt: new Date().toISOString(),
            },
          };
          await set(ref(database, `posts/${post1Id}`), post1);
        }

        const post2Exists = await get(ref(database, `posts/${post2Id}`));
        if (!post2Exists.exists()) {
          const post2: PostData = {
            postId: post2Id,
            browserName: browserName,
            postSlot: 2,
            clientName: "Cliente 2",
            postName: "Post 2",
            city: browser.city || "",
            location: browser.location || "",
            phoneNumber: "",
            isActive: false,
            lastUpdate: new Date().toISOString(),
            stats: {
              totalRepublishes: 0,
              lastRepublishAt: new Date().toISOString(),
            },
          };
          await set(ref(database, `posts/${post2Id}`), post2);
        }

        // Actualizar browser
        await update(ref(database, `browsers/${browserName}`), {
          mode: "double",
          currentPost: 1,
          post1Id: post1Id,
          post2Id: post2Id,
          lastUpdate: new Date().toISOString(),
        });

        // Enviar comando a la extensión
        await this.sendCommand(browserName, "set_mode", { mode: "double" });

        return { success: true, message: "Modo dual activado" };
      } else {
        // Desactivar modo dual
        await update(ref(database, `browsers/${browserName}`), {
          mode: "single",
          currentPost: null,
          post1Id: null,
          post2Id: null,
          lastUpdate: new Date().toISOString(),
        });

        // Enviar comando a la extensión
        await this.sendCommand(browserName, "set_mode", { mode: "single" });

        return { success: true, message: "Modo dual desactivado" };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 Cambiar manualmente al otro post
  async switchPost(browserName: string) {
    try {
      const browser = await this.findBrowserByName(browserName);
      if (!browser || browser.mode !== "double") {
        return { success: false, error: "El navegador no está en modo dual" };
      }

      const newPost = browser.currentPost === 1 ? 2 : 1;
      
      await update(ref(database, `browsers/${browserName}`), {
        currentPost: newPost,
        lastUpdate: new Date().toISOString(),
      });

      await this.sendCommand(browserName, "switch_post", {});

      return { success: true, newPost };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 Editar un post específico
  async editPost(browserName: string, postNumber: 1 | 2, changes: Partial<PostData>) {
    try {
      const browser = await this.findBrowserByName(browserName);
      if (!browser || browser.mode !== "double") {
        return { success: false, error: "El navegador no está en modo dual" };
      }

      const postId = postNumber === 1 ? browser.post1Id : browser.post2Id;
      if (!postId) {
        return { success: false, error: "Post no encontrado" };
      }

      // Actualizar post en Firebase
      await update(ref(database, `posts/${postId}`), {
        ...changes,
        lastUpdate: new Date().toISOString(),
      });

      // Enviar comando a la extensión
      await this.sendCommand(browserName, "edit_post", {
        postNumber,
        changes,
      });

      return { success: true };
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
      
      const allBrowsers = await FirebaseAPI.getAllBrowsers();
      currentStats.totalClients = Object.keys(allBrowsers).length;
      
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
    subtitle: "Flexible y económico",
    description: "Alquiler por día o semana según tus necesidades.",
    features: ["Sin compromisos", "Renovable", "Soporte técnico", "Activación rápida"],
    price: "$30/día - $150/semana",
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
