"use client";

import { useState, useEffect } from "react";
import { AngelRentAPI, type AngelRentSearchResult } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function AngelAnunciosPage() {
  const [searchName, setSearchName] = useState("");
  const [results, setResults] = useState<AngelRentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    
    setSearching(true);
    setHasSearched(true);
    
    try {
      const found = await AngelRentAPI.findAllByClientName(searchName.trim());
      setResults(found);
    } catch (error) {
      console.error("Error en búsqueda:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/10 bg-gradient-to-r from-[#1a0a2e] to-[#2d1b4e]">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-3xl shadow-lg shadow-pink-500/50">
              👼
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">Angel Anuncios</h1>
              <p className="text-sm text-white/60">
                Busca y gestiona tus anuncios publicados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Search Box */}
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-gray-900 to-black p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3 text-white/70">
            <span className="text-2xl">🔍</span>
            <span className="text-sm font-bold">Buscar por nombre o usuario</span>
          </div>
          
          <div className="flex gap-3">
            <Input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ejemplo: amanda, azul, megan..."
              className="h-14 border-white/20 bg-white/5 text-base text-white placeholder:text-white/40"
              disabled={searching}
            />
            <Button
              onClick={handleSearch}
              disabled={searching || !searchName.trim()}
              className="h-14 min-w-[140px] bg-gradient-to-r from-pink-500 to-purple-600 text-base font-black hover:from-pink-600 hover:to-purple-700"
            >
              {searching ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Buscando...
                </>
              ) : (
                <>
                  <span className="mr-2">🔍</span>
                  Buscar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {searching && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-pink-500 border-t-transparent" />
            <p className="text-white/60">Buscando anuncios...</p>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-black p-16 text-center shadow-2xl">
            <div className="mx-auto mb-4 text-6xl">🔍</div>
            <h3 className="mb-2 text-xl font-black text-white">
              No se encontraron anuncios
            </h3>
            <p className="text-sm text-white/50">
              No hay anuncios con el nombre "{searchName}"
            </p>
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="space-y-6">
            <div className="mb-4 text-sm text-white/50">
              Se encontraron <span className="font-bold text-white">{results.length}</span> anuncio{results.length !== 1 ? "s" : ""}
            </div>
            
            {results.map((result) => (
              <AnuncioCard key={result.username} data={result} />
            ))}
          </div>
        )}

        {!hasSearched && (
          <div className="rounded-2xl border border-dashed border-white/20 bg-gradient-to-br from-gray-900/50 to-black/50 p-16 text-center">
            <div className="mx-auto mb-4 text-6xl">🔍</div>
            <h3 className="mb-2 text-xl font-black text-white">
              Busca tus anuncios
            </h3>
            <p className="text-sm text-white/50">
              Ingresa tu nombre o usuario para ver todos tus anuncios
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE DE TARJETA - DISEÑO EXACTO COMO IMAGEN 3
// ═══════════════════════════════════════════════════════════════════════════

function AnuncioCard({ data }: { data: AngelRentSearchResult }) {
  const { user, username, isActive, hasRobot, isPaused } = data;
  const [isToggling, setIsToggling] = useState(false);
  const [localPaused, setLocalPaused] = useState(isPaused);
  
  // ✅ Estado de tiempo que se actualiza cada segundo
  const [currentTime, setCurrentTime] = useState(Date.now());

  // ✅ Calcular tiempo de renta en TIEMPO REAL (como el header)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLocalPaused(isPaused);
  }, [isPaused]);

  // ✅ Calcular tiempo EXACTAMENTE como route.ts
  const calculateRentalTime = () => {
    if (!user.rentalEnd) return { text: "Sin renta", color: "text-gray-500" };
    
    const endTimestamp = user.rentalEndTimestamp || new Date(user.rentalEnd + "T23:59:59").getTime();
    const diffMs = endTimestamp - currentTime;
    
    if (diffMs <= 0) {
      // Deuda
      const debtMs = Math.abs(diffMs);
      const days = Math.floor(debtMs / 86400000);
      const hours = Math.floor((debtMs % 86400000) / 3600000);
      return { 
        text: `DEUDA: ${days}d ${hours}h`,
        color: "text-red-500",
        isDebt: true
      };
    }
    
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    
    let displayText = "";
    if (days > 0) displayText = `${days}d ${hours}h`;
    else if (hours > 0) displayText = `${hours}h ${minutes}m`;
    else displayText = `${minutes}m`;
    
    // Fecha de vencimiento
    const expiresText = new Date(endTimestamp).toLocaleDateString("es", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric"
    });
    
    return {
      text: displayText,
      expires: `Vence: ${expiresText}`,
      color: days >= 2 ? "text-green-500" : days >= 1 ? "text-yellow-500" : "text-red-500",
      isDebt: false
    };
  };

  const rentalInfo = calculateRentalTime();

  const handleToggleRobot = async () => {
    if (!hasRobot) return;
    
    setIsToggling(true);
    const newState = !localPaused;
    
    try {
      // ✅ Actualizar UI inmediatamente
      setLocalPaused(newState);
      
      // ✅ Guardar en Firebase
      const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";
      await fetch(`${FB}/proxyUsers/${username}/robotPaused.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
    } catch (error) {
      console.error("Error al cambiar estado del robot:", error);
      // ✅ Revertir si falla
      setLocalPaused(!newState);
    } finally {
      setIsToggling(false);
    }
  };

  const livePostUrl = user.defaultUrl || "https://megapersonals.eu";

  // Color del header según estado
  const getHeaderColor = () => {
    if (rentalInfo.isDebt) return "from-red-600 to-red-700";
    if (!isActive) return "from-gray-600 to-gray-700";
    return "from-red-500 to-pink-600";
  };

  return (
    <div className="overflow-hidden rounded-2xl shadow-2xl">
      {/* Header */}
      <div className={cn(
        "bg-gradient-to-r p-6",
        getHeaderColor()
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
              {user.name ? user.name.charAt(0).toUpperCase() : "A"}
            </div>
            <div>
              <h3 className="text-2xl font-black text-white">
                {user.name || username}
              </h3>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  isActive ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,1)]" : "bg-gray-400"
                )} />
                <p className="text-sm font-bold text-white/90">
                  {isActive ? "✅ ACTIVO" : "⛔ INACTIVO"}
                </p>
              </div>
            </div>
          </div>
          
          <div className={cn(
            "rounded-full border-2 border-white/30 bg-white/20 px-5 py-2 text-sm font-black backdrop-blur",
            isActive ? "text-white" : "text-white/60"
          )}>
            {isActive ? "ACTIVO" : "INACTIVO"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-4 bg-gradient-to-br from-gray-900 to-black p-6">
        {/* Teléfono */}
        <div className="rounded-xl border border-pink-500/30 bg-black/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-pink-400">
            <span>📞</span>
            TELÉFONO
          </div>
          {user.phoneNumber ? (
            <div className="font-mono text-2xl font-black tracking-wide text-pink-400">
              {user.phoneNumber}
            </div>
          ) : (
            <div className="text-sm italic text-white/40">
              Detectando...
            </div>
          )}
        </div>

        {/* Tiempo de Renta */}
        <div className={cn(
          "rounded-xl border p-4",
          rentalInfo.isDebt 
            ? "border-red-500/30 bg-red-950/20"
            : "border-purple-500/30 bg-purple-950/20"
        )}>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-400">
            <span>⏰</span>
            TIEMPO DE RENTA
          </div>
          <div className={cn("text-2xl font-black", rentalInfo.color)}>
            {rentalInfo.text}
          </div>
          {rentalInfo.expires && (
            <div className="mt-1 text-xs text-white/40">
              {rentalInfo.expires}
            </div>
          )}
        </div>

        {/* Alerta de Deuda */}
        {rentalInfo.isDebt && (
          <div className="rounded-xl border-2 border-red-500 bg-red-950/40 p-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <div className="font-black text-red-400">¡CUENTA CON DEUDA!</div>
                <div className="text-sm text-red-300/80">
                  Renueva pronto o tu cuenta será eliminada
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Robot Automático */}
        {hasRobot && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-400">
                <span>🤖</span>
                ROBOT AUTOMÁTICO
              </div>
              <div className={cn(
                "rounded-full border px-3 py-1 text-xs font-black",
                localPaused
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                  : "border-green-500/30 bg-green-500/10 text-green-400"
              )}>
                {localPaused ? "⏸ PAUSADO" : "⚡ ACTIVO"}
              </div>
            </div>
            
            <Button
              onClick={handleToggleRobot}
              disabled={isToggling || !isActive}
              className={cn(
                "h-14 w-full text-base font-black",
                localPaused
                  ? "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                  : "bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800"
              )}
            >
              {isToggling ? (
                <>
                  <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Procesando...
                </>
              ) : localPaused ? (
                <>
                  <span className="mr-2 text-xl">▶️</span>
                  Reanudar Robot
                </>
              ) : (
                <>
                  <span className="mr-2 text-xl">⏸️</span>
                  Pausar Robot
                </>
              )}
            </Button>
          </div>
        )}

        {/* Notas */}
        {user.notes && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="mb-2 text-xs font-black uppercase tracking-wider text-white/60">
              📝 NOTAS
            </div>
            <div className="text-sm text-white/80">{user.notes}</div>
          </div>
        )}

        {/* Botón Ver Anuncio */}
        <Button
          onClick={() => window.open(livePostUrl, "_blank")}
          className="h-16 w-full bg-gradient-to-r from-pink-500 to-purple-600 text-lg font-black hover:from-pink-600 hover:to-purple-700"
        >
          <span className="mr-2 text-2xl">🔗</span>
          Ver Anuncio en Vivo
        </Button>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/40">
          <div>
            <span className="font-bold">ID:</span> {username}
          </div>
          <div className="text-right">
            <span className="font-bold">Actualizado:</span>{" "}
            {user.updatedAt 
              ? new Date(user.updatedAt).toLocaleDateString("es", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                })
              : "N/A"}
          </div>
        </div>
      </div>
    </div>
  );
}
