"use client";

import { useState, useEffect } from "react";
import { FirebaseAPI, type NotificationConfig } from "@/lib/firebase";
import { XIcon, CheckCircleIcon, AlertTriangleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NotificationSettingsProps {
  browserName: string;
  onClose: () => void;
}

export function NotificationSettings({ browserName, onClose }: NotificationSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [config, setConfig] = useState<NotificationConfig>({
    email: {
      active: false,
      address: "",
    },
    eventos: {
      republicacion: true,
      error: true,
      renta7dias: true,
      renta3dias: true,
      renta24horas: true,
      renta12horas: true,
    },
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, [browserName]);

  const loadConfig = async () => {
    setLoading(true);
    const data = await FirebaseAPI.getNotificationConfig(browserName);
    if (data) {
      setConfig(data);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    // Validar email si está activo
    if (config.email.active && !config.email.address) {
      setMessage({ type: "error", text: "Por favor ingresa un email" });
      return;
    }

    if (config.email.active && !config.email.address.includes("@")) {
      setMessage({ type: "error", text: "Por favor ingresa un email válido" });
      return;
    }

    setSaving(true);
    setMessage(null);

    const result = await FirebaseAPI.saveNotificationConfig(browserName, config);

    if (result.success) {
      setMessage({ type: "success", text: "✅ Configuración guardada correctamente" });
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setMessage({ type: "error", text: "❌ Error al guardar: " + result.error });
    }

    setSaving(false);
  };

  const handleSendTest = async () => {
    if (!config.email.address || !config.email.address.includes("@")) {
      setMessage({ type: "error", text: "Por favor ingresa un email válido primero" });
      return;
    }

    setSendingTest(true);
    setMessage(null);

    const result = await FirebaseAPI.sendTestEmail(browserName, config.email.address);

    if (result.success) {
      setMessage({ 
        type: "success", 
        text: `✅ Email de prueba enviado a ${config.email.address}. Revisa tu bandeja de entrada (y spam).` 
      });
    } else {
      setMessage({ type: "error", text: "❌ Error al enviar: " + result.error });
    }

    setSendingTest(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-center">
          <div className="mb-4 text-4xl animate-spin">⚙️</div>
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full shadow-2xl animate-in zoom-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <span className="text-2xl">🔔</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Configurar Notificaciones</h2>
              <p className="text-sm text-muted-foreground">Navegador: {browserName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Email Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Email de Notificaciones</h3>
                <p className="text-sm text-muted-foreground">
                  Recibe alertas automáticas por correo electrónico
                </p>
              </div>
              <button
                onClick={() => setConfig({ ...config, email: { ...config.email, active: !config.email.active } })}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  config.email.active ? "bg-green-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    config.email.active ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            <div className="space-y-3">
              <Input
                type="email"
                value={config.email.address}
                onChange={(e) => setConfig({ ...config, email: { ...config.email, address: e.target.value } })}
                placeholder="tu-email@example.com"
                className="h-12"
                disabled={!config.email.active}
              />
              
              <Button
                onClick={handleSendTest}
                disabled={!config.email.active || !config.email.address || sendingTest}
                variant="outline"
                className="w-full"
              >
                {sendingTest ? "Enviando..." : "📧 Enviar Email de Prueba"}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Events Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Tipos de Notificaciones</h3>
              <p className="text-sm text-muted-foreground">
                Selecciona qué eventos quieres recibir por email
              </p>
            </div>

            <div className="space-y-3">
              {/* Republicación */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                    <span className="text-xl">✅</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Republicación Exitosa</p>
                    <p className="text-sm text-muted-foreground">Cuando tu anuncio se republique correctamente</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, republicacion: !config.eventos.republicacion }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.republicacion && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.republicacion ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Error */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Errores Detectados</p>
                    <p className="text-sm text-muted-foreground">Cuando ocurra un error en tu cuenta</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, error: !config.eventos.error }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.error && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.error ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Divider - Notificaciones de Renta */}
              <div className="pt-3 pb-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  📅 Notificaciones de Renta
                </p>
              </div>

              {/* 7 días antes */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                    <span className="text-xl">⏰</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">7 Días Antes</p>
                    <p className="text-sm text-muted-foreground">Recordatorio amigable de renovación</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, renta7dias: !config.eventos.renta7dias }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.renta7dias && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.renta7dias ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* 3 días antes */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">3 Días Antes</p>
                    <p className="text-sm text-muted-foreground">Advertencia urgente de renovación</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, renta3dias: !config.eventos.renta3dias }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.renta3dias && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.renta3dias ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* 24 horas antes */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-red-500/30 bg-red-500/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20">
                    <span className="text-xl">🚨</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">24 Horas Antes</p>
                    <p className="text-sm text-muted-foreground">Alerta crítica de expiración</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, renta24horas: !config.eventos.renta24horas }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.renta24horas && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.renta24horas ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* 12 horas antes */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-red-500/50 bg-red-500/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/30 animate-pulse">
                    <span className="text-xl">❌</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">12 Horas Antes</p>
                    <p className="text-sm text-muted-foreground">Última oportunidad de renovación</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ 
                    ...config, 
                    eventos: { ...config.eventos, renta12horas: !config.eventos.renta12horas }
                  })}
                  disabled={!config.email.active}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    config.eventos.renta12horas && config.email.active ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      config.eventos.renta12horas ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              className={cn(
                "rounded-xl border p-4 animate-in fade-in slide-in-from-top-2",
                message.type === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              )}
            >
              <div className="flex items-center gap-2">
                {message.type === "success" ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  <AlertTriangleIcon className="h-5 w-5" />
                )}
                <p className="text-sm font-medium">{message.text}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
          >
            {saving ? "Guardando..." : "💾 Guardar Configuración"}
          </Button>
        </div>
      </div>
    </div>
  );
}
