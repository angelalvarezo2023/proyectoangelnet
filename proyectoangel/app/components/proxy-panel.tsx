"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Proxy6API, type ProxyInfo, type ProxyTimeRemaining } from "@/lib/proxy-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PanelView = "search" | "details";

interface ProxyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProxyPanel({ isOpen, onClose }: ProxyPanelProps) {
  const [view, setView] = useState<PanelView>("search");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false); // 🆕 Estado para check
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Search state
  const [searchIP, setSearchIP] = useState("");
  
  // Proxy data
  const [proxyData, setProxyData] = useState<ProxyInfo | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<ProxyTimeRemaining | null>(null);
  const [proxyStatus, setProxyStatus] = useState<{
    online: boolean;
    ping: number;
    checked: boolean; // 🆕 Para saber si ya fue verificado
    proxy_ip?: string; // 🆕 IP real del proxy
  } | null>(null);
  
  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setView("search");
      setError("");
      setSuccess("");
      setSearchIP("");
      setProxyData(null);
      setTimeRemaining(null);
      setProxyStatus(null);
    }
  }, [isOpen]);

  // Auto-check saved IP
  useEffect(() => {
    if (isOpen) {
      const savedIP = localStorage.getItem("proxy_last_ip");
      if (savedIP) {
        setSearchIP(savedIP);
      }
    }
  }, [isOpen]);

  // Handle search
  const handleSearch = async () => {
    const ip = searchIP.trim();
    
    if (!ip) {
      setError("Ingresa una IP");
      return;
    }

    // Validar formato IP básico
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      setError("Formato de IP inválido (ejemplo: 185.244.31.25)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Buscar proxy por IP
      const result = await Proxy6API.getProxyByIP(ip);

      if (result.success && result.proxy) {
        setProxyData(result.proxy);
        
        // Calcular tiempo restante
        const time = Proxy6API.calculateTimeRemaining(result.proxy);
        setTimeRemaining(time);
        
        // Estado inicial (no verificado aún)
        setProxyStatus({
          online: !time.expired, // Asumir online si no está expirado
          ping: 0,
          checked: false, // 🆕 Aún no verificado
        });
        
        // Guardar IP en localStorage
        localStorage.setItem("proxy_last_ip", ip);
        
        setView("details");
      } else {
        setError(result.error || "Proxy no encontrado");
      }
    } catch (err) {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // 🆕 Verificar conexión REAL del proxy
  const handleCheckConnection = async () => {
    if (!proxyData) return;

    setChecking(true);
    setError("");

    try {
      const response = await fetch('/api/proxy/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: proxyData.host,
          port: proxyData.port,
          user: proxyData.user,
          pass: proxyData.pass,
          type: proxyData.type,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setProxyStatus({
          online: data.online,
          ping: data.ping || 0,
          checked: true, // 🆕 Ya verificado
          proxy_ip: data.proxy_ip,
        });

        if (data.online) {
          setSuccess(`✅ Proxy funcionando! Latencia: ${data.ping}ms`);
        } else {
          setError(`❌ ${data.message || 'Proxy no responde'}`);
        }
      } else {
        setError('Error verificando conexión');
      }
    } catch (err) {
      setError('Error verificando conexión');
    } finally {
      setChecking(false);
    }
  };

  // Handle back
  const handleBack = () => {
    setView("search");
    setProxyData(null);
    setTimeRemaining(null);
    setProxyStatus(null);
    setError("");
    setSuccess("");
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`${label} copiado!`);
    setTimeout(() => setSuccess(""), 2000);
  };

  // Get status color
  const getStatusColor = (time: ProxyTimeRemaining | null) => {
    if (!time) return "text-muted-foreground";
    if (time.expired) return "text-red-400";
    if (time.days === 0 && time.hours < 12) return "text-red-400";
    if (time.days === 0) return "text-yellow-400";
    if (time.days < 3) return "text-yellow-400";
    if (time.days < 7) return "text-orange-400";
    return "text-green-400";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Search View */}
        {view === "search" && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white text-2xl mb-4">
                🌐
              </div>
              <h2 className="text-2xl font-bold text-foreground">Verificar Mi Proxy</h2>
              <p className="text-muted-foreground mt-2">Ingresa la IP de tu proxy para ver detalles</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  IP del Proxy:
                </label>
                <Input
                  type="text"
                  value={searchIP}
                  onChange={(e) => setSearchIP(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="185.244.31.25"
                  className="text-center text-lg font-mono"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Ejemplo: 185.244.31.25
                </p>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              <Button
                onClick={handleSearch}
                disabled={loading}
                className="w-full h-14 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white font-semibold text-lg"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Buscando...
                  </span>
                ) : (
                  "🔍 Verificar Proxy"
                )}
              </Button>

              <div className="rounded-xl bg-secondary/30 border border-border p-4 mt-6">
                <p className="text-xs text-muted-foreground text-center">
                  💡 <strong>Tip:</strong> La IP de tu proxy está en el email que recibiste al comprar.
                  Si no lo encuentras, contáctame por WhatsApp.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Details View */}
        {view === "details" && proxyData && timeRemaining && (
          <div className="p-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">Detalles del Proxy</h2>
              <p className="text-muted-foreground mt-2">{proxyData.host}</p>
            </div>

            {/* Status Card */}
            <div className={cn(
              "rounded-2xl border p-6 mb-6",
              timeRemaining.expired 
                ? "border-red-500/30 bg-red-500/10"
                : proxyStatus?.checked && !proxyStatus?.online
                ? "border-red-500/30 bg-red-500/10"
                : "border-green-500/30 bg-green-500/10"
            )}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold",
                    proxyStatus?.checked
                      ? proxyStatus.online && !timeRemaining.expired
                        ? "bg-green-500/20 text-green-400 border border-green-500/20"
                        : "bg-red-500/20 text-red-400 border border-red-500/20"
                      : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/20"
                  )}>
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      proxyStatus?.checked
                        ? proxyStatus.online && !timeRemaining.expired 
                          ? "bg-green-400 animate-pulse" 
                          : "bg-red-400"
                        : "bg-yellow-400 animate-pulse"
                    )} />
                    {proxyStatus?.checked 
                      ? (proxyStatus.online && !timeRemaining.expired ? "Online" : "Offline")
                      : "No verificado"
                    }
                  </span>
                  
                  {/* 🆕 Botón para verificar conexión */}
                  <button
                    onClick={handleCheckConnection}
                    disabled={checking}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                      checking 
                        ? "bg-secondary text-muted-foreground cursor-not-allowed"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    {checking ? (
                      <span className="flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verificando...
                      </span>
                    ) : (
                      "🔄 Probar Conexión"
                    )}
                  </button>
                </div>
              </div>

              <div className="text-center">
                <div className={cn("text-4xl font-bold mb-2", getStatusColor(timeRemaining))}>
                  {Proxy6API.formatTimeRemaining(timeRemaining)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {timeRemaining.expired 
                    ? "Tu proxy ha expirado" 
                    : `Expira el ${new Date(proxyData.date_end).toLocaleDateString()}`
                  }
                </p>

                {/* Progress bar */}
                {!timeRemaining.expired && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                      style={{ width: `${timeRemaining.percentage}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Connection Info */}
            <div className="rounded-2xl border border-border bg-secondary/30 p-6 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Información de Conexión
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">IP:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{proxyData.host}</span>
                    <button
                      onClick={() => copyToClipboard(proxyData.host, "IP")}
                      className="p-1 hover:bg-secondary rounded transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Puerto:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{proxyData.port}</span>
                    <button
                      onClick={() => copyToClipboard(String(proxyData.port), "Puerto")}
                      className="p-1 hover:bg-secondary rounded transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Usuario:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{proxyData.user}</span>
                    <button
                      onClick={() => copyToClipboard(proxyData.user, "Usuario")}
                      className="p-1 hover:bg-secondary rounded transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Contraseña:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">••••••••</span>
                    <button
                      onClick={() => copyToClipboard(proxyData.pass, "Contraseña")}
                      className="p-1 hover:bg-secondary rounded transition-colors"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Tipo:</span>
                  <span className="font-semibold text-foreground uppercase">{proxyData.type}</span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Ubicación:</span>
                  <span className="font-semibold text-foreground">{proxyData.city || 'Unknown'}, {proxyData.country}</span>
                </div>
              </div>

              {/* Copy All Button */}
              <Button
                onClick={() => {
                  const config = `${proxyData.host}:${proxyData.port}:${proxyData.user}:${proxyData.pass}`;
                  copyToClipboard(config, "Configuración completa");
                }}
                variant="outline"
                className="w-full mt-4"
              >
                📋 Copiar Todo
              </Button>
            </div>

            {/* Performance */}
            {proxyStatus?.checked && (
              <div className="rounded-2xl border border-border bg-secondary/30 p-6 mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Rendimiento
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 rounded-xl bg-background/50">
                    <p className={cn(
                      "text-2xl font-bold",
                      proxyStatus.online ? "text-primary" : "text-red-400"
                    )}>
                      {proxyStatus.online ? `${proxyStatus.ping}ms` : '---'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Latencia</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-background/50">
                    <p className={cn(
                      "text-2xl font-bold",
                      proxyStatus.online ? "text-green-400" : "text-red-400"
                    )}>
                      {proxyStatus.online ? "99.9%" : "0%"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Uptime</p>
                  </div>
                </div>
                
                {/* 🆕 Mostrar IP real del proxy si está disponible */}
                {proxyStatus.proxy_ip && (
                  <div className="mt-4 p-3 rounded-xl bg-background/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">IP Real del Proxy:</p>
                    <p className="font-mono font-semibold text-primary">{proxyStatus.proxy_ip}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {timeRemaining.expired ? (
                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 text-center">
                  <p className="text-yellow-400 font-semibold mb-2">⚠️ Proxy Expirado</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Contacta para renovar tu proxy
                  </p>
                  <Button
                    onClick={() => window.open(`https://wa.me/18293837695?text=Hola, quiero renovar mi proxy ${proxyData.host}`, "_blank")}
                    className="w-full bg-green-500 hover:bg-green-600"
                  >
                    💬 Contactar por WhatsApp
                  </Button>
                </div>
              ) : proxyStatus?.checked && !proxyStatus.online ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-center">
                  <p className="text-red-400 font-semibold mb-2">❌ Proxy Sin Conexión</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    El proxy no responde. Puede estar en mantenimiento o tener problemas de conexión.
                  </p>
                  <Button
                    onClick={() => window.open(`https://wa.me/18293837695?text=Hola, mi proxy ${proxyData.host} no tiene conexión`, "_blank")}
                    className="w-full bg-red-500 hover:bg-red-600"
                  >
                    💬 Reportar Problema
                  </Button>
                </div>
              ) : timeRemaining.days < 3 ? (
                <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4 text-center">
                  <p className="text-orange-400 font-semibold mb-2">⏰ Expira Pronto</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Renueva ahora para no perder servicio
                  </p>
                  <Button
                    onClick={() => window.open(`https://wa.me/18293837695?text=Hola, quiero renovar mi proxy ${proxyData.host}`, "_blank")}
                    className="w-full bg-orange-500 hover:bg-orange-600"
                  >
                    🔄 Renovar Ahora
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => window.open(`https://wa.me/18293837695?text=Hola, tengo una consulta sobre mi proxy ${proxyData.host}`, "_blank")}
                  variant="outline"
                  className="w-full"
                >
                  💬 Contactar Soporte
                </Button>
              )}
            </div>

            {success && (
              <div className="mt-4 rounded-xl bg-green-500/10 border border-green-500/30 p-3">
                <p className="text-green-400 text-sm text-center">{success}</p>
              </div>
            )}

            {error && !success && (
              <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
