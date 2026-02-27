"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData, type SearchResult } from "@/lib/firebase";
import {
  XIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  ClockIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { NotificationSettings } from "@/components/notification-settings";
import { TicketModal, TicketStatusBadge } from "@/components/ticket-system";

interface DashboardProps {
  searchResult: SearchResult;
  onClose: () => void;
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatRentalTime(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "Sin renta";
  if (rental.days < 0 || (rental as any).isDebt) {
    const absDays = Math.abs(rental.days);
    const parts = [];
    if (absDays > 0) parts.push(`${absDays}d`);
    if (rental.hours > 0) parts.push(`${rental.hours}h`);
    if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
    return `⚠️ Deuda: ${parts.join(" ")}`;
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
  if (rental.days < 0 || (rental as any).isDebt) return "debt";
  if (rental.days === 0 && rental.hours === 0) return "critical";
  if (rental.days === 0) return "warning";
  if (rental.days < 2) return "caution";
  return "healthy";
}

function formatAutoPauseTime(seconds: number) {
  if (seconds <= 0) return "Pausado";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function Dashboard({ searchResult, onClose }: DashboardProps) {
  const [liveData, setLiveData] = useState(searchResult);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);

  const [autoPauseSeconds, setAutoPauseSeconds] = useState(
    searchResult.fullData.autoPauseInfo?.secondsUntilPause || 0
  );

  const commandInProgressRef = useRef(false);
  const previousRepublishRef = useRef<BrowserData["republishStatus"] | null>(null);
  const lastActionTimeRef = useRef<number>(0);
  const lastSuccessMessageTimeRef = useRef<number>(0);

  const browserName = liveData.browserName;
  const FIREBASE_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";

  const postId = liveData.type === "multi" ? liveData.postId : undefined;
  const currentIsPaused = liveData.isPaused ?? false;
  const republishStatus = liveData.republishStatus;
  const rentalRemaining = liveData.rentalRemaining;
  const clientName = liveData.clientName || "Sin nombre";
  const phoneNumber = liveData.phoneNumber || "N/A";
  const city = liveData.city || "N/A";
  const location = liveData.location || "N/A";
  const postName = liveData.postName;
  const postUrl = liveData.type === "multi" && liveData.postData ? liveData.postData.postUrl : liveData.fullData.postUrl;
  const postIdCaptured = liveData.type === "multi" && liveData.postData ? liveData.postData.postIdCapturedAt : liveData.fullData.postIdCapturedAt;
  const manuallyCreated = liveData.fullData.manuallyCreated;

  // History principal
  useEffect(() => {
    window.history.pushState({ modalOpen: true }, "");
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  // Countdown republicación
  useEffect(() => {
    if (!republishStatus) return;
    if (currentIsPaused) return;

    const interval = setInterval(() => {
      setLiveData((prev) => {
        if (!prev.republishStatus || prev.isPaused) return prev;
        const newRemaining = Math.max(0, prev.republishStatus.remainingSeconds - 1);
        const newElapsed = Math.min(prev.republishStatus.totalSeconds, prev.republishStatus.elapsedSeconds + 1);
        return {
          ...prev,
          republishStatus: { ...prev.republishStatus, remainingSeconds: newRemaining, elapsedSeconds: newElapsed },
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [republishStatus, currentIsPaused]);

  // Countdown pausa automática
  useEffect(() => {
    if (autoPauseSeconds <= 0 || currentIsPaused) return;

    const interval = setInterval(() => {
      setAutoPauseSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [autoPauseSeconds, currentIsPaused]);

  useEffect(() => {
    const seconds = liveData.fullData.autoPauseInfo?.secondsUntilPause ?? 0;
    setAutoPauseSeconds(seconds);
  }, [liveData.fullData.autoPauseInfo]);

  // Listener Firebase
  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(browserName, (newData) => {
      if (previousRepublishRef.current && newData.republishStatus) {
        const wasInProgress = previousRepublishRef.current.elapsedSeconds > 800;
        const justCompleted = newData.republishStatus.elapsedSeconds < 10;
        if (wasInProgress && justCompleted) {
          const now = Date.now();
          if (now - lastSuccessMessageTimeRef.current > 15000) {
            lastSuccessMessageTimeRef.current = now;
            setShowSuccessMessage(true);
          }
        }
      }
      if (newData.republishStatus) {
        previousRepublishRef.current = newData.republishStatus;
      }

      if (liveData.type === "single") {
        setLiveData({
          ...liveData,
          fullData: newData,
          isPaused: newData.isPaused,
          rentalRemaining: newData.rentalRemaining,
          republishStatus: newData.republishStatus,
          phoneNumber: newData.phoneNumber,
          city: newData.city,
          location: newData.location,
          postName: newData.postName,
        });
      } else if (liveData.type === "multi" && liveData.postId && newData.posts && newData.posts[liveData.postId]) {
        const postData = newData.posts[liveData.postId];
        setLiveData({
          ...liveData,
          fullData: newData,
          postData: postData,
          isPaused: postData.isPaused,
          rentalRemaining: postData.rentalRemaining,
          republishStatus: newData.republishStatus,
          phoneNumber: postData.phoneNumber,
          city: postData.city,
          location: postData.location,
          postName: postData.postName,
        });
      }
    });
    return () => unsubscribe();
  }, [browserName, liveData.type, liveData.postId]);

  // Timers mensajes
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  // Debounce
  const debounce = useCallback((callback: () => void, delay: number = 500): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < delay) return false;
    lastActionTimeRef.current = now;
    callback();
    return true;
  }, []);

  // Handler PAUSAR / REANUDAR
  const handleTogglePause = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading) return;

    debounce(async () => {
      const newPauseState = !currentIsPaused;

      // Optimistic update + reset timer al reanudar
      setLiveData((prev) => {
        const updated = { ...prev, isPaused: newPauseState };

        if (!newPauseState && prev.republishStatus) {
          const newTotal = 900 + Math.floor(Math.random() * 300); // 15-20 min
          updated.republishStatus = {
            ...prev.republishStatus,
            remainingSeconds: newTotal,
            elapsedSeconds: 0,
            totalSeconds: newTotal,
          };
        }

        return updated;
      });

      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.togglePausePost(browserName, postId, newPauseState);
        if (!result.success) {
          setLiveData((prev) => ({ ...prev, isPaused: currentIsPaused }));
          alert(`Error: ${result.error}`);
        }
      } catch {
        setLiveData((prev) => ({ ...prev, isPaused: currentIsPaused }));
        alert("Error al cambiar estado de pausa");
      } finally {
        setActionLoading(false);
        commandInProgressRef.current = false;
      }
    });
  }, [currentIsPaused, browserName, postId, debounce, actionLoading]);

  // Handler Republicar
  const handleRepublish = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading || currentIsPaused) return;
    debounce(async () => {
      setActionLoading(true);
      commandInProgressRef.current = true;
      try {
        const result = await FirebaseAPI.forceRepublish(browserName);
        if (result.success) {
          alert("Republicacion iniciada");
        } else {
          alert(`Error: ${result.error}`);
        }
      } catch {
        alert("Error al forzar republicacion");
      } finally {
        setTimeout(() => {
          setActionLoading(false);
          commandInProgressRef.current = false;
        }, 1000);
      }
    });
  }, [browserName, debounce, actionLoading, currentIsPaused]);

  const progressPercent = republishStatus
    ? (republishStatus.elapsedSeconds / republishStatus.totalSeconds) * 100
    : 0;
  const status = getRentalStatus(rentalRemaining);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 p-2 sm:p-4 backdrop-blur-md">
        <div className="relative my-4 sm:my-8 w-full max-w-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />

          <div className="border-b border-border/50 px-4 sm:px-6 py-3 sm:py-4">
            <Button
              variant="ghost"
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-xl px-3 sm:px-4 py-2 h-auto text-sm sm:text-base"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="font-semibold">Atrás</span>
            </Button>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-6 border-b border-border/50">
            <div className={cn(
              "relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl shadow-lg flex-shrink-0",
              currentIsPaused ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10" : "bg-gradient-to-br from-primary/20 to-accent/20 shadow-primary/10"
            )}>
              <div className={cn("absolute inset-0 rounded-xl sm:rounded-2xl opacity-50", currentIsPaused ? "animate-pulse bg-yellow-500/10" : "animate-pulse bg-primary/10")} />
              <div className={cn("relative h-4 w-4 sm:h-4 sm:w-4 rounded-full shadow-lg", currentIsPaused ? "bg-yellow-400 shadow-yellow-400/50" : "animate-pulse bg-green-400 shadow-green-400/50")} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{clientName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold border",
                  currentIsPaused ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", currentIsPaused ? "bg-yellow-400" : "animate-pulse bg-green-400")} />
                  {currentIsPaused ? "Pausado" : "Activo"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            {/* ALERTA DE DEUDA */}
            {(() => {
              const isDebt = rentalRemaining && (rentalRemaining.days < 0 || (rentalRemaining as any).isDebt === true);
              if (!isDebt) return null;
              const absDays = Math.abs(rentalRemaining!.days);
              const debtTime = `${absDays}d ${rentalRemaining!.hours}h ${rentalRemaining!.minutes}m`;
              return (
                <div className="rounded-xl sm:rounded-2xl border-2 sm:border-3 border-red-600 bg-gradient-to-br from-red-600/30 to-red-500/20 p-4 sm:p-6 backdrop-blur-sm animate-pulse">
                  <div className="flex flex-col items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-red-600/40 flex items-center justify-center border-2 border-red-500">
                      <span className="text-4xl sm:text-5xl">💀</span>
                    </div>
                    <div className="flex-1 text-center">
                      <h3 className="font-black text-xl sm:text-2xl text-red-400 mb-1 sm:mb-2">CUENTA VENCIDA</h3>
                      <p className="text-lg sm:text-xl font-bold text-red-300 mb-0.5 sm:mb-1">Deuda de {debtTime} de atraso</p>
                      <p className="text-xs sm:text-sm text-red-200">Tu anuncio sera eliminado automaticamente si no renuevas</p>
                    </div>
                    <a
                      href={`https://wa.me/18293837695?text=${encodeURIComponent(`🚨 URGENTE: Renovar ${clientName} - Tengo ${debtTime} de deuda`)}`}
                      target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="w-full px-6 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl font-black text-base sm:text-lg bg-gradient-to-r from-red-600 to-red-700 text-white hover:scale-105 transition-all duration-200 shadow-2xl shadow-red-600/50 border-2 border-red-400 text-center"
                    >
                      RENOVAR AHORA
                    </a>
                  </div>
                  <div className="bg-black/40 rounded-lg sm:rounded-xl p-3 sm:p-4 border-2 border-red-500/50">
                    <p className="text-center text-red-300 font-bold text-sm sm:text-base">Si no pagas en las proximas 48 horas perderas tu anuncio para siempre</p>
                  </div>
                </div>
              );
            })()}

            {/* INFORMACIÓN */}
            {!manuallyCreated && (
              <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
                <h3 className="mb-2 sm:mb-3 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Informacion</h3>
                <div className="grid gap-1.5 sm:gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Telefono</span><span className="font-medium text-foreground">{phoneNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ciudad</span><span className="font-medium text-foreground">{city}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ubicacion</span><span className="font-medium text-foreground">{location}</span></div>
                </div>
              </div>
            )}

            <TicketStatusBadge browserName={browserName} postId={postId} />

            {/* VER ANUNCIO EN VIVO */}
            {postUrl ? (
              <div className="rounded-lg sm:rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 p-4 sm:p-5 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(236,72,153,0.1),transparent)]" />
                <div className="relative">
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 flex-shrink-0"><span className="text-xl sm:text-2xl">👁️</span></div>
                    <div className="min-w-0"><h4 className="font-bold text-foreground text-base sm:text-lg">Tu Anuncio en Vivo</h4><p className="text-xs sm:text-sm text-muted-foreground">Asi lo ven tus clientes</p></div>
                  </div>
                  <a href={postUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="block w-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 text-white py-3 sm:py-4 rounded-lg sm:rounded-xl font-bold text-center hover:scale-105 transition-all duration-200 shadow-lg shadow-primary/50 text-base sm:text-lg">
                    Ver Mi Anuncio Ahora
                  </a>
                  {postIdCaptured && <p className="text-xs text-center text-muted-foreground mt-2 sm:mt-3">Actualizado {new Date(postIdCaptured).toLocaleString()}</p>}
                </div>
              </div>
            ) : (
              <div className="rounded-lg sm:rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 sm:p-5 backdrop-blur-sm">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0"><span className="text-lg sm:text-xl">⚠️</span></div>
                  <div><h4 className="font-bold text-yellow-400 text-sm sm:text-base">Anuncio No Sincronizado</h4><p className="text-xs sm:text-sm text-yellow-300/80">El link se capturara en la proxima republicacion</p></div>
                </div>
              </div>
            )}

            {/* TIMER DE REPUBLICACIÓN */}
            {republishStatus && (
              <div className={cn("rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4", currentIsPaused && "opacity-60")}>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    {republishStatus.remainingSeconds <= 0 && !showSuccessMessage ? "Republicacion" : showSuccessMessage ? "Exitoso" : "Proximo Anuncio"}
                  </h3>
                  {currentIsPaused && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">Pausado</span>}
                </div>
                <div className="mb-3 sm:mb-4 text-center">
                  <div className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                    {republishStatus.remainingSeconds <= 0 && !showSuccessMessage ? (
                      <span className="text-accent text-2xl sm:text-3xl">Completada</span>
                    ) : showSuccessMessage ? (
                      <span className="text-accent text-2xl sm:text-3xl">Completado</span>
                    ) : currentIsPaused ? (
                      <span className="text-warning text-2xl sm:text-3xl">En Pausa</span>
                    ) : (
                      formatTime(republishStatus.remainingSeconds)
                    )}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className={cn("h-full rounded-full transition-all duration-300", republishStatus.remainingSeconds <= 0 && !showSuccessMessage ? "bg-gradient-to-r from-green-500 to-emerald-500" : "bg-gradient-to-r from-primary to-accent")} style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                </div>
              </div>
            )}

            {/* TIEMPO DE RENTA */}
            <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tiempo de Renta</span>
                <span className={cn("text-lg sm:text-xl font-bold",
                  status === "healthy" && "text-accent",
                  status === "caution" && "text-chart-4",
                  status === "warning" && "text-warning",
                  status === "critical" && "text-destructive",
                  status === "debt" && "text-red-600 animate-pulse",
                  status === "neutral" && "text-muted-foreground"
                )}>
                  {formatRentalTime(rentalRemaining)}
                </span>
              </div>
            </div>

            {/* PAUSA AUTOMÁTICA */}
            <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Pausa Automática
                </span>
                <span className={cn(
                  "text-lg sm:text-xl font-bold",
                  autoPauseSeconds <= 0 && "text-warning animate-pulse",
                  autoPauseSeconds > 0 && autoPauseSeconds < 1800 && "text-chart-4",
                  autoPauseSeconds >= 1800 && "text-accent"
                )}>
                  {formatAutoPauseTime(autoPauseSeconds)}
                </span>
              </div>

              {autoPauseSeconds <= 0 && currentIsPaused && (
                <div className="mt-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning text-center font-medium">
                    ⚠️ Sistema pausado automáticamente
                  </p>
                  <p className="text-xs text-warning/80 text-center mt-1">
                    Haz click en "Reanudar" arriba para continuar
                  </p>
                </div>
              )}

              {autoPauseSeconds > 0 && autoPauseSeconds < 1800 && (
                <div className="mt-2 p-2 rounded-lg bg-chart-4/10 border border-chart-4/20">
                  <p className="text-xs text-chart-4 text-center font-medium">
                    ⏰ Se pausará pronto. Prepárate para reanudar
                  </p>
                </div>
              )}

              {autoPauseSeconds >= 1800 && (
                <div className="mt-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="text-xs text-accent/80 text-center">
                    Sistema operando normalmente
                  </p>
                </div>
              )}
            </div>

            {/* CONTROLES */}
            <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Controles
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Button
                  onClick={handleTogglePause}
                  disabled={actionLoading || commandInProgressRef.current}
                  className={cn(
                    "flex h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 text-sm",
                    currentIsPaused ? "bg-accent/10 text-accent hover:bg-accent/20" : "bg-warning/10 text-warning hover:bg-warning/20"
                  )}
                >
                  {currentIsPaused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
                  <span className="text-xs">{currentIsPaused ? "Reanudar" : "Pausar"}</span>
                </Button>

                <Button
                  onClick={handleRepublish}
                  disabled={actionLoading || currentIsPaused || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-1.5 sm:gap-2 bg-primary/10 py-3 sm:py-4 text-primary hover:bg-primary/20 text-sm"
                >
                  <RefreshIcon className="h-5 w-5" />
                  <span className="text-xs">Republicar</span>
                </Button>

                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setShowNotificationSettings(true)}
                    className="flex h-auto flex-col gap-1 bg-blue-500/10 py-2.5 sm:py-3 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30"
                  >
                    <span className="text-lg sm:text-xl">🔔</span>
                    <span className="text-[10px] sm:text-xs">Notificaciones</span>
                  </Button>
                  <Button
                    onClick={() => setShowTicketModal(true)}
                    className="flex h-auto flex-col gap-1 bg-cyan-500/10 py-2.5 sm:py-3 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30"
                  >
                    <span className="text-lg sm:text-xl">🎫</span>
                    <span className="text-[10px] sm:text-xs">Soporte</span>
                  </Button>
                </div>
              </div>
            </div>

            <Button onClick={() => window.history.back()} variant="outline" className="w-full bg-transparent h-12 sm:h-14 text-sm sm:text-base">
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {showNotificationSettings && <NotificationSettings browserName={browserName} onClose={() => setShowNotificationSettings(false)} />}
      <TicketModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        clientName={clientName}
        browserName={browserName}
        postId={postId}
        phoneNumber={phoneNumber}
        city={city}
      />
    </>
  );
}
