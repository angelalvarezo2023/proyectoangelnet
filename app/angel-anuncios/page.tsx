"use client";

import { useEffect, useState } from "react";
import { AngelRentAPI } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { ref, onValue, getDatabase } from "firebase/database";

interface FirebaseUser {
  name?: string;
  phoneNumber?: string;
  active?: boolean;
  robotOn?: boolean;
  robotPaused?: boolean;
  nextBumpAt?: number;
  rentalEnd?: string;
  rentalEndTimestamp?: number;
  defaultUrl?: string;
}

interface SearchResult {
  username: string;
  user: FirebaseUser;
}

export default function AngelAnunciosPage() {
  const [searchName, setSearchName] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setSearching(true);
    try {
      const found = await AngelRentAPI.findAllByClientName(searchName.trim());
      setResults(found.map(r => ({ username: r.username, user: r.user as FirebaseUser })));
    } catch (error) {
      console.error("Error buscando:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const togglePause = async (username: string, currentPaused: boolean) => {
    try {
      const newState = !currentPaused;
      console.log(`🔄 Cambiando robot de ${currentPaused ? 'PAUSADO' : 'ACTIVO'} → ${newState ? 'PAUSADO' : 'ACTIVO'}`);
      
      // Actualizar UI optimista
      setResults(prev => prev.map(r => 
        r.username === username 
          ? { ...r, user: { ...r.user, robotPaused: newState } }
          : r
      ));

      // Actualizar Firebase
      const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
      const response = await fetch(`${FB_URL}/proxyUsers/${username}/robotPaused.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });

      if (!response.ok) {
        throw new Error(`Firebase error: ${response.status}`);
      }

      console.log(`✅ Firebase actualizado: robotPaused = ${newState}`);
    } catch (error) {
      console.error("❌ Error actualizando:", error);
      // Revertir en caso de error
      setResults(prev => prev.map(r => 
        r.username === username 
          ? { ...r, user: { ...r.user, robotPaused: currentPaused } }
          : r
      ));
    }
  };

  const calculateRentalTime = (user: FirebaseUser) => {
    if (!user.rentalEnd) {
      return { text: "Sin renta", color: "text-gray-400", emoji: "♾️", isDebt: false };
    }

    const endTimestamp = user.rentalEndTimestamp || new Date(user.rentalEnd + "T23:59:59Z").getTime();
    const diffMs = endTimestamp - currentTime;
    const isDebt = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);

    const days = Math.floor(absDiffMs / 86400000);
    const hours = Math.floor((absDiffMs % 86400000) / 3600000);
    const minutes = Math.floor((absDiffMs % 3600000) / 60000);

    if (isDebt) {
      return { text: `${days}d ${hours}h`, color: "text-red-400", emoji: "💀", isDebt: true };
    }
    if (days === 0 && hours === 0) {
      return { text: `${minutes}m`, color: "text-red-400", emoji: "🔴", isDebt: false };
    }
    if (days === 0) {
      return { text: `${hours}h ${minutes}m`, color: "text-orange-400", emoji: "🟡", isDebt: false };
    }
    if (days < 2) {
      return { text: `${days}d ${hours}h`, color: "text-yellow-400", emoji: "🟠", isDebt: false };
    }
    return { text: `${days}d ${hours}h`, color: "text-emerald-400", emoji: "🟢", isDebt: false };
  };

  const calculateNextBump = (nextBumpAt?: number) => {
    if (!nextBumpAt) return null;
    const remaining = Math.max(0, Math.floor((nextBumpAt - currentTime) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (results.length === 0) return;
    const database = getDatabase();
    const unsubscribes: (() => void)[] = [];

    results.forEach(result => {
      const userRef = ref(database, `proxyUsers/${result.username}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setResults(prev => prev.map(r => 
            r.username === result.username ? { ...r, user: data as FirebaseUser } : r
          ));
        }
      });
      unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [results.map(r => r.username).join(',')]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] relative overflow-hidden">
      {/* Gradients de fondo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-pink-900/20 via-transparent to-transparent" />
      
      <div className="relative max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 backdrop-blur-xl mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl shadow-lg shadow-purple-500/50">
              👼
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-white tracking-tight">Angel Anuncios</div>
              <div className="text-xs text-purple-300/70 font-medium">Gestiona tus anuncios</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
          <label className="block text-sm font-semibold text-purple-300/90 mb-3">
            🔍 Buscar por nombre o usuario
          </label>
          <div className="flex gap-3">
            <Input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Nombre del cliente..."
              className="flex-1 h-12 bg-black/40 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 rounded-xl"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchName.trim()}
              className="px-8 h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-800 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 disabled:cursor-not-allowed"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-6">
            <div className="text-sm text-purple-300/70 font-medium px-1">
              {results.length} anuncio{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}
            </div>
            
            {results.map((result) => {
              const rentalInfo = calculateRentalTime(result.user);
              const nextBump = calculateNextBump(result.user.nextBumpAt);
              const hasRobot = result.user.robotOn ?? false;
              const isPaused = result.user.robotPaused ?? false;
              
              return (
                <div
                  key={result.username}
                  className="group bg-white/5 backdrop-blur-xl border border-white/10 hover:border-purple-500/30 rounded-2xl p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10"
                >
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/10">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 transition-shadow">
                      {result.user.name?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-1">
                        {result.user.name || result.username}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-semibold text-emerald-400">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        ACTIVO
                      </span>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Teléfono */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                      <div className="text-xs font-semibold text-purple-300/70 mb-2">📞 TELÉFONO</div>
                      <div className="text-base font-bold text-pink-400">
                        {result.user.phoneNumber || "No disponible"}
                      </div>
                    </div>

                    {/* Tiempo de Renta */}
                    <div className={`border rounded-xl p-4 transition-colors ${
                      rentalInfo.isDebt 
                        ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20" 
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}>
                      <div className="text-xs font-semibold text-purple-300/70 mb-2">⏰ TIEMPO DE RENTA</div>
                      <div className={`text-base font-bold ${rentalInfo.color} flex items-center gap-2`}>
                        <span>{rentalInfo.emoji}</span>
                        <span>{rentalInfo.text}</span>
                      </div>
                      {result.user.rentalEnd && (
                        <div className="text-xs text-gray-400 mt-1">Vence: {result.user.rentalEnd}</div>
                      )}
                    </div>

                    {/* Robot State */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                      <div className="text-xs font-semibold text-purple-300/70 mb-2">🤖 ROBOT</div>
                      {hasRobot ? (
                        isPaused ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm font-bold text-yellow-400">
                            ⏸ PAUSADO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm font-bold text-emerald-400">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            ACTIVO
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/10 border border-gray-500/30 rounded-lg text-sm font-bold text-gray-400">
                          ❌ INACTIVO
                        </span>
                      )}
                    </div>

                    {/* Próximo Bump */}
                    {hasRobot && !isPaused && nextBump && (
                      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4 hover:from-purple-500/20 hover:to-pink-500/20 transition-colors">
                        <div className="text-xs font-semibold text-purple-300/70 mb-2">⏱ PRÓXIMO BUMP</div>
                        <div className="text-2xl font-black text-purple-400 font-mono tracking-tight">
                          {nextBump}
                        </div>
                        <div className="text-xs text-purple-300/50 mt-1">min:seg</div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    {hasRobot && (
                      <button
                        onClick={() => togglePause(result.username, isPaused)}
                        className={`flex-1 min-w-[200px] px-6 py-3.5 rounded-xl font-bold text-white transition-all shadow-lg ${
                          isPaused
                            ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 hover:shadow-emerald-500/50"
                            : "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 hover:shadow-orange-500/50"
                        }`}
                      >
                        {isPaused ? "▶️ Reanudar Robot" : "⏸ Pausar Robot"}
                      </button>
                    )}
                    
                    <a
                      href={`/api/angel-rent?u=${result.username}&url=${encodeURIComponent(
                        result.user.defaultUrl || "https://megapersonals.eu/users/posts/list"
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[200px] px-6 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 text-center"
                    >
                      🔗 Ver Anuncio
                    </a>
                  </div>

                  {/* ID */}
                  <div className="mt-6 pt-4 border-t border-white/10 text-xs text-gray-500 font-mono">
                    {result.username}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No results */}
        {!searching && results.length === 0 && searchName && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-50">🔍</div>
            <div className="text-xl font-bold text-white mb-2">No se encontraron anuncios</div>
            <div className="text-gray-400">Intenta con otro nombre</div>
          </div>
        )}

        {/* Empty state */}
        {!searching && results.length === 0 && !searchName && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-50">👼</div>
            <div className="text-xl font-bold text-white mb-2">Busca tus anuncios</div>
            <div className="text-gray-400">Escribe el nombre del cliente para empezar</div>
          </div>
        )}
      </div>
    </div>
  );
}
