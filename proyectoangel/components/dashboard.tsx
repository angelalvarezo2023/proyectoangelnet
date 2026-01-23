"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { XIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DashboardProps {
  browserData: BrowserData;
  onClose: () => void;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
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

export function Dashboard({ browserData, onClose }: DashboardProps) {
  const [liveData, setLiveData] = useState(browserData);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCaptchaForm, setShowCaptchaForm] = useState(false);
  const [captchaCode, setCaptchaCode] = useState("");

  const modalManuallyControlledRef = useRef(false);
  const commandInProgressRef = useRef(false);
  const lastActionTimeRef = useRef<number>(0);

  // ⏱ COUNTDOWN LOCAL
  useEffect(() => {
    if (!liveData.republishStatus || liveData.isPaused) return;

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

  // 🔥 FIREBASE LISTENER
  useEffect(() => {
    const unsubscribe = FirebaseAPI.listenToBrowser(
      browserData.browserName || (browserData as BrowserData & { name?: string }).name || "",
      (newData) => {
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

  const debounce = useCallback((callback: () => void, delay: number = 500): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < delay) {
      return false;
    }
    lastActionTimeRef.current = now;
    callback();
    return true;
  }, []);

  // ⏸️ PAUSAR/REANUDAR
  const handleTogglePause = useCallback(async () => {
    if (commandInProgressRef.current || actionLoading) return;

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
        alert('Error al cambiar estado');
      } finally {
        setActionLoading(false);
        commandInProgressRef.current = false;
      }
    });
  }, [liveData, debounce, actionLoading]);

  // 🔐 ENVIAR CAPTCHA
  const handleCaptchaSubmit = async () => {
    if (!captchaCode.trim()) {
      alert("Por favor escribe el código");
      return;
    }

    if (commandInProgressRef.current || actionLoading) return;

    commandInProgressRef.current = true;
    setActionLoading(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        liveData.browserName || (liveData as BrowserData & { name?: string }).name || "",
        "submit_captcha",
        { code: captchaCode.trim() }
      );

      if (result.success) {
        alert("✅ Código enviado correctamente");
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

  const showRentalAlert = liveData.rentalRemaining && 
    liveData.rentalRemaining.days === 0 && 
    liveData.rentalRemaining.hours < 24;

  return (
    <>
      {/* 📱 MODAL SIMPLIFICADO */}
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-md">
        <div className="relative my-8 w-full max-w-2xl overflow-hidden rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-card to-card/80 shadow-2xl">
          
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-border/50 p-6">
            <div>
              <h2 className="text-3xl font-black text-foreground mb-2">
                {liveData.browserName || (liveData as BrowserData & { name?: string }).name}
              </h2>
              <div className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold text-lg",
                liveData.isPaused 
                  ? "bg-yellow-500/20 text-yellow-400" 
                  : "bg-green-500/20 text-green-400"
              )}>
                <div className={cn(
                  "h-3 w-3 rounded-full",
                  liveData.isPaused ? "bg-yellow-400" : "bg-green-400 animate-pulse"
                )} />
                {liveData.isPaused ? "⏸ Pausado" : "✅ Activo"}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="rounded-2xl h-12 w-12 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-6 w-6" />
            </Button>
          </div>

          <div className="space-y-6 p-6">
            
            {/* 🚨 ALERTA DE RENTA CRÍTICA */}
            {showRentalAlert && (
              <div className="rounded-2xl border-2 border-red-500/50 bg-red-500/20 p-6 animate-pulse">
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-6xl">🚨</div>
                  <div className="flex-1">
                    <p className="text-2xl font-black text-red-400 mb-1">
                      ¡Expira Hoy!
                    </p>
                    <p className="text-lg text-red-300">
                      Solo {liveData.rentalRemaining.hours}h {liveData.rentalRemaining.minutes}m restantes
                    </p>
                  </div>
                </div>
                <a
                  href={`https://wa.me/18293837695?text=${encodeURIComponent(
                    `🚨 RENOVAR: ${liveData.browserName} - Expira en ${liveData.rentalRemaining.hours}h`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full bg-gradient-to-r from-red-500 to-pink-600 text-white py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all text-center"
                >
                  💬 RENOVAR AHORA
                </a>
              </div>
            )}

            {/* ⏱ COUNTDOWN - GRANDE Y SIMPLE */}
            {liveData.republishStatus && (
              <div className={cn(
                "rounded-2xl border-2 p-8 text-center",
                liveData.isPaused 
                  ? "border-yellow-500/50 bg-yellow-500/10"
                  : "border-green-500/50 bg-green-500/10"
              )}>
                <p className="text-xl text-muted-foreground mb-4">
                  {liveData.isPaused ? "Sistema Pausado" : "Próximo Anuncio En:"}
                </p>
                {liveData.isPaused ? (
                  <div className="text-6xl font-black text-yellow-400 mb-4">
                    ⏸
                  </div>
                ) : (
                  <div className="text-7xl font-black text-green-400 mb-4 tabular-nums">
                    {liveData.republishStatus.remainingSeconds > 0 
                      ? formatTime(liveData.republishStatus.remainingSeconds)
                      : "¡Listo!"}
                  </div>
                )}
              </div>
            )}

            {/* 👁️ VER ANUNCIO */}
            {liveData.postId && liveData.postUrl && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/10 p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-5xl">👁️</div>
                  <div>
                    <h4 className="text-2xl font-black text-foreground mb-1">
                      Tu Anuncio en Vivo
                    </h4>
                    <p className="text-base text-muted-foreground">
                      Así lo ven tus clientes
                    </p>
                  </div>
                </div>
                <a
                  href={liveData.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full bg-gradient-to-r from-primary to-accent text-white py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all text-center"
                >
                  🔗 VER MI ANUNCIO
                </a>
              </div>
            )}

            {/* ⏰ TIEMPO DE RENTA */}
            <div className="rounded-2xl border-2 border-border bg-secondary/30 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">⏰</span>
                  <span className="text-2xl font-bold text-foreground">Renta:</span>
                </div>
                <span className={cn(
                  "text-4xl font-black",
                  showRentalAlert ? "text-red-400" : "text-green-400"
                )}>
                  {formatRentalTime(liveData.rentalRemaining)}
                </span>
              </div>
            </div>

            {/* ⏸️ CONTROL PAUSAR/REANUDAR - GRANDE */}
            <Button
              onClick={handleTogglePause}
              disabled={actionLoading || commandInProgressRef.current}
              className={cn(
                "w-full h-20 text-2xl font-black rounded-2xl transition-all",
                liveData.isPaused
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                  : "bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700"
              )}
            >
              {liveData.isPaused ? (
                <>
                  <PlayIcon className="h-8 w-8 mr-3" />
                  ▶️ REANUDAR
                </>
              ) : (
                <>
                  <PauseIcon className="h-8 w-8 mr-3" />
                  ⏸️ PAUSAR
                </>
              )}
            </Button>

            {/* CERRAR */}
            <Button 
              onClick={onClose} 
              variant="outline" 
              className="w-full h-16 text-xl font-bold rounded-2xl"
            >
              ✕ Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* 🔐 MODAL DE CAPTCHA - SIMPLE */}
      {showCaptchaForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border-2 border-primary/50 bg-card p-8 shadow-2xl">
            
            {/* TÍTULO GRANDE */}
            <div className="mb-6 text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-3xl font-black text-foreground mb-2">
                Código de Seguridad
              </h3>
              <p className="text-lg text-muted-foreground">
                Escribe los caracteres que ves
              </p>
            </div>

            {/* IMAGEN GRANDE */}
            {liveData.captchaImage && (
              <div className="mb-6 rounded-2xl border-2 border-border overflow-hidden bg-white p-4">
                <img
                  src={liveData.captchaImage}
                  alt="Captcha"
                  className="mx-auto max-w-full h-auto"
                />
              </div>
            )}

            {/* INPUT GRANDE */}
            <div className="mb-6">
              <Input
                type="text"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                onKeyDown={(e) =>
                  e.key === "Enter" && !actionLoading && handleCaptchaSubmit()
                }
                placeholder="EJEMPLO: 3uK>"
                className="h-20 bg-input text-center font-mono text-3xl text-foreground rounded-2xl"
                autoFocus
                disabled={actionLoading}
                maxLength={10}
              />
              <p className="text-center text-sm text-muted-foreground mt-3">
                💡 Escribe las letras y números que ves arriba
              </p>
            </div>

            {/* BOTONES GRANDES */}
            <div className="space-y-3">
              <Button
                onClick={handleCaptchaSubmit}
                disabled={actionLoading || !captchaCode.trim()}
                className="w-full h-16 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 font-black text-xl rounded-2xl"
              >
                {actionLoading ? "Enviando..." : "✅ ENVIAR CÓDIGO"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCaptchaCancel}
                disabled={actionLoading}
                className="w-full h-16 font-bold text-lg rounded-2xl"
              >
                ✕ Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
