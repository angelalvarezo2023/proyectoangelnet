"use client";

import { Suspense, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginForm } from "@/components/LoginForm";
import { UnifiedAdmin } from "@/components/UnifiedAdmin";
import { SERVICES, CONTACT } from "@/lib/firebase";
import { Navigation } from "@/components/navigation";
import { ServiceCard } from "@/components/service-card";
import { Chatbot } from "@/components/chatbot";
import { FlameIcon, CheckIcon } from "@/components/icons";
import Loading from "./loading";

type View = "home" | "admin";

function HomeContent() {
  const { user, userData, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<View>("home");

  // Mostrar loading mientras verifica autenticación
  if (authLoading) {
    return <Loading />;
  }

  // Si no hay usuario autenticado, mostrar login
  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation 
        currentView={currentView} 
        onViewChange={(view) => setCurrentView(view)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Home View - Services */}
        {currentView === "home" && (
          <div className="space-y-12">
            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-secondary/50 p-8 md:p-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--primary)/.1)_0%,transparent_50%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(var(--accent)/.1)_0%,transparent_50%)]" />

              <div className="relative">
                <div className="mx-auto max-w-3xl text-center">
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary">
                    <FlameIcon className="h-4 w-4" />
                    <span>Servicio #1 en el Mercado</span>
                  </div>

                  <h1 className="mb-4 text-balance text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                    Megapersonals{" "}
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Premium</span>
                  </h1>

                  <p className="mb-8 text-pretty text-lg text-muted-foreground md:text-xl">
                    Servicios profesionales de alta calidad. Proxies, cuentas verificadas y soporte 24/7.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
                        <CheckIcon className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <span className="text-sm text-muted-foreground">Entrega Inmediata</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
                        <CheckIcon className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <span className="text-sm text-muted-foreground">Soporte 24/7</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
                        <CheckIcon className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <span className="text-sm text-muted-foreground">Garantía Incluida</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Services Grid */}
            <section>
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold text-foreground">Nuestros Servicios</h2>
                <p className="text-muted-foreground">Selecciona el servicio que mejor se adapte a tus necesidades</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {SERVICES.map((service) => (
                  <ServiceCard 
                    key={service.id} 
                    service={service}
                  />
                ))}
              </div>
            </section>

            {/* Contact Section */}
            <section className="rounded-2xl border border-border bg-card p-8 text-center">
              <h3 className="mb-2 text-xl font-semibold text-foreground">¿Tienes preguntas?</h3>
              <p className="mb-6 text-muted-foreground">Contáctanos y te ayudaremos con lo que necesites</p>
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
                <a
                  href={`https://wa.me/${CONTACT.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl bg-accent/10 px-4 py-2 text-accent transition-colors hover:bg-accent/20"
                >
                  <span>WhatsApp: +1 {CONTACT.whatsapp}</span>
                </a>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-primary transition-colors hover:bg-primary/20"
                >
                  <span>{CONTACT.email}</span>
                </a>
              </div>
            </section>
          </div>
        )}

        {/* Admin View - Panel Unificado */}
        {currentView === "admin" && (
          <ProtectedRoute requireAdmin={true}>
            <UnifiedAdmin 
              isOpen={true}
              onClose={() => setCurrentView("home")}
            />
          </ProtectedRoute>
        )}
      </main>

      {/* Chatbot */}
      <Chatbot />

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Megapersonals Premium. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <HomeContent />
      </Suspense>
    </AuthProvider>
  );
}
