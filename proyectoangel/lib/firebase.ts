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

export interface BrowserData {
  browserName: string;
  clientName?: string;
  uniqueId?: string;
  phoneNumber: string;
  city: string;
  location: string;
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
  postName?: string;
  postId?: string;
  postUrl?: string;
  postIdCapturedAt?: number;
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
  
  // 🆕 CAMPOS PARA ESTADÍSTICAS
  createdAt?: string; // Fecha de creación del cliente
  isBanned?: boolean; // Si está baneado
  bannedAt?: string; // Cuándo fue baneado
}

// 🆕 INTERFACES PARA ESTADÍSTICAS
export interface WeeklyStats {
  weekId: string; // Formato: "2026-W05"
  startDate: string; // ISO date
  endDate: string; // ISO date
  bannedAccounts: string[]; // Lista de browserNames baneados
  renewals: number; // Cantidad de renovaciones (7 días)
  newClients: string[]; // Lista de browserNames creados esta semana
  totalClients: number; // Total de clientes activos al final de la semana
  totalRevenue?: number; // Ingresos (opcional)
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
        createdAt: now.toISOString(), // 🆕 Registrar fecha de creación
        isBanned: false,
      };

      await set(ref(database, `browsers/${browserName}`), userData);
      
      // 🆕 REGISTRAR EVENTO DE NUEVO CLIENTE
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

  async findAllBrowsersByClientName(clientName: string): Promise<BrowserData[]> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return [];

      const cleanSearch = clientName.trim().toLowerCase();
      const results: BrowserData[] = [];

      for (const [, data] of Object.entries(browsers)) {
        const browserClientName = ((data as BrowserData).clientName || "").trim().toLowerCase();
        
        if (browserClientName === cleanSearch || browserClientName.includes(cleanSearch)) {
          results.push(data as BrowserData);
        }
      }

      return results;
    } catch {
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

// 🆕 API DE ESTADÍSTICAS
export const StatsAPI = {
  // Obtener ID de la semana actual (formato: "2026-W05")
  getCurrentWeekId(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  },

  // Obtener rango de fechas de una semana
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

  // 🆕 Registrar cuenta baneada
  async registerBan(browserName: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      // Actualizar estado del browser
      await update(ref(database, `browsers/${browserName}`), {
        isBanned: true,
        bannedAt: now,
      });
      
      // Registrar evento
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "ban",
        browserName,
        timestamp: now,
        weekId,
      });
      
      // Actualizar estadísticas de la semana
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

  // 🆕 Registrar renovación (cuando agregues/establezcas 7 días)
  async registerRenewal(browserName: string, days: number) {
    try {
      // Solo contar si se agregan/establecen 7 días o más
      if (days < 7) return { success: true };
      
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      // Registrar evento
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "renewal",
        browserName,
        days,
        timestamp: now,
        weekId,
      });
      
      // Actualizar estadísticas de la semana
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

  // 🆕 Registrar nuevo cliente
  async registerNewClient(browserName: string) {
    try {
      const weekId = this.getCurrentWeekId();
      const now = new Date().toISOString();
      
      // Registrar evento
      const eventRef = push(ref(database, `stats/events/${weekId}`));
      await set(eventRef, {
        type: "newClient",
        browserName,
        timestamp: now,
        weekId,
      });
      
      // Actualizar estadísticas de la semana
      const statsRef = ref(database, `stats/weeks/${weekId}`);
      const snapshot = await get(statsRef);
      const currentStats = snapshot.val() || this.createEmptyWeekStats(weekId);
      
      if (!currentStats.newClients.includes(browserName)) {
        currentStats.newClients.push(browserName);
      }
      
      // Actualizar total de clientes
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

  // Crear estadísticas vacías para una semana
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

  // 🆕 Obtener estadísticas de la semana actual
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

  // 🆕 Obtener historial de semanas (últimas N semanas)
  async getWeeksHistory(count: number = 12): Promise<WeeklyStats[]> {
    try {
      const statsRef = ref(database, `stats/weeks`);
      const snapshot = await get(statsRef);
      
      if (!snapshot.exists()) return [];
      
      const weeksData = snapshot.val();
      const weeks: WeeklyStats[] = Object.values(weeksData);
      
      // Ordenar por fecha (más reciente primero)
      weeks.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      
      return weeks.slice(0, count);
    } catch (error) {
      console.error("[Stats Error]:", error);
      return [];
    }
  },

  // 🆕 Obtener eventos de una semana específica
  async getWeekEvents(weekId: string): Promise<StatsEvent[]> {
    try {
      const eventsRef = ref(database, `stats/events/${weekId}`);
      const snapshot = await get(eventsRef);
      
      if (!snapshot.exists()) return [];
      
      const eventsData = snapshot.val();
      const events: StatsEvent[] = Object.values(eventsData);
      
      // Ordenar por timestamp (más reciente primero)
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return events;
    } catch (error) {
      console.error("[Stats Error]:", error);
      return [];
    }
  },

  // 🆕 Escuchar cambios en estadísticas de la semana actual
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
