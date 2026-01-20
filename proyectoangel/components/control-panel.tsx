"use client";

import { useState, useEffect } from "react";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { SearchIcon, SettingsIcon, UserIcon, PhoneIcon, MapPinIcon, AlertTriangleIcon } from "@/components/icons";
import { Dashboard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ControlPanelProps {
  initialBrowserData?: BrowserData | null;
  initialError?: string;
}

function formatRentalTime(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "Sin renta";
  if (rental.days === 0 && rental.hours === 0 && rental.minutes === 0) return "Expirada";
  const parts = [];
  if (rental.days > 0) parts.push(`${rental.days}d`);
  if (rental.hours > 0) parts.push(`${rental.hours}h`);
  if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
  return parts.join(" ");
}

// Componente para tarjeta de navegador con datos en tiempo real desde Firebase
function BrowserCard({ browser, onClick }: { browser: BrowserData; onClick: () => void }) {
  const [timeRemaining, setTimeRemaining] = useState<{ minutes: number; seconds: number } | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    if (!browser.republishStatus) {
      setTimeRemaining(null);
      setProgressPercent(0);
      return;
    }

    // Usar directamente los datos de Firebase (que se actualizan en el parent)
    const { remainingSeconds, totalSeconds } = browser.republishStatus;
    
    // Calcular minutos y segundos
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    setTimeRemaining({ minutes, seconds });

    // Calcular progreso
    const elapsedSeconds = totalSeconds - remainingSeconds;
    const progress = totalSeconds > 0 ? ((elapsedSeconds / totalSeconds) * 100) : 0;
    setProgressPercent(Math.min(100, Math.max(0, progress)));

  }, [browser.republishStatus?.remainingSeconds, browser.republishStatus?.totalSeconds]);
  
  // Determinar si está completada (para mostrar el mensaje)
  const isCompleted = timeRemaining !== null && timeRemaining.minutes === 0 && timeRemaining.seconds === 0;
  
  // 🆕 Detectar errores por datos N/A (indica problema en la página)
  const hasDataExtractionError = 
    (browser.phoneNumber === "N/A" || browser.phoneNumber === "Manual") &&
    (browser.city === "N/A" || browser.city === "Manual") &&
    (browser.location === "N/A" || browser.location === "Manual");
  
  // 🆕 Detectar si hay un error reportado recientemente (últimos 5 minutos)
  const hasRecentError = browser.lastError && 
    (Date.now() - new Date(browser.lastError.timestamp).getTime()) < 5 * 60 * 1000;
  
  // 🆕 Detectar fallo de republicación (tiempo > totalSeconds + 60s)
  const hasRepublishFailure = browser.republishStatus && 
    browser.republishStatus.elapsedSeconds > (browser.republishStatus.totalSeconds + 60);
  
  const hasError = hasDataExtractionError || hasRecentError || hasRepublishFailure;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-xl border p-6 transition-all hover:shadow-xl hover:shadow-primary/5",
        hasError 
          ? "border-red-500/50 bg-gradient-to-br from-red-500/10 to-card/50" 
          : "border-border bg-gradient-to-br from-card to-card/50 hover:border-primary/50"
      )}
    >
      {/* 🆕 ALERTA DE ERROR */}
      {hasError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">⚠️</span>
            <span className="text-sm font-semibold text-red-400">
              {hasRepublishFailure ? "Fallo en Republicación" :
               hasDataExtractionError ? "Error de Extracción de Datos" :
               "Error Detectado"}
            </span>
          </div>
          {browser.lastError && hasRecentError && (
            <p className="text-xs text-red-300">{browser.lastError.message}</p>
          )}
          {hasDataExtractionError && (
            <p className="text-xs text-red-300">
              No se pudieron extraer los datos de la página. Posible error en Megapersonals.
            </p>
          )}
          {hasRepublishFailure && (
            <p className="text-xs text-red-300">
              El tiempo de republicación excedió el límite. El robot podría estar bloqueado.
            </p>
          )}
        </div>
      )}

      {/* 🔥 BANNER DE ADVERTENCIA DE RENTA (<3 DÍAS) */}
      {browser.rentalRemaining && 
       browser.rentalRemaining.days <= 3 && 
       browser.rentalRemaining.days >= 0 && (
        <div className={cn(
          "mb-4 rounded-xl border-l-4 p-4 transition-all duration-300",
          browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
            ? "bg-destructive/10 border-destructive animate-pulse"
            : browser.rentalRemaining.days === 0
            ? "bg-warning/10 border-warning"
            : "bg-orange-500/10 border-orange-500"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex-shrink-0 rounded-full p-2",
              browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                ? "bg-destructive/20"
                : "bg-warning/20"
            )}>
              <AlertTriangleIcon className={cn(
                "h-6 w-6",
                browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? "text-destructive"
                  : "text-warning"
              )} />
            </div>
            
            <div className="flex-1">
              <p className={cn(
                "font-bold text-sm mb-1",
                browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? "text-destructive"
                  : "text-warning"
              )}>
                {browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? `🚨 ¡Expira en ${browser.rentalRemaining.hours}h ${browser.rentalRemaining.minutes}m!`
                  : browser.rentalRemaining.days === 0
                  ? `⚠️ Vence hoy en ${browser.rentalRemaining.hours}h ${browser.rentalRemaining.minutes}m`
                  : `⏰ Vence en ${browser.rentalRemaining.days}d ${browser.rentalRemaining.hours}h`
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? "Tu anuncio será ELIMINADO si no renuevas AHORA"
                  : "Tu anuncio será eliminado si no renuevas"
                }
              </p>
            </div>
            
            <a 
              href={`https://wa.me/18293837695?text=${encodeURIComponent(
                browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? `URGENTE: Necesito renovar ${browser.browserName} - Expira en ${browser.rentalRemaining.hours}h`
                  : `Hola, quiero renovar ${browser.browserName}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "px-4 py-2 rounded-lg font-bold text-xs transition-all duration-200 hover:scale-105 shadow-lg flex-shrink-0",
                browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
                  : "bg-accent text-accent-foreground hover:bg-accent/90"
              )}
            >
              {browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24
                ? "🔥 RENOVAR"
                : "💬 Renovar"
              }
            </a>
          </div>
          
          {/* Countdown mini para <24h */}
          {browser.rentalRemaining.days === 0 && browser.rentalRemaining.hours < 24 && (
            <div className="mt-3 pt-3 border-t border-destructive/20">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/30 rounded-lg p-1.5">
                  <div className="text-lg font-bold text-destructive">
                    {browser.rentalRemaining.hours}
                  </div>
                  <div className="text-xs text-muted-foreground">Horas</div>
                </div>
                <div className="bg-black/30 rounded-lg p-1.5">
                  <div className="text-lg font-bold text-destructive">
                    {browser.rentalRemaining.minutes}
                  </div>
                  <div className="text-xs text-muted-foreground">Min</div>
                </div>
                <div className="bg-black/30 rounded-lg p-1.5">
                  <div className="text-lg font-bold text-destructive animate-pulse">
                    ⏰
                  </div>
                  <div className="text-xs text-muted-foreground">Urgente</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header con estado */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5",
              browser.isPaused 
                ? "bg-yellow-500/20" 
                : "bg-green-500/20"
            )}
          >
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                browser.isPaused 
                  ? "bg-yellow-400" 
                  : "animate-pulse bg-green-400"
              )}
            />
            <span className={cn(
              "text-xs font-semibold",
              browser.isPaused ? "text-yellow-400" : "text-green-400"
            )}>
              En línea
            </span>
          </div>
        </div>
        <div className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Ver detalles →
        </div>
      </div>

      {/* Nombre del navegador */}
      <h3 className="mb-4 text-xl font-bold text-foreground">
        {browser.browserName}
      </h3>

      {/* Información del perfil */}
      <div className="mb-4 space-y-2 rounded-lg border border-border/50 bg-background/50 p-4">
        {browser.postName && browser.postName !== "N/A" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Nombre del Post:</span>
            <span className="font-semibold text-foreground">{browser.postName}</span>
          </div>
        )}
        {browser.phoneNumber && browser.phoneNumber !== "N/A" && browser.phoneNumber !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Teléfono:</span>
            <span className="font-semibold text-foreground">{browser.phoneNumber}</span>
          </div>
        )}
        {browser.city && browser.city !== "N/A" && browser.city !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ciudad:</span>
            <span className="font-semibold text-foreground">{browser.city}</span>
          </div>
        )}
        {browser.location && browser.location !== "N/A" && browser.location !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ubicación:</span>
            <span className="font-semibold text-foreground">{browser.location}</span>
          </div>
        )}
      </div>

      {/* PRÓXIMA REPUBLICACIÓN */}
      <div className="mb-4 overflow-hidden rounded-xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 to-purple-500/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <svg className="h-4 w-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-pink-400">
            {isCompleted ? "Republicación" : "Próxima Republicación"}
          </span>
        </div>
        
        {timeRemaining ? (
          <>
            <div className="mb-3 text-center">
              {isCompleted ? (
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                  ✓ Completada
                </span>
              ) : (
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                  {timeRemaining.minutes}m {timeRemaining.seconds}s
                </span>
              )}
            </div>
            
            {/* Barra de progreso */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000 ease-linear",
                  isCompleted 
                    ? "bg-gradient-to-r from-green-500 to-emerald-500" 
                    : "bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Sin datos de republicación
          </div>
        )}
      </div>

      {/* TIEMPO DE RENTA */}
      <div className="overflow-hidden rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-orange-500/10 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">
          Tiempo de Renta
        </div>
        <div className="text-center">
          <span className={cn(
            "text-3xl font-black",
            browser.rentalRemaining?.days === 0 
              ? "text-red-400" 
              : "text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400"
          )}>
            {formatRentalTime(browser.rentalRemaining)}
          </span>
        </div>
      </div>

      {/* Botón oculto para click */}
      <div className="mt-4 text-center text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        👆 Click para ver detalles y controles
      </div>
    </div>
  );
}

