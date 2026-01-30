"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProxyPanel } from "@/components/proxy-panel";
import { AdminPanel } from "@/components/admin-panel";
import { StatsPanel } from "@/components/StatsPanel";
import { cn } from "@/lib/utils";

type AdminSection = "anuncios" | "estadisticas" | "proxies" | "megabot";

interface UnifiedAdminProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UnifiedAdmin({ isOpen, onClose }: UnifiedAdminProps) {
  const { userData } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("anuncios");
  const [showProxyPanel, setShowProxyPanel] = useState(false);
  const [showMegaBotPanel, setShowMegaBotPanel] = useState(false);

  if (!isOpen) return null;

  const sections = [
    {
      id: "anuncios" as AdminSection,
      label: "📢 Anuncios",
      description: "Gestión de usuarios y anuncios",
      color: "from-blue-500 to-cyan-500",
    },
    {
      id: "estadisticas" as AdminSection,
      label: "📊 Estadísticas",
      description: "Métricas y rendimiento semanal",
      color: "from-purple-500 to-pink-500",
    },
    {
      id: "proxies" as AdminSection,
      label: "🌐 Proxies",
      description: "Verificación y gestión de proxies",
      color: "from-cyan-500 to-teal-500",
    },
    {
      id: "megabot" as AdminSection,
      label: "🤖 MegaBot PRO",
      description: "Panel de administración de bots",
      color: "from-pink-500 to-purple-500",
    },
  ];

  // 🎯 SI ESTÁ EN "ANUNCIOS" O "ESTADISTICAS", RENDERIZAR EN PANTALLA COMPLETA
  if (activeSection === "anuncios" || activeSection === "estadisticas") {
    return (
      <>
        {/* Header fijo con navegación */}
        <div className="fixed top-0 left-0 right-0 z-[60] border-b border-border bg-card">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Volver"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-bold text-foreground">🛡️ Panel de Administración</h2>
                <p className="text-sm text-muted-foreground">Bienvenido, {userData?.name}</p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-t border-border bg-secondary/30 px-4">
            <nav className="flex gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all",
                    activeSection === section.id
                      ? "border-primary text-foreground bg-background/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Contenido con padding-top para el header */}
        <div className="pt-[136px] min-h-screen bg-background">
          {activeSection === "anuncios" && (
            <AdminPanel 
              isAuthenticated={true}
              onLogin={() => {}}
            />
          )}
          
          {activeSection === "estadisticas" && (
            <StatsPanel />
          )}
        </div>
      </>
    );
  }

  // PARA PROXIES Y MEGABOT, USAR EL MODAL NORMAL
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  🛡️ Panel de Administración
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Bienvenido, {userData?.name}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-border bg-secondary/30 px-6">
            <nav className="flex gap-2 -mb-px">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all",
                    activeSection === section.id
                      ? "border-primary text-foreground bg-background/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Proxies Section */}
            {activeSection === "proxies" && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white text-4xl mb-4">
                    🌐
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Gestión de Proxies</h3>
                  <p className="text-muted-foreground mb-6">
                    Verifica el estado de tus proxies y gestiona la conexión
                  </p>
                  <button
                    onClick={() => setShowProxyPanel(true)}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white font-semibold text-lg shadow-lg transition-all"
                  >
                    🔍 Verificar Proxy
                  </button>
                </div>

                {/* Info cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-primary mb-2">15</div>
                    <p className="text-sm text-muted-foreground">Proxies Activos</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-green-400 mb-2">99.9%</div>
                    <p className="text-sm text-muted-foreground">Uptime</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-yellow-400 mb-2">45ms</div>
                    <p className="text-sm text-muted-foreground">Latencia Promedio</p>
                  </div>
                </div>
              </div>
            )}

            {/* MegaBot PRO Section */}
            {activeSection === "megabot" && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-4xl mb-4">
                    🤖
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">MegaBot PRO</h3>
                  <p className="text-muted-foreground mb-6">
                    Panel de administración de bots y automatización
                  </p>
                  <button
                    onClick={() => setShowMegaBotPanel(true)}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold text-lg shadow-lg transition-all"
                  >
                    🚀 Abrir Panel de Bots
                  </button>
                </div>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-foreground mb-2">14</div>
                    <p className="text-sm text-muted-foreground">Total Bots</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-green-400 mb-2">14</div>
                    <p className="text-sm text-muted-foreground">Activos</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-purple-400 mb-2">9</div>
                    <p className="text-sm text-muted-foreground">PRO</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
                    <div className="text-3xl font-bold text-primary mb-2">$599</div>
                    <p className="text-sm text-muted-foreground">Ingresos/Mes</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals secundarios */}
      <ProxyPanel 
        isOpen={showProxyPanel} 
        onClose={() => setShowProxyPanel(false)} 
      />

      {showMegaBotPanel && (
        <AdminPanel 
          isAuthenticated={true}
          onLogin={() => {}}
        />
      )}
    </>
  );
}
