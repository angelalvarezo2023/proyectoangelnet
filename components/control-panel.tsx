"use client";

import { useState, useEffect, useRef } from "react";
import { FirebaseAPI, type BrowserData, type SearchResult } from "@/lib/firebase";
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
  
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  
  if (isDebt) {
    const absDays = Math.abs(rental.days);
    const parts = [];
    if (absDays > 0) parts.push(`${absDays}d`);
    if (rental.hours > 0) parts.push(`${rental.hours}h`);
    if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
    return `⚠️ DEUDA: ${parts.join(" ")}`;
  }
  
  if (rental.days === 0 && rental.hours === 0 && rental.minutes === 0) return "Por expirar";
  const parts = [];
  if (rental.days > 0) parts.push(`${rental.days}d`);
  if (rental.hours > 0) parts.push(`${rental.hours}h`);
  if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
  return parts.join(" ");
}

function getRentalStatus(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "neutral";
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  if (isDebt) return "debt";
  if (rental.days === 0 && rental.hours === 0) return "critical";
  if (rental.days === 0) return "warning";
  if (rental.days < 2) return "caution";
  return "healthy";
}

function getRentalGradient(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "from-gray-500/10 to-gray-600/10";
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  if (isDebt) return "from-red-600/30 via-red-500/20 to-red-600/30";
  if (rental.days === 0 && rental.hours < 24) return "from-red-500/20 via-pink-500/20 to-red-600/20";
  if (rental.days <= 1) return "from-orange-500/20 via-amber-500/20 to-orange-600/20";
  if (rental.days <= 3) return "from-yellow-500/20 via-amber-400/20 to-yellow-600/20";
  return "from-green-500/20 via-emerald-500/20 to-green-600/20";
}

function getRentalBorderGlow(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "shadow-gray-500/0";
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  if (isDebt) return "shadow-red-600/70 shadow-xl border-red-600/50";
  if (rental.days === 0 && rental.hours < 24) return "shadow-red-500/50 shadow-lg";
  if (rental.days <= 1) return "shadow-orange-500/30 shadow-md";
  if (rental.days <= 3) return "shadow-yellow-500/20 shadow-sm";
  return "shadow-green-500/20 shadow-sm";
}

function getRentalTextColor(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "text-gray-400";
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  if (isDebt) return "text-red-600 font-black animate-pulse";
  if (rental.days === 0 && rental.hours < 24) return "text-red-400";
  if (rental.days <= 1) return "text-orange-400";
  if (rental.days <= 3) return "text-yellow-400";
  return "text-green-400";
}

