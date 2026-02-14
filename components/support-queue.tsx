"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TicketAPI, type Ticket, type TicketStatus } from "@/components/ticket-system";

// =====================================================================
// HELPERS
// =====================================================================
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d ${hours % 24}h`;
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "activation": return "🚀";
    case "photo_change": return "📸";
    case "number_change": return "📱";
    default: return "💬";
  }
}

function getPriorityBadge(priority: string) {
  if (priority === "urgent") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Urgente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
      Normal
    </span>
  );
}

function getStatusConfig(status: TicketStatus) {
  switch (status) {
    case "pending":
      return { label: "Pendiente", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: "⏳" };
    case "in_progress":
      return { label: "Atendiendo", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "🔧" };
    case "completed":
      return { label: "Completado", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", icon: "✅" };
  }
}

// =====================================================================
// COMPONENTE: TARJETA DE TICKET
// =====================================================================
function TicketCard({
  ticket,
  position,
  onUpdateStatus,
  onDelete,
}: {
  ticket: Ticket;
  position: number;
  onUpdateStatus: (id: string, status: TicketStatus, notes?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(ticket.notes || "");
  const [showNotes, setShowNotes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusConfig = getStatusConfig(ticket.status);

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-300",
      ticket.status === "pending" && "border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-transparent",
      ticket.status === "in_progress" && "border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent",
      ticket.status === "completed" && "border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent opacity-60",
      ticket.priority === "urgent" && ticket.status === "pending" && "ring-1 ring-red-500/30"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          {ticket.status === "pending" && (
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-black text-yellow-400">#{position}</span>
            </div>
          )}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-card to-secondary flex items-center justify-center flex-shrink-0 border border-border/50">
            <span className="text-lg">{getTypeIcon(ticket.type)}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{ticket.typeLabel || ticket.type}</p>
            <p className="text-xs text-muted-foreground">{timeAgo(ticket.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {getPriorityBadge(ticket.priority)}
          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", statusConfig.bg, statusConfig.color, statusConfig.border)}>
            {statusConfig.icon} {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Info del cliente */}
      <div className="rounded-lg bg-secondary/30 border border-border/30 p-3 mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <span className="text-muted-foreground">Cliente:</span>
            <span className="ml-1.5 font-bold text-foreground">{ticket.clientName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Navegador:</span>
            <span className="ml-1.5 font-medium text-foreground">{ticket.browserName}</span>
          </div>
          {ticket.postId && (
            <div>
              <span className="text-muted-foreground">Post:</span>
              <a
                href={`https://megapersonals.eu/public/escort_post_detail/${ticket.postId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1.5 font-medium text-primary hover:underline"
              >
                {ticket.postId}
              </a>
            </div>
          )}
          {ticket.phoneNumber && ticket.phoneNumber !== "N/A" && (
            <div>
              <span className="text-muted-foreground">Teléfono:</span>
              <span className="ml-1.5 font-medium text-foreground">{ticket.phoneNumber}</span>
            </div>
          )}
          {ticket.city && ticket.city !== "N/A" && (
            <div>
              <span className="text-muted-foreground">Ciudad:</span>
              <span className="ml-1.5 font-medium text-foreground">{ticket.city}</span>
            </div>
          )}
        </div>
      </div>

      {/* Descripción */}
      {ticket.description && (
        <div className="rounded-lg bg-black/20 p-2.5 mb-3">
          <p className="text-xs text-muted-foreground leading-relaxed">💬 {ticket.description}</p>
        </div>
      )}

      {/* Notas del soporte */}
      {showNotes && (
        <div className="mb-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas internas (solo visibles para soporte)..."
            className="w-full rounded-lg border border-border/50 bg-secondary/30 p-2.5 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/50"
          />
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="https://t.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#229ED9]/15 text-[#229ED9] text-xs font-semibold border border-[#229ED9]/30 hover:bg-[#229ED9]/25 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Abrir Telegram
        </a>

        <button
          onClick={() => setShowNotes(!showNotes)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 text-muted-foreground text-xs font-medium border border-border/30 hover:bg-secondary/80 transition-colors"
        >
          📝 {showNotes ? "Ocultar notas" : "Notas"}
        </button>

        <div className="flex-1" />

        {ticket.status === "pending" && (
          <button
            onClick={() => onUpdateStatus(ticket.id, "in_progress", notes || undefined)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
          >
            🔧 Atender
          </button>
        )}

        {ticket.status === "in_progress" && (
          <button
            onClick={() => onUpdateStatus(ticket.id, "completed", notes || undefined)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-bold border border-green-500/30 hover:bg-green-500/30 transition-colors"
          >
            ✅ Completar
          </button>
        )}

        {ticket.status === "completed" && (
          <>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                🗑️ Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">¿Seguro?</span>
                <button onClick={() => onDelete(ticket.id)} className="px-3 py-1 rounded-lg bg-red-500/30 text-red-300 text-xs font-bold border border-red-500/40 hover:bg-red-500/40">Sí</button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 rounded-lg bg-secondary/50 text-muted-foreground text-xs border border-border/30 hover:bg-secondary/80">No</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// COMPONENTE PRINCIPAL: COLA DE SOPORTE
// =====================================================================
export function SupportQueue() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = TicketAPI.listenToTickets((newTickets) => {
      setTickets(newTickets);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleUpdateStatus = useCallback(async (ticketId: string, status: TicketStatus, notes?: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, status, notes: notes || t.notes, updatedAt: Date.now() } : t
      )
    );
    const success = await TicketAPI.updateStatus(ticketId, status, notes);
    if (!success) {
      const fresh = await TicketAPI.getAll();
      setTickets(fresh);
    }
  }, []);

  const handleDelete = useCallback(async (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    await TicketAPI.delete(ticketId);
  }, []);

  const filtered = tickets.filter((t) => {
    if (filter === "active") return t.status !== "completed";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = { in_progress: 0, pending: 1, completed: 2 };
    const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const completedCount = tickets.filter((t) => t.status === "completed").length;
  const pendingTickets = tickets.filter((t) => t.status === "pending").sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/30">
              <span className="text-xl">🎫</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cola de Soporte</h1>
              <p className="text-xs text-muted-foreground">Gestión de solicitudes de clientes</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
              <p className="text-2xl font-black text-yellow-400">{pendingCount}</p>
              <p className="text-[10px] font-semibold text-yellow-400/80 uppercase tracking-wider">Pendientes</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-center">
              <p className="text-2xl font-black text-blue-400">{inProgressCount}</p>
              <p className="text-[10px] font-semibold text-blue-400/80 uppercase tracking-wider">Atendiendo</p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-center">
              <p className="text-2xl font-black text-green-400">{completedCount}</p>
              <p className="text-[10px] font-semibold text-green-400/80 uppercase tracking-wider">Completados</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mt-4">
            {(["active", "completed", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  filter === f
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-secondary/30 text-muted-foreground border-border/30 hover:bg-secondary/50"
                )}
              >
                {f === "active" ? `Activos (${pendingCount + inProgressCount})` : f === "completed" ? `Completados (${completedCount})` : `Todos (${tickets.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Cargando tickets...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl">🎉</span>
            <p className="text-lg font-bold text-foreground">
              {filter === "active" ? "No hay solicitudes pendientes" : filter === "completed" ? "No hay solicitudes completadas" : "No hay solicitudes"}
            </p>
            <p className="text-sm text-muted-foreground">
              {filter === "active" ? "Cuando un cliente solicite soporte, aparecerá aquí" : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((ticket) => {
              const position = ticket.status === "pending"
                ? pendingTickets.findIndex((t) => t.id === ticket.id) + 1
                : 0;
              return (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  position={position}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground/50">Se actualiza automáticamente cada 10 segundos</p>
        </div>
      </div>
    </div>
  );
}
