"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData, type SearchResult } from "@/lib/firebase";
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

export function Dashboard({ searchResult, onClose }: DashboardProps) {
  const [liveData, setLiveData] = useState(searchResult);
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
  const previousEditInProgressRef = useRef<boolean>(false);
  const lastActionTimeRef = useRef<number>(0);
  const lastSuccessMessageTimeRef = useRef<number>(0);
  const userIsEditingRef = useRef(false);

  const browserName = liveData.browserName;
  const postId = liveData.type === "multi" ? liveData.postId : undefined;
  const isPaused = liveData.isPaused ?? false;
  const republishStatus = liveData.republishStatus;
  const rentalRemaining = liveData.rentalRemaining;
  const clientName = liveData.clientName || "Sin nombre";
  const phoneNumber = liveData.phoneNumber || "N/A";
  const city = liveData.city || "N/A";
  const location = liveData.location || "N/A";
  const postName = liveData.postName;
  const postUrl = liveData.type === "multi" && liveData.postData ? liveData.postData.postUrl : liveData.fullData.postUrl;
  const postIdCaptured = liveData.type === "multi" && liveData.postData ? liveData.postData.postIdCapturedAt : liveData.fullData.postIdCapturedAt;
  
  const name = liveData.type === "multi" && liveData.postData ? liveData.postData.name : liveData.fullData.name;
  const age = liveData.type === "multi" && liveData.postData ? liveData.postData.age : liveData.fullData.age;
  const headline = liveData.type === "multi" && liveData.postData ? liveData.postData.headline : liveData.fullData.headline;
  const body = liveData.type === "multi" && liveData.postData ? liveData.postData.body : liveData.fullData.body;
  
  const editInProgress = liveData.fullData.editInProgress;
  const editLog = liveData.fullData.editLog;
  const editLogType = liveData.fullData.editLogType;
  const captchaWaiting = liveData.fullData.captchaWaiting;
  const captchaImage = liveData.fullData.captchaImage;
  const manuallyCreated = liveData.fullData.manuallyCreated;
  
  const canEdit = !editInProgress;

  // Manejo del historial del navegador para el modal principal
  useEffect(() => {
    // Agregar entrada al historial cuando se monta el componente
    window.history.pushState({ modalOpen: true }, '');

    const handlePopState = (event: PopStateEvent) => {
      // Si el usuario presiona atrás y el modal está abierto, cerrarlo
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  useEffect(() => {
    if (!republishStatus || isPaused) return;

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
  }, [republishStatus?.remainingSeconds, isPaused]);

  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(
      browserName,
      (newData) => {
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
          // Limpiar el historial si existe la entrada
          setTimeout(() => {
            if (window.history.state?.captchaFormOpen) {
              window.history.back();
            }
          }, 100);
        }

        if (modalManuallyControlledRef.current) {
          return;
        }

        if (newData.captchaWaiting && !showCaptchaForm) {
          setShowCaptchaForm(true);
          modalManuallyControlledRef.current = true;
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
      }
    );

    return () => unsubscribe();
  }, [browserName, showCaptchaForm, liveData.type, liveData.postId]);

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
    const isEditingNow = editInProgress;

    if (wasEditing && !isEditingNow) {
      setShowSavedMessage(true);
      setTimeout(() => {
        setShowSavedMessage(false);
      }, 5000);
    }

    previousEditInProgressRef.current = isEditingNow;
  }, [editInProgress]);

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
    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    debounce(async () => {
      const newPauseState = !isPaused;
      
      setLiveData(prev => ({ ...prev, isPaused: newPauseState }));
      setActionLoading(true);
      commandInProgressRef.current = true;

      try {
        const result = await FirebaseAPI.togglePausePost(
          browserName,
          postId,
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
  }, [isPaused, browserName, postId, debounce, actionLoading]);

  const handleRepublish = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading || isPaused) {
      return;
    }

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
      } catch (error) {
        alert('Error al forzar republicacion');
      } finally {
        setTimeout(() => {
          setActionLoading(false);
          commandInProgressRef.current = false;
        }, 1000);
      }
    });
  }, [browserName, debounce, actionLoading, isPaused]);

  const handleOpenEditor = () => {
    userIsEditingRef.current = false;
    
    setEditForm({
      name: name || "",
      age: age ? String(age) : "",
      headline: headline || "",
      body: body || "",
      city: city || "",
      location: location || "",
    });
    
    setShowEditForm(true);
  };

  // Manejo del historial del navegador para el modal de edición
  useEffect(() => {
    if (!showEditForm) return;

    // Agregar entrada al historial cuando se abre el modal de edición
    window.history.pushState({ editFormOpen: true }, '');

    const handlePopState = () => {
      // Solo cerrar si el modal aún está abierto
      if (showEditForm) {
        setShowEditForm(false);
        setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showEditForm]);

  // Manejo del historial del navegador para el modal de captcha
  useEffect(() => {
    if (!showCaptchaForm) return;

    // Agregar entrada al historial cuando se abre el modal de captcha
    window.history.pushState({ captchaFormOpen: true }, '');

    const handlePopState = () => {
      // Solo cerrar si el modal aún está abierto
      if (showCaptchaForm) {
        setShowCaptchaForm(false);
        setCaptchaCode("");
        modalManuallyControlledRef.current = false;
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showCaptchaForm]);

  const handleFieldChange = (field: keyof typeof editForm, value: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCitySelect = (city: string) => {
    userIsEditingRef.current = true;
    setEditForm(prev => ({ ...prev, city }));
  };

  const handleSaveAllEdits = async () => {
    if (!canEdit) {
      return;
    }

    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    const changes: Record<string, string> = {};
    
    if (editForm.name.trim() && editForm.name.trim() !== (name || "")) {
      changes.name = editForm.name.trim();
    }
    if (editForm.age.trim() && editForm.age.trim() !== String(age || "")) {
      changes.age = editForm.age.trim();
    }
    if (editForm.headline.trim() && editForm.headline.trim() !== (headline || "")) {
      changes.headline = editForm.headline.trim();
    }
    if (editForm.body.trim() && editForm.body.trim() !== (body || "")) {
      changes.body = editForm.body.trim();
    }
    if (editForm.city.trim() && editForm.city.trim() !== (city || "")) {
      changes.city = editForm.city.trim();
    }
    if (editForm.location.trim() && editForm.location.trim() !== (location || "")) {
      changes.location = editForm.location.trim();
    }

    if (Object.keys(changes).length === 0) {
      alert("No has realizado ningun cambio. Modifica los campos que quieras actualizar.");
      return;
    }

    if (changes.age) {
      const ageNum = Number.parseInt(changes.age);
      if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 99) {
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
      const payload: Record<string, any> = { changes };
      if (postId) {
        payload.postId = postId;
      }

      const result = await FirebaseAPI.sendCommand(
        browserName,
        "edit_multiple_fields",
        payload
      );

      if (result.success) {
        alert("Edicion iniciada. El sistema procesara los cambios automaticamente.");
        userIsEditingRef.current = false;
        setShowEditForm(false);
        setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
        // Limpiar el historial después de un pequeño delay
        setTimeout(() => {
          if (window.history.state?.editFormOpen) {
            window.history.back();
          }
        }, 100);
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
      alert("Escribe el codigo de seguridad");
      return;
    }

    if (captchaSubmitting || commandInProgressRef.current || actionLoading) {
      return;
    }

    setCaptchaSubmitting(true);
    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        browserName,
        "submit_captcha",
        { code: captchaCode.trim() }
      );

      if (result.success) {
        setShowCaptchaForm(false);
        setCaptchaCode("");
        modalManuallyControlledRef.current = false;
        // Limpiar el historial después de un pequeño delay
        setTimeout(() => {
          if (window.history.state?.captchaFormOpen) {
            window.history.back();
          }
        }, 100);
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
    // Limpiar el historial después de un pequeño delay
    setTimeout(() => {
      if (window.history.state?.captchaFormOpen) {
        window.history.back();
      }
    }, 100);
  };

  const handleCaptchaRefresh = async () => {
    if (captchaRefreshing || actionLoading || commandInProgressRef.current) {
      return;
    }

    try {
      setCaptchaRefreshing(true);
      commandInProgressRef.current = true;

      await FirebaseAPI.sendCommand(browserName, "refresh_captcha", {});

      setTimeout(() => {
        setCaptchaRefreshing(false);
        commandInProgressRef.current = false;
      }, 5000);

    } catch (error) {
      setCaptchaRefreshing(false);
      commandInProgressRef.current = false;
    }
  };

  const progressPercent = republishStatus
    ? (republishStatus.elapsedSeconds / republishStatus.totalSeconds) * 100
    : 0;

  const status = getRentalStatus(rentalRemaining);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 p-2 sm:p-4 backdrop-blur-md">
        <div className="relative my-4 sm:my-8 w-full max-w-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />
          
          {/* NUEVO: Botón Atrás en la parte superior */}
          <div className="border-b border-border/50 px-4 sm:px-6 py-3 sm:py-4">
            <Button 
              variant="ghost" 
              onClick={() => {
                window.history.back();
              }} 
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-xl px-3 sm:px-4 py-2 h-auto text-sm sm:text-base"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="sm:w-5 sm:h-5"
              >
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span className="font-semibold">Atrás</span>
            </Button>
          </div>

          {/* Sección de información del usuario */}
          <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-6 border-b border-border/50">
            <div
              className={cn(
                "relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl shadow-lg flex-shrink-0",
                isPaused 
                  ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10" 
                  : "bg-gradient-to-br from-primary/20 to-accent/20 shadow-primary/10"
              )}
            >
              <div className={cn(
                "absolute inset-0 rounded-xl sm:rounded-2xl opacity-50",
                isPaused ? "animate-pulse bg-yellow-500/10" : "animate-pulse bg-primary/10"
              )} />
              <div
                className={cn(
                  "relative h-4 w-4 sm:h-4 sm:w-4 rounded-full shadow-lg",
                  isPaused 
                    ? "bg-yellow-400 shadow-yellow-400/50" 
                    : "animate-pulse bg-green-400 shadow-green-400/50"
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                {clientName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold border",
                    isPaused 
                      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" 
                      : "bg-green-500/10 text-green-400 border-green-500/20"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isPaused ? "bg-yellow-400" : "animate-pulse bg-green-400"
                  )} />
                  {isPaused ? "Pausado" : "Activo"}
                </span>
                {editInProgress && (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold text-primary border border-primary/20">
                    <span className="h-1.5 w-1.5 animate-spin rounded-full border border-primary border-t-transparent" />
                    Editando
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            
            {(() => {
              const isDebt = rentalRemaining && 
                           (rentalRemaining.days < 0 || 
                            (rentalRemaining as any).isDebt === true);
              
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
                      <h3 className="font-black text-xl sm:text-2xl text-red-400 mb-1 sm:mb-2">
                        CUENTA VENCIDA
                      </h3>
                      <p className="text-lg sm:text-xl font-bold text-red-300 mb-0.5 sm:mb-1">
                        Deuda de {debtTime} de atraso
                      </p>
                      <p className="text-xs sm:text-sm text-red-200">
                        Tu anuncio sera eliminado automaticamente si no renuevas
                      </p>
                    </div>
                    
                    <a 
                      href={`https://wa.me/18293837695?text=${encodeURIComponent(
                        `🚨 URGENTE: Renovar ${clientName} - Tengo ${debtTime} de deuda`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-6 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl font-black text-base sm:text-lg bg-gradient-to-r from-red-600 to-red-700 text-white hover:scale-105 transition-all duration-200 shadow-2xl shadow-red-600/50 border-2 border-red-400 text-center"
                    >
                      RENOVAR AHORA
                    </a>
                  </div>
                  
                  <div className="bg-black/40 rounded-lg sm:rounded-xl p-3 sm:p-4 border-2 border-red-500/50">
                    <p className="text-center text-red-300 font-bold text-sm sm:text-base">
                      Si no pagas en las proximas 48 horas perderas tu anuncio para siempre
                    </p>
                  </div>
                </div>
              );
            })()}

            {editLog && (
              <div
                className={cn(
                  "rounded-lg sm:rounded-xl border p-3 sm:p-4",
                  editLogType === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                  editLogType === "success" && "border-accent/30 bg-accent/10 text-accent",
                  editLogType === "info" && "border-primary/30 bg-primary/10 text-primary",
                  editLogType === "warning" && "border-orange-500/30 bg-orange-500/10 text-orange-400"
                )}
              >
                <p className="text-center text-sm font-medium">{editLog}</p>
              </div>
            )}

            {!manuallyCreated && (
              <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
                <h3 className="mb-2 sm:mb-3 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Informacion
                </h3>
                <div className="grid gap-1.5 sm:gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefono</span>
                    <span className="font-medium text-foreground">{phoneNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ciudad</span>
                    <span className="font-medium text-foreground">{city}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ubicacion</span>
                    <span className="font-medium text-foreground">{location}</span>
                  </div>
                </div>
              </div>
            )}

            {postUrl ? (
              <div className="rounded-lg sm:rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 p-4 sm:p-5 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(236,72,153,0.1),transparent)]" />
                
                <div className="relative">
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 flex-shrink-0">
                      <span className="text-xl sm:text-2xl">👁️</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-foreground text-base sm:text-lg">Tu Anuncio en Vivo</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground">Asi lo ven tus clientes</p>
                    </div>
                  </div>
                  
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block w-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 text-white py-3 sm:py-4 rounded-lg sm:rounded-xl font-bold text-center hover:scale-105 transition-all duration-200 shadow-lg shadow-primary/50 text-base sm:text-lg"
                  >
                    Ver Mi Anuncio Ahora
                  </a>
                  
                  {postIdCaptured && (
                    <p className="text-xs text-center text-muted-foreground mt-2 sm:mt-3">
                      Actualizado {new Date(postIdCaptured).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg sm:rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 sm:p-5 backdrop-blur-sm">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg sm:text-xl">⚠️</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-yellow-400 text-sm sm:text-base">Anuncio No Sincronizado</h4>
                    <p className="text-xs sm:text-sm text-yellow-300/80">
                      El link se capturara en la proxima republicacion
                    </p>
                  </div>
                </div>
              </div>
            )}

            {republishStatus && (
              <div className={cn("rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4", isPaused && "opacity-60")}>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    {showSavedMessage
                      ? "Guardado"
                      : editInProgress
                        ? "Editando"
                        : (republishStatus.remainingSeconds <= 0 && !showSuccessMessage)
                          ? "Republicacion"
                          : showSuccessMessage
                            ? "Exitoso"
                            : "Proximo Anuncio"}
                  </h3>
                  {isPaused && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      Pausado
                    </span>
                  )}
                </div>

                <div className="mb-3 sm:mb-4 text-center">
                  <div className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                    {showSavedMessage ? (
                      <span className="text-accent text-2xl sm:text-3xl">Cambios guardados</span>
                    ) : editInProgress ? (
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <span className="text-primary text-2xl sm:text-3xl">Editando...</span>
                        {republishStatus && republishStatus.remainingSeconds > 0 && (
                          <span className="text-lg sm:text-xl text-muted-foreground">
                            Se publicara en {formatTime(republishStatus.remainingSeconds)}
                          </span>
                        )}
                      </div>
                    ) : (republishStatus.remainingSeconds <= 0 && !showSuccessMessage) ? (
                      <span className="text-accent text-2xl sm:text-3xl">Completada</span>
                    ) : showSuccessMessage ? (
                      <span className="text-accent text-2xl sm:text-3xl">Completado</span>
                    ) : isPaused ? (
                      <span className="text-warning text-2xl sm:text-3xl">En Pausa</span>
                    ) : (
                      formatTime(republishStatus.remainingSeconds)
                    )}
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      (republishStatus.remainingSeconds <= 0 && !showSuccessMessage)
                        ? "bg-gradient-to-r from-green-500 to-emerald-500"
                        : "bg-gradient-to-r from-primary to-accent"
                    )}
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tiempo de Renta</span>
                <span
                  className={cn(
                    "text-lg sm:text-xl font-bold",
                    status === "healthy" && "text-accent",
                    status === "caution" && "text-chart-4",
                    status === "warning" && "text-warning",
                    status === "critical" && "text-destructive",
                    status === "debt" && "text-red-600 animate-pulse",
                    status === "neutral" && "text-muted-foreground"
                  )}
                >
                  {formatRentalTime(rentalRemaining)}
                </span>
              </div>
            </div>

            <div className="rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Controles</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Button
                  onClick={handleTogglePause}
                  disabled={actionLoading || commandInProgressRef.current}
                  className={cn(
                    "flex h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 text-sm",
                    isPaused
                      ? "bg-accent/10 text-accent hover:bg-accent/20"
                      : "bg-warning/10 text-warning hover:bg-warning/20"
                  )}
                >
                  {isPaused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
                  <span className="text-xs">{isPaused ? "Reanudar" : "Pausar"}</span>
                </Button>

                <Button
                  onClick={handleRepublish}
                  disabled={actionLoading || isPaused || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-1.5 sm:gap-2 bg-primary/10 py-3 sm:py-4 text-primary hover:bg-primary/20 text-sm"
                >
                  <RefreshIcon className="h-5 w-5" />
                  <span className="text-xs">Republicar</span>
                </Button>

                <Button
                  onClick={handleOpenEditor}
                  disabled={actionLoading || !canEdit || commandInProgressRef.current}
                  className={cn(
                    "flex h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 text-sm",
                    !canEdit 
                      ? "bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-chart-4/10 text-chart-4 hover:bg-chart-4/20"
                  )}
                  title={!canEdit ? "" : "Editar"}
                >
                  <EditIcon className="h-5 w-5" />
                  <span className="text-xs">
                    {!canEdit ? "Ocupado" : "Editar"}
                  </span>
                </Button>

                <Button
                  onClick={() => setShowNotificationSettings(true)}
                  className="col-span-3 flex h-auto flex-col gap-1.5 sm:gap-2 bg-blue-500/10 py-3 sm:py-4 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30"
                >
                  <span className="text-xl sm:text-2xl">🔔</span>
                  <span className="text-xs">Configurar Notificaciones</span>
                </Button>
              </div>
            </div>

            <Button onClick={() => window.history.back()} variant="outline" className="w-full bg-transparent h-12 sm:h-14 text-sm sm:text-base">
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {showEditForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-2 sm:p-4 backdrop-blur-sm">
          <div 
            className="my-4 sm:my-8 w-full max-w-2xl shadow-2xl max-h-[95vh] overflow-y-auto relative"
            style={{
              background: 'linear-gradient(180deg, #E6C9E6 0%, #D4A5D4 20%, #C28AC2 40%, #B06FB0 60%, #9E549E 80%, #8C398C 100%)',
              borderRadius: '0 0 16px 16px',
              border: 'none'
            }}
          >
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '20px',
                background: 'linear-gradient(90deg, #FF69B4 0%, #FF1493 50%, #FF69B4 100%)',
                borderRadius: '16px 16px 0 0',
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

            <div 
              className="text-center pt-6 pb-2"
              style={{
                background: 'linear-gradient(180deg, rgba(255,105,180,0.3) 0%, transparent 100%)',
                marginTop: '20px'
              }}
            >
              <h1 
                style={{
                  fontSize: 'clamp(24px, 5vw, 32px)',
                  fontWeight: 'bold',
                  color: '#E8E8E8',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                  letterSpacing: '2px',
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'
                }}
              >
                MegaPersonals
              </h1>
              <p 
                style={{
                  fontSize: '10px',
                  color: '#E8E8E8',
                  marginTop: '-5px',
                  letterSpacing: '2px'
                }}
              >
                personals classifieds
              </p>
            </div>

            <div className="relative" style={{ padding: '15px 20px 25px 20px' }}>
              
              <div 
                className="absolute pointer-events-none hidden sm:block"
                style={{
                  top: '-60px',
                  left: '20px',
                  width: '300px',
                  height: '250px',
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

              <div className="text-center mb-4 sm:mb-6 relative z-20">
                <h2 
                  style={{
                    fontSize: 'clamp(24px, 6vw, 36px)',
                    fontWeight: 900,
                    color: '#FFFF00',
                    textShadow: '3px 3px 6px rgba(0,0,0,0.8), -1px -1px 3px rgba(0,0,0,0.5)',
                    fontFamily: 'Arial Black, system-ui, sans-serif',
                    letterSpacing: '1px'
                  }}
                >
                  Tutorial de Edicion
                </h2>
                <p 
                  style={{
                    fontSize: 'clamp(13px, 3vw, 16px)',
                    color: '#FFFFFF',
                    marginTop: '8px',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    fontFamily: 'system-ui, sans-serif'
                  }}
                >
                  Sigue estos pasos para editar tu anuncio
                </p>
              </div>

              <div 
                className="mb-4 sm:mb-6 p-3 sm:p-5 relative z-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '12px',
                  border: '2px solid #FF69B4',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
              >
                <h3 
                  style={{
                    fontSize: 'clamp(16px, 4vw, 20px)',
                    fontWeight: 'bold',
                    color: '#8C398C',
                    marginBottom: '12px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, sans-serif'
                  }}
                >
                  Instrucciones
                </h3>
                <ol 
                  style={{
                    fontSize: 'clamp(13px, 3vw, 15px)',
                    color: '#333333',
                    lineHeight: '1.6',
                    paddingLeft: '20px',
                    fontFamily: 'system-ui, sans-serif'
                  }}
                >
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 1 - </strong> Cambia SOLO los campos que quieras actualizar
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 2 - </strong> Si NO quieres cambiar un campo dejalo como esta
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 3 - </strong> Haz click en Guardar Cambios
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 4 - </strong> El sistema procesara automaticamente
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 5 - </strong> Aparecera una ventana con codigo de seguridad
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong style={{ color: '#8C398C' }}>Paso 6 - </strong> Escribe el codigo y presiona Enviar UNA SOLA VEZ
                  </li>
                  <li>
                    <strong style={{ color: '#8C398C' }}>Paso 7 - </strong> Listo La ventana se cerrara automaticamente
                  </li>
                </ol>
                
                <div 
                  style={{
                    marginTop: '15px',
                    padding: '12px',
                    background: '#FFF3CD',
                    border: '2px solid #FFC107',
                    borderRadius: '8px'
                  }}
                >
                  <p 
                    style={{
                      fontSize: 'clamp(12px, 3vw, 14px)',
                      color: '#856404',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      margin: 0,
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    MUY IMPORTANTE - Cuando aparezca el captcha presiona Enviar UNA SOLA VEZ. La ventana se cerrara automaticamente en segundos. NO hagas click multiples veces. Ten paciencia
                  </p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4 relative z-20">
                
                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: 'clamp(13px, 3vw, 15px)',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    Name/Alias
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    maxLength={50}
                    placeholder="Ejemplo Sofia"
                    style={{
                      width: '100%',
                      height: '42px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 12px',
                      fontSize: 'clamp(14px, 3.5vw, 15px)',
                      color: '#555555',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  />
                  {editForm.name && (
                    <p style={{ marginTop: '4px', fontSize: '11px', color: '#FFFFFF' }}>
                      {editForm.name.length}/50 caracteres
                    </p>
                  )}
                </div>

                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: 'clamp(13px, 3vw, 15px)',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    Age
                  </label>
                  <select
                    value={editForm.age}
                    onChange={(e) => handleFieldChange('age', e.target.value)}
                    style={{
                      width: '100%',
                      height: '42px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 12px',
                      fontSize: 'clamp(14px, 3.5vw, 15px)',
                      color: '#555555',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    <option value="">No cambiar</option>
                    {Array.from({ length: 82 }, (_, i) => i + 18).map((age) => (
                      <option key={age} value={age}>
                        {age}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: 'clamp(13px, 3vw, 15px)',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    Headline
                  </label>
                  <input
                    type="text"
                    value={editForm.headline}
                    onChange={(e) => handleFieldChange('headline', e.target.value)}
                    maxLength={250}
                    placeholder="Ejemplo SEXY COLOMBIANA"
                    style={{
                      width: '100%',
                      height: '42px',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 12px',
                      fontSize: 'clamp(14px, 3.5vw, 15px)',
                      color: '#555555',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  />
                  {editForm.headline && (
                    <p style={{ marginTop: '4px', fontSize: '11px', color: '#FFFFFF' }}>
                      {editForm.headline.length}/250 caracteres
                    </p>
                  )}
                </div>

                <div>
                  <label 
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: 'clamp(13px, 3vw, 15px)',
                      fontWeight: 'bold',
                      color: '#FFFF00',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                      fontFamily: 'system-ui, sans-serif'
                    }}
                  >
                    Body
                  </label>
                  <textarea
                    value={editForm.body}
                    onChange={(e) => handleFieldChange('body', e.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder="Ejemplo Hola soy muy caliente..."
                    style={{
                      width: '100%',
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #888888',
                      borderRadius: '5px',
                      padding: '10px 12px',
                      fontSize: 'clamp(14px, 3.5vw, 15px)',
                      color: '#555555',
                      fontFamily: 'system-ui, sans-serif',
                      resize: 'none'
                    }}
                  />
                  {editForm.body && (
                    <p style={{ marginTop: '4px', fontSize: '11px', color: '#FFFFFF' }}>
                      {editForm.body.length}/2000 caracteres
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label 
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: 'clamp(13px, 3vw, 15px)',
                        fontWeight: 'bold',
                        color: '#FFFF00',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: 'system-ui, sans-serif'
                      }}
                    >
                      City
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editForm.city}
                        readOnly
                        style={{
                          flex: 1,
                          height: '42px',
                          backgroundColor: '#FFFFFF',
                          border: '2px solid #888888',
                          borderRadius: '5px',
                          padding: '10px 12px',
                          fontSize: 'clamp(14px, 3.5vw, 15px)',
                          color: '#555555',
                          fontFamily: 'system-ui, sans-serif'
                        }}
                      />
                      <Button
                        type="button"
                        onClick={() => setShowCitySelector(true)}
                        style={{
                          height: '42px',
                          background: 'linear-gradient(135deg, #FF8C00 0%, #FFA500 100%)',
                          border: '2px solid #FF8C00',
                          borderRadius: '5px',
                          color: '#FFFFFF',
                          fontWeight: 'bold',
                          padding: '0 16px',
                          fontSize: 'clamp(12px, 3vw, 14px)',
                          cursor: 'pointer',
                          fontFamily: 'system-ui, sans-serif',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label 
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: 'clamp(13px, 3vw, 15px)',
                        fontWeight: 'bold',
                        color: '#FFFF00',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                        fontFamily: 'system-ui, sans-serif'
                      }}
                    >
                      Location/Area
                    </label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => handleFieldChange('location', e.target.value)}
                      maxLength={100}
                      placeholder="Ejemplo Downtown"
                      style={{
                        width: '100%',
                        height: '42px',
                        backgroundColor: '#FFFFFF',
                        border: '2px solid #888888',
                        borderRadius: '5px',
                        padding: '10px 12px',
                        fontSize: 'clamp(14px, 3.5vw, 15px)',
                        color: '#555555',
                        fontFamily: 'system-ui, sans-serif'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 sm:mt-8 flex flex-col gap-3 sm:gap-4 relative z-20">
                <Button
                  onClick={handleSaveAllEdits}
                  disabled={actionLoading || !canEdit || commandInProgressRef.current}
                  style={{
                    width: '100%',
                    height: '50px',
                    background: (!canEdit || actionLoading) 
                      ? '#666666' 
                      : 'linear-gradient(135deg, #00C853 0%, #00E676 100%)',
                    border: (!canEdit || actionLoading) 
                      ? '2px solid #555555' 
                      : '2px solid #00C853',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: 'clamp(15px, 4vw, 18px)',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                    cursor: (!canEdit || actionLoading) ? 'not-allowed' : 'pointer',
                    fontFamily: 'Arial Black, system-ui, sans-serif',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    opacity: (!canEdit || actionLoading) ? 0.5 : 1
                  }}
                >
                  {actionLoading ? "Guardando..." : !canEdit ? "Ocupado..." : "Guardar Cambios"}
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await FirebaseAPI.sendCommand(
                        browserName,
                        "cancel_edit",
                        {}
                      );
                    } catch (error) {
                      console.error('Error sending cancel command', error);
                    }
                    
                    userIsEditingRef.current = false;
                    setShowEditForm(false);
                    setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
                    // Limpiar el historial después de un pequeño delay
                    setTimeout(() => {
                      if (window.history.state?.editFormOpen) {
                        window.history.back();
                      }
                    }, 100);
                  }}
                  disabled={actionLoading || commandInProgressRef.current}
                  style={{
                    width: '100%',
                    height: '50px',
                    background: '#666666',
                    border: '2px solid #555555',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: 'clamp(15px, 4vw, 18px)',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'Arial Black, system-ui, sans-serif',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                  }}
                >
                  Cancelar
                </Button>
              </div>

              <div 
                className="mt-4 sm:mt-6 p-3 sm:p-4 relative z-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '10px',
                  border: '2px solid #00E676',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                }}
              >
                <p 
                  style={{
                    fontSize: 'clamp(12px, 3vw, 14px)',
                    color: '#333333',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    margin: 0,
                    fontFamily: 'system-ui, sans-serif'
                  }}
                >
                  Recuerda Solo cambia los campos que quieras actualizar
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCaptchaForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl sm:rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
            <h3 className="mb-4 sm:mb-6 text-center text-2xl sm:text-3xl font-bold text-foreground">Codigo de Seguridad</h3>

            {captchaImage && (
              <div className="mb-4 sm:mb-6 text-center">
                <img
                  src={captchaImage}
                  alt="Captcha"
                  className="mx-auto max-w-full rounded-lg sm:rounded-xl border border-border"
                />
                
                <Button
                  onClick={handleCaptchaRefresh}
                  disabled={captchaRefreshing || actionLoading || commandInProgressRef.current}
                  variant="ghost"
                  className="mt-2 sm:mt-3 text-muted-foreground hover:text-foreground text-sm"
                >
                  {captchaRefreshing ? (
                    <>
                      <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Refrescando...
                    </>
                  ) : (
                    <>
                      Cambiar Captcha
                    </>
                  )}
                </Button>
                
                {captchaRefreshing && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Espera 5 segundos antes de refrescar nuevamente
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="mb-2 block text-center text-sm font-medium text-muted-foreground">
                  Escribe los caracteres
                </label>
                <Input
                  type="text"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !captchaSubmitting && !actionLoading && !commandInProgressRef.current && handleCaptchaSubmit()
                  }
                  placeholder="Ejemplo 3uK"
                  className="bg-input text-center font-mono text-lg sm:text-xl text-foreground h-14 sm:h-16"
                  autoFocus
                  disabled={captchaSubmitting || actionLoading || commandInProgressRef.current}
                />
              </div>
            </div>

            <div className="mt-4 sm:mt-6 flex flex-col gap-2 sm:gap-3">
              <Button
                onClick={handleCaptchaSubmit}
                disabled={captchaSubmitting || actionLoading || !captchaCode.trim() || commandInProgressRef.current}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 sm:h-14 text-sm sm:text-base"
              >
                {captchaSubmitting || actionLoading ? "Enviando..." : "Enviar"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCaptchaCancel}
                disabled={captchaSubmitting || actionLoading || commandInProgressRef.current}
                className="w-full bg-transparent h-12 sm:h-14 text-sm sm:text-base"
              >
                Cancelar
              </Button>
            </div>

            <p className="mt-3 sm:mt-4 text-center text-xs sm:text-sm text-muted-foreground">
              {captchaSubmitting ? "Procesando NO hagas click nuevamente" : "Presiona Enviar UNA SOLA VEZ"}
            </p>
          </div>
        </div>
      )}

      {showNotificationSettings && (
        <NotificationSettings
          browserName={browserName}
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
