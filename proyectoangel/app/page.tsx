"use client";

import { Suspense, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginForm } from "@/components/LoginForm";
import { UnifiedAdmin } from "@/components/UnifiedAdmin";
import { ControlPanel } from "@/components/control-panel";
import { ProxyPanel } from "@/components/proxy-panel"; // 🆕 Import ProxyPanel
// import { ChatGrupal } from "@/components/chat-grupal"; // 🆕 Import Chat - COMENTADO TEMPORALMENTE
import { SERVICES, CONTACT } from "@/lib/firebase";
import { Navigation } from "@/components/navigation";
import { ServiceCard } from "@/components/service-card";
import { Chatbot } from "@/components/chatbot";
import { FlameIcon, CheckIcon } from "@/components/icons";
import Loading from "./loading";

type View = "home" | "anuncios" | "chat" | "admin";

function HomeContent() {
  const { user, userData, signOut } = useAuth();
  
  // ✅ RECUPERAR vista guardada al cargar
  const [currentView, setCurrentView] = useState<View>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("currentView");
      return (saved as View) || "home";
    }
    return "home";
  });
  
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showProxyPanel, setShowProxyPanel] = useState(false); // 🆕 Estado para panel de proxies

  const handleViewChange = (newView: View) => {
    if (newView === "admin") {
      // Si intenta ir a admin, verificar si está autenticado
      if (!user) {
        setShowAdminLogin(true); // Mostrar modal de login
        return;
      }
    }
    setCurrentView(newView);
    // ✅ GUARDAR vista en localStorage
    localStorage.setItem("currentView", newView);
    setShowAdminLogin(false); // Cerrar modal si está abierto
  };

  // Cuando el usuario inicia sesión exitosamente, cambiar a vista admin
  const handleLoginSuccess = () => {
    setShowAdminLogin(false);
    setCurrentView("admin");
    // ✅ GUARDAR vista admin
    localStorage.setItem("currentView", "admin");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation 
        currentView={currentView} 
        onViewChange={handleViewChange}
        userName={userData?.name}
        isAdmin={userData?.isAdmin}
        onLogout={user ? signOut : undefined}
      />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Home View - PÚBLICO (sin login) */}
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
                    onProxyClick={service.id === "proxy" ? () => setShowProxyPanel(true) : undefined} // 🆕 Handler para proxies
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

        {/* Anuncios View - PÚBLICO (búsqueda de anuncios) */}
        {currentView === "anuncios" && (
          <div className="space-y-6">
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent text-white text-4xl mb-6">
                🔍
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Buscar Anuncios</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Busca tus anuncios por nombre de usuario o ID único
              </p>
            </div>

            {/* Control Panel para búsqueda pública */}
            <ControlPanel initialBrowserData={null} initialError="" />
          </div>
        )}

        {/* Chat View - PÚBLICO */}
        {currentView === "chat" && (
          <div className="space-y-6">
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent text-white text-4xl mb-6">
                💬
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">Chat Grupal</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Sistema de chat para escorts y telefonistas
              </p>
              {/* <ChatGrupal /> - COMENTADO TEMPORALMENTE */}
              <div className="max-w-md mx-auto p-6 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">
                  📌 <strong>Para activar el chat:</strong><br/>
                  1. Descarga: <code className="bg-secondary px-2 py-1 rounded">chat-FINAL-CON-BADGES-ROL.tsx</code><br/>
                  2. Renómbralo a: <code className="bg-secondary px-2 py-1 rounded">chat-grupal.tsx</code><br/>
                  3. Colócalo en: <code className="bg-secondary px-2 py-1 rounded">src/components/chat-grupal.tsx</code><br/>
                  4. Descomenta las líneas en page.tsx
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Admin View - PROTEGIDO (requiere login) */}
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

      {/* ProxyPanel Modal - PÚBLICO (sin login) */}
      <ProxyPanel 
        isOpen={showProxyPanel} 
        onClose={() => setShowProxyPanel(false)} 
      />

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Megapersonals Premium. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {/* Modal de Login - Aparece cuando haces click en Admin sin estar logueado */}
      {showAdminLogin && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md">
            {/* Botón cerrar */}
            <button
              onClick={() => setShowAdminLogin(false)}
              className="absolute -top-4 -right-4 z-10 rounded-full bg-secondary p-2 text-muted-foreground hover:text-foreground transition-colors shadow-lg"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Formulario de Login */}
            <div className="bg-card rounded-2xl shadow-2xl border border-border p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Acceso Admin</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Inicia sesión con tu correo y contraseña
                </p>
              </div>
              <LoginForm onSuccess={handleLoginSuccess} />
            </div>
          </div>
        </div>
      )}
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
