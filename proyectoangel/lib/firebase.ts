import { initializeApp, getApps } from "firebase/app";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  type Database,
} from "firebase/database";

const firebaseConfig = {
  databaseURL: "https://megapersonals-4f24c-default-rtdb.firebaseio.com",
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database: Database = getDatabase(app);

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
  lastScreenshot?: string;
  postName?: string;
  
  // NUEVOS CAMPOS PARA MONITOREO EN TIEMPO REAL
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
        
        // Inicializar campos de monitoreo
        connectionStatus: "offline",
        lastHeartbeat: now.toISOString(),
        consecutiveErrors: 0,
      };

      await set(ref(database, `browsers/${browserName}`), userData);
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

  // 🆕 NUEVA FUNCIÓN - Buscar TODOS los navegadores de un cliente
  async findAllBrowsersByClientName(clientName: string): Promise<BrowserData[]> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return [];

      const cleanSearch = clientName.trim().toLowerCase();
      const results: BrowserData[] = [];

      // Buscar todas las coincidencias (exactas y parciales)
      for (const [, data] of Object.entries(browsers)) {
        const browserClientName = ((data as BrowserData).clientName || "").trim().toLowerCase();
        
        // Coincidencia exacta o parcial
        if (browserClientName === cleanSearch || browserClientName.includes(cleanSearch)) {
          results.push(data as BrowserData);
        }
      }

      return results;
    } catch {
      return [];
    }
  },

  // Mantener función original para compatibilidad (retorna solo el primero)
  async findBrowserByClientName(clientName: string): Promise<BrowserData | null> {
    try {
      const snapshot = await get(ref(database, "browsers"));
      const browsers = snapshot.val();
      
      if (!browsers) return null;

      const cleanSearch = clientName.trim().toLowerCase();

      // Buscar coincidencia exacta primero
      for (const [, data] of Object.entries(browsers)) {
        const browserClientName = ((data as BrowserData).clientName || "").trim().toLowerCase();
        if (browserClientName === cleanSearch) {
          return data as BrowserData;
        }
      }

      // Si no hay coincidencia exacta, buscar parcial
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

  // 🆕 NUEVA FUNCIÓN - Actualizar isPaused directamente (SIN LAG)
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

  // 🆕 NUEVA FUNCIÓN - Forzar republicación directamente (SIN LAG)
  async forceRepublish(browserName: string) {
    try {
      const totalSeconds = 900 + Math.floor(Math.random() * 181); // 900-1080 segundos
      const now = new Date();
      
      // Actualizar directamente el estado de republicación
      await update(ref(database, `browsers/${browserName}`), {
        republishStatus: {
          totalSeconds: totalSeconds,
          elapsedSeconds: 0,
          remainingSeconds: totalSeconds,
          nextRepublishAt: new Date(now.getTime() + totalSeconds * 1000).toISOString(),
        },
        lastUpdate: now.toISOString(),
      });

      // También enviar comando para que la extensión lo ejecute
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

  // 🆕 NUEVA FUNCIÓN - Actualizar un campo específico directamente
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

  // 🆕 NUEVA FUNCIÓN - Eliminar navegador completamente
  async deleteBrowser(browserName: string) {
    try {
      // Eliminar de /browsers
      await set(ref(database, `browsers/${browserName}`), null);
      
      // Eliminar comandos pendientes
      await set(ref(database, `commands/${browserName}`), null);
      
      // Eliminar notificaciones si existen
      await set(ref(database, `notifications/${browserName}`), null);
      await set(ref(database, `lastNotified/${browserName}`), null);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
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
    price: "$15/mes",
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
    price: "$30/día - $140/semana",
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
    price: "Desde $29.99",
    stock: 99,
    gradient: "from-purple-500 to-pink-500",
  },
];