function BrowserCard({ result, onClick, viewMode }: { result: SearchResult; onClick: () => void; viewMode: 'grid' | 'list' }) {
  const [localRemaining, setLocalRemaining] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isPaused = result.isPaused ?? false;
  const republishStatus = result.republishStatus;
  const rentalRemaining = result.rentalRemaining;
  const clientName = result.clientName || "Sin nombre";
  const postName = result.postName;
  const phoneNumber = result.phoneNumber || "N/A";
  const city = result.city || "N/A";
  const location = result.location || "N/A";

  useEffect(() => {
    if (!republishStatus || isPaused) {
      setLocalRemaining(null);
      setProgressPercent(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const firebaseRemaining = republishStatus.remainingSeconds;
    const shouldUpdate = localRemaining === null || Math.abs(firebaseRemaining - localRemaining) > 5;

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
  }, [republishStatus?.remainingSeconds, republishStatus?.totalSeconds, isPaused, localRemaining]);

  useEffect(() => {
    if (localRemaining !== null && republishStatus) {
      const totalSeconds = republishStatus.totalSeconds;
      const elapsedSeconds = totalSeconds - localRemaining;
      const progress = totalSeconds > 0 ? ((elapsedSeconds / totalSeconds) * 100) : 0;
      setProgressPercent(Math.min(100, Math.max(0, progress)));
    }
  }, [localRemaining, republishStatus?.totalSeconds]);

  const timeRemaining = localRemaining !== null ? {
    minutes: Math.floor(localRemaining / 60),
    seconds: localRemaining % 60
  } : null;
  
  const isCompleted = timeRemaining !== null && timeRemaining.minutes === 0 && timeRemaining.seconds === 0;
  
  const hasDataExtractionError = 
    (phoneNumber === "N/A" || phoneNumber === "Manual") &&
    (city === "N/A" || city === "Manual") &&
    (location === "N/A" || location === "Manual");
  
  const hasRecentError = result.fullData.lastError && 
    (Date.now() - new Date(result.fullData.lastError.timestamp).getTime()) < 5 * 60 * 1000;
  
  const hasRepublishFailure = republishStatus && 
    republishStatus.elapsedSeconds > (republishStatus.totalSeconds + 60);
  
  const hasError = hasDataExtractionError || hasRecentError || hasRepublishFailure;

  const showRentalAlert = rentalRemaining && 
    rentalRemaining.days === 0 && 
    rentalRemaining.hours < 24;

  const isDebt = rentalRemaining && 
    (rentalRemaining.days < 0 || (rentalRemaining as any).isDebt === true);

  const rentalGradient = getRentalGradient(rentalRemaining);
  const rentalBorderGlow = getRentalBorderGlow(rentalRemaining);
  const rentalTextColor = getRentalTextColor(rentalRemaining);

  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group cursor-pointer rounded-2xl border border-white/10 p-5 sm:p-4 transition-all duration-300 hover:scale-[1.01] flex flex-col sm:flex-row items-start sm:items-center gap-4 backdrop-blur-xl",
          hasError 
            ? "bg-gradient-to-r from-red-500/10 via-pink-500/5 to-red-500/10 border-red-500/30 shadow-red-500/20 shadow-lg" 
            : `bg-gradient-to-r ${rentalGradient} ${rentalBorderGlow}`
        )}
      >
        <div className="flex items-center gap-3 min-w-[120px] sm:min-w-[100px]">
          <div className={cn(
            "h-4 w-4 sm:h-3 sm:w-3 rounded-full relative",
            isPaused ? "bg-yellow-400" : "bg-green-400"
          )}>
            {!isPaused && (
              <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
            )}
          </div>
          <span className={cn(
            "text-base sm:text-sm font-bold",
            isPaused ? "text-yellow-400" : "text-green-400"
          )}>
            {isPaused ? "Pausado" : "Activo"}
          </span>
        </div>

        <div className="flex-1 min-w-[150px]">
          <h3 className="text-xl sm:text-lg font-bold text-white">{clientName}</h3>
          {postName && postName !== "N/A" && (
            <p className="text-base sm:text-sm text-white/60 mt-1">{postName}</p>
          )}
        </div>

        <div className="w-full sm:w-auto sm:min-w-[140px] text-center bg-black/20 rounded-xl p-4 sm:p-3 border border-white/5">
          {isPaused ? (
            <span className="text-xl sm:text-lg font-bold text-yellow-400">⏸ Pausado</span>
          ) : timeRemaining ? (
            <span className="text-3xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 tabular-nums">
              {timeRemaining.minutes}m {timeRemaining.seconds}s
            </span>
          ) : (
            <span className="text-base sm:text-sm text-white/40">Sin datos</span>
          )}
        </div>

        <div className="w-full sm:w-auto sm:min-w-[120px] text-center sm:text-right bg-black/20 rounded-xl p-4 sm:p-3 border border-white/5">
          <div className="text-sm sm:text-xs text-white/60 mb-1">RENTA</div>
          <div className={cn("text-2xl sm:text-xl font-black", rentalTextColor)}>
            {formatRentalTime(rentalRemaining)}
          </div>
        </div>

        {isDebt && (
          <div className="w-full sm:w-auto flex items-center gap-2 bg-red-600/30 border-2 border-red-500 rounded-xl px-5 py-3 sm:px-4 sm:py-2 backdrop-blur-sm animate-pulse">
            <span className="text-red-400 text-2xl sm:text-xl">💀</span>
            <span className="text-base sm:text-sm font-bold text-red-300">PAGA YA</span>
          </div>
        )}

        {showRentalAlert && !isDebt && (
          <div className="w-full sm:w-auto flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-xl px-5 py-3 sm:px-4 sm:py-2 backdrop-blur-sm">
            <AlertTriangleIcon className="h-6 w-6 sm:h-5 sm:w-5 text-red-400 animate-pulse" />
            <span className="text-base sm:text-sm font-bold text-red-400">¡Expira hoy!</span>
          </div>
        )}

        {hasError && (
          <div className="w-full sm:w-auto flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-xl px-5 py-3 sm:px-4 sm:py-2">
            <span className="text-red-400 text-xl sm:text-lg">⚠️</span>
            <span className="text-base sm:text-sm font-bold text-red-400">Error</span>
          </div>
        )}

        <div className="hidden sm:block text-white/40 opacity-0 transition-opacity group-hover:opacity-100 text-xl">
          →
        </div>
      </div>
    );
  }

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
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

      {isDebt && (
        <div className="mb-4 rounded-2xl border-3 border-red-600 bg-gradient-to-br from-red-600/40 to-red-500/30 p-5 backdrop-blur-sm animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-red-600/40 flex items-center justify-center border-2 border-red-500">
              <span className="text-3xl">💀</span>
            </div>
            <div className="flex-1">
              <h4 className="font-black text-xl text-red-300 mb-1">CUENTA VENCIDA</h4>
              <p className="text-sm text-red-200">
                {(() => {
                  const absDays = Math.abs(rentalRemaining!.days);
                  return `Deuda: ${absDays}d ${rentalRemaining!.hours}h ${rentalRemaining!.minutes}m`;
                })()}
              </p>
            </div>
          </div>
          <a 
            href={`https://wa.me/18293837695?text=${encodeURIComponent(
              `🚨 RENOVAR ${clientName} - Tengo deuda`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-3 rounded-xl font-bold text-center hover:scale-105 transition-all"
          >
            💀 PAGAR AHORA 💀
          </a>
        </div>
      )}

      {hasError && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 animate-pulse" />
          <div className="relative flex items-center gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <p className="text-base sm:text-sm font-bold text-red-400">
                {hasRepublishFailure ? "⏰ Problema con Republicación" :
                 hasDataExtractionError ? "📋 Error de Datos" :
                 "❌ Hay un problema"}
              </p>
              <p className="text-sm sm:text-xs text-red-300/70 mt-1">
                Revisa manualmente o contacta soporte
              </p>
            </div>
          </div>
        </div>
      )}

      {showRentalAlert && !isDebt && (
        <div className="mb-4 rounded-2xl border-2 border-red-500/50 bg-gradient-to-br from-red-500/20 to-pink-500/20 p-5 sm:p-4 backdrop-blur-sm animate-pulse">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-3 mb-4 sm:mb-3">
            <div className="flex-shrink-0 w-16 h-16 sm:w-14 sm:h-14 rounded-2xl bg-red-500/30 flex items-center justify-center border border-red-500/50">
              <span className="text-4xl sm:text-3xl">🚨</span>
            </div>
            
            <div className="flex-1 text-center sm:text-left">
              <p className="font-black text-xl sm:text-base text-red-400 mb-1">
                ¡Expira en {rentalRemaining.hours}h {rentalRemaining.minutes}m!
              </p>
              <p className="text-sm sm:text-xs text-red-300/80">
                Tu anuncio será eliminado automáticamente
              </p>
            </div>
            
            <a 
              href={`https://wa.me/18293837695?text=${encodeURIComponent(
                `🚨 URGENTE: Renovar ${clientName} - Expira en ${rentalRemaining.hours}h`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:w-auto px-6 py-4 sm:px-5 sm:py-3 rounded-xl font-black text-base sm:text-sm bg-gradient-to-r from-red-500 to-pink-600 text-white hover:scale-105 transition-all duration-200 shadow-lg shadow-red-500/50 border border-red-400/50 whitespace-nowrap"
            >
              🔥 RENOVAR
            </a>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border",
            isPaused 
              ? "bg-yellow-500/20 border-yellow-500/30" 
              : "bg-green-500/20 border-green-500/30"
          )}>
            <div className="relative">
              <div className={cn(
                "h-3 w-3 rounded-full",
                isPaused ? "bg-yellow-400" : "bg-green-400"
              )} />
              {!isPaused && (
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
              )}
            </div>
            <span className={cn(
              "text-sm font-bold",
              isPaused ? "text-yellow-400" : "text-green-400"
            )}>
              {isPaused ? "Pausado" : "En Línea"}
            </span>
          </div>
          
          <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white/60 text-sm font-medium">
            Ver detalles →
          </div>
        </div>

        <h3 className="text-3xl font-black text-white mb-2 tracking-tight">
          {clientName}
        </h3>
        {postName && postName !== "N/A" && (
          <p className="text-sm text-white/60">{postName}</p>
        )}
      </div>

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
              {isPaused ? "⏸ Pausado" : isCompleted ? "✓ Completado" : "Próximo Anuncio"}
            </span>
          </div>
          
          {isPaused ? (
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
              Sin datos
            </div>
          )}
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border p-5 backdrop-blur-sm relative overflow-hidden",
        `bg-gradient-to-br ${rentalGradient} border-white/10`
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.05),transparent)]" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", 
              isDebt ? "bg-red-600/30" : 
              rentalRemaining?.days === 0 ? "bg-red-500/20" : "bg-white/10"
            )}>
              <span className="text-lg">{isDebt ? "💀" : "⏰"}</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-white/60">
              Tiempo de Renta
            </span>
          </div>
          
          <div className="text-center py-2">
            <span className={cn("text-5xl font-black", rentalTextColor)}>
              {formatRentalTime(rentalRemaining)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
        👆 Toca para ver más opciones
      </div>
    </div>
  );
}

