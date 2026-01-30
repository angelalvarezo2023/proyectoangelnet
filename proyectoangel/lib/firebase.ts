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

// 🆕 POST INDEPENDIENTE - Cada post tiene su propia renta y datos
export interface PostData {
  // Identificación
  postId: string;              // "POST_ABC123"
  uniqueId: string;             // "ABC123" - para link único
  browserName: string;          // Navegador asignado
  postSlot: 1 | 2;             // Slot en el navegador
  
  // Datos del cliente
  clientName: string;
  postName: string;
  age?: string;
  headline?: string;
  body?: string;
  city: string;
  location: string;
  phoneNumber: string;
  
  // 🆕 RENTA INDIVIDUAL (cada post tiene su propia renta)
  rentalExpiration: string;
  rentalRemaining: RentalRemaining;
  
  // 🆕 ESTADO INDIVIDUAL (cada post se pausa/activa independientemente)
  isPaused: boolean;
  editInProgress?: boolean;
  editLog?: string;
  editLogType?: "error" | "success" | "info";
  
  // 🆕 DATOS EXTRAÍDOS DE MEGAPERSONALS (se guardan por post)
  megaPostId?: string;          // ID del post en Megapersonals
  megaPostUrl?: string;          // URL del post
  postIdCapturedAt?: number;    // Timestamp de cuándo se capturó
  
  // Republicación individual
  republishStatus: RepublishStatus;
  
  // Captcha
  captchaWaiting?: boolean;
  captchaImage?: string;
  
  // Notificaciones individuales
  notificationConfig?: NotificationConfig;
  
  // Screenshots
  lastScreenshot?: string;
  
  // Estadísticas individuales
  stats: {
    totalRepublishes: number;
    lastRepublishAt: string;
    successRate?: number;
  };
  
  // Timestamps
  createdAt: string;
  lastUpdate: string;
  
  // Estado
  isActive: boolean;
  isBanned?: boolean;
  bannedAt?: string;
}

// 🆕 NAVEGADOR SIMPLIFICADO - Solo maneja alternancia
export interface BrowserData {
  browserName: string;
  
  // Modo de operación
  mode: "single" | "double";
  currentPost: 1 | 2;           // Qué post republicará ahora
  
  // Referencias a posts
  post1Id?: string;              // "POST_ABC123"
  post2Id?: string;              // "POST_XYZ789"
  
  // Estado de conexión
  lastHeartbeat: string;
  connectionStatus: "online" | "offline" | "error";
  consecutiveErrors: number;
  lastError?: {
    context: string;
    message: string;
    timestamp: string;
    stack?: string;
  };
  
  // Info de navegación
  currentUrl?: string;
  pageTitle?: string;
  
  // Timestamps
  createdAt: string;
  lastUpdate: string;
  
  // ⚠️ YA NO TIENE:
  // - rentalExpiration (ahora en cada post)
  // - rentalRemaining (ahora en cada post)
  // - clientName (ahora en cada post)
  // - phoneNumber (ahora en cada post)
  // - isPaused (ahora en cada post)
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

