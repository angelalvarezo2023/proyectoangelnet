// ==================== PROXY6.NET API SERVICE (UPDATED) ====================
// Servicio para gestionar proxies usando Next.js API route (evita CORS)

export interface ProxyInfo {
  id: string;
  ip: string;
  port: number;
  user: string;
  pass: string;
  type: string; // 'http', 'socks5'
  country: string;
  city: string;
  date: string; // Fecha de compra
  date_end: string; // Fecha de expiración
  active: boolean;
  descr: string; // Descripción
}

export interface ProxyTimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  totalSeconds: number;
  percentage: number;
  expired: boolean;
}

export const Proxy6API = {
  /**
   * Obtener lista de proxies del usuario (via API route)
   */
  async getProxies(): Promise<{ success: boolean; proxies?: ProxyInfo[]; error?: string }> {
    try {
      const response = await fetch('/api/proxy?action=getproxy');
      const data = await response.json();

      if (data.status === "yes") {
        const proxies: ProxyInfo[] = [];
        
        // proxy6.net devuelve objeto con IDs como keys
        for (const [id, proxyData] of Object.entries(data.list as Record<string, any>)) {
          proxies.push({
            id,
            ip: proxyData.host,
            port: parseInt(proxyData.port),
            user: proxyData.user,
            pass: proxyData.pass,
            type: proxyData.type,
            country: proxyData.country,
            city: proxyData.city || "Unknown",
            date: proxyData.date,
            date_end: proxyData.date_end,
            active: proxyData.active === "1",
            descr: proxyData.descr || "",
          });
        }

        return { success: true, proxies };
      } else {
        return { success: false, error: data.error || "Error obteniendo proxies" };
      }
    } catch (error) {
      console.error("[Proxy6API]: Error:", error);
      return { success: false, error: "Error de conexión. Verifica tu conexión a internet." };
    }
  },

  /**
   * Buscar proxy por IP específica (via API route)
   */
  async getProxyByIP(ip: string): Promise<{ success: boolean; proxy?: ProxyInfo; error?: string }> {
    try {
      const response = await fetch(`/api/proxy?action=getproxy_by_ip&ip=${encodeURIComponent(ip)}`);
      const data = await response.json();

      if (data.status === "yes" && data.proxy) {
        // Transformar datos al formato esperado
        const proxyData = data.proxy;
        const proxy: ProxyInfo = {
          id: proxyData.id,
          ip: proxyData.host,
          port: parseInt(proxyData.port),
          user: proxyData.user,
          pass: proxyData.pass,
          type: proxyData.type,
          country: proxyData.country,
          city: proxyData.city || "Unknown",
          date: proxyData.date,
          date_end: proxyData.date_end,
          active: proxyData.active === "1" || proxyData.active === true,
          descr: proxyData.descr || "",
        };

        return { success: true, proxy };
      } else {
        return { success: false, error: data.error || "Proxy no encontrado con esa IP" };
      }
    } catch (error) {
      console.error("[Proxy6API]: Error:", error);
      return { success: false, error: "Error de conexión. Verifica tu conexión a internet." };
    }
  },

  /**
   * Calcular tiempo restante del proxy
   */
  calculateTimeRemaining(proxy: ProxyInfo): ProxyTimeRemaining {
    const now = new Date();
    const endDate = new Date(proxy.date_end);
    const startDate = new Date(proxy.date);
    
    const totalSeconds = Math.floor((endDate.getTime() - now.getTime()) / 1000);
    const expired = totalSeconds <= 0;
    
    const days = Math.floor(Math.abs(totalSeconds) / 86400);
    const hours = Math.floor((Math.abs(totalSeconds) % 86400) / 3600);
    const minutes = Math.floor((Math.abs(totalSeconds) % 3600) / 60);
    
    // Calcular porcentaje usado
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const percentage = Math.min(100, Math.max(0, ((totalDuration - elapsed) / totalDuration) * 100));
    
    return {
      days: expired ? -days : days,
      hours,
      minutes,
      totalSeconds: expired ? -Math.abs(totalSeconds) : totalSeconds,
      percentage,
      expired,
    };
  },

  /**
   * Formatear tiempo restante como string
   */
  formatTimeRemaining(time: ProxyTimeRemaining): string {
    if (time.expired) {
      return `⏰ Expirado hace ${time.days}d ${time.hours}h`;
    }
    
    const parts = [];
    if (time.days > 0) parts.push(`${time.days}d`);
    if (time.hours > 0) parts.push(`${time.hours}h`);
    if (time.minutes > 0) parts.push(`${time.minutes}m`);
    
    return parts.length > 0 ? parts.join(" ") : "Menos de 1 minuto";
  },

  /**
   * Obtener precio para renovación (via API route)
   */
  async getRenewalPrice(period: number, count: number = 1): Promise<{ success: boolean; price?: number; error?: string }> {
    try {
      const response = await fetch(`/api/proxy?action=getprice&period=${period}&count=${count}`);
      const data = await response.json();

      if (data.status === "yes") {
        return { success: true, price: parseFloat(data.price) };
      } else {
        return { success: false, error: "Error obteniendo precio" };
      }
    } catch (error) {
      console.error("[Proxy6API]: Error obteniendo precio:", error);
      return { success: false, error: "Error de conexión" };
    }
  },

  /**
   * Renovar proxy (extender tiempo)
   * NOTA: Esta función genera un link de pago, no renueva automáticamente
   */
  async renewProxy(proxyId: string, period: number): Promise<{ success: boolean; message?: string; error?: string }> {
    // Por ahora, redirigir a WhatsApp para renovación manual
    return { 
      success: false, 
      error: "Para renovar tu proxy, contacta por WhatsApp" 
    };
  },

  /**
   * Obtener balance de la cuenta (via API route)
   */
  async getBalance(): Promise<{ success: boolean; balance?: number; currency?: string; error?: string }> {
    try {
      const response = await fetch('/api/proxy?action=getbalance');
      const data = await response.json();

      if (data.status === "yes") {
        return { 
          success: true, 
          balance: parseFloat(data.balance),
          currency: data.currency || "USD"
        };
      } else {
        return { success: false, error: "Error obteniendo balance" };
      }
    } catch (error) {
      console.error("[Proxy6API]: Error obteniendo balance:", error);
      return { success: false, error: "Error de conexión" };
    }
  },

  /**
   * Test de conexión básico
   * NOTA: Esto es una simulación. Un test real requiere hacer request a través del proxy
   */
  async testProxy(proxy: ProxyInfo): Promise<{ success: boolean; online: boolean; ping?: number; error?: string }> {
    try {
      // Simular test (en producción necesitarías un endpoint que pruebe el proxy)
      const startTime = Date.now();
      
      // Por ahora, asumimos que está online si está activo y no expirado
      const timeRemaining = this.calculateTimeRemaining(proxy);
      const online = proxy.active && !timeRemaining.expired;
      
      const ping = Date.now() - startTime;

      return {
        success: true,
        online,
        ping: online ? Math.floor(Math.random() * 50) + 20 : 0, // Simulado
      };
    } catch (error) {
      return {
        success: false,
        online: false,
        error: "Error probando conexión",
      };
    }
  },
};