export function ControlPanel({ initialBrowserData, initialError }: ControlPanelProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [resultsList, setResultsList] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  const [criticalResult, setCriticalResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (resultsList.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    resultsList.forEach((result, index) => {
      const unsubscribe = FirebaseAPI.listenToBrowser(
        result.browserName,
        (updatedData) => {
          setResultsList(prev => {
            const newList = [...prev];
            
            if (result.type === "single") {
              newList[index] = {
                ...result,
                fullData: updatedData,
                isPaused: updatedData.isPaused,
                rentalRemaining: updatedData.rentalRemaining,
                republishStatus: updatedData.republishStatus,
                phoneNumber: updatedData.phoneNumber,
                city: updatedData.city,
                location: updatedData.location,
                postName: updatedData.postName,
              };
            } else {
              if (updatedData.posts && result.postId && updatedData.posts[result.postId]) {
                const postData = updatedData.posts[result.postId];
                newList[index] = {
                  ...result,
                  fullData: updatedData,
                  postData: postData,
                  isPaused: postData.isPaused,
                  rentalRemaining: postData.rentalRemaining,
                  republishStatus: updatedData.republishStatus,
                  phoneNumber: postData.phoneNumber,
                  city: postData.city,
                  location: postData.location,
                  postName: postData.postName,
                };
              }
            }
            
            return newList;
          });
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [resultsList.length]);

  useEffect(() => {
    if (resultsList.length === 0) return;

    const criticalResults = resultsList.filter(result => {
      if (!result.rentalRemaining) return false;
      const { days, hours } = result.rentalRemaining;
      return days === 0 && hours < 12;
    });

    if (criticalResults.length > 0) {
      const result = criticalResults[0];
      const clientName = result.clientName || "Sin nombre";
      
      const lastShown = localStorage.getItem(`modal-renta-${clientName}`);
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      
      if (!lastShown || parseInt(lastShown) < sixHoursAgo) {
        setCriticalResult(result);
        setShowCriticalModal(true);
      }
    }
  }, [resultsList]);

  const handleSearch = async () => {
    if (!clientSearch.trim()) {
      setError("Por favor escribe tu nombre");
      return;
    }

    setSearching(true);
    setError("");
    setSelectedResult(null);
    setResultsList([]);

    const results = await FirebaseAPI.findAllBrowsersByClientName(clientSearch);

    if (results.length === 0) {
      setError("No encontramos tu nombre. Verifica que esté bien escrito.");
    } else if (results.length === 1) {
      setSelectedResult(results[0]);
    } else {
      setResultsList(results);
    }

    setSearching(false);
  };

  const handleSelectResult = (result: SearchResult) => {
    setSelectedResult(result);
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 min-h-[360px] sm:min-h-[320px] flex flex-col justify-center">
          <div className="mb-6 sm:mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-10 w-10 sm:h-10 sm:w-10 text-primary" />
            </div>
            <h2 className="mb-2 text-3xl sm:text-3xl font-bold text-foreground">Mis Anuncios</h2>
            <p className="text-lg sm:text-base text-muted-foreground px-4">Escribe tu nombre para buscar</p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Escribe tu nombre..."
                className="h-16 sm:h-12 flex-1 bg-input text-foreground text-lg sm:text-sm px-5"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-16 sm:h-12 bg-gradient-to-r from-pink-500 to-purple-500 sm:px-8 px-6 text-white hover:from-pink-600 hover:to-purple-600 font-bold text-lg sm:text-sm whitespace-nowrap"
              >
                <SearchIcon className="mr-2 h-6 w-6 sm:h-4 sm:w-4" />
                {searching ? "Buscando..." : "🔍 Buscar"}
              </Button>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-center text-base sm:text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {resultsList.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left flex-1 w-full sm:w-auto">
                <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                  Tus Perfiles
                </h3>
                <p className="text-base md:text-base text-muted-foreground">
                  {resultsList.length} {resultsList.length === 1 ? "perfil" : "perfiles"}
                </p>
              </div>

              <div className="flex items-center gap-2 bg-secondary/50 backdrop-blur-sm rounded-xl p-1.5 border border-border w-full sm:w-auto justify-center">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "px-5 py-3 sm:px-4 sm:py-2 rounded-lg text-base sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 flex-1 sm:flex-initial justify-center",
                    viewMode === 'grid'
                      ? "bg-background text-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-xl sm:text-base">🔲</span>
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-5 py-3 sm:px-4 sm:py-2 rounded-lg text-base sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 flex-1 sm:flex-initial justify-center",
                    viewMode === 'list'
                      ? "bg-background text-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-xl sm:text-base">📋</span>
                  <span>Lista</span>
                </button>
              </div>
            </div>

            <div className={cn(
              viewMode === 'grid' 
                ? "grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2" 
                : "space-y-3"
            )}>
              {resultsList.map((result, idx) => (
                <BrowserCard
                  key={`${result.browserName}-${result.postId || 'single'}-${idx}`}
                  result={result}
                  onClick={() => handleSelectResult(result)}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedResult && (
        <Dashboard
          searchResult={selectedResult}
          onClose={() => {
            setSelectedResult(null);
          }}
        />
      )}

      {showCriticalModal && criticalResult && criticalResult.rentalRemaining && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border-4 border-destructive rounded-2xl max-w-lg w-full shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-transparent to-destructive/20 animate-pulse" />
            
            <div className="relative p-8">
              <div className="text-center">
                <div className="text-7xl mb-4">🚨</div>
                
                <h2 className="text-3xl font-black text-destructive mb-2 uppercase tracking-tight">
                  Atencion Urgente
                </h2>
                <p className="text-muted-foreground mb-6">
                  Tu cuenta esta por expirar
                </p>
                
                <div className="bg-destructive/20 border-2 border-destructive rounded-xl p-6 mb-6 relative overflow-hidden">
                  <p className="text-lg font-bold text-destructive mb-2">
                    Expira en
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="bg-black/40 rounded-lg px-4 py-2">
                      <div className="text-4xl font-black text-destructive tabular-nums">
                        {criticalResult.rentalRemaining.hours.toString().padStart(2, '0')}
                      </div>
                      <div className="text-xs text-muted-foreground">horas</div>
                    </div>
                    <div className="text-3xl font-bold text-destructive">:</div>
                    <div className="bg-black/40 rounded-lg px-4 py-2">
                      <div className="text-4xl font-black text-destructive tabular-nums">
                        {criticalResult.rentalRemaining.minutes.toString().padStart(2, '0')}
                      </div>
                      <div className="text-xs text-muted-foreground">minutos</div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-black/60 rounded-xl p-5 mb-6 text-left border border-destructive/30">
                  <p className="text-destructive font-bold mb-3 text-center text-lg">
                    Que pasara si no renuevas
                  </p>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-destructive flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Tu anuncio sera ELIMINADO
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-warning flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Perderas tu posicionamiento
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-orange-500 flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        Las estadisticas se borraran
                      </span>
                    </li>
                    <li className="flex items-start gap-2 text-sm">
                      <span className="text-pink-500 flex-shrink-0 text-lg">❌</span>
                      <span className="text-foreground">
                        No podras recuperarlo despues de 48 horas
                      </span>
                    </li>
                  </ul>
                </div>

                <a
                  href={`https://wa.me/18293837695?text=${encodeURIComponent(
                    `🚨 URGENTE: Renovar ${criticalResult.clientName} - Expira en ${criticalResult.rentalRemaining.hours}h ${criticalResult.rentalRemaining.minutes}m`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-gradient-to-r from-destructive to-pink-600 text-white py-4 rounded-xl font-black text-lg mb-4 hover:scale-105 transition-transform shadow-lg shadow-destructive/50 uppercase tracking-wide"
                  onClick={() => {
                    const clientName = criticalResult.clientName || "Sin nombre";
                    localStorage.setItem(`modal-renta-${clientName}`, Date.now().toString());
                    setShowCriticalModal(false);
                  }}
                >
                  Renovar Ahora
                </a>
                
                <button
                  onClick={() => {
                    const clientName = criticalResult.clientName || "Sin nombre";
                    localStorage.setItem(`modal-renta-${clientName}`, Date.now().toString());
                    setShowCriticalModal(false);
                  }}
                  className="text-muted-foreground text-sm hover:text-foreground transition-colors underline"
                >
                  Recordar en 6 horas
                </button>
                
                <p className="mt-4 text-xs text-destructive/70">
                  Este mensaje se mostrara cada 6 horas
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
