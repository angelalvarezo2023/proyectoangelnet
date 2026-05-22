"use client";

import { useState, useEffect, useCallback } from "react";
import { LicenseAPI, type MegaBotLicense, type LicensePlan, type LicenseStats } from "@/lib/firebase";

function daysRemaining(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`rounded-2xl p-4 flex items-center gap-4 ${color}`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-white text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ clientName: "", plan: "basico" as LicensePlan, days: 30, whatsapp: "", notes: "", customKey: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const submit = async () => {
    if (!form.clientName.trim()) { setError("El nombre es obligatorio"); return; }
    setLoading(true); setError("");
    const res = await LicenseAPI.createLicense(form);
    setLoading(false);
    if (res.success && res.key) { setCreated(res.key); onCreated(); }
    else setError(res.error || "Error desconocido");
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">➕ Nueva Licencia</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        {created ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <p className="text-white font-bold text-xl">¡Licencia creada!</p>
            <div className="bg-green-900/40 border border-green-500/40 rounded-xl p-4">
              <p className="text-green-300 text-xs mb-1">Clave de activación:</p>
              <p className="text-green-400 font-mono text-xl font-bold">{created}</p>
            </div>
            <button onClick={() => copyToClipboard(created)} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition">
              📋 Copiar clave
            </button>
            <button onClick={onClose} className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition">Cerrar</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Nombre del cliente *</label>
              <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                placeholder="Ej: Andy García"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>

            <div>
              <label className="text-white/60 text-xs mb-1 block">Plan</label>
              <div className="grid grid-cols-2 gap-2">
                {(["basico", "pro"] as LicensePlan[]).map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, plan: p }))}
                    className={`py-2 rounded-xl text-sm font-semibold transition border ${form.plan === p
                      ? p === "pro" ? "bg-purple-600 border-purple-500 text-white" : "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                    {p === "pro" ? "⭐ PRO" : "📦 Básico"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-white/60 text-xs mb-1 block">Duración (días)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[7, 15, 30, 90].map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, days: d }))}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition ${form.days === d
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <input type="number" value={form.days} onChange={e => setForm(f => ({ ...f, days: parseInt(e.target.value) || 30 }))} min={1}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>

            <div>
              <label className="text-white/60 text-xs mb-1 block">WhatsApp (opcional)</label>
              <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                placeholder="+1829..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>

            <div>
              <label className="text-white/60 text-xs mb-1 block">Clave personalizada (opcional)</label>
              <input value={form.customKey} onChange={e => setForm(f => ({ ...f, customKey: e.target.value.toUpperCase() }))}
                placeholder="MEGA-XXXX-XXXX (se genera automático)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500" />
            </div>

            <div>
              <label className="text-white/60 text-xs mb-1 block">Notas internas</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                placeholder="Notas sobre este cliente..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-xl px-3 py-2">⚠️ {error}</p>}

            <button onClick={submit} disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition">
              {loading ? "⏳ Creando..." : "✅ Crear Licencia"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtendModal({ license, onClose, onDone }: { license: MegaBotLicense; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setLoading(true);
    const res = await LicenseAPI.extendLicense(license.key, days);
    setLoading(false);
    if (res.success) { setDone(true); onDone(); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h2 className="text-white font-bold text-lg">📅 Extender — {license.clientName}</h2>
        {done ? (
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl">✅</div>
            <p className="text-green-400 font-semibold">¡Extendida {days} días!</p>
            <button onClick={onClose} className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition">Cerrar</button>
          </div>
        ) : (
          <>
            <p className="text-white/60 text-sm">
              Expira: <span className="text-white">{fmtDate(license.expiresAt)}</span>
              {" · "}<span className={daysRemaining(license.expiresAt) < 0 ? "text-red-400" : "text-emerald-400"}>
                {daysRemaining(license.expiresAt) < 0 ? `Expirada hace ${Math.abs(daysRemaining(license.expiresAt))}d` : `${daysRemaining(license.expiresAt)}d restantes`}
              </span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[7, 15, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition ${days === d ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                  +{d}d
                </button>
              ))}
            </div>
            <input type="number" value={days} onChange={e => setDays(parseInt(e.target.value) || 30)} min={1}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition">Cancelar</button>
              <button onClick={submit} disabled={loading}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition">
                {loading ? "⏳..." : `+${days} días`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LicenseRow({ license, onExtend, onRefresh }: { license: MegaBotLicense; onExtend: (l: MegaBotLicense) => void; onRefresh: () => void }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const days = daysRemaining(license.expiresAt);
  const isExpired = days <= 0;
  const isExpiringSoon = days > 0 && days <= 3;
  const status = LicenseAPI.getStatus(license);

  const handleCopy = () => { copyToClipboard(license.key); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const handleToggle = async () => {
    setLoadingAction("toggle");
    await LicenseAPI.setActive(license.key, !license.active);
    setLoadingAction(null); onRefresh();
  };

  const handleResetPC = async () => {
    if (!confirm(`¿Desvincular la PC de ${license.clientName}?`)) return;
    setLoadingAction("reset");
    await LicenseAPI.resetFingerprint(license.key);
    setLoadingAction(null); onRefresh();
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar permanentemente la licencia de ${license.clientName}?`)) return;
    setLoadingAction("delete");
    await LicenseAPI.deleteLicense(license.key);
    setLoadingAction(null); onRefresh();
  };

  return (
    <div className={`bg-white/5 hover:bg-white/[0.08] border rounded-xl p-4 transition ${isExpired ? "border-red-500/20" : isExpiringSoon ? "border-amber-500/30" : "border-white/10"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={handleCopy} className="font-mono text-sm text-purple-300 hover:text-purple-200 transition">{license.key}</button>
            <span className="text-white/30 text-xs">{copied ? "✓ copiado" : "📋"}</span>
          </div>
          <p className="text-white font-semibold">{license.clientName}</p>
          {license.whatsapp && (
            <a href={`https://wa.me/${license.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-green-400 text-xs hover:underline">
              📞 {license.whatsapp}
            </a>
          )}
          {license.notes && <p className="text-white/40 text-xs mt-0.5 italic">📝 {license.notes}</p>}
        </div>

        <div className="flex flex-wrap gap-1.5 items-start">
          <Badge color={license.plan === "pro" ? "bg-purple-600/60 text-purple-200" : "bg-blue-600/40 text-blue-200"}>
            {license.plan === "pro" ? "⭐ PRO" : "📦 Básico"}
          </Badge>
          {status === "active" && !isExpiringSoon && <Badge color="bg-emerald-600/40 text-emerald-200">✅ Activa</Badge>}
          {status === "active" && isExpiringSoon && <Badge color="bg-amber-600/50 text-amber-200">⚠️ {days}d</Badge>}
          {status === "expired" && <Badge color="bg-red-600/40 text-red-200">❌ Expirada</Badge>}
          {status === "suspended" && <Badge color="bg-gray-600/50 text-gray-300">⏸ Suspendida</Badge>}
          <Badge color={license.fingerprint ? "bg-indigo-600/40 text-indigo-200" : "bg-white/10 text-white/50"}>
            {license.fingerprint ? "🖥️ PC vinculada" : "🔓 Sin vincular"}
          </Badge>
        </div>

        <div className="text-right text-xs text-white/50 whitespace-nowrap">
          <p>Creada: {fmtDate(license.createdAt)}</p>
          <p className={isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-white/50"}>
            Expira: {fmtDate(license.expiresAt)}
            {!isExpired && <span> ({days}d)</span>}
            {isExpired && <span> (hace {Math.abs(days)}d)</span>}
          </p>
          {license.lastValidatedAt && <p>Último uso: {fmtDate(license.lastValidatedAt)}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
        <button onClick={() => onExtend(license)} className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 rounded-lg text-xs font-semibold transition">
          📅 Extender
        </button>
        <button onClick={handleToggle} disabled={loadingAction === "toggle"}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${license.active ? "bg-amber-600/30 hover:bg-amber-600/50 text-amber-300" : "bg-green-600/30 hover:bg-green-600/50 text-green-300"}`}>
          {loadingAction === "toggle" ? "⏳..." : license.active ? "⏸ Suspender" : "▶️ Activar"}
        </button>
        {license.fingerprint && (
          <button onClick={handleResetPC} disabled={loadingAction === "reset"}
            className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-lg text-xs font-semibold transition disabled:opacity-50">
            {loadingAction === "reset" ? "⏳..." : "🖥️ Desvincular PC"}
          </button>
        )}
        <button onClick={handleCopy} className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-xs font-semibold transition">
          📋 Copiar clave
        </button>
        <button onClick={handleDelete} disabled={loadingAction === "delete"}
          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-xs font-semibold transition disabled:opacity-50 ml-auto">
          {loadingAction === "delete" ? "⏳..." : "🗑️"}
        </button>
      </div>
    </div>
  );
}

export default function MegaBotLicenciasPage() {
  const [licenses, setLicenses] = useState<Record<string, MegaBotLicense>>({});
  const [stats, setStats] = useState<LicenseStats | null>(null);
  const [expiring, setExpiring] = useState<MegaBotLicense[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired" | "suspended">("all");
  const [filterPlan, setFilterPlan] = useState<"all" | "pro" | "basico">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [extendTarget, setExtendTarget] = useState<MegaBotLicense | null>(null);

  const loadStats = useCallback(async () => {
    const [s, e] = await Promise.all([LicenseAPI.getStats(), LicenseAPI.getExpiringLicenses(3)]);
    setStats(s); setExpiring(e);
  }, []);

  useEffect(() => {
    const unsub = LicenseAPI.listenToAllLicenses((data) => { setLicenses(data); loadStats(); });
    return () => unsub();
  }, [loadStats]);

  const filtered = Object.values(licenses).filter(l => {
    const q = search.toLowerCase();
    if (q && !l.clientName.toLowerCase().includes(q) && !l.key.toLowerCase().includes(q)) return false;
    if (filterPlan !== "all" && l.plan !== filterPlan) return false;
    if (filterStatus !== "all") {
      const s = LicenseAPI.getStatus(l);
      if (filterStatus === "active" && s !== "active") return false;
      if (filterStatus === "expired" && s !== "expired") return false;
      if (filterStatus === "suspended" && s !== "suspended") return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="min-h-screen bg-[#0f0f1a] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">🤖 MegaBot Licencias</h1>
            <p className="text-white/40 text-sm mt-0.5">Panel de administración — tiempo real</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-semibold text-sm shadow-lg transition">
            ➕ Nueva Licencia
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total"     value={stats.total}   icon="🔑" color="bg-white/10" />
            <StatCard label="Activas"   value={stats.active}  icon="✅" color="bg-emerald-900/50" />
            <StatCard label="Expiradas" value={stats.expired} icon="❌" color="bg-red-900/50" />
            <StatCard label="PRO"       value={stats.pro}     icon="⭐" color="bg-purple-900/50" />
          </div>
        )}

        {expiring.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-2xl p-4">
            <p className="text-amber-300 font-semibold text-sm mb-2">
              ⚠️ {expiring.length} licencia{expiring.length > 1 ? "s" : ""} expira{expiring.length === 1 ? "" : "n"} en los próximos 3 días
            </p>
            <div className="flex flex-wrap gap-2">
              {expiring.map(l => (
                <span key={l.key} className="text-amber-200 text-xs bg-amber-900/40 border border-amber-500/20 rounded-lg px-2 py-1">
                  {l.clientName} — {daysRemaining(l.expiresAt)}d
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar por nombre o clave..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 placeholder:text-white/30" />
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "expired", "suspended"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${filterStatus === s ? "bg-purple-600 border-purple-500 text-white" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"}`}>
                {{ all: "Todas", active: "✅ Activas", expired: "❌ Expiradas", suspended: "⏸ Suspendidas" }[s]}
              </button>
            ))}
            <div className="w-px bg-white/10 mx-1" />
            {(["all", "pro", "basico"] as const).map(p => (
              <button key={p} onClick={() => setFilterPlan(p)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${filterPlan === p ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"}`}>
                {{ all: "Todos los planes", pro: "⭐ PRO", basico: "📦 Básico" }[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <p className="text-4xl mb-3">🔑</p>
              <p className="text-sm">{Object.keys(licenses).length === 0 ? "No hay licencias aún. Crea la primera." : "No hay resultados."}</p>
            </div>
          ) : (
            <>
              <p className="text-white/40 text-xs px-1">{filtered.length} licencia{filtered.length !== 1 ? "s" : ""}</p>
              {filtered.map(l => (
                <LicenseRow key={l.key} license={l} onExtend={setExtendTarget} onRefresh={loadStats} />
              ))}
            </>
          )}
        </div>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => loadStats()} />}
      {extendTarget && <ExtendModal license={extendTarget} onClose={() => setExtendTarget(null)} onDone={() => { loadStats(); setExtendTarget(null); }} />}
    </div>
  );
}
