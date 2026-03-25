"use client";

import { useState, useEffect, useRef } from "react";
import { FirebaseAPI, type BrowserData, type SearchResult } from "@/lib/firebase";
import { SearchIcon } from "@/components/icons";
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

  const rentalTextColor = getRentalTextColor(rentalRemaining);

  // Tarjeta simple y limpia para móviles
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-xl border p-4 transition-all active:scale-[0.98]",
        hasError || isDebt
          ? "border-destructive/50 bg-destructive/10" 
          : "border-border bg-card hover:bg-secondary/50"
      )}
    >
      {/* Header: Estado + Nombre */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            "h-3 w-3 rounded-full flex-shrink-0",
            isPaused ? "bg-yellow-500" : "bg-green-500"
          )} />
          <div className="min-w-0">
            <h3 className="font-bold text-foreground truncate">{clientName}</h3>
            {postName && postName !== "N/A" && (
              <p className="text-xs text-muted-foreground truncate">{postName}</p>
            )}
          </div>
        </div>
        
        {/* Badge de estado */}
        <span className={cn(
          "text-xs font-medium px-2 py-1 rounded-full flex-shrink-0",
          isPaused 
            ? "bg-yellow-500/20 text-yellow-600" 
            : "bg-green-500/20 text-green-600"
        )}>
          {isPaused ? "Pausado" : "Activo"}
        </span>
      </div>

      {/* Alertas importantes (simplificadas) */}
      {isDebt && (
        <div className="mb-3 rounded-lg bg-destructive/20 border border-destructive/50 p-3">
          <p className="text-sm font-bold text-destructive">Cuenta vencida - Renovar ahora</p>
        </div>
      )}

      {showRentalAlert && !isDebt && (
        <div className="mb-3 rounded-lg bg-orange-500/20 border border-orange-500/50 p-3">
          <p className="text-sm font-bold text-orange-600">
            Expira en {rentalRemaining.hours}h {rentalRemaining.minutes}m
          </p>
        </div>
      )}

      {hasError && !isDebt && (
        <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/30 p-2">
          <p className="text-xs font-medium text-destructive">Revisar manualmente</p>
        </div>
      )}

      {/* Info principal: Timer + Renta */}
      <div className="grid grid-cols-2 gap-3">
        {/* Próximo bump */}
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Próximo bump</p>
          {isPaused ? (
            <p className="text-lg font-bold text-yellow-600">--:--</p>
          ) : timeRemaining ? (
            <p className="text-lg font-bold text-foreground tabular-nums">
              {timeRemaining.minutes}:{timeRemaining.seconds.toString().padStart(2, '0')}
            </p>
          ) : (
            <p className="text-lg font-bold text-muted-foreground">--:--</p>
          )}
        </div>

        {/* Tiempo de renta */}
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Renta</p>
          <p className={cn("text-lg font-bold", rentalTextColor)}>
            {formatRentalTime(rentalRemaining)}
          </p>
        </div>
      </div>

      {/* Barra de progreso (solo si hay timer activo) */}
      {timeRemaining && !isPaused && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                isCompleted ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ControlPanel({ initialBrowserData, initialError }: ControlPanelProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [resultsList, setResultsList] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(initialError || "");
  
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
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <SearchIcon className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Mis Anuncios</h2>
            <p className="text-sm text-muted-foreground">Escribe tu nombre para buscar</p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Tu nombre..."
                className="h-11 flex-1"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-11 px-4"
              >
                <SearchIcon className="h-4 w-4 mr-1.5" />
                {searching ? "..." : "Buscar"}
              </Button>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {resultsList.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                Tus Perfiles ({resultsList.length})
              </h3>
            </div>

            <div className="space-y-3">
              {resultsList.map((result, idx) => (
                <BrowserCard
                  key={`${result.browserName}-${result.postId || 'single'}-${idx}`}
                  result={result}
                  onClick={() => handleSelectResult(result)}
                  viewMode="list"
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
