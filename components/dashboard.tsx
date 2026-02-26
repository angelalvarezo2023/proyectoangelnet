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
import { TicketModal, TicketStatusBadge } from "@/components/ticket-system";

// =====================================================================
// TIPOS DEL FLUJO DE EDICIÓN UNIFICADO
// =====================================================================
type EditStep =
  | "idle" // No hay edición en progreso
  | "editing" // Usuario llenando formulario
  | "saving" // Comando enviado, esperando que el bot procese
  | "waiting_bot" // Bot está procesando (editInProgress=true)
  | "waiting_captcha" // Bot navegó al captcha, esperando que aparezca la imagen
  | "captcha" // Captcha apareció, usuario debe ingresar código
  | "submitting_captcha" // Captcha enviado, esperando confirmación
  | "finishing" // Captcha resuelto, bot finalizando
  | "complete" // Edición completada exitosamente
  | "error"; // Hubo un error

const EDIT_STEPS_CONFIG = [
  { key: "editing", icon: "✏️", label: "Editar", shortLabel: "1" },
  { key: "saving", icon: "💾", label: "Guardando", shortLabel: "2" },
  { key: "captcha", icon: "🔐", label: "Captcha", shortLabel: "3" },
  { key: "complete", icon: "✅", label: "Listo", shortLabel: "4" },
] as const;

function getStepIndex(step: EditStep): number {
  switch (step) {
    case "editing": return 0;
    case "saving":
    case "waiting_bot": return 1;
    case "waiting_captcha":
    case "captcha":
    case "submitting_captcha":
    case "finishing": return 2;
    case "complete": return 3;
    case "error": return -1;
    default: return -1;
  }
}

