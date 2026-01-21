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

function getRentalGradient(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "from-gray-500/10 to-gray-600/10";
  if (rental.days === 0 && rental.hours < 24) return "from-red-500/20 via-pink-500/20 to-red-600/20";
  if (rental.days <= 1) return "from-orange-500/20 via-amber-500/20 to-orange-600/20";
  if (rental.days <= 3) return "from-yellow-500/20 via-amber-400/20 to-yellow-600/20";
  return "from-green-500/20 via-emerald-500/20 to-green-600/20";
}

function getRentalBorderGlow(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "shadow-gray-500/0";
  if (rental.days === 0 && rental.hours < 24) return "shadow-red-500/50 shadow-lg";
  if (rental.days <= 1) return "shadow-orange-500/30 shadow-md";
  if (rental.days <= 3) return "shadow-yellow-500/20 shadow-sm";
  return "shadow-green-500/20 shadow-sm";
}

function getRentalTextColor(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "text-gray-400";
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

  const showRentalAlert = browser.rentalRemaining && 
    browser.rentalRemaining.days === 0 && 
    browser.rentalRemaining.hours < 24;

  const rentalGradient = getRentalGradient(browser.rentalRemaining);
  const rentalBorderGlow = getRentalBorderGlow(browser.rentalRemaining);
  const rentalTextColor = getRentalTextColor(browser.rentalRemaining);

  // 📋 VISTA DE LISTA
  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group cursor-pointer rounded-2xl border border-white/10 p-4 transition-all duration-300 hover:scale-[1.01] flex items-center gap-4 backdrop-blur-xl",
          hasError 
            ? "bg-gradient-to-r from-red-500/10 via-pink-500/5 to-red-500/10 border-red-500/30 shadow-red-500/20 shadow-lg" 
            : `bg-gradient-to-r ${rentalGradient} ${rentalBorderGlow}`
        )}
      >
        {/* Estado */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className={cn(
            "h-3 w-3 rounded-full relative",
            browser.isPaused ? "bg-yellow-400" : "bg-green-400"
          )}>
            {!browser.isPaused && (
              <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
            )}
          </div>
          <span className={cn(
            "text-sm font-bold",
            browser.isPaused ? "text-yellow-400" : "text-green-400"
          )}>
            {browser.isPaused ? "Pausado" : "Activo"}
          </span>
        </div>

        {/* Nombre */}
        <div className="flex-1 min-w-[150px]">
          <h3 className="text-lg font-bold text-white">{browser.browserName}</h3>
          {browser.postName && browser.postName !== "N/A" && (
            <p className="text-sm text-white/60">{browser.postName}</p>
          )}
        </div>

        {/* Countdown */}
        <div className="min-w-[140px] text-center bg-black/20 rounded-xl p-3 border border-white/5">
          {browser.isPaused ? (
            <span className="text-lg font-bold text-yellow-400">⏸ Pausado</span>
          ) : timeRemaining ? (
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 tabular-nums">
              {timeRemaining.minutes}m {timeRemaining.seconds}s
            </span>
          ) : (
            <span className="text-sm text-white/40">Sin datos</span>
          )}
        </div>

        {/* Tiempo de Renta */}
        <div className="min-w-[120px] text-right bg-black/20 rounded-xl p-3 border border-white/5">
          <div className="text-xs text-white/60 mb-1">RENTA</div>
          <div className={cn("text-xl font-black", rentalTextColor)}>
            {formatRentalTime(browser.rentalRemaining)}
          </div>
        </div>

        {showRentalAlert && (
          <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2 backdrop-blur-sm">
            <AlertTriangleIcon className="h-5 w-5 text-red-400 animate-pulse" />
            <span className="text-sm font-bold text-red-400">¡Expira hoy!</span>
          </div>
        )}

        {hasError && (
          <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <span className="text-sm font-bold text-red-400">Error</span>
          </div>
        )}

        <div className="text-white/40 opacity-0 transition-opacity group-hover:opacity-100 text-xl">
          →
        </div>
      </div>
    );
  }

  // 🔲 VISTA DE GRID MEJORADA
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-3xl border border-white/10 p-6 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 backdrop-blur-xl relative overflow-hidden",
        hasError 
          ? "bg-gradient-to-br from-red-500/10 via-pink-500/5 to-red-500/10 border-red-500/30 shadow-red-500/20 shadow-xl" 
          : `bg-gradient-to-br ${rentalGradient} ${rentalBorderGlow}`
      )}
    >
      {/* Efecto de brillo animado */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

      {/* Alerta de Error */}
      {hasError && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 animate-pulse" />
          <div className="relative flex items-center gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <p className="text-sm font-bold text-red-400">
                {hasRepublishFailure ? "⏰ Fallo en Republicación" :
                 hasDataExtractionError ? "📋 Error de Extracción" :
                 "❌ Error Detectado"}
              </p>
              <p className="text-xs text-red-300/70 mt-1">
                Verifica el navegador manualmente
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Alerta de Renta */}
      {showRentalAlert && (
        <div className="mb-4 rounded-2xl border-2 border-red-500/50 bg-gradient-to-br from-red-500/20 to-pink-500/20 p-4 backdrop-blur-sm animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-red-500/30 flex items-center justify-center border border-red-500/50">
              <span className="text-3xl">🚨</span>
            </div>
            
            <div className="flex-1">
              <p className="font-black text-base text-red-400 mb-1">
                ¡Expira en {browser.rentalRemaining.hours}h {browser.rentalRemaining.minutes}m!
              </p>
              <p className="text-xs text-red-300/80">
                Tu anuncio será ELIMINADO automáticamente
              </p>
            </div>
            
            <a 
              href={`https://wa.me/18293837695?text=${encodeURIComponent(
                `🚨 URGENTE: Renovar ${browser.browserName} - Expira en ${browser.rentalRemaining.hours}h`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-5 py-3 rounded-xl font-black text-sm bg-gradient-to-r from-red-500 to-pink-600 text-white hover:scale-105 transition-all duration-200 shadow-lg shadow-red-500/50 border border-red-400/50"
            >
              🔥 RENOVAR
            </a>
          </div>
        </div>
      )}

      {/* Header - Estado y Nombre */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border",
            browser.isPaused 
              ? "bg-yellow-500/20 border-yellow-500/30" 
              : "bg-green-500/20 border-green-500/30"
          )}>
            <div className="relative">
              <div className={cn(
                "h-3 w-3 rounded-full",
                browser.isPaused ? "bg-yellow-400" : "bg-green-400"
              )} />
              {!browser.isPaused && (
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
              )}
            </div>
            <span className={cn(
              "text-sm font-bold",
              browser.isPaused ? "text-yellow-400" : "text-green-400"
            )}>
              {browser.isPaused ? "Pausado" : "En Línea"}
            </span>
          </div>
          
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white/60 text-sm font-medium">
            Ver detalles →
          </div>
        </div>

        <h3 className="text-3xl font-black text-white mb-2 tracking-tight">
          {browser.browserName}
        </h3>
        {browser.postName && browser.postName !== "N/A" && (
          <p className="text-sm text-white/60">{browser.postName}</p>
        )}
      </div>

      {/* Countdown de Republicación */}
      <div className="mb-4 rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-pink-500/10 p-5 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(236,72,153,0.1),transparent)]" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-pink-400">
              {browser.isPaused ? "⏸ Sistema Pausado" : isCompleted ? "✓ Republicación Completa" : "Próxima Republicación"}
            </span>
          </div>
          
          {browser.isPaused ? (
            <div className="text-center py-4">
              <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                ⏸ En Pausa
              </span>
            </div>
          ) : timeRemaining ? (
            <>
              <div className="text-center py-2 mb-3">
                {isCompleted ? (
                  <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                    ✓ Lista
                  </span>
                ) : (
                  <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 tabular-nums">
                    {timeRemaining.minutes}<span className="text-3xl">m</span> {timeRemaining.seconds}<span className="text-3xl">s</span>
                  </span>
                )}
              </div>
              
              {/* Barra de progreso mejorada */}
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/30 border border-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden",
                    isCompleted 
                      ? "bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" 
                      : "bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500"
                  )}
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-white/40">
              Sin datos de republicación
            </div>
          )}
        </div>
      </div>

      {/* Tiempo de Renta */}
      <div className={cn(
        "rounded-2xl border p-5 backdrop-blur-sm relative overflow-hidden",
        `bg-gradient-to-br ${rentalGradient} border-white/10`
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.05),transparent)]" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", 
              browser.rentalRemaining?.days === 0 ? "bg-red-500/20" : "bg-white/10"
            )}>
              <span className="text-lg">⏰</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-white/60">
              Tiempo de Renta
            </span>
          </div>
          
          <div className="text-center py-2">
            <span className={cn("text-5xl font-black", rentalTextColor)}>
              {formatRentalTime(browser.rentalRemaining)}
            </span>
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      <div className="mt-4 text-center text-xs text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
        👆 Click para abrir panel de control
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
        {/* 🆕 Panel de búsqueda mejorado para móviles */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 md:p-8 min-h-[320px] sm:min-h-[280px] flex flex-col justify-center">
          <div className="mb-6 sm:mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl sm:text-3xl font-bold text-foreground">Panel de Control</h2>
            <p className="text-sm sm:text-base text-muted-foreground px-4">Busca tus perfiles por tu nombre de cliente</p>
          </div>

          <div className="space-y-4">
            {/* 🆕 Búsqueda responsive - stack en móvil, row en desktop */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Ej: Angel, Maria, Carlos..."
                className="h-14 sm:h-12 flex-1 bg-input text-foreground text-base sm:text-sm px-4"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-14 sm:h-12 bg-gradient-to-r from-pink-500 to-purple-500 sm:px-8 px-6 text-white hover:from-pink-600 hover:to-purple-600 font-bold text-base sm:text-sm whitespace-nowrap"
              >
                <SearchIcon className="mr-2 h-5 w-5 sm:h-4 sm:w-4" />
                {searching ? "Buscando..." : "Buscar Perfiles"}
              </Button>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-center text-sm sm:text-base text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {browserList.length > 0 && (
          <div className="mt-8 space-y-6">
            {/* Header con título y toggle responsive */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left flex-1 w-full sm:w-auto">
                <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                  Tus Perfiles
                </h3>
                <p className="text-sm md:text-base text-muted-foreground">
                  {browserList.length} {browserList.length === 1 ? "perfil encontrado" : "perfiles encontrados"}
                </p>
              </div>

              {/* 🆕 Toggle responsive - centrado en móvil */}
              <div className="flex items-center gap-2 bg-secondary/50 backdrop-blur-sm rounded-xl p-1.5 border border-border w-full sm:w-auto justify-center">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "px-4 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 flex-1 sm:flex-initial justify-center",
                    viewMode === 'grid'
                      ? "bg-background text-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-lg sm:text-base">🔲</span>
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-4 py-2.5 sm:py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 flex-1 sm:flex-initial justify-center",
                    viewMode === 'list'
                      ? "bg-background text-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-lg sm:text-base">📋</span>
                  <span>Lista</span>
                </button>
              </div>
            </div>

            {/* Grid o Lista responsive */}
            <div className={cn(
              viewMode === 'grid' 
                ? "grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2" 
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

      {browserData && (
        <Dashboard
          browserData={browserData}
          onClose={() => {
            setBrowserData(null);
          }}
        />
      )}

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
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
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
        
        .animate-shimmer {
          animation: shimmer 3s infinite;
        }
      `}</style>
    </>
  );
}
