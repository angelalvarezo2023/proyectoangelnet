"use client";

import { useState } from "react";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { SearchIcon, SettingsIcon } from "@/components/icons";
import { Dashboard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ControlPanelProps {
  initialBrowserData?: BrowserData | null;
  initialError?: string;
}

export function ControlPanel({ initialBrowserData, initialError }: ControlPanelProps) {
  const [phoneSearch, setPhoneSearch] = useState("");
  const [browserData, setBrowserData] = useState<BrowserData | null>(initialBrowserData || null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(initialError || "");

  const handleSearch = async () => {
    if (!phoneSearch.trim()) {
      setError("Ingresa un número");
      return;
    }

    setSearching(true);
    setError("");
    setBrowserData(null);

    const data = await FirebaseAPI.findBrowser(phoneSearch);
    if (data) {
      setBrowserData(data);
    } else {
      setError("No se encontró el usuario");
    }

    setSearching(false);
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
            <p className="text-sm text-muted-foreground">Busca tu cuenta por número de teléfono</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Número de teléfono"
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
      </div>

      {browserData && <Dashboard browserData={browserData} onClose={() => setBrowserData(null)} />}
    </>
  );
}
