"use client";

import { useState, useEffect } from "react";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { SearchIcon, SettingsIcon, UserIcon, PhoneIcon, MapPinIcon } from "@/components/icons";
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

// Componente para tarjeta de navegador con contador en tiempo real
function BrowserCard({ browser, onClick }: { browser: BrowserData; onClick: () => void }) {
  const [timeRemaining, setTimeRemaining] = useState<{ minutes: number; seconds: number } | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    // Función para calcular el tiempo restante en tiempo real
    const calculateTimeRemaining = () => {
      if (!browser.republishStatus) {
        setTimeRemaining(null);
        setProgressPercent(0);
        return;
      }

      const { totalSeconds, elapsedSeconds, remainingSeconds } = browser.republishStatus;
      
      if (remainingSeconds <= 0) {
        setTimeRemaining({ minutes: 0, seconds: 0 });
        setProgressPercent(100);
        return;
      }

      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      setTimeRemaining({ minutes, seconds });

      // Calcular progreso
      const progress = totalSeconds > 0 ? ((elapsedSeconds / totalSeconds) * 100) : 0;
      setProgressPercent(Math.min(100, Math.max(0, progress)));
    };

    // Calcular inmediatamente
    calculateTimeRemaining();

    // Actualizar cada segundo
    const interval = setInterval(() => {
      if (browser.republishStatus) {
        // Decrementar remainingSeconds localmente
        browser.republishStatus.remainingSeconds = Math.max(0, browser.republishStatus.remainingSeconds - 1);
        browser.republishStatus.elapsedSeconds = Math.min(
          browser.republishStatus.totalSeconds,
          browser.republishStatus.elapsedSeconds + 1
        );
        calculateTimeRemaining();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [browser]);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-border bg-gradient-to-br from-card to-card/50 p-6 transition-all hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"
    >
      {/* Header con estado */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5",
              browser.isPaused 
                ? "bg-yellow-500/20" 
                : "bg-green-500/20"
            )}
          >
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                browser.isPaused 
                  ? "bg-yellow-400" 
                  : "animate-pulse bg-green-400"
              )}
            />
            <span className={cn(
              "text-xs font-semibold",
              browser.isPaused ? "text-yellow-400" : "text-green-400"
            )}>
              En línea
            </span>
          </div>
        </div>
        <div className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Ver detalles →
        </div>
      </div>

      {/* Nombre del navegador */}
      <h3 className="mb-4 text-xl font-bold text-foreground">
        {browser.browserName}
      </h3>

      {/* Información del perfil */}
      <div className="mb-4 space-y-2 rounded-lg border border-border/50 bg-background/50 p-4">
        {browser.postName && browser.postName !== "N/A" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Nombre del Post:</span>
            <span className="font-semibold text-foreground">{browser.postName}</span>
          </div>
        )}
        {browser.phoneNumber && browser.phoneNumber !== "N/A" && browser.phoneNumber !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Teléfono:</span>
            <span className="font-semibold text-foreground">{browser.phoneNumber}</span>
          </div>
        )}
        {browser.city && browser.city !== "N/A" && browser.city !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ciudad:</span>
            <span className="font-semibold text-foreground">{browser.city}</span>
          </div>
        )}
        {browser.location && browser.location !== "N/A" && browser.location !== "Manual" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ubicación:</span>
            <span className="font-semibold text-foreground">{browser.location}</span>
          </div>
        )}
      </div>

      {/* PRÓXIMA REPUBLICACIÓN */}
      <div className="mb-4 overflow-hidden rounded-xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 to-purple-500/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <svg className="h-4 w-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-pink-400">
            Próxima Republicación
          </span>
        </div>
        
        {timeRemaining ? (
          <>
            <div className="mb-3 text-center">
              <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                {timeRemaining.minutes}m {timeRemaining.seconds}s
              </span>
            </div>
            
            {/* Barra de progreso */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Sin datos de republicación
          </div>
        )}
      </div>

      {/* TIEMPO DE RENTA */}
      <div className="overflow-hidden rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-orange-500/10 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">
          Tiempo de Renta
        </div>
        <div className="text-center">
          <span className={cn(
            "text-3xl font-black",
            browser.rentalRemaining?.days === 0 
              ? "text-red-400" 
              : "text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400"
          )}>
            {formatRentalTime(browser.rentalRemaining)}
          </span>
        </div>
      </div>

      {/* Botón oculto para click */}
      <div className="mt-4 text-center text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        👆 Click para ver detalles y controles
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

  const handleSearch = async () => {
    if (!clientSearch.trim()) {
      setError("Ingresa el nombre del cliente");
      return;
    }

    setSearching(true);
    setError("");
    setBrowserData(null);
    setBrowserList([]);

    // Buscar TODOS los navegadores del cliente
    const results = await FirebaseAPI.findAllBrowsersByClientName(clientSearch);

    if (results.length === 0) {
      setError("No se encontró ningún cliente con ese nombre");
    } else if (results.length === 1) {
      // Si solo hay 1 resultado, abrir dashboard directamente
      setBrowserData(results[0]);
    } else {
      // Si hay múltiples resultados, mostrar tarjetas
      setBrowserList(results);
    }

    setSearching(false);
  };

  const handleSelectBrowser = (browser: BrowserData) => {
    setBrowserList([]);
    setBrowserData(browser);
  };

  const handleBackToList = () => {
    setBrowserData(null);
    setBrowserList([]);
    // NO borrar clientSearch - mantener para que el usuario pueda buscar de nuevo
  };

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Panel de Control</h2>
            <p className="text-sm text-muted-foreground">Busca tus perfiles por tu nombre de cliente</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Jhelko"
                className="h-12 flex-1 bg-input text-foreground"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-12 bg-gradient-to-r from-pink-500 to-purple-500 px-8 text-white hover:from-pink-600 hover:to-purple-600"
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                {searching ? "Buscando..." : "Buscar Mis Perfiles"}
              </Button>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Lista de Navegadores (Múltiples Resultados) */}
        {browserList.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground">
                Tus Perfiles
              </h3>
              <p className="text-sm text-muted-foreground">
                Se encontraron {browserList.length} {browserList.length === 1 ? "perfil" : "perfiles"} para "{clientSearch}"
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {browserList.map((browser) => (
                <BrowserCard
                  key={browser.browserName}
                  browser={browser}
                  onClick={() => handleSelectBrowser(browser)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dashboard Modal */}
      {browserData && (
        <Dashboard
          browserData={browserData}
          onClose={() => {
            if (browserList.length > 0) {
              // Si vino de una lista, volver a mostrar la lista
              setBrowserData(null);
            } else {
              // Si fue búsqueda directa, cerrar todo
              handleBackToList();
            }
          }}
        />
      )}
    </>
  );
}
