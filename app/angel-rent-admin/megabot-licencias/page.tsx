
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
