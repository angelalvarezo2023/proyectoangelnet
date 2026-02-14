"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

// =====================================================================
// FIREBASE TICKET API
// =====================================================================
const FIREBASE_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";

export type TicketType = "activation" | "photo_change" | "number_change" | "other";
export type TicketStatus = "pending" | "in_progress" | "completed";
export type TicketPriority = "urgent" | "normal";

export interface Ticket {
  id: string;
  clientName: string;
  browserName: string;
  postId?: string;
  phoneNumber?: string;
  city?: string;
  type: TicketType;
  typeLabel: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export const TICKET_TYPES: {
  value: TicketType;
  label: string;
  icon: string;
  priority: TicketPriority;
  description: string;
}[] = [
  { value: "activation", label: "Activacion nueva", icon: "🚀", priority: "urgent", description: "Crear anuncio por primera vez" },
  { value: "photo_change", label: "Cambiar fotos", icon: "📸", priority: "normal", description: "Actualizar las fotos del anuncio" },
  { value: "number_change", label: "Cambiar numero", icon: "📱", priority: "urgent", description: "Cambiar el numero de telefono del anuncio" },
  { value: "other", label: "Otro", icon: "💬", priority: "normal", description: "Otra solicitud o consulta" },
];

export const TicketAPI = {
  async create(
    ticket: Omit<Ticket, "id" | "createdAt" | "updatedAt" | "status">
  ): Promise<{ success: boolean; ticketId?: string; error?: string }> {
    try {
      const now = Date.now();
      const data = { ...ticket, status: "pending" as TicketStatus, createdAt: now, updatedAt: now };
      const resp = await fetch(`${FIREBASE_URL}/tickets.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error("Firebase error");
      const result = await resp.json();
      return { success: true, ticketId: result.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getAll(): Promise<Ticket[]> {
    try {
      const resp = await fetch(`${FIREBASE_URL}/tickets.json`);
      if (!resp.ok) return [];
      const data = await resp.json();
      if (!data) return [];
      return Object.entries(data)
        .map(([id, ticket]) => ({ ...(ticket as any), id }))
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  },

  async getActiveByBrowser(browserName: string): Promise<Ticket | null> {
    try {
      const all = await this.getAll();
      return all.find((t) => t.browserName === browserName && t.status !== "completed") || null;
    } catch {
      return null;
    }
  },

  async updateStatus(ticketId: string, status: TicketStatus, notes?: string): Promise<boolean> {
    try {
      const update: any = { status, updatedAt: Date.now() };
      if (notes !== undefined) update.notes = notes;
      const resp = await fetch(`${FIREBASE_URL}/tickets/${ticketId}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      return resp.ok;
    } catch {
      return false;
    }
  },

  async delete(ticketId: string): Promise<boolean> {
    try {
      const resp = await fetch(`${FIREBASE_URL}/tickets/${ticketId}.json`, { method: "DELETE" });
      return resp.ok;
    } catch {
      return false;
    }
  },

  listenToTickets(callback: (tickets: Ticket[]) => void): () => void {
    TicketAPI.getAll().then(callback);
    const interval = setInterval(() => TicketAPI.getAll().then(callback), 10000);
    return () => clearInterval(interval);
  },

  getPositionInQueue(tickets: Ticket[], ticketId: string): number {
    const pending = tickets
      .filter((t) => t.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
    const index = pending.findIndex((t) => t.id === ticketId);
    return index >= 0 ? index + 1 : 0;
  },
};

// =====================================================================
// COMPONENTE: BADGE DE ESTADO DEL TICKET (dashboard del cliente)
// =====================================================================
export function TicketStatusBadge({
  browserName,
  postId,
}: {
  browserName: string;
  postId?: string;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    const checkTicket = async () => {
      const t = await TicketAPI.getActiveByBrowser(browserName);
      setTicket(t);
    };
    checkTicket();
    const i1 = setInterval(checkTicket, 8000);
    const unsub = TicketAPI.listenToTickets(setAllTickets);
    return () => {
      clearInterval(i1);
      unsub();
    };
  }, [browserName]);

  if (!ticket || ticket.status === "completed") return null;

  const position = TicketAPI.getPositionInQueue(allTickets, ticket.id);
  const typeConfig = TICKET_TYPES.find((t) => t.value === ticket.type);

  return (
    <div
      className={`rounded-lg sm:rounded-xl border p-3 sm:p-4 ${
        ticket.status === "in_progress"
          ? "border-blue-500/30 bg-blue-500/10"
          : "border-yellow-500/30 bg-yellow-500/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeConfig?.icon || "📋"}</span>
          <div>
            <p
              className={`text-sm font-bold ${
                ticket.status === "in_progress" ? "text-blue-400" : "text-yellow-400"
              }`}
            >
              {ticket.status === "in_progress" ? "Te estan atendiendo" : "En cola de soporte"}
            </p>
            <p className="text-xs text-muted-foreground">
              {ticket.status === "pending" && position > 0
                ? `Posicion #${position}${
                    position > 1
                      ? ` — ${position - 1} persona${position - 1 > 1 ? "s" : ""} antes que tu`
                      : " — Eres el siguiente"
                  }`
                : ticket.status === "in_progress"
                ? "Un agente esta trabajando en tu solicitud"
                : "Esperando..."}
            </p>
          </div>
        </div>
        {ticket.status === "in_progress" && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 animate-pulse">
            <span className="h-3 w-3 rounded-full bg-blue-400" />
          </span>
        )}
      </div>
      {ticket.type === "photo_change" && ticket.status === "in_progress" && (
        <div className="mt-2 rounded-lg bg-black/20 p-2">
          <p className="text-xs text-center text-muted-foreground">
            📸 Envia tus fotos nuevas por Telegram a{" "}
            <a
              href="https://t.me/Soportetecnico2323"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline font-semibold"
            >
              @Soportetecnico2323
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// COMPONENTE: MODAL DE CREAR TICKET (dashboard del cliente)
// =====================================================================
interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  browserName: string;
  postId?: string;
  phoneNumber?: string;
  city?: string;
}

export function TicketModal({
  isOpen,
  onClose,
  clientName,
  browserName,
  postId,
  phoneNumber,
  city,
}: TicketModalProps) {
  const [step, setStep] = useState<"select" | "details" | "sending" | "done">("select");
  const [selectedType, setSelectedType] = useState<TicketType | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStep("select");
      setSelectedType(null);
      setDescription("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectType = (type: TicketType) => {
    setSelectedType(type);
    setStep("details");
  };

  const handleSubmit = async () => {
    if (!selectedType) return;
    setStep("sending");
    setError("");

    const typeConfig = TICKET_TYPES.find((t) => t.value === selectedType)!;
    const result = await TicketAPI.create({
      clientName,
      browserName,
      postId,
      phoneNumber,
      city,
      type: selectedType,
      typeLabel: typeConfig.label,
      description: description.trim() || typeConfig.description,
      priority: typeConfig.priority,
    });

    if (result.success) {
      setStep("done");
      setTimeout(() => onClose(), 4000);
    } else {
      setError("Error al enviar la solicitud. Intenta de nuevo.");
      setStep("details");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-2 sm:p-4 backdrop-blur-sm">
      <div className="my-4 sm:my-8 w-full max-w-md overflow-hidden rounded-2xl sm:rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />

        {/* === PASO 1: SELECCIONAR TIPO === */}
        {step === "select" && (
          <div className="p-5 sm:p-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/30">
                <span className="text-3xl">🎫</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">Solicitar Soporte</h3>
              <p className="text-sm text-muted-foreground mt-1">Que necesitas?</p>
            </div>

            <div className="space-y-2.5">
              {TICKET_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleSelectType(type.value)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-blue-500/30 transition-all duration-200 group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <span className="text-xl">{type.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                  {type.priority === "urgent" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0">
                      URGENTE
                    </span>
                  )}
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            <Button onClick={onClose} variant="outline" className="w-full mt-4 bg-transparent h-11">
              Cancelar
            </Button>
          </div>
        )}

        {/* === PASO 2: DETALLES === */}
        {step === "details" && selectedType && (
          <div className="p-5 sm:p-6">
            <button
              onClick={() => { setStep("select"); setSelectedType(null); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>

            <div className="text-center mb-5">
              <span className="text-4xl mb-2 block">
                {TICKET_TYPES.find((t) => t.value === selectedType)?.icon}
              </span>
              <h3 className="text-lg font-bold text-foreground">
                {TICKET_TYPES.find((t) => t.value === selectedType)?.label}
              </h3>
            </div>

            {selectedType === "photo_change" && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 mb-4">
                <p className="text-sm text-blue-300 font-semibold text-center mb-2">
                  📸 Cuando te atiendan, envia tus fotos nuevas a:
                </p>
                <a
                  href="https://t.me/Soportetecnico2323"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2.5 rounded-lg bg-[#229ED9]/20 border border-[#229ED9]/40 text-center text-[#229ED9] font-bold text-sm hover:bg-[#229ED9]/30 transition-colors"
                >
                  📱 Abrir Telegram — @Soportetecnico2323
                </a>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Descripcion {selectedType !== "other" && "(opcional)"}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  selectedType === "activation"
                    ? "Ejemplo: Necesito activar mi anuncio en Miami"
                    : selectedType === "photo_change"
                    ? "Ejemplo: Quiero cambiar 3 fotos"
                    : selectedType === "number_change"
                    ? "Ejemplo: Nuevo numero 786 555 1234"
                    : "Describe tu solicitud..."
                }
                className="w-full rounded-xl border border-border/50 bg-secondary/30 p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              {description.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 text-right">{description.length}/500</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 mb-4">
                <p className="text-xs font-semibold text-destructive text-center">{error}</p>
              </div>
            )}

            <div className="rounded-xl border border-border/30 bg-secondary/20 p-3 mb-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Se incluira automaticamente:
              </p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="text-foreground font-medium">{clientName}</span>
                <span className="text-muted-foreground">Navegador:</span>
                <span className="text-foreground font-medium">{browserName}</span>
                {phoneNumber && phoneNumber !== "N/A" && (
                  <>
                    <span className="text-muted-foreground">Telefono:</span>
                    <span className="text-foreground font-medium">{phoneNumber}</span>
                  </>
                )}
                {city && city !== "N/A" && (
                  <>
                    <span className="text-muted-foreground">Ciudad:</span>
                    <span className="text-foreground font-medium">{city}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                onClick={handleSubmit}
                disabled={selectedType === "other" && !description.trim()}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold text-base rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                Enviar Solicitud
              </Button>
              <Button onClick={onClose} variant="outline" className="w-full bg-transparent h-10">
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* === ENVIANDO === */}
        {step === "sending" && (
          <div className="p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
            <p className="text-sm font-semibold text-muted-foreground">Enviando solicitud...</p>
          </div>
        )}

        {/* === COMPLETADO === */}
        {step === "done" && (
          <div className="p-8 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/40">
              <span className="text-5xl">✅</span>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-green-400">Solicitud enviada</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Te avisaremos cuando te estemos atendiendo
              </p>
            </div>
            <p className="text-xs text-muted-foreground opacity-60">Se cerrara automaticamente...</p>
          </div>
        )}
      </div>
    </div>
  );
}
