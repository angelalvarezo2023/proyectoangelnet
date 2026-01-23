"use client";

import { useState, useEffect, useRef } from "react";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
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
  if (rental.days === 0 && rental.hours === 0 && rental.minutes === 0) return "Expirada";
  const parts = [];
  if (rental.days > 0) parts.push(`${rental.days}d`);
  if (rental.hours > 0) parts.push(`${rental.hours}h`);
  if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
  return parts.join(" ");
}

// 🆕 TARJETA SIMPLIFICADA - SIN INFORMACIÓN TÉCNICA
function BrowserCard({ browser, onClick }: { browser: BrowserData; onClick: () => void }) {
  const [localRemaining, setLocalRemaining] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!browser.republishStatus || browser.isPaused) {
      setLocalRemaining(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const firebaseRemaining = browser.republishStatus.remainingSeconds;
    
    if (localRemaining === null || Math.abs(firebaseRemaining - localRemaining) > 5) {
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
  }, [browser.republishStatus?.remainingSeconds, browser.isPaused, localRemaining]);

  const timeRemaining = localRemaining !== null ? {
    minutes: Math.floor(localRemaining / 60),
    seconds: localRemaining % 60
  } : null;
  
  const showRentalAlert = browser.rentalRemaining && 
    browser.rentalRemaining.days === 0 && 
    browser.rentalRemaining.hours < 24;

  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-3xl border p-6 transition-all duration-300 hover:scale-[1.02] backdrop-blur-xl relative overflow-hidden",
        showRentalAlert 
          ? "border-red-500/50 bg-gradient-to-br from-red-500/20 to-pink-500/10 shadow-lg shadow-red-500/30"
          : "border-white/10 bg-gradient-to-br from-white/5 to-white/10"
      )}
    >
      {/* 🚨 ALERTA URGENTE - GRANDE Y CLARA */}
      {showRentalAlert && (
        <div className="mb-6 rounded-2xl border-2 border-red-500/50 bg-red-500/20 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-5xl">🚨</div>
            <div className="flex-1">
              <p className="text-xl font-black text-red-400 mb-1">
                ¡Expira Hoy!
              </p>
              <p className="text-base text-red-300">
                {browser.rentalRemaining.hours}h {browser.rentalRemaining.minutes}m restantes
              </p>
            </div>
          </div>
          <a 
            href={`https://wa.me/18293837695?text=${encodeURIComponent(
              `🚨 RENOVAR: ${browser.browserName} - Expira en ${browser.rentalRemaining.hours}h`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block w-full py-4 rounded-xl font-black text-lg bg-gradient-to-r from-red-500 to-pink-600 text-white hover:scale-105 transition-all duration-200 text-center"
          >
            💬 RENOVAR AHORA
          </a>
        </div>
      )}

      {/* NOMBRE DEL PERFIL - GRANDE */}
      <div className="mb-6">
        <h3 className="text-3xl font-black text-white mb-2">
          {browser.browserName}
        </h3>
        {browser.postName && browser.postName !== "N/A" && (
          <p className="text-lg text-white/70">{browser.postName}</p>
        )}
      </div>

      {/* ESTADO - SIMPLE Y CLARO */}
      <div className={cn(
        "rounded-2xl p-6 mb-4",
        browser.isPaused 
          ? "bg-yellow-500/20 border-2 border-yellow-500/50" 
          : "bg-green-500/20 border-2 border-green-500/50"
      )}>
        <div className="flex items-center gap-4 mb-3">
          <div className={cn(
            "h-5 w-5 rounded-full",
            browser.isPaused ? "bg-yellow-400" : "bg-green-400 animate-pulse"
          )} />
          <span className={cn(
            "text-xl font-bold",
            browser.isPaused ? "text-yellow-400" : "text-green-400"
          )}>
            {browser.isPaused ? "⏸ Pausado" : "✅ Funcionando"}
          </span>
        </div>
        
        {!browser.isPaused && timeRemaining && (
          <div className="text-center py-4 bg-black/30 rounded-xl">
            <p className="text-sm text-white/60 mb-2">Próximo anuncio en:</p>
            <p className="text-5xl font-black text-white tabular-nums">
              {timeRemaining.minutes}<span className="text-2xl">m</span> {timeRemaining.seconds}<span className="text-2xl">s</span>
            </p>
          </div>
        )}
      </div>

      {/* TIEMPO DE RENTA */}
      <div className="rounded-2xl bg-white/10 p-6 border border-white/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⏰</span>
            <span className="text-lg text-white/70">Renta:</span>
          </div>
          <span className={cn(
            "text-3xl font-black",
            showRentalAlert ? "text-red-400" : "text-green-400"
          )}>
            {formatRentalTime(browser.rentalRemaining)}
          </span>
        </div>
      </div>

      {/* TOCA PARA VER MÁS */}
      <div className="mt-6 text-center text-white/50 text-lg">
        👆 Toca para más opciones
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

  useEffect(() => {
    if (browserList.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    browserList.forEach((browser, index) => {
      const unsubscribe = FirebaseAPI.listenToBrowser(
        browser.browserName,
        (updatedData) => {
          setBrowserList(prev => {
            const newList = [...prev];
            newList[index] = updatedData;
            return newList;
          });
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [browserList.length]);

  const handleSearch = async () => {
    if (!clientSearch.trim()) {
      setError("Por favor escribe tu nombre");
      return;
    }

    setSearching(true);
    setError("");
    setBrowserData(null);
    setBrowserList([]);

    const results = await FirebaseAPI.findAllBrowsersByClientName(clientSearch);

    if (results.length === 0) {
      setError("No encontramos tu nombre. Verifica que esté bien escrito.");
    } else if (results.length === 1) {
      setBrowserData(results[0]);
    } else {
      setBrowserList(results);
    }

    setSearching(false);
  };

  const handleSelectBrowser = (browser: BrowserData) => {
    setBrowserData(browser);
  };

  return (
    <>
      <div className="mx-auto max-w-4xl px-4">
        {/* 🔍 PANEL DE BÚSQUEDA - MÁS GRANDE Y SIMPLE */}
        <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-card to-card/80 p-8 shadow-2xl min-h-[400px] flex flex-col justify-center">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-12 w-12 text-primary" />
            </div>
            <h2 className="mb-3 text-4xl font-black text-foreground">
              Tus Anuncios
            </h2>
            <p className="text-xl text-muted-foreground px-4">
              Busca por tu nombre de cliente
            </p>
          </div>

          <div className="space-y-5">
            {/* BÚSQUEDA - GRANDE Y CLARA */}
            <div className="flex flex-col gap-4">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Escribe tu nombre aquí..."
                className="h-16 bg-input text-foreground text-xl px-6 rounded-2xl"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-16 bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600 font-black text-xl rounded-2xl"
              >
                <SearchIcon className="mr-3 h-6 w-6" />
                {searching ? "Buscando..." : "🔍 Buscar"}
              </Button>
            </div>

            {/* ERROR - GRANDE Y CLARO */}
            {error && (
              <div className="rounded-2xl border-2 border-red-500/50 bg-red-500/10 px-6 py-5 text-center">
                <p className="text-xl font-bold text-red-400 mb-2">❌ {error}</p>
                <p className="text-base text-red-300">
                  ¿Necesitas ayuda? Contacta a tu administrador
                </p>
              </div>
            )}
          </div>
        </div>

        {/* LISTA DE PERFILES - SIMPLE */}
        {browserList.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="text-center">
              <h3 className="text-3xl font-black text-foreground mb-2">
                Tus Perfiles
              </h3>
              <p className="text-xl text-muted-foreground">
                {browserList.length} {browserList.length === 1 ? "perfil" : "perfiles"}
              </p>
            </div>

            {/* GRID SIMPLE - 1 COLUMNA EN MÓVIL */}
            <div className="grid gap-6 grid-cols-1">
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

      {browserData && (
        <Dashboard
          browserData={browserData}
          onClose={() => setBrowserData(null)}
        />
      )}
    </>
  );
}