  // 🆕 GENERAR ID ÚNICO PARA POST
  generatePostId(): string {
    return "POST_" + Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  // 🆕 CREAR POST INDIVIDUAL CON RENTA
  async createPost(
    browserName: string,
    clientName: string,
    days: number,
    hours: number,
    postSlot: 1 | 2 = 1
  ) {
    try {
      const now = new Date();
      const expirationDate = new Date(now);
      expirationDate.setDate(expirationDate.getDate() + days);
      expirationDate.setHours(expirationDate.getHours() + hours);

      const postId = this.generatePostId();
      const uniqueId = this.generateUniqueId();

      const postData: PostData = {
        postId: postId,
        uniqueId: uniqueId,
        browserName: browserName,
        postSlot: postSlot,
        
        clientName: clientName,
        postName: `Post de ${clientName}`,
        city: "",
        location: "",
        phoneNumber: "",
        
        rentalExpiration: expirationDate.toISOString(),
        rentalRemaining: this.calculateRentalRemaining(expirationDate.toISOString()),
        
        isPaused: false,
        
        republishStatus: {
          totalSeconds: 900,
          elapsedSeconds: 0,
          remainingSeconds: 900,
          nextRepublishAt: new Date(now.getTime() + 900000).toISOString(),
        },
        
        stats: {
          totalRepublishes: 0,
          lastRepublishAt: now.toISOString(),
        },
        
        createdAt: now.toISOString(),
        lastUpdate: now.toISOString(),
        isActive: true,
      };

      await set(ref(database, `posts/${postId}`), postData);
      
      // Actualizar referencia en el navegador
      const updateKey = postSlot === 1 ? "post1Id" : "post2Id";
      await update(ref(database, `browsers/${browserName}`), {
        [updateKey]: postId,
        lastUpdate: now.toISOString(),
      });
      
      // Registrar en estadísticas
      await StatsAPI.registerNewClient(postId);
      
      return { success: true, postId, uniqueId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 CREAR NAVEGADOR (sin renta, solo contenedor)
  async createBrowser(browserName: string) {
    try {
      const now = new Date();

      const browserData: BrowserData = {
        browserName: browserName,
        mode: "single",
        currentPost: 1,
        lastHeartbeat: now.toISOString(),
        connectionStatus: "offline",
        consecutiveErrors: 0,
        createdAt: now.toISOString(),
        lastUpdate: now.toISOString(),
      };

      await set(ref(database, `browsers/${browserName}`), browserData);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 CREAR NAVEGADOR CON POST INICIAL
  async createBrowserWithPost(
    browserName: string,
    clientName: string,
    days: number,
    hours: number
  ) {
    try {
      // 1. Crear navegador
      const browserResult = await this.createBrowser(browserName);
      if (!browserResult.success) {
        return browserResult;
      }

      // 2. Crear post inicial
      const postResult = await this.createPost(browserName, clientName, days, hours, 1);
      if (!postResult.success) {
        return postResult;
      }

      return {
        success: true,
        browserName,
        postId: postResult.postId,
        uniqueId: postResult.uniqueId,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 BUSCAR POST POR UNIQUE ID (para links de clientes)
  async findPostByUniqueId(uniqueId: string): Promise<PostData | null> {
    try {
      const snapshot = await get(ref(database, "posts"));
      const posts = snapshot.val();

      if (!posts) return null;

      for (const [, data] of Object.entries(posts)) {
        if ((data as PostData).uniqueId === uniqueId) {
          return data as PostData;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  // 🆕 BUSCAR POST POR POST ID
  async findPostById(postId: string): Promise<PostData | null> {
    try {
      const snapshot = await get(ref(database, `posts/${postId}`));
      return snapshot.exists() ? snapshot.val() as PostData : null;
    } catch {
      return null;
    }
  },

  // 🆕 OBTENER TODOS LOS POSTS
  async getAllPosts(): Promise<Record<string, PostData>> {
    try {
      const snapshot = await get(ref(database, "posts"));
      return snapshot.val() || {};
    } catch {
      return {};
    }
  },

  // 🆕 ESCUCHAR TODOS LOS POSTS
  listenToAllPosts(callback: (posts: Record<string, PostData>) => void) {
    const postsRef = ref(database, "posts");
    const unsubscribe = onValue(postsRef, (snapshot) => {
      callback(snapshot.val() || {});
    });
    return unsubscribe;
  },

  // 🆕 ESCUCHAR POST ESPECÍFICO
  listenToPost(postId: string, callback: (data: PostData | null) => void) {
    const postRef = ref(database, `posts/${postId}`);
    const unsubscribe = onValue(postRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as PostData : null);
    });
    return unsubscribe;
  },

  // 🆕 OBTENER POSTS DE UN NAVEGADOR
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

  // NAVEGADORES
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

  listenToBrowser(browserName: string, callback: (data: BrowserData) => void) {
    const browserRef = ref(database, `browsers/${browserName}`);
    const unsubscribe = onValue(browserRef, (snapshot) => {
      const data = snapshot.val();
      if (data) callback(data);
    });
    return unsubscribe;
  },

  // 🆕 AJUSTAR RENTA DE UN POST ESPECÍFICO
  async adjustPostRental(
    postId: string,
    days: number,
    hours: number,
    action: "establecer" | "agregar"
  ) {
    try {
      const post = await this.findPostById(postId);
      if (!post) {
        return { success: false, error: "Post no encontrado" };
      }

      let newDate = new Date();

      if (action === "establecer") {
        newDate.setDate(newDate.getDate() + days);
        newDate.setHours(newDate.getHours() + hours);
      } else {
        // Agregar a la renta existente
        if (post.rentalExpiration) {
          const currentExpiration = new Date(post.rentalExpiration);
          if (currentExpiration > new Date()) {
            newDate = currentExpiration;
          }
        }
        newDate.setDate(newDate.getDate() + days);
        newDate.setHours(newDate.getHours() + hours);
      }

      await update(ref(database, `posts/${postId}`), {
        rentalExpiration: newDate.toISOString(),
        rentalRemaining: this.calculateRentalRemaining(newDate.toISOString()),
        lastUpdate: new Date().toISOString(),
      });

      // Registrar renovación si es 7 días o más
      if (days >= 7) {
        await StatsAPI.registerRenewal(postId, days);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 PAUSAR/REANUDAR POST
  async togglePostPause(postId: string, newState: boolean) {
    try {
      await update(ref(database, `posts/${postId}`), {
        isPaused: newState,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 ACTUALIZAR DATOS DE POST
  async updatePost(postId: string, updates: Partial<PostData>) {
    try {
      await update(ref(database, `posts/${postId}`), {
        ...updates,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 ELIMINAR POST
  async deletePost(postId: string) {
    try {
      const post = await this.findPostById(postId);
      if (!post) {
        return { success: false, error: "Post no encontrado" };
      }

      // Eliminar post
      await remove(ref(database, `posts/${postId}`));
      
      // Limpiar referencia en navegador
      const updateKey = post.postSlot === 1 ? "post1Id" : "post2Id";
      await update(ref(database, `browsers/${post.browserName}`), {
        [updateKey]: null,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 ELIMINAR NAVEGADOR Y SUS POSTS
  async deleteBrowser(browserName: string) {
    try {
      // Obtener posts del navegador
      const posts = await this.getBrowserPosts(browserName);
      
      // Eliminar cada post
      for (const post of posts) {
        await remove(ref(database, `posts/${post.postId}`));
      }
      
      // Eliminar navegador
      await remove(ref(database, `browsers/${browserName}`));
      await remove(ref(database, `commands/${browserName}`));
      await remove(ref(database, `notifications/${browserName}`));
      await remove(ref(database, `lastNotified/${browserName}`));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 CAMBIAR MODO DEL NAVEGADOR
  async setBrowserMode(browserName: string, mode: "single" | "double") {
    try {
      await update(ref(database, `browsers/${browserName}`), {
        mode: mode,
        currentPost: 1,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // 🆕 ALTERNAR POST ACTUAL
  async switchBrowserPost(browserName: string) {
    try {
      const browser = await this.findBrowserByName(browserName);
      if (!browser) {
        return { success: false, error: "Navegador no encontrado" };
      }

      const newPost = browser.currentPost === 1 ? 2 : 1;
      
      await update(ref(database, `browsers/${browserName}`), {
        currentPost: newPost,
        lastUpdate: new Date().toISOString(),
      });

      return { success: true, newPost };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // COMANDOS
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

  // 🆕 FORZAR REPUBLICACIÓN DE UN POST
  async forceRepublishPost(postId: string) {
    try {
      const post = await this.findPostById(postId);
      if (!post) {
        return { success: false, error: "Post no encontrado" };
      }

      const totalSeconds = 900 + Math.floor(Math.random() * 181);
      const now = new Date();
      
      await update(ref(database, `posts/${postId}`), {
        republishStatus: {
          totalSeconds: totalSeconds,
          elapsedSeconds: 0,
          remainingSeconds: totalSeconds,
          nextRepublishAt: new Date(now.getTime() + totalSeconds * 1000).toISOString(),
        },
        lastUpdate: now.toISOString(),
      });

      // Enviar comando al navegador
      await this.sendCommand(post.browserName, "republish_post", { postId });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // NOTIFICACIONES
  async getNotificationConfig(postId: string): Promise<NotificationConfig | null> {
    try {
      const post = await this.findPostById(postId);
      if (!post) return null;
      
      if (post.notificationConfig) {
        return post.notificationConfig;
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

  async saveNotificationConfig(postId: string, config: NotificationConfig) {
    try {
      await update(ref(database, `posts/${postId}`), {
        notificationConfig: config,
        lastUpdate: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },

  // BÚSQUEDA
  async searchPosts(query: string): Promise<PostData[]> {
    if (!query || query.length < 2) return [];

    try {
      const postsSnapshot = await get(ref(database, "posts"));
      const posts = postsSnapshot.val() || {};
      
      const results: PostData[] = [];
      const queryLower = query.toLowerCase();

      for (const [, postData] of Object.entries(posts)) {
        const post = postData as PostData;
        const matches =
          post.clientName?.toLowerCase().includes(queryLower) ||
          post.postName?.toLowerCase().includes(queryLower) ||
          post.phoneNumber?.includes(query) ||
          post.uniqueId?.toLowerCase().includes(queryLower);

        if (matches) {
          results.push(post);
        }
      }

      return results;
    } catch (error) {
      console.error("Error en búsqueda:", error);
      return [];
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

  async registerBan(postId: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      await update(ref(database, `posts/${postId}`), {
        isBanned: true,
        bannedAt: now,
        isActive: false,
      });
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "ban",
        postId,
        timestamp: now,
        weekId,
      });
      
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      
      if (!currentStats.bannedAccounts.includes(postId)) {
        currentStats.bannedAccounts.push(postId);
      }
      
      await set(statsRef, currentStats);
      
      return { success: true };
    } catch (error) {
      console.error("[Stats Error]:", error);
      return { success: false, error: (error as Error).message };
    }
  },

  async registerRenewal(postId: string, days: number) {
    try {
      if (days < 7) return { success: true };
      
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "renewal",
        postId,
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
      console.error("[Stats Error]:", error);
      return { success: false, error: (error as Error).message };
    }
  },

  async registerNewClient(postId: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "newClient",
        postId,
        timestamp: now,
        weekId,
      });
      
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      
      if (!currentStats.newClients.includes(postId)) {
        currentStats.newClients.push(postId);
      }
      
      const allPosts = await FirebaseAPI.getAllPosts();
      currentStats.totalClients = Object.keys(allPosts).length;
      
      await set(statsRef, currentStats);
      
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
