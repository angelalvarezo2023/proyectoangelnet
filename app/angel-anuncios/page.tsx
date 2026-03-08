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
            <span className="text-sm font-medium">Buscar por nombre</span>
          </div>
          
          <div className="flex gap-3">
            <Input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ejemplo: Amanda, Diana, Sofia..."
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
              Ingresa tu nombre en el buscador para ver todos tus anuncios publicados
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE DE TARJETA DE ANUNCIO
// ═══════════════════════════════════════════════════════════════════════════

function AnuncioCard({ data }: { data: AngelRentSearchResult }) {
  const { user, username, rentalRemaining, isActive, hasRobot, isPaused } = data;
  const [isToggling, setIsToggling] = useState(false);
  const [localPaused, setLocalPaused] = useState(isPaused);

  // Actualizar estado local cuando cambie el dato de Firebase
  useEffect(() => {
    setLocalPaused(isPaused);
  }, [isPaused]);

  // Calcular estado de la renta
  const getRentalStatus = () => {
    if (rentalRemaining.days === 9999) return "none";
    if (rentalRemaining.isDebt) return "debt";
    if (rentalRemaining.days === 0 && rentalRemaining.hours === 0) return "critical";
    if (rentalRemaining.days === 0) return "warning";
    if (rentalRemaining.days < 2) return "caution";
    return "healthy";
  };

  const rentalStatus = getRentalStatus();

  // Colores según estado
  const rentalColors = {
    none: { bg: "bg-muted", text: "text-muted-foreground", border: "border-muted", icon: "⏰" },
    debt: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20", icon: "💀" },
    critical: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20", icon: "🔴" },
    warning: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20", icon: "🟡" },
    caution: { bg: "bg-chart-4/10", text: "text-chart-4", border: "border-chart-4/20", icon: "🟠" },
    healthy: { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20", icon: "🟢" },
  };

  const colors = rentalColors[rentalStatus];

  const handleToggleRobot = async () => {
    if (!hasRobot) return;
    
    setIsToggling(true);
    const newState = !localPaused;
    
    try {
      // Actualizar estado local inmediatamente para feedback visual
      setLocalPaused(newState);
      
      // Enviar comando a Firebase
      const FB = "https://megapersonals-control-default-rtdb.firebaseio.com";
      await fetch(`${FB}/proxyUsers/${username}/robotPaused.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
    } catch (error) {
      console.error("Error al cambiar estado del robot:", error);
      // Revertir en caso de error
      setLocalPaused(!newState);
    } finally {
      setIsToggling(false);
    }
  };

  const livePostUrl = user.defaultUrl || "https://megapersonals.eu";

  return (
    <div className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Side - Info Principal */}
        <div className="flex-1 space-y-4">
          {/* Nombre + Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold text-foreground">
              {user.name || username}
            </h3>
            
            {/* Badge Estado Activo/Inactivo */}
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                <span>✅</span>
                Activo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
                <span>❌</span>
                Inactivo
              </span>
            )}
          </div>

          {/* Grid de información */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Teléfono */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl">
                📞
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Teléfono</div>
                {user.phoneNumber ? (
                  <div className="font-mono text-sm font-bold text-foreground truncate">
                    {user.phoneNumber}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    Auto-detectando...
                  </div>
                )}
              </div>
            </div>

            {/* Tiempo de Renta */}
            <div className={cn(
              "flex items-center gap-3 rounded-xl border p-3",
              colors.bg,
              colors.border
            )}>
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg text-xl",
                colors.bg
              )}>
                {colors.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Tiempo de Renta</div>
                <div className={cn("text-sm font-bold truncate", colors.text)}>
                  {AngelRentAPI.formatRentalTime(rentalRemaining)}
                </div>
              </div>
            </div>
          </div>

          {/* Alerta de Deuda */}
          {rentalRemaining.isDebt && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
              <span className="mr-1.5">⚠️</span>
              <strong>Atención:</strong> Tu cuenta tiene deuda. Será eliminada en 48h si no renuevas.
            </div>
          )}

          {/* Notas (si existen) */}
          {user.notes && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
              📝 {user.notes}
            </div>
          )}
        </div>

        {/* Right Side - Acciones */}
        <div className="flex flex-col gap-3 lg:w-64">
          {/* Estado del Robot */}
          {hasRobot && (
            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                🤖 Robot Automático
              </div>
              <Button
                onClick={handleToggleRobot}
                disabled={isToggling || !isActive}
                className={cn(
                  "w-full",
                  localPaused
                    ? "bg-accent/10 text-accent hover:bg-accent/20"
                    : "bg-chart-4/10 text-chart-4 hover:bg-chart-4/20"
                )}
              >
                {isToggling ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Cambiando...
                  </>
                ) : localPaused ? (
                  <>
                    <span className="mr-2">▶️</span>
                    Reanudar Robot
                  </>
                ) : (
                  <>
                    <span className="mr-2">⏸️</span>
                    Pausar Robot
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Ver Anuncio en Vivo */}
          <Button
            onClick={() => window.open(livePostUrl, "_blank")}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            size="lg"
          >
            <span className="mr-2">🔗</span>
            Ver Anuncio en Vivo
          </Button>

          {/* Username (info técnica) */}
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">ID de cuenta</div>
            <div className="font-mono text-xs font-medium text-foreground">
              {username}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
