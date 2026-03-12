"use client";

import { useEffect, useState } from "react";
import { AngelRentAPI } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { ref, onValue, getDatabase } from "firebase/database";

// ✅ INTERFAZ EXACTA de Firebase
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

  // ✅ Actualizar reloj cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ✅ BÚSQUEDA: Encuentra usuarios por nombre
  const handleSearch = async () => {
    if (!searchName.trim()) return;
    
    setSearching(true);
    try {
      const found = await AngelRentAPI.findAllByClientName(searchName.trim());
      setResults(found.map(r => ({
        username: r.username,
        user: r.user as FirebaseUser
      })));
    } catch (error) {
      console.error("Error buscando:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // ✅ PAUSAR ROBOT: Actualiza Firebase directamente
  const togglePause = async (username: string, currentPaused: boolean) => {
    try {
      const newState = !currentPaused;
      
      // Actualizar UI optimista
      setResults(prev => prev.map(r => 
        r.username === username 
          ? { ...r, user: { ...r.user, robotPaused: newState } }
          : r
      ));

      // Enviar a Firebase
      const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
      await fetch(`${FB_URL}/proxyUsers/${username}/robotPaused.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
    } catch (error) {
      console.error("Error actualizando pausa:", error);
      // Revertir en caso de error
      setResults(prev => prev.map(r => 
        r.username === username 
          ? { ...r, user: { ...r.user, robotPaused: currentPaused } }
          : r
      ));
    }
  };

  // ✅ CALCULAR TIEMPO DE RENTA (desde Firebase timestamp con UTC)
  const calculateRentalTime = (user: FirebaseUser) => {
    if (!user.rentalEnd) {
      return { text: "Sin renta", color: "text-gray-400", emoji: "♾️", isDebt: false };
    }

    // ✅ Usar timestamp exacto de Firebase (ya en UTC)
    const endTimestamp = user.rentalEndTimestamp || 
      new Date(user.rentalEnd + "T23:59:59Z").getTime();
    
    const diffMs = endTimestamp - currentTime;
    const isDebt = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);

    const days = Math.floor(absDiffMs / 86400000);
    const hours = Math.floor((absDiffMs % 86400000) / 3600000);
    const minutes = Math.floor((absDiffMs % 3600000) / 60000);

    if (isDebt) {
      return {
        text: `Deuda: ${days}d ${hours}h ${minutes}m`,
        color: "text-red-500",
        emoji: "💀",
        isDebt: true
      };
    }

    if (days === 0 && hours === 0) {
      return {
        text: `${minutes}m`,
        color: "text-red-500",
        emoji: "🔴",
        isDebt: false
      };
    }

    if (days === 0) {
      return {
        text: `${hours}h ${minutes}m`,
        color: "text-red-500",
        emoji: "🟡",
        isDebt: false
      };
    }

    if (days < 2) {
      return {
        text: `${days}d ${hours}h`,
        color: "text-orange-500",
        emoji: "🟠",
        isDebt: false
      };
    }

    if (days < 3) {
      return {
        text: `${days}d ${hours}h`,
        color: "text-yellow-500",
        emoji: "🟡",
        isDebt: false
      };
    }

    return {
      text: `${days}d ${hours}h`,
      color: "text-green-500",
      emoji: "🟢",
      isDebt: false
    };
  };

  // ✅ PRÓXIMO BUMP: Lee directamente de Firebase
  const calculateNextBump = (nextBumpAt?: number) => {
    if (!nextBumpAt) return null;
    
    const remaining = Math.max(0, Math.floor((nextBumpAt - currentTime) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // ✅ LISTENER EN TIEMPO REAL: Sincroniza automáticamente cuando Firebase cambia
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
            r.username === result.username 
              ? { ...r, user: data as FirebaseUser }
              : r
          ));
        }
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [results.map(r => r.username).join(',')]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="inline-flex items-center gap-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-full px-6 py-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-2xl shadow-lg shadow-purple-500/50">
              👼
            </div>
            <div className="text-left">
              <div className="text-xl font-black text-white tracking-tight leading-tight">
                Angel Anuncios
              </div>
              <div className="text-xs text-purple-300 font-bold uppercase tracking-wider">
                Busca y gestiona tus anuncios
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 mb-6 shadow-2xl">
          <label className="block text-sm font-bold text-purple-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            🔍 Buscar por nombre o usuario
          </label>
          <div className="flex gap-3">
            <Input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe el nombre del cliente o username..."
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500 focus:ring-purple-500/20"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchName.trim()}
              className="px-8 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 disabled:cursor-not-allowed"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm text-purple-300 font-semibold">
              Se encontraron {results.length} anuncio{results.length !== 1 ? "s" : ""}
            </div>
            
            {results.map((result) => {
              const rentalInfo = calculateRentalTime(result.user);
              const nextBump = calculateNextBump(result.user.nextBumpAt);
              const hasRobot = result.user.robotOn ?? false;
              const isPaused = result.user.robotPaused ?? false;
              
              return (
                <div
                  key={result.username}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-2xl font-black text-white shadow-lg">
                        {result.user.name?.charAt(0).toUpperCase() || "C"}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white">
                          {result.user.name || result.username}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-full text-xs font-bold text-green-400">
                            ✅ ACTIVO
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Teléfono */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider flex items-center gap-2">
                        📞 Teléfono
                      </div>
                      <div className="text-lg font-black text-pink-400">
                        {result.user.phoneNumber || "No disponible"}
                      </div>
                    </div>

                    {/* Tiempo de Renta */}
                    <div className={`border rounded-2xl p-4 ${
                      rentalInfo.isDebt 
                        ? "bg-red-500/10 border-red-500/30" 
                        : "bg-white/5 border-white/10"
                    }`}>
                      <div className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider flex items-center gap-2">
                        ⏰ Tiempo de Renta
                      </div>
                      <div className={`text-lg font-black ${rentalInfo.color} flex items-center gap-2`}>
                        <span>{rentalInfo.emoji}</span>
                        <span>{rentalInfo.text}</span>
                      </div>
                      {result.user.rentalEnd && (
                        <div className="text-xs text-gray-400 mt-1">
                          Vence: {result.user.rentalEnd}
                        </div>
                      )}
                      {rentalInfo.isDebt && (
                        <div className="mt-2 text-xs text-red-400 font-bold">
                          ⚠️ Cuenta en deuda - Contacta para renovar
                        </div>
                      )}
                    </div>

                    {/* Robot State */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <div className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider flex items-center gap-2">
                        🤖 Robot Automático
                      </div>
                      <div className="flex items-center gap-2">
                        {hasRobot ? (
                          <>
                            {isPaused ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-sm font-bold text-yellow-400">
                                ⏸ PAUSADO
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-sm font-bold text-green-400">
                                ✅ ACTIVO
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-500/20 border border-gray-500/30 rounded-full text-sm font-bold text-gray-400">
                            ❌ INACTIVO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Próximo Bump */}
                    {hasRobot && !isPaused && nextBump && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
                        <div className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider flex items-center gap-2">
                          ⏱ Próximo Bump
                        </div>
                        <div className="text-2xl font-black text-purple-400 font-mono">
                          {nextBump}
                        </div>
                        <div className="text-xs text-purple-300 mt-1">
                          minutos:segundos
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    {hasRobot && (
                      <button
                        onClick={() => togglePause(result.username, isPaused)}
                        className={`flex-1 min-w-[200px] px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                          isPaused
                            ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 hover:shadow-green-500/50"
                            : "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 hover:shadow-orange-500/50"
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
                      className="flex-1 min-w-[200px] px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 text-center"
                    >
                      🔗 Ver Anuncio en Vivo
                    </a>
                  </div>

                  {/* ID Footer */}
                  <div className="mt-4 pt-4 border-t border-white/10 text-xs text-gray-500">
                    ID: {result.username}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No results */}
        {!searching && results.length === 0 && searchName && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <div className="text-xl font-bold text-white mb-2">
              No se encontraron anuncios
            </div>
            <div className="text-gray-400">
              No hay ningún anuncio con el nombre "{searchName}"
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && results.length === 0 && !searchName && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👼</div>
            <div className="text-xl font-bold text-white mb-2">
              Busca tus anuncios de Angel Rent
            </div>
            <div className="text-gray-400">
              Escribe el nombre del cliente para ver sus anuncios activos
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
