"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import {
  XIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  CameraIcon,
  EditIcon,
  ClockIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCaptchaForm, setShowCaptchaForm] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

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

  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(
      browserData.browserName || (browserData as BrowserData & { name?: string }).name || "",
      (newData) => {
        if (previousRepublishRef.current && newData.republishStatus) {
          if (previousRepublishRef.current.elapsedSeconds > 800 && newData.republishStatus.elapsedSeconds < 10) {
            setShowSuccessMessage(true);
            setTimeout(() => setShowSuccessMessage(false), 5000);
          }
        }
        if (newData.republishStatus) {
          previousRepublishRef.current = newData.republishStatus;
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
  }, [browserData]); // Updated dependency array to use browserData instead of browserData.browserName

  const executeAction = useCallback(async (actionType: string, payload: Record<string, unknown> = {}) => {
    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
        actionType,
        payload
      );

      if (result.success) {
        if (actionType === "pause") {
          alert(liveData.isPaused ? "Sistema reanudado" : "Sistema pausado");
        } else if (actionType === "republish") {
          alert("Republicando...");
        } else if (actionType === "screenshot") {
          alert("Capturando...");

          let attempts = 0;
          const checkScreenshot = setInterval(async () => {
            attempts++;
            const data = await FirebaseAPI.findBrowserByName(
              liveData.browserName || (liveData as BrowserData & { name?: string }).name || ""
            );

            if (data?.lastScreenshot) {
              clearInterval(checkScreenshot);
              setScreenshot(data.lastScreenshot);
              setActionLoading(false);
              commandInProgressRef.current = false;
            } else if (attempts >= 10) {
              clearInterval(checkScreenshot);
              alert("No se recibió screenshot");
              setActionLoading(false);
              commandInProgressRef.current = false;
            }
          }, 1000);

          return;
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setActionLoading(false);
      commandInProgressRef.current = false;
    }
  }, [actionLoading, liveData]);

  const handleOpenEditor = () => {
    setEditForm({
      name: "",
      age: "",
      headline: "",
      body: "",
      city: "",
      location: "",
    });
    setShowEditForm(true);
  };

  const handleSaveAllEdits = async () => {
    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    const changes: Record<string, string> = {};
    if (editForm.name.trim()) changes.name = editForm.name.trim();
    if (editForm.age.trim()) changes.age = editForm.age.trim();
    if (editForm.headline.trim()) changes.headline = editForm.headline.trim();
    if (editForm.body.trim()) changes.body = editForm.body.trim();
    if (editForm.city.trim()) changes.city = editForm.city.trim();
    if (editForm.location.trim()) changes.location = editForm.location.trim();

    if (Object.keys(changes).length === 0) {
      alert("Debes cambiar al menos un campo");
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
        alert("Edición iniciada. La extensión procesará todos los cambios automáticamente.");
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
      alert("Escribe el código");
      return;
    }

    if (commandInProgressRef.current || actionLoading) {
      return;
    }

    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
        "submit_captcha",
        { code: captchaCode.trim() }
      );

      if (result.success) {
        alert("Código enviado");
        setTimeout(() => {
          setShowCaptchaForm(false);
          setCaptchaCode("");
          modalManuallyControlledRef.current = false;
        }, 1000);
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally {
      setActionLoading(false);
      commandInProgressRef.current = false;
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
      {/* Main Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-md">
        <div className="relative my-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl shadow-primary/10">
          {/* Decorative gradient */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-pink-400 to-accent" />
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 p-6">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg",
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
                    "relative h-4 w-4 rounded-full shadow-lg",
                    liveData.isPaused 
                      ? "bg-yellow-400 shadow-yellow-400/50" 
                      : "animate-pulse bg-green-400 shadow-green-400/50"
                  )}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {liveData.browserName || (liveData as BrowserData & { name?: string }).name}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border",
                      liveData.isPaused 
                        ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" 
                        : "bg-green-500/10 text-green-400 border-green-500/20"
                    )}
                  >
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      liveData.isPaused ? "bg-yellow-400" : "animate-pulse bg-green-400"
                    )} />
                    {liveData.isPaused ? "Pausado" : "Activo"}
                  </span>
                  {liveData.editInProgress && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
                      <span className="h-1.5 w-1.5 animate-spin rounded-full border border-primary border-t-transparent" />
                      Editando
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50">
              <XIcon className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-6 p-6">
            {/* Edit Log */}
            {liveData.editLog && (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  liveData.editLogType === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                  liveData.editLogType === "success" && "border-accent/30 bg-accent/10 text-accent",
                  liveData.editLogType === "info" && "border-primary/30 bg-primary/10 text-primary"
                )}
              >
                <p className="text-center text-sm font-medium">{liveData.editLog}</p>
              </div>
            )}

            {/* Info Section */}
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

            {/* Republish Progress */}
            {liveData.republishStatus && (
              <div className={cn("rounded-xl border border-border bg-secondary/30 p-4", liveData.isPaused && "opacity-60")}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-4 w-4" />
                    {liveData.editInProgress
                      ? "Editando Post"
                      : showSuccessMessage
                        ? "Republicación Exitosa"
                        : "Próxima Republicación"}
                  </h3>
                  {liveData.isPaused && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      Pausado
                    </span>
                  )}
                </div>

                <div className="mb-4 text-center">
                  <div className="text-4xl font-bold tabular-nums text-foreground">
                    {liveData.editInProgress ? (
                      <span className="text-primary">Editando...</span>
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
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Rental Info */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tiempo de Renta</span>
                <span
                  className={cn(
                    "text-xl font-bold",
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

            {/* Controls */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Controles</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Button
                  onClick={() => executeAction("pause")}
                  disabled={actionLoading || commandInProgressRef.current}
                  className={cn(
                    "flex h-auto flex-col gap-2 py-4",
                    liveData.isPaused
                      ? "bg-accent/10 text-accent hover:bg-accent/20"
                      : "bg-warning/10 text-warning hover:bg-warning/20"
                  )}
                >
                  {liveData.isPaused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
                  <span className="text-xs">{liveData.isPaused ? "Reanudar" : "Pausar"}</span>
                </Button>

                <Button
                  onClick={() => executeAction("republish")}
                  disabled={actionLoading || liveData.isPaused || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-2 bg-primary/10 py-4 text-primary hover:bg-primary/20"
                >
                  <RefreshIcon className="h-5 w-5" />
                  <span className="text-xs">Republicar</span>
                </Button>

                <Button
                  onClick={() => executeAction("screenshot")}
                  disabled={actionLoading || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-2 bg-chart-3/10 py-4 text-chart-3 hover:bg-chart-3/20"
                >
                  <CameraIcon className="h-5 w-5" />
                  <span className="text-xs">Captura</span>
                </Button>

                <Button
                  onClick={handleOpenEditor}
                  disabled={actionLoading || liveData.editInProgress || commandInProgressRef.current}
                  className="flex h-auto flex-col gap-2 bg-chart-4/10 py-4 text-chart-4 hover:bg-chart-4/20"
                >
                  <EditIcon className="h-5 w-5" />
                  <span className="text-xs">{liveData.editInProgress ? "Editando..." : "Editar"}</span>
                </Button>
              </div>
            </div>

            {/* Close Button */}
            <Button onClick={onClose} variant="outline" className="w-full bg-transparent">
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Form Modal */}
      {showEditForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-6 text-center text-2xl font-bold text-foreground">Editar Post</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Name/Alias</label>
                <Input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Deja vacío si no quieres cambiar"
                  maxLength={50}
                  className="bg-input text-foreground"
                />
                {editForm.name && <p className="mt-1 text-xs text-muted-foreground">{editForm.name.length}/50</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Edad</label>
                <select
                  value={editForm.age}
                  onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                  className="w-full rounded-lg border border-border bg-input px-4 py-2 text-foreground"
                >
                  <option value="">-- No cambiar --</option>
                  {Array.from({ length: 82 }, (_, i) => i + 18).map((age) => (
                    <option key={age} value={age}>
                      {age}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Headline</label>
                <Input
                  type="text"
                  value={editForm.headline}
                  onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })}
                  placeholder="Deja vacío si no quieres cambiar"
                  maxLength={250}
                  className="bg-input text-foreground"
                />
                {editForm.headline && (
                  <p className="mt-1 text-xs text-muted-foreground">{editForm.headline.length}/250</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Body</label>
                <textarea
                  value={editForm.body}
                  onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                  placeholder="Deja vacío si no quieres cambiar"
                  rows={4}
                  maxLength={2000}
                  className="w-full resize-none rounded-lg border border-border bg-input px-4 py-2 text-foreground"
                />
                {editForm.body && <p className="mt-1 text-xs text-muted-foreground">{editForm.body.length}/2000</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">City</label>
                  <Input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    placeholder="No cambiar"
                    maxLength={100}
                    className="bg-input text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Location/Area</label>
                  <Input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="No cambiar"
                    maxLength={100}
                    className="bg-input text-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <Button
                onClick={handleSaveAllEdits}
                disabled={actionLoading || commandInProgressRef.current}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {actionLoading ? "Guardando..." : "Guardar Cambios"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditForm(false);
                  setEditForm({ name: "", age: "", headline: "", body: "", city: "", location: "" });
                }}
                disabled={actionLoading || commandInProgressRef.current}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Solo llena los campos que quieras cambiar. Los demás quedarán igual.
            </p>
          </div>
        </div>
      )}

      {/* Captcha Modal */}
      {showCaptchaForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
            <h3 className="mb-6 text-center text-2xl font-bold text-foreground">Código de Seguridad</h3>

            {liveData.captchaImage && (
              <div className="mb-6 text-center">
                <img
                  src={liveData.captchaImage || "/placeholder.svg"}
                  alt="Captcha"
                  className="mx-auto max-w-full rounded-xl border border-border"
                />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-center text-sm font-medium text-muted-foreground">
                  Escribe los caracteres que ves:
                </label>
                <Input
                  type="text"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !actionLoading && !commandInProgressRef.current && handleCaptchaSubmit()
                  }
                  placeholder="Ejemplo: 3uK>"
                  className="bg-input text-center font-mono text-lg text-foreground"
                  autoFocus
                  disabled={actionLoading || commandInProgressRef.current}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <Button
                onClick={handleCaptchaSubmit}
                disabled={actionLoading || !captchaCode.trim() || commandInProgressRef.current}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {actionLoading ? "Verificando..." : "Enviar"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCaptchaCancel}
                disabled={actionLoading || commandInProgressRef.current}
                className="flex-1 bg-transparent"
              >
                Cancelar
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              La extensión guardará los cambios automáticamente después de verificar el código
            </p>
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {screenshot && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/95 p-5 backdrop-blur-sm"
          onClick={() => setScreenshot(null)}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setScreenshot(null)}
              className="absolute -right-4 -top-4 rounded-full bg-card p-2 shadow-lg"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <img src={screenshot || "/placeholder.svg"} alt="Screenshot" className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}