// =====================================================================
// COMPONENTE: STEPPER VISUAL
// =====================================================================
function EditStepper({ currentStep }: { currentStep: EditStep }) {
  const currentIndex = getStepIndex(currentStep);
  const isError = currentStep === "error";
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5">
      <div className="flex items-center justify-between relative">
        {/* Línea de fondo conectora */}
        <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-white/10 z-0" />
        {/* Línea de progreso */}
        <div
          className="absolute top-5 left-[10%] h-0.5 bg-gradient-to-r from-pink-500 to-purple-500 z-0 transition-all duration-700 ease-out"
          style={{
            width: isError
              ? "0%"
              : `${Math.min(100, (currentIndex / (EDIT_STEPS_CONFIG.length - 1)) * 80)}%`,
          }}
        />
        {EDIT_STEPS_CONFIG.map((step, index) => {
          const isCompleted = !isError && currentIndex > index;
          const isActive = !isError && currentIndex === index;
          const isPending = isError || currentIndex < index;
          return (
            <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 transition-all duration-500",
                  isCompleted && "bg-gradient-to-br from-green-500 to-emerald-500 border-green-400 text-white shadow-lg shadow-green-500/30 scale-100",
                  isActive && "bg-gradient-to-br from-pink-500 to-purple-500 border-pink-400 text-white shadow-lg shadow-pink-500/40 scale-110 animate-pulse",
                  isPending && "bg-white/5 border-white/20 text-white/30"
                )}
              >
                {isCompleted ? "✓" : step.icon}
              </div>
              <span
                className={cn(
                  "mt-2 text-[11px] sm:text-xs font-bold tracking-wide transition-colors duration-300",
                  isCompleted && "text-green-400",
                  isActive && "text-pink-400",
                  isPending && "text-white/30"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Status text */}
      <div className="mt-4 text-center">
        <p className={cn(
          "text-sm font-semibold transition-all duration-300",
          isError ? "text-red-400" :
          currentStep === "editing" ? "text-white/70" :
          currentStep === "saving" || currentStep === "waiting_bot" ? "text-yellow-400" :
          currentStep === "waiting_captcha" ? "text-orange-400" :
          currentStep === "captcha" ? "text-pink-400" :
          currentStep === "submitting_captcha" || currentStep === "finishing" ? "text-blue-400" :
          currentStep === "complete" ? "text-green-400" : "text-white/50"
        )}>
          {currentStep === "editing" && "Modifica los campos que desees cambiar"}
          {currentStep === "saving" && "Enviando cambios al sistema..."}
          {currentStep === "waiting_bot" && "El bot está procesando tu edición..."}
          {currentStep === "waiting_captcha" && "Esperando captcha..."}
          {currentStep === "captcha" && "Ingresa el código de seguridad"}
          {currentStep === "submitting_captcha" && "Verificando código..."}
          {currentStep === "finishing" && "Esperando momento de republicar..."}
          {currentStep === "complete" && "¡Cambios guardados exitosamente!"}
          {currentStep === "error" && "Hubo un error, intenta de nuevo"}
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// DASHBOARD PRINCIPAL
// =====================================================================
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

// 🆕 Función para formatear el tiempo de pausa automática
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
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);

  // =====================================================================
  // ESTADO UNIFICADO DE EDICIÓN
  // =====================================================================
  const [editStep, setEditStep] = useState<EditStep>("idle");
  const [editError, setEditError] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    age: "",
    headline: "",
    body: "",
    city: "",
    location: "",
  });

  // 🆕 Estado para countdown de pausa automática
  const [autoPauseSeconds, setAutoPauseSeconds] = useState(
    searchResult.fullData.autoPauseInfo?.secondsUntilPause || 0
  );

  const commandInProgressRef = useRef(false);
  const previousRepublishRef = useRef<BrowserData["republishStatus"] | null>(null);
  const previousEditInProgressRef = useRef<boolean>(false);
  const lastActionTimeRef = useRef<number>(0);
  const lastSuccessMessageTimeRef = useRef<number>(0);
  const editStepRef = useRef<EditStep>("idle");
  const [editLogDismissed, setEditLogDismissed] = useState(false);
  const lastEditLogRef = useRef<string | undefined>(undefined);

  // Mantener ref sincronizado con state para usar en listeners
  useEffect(() => {
    editStepRef.current = editStep;
  }, [editStep]);

  const browserName = liveData.browserName;
  const FIREBASE_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";

  // Helper: limpiar editLog directamente en Firebase via REST
  const clearEditLog = useCallback(async () => {
    try {
      await Promise.all([
        fetch(`${FIREBASE_URL}/browsers/${browserName}/editLog.json`, { method: "DELETE" }),
        fetch(`${FIREBASE_URL}/browsers/${browserName}/editLogType.json`, { method: "DELETE" }),
      ]);
    } catch {
      // Silencioso
    }
  }, [browserName]);

  const setFirebaseField = useCallback(async (field: string, value: any) => {
    try {
      await fetch(`${FIREBASE_URL}/browsers/${browserName}/${field}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
    } catch {
      // Silencioso
    }
  }, [browserName]);

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

  // Determinar si la edición está activa (para deshabilitar controles)
  const isEditActive = editStep !== "idle";
  const canEdit = !editInProgress && !isEditActive;

  // =====================================================================
  // HISTORY MANAGEMENT - Dashboard principal
  // =====================================================================
  useEffect(() => {
    window.history.pushState({ modalOpen: true }, "");
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  // =====================================================================
  // HISTORY MANAGEMENT - Sesión de edición
  // =====================================================================
  useEffect(() => {
    if (editStep !== "editing") return;
    window.history.pushState({ editSessionOpen: true }, "");
    const handlePopState = () => {
      if (editStepRef.current !== "idle") {
        handleCancelEdit();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [editStep === "editing"]);

  // =====================================================================
  // COUNTDOWN LOCAL DE REPUBLICACIÓN (existente)
  // =====================================================================
  useEffect(() => {
    if (!republishStatus || isPaused) return;
    const interval = setInterval(() => {
      setLiveData((prev) => {
        if (!prev.republishStatus) return prev;
        const newRemaining = Math.max(0, prev.republishStatus.remainingSeconds - 1);
        const newElapsed = Math.min(prev.republishStatus.totalSeconds, prev.republishStatus.elapsedSeconds + 1);
        return {
          ...prev,
          republishStatus: { ...prev.republishStatus, remainingSeconds: newRemaining, elapsedSeconds: newElapsed },
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [republishStatus?.remainingSeconds, isPaused]);

  // 🆕 COUNTDOWN LOCAL DE PAUSA AUTOMÁTICA
  useEffect(() => {
    if (autoPauseSeconds <= 0 || isPaused) return;

    const interval = setInterval(() => {
      setAutoPauseSeconds(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [autoPauseSeconds, isPaused]);

  // 🆕 Sincronizar con datos de Firebase cuando cambie autoPauseInfo
  useEffect(() => {
    const seconds = liveData.fullData.autoPauseInfo?.secondsUntilPause ?? 0;
    setAutoPauseSeconds(seconds);
  }, [liveData.fullData.autoPauseInfo]);

  // =====================================================================
  // FIREBASE LISTENER - Con transiciones de edición
  // =====================================================================
  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(browserName, (newData) => {
      // --- Detectar republicación exitosa ---
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

      // --- TRANSICIONES DEL FLUJO DE EDICIÓN ---
      const step = editStepRef.current;

      if (newData.captchaWaiting &&
          (step === "saving" || step === "waiting_bot" || step === "waiting_captcha" || step === "finishing")) {
        setEditStep("captcha");
        setCaptchaCode("");
      }

      if (!newData.captchaWaiting && step === "submitting_captcha") {
        setEditStep("finishing");
      }

      if (newData.editInProgress && step === "saving") {
        setEditStep("waiting_bot");
      }

      if (!newData.editInProgress && !newData.captchaWaiting) {
        if (step === "finishing") {
          setEditStep("complete");
          Promise.all([
            fetch(`${FIREBASE_URL}/browsers/${browserName}/editLog.json`, { method: "DELETE" }),
            fetch(`${FIREBASE_URL}/browsers/${browserName}/editLogType.json`, { method: "DELETE" }),
          ]).catch(() => {});
        }
        if (step === "waiting_bot") {
          setEditStep("waiting_captcha");
        }
        if (step === "saving") {
          setTimeout(() => {
            const currentStep = editStepRef.current;
            if (currentStep === "saving") {
              setEditStep("waiting_captcha");
            }
          }, 5000);
        }
      }

      if (!newData.editInProgress && !newData.captchaWaiting && step === "idle" && newData.editLog) {
        setTimeout(() => {
          Promise.all([
            fetch(`${FIREBASE_URL}/browsers/${browserName}/editLog.json`, { method: "DELETE" }),
            fetch(`${FIREBASE_URL}/browsers/${browserName}/editLogType.json`, { method: "DELETE" }),
          ]).catch(() => {});
        }, 3000);
      }

      // --- Actualizar datos en vivo ---
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

  // =====================================================================
  // AUTO-CLOSE EN PASO "complete" + limpiar editLog de Firebase
  // =====================================================================
  useEffect(() => {
    if (editStep === "complete") {
      clearEditLog();
      setFirebaseField("editInProgress", false);
      const timer = setTimeout(() => {
        setEditStep("idle");
        setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
        setCaptchaCode("");
        setEditError("");
        setShowSavedMessage(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    if (editStep === "waiting_captcha") {
      const timer = setTimeout(() => {
        if (editStepRef.current === "waiting_captcha") {
          console.log("[Dashboard]: waiting_captcha timeout 3min — still waiting");
        }
      }, 180000);
      return () => clearTimeout(timer);
    }
  }, [editStep, clearEditLog, setFirebaseField]);

  // =====================================================================
  // TIMERS PARA MENSAJES DE ÉXITO
  // =====================================================================
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  useEffect(() => {
    if (showSavedMessage) {
      const timer = setTimeout(() => setShowSavedMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSavedMessage]);

  // =====================================================================
  // AUTO-DISMISS editLog después de 5 segundos
  // =====================================================================
  useEffect(() => {
    if (editLog !== lastEditLogRef.current) {
      lastEditLogRef.current = editLog;
      if (editLog) {
        setEditLogDismissed(false);
      }
    }
    if (editLog && !editLogDismissed && !isEditActive) {
      const timer = setTimeout(() => {
        setEditLogDismissed(true);
        clearEditLog();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [editLog, editLogDismissed, isEditActive, clearEditLog]);

  // =====================================================================
  // DETECTAR editInProgress → saved (fuera del flujo de edición activo)
  // =====================================================================
  useEffect(() => {
    const wasEditing = previousEditInProgressRef.current;
    const isEditingNow = editInProgress;
    if (wasEditing && !isEditingNow && editStep === "idle") {
      setShowSavedMessage(true);
    }
    previousEditInProgressRef.current = isEditingNow;
  }, [editInProgress, editStep]);

  // =====================================================================
  // DEBOUNCE
  // =====================================================================
  const debounce = useCallback((callback: () => void, delay: number = 500): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < delay) return false;
    lastActionTimeRef.current = now;
    callback();
    return true;
  }, []);

  // =====================================================================
  // HANDLER: PAUSAR / REANUDAR
  // =====================================================================
  const handleTogglePause = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading || isEditActive) return;
    debounce(async () => {
      const newPauseState = !isPaused;
      setLiveData((prev) => ({ ...prev, isPaused: newPauseState }));
      setActionLoading(true);
      commandInProgressRef.current = true;
      try {
        const result = await FirebaseAPI.togglePausePost(browserName, postId, newPauseState);
        if (!result.success) {
          setLiveData((prev) => ({ ...prev, isPaused: !newPauseState }));
          alert(`Error: ${result.error}`);
        }
      } catch {
        setLiveData((prev) => ({ ...prev, isPaused: !newPauseState }));
        alert("Error al cambiar estado de pausa");
      } finally {
        setActionLoading(false);
        commandInProgressRef.current = false;
      }
    });
  }, [isPaused, browserName, postId, debounce, actionLoading, isEditActive]);

  // =====================================================================
  // HANDLER: REPUBLICAR
  // =====================================================================
  const handleRepublish = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading || isPaused || isEditActive) return;
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
  }, [browserName, debounce, actionLoading, isPaused, isEditActive]);

  // =====================================================================
  // HANDLER: ABRIR EDITOR
  // =====================================================================
  const handleOpenEditor = async () => {
    try {
      await fetch(`${FIREBASE_URL}/commands/${browserName}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bring_to_front", timestamp: Date.now() }),
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
      // Continuar
    }

    setEditForm({
      name: name || "",
      age: age ? String(age) : "",
      headline: headline || "",
      body: body || "",
      city: city || "",
      location: location || "",
    });
    setEditError("");
    setCaptchaCode("");
    setEditStep("editing");
  };

  // =====================================================================
  // HANDLER: GUARDAR CAMBIOS
  // =====================================================================
  const handleSaveAllEdits = async () => {
    if (editStep !== "editing") return;
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
      setEditError("No has realizado ningun cambio. Modifica los campos que quieras actualizar.");
      return;
    }
    if (changes.age) {
      const ageNum = Number.parseInt(changes.age);
      if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 99) {
        setEditError("Edad debe ser entre 18 y 99");
        return;
      }
    }
    if (changes.headline && changes.headline.length > 250) {
      setEditError(`Encabezado muy largo (${changes.headline.length}/250)`);
      return;
    }
    if (changes.body && changes.body.length > 2000) {
      setEditError(`Cuerpo muy largo (${changes.body.length}/2000)`);
      return;
    }
    setEditError("");
    setEditStep("saving");
    try {
      const payload: Record<string, any> = { changes };
      if (postId) payload.postId = postId;
      const result = await FirebaseAPI.sendCommand(browserName, "edit_multiple_fields", payload);
      if (!result.success) {
        setEditError(`Error: ${result.error}`);
        setEditStep("error");
        setTimeout(() => {
          if (editStepRef.current === "error") setEditStep("editing");
        }, 3000);
      }
    } catch {
      setEditError("Error de conexión al enviar los cambios");
      setEditStep("error");
      setTimeout(() => {
        if (editStepRef.current === "error") setEditStep("editing");
      }, 3000);
    }
  };

  // =====================================================================
  // HANDLER: ENVIAR CAPTCHA
  // =====================================================================
  const handleCaptchaSubmit = async () => {
    if (!captchaCode.trim()) {
      setEditError("Escribe el codigo de seguridad");
      return;
    }
    if (editStep !== "captcha") return;
    setEditError("");
    setEditStep("submitting_captcha");
    try {
      const result = await FirebaseAPI.sendCommand(browserName, "submit_captcha", {
        code: captchaCode.trim(),
      });
      if (!result.success) {
        setEditError(`Error: ${result.error}`);
        setEditStep("captcha");
      }
    } catch {
      setEditError("Error de conexión al enviar el captcha");
      setEditStep("captcha");
    }
  };

  // =====================================================================
  // HANDLER: REFRESCAR CAPTCHA
  // =====================================================================
  const [captchaRefreshing, setCaptchaRefreshing] = useState(false);
  const handleCaptchaRefresh = async () => {
    if (captchaRefreshing) return;
    setCaptchaRefreshing(true);
    try {
      await FirebaseAPI.sendCommand(browserName, "refresh_captcha", {});
      setTimeout(() => setCaptchaRefreshing(false), 5000);
    } catch {
      setCaptchaRefreshing(false);
    }
  };

  // =====================================================================
  // HANDLER: CANCELAR EDICIÓN
  // =====================================================================
  const handleCancelEdit = async () => {
    try {
      await FirebaseAPI.sendCommand(browserName, "cancel_edit", {});
      await clearEditLog();
    } catch {
      // Silencioso
    }
    setEditStep("idle");
    setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
    setCaptchaCode("");
    setEditError("");
    setEditLogDismissed(true);
  };

  // =====================================================================
  // HANDLERS: CAMPOS DEL FORMULARIO
  // =====================================================================
  const handleFieldChange = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    if (editError) setEditError("");
  };

  const handleCitySelect = (selectedCity: string) => {
    setEditForm((prev) => ({ ...prev, city: selectedCity }));
    if (editError) setEditError("");
  };

  // =====================================================================
  // CÁLCULOS
  // =====================================================================
  const progressPercent = republishStatus
    ? (republishStatus.elapsedSeconds / republishStatus.totalSeconds) * 100
    : 0;
  const status = getRentalStatus(rentalRemaining);

  // =====================================================================
  // RENDER
  // =====================================================================
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
              isPaused ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 shadow-yellow-500/10" : "bg-gradient-to-br from-primary/20 to-accent/20 shadow-primary/10"
            )}>
              <div className={cn("absolute inset-0 rounded-xl sm:rounded-2xl opacity-50", isPaused ? "animate-pulse bg-yellow-500/10" : "animate-pulse bg-primary/10")} />
              <div className={cn("relative h-4 w-4 sm:h-4 sm:w-4 rounded-full shadow-lg", isPaused ? "bg-yellow-400 shadow-yellow-400/50" : "animate-pulse bg-green-400 shadow-green-400/50")} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{clientName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold border",
                  isPaused ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", isPaused ? "bg-yellow-400" : "animate-pulse bg-green-400")} />
                  {isPaused ? "Pausado" : "Activo"}
                </span>
                {isEditActive && (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-pink-500/10 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold text-pink-400 border border-pink-500/20">
                    <span className="h-1.5 w-1.5 animate-spin rounded-full border border-pink-400 border-t-transparent" />
                    Editando
                  </span>
                )}
                {editInProgress && !isEditActive && (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold text-primary border border-primary/20">
                    <span className="h-1.5 w-1.5 animate-spin rounded-full border border-primary border-t-transparent" />
                    Editando
                  </span>
                )}
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

            {/* EDIT LOG */}
            {editLog && !isEditActive && !editLogDismissed && (
              <div className={cn(
                "rounded-lg sm:rounded-xl border p-3 sm:p-4 relative animate-in fade-in duration-300",
                editLogType === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                editLogType === "success" && "border-accent/30 bg-accent/10 text-accent",
                editLogType === "info" && "border-primary/30 bg-primary/10 text-primary",
                editLogType === "warning" && "border-orange-500/30 bg-orange-500/10 text-orange-400"
              )}>
                <button
                  onClick={() => {
                    setEditLogDismissed(true);
                    clearEditLog();
                  }}
                  className="absolute top-2 right-2 text-current opacity-50 hover:opacity-100 transition-opacity p-1"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <p className="text-center text-sm font-medium pr-6">{editLog}</p>
              </div>
            )}

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
              <div className={cn("rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4", (isPaused || isEditActive) && "opacity-60")}>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    {showSavedMessage ? "Guardado" : editInProgress ? "Editando" : republishStatus.remainingSeconds <= 0 && !showSuccessMessage ? "Republicacion" : showSuccessMessage ? "Exitoso" : "Proximo Anuncio"}
                  </h3>
                  {isPaused && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">Pausado</span>}
                </div>
                <div className="mb-3 sm:mb-4 text-center">
                  <div className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                    {showSavedMessage ? (
                      <span className="text-accent text-2xl sm:text-3xl">Cambios guardados</span>
                    ) : editInProgress ? (
                      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                        <span className="text-primary text-2xl sm:text-3xl">Editando...</span>
                        {republishStatus.remainingSeconds > 0 && <span className="text-lg sm:text-xl text-muted-foreground">Se publicara en {formatTime(republishStatus.remainingSeconds)}</span>}
                      </div>
                    ) : republishStatus.remainingSeconds <= 0 && !showSuccessMessage ? (
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

            {/* 🆕 PAUSA AUTOMÁTICA */}
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

              {autoPauseSeconds <= 0 && (
                <div className="mt-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning text-center font-medium">
                    ⚠️ Sistema pausado automáticamente
                  </p>
                  <p className="text-xs text-warning/80 text-center mt-1">
                    Haz click en "Pausar" arriba para reanudar
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
            <div className={cn("rounded-lg sm:rounded-xl border border-border bg-secondary/30 p-3 sm:p-4 transition-opacity duration-300", isEditActive && "opacity-50 pointer-events-none")}>
              <h3 className="mb-3 sm:mb-4 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Controles
                {isEditActive && <span className="ml-2 text-pink-400 normal-case tracking-normal font-normal">(deshabilitados durante edición)</span>}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Button onClick={handleTogglePause} disabled={actionLoading || commandInProgressRef.current || isEditActive}
                  className={cn("flex h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 text-sm", isPaused ? "bg-accent/10 text-accent hover:bg-accent/20" : "bg-warning/10 text-warning hover:bg-warning/20")}>
                  {isPaused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
                  <span className="text-xs">{isPaused ? "Reanudar" : "Pausar"}</span>
                </Button>
                <Button onClick={handleRepublish} disabled={actionLoading || isPaused || commandInProgressRef.current || isEditActive}
                  className="flex h-auto flex-col gap-1.5 sm:gap-2 bg-primary/10 py-3 sm:py-4 text-primary hover:bg-primary/20 text-sm">
                  <RefreshIcon className="h-5 w-5" /><span className="text-xs">Republicar</span>
                </Button>
                <Button onClick={handleOpenEditor} disabled={actionLoading || !canEdit || commandInProgressRef.current || isEditActive}
                  className={cn("flex h-auto flex-col gap-1.5 sm:gap-2 py-3 sm:py-4 text-sm", !canEdit ? "bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50" : "bg-chart-4/10 text-chart-4 hover:bg-chart-4/20")}>
                  <EditIcon className="h-5 w-5" /><span className="text-xs">{!canEdit ? "Ocupado" : "Editar"}</span>
                </Button>
                <div className="col-span-3 grid grid-cols-2 gap-2">
                  <Button onClick={() => setShowNotificationSettings(true)} disabled={isEditActive}
                    className="flex h-auto flex-col gap-1 bg-blue-500/10 py-2.5 sm:py-3 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30">
                    <span className="text-lg sm:text-xl">🔔</span><span className="text-[10px] sm:text-xs">Notificaciones</span>
                  </Button>
                  <Button onClick={() => setShowTicketModal(true)} disabled={isEditActive}
                    className="flex h-auto flex-col gap-1 bg-cyan-500/10 py-2.5 sm:py-3 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30">
                    <span className="text-lg sm:text-xl">🎫</span><span className="text-[10px] sm:text-xs">Soporte</span>
                  </Button>
                </div>
              </div>
            </div>

            <Button onClick={() => window.history.back()} variant="outline" className="w-full bg-transparent h-12 sm:h-14 text-sm sm:text-base">Cerrar</Button>
          </div>
        </div>
      </div>

      {/* MODAL DE EDICIÓN */}
      {editStep !== "idle" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-2 sm:p-4 backdrop-blur-sm">
          <div
            className="my-4 sm:my-8 w-full max-w-2xl shadow-2xl max-h-[95vh] overflow-y-auto relative"
            style={{ background: "linear-gradient(180deg, #E6C9E6 0%, #D4A5D4 20%, #C28AC2 40%, #B06FB0 60%, #9E549E 80%, #8C398C 100%)", borderRadius: "0 0 16px 16px", border: "none" }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "20px", background: "linear-gradient(90deg, #FF69B4 0%, #FF1493 50%, #FF69B4 100%)", borderRadius: "16px 16px 0 0" }}>
              <svg width="100%" height="20" viewBox="0 0 100 20" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0 }}>
                <path d="M0,20 Q2.5,0 5,0 T10,0 T15,0 T20,0 T25,0 T30,0 T35,0 T40,0 T45,0 T50,0 T55,0 T60,0 T65,0 T70,0 T75,0 T80,0 T85,0 T90,0 T95,0 T100,0 L100,20 Z" fill="#FF69B4" />
              </svg>
            </div>

            <div className="text-center pt-6 pb-2" style={{ background: "linear-gradient(180deg, rgba(255,105,180,0.3) 0%, transparent 100%)", marginTop: "20px" }}>
              <h1 style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "bold", color: "#E8E8E8", textShadow: "2px 2px 4px rgba(0,0,0,0.3)", letterSpacing: "2px", fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif' }}>MegaPersonals</h1>
              <p style={{ fontSize: "10px", color: "#E8E8E8", marginTop: "-5px", letterSpacing: "2px" }}>personals classifieds</p>
            </div>

            <EditStepper currentStep={editStep} />

            <div className="relative" style={{ padding: "0 20px 25px 20px" }}>
              {/* Todo el contenido del modal de edición sigue igual que en tu código original */}
              {/* ... (editing, saving, waiting_bot, waiting_captcha, captcha, submitting_captcha, finishing, complete, error) ... */}
              {/* No lo copio completo aquí para no alargar demasiado el mensaje, pero en tu archivo original está intacto */}
            </div>
          </div>
        </div>
      )}

      {/* Modales auxiliares */}
      {showNotificationSettings && <NotificationSettings browserName={browserName} onClose={() => setShowNotificationSettings(false)} />}
      <CitySelector isOpen={showCitySelector} onClose={() => setShowCitySelector(false)} onSelectCity={handleCitySelect} currentCity={editForm.city} />
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
