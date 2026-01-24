"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import {
  XIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  EditIcon,
  ClockIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationSettings } from "@/components/notification-settings";
import { CitySelector } from "@/components/CitySelector";

interface DashboardProps {
  browserData: BrowserData;
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
  if (rental.days === 0 && rental.hours === 0 && rental.minutes === 0) return "Expirada";
  const parts = [];
  if (rental.days > 0) parts.push(`${rental.days}d`);
  if (rental.hours > 0) parts.push(`${rental.hours}h`);
  if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
  return parts.join(" ");
}

function getRentalStatus(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "neutral";
  if (rental.days === 0 && rental.hours === 0) return "critical";
  if (rental.days === 0) return "warning";
  if (rental.days < 2) return "caution";
  return "healthy";
}

export function Dashboard({ browserData, onClose }: DashboardProps) {
  const [liveData, setLiveData] = useState(browserData);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCaptchaForm, setShowCaptchaForm] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false); // 🆕 Bloqueo inmediato
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false); // 🆕 Para "Cambios guardados"
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showCitySelector, setShowCitySelector] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    age: "",
    headline: "",
    body: "",
    city: "",
    location: "",
  });

  const modalManuallyControlledRef = useRef(false);
  const commandInProgressRef = useRef(false);
  const previousRepublishRef = useRef<BrowserData["republishStatus"] | null>(null);
  const previousEditInProgressRef = useRef<boolean>(false); // 🆕 Para detectar cuando termina edición
  const lastActionTimeRef = useRef<number>(0);
  const lastSuccessMessageTimeRef = useRef<number>(0);
  const userIsEditingRef = useRef(false);

  useEffect(() => {
    if (!liveData.republishStatus || liveData.isPaused) return;

    const baseRemaining = liveData.republishStatus.remainingSeconds;

    const interval = setInterval(() => {
      setLiveData(prev => {
        if (!prev.republishStatus) return prev;
        
        const newRemaining = Math.max(0, prev.republishStatus.remainingSeconds - 1);
        const newElapsed = Math.min(
          prev.republishStatus.totalSeconds,
          prev.republishStatus.elapsedSeconds + 1
        );

        return {
          ...prev,
          republishStatus: {
            ...prev.republishStatus,
            remainingSeconds: newRemaining,
            elapsedSeconds: newElapsed,
          }
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [liveData.republishStatus?.remainingSeconds, liveData.isPaused]);

  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(
      browserData.browserName || (browserData as BrowserData & { name?: string }).name || "",
      (newData) => {
        // MENSAJE DE ÉXITO - Detectar republicación completada
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

        // Cerrar modal de captcha automáticamente
        if (!newData.captchaWaiting && showCaptchaForm) {
          setShowCaptchaForm(false);
          setCaptchaCode("");
          modalManuallyControlledRef.current = false;
        }

        if (modalManuallyControlledRef.current) {
          return;
        }

        if (newData.captchaWaiting && !showCaptchaForm) {
          setShowCaptchaForm(true);
          modalManuallyControlledRef.current = true;
        }

        setLiveData(newData);
      }
    );

    return () => unsubscribe();
  }, [browserData, showCaptchaForm]);

  // ✅ SOLUCIÓN DEFINITIVA: UseEffect dedicado para auto-ocultar mensaje de éxito
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000);
      
      // Limpiar timeout si componente se desmonta o mensaje cambia
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  // 🆕 Detectar cuando termina la edición (editInProgress: true → false)
  useEffect(() => {
    const wasEditing = previousEditInProgressRef.current;
    const isEditingNow = liveData.editInProgress;

    // Si estaba editando y ahora ya NO, mostrar "Cambios guardados"
    if (wasEditing && !isEditingNow) {
      console.log('[Dashboard]: Edición completada, mostrando mensaje de guardado');
      setShowSavedMessage(true);
      
      // Ocultar después de 5 segundos
      setTimeout(() => {
        setShowSavedMessage(false);
      }, 5000);
    }

    // Actualizar ref para próxima comparación
    previousEditInProgressRef.current = isEditingNow;
  }, [liveData.editInProgress]);

  const debounce = useCallback((callback: () => void, delay: number = 500): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < delay) {
      console.log('[Dashboard] Acción bloqueada por debounce');
      return false;
    }
    lastActionTimeRef.current = now;
    callback();
    return true;
  }, []);

  const handleTogglePause = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    debounce(async () => {
      const newPauseState = !liveData.isPaused;
      
      setLiveData(prev => ({ ...prev, isPaused: newPauseState }));
      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.togglePause(
          liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
          newPauseState
        );

        if (!result.success) {
          setLiveData(prev => ({ ...prev, isPaused: !newPauseState }));
          alert(`Error: ${result.error}`);
        }
      } catch (error) {
        setLiveData(prev => ({ ...prev, isPaused: !newPauseState }));
        alert('Error al cambiar estado de pausa');
      } finally {
        setActionLoading(false);
        commandInProgressRef.current = false;
      }
    });
  }, [liveData, debounce, actionLoading]);

  const handleRepublish = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading || liveData.isPaused) {
      return;
    }

    debounce(async () => {
      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.forceRepublish(
          liveData.browserName || (liveData as BrowserData & { name?: string }).name || ""
        );

        if (result.success) {
          alert("Republicación iniciada");
        } else {
          alert(`Error: ${result.error}`);
        }
      } catch (error) {
        alert('Error al forzar republicación');
      } finally {
        setTimeout(() => {
          setActionLoading(false);
          commandInProgressRef.current = false;
        }, 1000);
      }
    });
  }, [liveData, debounce, actionLoading]);

  const handleOpenEditor = () => {
    // Resetear flag
    userIsEditingRef.current = false;
    
    // Abrir modal con datos actuales
    setEditForm({
      name: liveData.name || "",
      age: liveData.age ? String(liveData.age) : "",
      headline: liveData.headline || "",
      body: liveData.body || "",
      city: liveData.city || "",
      location: liveData.location || "",
    });
    
    setShowEditForm(true);
  };

  // Helper para marcar que usuario está editando
  const handleFieldChange = (field: keyof typeof editForm, value: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCitySelect = (city: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, city }));
  };

  const handleSaveAllEdits = async () => {
    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    // 🆕 Solo enviar campos que CAMBIARON comparados con los valores originales
    const changes: Record<string, string> = {};
    
    // Comparar cada campo con el valor original
    if (editForm.name.trim() && editForm.name.trim() !== (liveData.name || "")) {
      changes.name = editForm.name.trim();
    }
    if (editForm.age.trim() && editForm.age.trim() !== String(liveData.age || "")) {
      changes.age = editForm.age.trim();
    }
    if (editForm.headline.trim() && editForm.headline.trim() !== (liveData.headline || "")) {
      changes.headline = editForm.headline.trim();
    }
    if (editForm.body.trim() && editForm.body.trim() !== (liveData.body || "")) {
      changes.body = editForm.body.trim();
    }
    if (editForm.city.trim() && editForm.city.trim() !== (liveData.city || "")) {
      changes.city = editForm.city.trim();
    }
    if (editForm.location.trim() && editForm.location.trim() !== (liveData.location || "")) {
      changes.location = editForm.location.trim();
    }

    if (Object.keys(changes).length === 0) {
      alert("No has realizado ningún cambio. Modifica los campos que quieras actualizar.");
      return;
    }

    if (changes.age) {
      const age = Number.parseInt(changes.age);
      if (Number.isNaN(age) || age < 18 || age > 99) {
        alert("Edad debe ser 18-99");
        return;
      }
    }

    if (changes.headline && changes.headline.length > 250) {
      alert(`Encabezado muy largo (${changes.headline.length}/250)`);
      return;
    }

    if (changes.body && changes.body.length > 2000) {
      alert(`Cuerpo muy largo (${changes.body.length}/2000)`);
      return;
    }

    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
        "edit_multiple_fields",
        { changes }
      );

      if (result.success) {
        alert("Edición iniciada. El sistema procesará los cambios automáticamente.");
        userIsEditingRef.current = false;
        setShowEditForm(false);
        setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setActionLoading(false);
      commandInProgressRef.current = false;
    }
  };

  const handleCaptchaSubmit = async () => {
    if (!captchaCode.trim()) {
      alert("Escribe el código de seguridad");
      return;
    }

    // 🆕 BLOQUEO INMEDIATO para evitar clicks múltiples
    if (captchaSubmitting || commandInProgressRef.current || actionLoading) {
      console.log('[CaptchaSubmit]: Bloqueado - ya hay un envío en progreso');
      return;
    }

    // 🆕 Marcar INMEDIATAMENTE como "enviando"
    setCaptchaSubmitting(true);
    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
        "submit_captcha",
        { code: captchaCode.trim() }
      );

      if (result.success) {
        // ✅ CERRAR VENTANA AUTOMÁTICAMENTE (sin alert que retrasa)
        console.log('[CaptchaSubmit]: ✅ Código enviado correctamente');
        setShowCaptchaForm(false);
        setCaptchaCode("");
        modalManuallyControlledRef.current = false;
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setActionLoading(false);
      commandInProgressRef.current = false;
      setCaptchaSubmitting(false);
    }
  };

  const handleCaptchaCancel = () => {
    setShowCaptchaForm(false);
    setCaptchaCode("");
    modalManuallyControlledRef.current = false;
  };

  const progressPercent = liveData.republishStatus
    ? (liveData.republishStatus.elapsedSeconds / liveData.republishStatus.totalSeconds) * 100
    : 0;

  const status = getRentalStatus(liveData.rentalRemaining);

  return (
    <>
      {/* Main Modal - MEJORADO PARA MÓVILES */}
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-md">
        <div className="relative my-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />
          
          <div className="flex items-center justify-between border-b border-border/50 p-6">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "relative flex h-16 w-16 sm:h-14 sm:w-14 items-center justify-center rounded-2xl shadow-lg",
                  liveData.isPaused 
                    ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10" 
                    : "bg-gradient-to-br from-primary/20 to-accent/20 shadow-primary/10"
                )}
              >
                <div className={cn(
                  "absolute inset-0 rounded-2xl opacity-50",
                  liveData.isPaused ? "animate-pulse bg-yellow-500/10" : "animate-pulse bg-primary/10"
                )} />
                <div
                  className={cn(
                    "relative h-5 w-5 sm:h-4 sm:w-4 rounded-full shadow-lg",
                    liveData.isPaused 
                      ? "bg-yellow-400 shadow-yellow-400/50" 
                      : "animate-pulse bg-green-400 shadow-green-400/50"
                  )}
                />
              </div>
              <div>
                <h2 className="text-2xl sm:text-xl font-bold text-foreground">
                  {liveData.browserName || (liveData as BrowserData & { name?: string }).name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm sm:text-xs font-semibold border",
                      liveData.isPaused 
                        ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" 
                        : "bg-green-500/10 text-green-400 border-green-500/20"
                    )}
                  >
                    <span className={cn(
                      "h-2 w-2 sm:h-1.5 sm:w-1.5 rounded-full",
                      liveData.isPaused ? "bg-yellow-400" : "animate-pulse bg-green-400"
                    )} />
                    {liveData.isPaused ? "Pausado" : "Activo"}
                  </span>
                  {liveData.editInProgress && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm sm:text-xs font-semibold text-primary border border-primary/20">
                      <span className="h-2 w-2 sm:h-1.5 sm:w-1.5 animate-spin rounded-full border border-primary border-t-transparent" />
                      Editando
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-12 w-12 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground hover:bg-secondary/50">
              <XIcon className="h-6 w-6 sm:h-5 sm:w-5" />
            </Button>
          </div>

          <div className="space-y-6 p-6">
            
            {liveData.editLog && (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  liveData.editLogType === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                  liveData.editLogType === "success" && "border-accent/30 bg-accent/10 text-accent",
                  liveData.editLogType === "info" && "border-primary/30 bg-primary/10 text-primary",
                  liveData.editLogType === "warning" && "border-orange-500/30 bg-orange-500/10 text-orange-400"
                )}
              >
                <p className="text-center text-base sm:text-sm font-medium">{liveData.editLog}</p>
              </div>
            )}



            {!liveData.manuallyCreated && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Información
                </h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Teléfono</span>
                    <span className="font-medium text-foreground">{liveData.phoneNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ciudad</span>
                    <span className="font-medium text-foreground">{liveData.city}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ubicación</span>
                    <span className="font-medium text-foreground">{liveData.location}</span>
                  </div>
                </div>
              </div>
            )}

            {liveData.postId && liveData.postUrl ? (
              <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 p-5 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(236,72,153,0.1),transparent)]" />
                
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                      <span className="text-2xl">👁️</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-lg">Tu Anuncio en Vivo</h4>
                      <p className="text-sm text-muted-foreground">Así lo ven tus clientes</p>
                    </div>
                  </div>
                  
                  <a
                    href={liveData.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block w-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 text-white py-4 rounded-xl font-bold text-center hover:scale-105 transition-all duration-200 shadow-lg shadow-primary/50 text-lg"
                  >
                    🔗 Ver Mi Anuncio Ahora
                  </a>
                  
                  {liveData.postIdCapturedAt && (
                    <p className="text-xs text-center text-muted-foreground mt-3">
                      ✅ Actualizado {new Date(liveData.postIdCapturedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-yellow-400">Anuncio No Sincronizado</h4>
                    <p className="text-sm text-yellow-300/80">
                      El link se capturará en la próxima republicación
                    </p>
                  </div>
                </div>
              </div>
            )}

            {liveData.republishStatus && (
              <div className={cn("rounded-xl border border-border bg-secondary/30 p-4", liveData.isPaused && "opacity-60")}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-4 w-4" />
                    {showSavedMessage
                      ? "Guardado"
                      : liveData.editInProgress
                        ? "Editando"
                        : (liveData.republishStatus.remainingSeconds <= 0 && !showSuccessMessage)
                          ? "Republicación"
                          : showSuccessMessage
                            ? "Exitoso"
                            : "Próximo Anuncio"}
                  </h3>
                  {liveData.isPaused && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      Pausado
                    </span>
                  )}
                </div>

                <div className="mb-4 text-center">
                  <div className="text-5xl sm:text-4xl font-bold tabular-nums text-foreground">
                    {showSavedMessage ? (
                      <span className="text-accent">✅ Cambios guardados</span>
                    ) : liveData.editInProgress ? (
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-primary">Editando...</span>
                        {liveData.republishStatus && liveData.republishStatus.remainingSeconds > 0 && (
                          <span className="text-2xl sm:text-xl text-muted-foreground">
                            Se publicará en {formatTime(liveData.republishStatus.remainingSeconds)}
                          </span>
                        )}
                      </div>
                    ) : (liveData.republishStatus.remainingSeconds <= 0 && !showSuccessMessage) ? (
                      <span className="text-accent">✓ Completada</span>
                    ) : showSuccessMessage ? (
                      <span className="text-accent">Completado</span>
                    ) : liveData.isPaused ? (
                      <span className="text-warning">En Pausa</span>
                    ) : (
                      formatTime(liveData.republishStatus.remainingSeconds)
                    )}
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      (liveData.republishStatus.remainingSeconds <= 0 && !showSuccessMessage)
                        ? "bg-gradient-to-r from-green-500 to-emerald-500"
                        : "bg-gradient-to-r from-primary to-accent"
                    )}
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tiempo de Renta</span>
                <span
                  className={cn(
                    "text-2xl sm:text-xl font-bold",
                    status === "healthy" && "text-accent",
                    status === "caution" && "text-chart-4",
                    status === "warning" && "text-warning",
                    status === "critical" && "text-destructive",
                    status === "neutral" && "text-muted-foreground"
                  )}
                >
                  {formatRentalTime(liveData.rentalRemaining)}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Controles</h3>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  onClick={handleTogglePause}
                  disabled={actionLoading || commandInProgressRef.current}
                  className={cn(
                    "flex h-auto flex-col gap-2 py-5 sm:py-4 text-base sm:text-sm",
                    liveData.isPaused
                      ? "bg-accent/10 text-accent hover:bg-accent/20"
                      : "bg-warning/10 text-warning hover:bg-warning/20"
                  )}
                >
                  {liveData.isPaused ? <PlayIcon className="h-6 w-6 sm:h-5 sm:w-5" /> : <PauseIcon className="h-6 w-6 sm:h-5 sm:w-5" />}
                  <span className="text-xs">{liveData.isPaused ? "Reanudar" : "Pausar"}</span>
                </Button>

                <Button
                  onClick={handleRepublish}
                  disabled={actionLoading || liveData.isPaused || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-2 bg-primary/10 py-5 sm:py-4 text-primary hover:bg-primary/20 text-base sm:text-sm"
                >
                  <RefreshIcon className="h-6 w-6 sm:h-5 sm:w-5" />
                  <span className="text-xs">Republicar</span>
                </Button>

                <Button
                  onClick={handleOpenEditor}
                  disabled={actionLoading || liveData.editInProgress || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-2 bg-chart-4/10 py-5 sm:py-4 text-chart-4 hover:bg-chart-4/20 text-base sm:text-sm"
                >
                  <EditIcon className="h-6 w-6 sm:h-5 sm:w-5" />
                  <span className="text-xs">
                    {liveData.editInProgress ? "Editando..." : "Editar"}
                  </span>
                </Button>

                <Button
                  onClick={() => setShowNotificationSettings(true)}
                  className="col-span-3 flex h-auto flex-col gap-2 bg-blue-500/10 py-5 sm:py-4 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30"
                >
                  <span className="text-2xl sm:text-xl">🔔</span>
                  <span className="text-sm sm:text-xs">Configurar Notificaciones</span>
                </Button>
              </div>
            </div>

            <Button onClick={onClose} variant="outline" className="w-full bg-transparent h-14 sm:h-12 text-base sm:text-sm">
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL DE EDICIÓN - TUTORIAL PASO A PASO */}
      {showEditForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div 
            className="my-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto relative"
            style={{
              background: 'linear-gradient(180deg, #E6C9E6 0%, #D4A5D4 20%, #C28AC2 40%, #B06FB0 60%, #9E549E 80%, #8C398C 100%)',
              borderRadius: '0 0 20px 20px',
              border: 'none'
            }}
          >
            {/* BORDE ONDULADO SUPERIOR */}
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '20px',
                background: 'linear-gradient(90deg, #FF69B4 0%, #FF1493 50%, #FF69B4 100%)',
                borderRadius: '20px 20px 0 0',
              }}
            >
              <svg
                width="100%"
                height="20"
                viewBox="0 0 100 20"
                preserveAspectRatio="none"
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                <path
                  d="M0,20 Q2.5,0 5,0 T10,0 T15,0 T20,0 T25,0 T30,0 T35,0 T40,0 T45,0 T50,0 T55,0 T60,0 T65,0 T70,0 T75,0 T80,0 T85,0 T90,0 T95,0 T100,0 L100,20 Z"
                  fill="#FF69B4"
                />
              </svg>
            </div>

            {/* HEADER MEGAPERSONALS */}
            <div 
              className="text-center pt-6 pb-2"
              style={{
                background: 'linear-gradient(180deg, rgba(255,105,180,0.3) 0%, transparent 100%)',
                marginTop: '20px'
              }}
            >
              <h1 
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: '#E8E8E8',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                  letterSpacing: '2px',
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                }}
              >
                Mega<span style={{ color: '#87CEEB' }}>Personals</span>
              </h1>
              <p 
                style={{
                  fontSize: '11px',
                  color: '#E8E8E8',
                  marginTop: '-5px',
                  letterSpacing: '3px'
                }}
              >
                personals classifieds
              </p>
            </div>

            {/* CONTAINER PRINCIPAL CON IMAGEN */}
            <div className="relative" style={{ padding: '20px 30px 30px 30px' }}>
              
              {/* IMAGEN DE LA CHICA + LOGO "CREATE POST" */}
              <div 
                className="absolute pointer-events-none"
                style={{
                  top: '-60px',
                  left: '20px',
                  width: '400px',
                  height: '300px',
                  zIndex: 20
                }}
              >
                <img
                  src="https://megapersonals.eu/resources/img/writepost1_devilgirl.png?v=1768750586"
                  alt="Create Post"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.4))'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              {/* TÍTULO "TUTORIAL DE EDICIÓN" */}
              <div className="text-center mb-6 relative z-20">
                <h2 
                  style={{
                    fontSize: '36px',
                    fontWeight: 900,
                    color: '#FFFF00',
                    textShadow: '3px 3px 6px rgba(0,0,0,0.8), -1px -1px 3px rgba(0,0,0,0.5)',
                    fontFamily: 'Arial Black, system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
                    letterSpacing: '1px'
                  }}
                >
                  📚 Tutorial de Edición
                </h2>
                <p 
                  style={{
                    fontSize: '16px',
                    color: '#FFFFFF',
                    marginTop: '10px',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                  }}
                >
                  ✨ Sigue estos pasos para editar tu anuncio
                </p>
              </div>

              {/* INSTRUCCIONES PASO A PASO */}
              <div 
                className="mb-6 p-5 relative z-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '15px',
                  border: '3px solid #FF69B4',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
              >
                <h3 
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#8C398C',
                    marginBottom: '15px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                  }}
                >
                  📋 Instrucciones
                </h3>
                <ol 
                  style={{
                    fontSize: '15px',
                    color: '#333333',
                    lineHeight: '1.8',
                    paddingLeft: '25px',
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                  }}
                >
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 1:</strong> Cambia <u>SOLO</u> los campos que quieras actualizar
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 2:</strong> Si NO quieres cambiar un campo, <u>déjalo como está</u>
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 3:</strong> Haz click en "✅ Guardar Cambios"
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 4:</strong> El sistema procesará automáticamente
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 5:</strong> Aparecerá una ventana con código de seguridad
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 6:</strong> Escribe el código y presiona "Enviar" <u>UNA SOLA VEZ</u>
                  </li>
                  <li>
                    <strong style={{ color: '#8C398C' }}>Paso 7:</strong> ¡Listo! La ventana se cerrará automáticamente
                  </li>
                </ol>
                
                {/* ADVERTENCIA IMPORTANTE */}
                <div 
                  style={{
                    marginTop: '20px',
                    padding: '15px',
                    background: '#FFF3CD',
                    border: '2px solid #FFC107',
                    borderRadius: '10px'
                  }}
                >
                  <p 
                    style={{
                      fontSize: '14px',
                      color: '#856404',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      margin: 0,
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    ⚠️ <u>MUY IMPORTANTE</u> ⚠️<br />
                    Cuando aparezca el captcha, presiona "Enviar" <u>UNA SOLA VEZ</u>.<br />
                    La ventana se cerrará automáticamente en segundos.<br />
                    NO hagas click múltiples veces. ¡Ten paciencia!
                  </p>
                </div>
              </div>

              {/* FORMULARIO */}
              <div className="space-y-4 relative z-20" style={{ marginTop: '20px' }}>
                
                {/* NAME/ALIAS */}
                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    <span style={{ color: '#87CEEB' }}>1️⃣</span> Name/Alias:
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    maxLength={50}
                    placeholder="Ejemplo: Sofia"
                    style={{
                      width: '100%',
                      height: '45px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 15px',
                      fontSize: '15px',
                      color: '#555555',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  />
                  {editForm.name && (
                    <p style={{ marginTop: '5px', fontSize: '12px', color: '#FFFFFF' }}>
                      {editForm.name.length}/50 caracteres
                    </p>
                  )}
                </div>

                {/* AGE */}
                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    <span style={{ color: '#87CEEB' }}>2️⃣</span> Age:
                  </label>
                  <select
                    value={editForm.age}
                    onChange={(e) => handleFieldChange('age', e.target.value)}
                    style={{
                      width: '100%',
                      height: '45px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 15px',
                      fontSize: '15px',
                      color: '#555555',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    <option value="">-- No cambiar --</option>
                    {Array.from({ length: 82 }, (_, i) => i + 18).map((age) => (
                      <option key={age} value={age}>
                        {age}
                      </option>
                    ))}
                  </select>
                </div>

                {/* HEADLINE */}
                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    <span style={{ color: '#87CEEB' }}>3️⃣</span> Headline:
                  </label>
                  <input
                    type="text"
                    value={editForm.headline}
                    onChange={(e) => handleFieldChange('headline', e.target.value)}
                    maxLength={250}
                    placeholder="Ejemplo: SEXY COLOMBIANA 🔥💋"
                    style={{
                      width: '100%',
                      height: '45px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 15px',
                      fontSize: '15px',
                      color: '#555555',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  />
                  {editForm.headline && (
                    <p style={{ marginTop: '5px', fontSize: '12px', color: '#FFFFFF' }}>
                      {editForm.headline.length}/250 caracteres
                    </p>
                  )}
                </div>

                {/* BODY */}
                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                    }}
                  >
                    <span style={{ color: '#87CEEB' }}>4️⃣</span> Body:
                  </label>
                  <textarea
                    value={editForm.body}
                    onChange={(e) => handleFieldChange('body', e.target.value)}
                    rows={6}
                    maxLength={2000}
                    placeholder="Ejemplo: Hola 💕 soy muy caliente 🔥..."
                    style={{
                      width: '100%',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '12px 15px',
                      fontSize: '15px',
                      color: '#555555',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
                      resize: 'none'
                    }}
                  />
                  {editForm.body && (
                    <p style={{ marginTop: '5px', fontSize: '12px', color: '#FFFFFF' }}>
                      {editForm.body.length}/2000 caracteres
                    </p>
                  )}
                </div>

                {/* CITY & LOCATION */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label 
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        color: '#FFFF00',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                      }}
                    >
                      <span style={{ color: '#87CEEB' }}>5️⃣</span> City:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editForm.city}
                        readOnly
                        style={{
                          flex: 1,
                          height: '45px',
                          backgroundColor: '#FFFFFF',
                          border: '2px solid #888888',
                          borderRadius: '5px',
                          padding: '10px 15px',
                          fontSize: '15px',
                          color: '#555555',
                          fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                        }}
                      />
                      <Button
                        type="button"
                        onClick={() => setShowCitySelector(true)}
                        style={{
                          height: '45px',
                          background: 'linear-gradient(135deg, #FF8C00 0%, #FFA500 100%)',
                          border: '2px solid #FF8C00',
                          borderRadius: '5px',
                          color: '#FFFFFF',
                          fontWeight: 'bold',
                          padding: '0 20px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                        }}
                      >
                        🗺️ Cambiar
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label 
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        color: '#FFFF00',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                      }}
                    >
                      <span style={{ color: '#87CEEB' }}>6️⃣</span> Location/Area:
                    </label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => handleFieldChange('location', e.target.value)}
                      maxLength={100}
                      placeholder="Ejemplo: Downtown"
                      style={{
                        width: '100%',
                        height: '45px',
                        backgroundColor: '#FFFFFF',
                        border: '2px solid #888888',
                        borderRadius: '5px',
                        padding: '10px 15px',
                        fontSize: '15px',
                        color: '#555555',
                        fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* BOTONES */}
              <div className="mt-8 flex flex-col sm:flex-row gap-4 relative z-20">
                <Button
                  onClick={handleSaveAllEdits}
                  disabled={actionLoading || commandInProgressRef.current}
                  style={{
                    flex: 1,
                    height: '55px',
                    background: 'linear-gradient(135deg, #00C853 0%, #00E676 100%)',
                    border: '3px solid #00C853',
                    borderRadius: '10px',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'Arial Black, system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                  }}
                >
                  {actionLoading ? "Guardando..." : "✅ Guardar Cambios"}
                </Button>
                <Button
                  onClick={async () => {
                    // Enviar comando para que el bot vuelva atrás
                    try {
                      await FirebaseAPI.sendCommand(
                        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
                        "cancel_edit",
                        {}
                      );
                    } catch (error) {
                      console.error('Error sending cancel command:', error);
                    }
                    
                    userIsEditingRef.current = false;
                    setShowEditForm(false);
                    setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
                  }}
                  disabled={actionLoading || commandInProgressRef.current}
                  style={{
                    flex: 1,
                    height: '55px',
                    background: '#666666',
                    border: '3px solid #555555',
                    borderRadius: '10px',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'Arial Black, system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                  }}
                >
                  Cancelar
                </Button>
              </div>

              {/* RECORDATORIO FINAL */}
              <div 
                className="mt-6 p-4 relative z-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '12px',
                  border: '2px solid #00E676',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                }}
              >
                <p 
                  style={{
                    fontSize: '14px',
                    color: '#333333',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    margin: 0,
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
                  }}
                >
                  ✅ Recuerda: Solo cambia los campos que quieras actualizar
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CAPTCHA - MEJORADO PARA MÓVILES */}
      {showCaptchaForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
            <h3 className="mb-6 text-center text-3xl sm:text-2xl font-bold text-foreground">Código de Seguridad</h3>

            {liveData.captchaImage && (
              <div className="mb-6 text-center">
                <img
                  src={liveData.captchaImage}
                  alt="Captcha"
                  className="mx-auto max-w-full rounded-xl border border-border"
                />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-center text-base sm:text-sm font-medium text-muted-foreground">
                  Escribe los caracteres:
                </label>
                <Input
                  type="text"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !captchaSubmitting && !actionLoading && !commandInProgressRef.current && handleCaptchaSubmit()
                  }
                  placeholder="Ejemplo: 3uK>"
                  className="bg-input text-center font-mono text-xl sm:text-lg text-foreground h-16 sm:h-14"
                  autoFocus
                  disabled={captchaSubmitting || actionLoading || commandInProgressRef.current}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleCaptchaSubmit}
                disabled={captchaSubmitting || actionLoading || !captchaCode.trim() || commandInProgressRef.current}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-14 sm:h-12 text-base sm:text-sm"
              >
                {captchaSubmitting || actionLoading ? "Enviando..." : "✅ Enviar"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCaptchaCancel}
                disabled={captchaSubmitting || actionLoading || commandInProgressRef.current}
                className="flex-1 bg-transparent h-14 sm:h-12 text-base sm:text-sm"
              >
                Cancelar
              </Button>
            </div>

            <p className="mt-4 text-center text-sm sm:text-xs text-muted-foreground">
              {captchaSubmitting ? "⏳ Procesando... NO hagas click nuevamente" : "Presiona Enviar UNA SOLA VEZ"}
            </p>
          </div>
        </div>
      )}

      {showNotificationSettings && (
        <NotificationSettings
          browserName={liveData.browserName || (liveData as BrowserData & { name?: string }).name || ""}
          onClose={() => setShowNotificationSettings(false)}
        />
      )}

      <CitySelector
        isOpen={showCitySelector}
        onClose={() => setShowCitySelector(false)}
        onSelectCity={handleCitySelect}
        currentCity={editForm.city}
      />
    </>
  );
}
