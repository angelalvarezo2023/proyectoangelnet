"use client";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { HomeIcon, SettingsIcon, ShieldIcon } from "@/components/icons";
import Image from "next/image";

type View = "home" | "control" | "admin" | "proxies";

interface NavigationProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const navItems: { id: View; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "Servicios", icon: HomeIcon },
  { id: "control", label: "Panel", icon: SettingsIcon },
  { id: "proxies", label: "Proxies", icon: ShieldIcon },
  { id: "admin", label: "Admin", icon: ShieldIcon },
];

export function Navigation({ currentView, onViewChange }: NavigationProps) {
  const { userData, signOut, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-primary/30 shadow-lg shadow-primary/20">
            <Image
              src="/logo.png"
              alt="Megapersonals Logo"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="hidden sm:block">
            <h1 className="bg-gradient-to-r from-primary via-pink-400 to-accent bg-clip-text text-xl font-bold text-transparent">
              Megapersonals
            </h1>
            <p className="text-xs text-muted-foreground">Premium Services</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 rounded-xl bg-secondary/50 p-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            // Ocultar "Admin" si no es admin
            if (item.id === "admin" && !isAdmin) {
              return null;
            }
            
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User info & Status */}
        <div className="flex items-center gap-3">
          {/* User info */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border">
            <span className="text-sm font-medium text-foreground">
              {userData?.name || 'Usuario'}
            </span>
            {isAdmin && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">
                ADMIN
              </span>
            )}
          </div>

          {/* Status indicator */}
          <div className="hidden lg:flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 border border-primary/20">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary shadow-lg shadow-primary/50" />
            <span className="text-sm font-medium text-primary">Online</span>
          </div>

          {/* Logout button */}
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Cerrar sesión"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden md:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
