"use client";

import { useState, useEffect, useRef } from "react";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { SearchIcon, SettingsIcon, AlertTriangleIcon } from "@/components/icons";
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

// 🎨 Función para determinar el color según tiempo de renta
function getRentalColorClass(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "border-muted-foreground/20";
  if (rental.days === 0 && rental.hours === 0) return "border-red-500/50 bg-red-500/5";
  if (rental.days === 0 && rental.hours < 24) return "border-red-500/50 bg-red-500/5 animate-pulse";
  if (rental.days <= 1) return "border-orange-500/50 bg-orange-500/5";
  if (rental.days <= 3) return "border-yellow-500/50 bg-yellow-500/5";
  return "border-green-500/50 bg-green-500/5";
}

function getRentalTextColor(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "text-muted-foreground";
  if (rental.days === 0 && rental.hours < 24) return "text-red-400";
  if (rental.days <= 1) return "text-orange-400";
  if (rental.days <= 3) return "text-yellow-400";
  return "text-green-400";
}

// Componente para tarjeta de navegador
function BrowserCard({ browser, onClick, viewMode }: { browser: BrowserData; onClick: () => void; viewMode: 'grid' | 'list' }) {
  const [localRemaining, setLocalRemaining] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFirebaseUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!browser.republishStatus || browser.isPaused) {
      setLocalRemaining(null);
      setProgressPercent(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const firebaseRemaining = browser.republishStatus.remainingSeconds;
    const totalSeconds = browser.republishStatus.totalSeconds;

    const shouldUpdate = 
      localRemaining === null || 
      Math.abs(firebaseRemaining - localRemaining) > 5;

    if (shouldUpdate) {
      setLocalRemaining(firebaseRemaining);
      lastFirebaseUpdateRef.current = Date.now();
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setLocalRemaining(prev => {
        if (prev === null || prev <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [browser.republishStatus?.remainingSeconds, browser.republishStatus?.totalSeconds, browser.isPaused]);

  useEffect(() => {
    if (localRemaining !== null && browser.republishStatus) {
      const totalSeconds = browser.republishStatus.totalSeconds;
      const elapsedSeconds = totalSeconds - localRemaining;
      const progress = totalSeconds > 0 ? ((elapsedSeconds / totalSeconds) * 100) : 0;
      setProgressPercent(Math.min(100, Math.max(0, progress)));
    }
  }, [localRemaining, browser.republishStatus?.totalSeconds]);

  const timeRemaining = localRemaining !== null ? {
    minutes: Math.floor(localRemaining / 60),
    seconds: localRemaining % 60
  } : null;
  
  const isCompleted = timeRemaining !== null && timeRemaining.minutes === 0 && timeRemaining.seconds === 0;
  
  const hasDataExtractionError = 
    (browser.phoneNumber === "N/A" || browser.phoneNumber === "Manual") &&
    (browser.city === "N/A" || browser.city === "Manual") &&
    (browser.location === "N/A" || browser.location === "Manual");
  
  const hasRecentError = browser.lastError && 
    (Date.now() - new Date(browser.lastError.timestamp).getTime()) < 5 * 60 * 1000;
  
  const hasRepublishFailure = browser.republishStatus && 
    browser.republishStatus.elapsedSeconds > (browser.republishStatus.totalSeconds + 60);
  
  const hasError = hasDataExtractionError || hasRecentError || hasRepublishFailure;

  // 🔥 Solo mostrar alerta cuando quedan menos de 24 horas
  const showRentalAlert = browser.rentalRemaining && 
    browser.rentalRemaining.days === 0 && 
    browser.rentalRemaining.hours < 24;

  const rentalColorClass = getRentalColorClass(browser.rentalRemaining);
  const rentalTextColor = getRentalTextColor(browser.rentalRemaining);

  // 📋 VISTA DE LISTA
  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group cursor-pointer rounded-xl border p-4 transition-all hover:shadow-lg hover:shadow-primary/5 flex items-center gap-4",
          hasError 
            ? "border-red-500/50 bg-gradient-to-r from-red-500/10 to-card/50" 
            : rentalColorClass
        )}
      >
        {/* Estado */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className={cn(
            "h-3 w-3 rounded-full",
            browser.isPaused ? "bg-yellow-400" : "animate-pulse bg-green-400"
          )} />
          <span className={cn(
            "text-sm font-semibold",
            browser.isPaused ? "text-yellow-400" : "text-green-400"
          )}>
            {browser.isPaused ? "Pausado" : "En línea"}
          </span>
        </div>

        {/* Nombre */}
        <div className="flex-1 min-w-[150px]">
          <h3 className="text-lg font-bold text-foreground">{browser.browserName}</h3>
          {browser.postName && browser.postName !== "N/A" && (
            <p className="text-sm text-muted-foreground">{browser.postName}</p>
          )}
        </div>

        {/* Countdown */}
        <div className="min-w-[140px] text-center">
          {browser.isPaused ? (
            <span className="text-lg font-bold text-yellow-400">⏸ Pausado</span>
          ) : timeRemaining ? (
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 tabular-nums">
              {timeRemaining.minutes}m {timeRemaining.seconds}s
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Sin datos</span>
          )}
        </div>

        {/* Tiempo de Renta */}
        <div className="min-w-[120px] text-right">
          <div className="text-xs text-muted-foreground mb-1">RENTA</div>
          <div className={cn("text-xl font-black", rentalTextColor)}>
            {formatRentalTime(browser.rentalRemaining)}
          </div>
        </div>

        {/* Alerta si <24h */}
        {showRentalAlert && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            <AlertTriangleIcon className="h-5 w-5 text-destructive animate-pulse" />
            <span className="text-sm font-bold text-destructive">¡Expira hoy!</span>
          </div>
        )}

        {/* Error si existe */}
        {hasError && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <span className="text-red-400">⚠️</span>
            <span className="text-sm font-semibold text-red-400">Error</span>
          </div>
        )}

        {/* Arrow */}
        <div className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
          →
        </div>
      </div>
    );
  }

  // 🔲 VISTA DE GRID (Original)
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-xl border p-6 transition-all hover:shadow-xl hover:shadow-primary/5",
        hasError 
          ? "border-red-500/50 bg-gradient-to-br from-red-500/10 to-card/50" 
          : rentalColorClass
      )}
    >
      {/* ALERTA DE ERROR */}
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
        </div>
      )}

      {/* 🔥 BANNER DE ADVERTENCIA DE RENTA (SOLO <24 HORAS) */}
      {showRentalAlert && (
        <div className="mb-4 rounded-xl border-l-4 p-4 bg-destructive/10 border-destructive animate-pulse">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 rounded-full p-2 bg-destructive/20">
              <AlertTriangleIcon className="h-6 w-6 text-destructive" />
            </div>
            
            <div className="flex-1">
              <p className="font-bold text-sm mb-1 text-destructive">
                🚨 ¡Expira en {browser.rentalRemaining.hours}h {browser.rentalRemaining.minutes}m!
              </p>
              <p className="text-xs text-muted-foreground">
                Tu anuncio será ELIMINADO si no renuevas AHORA
              </p>
            </div>
            
            <a 
              href={`https://wa.me/18293837695?text=${encodeURIComponent(
                `URGENTE: Necesito renovar ${browser.browserName} - Expira en ${browser.rentalRemaining.hours}h`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-2 rounded-lg font-bold text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse transition-all duration-200 hover:scale-105 shadow-lg flex-shrink-0"
            >
              🔥 RENOVAR
            </a>
          </div>
          
          {/* Countdown mini */}
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
            {browser.isPaused ? "Pausado" : isCompleted ? "Republicación" : "Próxima Republicación"}
          </span>
        </div>
        
        {browser.isPaused ? (
          <div className="text-center">
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
              ⏸ En Pausa
            </span>
          </div>
        ) : timeRemaining ? (
          <>
            <div className="mb-3 text-center">
              {isCompleted ? (
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                  ✓ Completada
                </span>
              ) : (
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 tabular-nums">
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
      <div className={cn("overflow-hidden rounded-xl border p-4", rentalColorClass)}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tiempo de Renta
        </div>
        <div className="text-center">
          <span className={cn("text-3xl font-black", rentalTextColor)}>
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  const [criticalBrowser, setCriticalBrowser] = useState<BrowserData | null>(null);

  useEffect(() => {
    if (browserList.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    browserList.forEach((browser, index) => {
      const unsubscribe = FirebaseAPI.listenToBrowser(
        browser.browserName,
        (updatedData) => {
          setBrowserList(prev => {
            const newList = [...prev];
            newList[index] = updatedData;
            return newList;
          });
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [browserList.length]);

  // 🆕 Modal solo cuando quedan menos de 12 horas
  useEffect(() => {
    if (browserList.length === 0) return;

    const criticalBrowsers = browserList.filter(browser => {
      if (!browser.rentalRemaining) return false;
      const { days, hours } = browser.rentalRemaining;
      return days === 0 && hours < 12;
    });

    if (criticalBrowsers.length > 0) {
      const browser = criticalBrowsers[0];
      
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

    const results = await FirebaseAPI.findAllBrowsersByClientName(clientSearch);

    if (results.length === 0) {
      setError("No se encontró ningún cliente con ese nombre");
    } else if (results.length === 1) {
      setBrowserData(results[0]);
    } else {
      setBrowserList(results);
    }

    setSearching(false);
  };

  const handleSelectBrowser = (browser: BrowserData) => {
    setBrowserData(browser);
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
                placeholder="Angel"
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

        {/* Lista de Navegadores */}
        {browserList.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <h3 className="text-2xl font-bold text-foreground">
                  Tus Perfiles
                </h3>
                <p className="text-sm text-muted-foreground">
                  Se encontraron {browserList.length} {browserList.length === 1 ? "perfil" : "perfiles"} para "{clientSearch}"
                </p>
              </div>

              {/* 🆕 Toggle Vista */}
              <div className="flex items-center gap-2 bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === 'grid'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🔲 Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === 'list'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  📋 Lista
                </button>
              </div>
            </div>

            {/* Grid o Lista */}
            <div className={cn(
              viewMode === 'grid' 
                ? "grid gap-6 md:grid-cols-2" 
                : "space-y-3"
            )}>
              {browserList.map((browser) => (
                <BrowserCard
                  key={browser.browserName}
                  browser={browser}
                  onClick={() => handleSelectBrowser(browser)}
                  viewMode={viewMode}
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
            setBrowserData(null);
          }}
        />
      )}

      {/* MODAL CRÍTICO (<12 HORAS) */}
      {showCriticalModal && criticalBrowser && criticalBrowser.rentalRemaining && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-500 backdrop-blur-sm">
          <div className="bg-card border-4 border-destructive rounded-2xl max-w-lg w-full shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-transparent to-destructive/20 animate-pulse" />
            
            <div className="relative p-8">
              <div className="text-center">
                <div className="text-7xl mb-4 animate-bounce">🚨</div>
                
                <h2 className="text-3xl font-black text-destructive mb-2 uppercase tracking-tight">
                  ¡Atención Urgente!
                </h2>
                <p className="text-muted-foreground mb-6">
                  Tu cuenta está a punto de expirar
                </p>
                
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
                
                <button
                  onClick={() => {
                    localStorage.setItem(`modal-renta-${criticalBrowser.browserName}`, Date.now().toString());
                    setShowCriticalModal(false);
                  }}
                  className="text-muted-foreground text-sm hover:text-foreground transition-colors underline"
                >
                  Recordar en 6 horas
                </button>
                
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
