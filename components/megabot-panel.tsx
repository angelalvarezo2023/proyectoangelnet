"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@/components/icons";

// Configuración de MegaBot
const MEGABOT_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwjkp_ahJXrKuCVfOeDR6anu3M_7XSF8eOPmGHrpwt_hBfkdCEX8GsK2jbvT7HyXShMCg/exec",
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1URJ0e0znn1gCZjhI1BROP-UgZb-P9X45uM1v4S7NkRQ/export?format=csv",
  PRECIO_PRO: 49.99,
  PRECIO_BASICO: 29.99,
};

type PanelView = "select" | "client-login" | "client-control" | "admin-login" | "admin-dashboard";

interface MegaBotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ClientData {
  clave: string;
  cliente: string;
  plan: string;
  diasRestantes: number;
  pausado: boolean;
  pausadoTodas: boolean;
}

interface ClienteData {
  clave: string;
  cliente: string;
  expiracion: string;
  diasRestantes: number;
  activo: boolean;
  plan: string;
  pausado: boolean;
}

export function MegaBotPanel({ isOpen, onClose }: MegaBotPanelProps) {
  const [view, setView] = useState<PanelView>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Cliente state
  const [clientKey, setClientKey] = useState("");
  const [clientData, setClientData] = useState<ClientData | null>(null);
  
  // Admin state
  const [adminPassword, setAdminPassword] = useState("");
  const [clientesData, setClientesData] = useState<ClienteData[]>([]);
  const [adminStats, setAdminStats] = useState({
    total: 0,
    activos: 0,
    pro: 0,
    vencen: 0,
    expirados: 0,
    ingresos: 0,
  });
  
  // Generator state
  const [genName, setGenName] = useState("");
  const [genPlan, setGenPlan] = useState("basico");
  const [genDuration, setGenDuration] = useState("30");
  const [genWhatsapp, setGenWhatsapp] = useState("");
  const [generatedKey, setGeneratedKey] = useState<{key: string; expiry: string} | null>(null);
  
  // Admin tabs
  const [adminTab, setAdminTab] = useState<"generator" | "clients" | "alerts">("generator");

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setView("select");
      setError("");
      setSuccess("");
      setClientKey("");
      setClientData(null);
      setAdminPassword("");
    }
  }, [isOpen]);

  // Auto-login check
  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem("megabot_client_key");
      if (savedKey) {
        setClientKey(savedKey);
        handleClientLogin(savedKey);
      }
      if (localStorage.getItem("megabot_admin") === "true") {
        setView("admin-dashboard");
        loadAdminData();
      }
    }
  }, [isOpen]);

  // API Call
  const callAPI = async (action: string, params: Record<string, string> = {}) => {
    try {
      const url = new URL(MEGABOT_CONFIG.API_URL);
      url.searchParams.append("action", action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      const response = await fetch(url.toString());
      return await response.json();
    } catch (err) {
      console.error("API Error:", err);
      return { error: "Error de conexión" };
    }
  };

  // Client Login
  const handleClientLogin = async (key?: string) => {
    const clave = (key || clientKey).trim().toUpperCase();
    if (!clave) {
      setError("Ingresa tu clave");
      return;
    }

    setLoading(true);
    setError("");

    const result = await callAPI("verificar", { clave });

    setLoading(false);

    if (result.encontrada) {
      localStorage.setItem("megabot_client_key", clave);
      setClientData({
        clave,
        cliente: result.cliente,
        plan: result.plan,
        diasRestantes: result.diasRestantes,
        pausado: result.pausado === "SI",
        pausadoTodas: result.pausadoTodas === "SI",
      });
      setView("client-control");
    } else {
      setError("Clave no encontrada");
      localStorage.removeItem("megabot_client_key");
    }
  };

  // Client Actions
  const handleClientAction = async (action: "pausar" | "reanudar", tipo: "esta" | "todas") => {
    if (!clientData) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const result = await callAPI(action, { clave: clientData.clave, tipo });

    setLoading(false);

    if (result.success) {
      setSuccess(result.mensaje);
      // Refresh data
      const updated = await callAPI("verificar", { clave: clientData.clave });
      if (updated.encontrada) {
        setClientData({
          ...clientData,
          pausado: updated.pausado === "SI",
          pausadoTodas: updated.pausadoTodas === "SI",
        });
      }
    } else {
      setError(result.error || "Error al realizar la acción");
    }
  };

  // Client Logout
  const handleClientLogout = () => {
    localStorage.removeItem("megabot_client_key");
    setClientData(null);
    setClientKey("");
    setView("select");
  };

  // Admin Login
  const handleAdminLogin = () => {
    if (adminPassword === "megabot2024") {
      localStorage.setItem("megabot_admin", "true");
      setView("admin-dashboard");
      loadAdminData();
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  // Admin Logout
  const handleAdminLogout = () => {
    localStorage.removeItem("megabot_admin");
    setAdminPassword("");
    setView("select");
  };

  // Load Admin Data
  const loadAdminData = async () => {
    try {
      const response = await fetch(MEGABOT_CONFIG.SHEET_URL);
      const text = await response.text();
      const lines = text.split("\n");

      const clientes: ClienteData[] = [];

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(",").map((s) => s.trim());
        const [clave, cliente, , expiracion, activo, plan, pausado, pausadoTodas] = cols;

        if (!cliente) continue;

        const fechaExp = new Date(expiracion);
        const diasRestantes = Math.ceil((fechaExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        clientes.push({
          clave: clave || "",
          cliente,
          expiracion,
          diasRestantes,
          activo: activo?.toUpperCase() === "SI",
          plan: plan?.toLowerCase() || "basico",
          pausado: pausado?.toUpperCase() === "SI" || pausadoTodas?.toUpperCase() === "SI",
        });
      }

      setClientesData(clientes);

      // Calculate stats
      const total = clientes.length;
      const activos = clientes.filter((c) => c.activo && c.diasRestantes > 0).length;
      const pro = clientes.filter((c) => c.plan === "pro" && c.activo && c.diasRestantes > 0).length;
      const basico = clientes.filter((c) => c.plan === "basico" && c.activo && c.diasRestantes > 0).length;
      const vencen = clientes.filter((c) => c.diasRestantes > 0 && c.diasRestantes <= 7).length;
      const expirados = clientes.filter((c) => c.diasRestantes <= 0).length;
      const ingresos = pro * MEGABOT_CONFIG.PRECIO_PRO + basico * MEGABOT_CONFIG.PRECIO_BASICO;

      setAdminStats({ total, activos, pro, vencen, expirados, ingresos });
    } catch (err) {
      console.error("Error loading admin data:", err);
    }
  };

  // Generate Key
  const handleGenerateKey = () => {
    if (!genName.trim()) {
      setError("Ingresa el nombre del cliente");
      return;
    }

    const shortName = genName.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").substring(0, 6);
    const random = Math.floor(Math.random() * 900) + 100;
    const key = `MEGA-${shortName}-${random}`;

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + parseInt(genDuration));
    const expiryStr = expiry.toISOString().split("T")[0];

    setGeneratedKey({ key, expiry: expiryStr });
    setError("");
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess("¡Copiado!");
    setTimeout(() => setSuccess(""), 2000);
  };

  // Send WhatsApp
  const sendWhatsApp = () => {
    if (!generatedKey) return;

    const template = `🚀 *MegaBot PRO*

¡Hola ${genName}! Tu licencia está lista:

🔑 *Clave:* ${generatedKey.key}
📋 *Plan:* ${genPlan.toUpperCase()}
📅 *Válido hasta:* ${generatedKey.expiry}

*Instrucciones:*
1. Abre megapersonals.eu
2. Presiona F12 → Console
3. Pega el código del bot
4. Ingresa tu clave

¿Necesitas ayuda? Escríbeme.`;

    let url = "https://wa.me/";
    if (genWhatsapp) {
      url += genWhatsapp.replace(/[^0-9]/g, "");
    }
    url += "?text=" + encodeURIComponent(template);
    window.open(url, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Selection View */}
        {view === "select" && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 text-white text-2xl mb-4">
                🤖
              </div>
              <h2 className="text-2xl font-bold text-foreground">MegaBot PRO</h2>
              <p className="text-muted-foreground mt-2">Sistema de republicación automática</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => setView("client-login")}
                className="w-full p-5 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                    👤
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Soy Cliente</h3>
                    <p className="text-sm text-muted-foreground">Controlar mi bot remotamente</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setView("admin-login")}
                className="w-full p-5 rounded-2xl border border-border hover:bg-secondary/50 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                    ⚙️
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Administrador</h3>
                    <p className="text-sm text-muted-foreground">Dashboard y gestión de clientes</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Client Login View */}
        {view === "client-login" && (
          <div className="p-8">
            <button onClick={() => setView("select")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">Acceso Cliente</h2>
              <p className="text-muted-foreground mt-2">Ingresa tu clave de licencia</p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={clientKey}
                onChange={(e) => setClientKey(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleClientLogin()}
                placeholder="MEGA-XXXXX-000"
                className="w-full px-4 py-4 rounded-xl border border-border bg-secondary/50 text-center text-lg font-mono uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <button
                onClick={() => handleClientLogin()}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "Verificando..." : "🔓 Acceder"}
              </button>
            </div>
          </div>
        )}

        {/* Client Control View */}
        {view === "client-control" && clientData && (
          <div className="p-8">
            <button onClick={handleClientLogout} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Cerrar sesión
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">🎮 Control Remoto</h2>
              <p className="text-muted-foreground mt-2">Controla tu bot desde cualquier lugar</p>
            </div>

            {/* Info Card */}
            <div className="rounded-2xl border border-border bg-secondary/30 p-5 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-semibold text-foreground">{clientData.cliente}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <span className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                    clientData.plan === "pro" ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400"
                  )}>
                    {clientData.plan.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Días restantes</p>
                  <p className="font-semibold text-foreground">{clientData.diasRestantes} días</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <span className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                    clientData.pausado || clientData.pausadoTodas 
                      ? "bg-red-500/20 text-red-400" 
                      : "bg-green-500/20 text-green-400"
                  )}>
                    {clientData.pausado || clientData.pausadoTodas ? "⏸️ PAUSADO" : "▶️ ACTIVO"}
                  </span>
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center mb-4">{success}</p>}

            {/* Control Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleClientAction("pausar", "esta")}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                ⏸️ Pausar esta cuenta
              </button>
              <button
                onClick={() => handleClientAction("pausar", "todas")}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                ⏸️ Pausar TODAS las cuentas
              </button>

              <div className="border-t border-border my-4" />

              <button
                onClick={() => handleClientAction("reanudar", "esta")}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-green-500/20 text-green-400 font-semibold hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                ▶️ Reanudar esta cuenta
              </button>
              <button
                onClick={() => handleClientAction("reanudar", "todas")}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-green-500/10 text-green-400 font-semibold hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                ▶️ Reanudar TODAS las cuentas
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Se actualiza automáticamente cada 10 segundos
            </p>
          </div>
        )}

        {/* Admin Login View */}
        {view === "admin-login" && (
          <div className="p-8">
            <button onClick={() => setView("select")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">🔐 Admin</h2>
              <p className="text-muted-foreground mt-2">Ingresa tu contraseña</p>
            </div>

            <div className="space-y-4">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAdminLogin()}
                placeholder="Contraseña"
                className="w-full px-4 py-4 rounded-xl border border-border bg-secondary/50 text-center placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <button
                onClick={handleAdminLogin}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-opacity"
              >
                🔓 Entrar
              </button>
            </div>
          </div>
        )}

        {/* Admin Dashboard View */}
        {view === "admin-dashboard" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">🚀 MegaBot PRO</h2>
                <p className="text-sm text-muted-foreground">Panel de Administración</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadAdminData}
                  className="px-3 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
                >
                  🔄
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="px-3 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
                >
                  🚪
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{adminStats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{adminStats.activos}</p>
                <p className="text-xs text-muted-foreground">Activos</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{adminStats.pro}</p>
                <p className="text-xs text-muted-foreground">PRO</p>
              </div>
            </div>

            {/* Revenue */}
            <div className="rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 p-4 mb-4">
              <p className="text-xs text-green-400/80">💰 Ingresos Mensuales</p>
              <p className="text-2xl font-bold text-green-400">${adminStats.ingresos.toFixed(2)}</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {[
                { id: "generator", label: "🔑 Generar" },
                { id: "clients", label: "👥 Clientes" },
                { id: "alerts", label: "🔔 Alertas" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAdminTab(tab.id as typeof adminTab)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    adminTab === tab.id
                      ? "bg-primary text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Generator Tab */}
            {adminTab === "generator" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Nombre</label>
                    <input
                      type="text"
                      value={genName}
                      onChange={(e) => setGenName(e.target.value)}
                      placeholder="Juan Pérez"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Plan</label>
                    <select
                      value={genPlan}
                      onChange={(e) => setGenPlan(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="basico">Básico - $29.99</option>
                      <option value="pro">PRO - $49.99</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Duración</label>
                    <select
                      value={genDuration}
                      onChange={(e) => setGenDuration(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="30">1 Mes</option>
                      <option value="60">2 Meses</option>
                      <option value="90">3 Meses</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">WhatsApp</label>
                    <input
                      type="text"
                      value={genWhatsapp}
                      onChange={(e) => setGenWhatsapp(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  onClick={handleGenerateKey}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:opacity-90 transition-opacity"
                >
                  ⚡ GENERAR CLAVE
                </button>

                {generatedKey && (
                  <div className="rounded-xl bg-secondary/50 border border-border p-4 space-y-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Clave generada</p>
                      <p className="text-xl font-mono font-bold text-green-400">{generatedKey.key}</p>
                      <p className="text-xs text-muted-foreground mt-1">Expira: {generatedKey.expiry}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => copyToClipboard(generatedKey.key)}
                        className="py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
                      >
                        📋 Copiar
                      </button>
                      <button
                        onClick={sendWhatsApp}
                        className="py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-colors"
                      >
                        📱 WhatsApp
                      </button>
                    </div>
                    {success && <p className="text-green-400 text-xs text-center">{success}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Clients Tab */}
            {adminTab === "clients" && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {clientesData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay clientes</p>
                ) : (
                  clientesData.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border">
                      <div>
                        <p className="font-medium text-foreground">{c.cliente}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.clave || "(sin clave)"}</p>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                          c.plan === "pro" ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400"
                        )}>
                          {c.plan.toUpperCase()}
                        </span>
                        <p className={cn(
                          "text-xs mt-1",
                          c.diasRestantes <= 0 ? "text-red-400" : c.diasRestantes <= 7 ? "text-yellow-400" : "text-muted-foreground"
                        )}>
                          {c.diasRestantes <= 0 ? "Expirado" : `${c.diasRestantes}d`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Alerts Tab */}
            {adminTab === "alerts" && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {clientesData.filter(c => c.diasRestantes <= 7 || !c.clave).length === 0 ? (
                  <p className="text-center text-green-400 py-8">✅ No hay alertas</p>
                ) : (
                  <>
                    {clientesData.filter(c => c.diasRestantes > 0 && c.diasRestantes <= 7).map((c, i) => (
                      <div key={`exp-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border-l-4 border-yellow-500">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="font-medium text-foreground">{c.cliente}</p>
                          <p className="text-xs text-muted-foreground">Vence en {c.diasRestantes} días</p>
                        </div>
                      </div>
                    ))}
                    {clientesData.filter(c => c.diasRestantes <= 0).map((c, i) => (
                      <div key={`dead-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border-l-4 border-red-500">
                        <span className="text-xl">🚫</span>
                        <div>
                          <p className="font-medium text-foreground">{c.cliente}</p>
                          <p className="text-xs text-muted-foreground">Licencia expirada</p>
                        </div>
                      </div>
                    ))}
                    {clientesData.filter(c => !c.clave).map((c, i) => (
                      <div key={`nokey-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 border-l-4 border-orange-500">
                        <span className="text-xl">🔑</span>
                        <div>
                          <p className="font-medium text-foreground">{c.cliente}</p>
                          <p className="text-xs text-muted-foreground">Sin clave asignada</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
