"use client";

import { useState } from "react";
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
    setClientSearch("");
  };

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <SettingsIcon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Panel de Control</h2>
            <p className="text-sm text-muted-foreground">Busca tu cuenta por nombre del cliente</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Nombre del cliente"
                className="h-12 flex-1 bg-input text-foreground"
                disabled={searching}
              />
              <Button
                onClick={handleSearch}
                disabled={searching}
                className="h-12 bg-accent px-6 text-accent-foreground hover:bg-accent/90"
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                {searching ? "Buscando..." : "Buscar"}
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
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {browserList.length} {browserList.length === 1 ? "perfil encontrado" : "perfiles encontrados"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Selecciona un perfil para ver detalles
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {browserList.map((browser) => (
                <div
                  key={browser.browserName}
                  onClick={() => handleSelectBrowser(browser)}
                  className="group cursor-pointer rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:bg-card/80 hover:shadow-lg"
                >
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          browser.isPaused 
                            ? "bg-yellow-500/20" 
                            : "bg-green-500/20"
                        )}
                      >
                        <div
                          className={cn(
                            "h-3 w-3 rounded-full",
                            browser.isPaused 
                              ? "bg-yellow-400" 
                              : "animate-pulse bg-green-400"
                          )}
                        />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">
                          {browser.browserName}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {browser.isPaused ? "Pausado" : "Activo"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    {browser.phoneNumber && browser.phoneNumber !== "Manual" && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <PhoneIcon className="h-4 w-4" />
                        <span>{browser.phoneNumber}</span>
                      </div>
                    )}
                    {browser.city && browser.city !== "Manual" && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPinIcon className="h-4 w-4" />
                        <span>{browser.city}</span>
                      </div>
                    )}
                    {browser.postName && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <UserIcon className="h-4 w-4" />
                        <span className="truncate">{browser.postName}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Renta:</span>{" "}
                      <span className={cn(
                        "font-semibold",
                        browser.rentalRemaining?.days === 0 
                          ? "text-destructive" 
                          : "text-accent"
                      )}>
                        {formatRentalTime(browser.rentalRemaining)}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Ver detalles →
                    </div>
                  </div>
                </div>
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
