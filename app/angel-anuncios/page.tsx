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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-2xl">
              👼
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Angel Anuncios</h1>
              <p className="text-sm text-muted-foreground">
                Busca y gestiona tus anuncios publicados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Search Box */}
        <div className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2 text-muted-foreground">
            <span className="text-xl">🔍</span>
            <span className="text-sm font-medium">Buscar por nombre o usuario</span>
          </div>
          
          <div className="flex gap-3">
            <Input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ejemplo: amanda, amanda2, azul..."
              className="h-12 text-base"
              disabled={searching}
            />
            <Button
              onClick={handleSearch}
              disabled={searching || !searchName.trim()}
              className="h-12 min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90"
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
          <div className="text-center py-12">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground">Buscando tus anuncios...</p>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 text-6xl">🔍</div>
            <h3 className="mb-2 text-xl font-bold text-foreground">
              No se encontraron anuncios
            </h3>
            <p className="text-sm text-muted-foreground">
              No hay anuncios publicados con el nombre "{searchName}"
            </p>
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="space-y-4">
            <div className="mb-4 text-sm text-muted-foreground">
              Se encontraron <span className="font-bold text-foreground">{results.length}</span> anuncio{results.length !== 1 ? "s" : ""}
            </div>
            
            {results.map((result) => (
              <AnuncioCard key={result.username} data={result} />
            ))}
          </div>
        )}

        {!hasSearched && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="mx-auto mb-4 text-6xl">🔍</div>
            <h3 className="mb-2 text-xl font-bold text-foreground">
              Busca tus anuncios
            </h3>
            <p className="text-sm text-muted-foreground">
              Ingresa tu nombre o usuario para ver todos tus anuncios publicados
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE DE TARJETA COMPLETA
// ═══════════════════════════════════════════════════════════════════════════

function AnuncioCard({ data }: { data: AngelRentSearchResult }) {
  const { user, username, rentalRemaining, isActive, hasRobot, isPaused } = data;
  const [isToggling, setIsToggling] = useState(false);
  const [localPaused, setLocalPaused] = useState(isPaused);

  useEffect(() => {
    setLocalPaused(isPaused);
  }, [isPaused]);

  const getRentalStatus = () => {
    if (rentalRemaining.days === 9999) return "none";
    if (rentalRemaining.isDebt) return "debt";
    if (rentalRemaining.days === 0 && rentalRemaining.hours === 0) return "critical";
    if (rentalRemaining.days === 0) return "warning";
    if (rentalRemaining.days < 2) return "caution";
    return "healthy";
  };

  const rentalStatus = getRentalStatus();

  const rentalColors = {
    none: { bg: "bg-muted", text: "text-muted-foreground", border: "border-muted", icon: "⏰", label: "Sin renta" },
    debt: { bg: "bg-destructive", text: "text-destructive-foreground", border: "border-destructive", icon: "💀", label: "DEUDA" },
    critical: { bg: "bg-destructive", text: "text-destructive-foreground", border: "border-destructive", icon: "🔴", label: "CRÍTICO" },
    warning: { bg: "bg-warning", text: "text-warning-foreground", border: "border-warning", icon: "🟡", label: "HOY" },
    caution: { bg: "bg-orange-500", text: "text-white", border: "border-orange-500", icon: "🟠", label: "URGENTE" },
    healthy: { bg: "bg-accent", text: "text-accent-foreground", border: "border-accent", icon: "🟢", label: "ACTIVO" },
  };

  const colors = rentalColors[rentalStatus];

  const handleToggleRobot = async () => {
    if (!hasRobot) return;
    
    setIsToggling(true);
    const newState = !localPaused;
    
    try {
      setLocalPaused(newState);
      
      const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";
      await fetch(`${FB}/proxyUsers/${username}/robotPaused.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
    } catch (error) {
      console.error("Error al cambiar estado del robot:", error);
      setLocalPaused(!newState);
    } finally {
      setIsToggling(false);
    }
  };

  const livePostUrl = user.defaultUrl || "https://megapersonals.eu";

  // Formatear fecha de última actualización
  const lastUpdate = user.updatedAt 
    ? new Date(user.updatedAt).toLocaleDateString("es", { 
        day: "2-digit", 
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "N/A";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 shadow-lg transition-all hover:shadow-xl">
      {/* Header de la tarjeta */}
      <div className={cn(
        "border-b p-4",
        colors.bg,
        colors.border
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl backdrop-blur-sm">
              {user.name ? user.name.charAt(0).toUpperCase() : username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className={cn("text-xl font-bold", colors.text)}>
                {user.name || username}
              </h3>
              <p className={cn("text-sm opacity-90", colors.text)}>
                {colors.icon} {colors.label}
              </p>
            </div>
          </div>
          
          {/* Badge de estado */}
          <div className={cn(
            "rounded-full border-2 px-4 py-1.5 text-sm font-bold",
            isActive 
              ? "border-white/30 bg-white/20 text-white" 
              : "border-destructive/30 bg-destructive/20 text-destructive-foreground"
          )}>
            {isActive ? "✅ ACTIVO" : "⛔ INACTIVO"}
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="p-6 space-y-6">
        {/* Grid de información */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Teléfono */}
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>📞</span>
              TELÉFONO
            </div>
            {user.phoneNumber ? (
              <div className="font-mono text-2xl font-bold text-primary">
                {user.phoneNumber}
              </div>
            ) : (
              <div className="text-sm italic text-muted-foreground">
                Auto-detectando...
              </div>
            )}
          </div>

          {/* Tiempo de Renta */}
          <div className={cn(
            "rounded-xl border p-4",
            rentalRemaining.isDebt 
              ? "border-destructive/30 bg-destructive/10"
              : "border-accent/30 bg-accent/10"
          )}>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>⏰</span>
              TIEMPO DE RENTA
            </div>
            <div className={cn(
              "text-2xl font-bold",
              rentalRemaining.isDebt ? "text-destructive" : "text-accent"
            )}>
              {AngelRentAPI.formatRentalTime(rentalRemaining)}
            </div>
            {user.rentalEnd && (
              <div className="mt-1 text-xs text-muted-foreground">
                Vence: {new Date(user.rentalEnd).toLocaleDateString("es")}
              </div>
            )}
          </div>
        </div>

        {/* Alerta de Deuda */}
        {rentalRemaining.isDebt && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/20 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-bold text-destructive">¡ATENCIÓN! Cuenta con DEUDA</div>
                <div className="text-sm text-destructive/80">
                  Tu cuenta será eliminada en 48h si no renuevas
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Robot Automático */}
        {hasRobot && (
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <span>🤖</span>
                ROBOT AUTOMÁTICO
              </div>
              <div className={cn(
                "rounded-full border px-3 py-1 text-xs font-bold",
                localPaused
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-accent/30 bg-accent/10 text-accent"
              )}>
                {localPaused ? "⏸ PAUSADO" : "⚡ ACTIVO"}
              </div>
            </div>
            
            <Button
              onClick={handleToggleRobot}
              disabled={isToggling || !isActive}
              className={cn(
                "w-full",
                localPaused
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              )}
              size="lg"
            >
              {isToggling ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Procesando...
                </>
              ) : localPaused ? (
                <>
                  <span className="mr-2 text-lg">▶️</span>
                  Reanudar Robot
                </>
              ) : (
                <>
                  <span className="mr-2 text-lg">⏸️</span>
                  Pausar Robot
                </>
              )}
            </Button>
          </div>
        )}

        {/* Información adicional */}
        <div className="grid gap-3 text-sm">
          {user.proxyHost && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <span className="text-muted-foreground">🌐 Proxy:</span>
              <span className="font-mono text-xs">{user.proxyHost}:{user.proxyPort}</span>
            </div>
          )}
          
          {user.notes && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">📝 NOTAS</div>
              <div className="text-foreground">{user.notes}</div>
            </div>
          )}
        </div>

        {/* Botón Ver Anuncio */}
        <Button
          onClick={() => window.open(livePostUrl, "_blank")}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          size="lg"
        >
          <span className="mr-2 text-lg">🔗</span>
          Ver Anuncio en Vivo
        </Button>

        {/* Footer con info técnica */}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold">ID:</span> {username}
          </div>
          <div className="text-right">
            <span className="font-semibold">Actualizado:</span> {lastUpdate}
          </div>
        </div>
      </div>
    </div>
  );
}
