"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FirebaseAPI, type BrowserData } from "@/lib/firebase";
import {
  LockIcon,
  PlusIcon,
  LinkIcon,
  UsersIcon,
  ClockIcon,
  WifiIcon,
  WifiOffIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XIcon,
  TrashIcon,
} from "@/components/icons";
import { Dashboard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminPanelProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

function getConnectionStatus(browser: BrowserData) {
  const now = new Date().getTime();
  const lastHeartbeat = browser.lastHeartbeat ? new Date(browser.lastHeartbeat).getTime() : 0;
  const timeSinceHeartbeat = now - lastHeartbeat;

  if (!browser.lastHeartbeat || timeSinceHeartbeat > 15000) {
    return {
      status: "offline" as const,
      label: "Desconectado",
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      icon: WifiOffIcon,
      pulse: false,
    };
  }

  if (browser.consecutiveErrors && browser.consecutiveErrors > 3) {
    return {
      status: "error" as const,
      label: `Error (${browser.consecutiveErrors})`,
      color: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/20",
      icon: AlertTriangleIcon,
      pulse: true,
    };
  }

  if (browser.isPaused) {
    return {
      status: "paused" as const,
      label: "Pausado",
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
      borderColor: "border-chart-4/20",
      icon: ClockIcon,
      pulse: false,
    };
  }

  if (browser.editInProgress) {
    return {
      status: "editing" as const,
      label: "Editando",
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
      icon: CheckCircleIcon,
      pulse: true,
    };
  }

  return {
    status: "online" as const,
    label: "Activo",
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/20",
    icon: WifiIcon,
    pulse: false,
  };
}

// 🆕 MODIFICADO: Detecta y muestra DEUDA
function formatRentalTime(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "Sin renta";
  
  // 🆕 DETECTAR DEUDA
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  
  if (isDebt) {
    const absDays = Math.abs(rental.days);
    const parts = [];
    if (absDays > 0) parts.push(`${absDays}d`);
    if (rental.hours > 0) parts.push(`${rental.hours}h`);
    if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
    return parts.join(" ");
  }
  
  if (rental.days === 0 && rental.hours === 0 && rental.minutes === 0) return "Expirada";
  const parts = [];
  if (rental.days > 0) parts.push(`${rental.days}d`);
  if (rental.hours > 0) parts.push(`${rental.hours}h`);
  if (rental.minutes > 0) parts.push(`${rental.minutes}m`);
  return parts.join(" ");
}

// 🆕 MODIFICADO: Incluye estado "debt"
function getRentalStatus(rental: BrowserData["rentalRemaining"]) {
  if (!rental || rental.days === -1) return "neutral";
  
  // 🆕 PRIORIDAD: Detectar deuda
  const isDebt = rental.days < 0 || (rental as any).isDebt === true;
  if (isDebt) return "debt";
  
  if (rental.days === 0 && rental.hours === 0) return "critical";
  if (rental.days === 0) return "warning";
  if (rental.days < 2) return "caution";
  return "healthy";
}

export function AdminPanel({ isAuthenticated, onLogin, isOpen = true, onClose }: AdminPanelProps) {
  const [browsers, setBrowsers] = useState<Record<string, BrowserData>>({});
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserData | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", days: "", hours: "" });
  const [creating, setCreating] = useState(false);
  
  const [showRentalModal, setShowRentalModal] = useState(false);
  const [rentalBrowser, setRentalBrowser] = useState<BrowserData | null>(null);
  const [rentalDays, setRentalDays] = useState("");
  const [rentalHours, setRentalHours] = useState("");
  const [adjustingRental, setAdjustingRental] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBrowser, setDeleteBrowser] = useState<BrowserData | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const unsubscribe = FirebaseAPI.listenToAllBrowsers(setBrowsers);
      return () => unsubscribe();
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    if (password === "admin123") {
      onLogin();
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.name.trim()) {
      alert("Ingresa un nombre");
      return;
    }

    const days = Number.parseInt(newUser.days) || 0;
    const hours = Number.parseInt(newUser.hours) || 0;

    if (days === 0 && hours === 0) {
      alert("Ingresa días u horas");
      return;
    }

    setCreating(true);
    const result = await FirebaseAPI.createManualUser(newUser.name.trim(), days, hours);

    if (result.success) {
      const baseUrl = window.location.origin + window.location.pathname;
      const userLink = `${baseUrl}?id=${result.uniqueId}`;
      navigator.clipboard.writeText(userLink);
      alert(`Usuario "${newUser.name}" creado\n\nLink copiado:\n${userLink}`);
      setNewUser({ name: "", days: "", hours: "" });
      setShowCreateForm(false);
    } else {
      alert(`Error: ${result.error}`);
    }

    setCreating(false);
  };

  const generateUserLink = (browser: BrowserData) => {
    const baseUrl = window.location.origin + window.location.pathname;
    if (browser.uniqueId) {
      return `${baseUrl}?id=${encodeURIComponent(browser.uniqueId)}`;
    }
    const browserName = browser.browserName;
    return `${baseUrl}?user=${encodeURIComponent(browserName)}`;
  };

  const handleCopyLink = async (browser: BrowserData) => {
    const browserName = browser.browserName;

    if (!browser.uniqueId) {
      const uniqueId = await FirebaseAPI.generateUniqueId(browserName);
      if (uniqueId) {
        browser.uniqueId = uniqueId;
      } else {
        alert("Error generando ID único");
        return;
      }
    }

    const link = generateUserLink(browser);
    navigator.clipboard.writeText(link);
    alert("Link copiado");
  };

  const handleOpenRentalModal = (browser: BrowserData) => {
    setRentalBrowser(browser);
    setRentalDays("");
    setRentalHours("");
    setShowRentalModal(true);
  };

  const calculatePreviewRental = (action: "establecer" | "agregar") => {
    if (!rentalBrowser) return null;

    const days = Number.parseInt(rentalDays) || 0;
    const hours = Number.parseInt(rentalHours) || 0;

    if (days === 0 && hours === 0) return null;

    let newDate = new Date();

    if (action === "establecer") {
      newDate.setDate(newDate.getDate() + days);
      newDate.setHours(newDate.getHours() + hours);
    } else {
      if (rentalBrowser.rentalExpiration && !isRentalExpired(rentalBrowser.rentalRemaining)) {
        newDate = new Date(rentalBrowser.rentalExpiration);
      }
      newDate.setDate(newDate.getDate() + days);
      newDate.setHours(newDate.getHours() + hours);
    }

    const diff = newDate.getTime() - Date.now();
    const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    const totalHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const totalMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return {
      days: totalDays,
      hours: totalHours,
      minutes: totalMinutes,
      formatted: formatRentalTime({ days: totalDays, hours: totalHours, minutes: totalMinutes })
    };
  };

  const isRentalExpired = (rental: BrowserData["rentalRemaining"]) => {
    if (!rental || rental.days === -1) return true;
    return rental.days === 0 && rental.hours === 0 && rental.minutes === 0;
  };

  const handleAdjustRental = async (action: "establecer" | "agregar") => {
    if (!rentalBrowser) return;

    const days = Number.parseInt(rentalDays) || 0;
    const hours = Number.parseInt(rentalHours) || 0;

    if (days === 0 && hours === 0) {
      alert("Ingresa días u horas");
      return;
    }

    setAdjustingRental(true);

    try {
      const result = await FirebaseAPI.sendCommand(
        rentalBrowser.browserName,
        "adjustRental",
        { days, hours, action }
      );

      if (result.success) {
        alert(`Renta ${action === "establecer" ? "establecida" : "agregada"} correctamente`);
        setShowRentalModal(false);
        setRentalDays("");
        setRentalHours("");
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert("Error al ajustar la renta");
    } finally {
      setAdjustingRental(false);
    }
  };

  const handleOpenDeleteModal = (browser: BrowserData) => {
    setDeleteBrowser(browser);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteBrowser) return;

    setDeleting(true);

    try {
      const result = await FirebaseAPI.deleteBrowser(deleteBrowser.browserName);

      if (result.success) {
        alert(`Usuario "${deleteBrowser.browserName}" eliminado correctamente`);
        setShowDeleteModal(false);
        setDeleteBrowser(null);
      } else {
        alert(`Error al eliminar: ${result.error}`);
      }
    } catch (error) {
      alert("Error al eliminar el usuario");
    } finally {
      setDeleting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
              <LockIcon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Panel Admin</h2>
            <p className="text-sm text-muted-foreground">Ingresa tu contraseña para continuar</p>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Contraseña"
              className="h-12 bg-input text-foreground"
            />

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
                {error}
              </div>
            )}

            <Button onClick={handleLogin} className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Ingresar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const browserList = Object.entries(browsers).map(([name, data]) => ({
    name,
    ...data,
  }));

  browserList.sort((a, b) => {
    const statusA = getConnectionStatus(a);
    const statusB = getConnectionStatus(b);

    if (statusA.status === "offline" && statusB.status !== "offline") return -1;
    if (statusA.status !== "offline" && statusB.status === "offline") return 1;
    if (statusA.status === "error" && statusB.status !== "error") return -1;
    if (statusA.status !== "error" && statusB.status === "error") return 1;

    const getRentalDays = (browser: BrowserData) => {
      if (!browser.rentalRemaining || browser.rentalRemaining.days === -1) return 999;
      return browser.rentalRemaining.days + browser.rentalRemaining.hours / 24;
    };
    return getRentalDays(a) - getRentalDays(b);
  });

  const stats = {
    total: browserList.length,
    online: browserList.filter((b) => getConnectionStatus(b).status === "online").length,
    offline: browserList.filter((b) => getConnectionStatus(b).status === "offline").length,
    error: browserList.filter((b) => getConnectionStatus(b).status === "error").length,
    paused: browserList.filter((b) => getConnectionStatus(b).status === "paused").length,
    // 🆕 Contar usuarios con DEUDA
    debt: browserList.filter((b) => {
      const rental = b.rentalRemaining;
      return rental && (rental.days < 0 || (rental as any).isDebt === true);
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Create User Section */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <PlusIcon className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Crear Usuario</h3>
              <p className="text-sm text-muted-foreground">Agrega un nuevo usuario al sistema</p>
            </div>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? "outline" : "default"}
            className={cn(!showCreateForm && "bg-accent text-accent-foreground hover:bg-accent/90")}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            {showCreateForm ? "Cancelar" : "Nuevo"}
          </Button>
        </div>

        {showCreateForm && (
          <div className="mt-4 space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
            <Input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              placeholder="Nombre del usuario"
              className="bg-input text-foreground"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                value={newUser.days}
                onChange={(e) => setNewUser({ ...newUser, days: e.target.value })}
                placeholder="Días"
                min="0"
                className="bg-input text-foreground"
              />
              <Input
                type="number"
                value={newUser.hours}
                onChange={(e) => setNewUser({ ...newUser, hours: e.target.value })}
                placeholder="Horas"
                min="0"
                className="bg-input text-foreground"
              />
            </div>

            <Button
              onClick={handleCreateUser}
              disabled={creating}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {creating ? "Creando..." : "Crear Usuario"}
            </Button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <UsersIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Monitoreo en Tiempo Real</h3>
              <p className="text-sm text-muted-foreground">
                {stats.total} usuarios • {stats.online} activos • {stats.offline} desconectados • {stats.error} con errores
                {/* 🆕 Mostrar contador de deudas */}
                {stats.debt > 0 && <span className="text-red-500 font-bold"> • {stats.debt} CON DEUDA 💀</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Navegador
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cliente
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Teléfono
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Renta
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Heartbeat
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {browserList.map((browser, idx) => {
                const connectionStatus = getConnectionStatus(browser);
                const rentalStatus = getRentalStatus(browser.rentalRemaining);
                const StatusIcon = connectionStatus.icon;

                const lastHeartbeatTime = browser.lastHeartbeat
                  ? Math.floor((Date.now() - new Date(browser.lastHeartbeat).getTime()) / 1000)
                  : null;

                // 🆕 Detectar DEUDA
                const isDebt = browser.rentalRemaining && 
                              (browser.rentalRemaining.days < 0 || 
                               (browser.rentalRemaining as any).isDebt === true);

                return (
                  <tr
                    key={idx}
                    className={cn(
                      "transition-colors hover:bg-secondary/20",
                      connectionStatus.status === "offline" && "bg-destructive/5",
                      connectionStatus.status === "error" && "bg-warning/5",
                      isDebt && "bg-red-600/10" // 🆕 Fondo rojo para deudas
                    )}
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-2 w-2 rounded-full", connectionStatus.pulse && "animate-pulse")}>
                          <div
                            className={cn(
                              "h-full w-full rounded-full",
                              connectionStatus.status === "online" && "bg-accent",
                              connectionStatus.status === "offline" && "bg-destructive",
                              connectionStatus.status === "error" && "bg-warning",
                              connectionStatus.status === "paused" && "bg-chart-4",
                              connectionStatus.status === "editing" && "bg-primary"
                            )}
                          />
                        </div>
                        <span className="font-medium text-foreground">{browser.browserName || browser.name}</span>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm font-medium text-primary">
                        {browser.clientName || "Sin asignar"}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                            connectionStatus.bgColor,
                            connectionStatus.color,
                            connectionStatus.borderColor
                          )}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {connectionStatus.label}
                        </span>

                        {browser.lastError && (
                          <span
                            className="max-w-[200px] truncate text-xs text-destructive"
                            title={browser.lastError.message}
                          >
                            {browser.lastError.context}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                      {browser.phoneNumber || "N/A"}
                    </td>

                    {/* 🆕 COLUMNA DE RENTA MODIFICADA - Muestra DEUDA claramente */}
                    <td className="whitespace-nowrap px-6 py-4">
                      {(() => {
                        if (isDebt) {
                          const absDays = Math.abs(browser.rentalRemaining!.days);
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-red-600 font-black animate-pulse text-lg">💀</span>
                                <span className="font-bold text-red-600">
                                  DEUDA: {absDays}d {browser.rentalRemaining!.hours}h
                                </span>
                              </div>
                              <span className="text-xs text-red-400 font-semibold">
                                ⚠️ Será eliminado en 48h
                              </span>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="flex items-center gap-2">
                            <ClockIcon
                              className={cn(
                                "h-4 w-4",
                                rentalStatus === "healthy" && "text-accent",
                                rentalStatus === "caution" && "text-chart-4",
                                rentalStatus === "warning" && "text-warning",
                                rentalStatus === "critical" && "text-destructive",
                                rentalStatus === "neutral" && "text-muted-foreground"
                              )}
                            />
                            <span
                              className={cn(
                                "font-medium",
                                rentalStatus === "healthy" && "text-accent",
                                rentalStatus === "caution" && "text-chart-4",
                                rentalStatus === "warning" && "text-warning",
                                rentalStatus === "critical" && "text-destructive",
                                rentalStatus === "neutral" && "text-muted-foreground"
                              )}
                            >
                              {formatRentalTime(browser.rentalRemaining)}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      {lastHeartbeatTime !== null ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            lastHeartbeatTime < 10 && "text-accent",
                            lastHeartbeatTime >= 10 && lastHeartbeatTime < 15 && "text-warning",
                            lastHeartbeatTime >= 15 && "text-destructive"
                          )}
                        >
                          {lastHeartbeatTime < 60 ? `${lastHeartbeatTime}s` : `${Math.floor(lastHeartbeatTime / 60)}m`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedBrowser(browser)}>
                          Ver
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleCopyLink(browser)}
                          className="bg-accent/10 text-accent hover:bg-accent/20"
                        >
                          <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                          Link
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleOpenRentalModal(browser)}
                          className="bg-primary/10 text-primary hover:bg-primary/20"
                        >
                          <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
                          Renta
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleOpenDeleteModal(browser)}
                          className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {browserList.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <UsersIcon className="mx-auto mb-3 h-12 w-12 opacity-50" />
              <p>No hay usuarios. Crea uno arriba.</p>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Modal */}
      {selectedBrowser && <Dashboard browserData={selectedBrowser} onClose={() => setSelectedBrowser(null)} />}

      {/* Modal de Ajuste de Renta */}
      {showRentalModal && rentalBrowser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <ClockIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Ajustar Tiempo de Renta</h3>
                  <p className="text-sm text-muted-foreground">{rentalBrowser.browserName}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowRentalModal(false)}
                className="rounded-xl"
              >
                <XIcon className="h-5 w-5" />
              </Button>
            </div>

            <div className="mb-6 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="mb-2 text-sm font-medium text-muted-foreground">📅 Renta Actual</div>
              <div className="text-2xl font-bold text-foreground">
                {formatRentalTime(rentalBrowser.rentalRemaining)}
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Días</label>
                  <Input
                    type="number"
                    value={rentalDays}
                    onChange={(e) => setRentalDays(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="bg-input text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Horas</label>
                  <Input
                    type="number"
                    value={rentalHours}
                    onChange={(e) => setRentalHours(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="bg-input text-foreground"
                  />
                </div>
              </div>
            </div>

            {(rentalDays || rentalHours) && (
              <div className="mb-6 space-y-3">
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="mb-2 text-sm font-medium text-muted-foreground">✅ Vista Previa (Establecer)</div>
                  <div className="text-xl font-bold text-accent">
                    {calculatePreviewRental("establecer")?.formatted || "0d 0h"}
                  </div>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-2 text-sm font-medium text-muted-foreground">➕ Vista Previa (Agregar)</div>
                  <div className="text-xl font-bold text-primary">
                    {calculatePreviewRental("agregar")?.formatted || "0d 0h"}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Button
                onClick={() => handleAdjustRental("establecer")}
                disabled={adjustingRental || (!rentalDays && !rentalHours)}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {adjustingRental ? "Procesando..." : "✅ Establecer Nueva Renta"}
              </Button>

              <Button
                onClick={() => handleAdjustRental("agregar")}
                disabled={adjustingRental || (!rentalDays && !rentalHours)}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {adjustingRental ? "Procesando..." : "➕ Agregar Tiempo"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setShowRentalModal(false)}
                disabled={adjustingRental}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>

            <div className="mt-4 rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1"><strong>✅ Establecer:</strong> Sobrescribe la renta actual con el nuevo tiempo.</p>
              <p><strong>➕ Agregar:</strong> Suma el tiempo al que ya tiene el usuario.</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteModal && deleteBrowser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-destructive bg-card p-6 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                <TrashIcon className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mb-2 text-2xl font-bold text-foreground">¿Eliminar Usuario?</h3>
              <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer</p>
            </div>

            <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Navegador</div>
              <div className="mb-3 text-lg font-bold text-foreground">{deleteBrowser.browserName}</div>
              
              <div className="mb-1 text-xs font-medium text-muted-foreground">Cliente</div>
              <div className="text-base font-semibold text-primary">
                {deleteBrowser.clientName || "Sin asignar"}
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-warning">
              ⚠️ Se eliminará toda la información incluyendo comandos, notificaciones y datos de Firebase.
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Eliminando..." : "🗑️ Confirmar Eliminación"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteBrowser(null);
                }}
                disabled={deleting}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