export function ControlPanel({ initialBrowserData, initialError }: ControlPanelProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [browserData, setBrowserData] = useState<BrowserData | null>(initialBrowserData || null);
  const [browserList, setBrowserList] = useState<BrowserData[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(initialError || "");
  
  // 🆕 Estado para modal crítico
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  const [criticalBrowser, setCriticalBrowser] = useState<BrowserData | null>(null);

  // 🆕 Escuchar cambios en Firebase para actualizar las tarjetas en tiempo real
  useEffect(() => {
    if (browserList.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    // Suscribirse a cada navegador en la lista
    browserList.forEach((browser, index) => {
      const unsubscribe = FirebaseAPI.listenToBrowser(
        browser.browserName,
        (updatedData) => {
          // Actualizar solo este navegador en la lista
          setBrowserList(prev => {
            const newList = [...prev];
            newList[index] = updatedData;
            return newList;
          });
        }
      );
      unsubscribers.push(unsubscribe);
    });

    // Limpiar todas las suscripciones al desmontar
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [browserList.length]); // Solo cuando cambia la cantidad de navegadores

  // 🆕 Detectar navegadores con <24h y mostrar modal automáticamente
  useEffect(() => {
    if (browserList.length === 0) return;

    // Buscar el primer navegador con <24h
    const criticalBrowsers = browserList.filter(browser => {
      if (!browser.rentalRemaining) return false;
      const { days, hours } = browser.rentalRemaining;
      return days === 0 && hours < 24;
    });

    if (criticalBrowsers.length > 0) {
      const browser = criticalBrowsers[0];
      
      // Verificar si ya vio el modal en las últimas 6 horas
      const lastShown = localStorage.getItem(`modal-renta-${browser.browserName}`);
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      
      if (!lastShown || parseInt(lastShown) < sixHoursAgo) {
        setCriticalBrowser(browser);
        setShowCriticalModal(true);
      }
    }
  }, [browserList]);

  const handleSearch = async () => {
    if (!clientSearch.trim()) {
      setError("Ingresa el nombre del cliente");
      return;
    }

    setSearching(true);
    setError("");
    setBrowserData(null);
    setBrowserList([]);

    // Buscar TODOS los navegadores del cliente
    const results = await FirebaseAPI.findAllBrowsersByClientName(clientSearch);

    if (results.length === 0) {
      setError("No se encontró ningún cliente con ese nombre");
    } else if (results.length === 1) {
      // Si solo hay 1 resultado, abrir dashboard directamente
      setBrowserData(results[0]);
    } else {
      // Si hay múltiples resultados, mostrar tarjetas
      setBrowserList(results);
    }

    setSearching(false);
  };

  const handleSelectBrowser = (browser: BrowserData) => {
    // NO limpiar browserList - solo abrir el dashboard
    setBrowserData(browser);
  };

  const handleBackToList = () => {
    setBrowserData(null);
    setBrowserList([]);
    // NO borrar clientSearch - mantener para que el usuario pueda buscar de nuevo
  };

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Panel de Control</h2>
            <p className="text-sm text-muted-foreground">Busca tus perfiles por tu nombre de cliente</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Jhelko"
                className="h-12 flex-1 bg-input text-foreground"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-12 bg-gradient-to-r from-pink-500 to-purple-500 px-8 text-white hover:from-pink-600 hover:to-purple-600"
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                {searching ? "Buscando..." : "Buscar Mis Perfiles"}
              </Button>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Lista de Navegadores (Múltiples Resultados) */}
        {browserList.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground">
                Tus Perfiles
              </h3>
              <p className="text-sm text-muted-foreground">
                Se encontraron {browserList.length} {browserList.length === 1 ? "perfil" : "perfiles"} para "{clientSearch}"
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {browserList.map((browser) => (
                <BrowserCard
                  key={browser.browserName}
                  browser={browser}
                  onClick={() => handleSelectBrowser(browser)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dashboard Modal */}
      {browserData && (
        <Dashboard
          browserData={browserData}
          onClose={() => {
            // Solo cerrar el modal, NO limpiar la lista ni el campo de búsqueda
            setBrowserData(null);
            // browserList y clientSearch se mantienen para que el usuario pueda seguir viendo sus tarjetas
          }}
        />
      )}

      {/* 🔥 MODAL CRÍTICO (<24 HORAS) */}
      {showCriticalModal && criticalBrowser && criticalBrowser.rentalRemaining && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-500 backdrop-blur-sm">
          <div className="bg-card border-4 border-destructive rounded-2xl max-w-lg w-full shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden">
            {/* Efecto de glow rojo */}
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-transparent to-destructive/20 animate-pulse" />
            
            <div className="relative p-8">
              <div className="text-center">
                {/* Icono animado */}
                <div className="text-7xl mb-4 animate-bounce">🚨</div>
                
                {/* Título */}
                <h2 className="text-3xl font-black text-destructive mb-2 uppercase tracking-tight">
                  ¡Atención Urgente!
                </h2>
                <p className="text-muted-foreground mb-6">
                  Tu cuenta está a punto de expirar
                </p>
                
                {/* Countdown grande */}
                <div className="bg-destructive/20 border-2 border-destructive rounded-xl p-6 mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" 
                       style={{ animation: 'shimmer 2s infinite' }} />
                  <p className="text-lg font-bold text-destructive mb-2">
                    Tu cuenta expira en
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="bg-black/40 rounded-lg px-4 py-2">
                      <div className="text-4xl font-black text-destructive tabular-nums">
                        {criticalBrowser.rentalRemaining.hours.toString().padStart(2, '0')}
                      </div>
                      <div className="text-xs text-muted-foreground">horas</div>
                    </div>
                    <div className="text-3xl font-bold text-destructive">:</div>
                    <div className="bg-black/40 rounded-lg px-4 py-2">
                      <div className="text-4xl font-black text-destructive tabular-nums">
                        {criticalBrowser.rentalRemaining.minutes.toString().padStart(2, '0')}
                      </div>
                      <div className="text-xs text-muted-foreground">minutos</div>
                    </div>
                  </div>
                </div>
                
                {/* Lista de consecuencias */}
                <div className="bg-black/60 rounded-xl p-5 mb-6 text-left border border-destructive/30">
                  <p className="text-destructive font-bold mb-3 text-center text-lg flex items-center justify-center gap-2">
                    <span>💀</span>
                    <span>Después de eso:</span>
                    <span>💀</span>
                  </p>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-destructive flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Tu anuncio será <strong className="text-destructive">ELIMINADO</strong> del sistema
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-warning flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Perderás todo tu <strong className="text-warning">posicionamiento</strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-orange-500 flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Las estadísticas se <strong className="text-orange-500">borrarán</strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-pink-500 flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        No podrás recuperarlo después de <strong className="text-pink-500">48 horas</strong>
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Botón de renovación */}
                <a
                  href={`https://wa.me/18293837695?text=${encodeURIComponent(
                    `🚨 URGENTE: Necesito renovar mi cuenta ${criticalBrowser.browserName} - Expira en ${criticalBrowser.rentalRemaining.hours}h ${criticalBrowser.rentalRemaining.minutes}m`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-gradient-to-r from-destructive to-pink-600 text-white py-4 rounded-xl font-black text-lg mb-4 hover:scale-105 transition-transform shadow-lg shadow-destructive/50 uppercase tracking-wide"
                  onClick={() => {
                    localStorage.setItem(`modal-renta-${criticalBrowser.browserName}`, Date.now().toString());
                    setShowCriticalModal(false);
                  }}
                >
                  🔥 Renovar Ahora 🔥
                </a>
                
                {/* Botón secundario */}
                <button
                  onClick={() => {
                    localStorage.setItem(`modal-renta-${criticalBrowser.browserName}`, Date.now().toString());
                    setShowCriticalModal(false);
                  }}
                  className="text-muted-foreground text-sm hover:text-foreground transition-colors underline"
                >
                  Recordar en 6 horas
                </button>
                
                {/* Warning final */}
                <p className="mt-4 text-xs text-destructive/70">
                  ⚠️ Este mensaje se mostrará cada 6 horas hasta que renueves
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </>
  );
}
