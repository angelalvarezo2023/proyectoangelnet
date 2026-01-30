"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type PostData } from "@/lib/firebase";
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
  postId: string;  // 🆕 Ahora recibe postId en lugar de browserData
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

function formatRentalTime(rental: PostData["rentalRemaining"]) {
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

function getRentalStatus(rental: PostData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "neutral";
  if (rental.days < 0 || (rental as any).isDebt) return "debt";
  if (rental.days === 0 && rental.hours === 0) return "critical";
  if (rental.days === 0) return "warning";
  if (rental.days < 2) return "caution";
  return "healthy";
}

export function Dashboard({ postId, onClose }: DashboardProps) {
  const [liveData, setLiveData] = useState<PostData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCaptchaForm, setShowCaptchaForm] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [captchaRefreshing, setCaptchaRefreshing] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showCitySelector, setShowCitySelector] = useState(false);

  const [editForm, setEditForm] = useState({
    clientName: "",
    postName: "",
    age: "",
    headline: "",
    body: "",
    city: "",
    location: "",
  });

  const modalManuallyControlledRef = useRef(false);
  const commandInProgressRef = useRef(false);
  const previousRepublishRef = useRef<PostData["republishStatus"] | null>(null);
  const previousEditInProgressRef = useRef<boolean>(false);
  const lastActionTimeRef = useRef<number>(0);
  const lastSuccessMessageTimeRef = useRef<number>(0);
  const userIsEditingRef = useRef(false);

  // 🆕 Cargar post inicial
  useEffect(() => {
    async function loadPost() {
      const post = await FirebaseAPI.findPostById(postId);
      if (post) {
        setLiveData(post);
      }
    }
    loadPost();
  }, [postId]);

  // 🆕 Timer para countdown
  useEffect(() => {
    if (!liveData?.republishStatus || liveData.isPaused) return;

    const interval = setInterval(() => {
      setLiveData(prev => {
        if (!prev?.republishStatus) return prev;
        
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
  }, [liveData?.republishStatus?.remainingSeconds, liveData?.isPaused]);

  // 🆕 Listener del post
  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToPost(postId, (newData) => {
      if (!newData) return;

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
    });

    return () => unsubscribe();
  }, [postId, showCaptchaForm]);

  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  useEffect(() => {
    const wasEditing = previousEditInProgressRef.current;
    const isEditingNow = liveData?.editInProgress;

    if (wasEditing && !isEditingNow) {
      setShowSavedMessage(true);
      setTimeout(() => setShowSavedMessage(false), 5000);
    }

    previousEditInProgressRef.current = isEditingNow || false;
  }, [liveData?.editInProgress]);

  const debounce = useCallback((callback: () => void, delay: number = 500): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < delay) {
      return false;
    }
    lastActionTimeRef.current = now;
    callback();
    return true;
  }, []);

  const handleTogglePause = useCallback(async () => {
    if (!liveData || commandInProgressRef.current || actionLoading) return;

    debounce(async () => {
      const newPauseState = !liveData.isPaused;
      
      setLiveData(prev => prev ? { ...prev, isPaused: newPauseState } : null);
      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.togglePostPause(postId, newPauseState);

        if (!result.success) {
          setLiveData(prev => prev ? { ...prev, isPaused: !newPauseState } : null);
          alert(`Error: ${result.error}`);
        }
      } catch (error) {
        setLiveData(prev => prev ? { ...prev, isPaused: !newPauseState } : null);
        alert('Error al cambiar estado de pausa');
      } finally {
        setActionLoading(false);
        commandInProgressRef.current = false;
      }
    });
  }, [liveData, debounce, actionLoading, postId]);

  const handleRepublish = useCallback(async () => {
    if (!liveData || commandInProgressRef.current || actionLoading || liveData.isPaused) return;

    debounce(async () => {
      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.forceRepublishPost(postId);

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
  }, [liveData, debounce, actionLoading, postId]);

  const handleOpenEditor = () => {
    if (!liveData) return;
    
    userIsEditingRef.current = false;
    
    setEditForm({
      clientName: liveData.clientName || "",
      postName: liveData.postName || "",
      age: liveData.age ? String(liveData.age) : "",
      headline: liveData.headline || "",
      body: liveData.body || "",
      city: liveData.city || "",
      location: liveData.location || "",
    });
    
    setShowEditForm(true);
  };

  const handleFieldChange = (field: keyof typeof editForm, value: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCitySelect = (city: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, city }));
  };

  const handleSaveAllEdits = async () => {
    if (!liveData || commandInProgressRef.current || actionLoading) return;

    const changes: Record<string, string> = {};
    
    if (editForm.clientName.trim() && editForm.clientName.trim() !== (liveData.clientName || "")) {
      changes.clientName = editForm.clientName.trim();
    }
    if (editForm.postName.trim() && editForm.postName.trim() !== (liveData.postName || "")) {
      changes.postName = editForm.postName.trim();
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
      alert("No has realizado ningún cambio");
      return;
    }

    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      // 🆕 Enviar comando al navegador que maneja este post
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName,
        "edit_post",
        { postId, changes }
      );

      if (result.success) {
        alert("Edición iniciada. El sistema procesará los cambios automáticamente.");
        userIsEditingRef.current = false;
        setShowEditForm(false);
        setEditForm({ clientName: "", postName: "", age: "", headline: "", body: "", city: "", location: "" });
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setActionLoading(false);
      commandInProgressRef.current = false;
    }
  };

  const handleCaptchaSubmit = async () => {
    if (!liveData || !captchaCode.trim() || captchaSubmitting || commandInProgressRef.current || actionLoading) return;

    setCaptchaSubmitting(true);
    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName,
        "submit_captcha",
        { code: captchaCode.trim(), postId }
      );

      if (result.success) {
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

  const handleCaptchaRefresh = async () => {
    if (!liveData || captchaRefreshing || actionLoading || commandInProgressRef.current) return;

    try {
      setCaptchaRefreshing(true);
      commandInProgressRef.current = true;

      await FirebaseAPI.sendCommand(liveData.browserName, "refresh_captcha", { postId });

      setTimeout(() => {
        setCaptchaRefreshing(false);
        commandInProgressRef.current = false;
      }, 5000);

    } catch (error) {
      setCaptchaRefreshing(false);
      commandInProgressRef.current = false;
    }
  };

  if (!liveData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  const progressPercent = liveData.republishStatus
    ? (liveData.republishStatus.elapsedSeconds / liveData.republishStatus.totalSeconds) * 100
    : 0;

  const status = getRentalStatus(liveData.rentalRemaining);

  return (
    <>
      {/* Main Modal */}
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
                  {liveData.clientName}
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
            
            {/* BANNER DE DEUDA */}
            {(() => {
              const isDebt = liveData.rentalRemaining && 
                           (liveData.rentalRemaining.days < 0 || 
                            (liveData.rentalRemaining as any).isDebt === true);
              
              if (!isDebt) return null;
              
              const absDays = Math.abs(liveData.rentalRemaining!.days);
              const debtTime = `${absDays}d ${liveData.rentalRemaining!.hours}h ${liveData.rentalRemaining!.minutes}m`;
              
              return (
                <div className="rounded-2xl border-3 border-red-600 bg-gradient-to-br from-red-600/30 to-red-500/20 p-6 backdrop-blur-sm animate-pulse">
                  <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                    <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-red-600/40 flex items-center justify-center border-2 border-red-500">
                      <span className="text-5xl">💀</span>
                    </div>
                    
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="font-black text-2xl text-red-400 mb-2">
                        ⚠️ CUENTA VENCIDA ⚠️
                      </h3>
                      <p className="text-xl font-bold text-red-300 mb-1">
                        Deuda: {debtTime} de atraso
                      </p>
                      <p className="text-sm text-red-200">
                        Tu anuncio será eliminado automáticamente si no renuevas
                      </p>
                    </div>
                    
                    <a 
                      href={`https://wa.me/18293837695?text=${encodeURIComponent(
                        `🚨 URGENTE: Renovar ${liveData.clientName} - Tengo ${debtTime} de deuda`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-8 py-4 rounded-xl font-black text-lg bg-gradient-to-r from-red-600 to-red-700 text-white hover:scale-105 transition-all duration-200 shadow-2xl shadow-red-600/50 border-2 border-red-400 whitespace-nowrap"
                    >
                      💀 RENOVAR AHORA 💀
                    </a>
                  </div>
                  
                  <div className="bg-black/40 rounded-xl p-4 border-2 border-red-500/50">
                    <p className="text-center text-red-300 font-bold text-base">
                      ⚡ Si no pagas en las próximas 48 horas, perderás tu anuncio para siempre ⚡
                    </p>
                  </div>
                </div>
              );
            })()}

            {liveData.editLog && (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  liveData.editLogType === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                  liveData.editLogType === "success" && "border-accent/30 bg-accent/10 text-accent",
                  liveData.editLogType === "info" && "border-primary/30 bg-primary/10 text-primary"
                )}
              >
                <p className="text-center text-base sm:text-sm font-medium">{liveData.editLog}</p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Información
              </h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Post</span>
                  <span className="font-medium text-foreground">{liveData.postName}</span>
                </div>
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

            {liveData.megaPostUrl ? (
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
                    href={liveData.megaPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
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
                <div className="flex items-center gap-3">
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
                    status === "debt" && "text-red-600 animate-pulse",
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

      {/* MODAL DE EDICIÓN */}
      {showEditForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-foreground mb-6">Editar Post</h2>

            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium">Nombre Cliente</label>
                <Input
                  value={editForm.clientName}
                  onChange={(e) => handleFieldChange('clientName', e.target.value)}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium">Nombre Post</label>
                <Input
                  value={editForm.postName}
                  onChange={(e) => handleFieldChange('postName', e.target.value)}
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium">Edad</label>
                <select
                  value={editForm.age}
                  onChange={(e) => handleFieldChange('age', e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-input px-3"
                >
                  <option value="">-- No cambiar --</option>
                  {Array.from({ length: 82 }, (_, i) => i + 18).map((age) => (
                    <option key={age} value={age}>{age}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium">Headline</label>
                <Input
                  value={editForm.headline}
                  onChange={(e) => handleFieldChange('headline', e.target.value)}
                  maxLength={250}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium">Body</label>
                <textarea
                  value={editForm.body}
                  onChange={(e) => handleFieldChange('body', e.target.value)}
                  rows={6}
                  maxLength={2000}
                  className="w-full rounded-md border border-border bg-input p-3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 text-sm font-medium">City</label>
                  <div className="flex gap-2">
                    <Input
                      value={editForm.city}
                      readOnly
                    />
                    <Button
                      type="button"
                      onClick={() => setShowCitySelector(true)}
                    >
                      Cambiar
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium">Location</label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <Button
                onClick={handleSaveAllEdits}
                disabled={actionLoading}
                className="flex-1"
              >
                {actionLoading ? "Guardando..." : "✅ Guardar Cambios"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  userIsEditingRef.current = false;
                  setShowEditForm(false);
                  setEditForm({ clientName: "", postName: "", age: "", headline: "", body: "", city: "", location: "" });
                }}
                disabled={actionLoading}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CAPTCHA */}
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
                
                <Button
                  onClick={handleCaptchaRefresh}
                  disabled={captchaRefreshing || actionLoading}
                  variant="ghost"
                  className="mt-3"
                >
                  {captchaRefreshing ? "Refrescando..." : "🔄 Cambiar Captcha"}
                </Button>
              </div>
            )}

            <div className="space-y-4">
              <Input
                type="text"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !captchaSubmitting && handleCaptchaSubmit()}
                placeholder="Escribe el código"
                className="text-center font-mono text-xl h-14"
                autoFocus
                disabled={captchaSubmitting}
              />
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                onClick={handleCaptchaSubmit}
                disabled={captchaSubmitting || !captchaCode.trim()}
                className="flex-1 h-12"
              >
                {captchaSubmitting ? "Enviando..." : "✅ Enviar"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCaptchaCancel}
                disabled={captchaSubmitting}
                className="flex-1 h-12"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showNotificationSettings && (
        <NotificationSettings
          postId={postId}
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
