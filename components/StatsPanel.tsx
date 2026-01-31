"use client";

import { useState, useEffect } from "react";
import { StatsAPI, type WeeklyStats, type StatsEvent, FirebaseAPI, type BrowserData } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export function StatsPanel() {
  const [currentWeek, setCurrentWeek] = useState<WeeklyStats | null>(null);
  const [weeksHistory, setWeeksHistory] = useState<WeeklyStats[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekEvents, setWeekEvents] = useState<StatsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [allBrowsers, setAllBrowsers] = useState<Record<string, BrowserData>>({});

  useEffect(() => {
    loadStats();
    
    // Escuchar cambios en la semana actual
    const unsubscribe = StatsAPI.listenToCurrentWeekStats((stats) => {
      setCurrentWeek(stats);
    });

    // Escuchar cambios en browsers
    const unsubscribeBrowsers = FirebaseAPI.listenToAllBrowsers((browsers) => {
      setAllBrowsers(browsers);
    });

    return () => {
      unsubscribe();
      unsubscribeBrowsers();
    };
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      loadWeekEvents(selectedWeek);
    }
  }, [selectedWeek]);

  const loadStats = async () => {
    setLoading(true);
    const current = await StatsAPI.getCurrentWeekStats();
    const history = await StatsAPI.getWeeksHistory(12);
    
    setCurrentWeek(current);
    setWeeksHistory(history);
    setLoading(false);
  };

  const loadWeekEvents = async (weekId: string) => {
    const events = await StatsAPI.getWeekEvents(weekId);
    setWeekEvents(events);
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  };

  const getClientName = (browserName: string) => {
    return allBrowsers[browserName]?.clientName || browserName;
  };

  // 🆕 CALCULAR TOTAL DE POSTS (incluyendo multi-post)
  const getTotalPosts = () => {
    let totalPosts = 0;
    Object.values(allBrowsers).forEach(browser => {
      if (browser.isMultiPost && browser.posts) {
        totalPosts += browser.postCount || Object.keys(browser.posts).length;
      } else {
        totalPosts += 1;
      }
    });
    return totalPosts;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  if (!currentWeek) return null;

  // Calcular comparativas con semana anterior (con validaciones)
  const previousWeek = weeksHistory?.[1] || null;
  const bannedChange = previousWeek 
    ? (currentWeek.bannedAccounts?.length || 0) - (previousWeek.bannedAccounts?.length || 0) 
    : 0;
  const renewalsChange = previousWeek 
    ? (currentWeek.renewals || 0) - (previousWeek.renewals || 0) 
    : 0;
  const newClientsChange = previousWeek 
    ? (currentWeek.newClients?.length || 0) - (previousWeek.newClients?.length || 0) 
    : 0;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          📊 Estadísticas Semanales
        </h1>
        <p className="text-muted-foreground">
          {formatDate(currentWeek.startDate)} - {formatDate(currentWeek.endDate)}
        </p>
      </div>

      {/* Main Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Cuentas Bloqueadas */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-red-500/10 to-red-600/5 p-6 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl">🚫</div>
              {bannedChange !== 0 && (
                <div className={cn(
                  "px-2 py-1 rounded-full text-xs font-semibold",
                  bannedChange > 0 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                )}>
                  {bannedChange > 0 ? `+${bannedChange}` : bannedChange}
                </div>
              )}
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              {currentWeek.bannedAccounts?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Cuentas Bloqueadas</div>
            <div className="mt-3 pt-3 border-t border-red-500/20">
              <div className="text-xs text-red-400">Esta semana</div>
            </div>
          </div>
        </div>

        {/* Renovaciones */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-green-500/10 to-green-600/5 p-6 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-green-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl">🔄</div>
              {renewalsChange !== 0 && (
                <div className={cn(
                  "px-2 py-1 rounded-full text-xs font-semibold",
                  renewalsChange > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {renewalsChange > 0 ? `+${renewalsChange}` : renewalsChange}
                </div>
              )}
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              {currentWeek.renewals || 0}
            </div>
            <div className="text-sm text-muted-foreground">Renovaciones (7d+)</div>
            <div className="mt-3 pt-3 border-t border-green-500/20">
              <div className="text-xs text-green-400">Ingresos activos</div>
            </div>
          </div>
        </div>

        {/* Clientes Nuevos */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl">✨</div>
              {newClientsChange !== 0 && (
                <div className={cn(
                  "px-2 py-1 rounded-full text-xs font-semibold",
                  newClientsChange > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {newClientsChange > 0 ? `+${newClientsChange}` : newClientsChange}
                </div>
              )}
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              {currentWeek.newClients?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Clientes Nuevos</div>
            <div className="mt-3 pt-3 border-t border-blue-500/20">
              <div className="text-xs text-blue-400">Esta semana</div>
            </div>
          </div>
        </div>

        {/* Total Clientes - 🆕 CORREGIDO */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-6 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl">👥</div>
              <div className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-semibold">
                TOTAL
              </div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              {getTotalPosts()}
            </div>
            <div className="text-sm text-muted-foreground">Posts/Clientes Activos</div>
            <div className="mt-3 pt-3 border-t border-purple-500/20">
              <div className="text-xs text-purple-400">Base total de posts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Tendencias */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          📈 Tendencias de las Últimas 12 Semanas
        </h2>
        
        <div className="space-y-4">
          {/* Leyenda */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Cuentas Bloqueadas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Renovaciones</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Clientes Nuevos</span>
            </div>
          </div>

          {/* Gráfico Simple */}
          <div className="relative h-64 flex items-end gap-2">
            {(weeksHistory || []).slice(0, 12).reverse().map((week, idx) => {
              const maxValue = Math.max(
                ...(weeksHistory || []).map(w => Math.max(
                  w.bannedAccounts?.length || 0,
                  w.renewals || 0,
                  w.newClients?.length || 0
                )),
                1 // Evitar división por 0
              );
              
              const bannedHeight = ((week.bannedAccounts?.length || 0) / maxValue) * 100;
              const renewalsHeight = ((week.renewals || 0) / maxValue) * 100;
              const newClientsHeight = ((week.newClients?.length || 0) / maxValue) * 100;

              return (
                <div key={week.weekId} className="flex-1 flex items-end gap-1">
                  <div 
                    className="flex-1 bg-gradient-to-t from-red-500 to-red-400 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ height: `${bannedHeight}%`, minHeight: '4px' }}
                    title={`Bans: ${week.bannedAccounts?.length || 0}`}
                  />
                  <div 
                    className="flex-1 bg-gradient-to-t from-green-500 to-green-400 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ height: `${renewalsHeight}%`, minHeight: '4px' }}
                    title={`Renovaciones: ${week.renewals || 0}`}
                  />
                  <div 
                    className="flex-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ height: `${newClientsHeight}%`, minHeight: '4px' }}
                    title={`Nuevos: ${week.newClients?.length || 0}`}
                  />
                </div>
              );
            })}
          </div>

          {/* Etiquetas de semanas */}
          <div className="flex gap-2 text-xs text-muted-foreground">
            {(weeksHistory || []).slice(0, 12).reverse().map((week) => (
              <div key={week.weekId} className="flex-1 text-center truncate">
                {week.weekId?.split('-W')[1] || ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Clientes Nuevos Esta Semana */}
      {currentWeek.newClients && currentWeek.newClients.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            ✨ Clientes Nuevos Esta Semana
            <span className="text-sm font-normal text-muted-foreground">({currentWeek.newClients.length})</span>
          </h2>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentWeek.newClients.map((browserName) => {
              const browser = allBrowsers[browserName];
              const clientName = getClientName(browserName);
              const initials = clientName.substring(0, 2).toUpperCase();
              
              return (
                <div 
                  key={browserName}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4 transition-all hover:scale-105 hover:border-primary/50 hover:shadow-lg"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white font-bold text-lg">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate">{clientName}</div>
                    <div className="text-xs text-muted-foreground truncate">{browserName}</div>
                    {browser?.createdAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(browser.createdAt)}
                      </div>
                    )}
                  </div>
                  <div className="text-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                    👋
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cuentas Bloqueadas Esta Semana */}
      {currentWeek.bannedAccounts && currentWeek.bannedAccounts.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-card p-6">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            🚫 Cuentas Bloqueadas Esta Semana
            <span className="text-sm font-normal text-muted-foreground">({currentWeek.bannedAccounts.length})</span>
          </h2>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentWeek.bannedAccounts.map((browserName) => {
              const browser = allBrowsers[browserName];
              const clientName = getClientName(browserName);
              const initials = clientName.substring(0, 2).toUpperCase();
              
              return (
                <div 
                  key={browserName}
                  className="group flex items-center gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 transition-all hover:scale-105"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white font-bold text-lg opacity-70">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate line-through opacity-70">{clientName}</div>
                    <div className="text-xs text-muted-foreground truncate">{browserName}</div>
                    {browser?.bannedAt && (
                      <div className="text-xs text-red-400 mt-1">
                        Bloqueado: {formatDate(browser.bannedAt)}
                      </div>
                    )}
                  </div>
                  <div className="text-2xl">💀</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial de Semanas */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground mb-6">📅 Historial de Semanas</h2>
        
        <div className="space-y-3">
          {(weeksHistory || []).slice(0, 8).map((week) => {
            const isCurrentWeek = week.weekId === currentWeek.weekId;
            
            return (
              <div
                key={week.weekId}
                className={cn(
                  "rounded-xl border border-border bg-secondary/30 p-4 transition-all hover:scale-[1.02] cursor-pointer",
                  isCurrentWeek && "border-primary bg-primary/5 ring-2 ring-primary/20"
                )}
                onClick={() => setSelectedWeek(week.weekId === selectedWeek ? null : week.weekId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-foreground">{week.weekId}</span>
                      {isCurrentWeek && (
                        <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(week.startDate)} - {formatDate(week.endDate)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-red-400">{week.bannedAccounts?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Bans</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-400">{week.renewals || 0}</div>
                      <div className="text-xs text-muted-foreground">Renew</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-blue-400">{week.newClients?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Nuevos</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-purple-400">{week.totalClients || 0}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                </div>

                {/* Detalles expandibles */}
                {selectedWeek === week.weekId && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2 animate-in fade-in duration-200">
                    {week.bannedAccounts && week.bannedAccounts.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-red-400 mb-1">Bloqueados:</div>
                        <div className="flex flex-wrap gap-2">
                          {week.bannedAccounts.map((name) => (
                            <span key={name} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">
                              {getClientName(name)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {week.newClients && week.newClients.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-blue-400 mb-1">Nuevos Clientes:</div>
                        <div className="flex flex-wrap gap-2">
                          {week.newClients.map((name) => (
                            <span key={name} className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs">
                              {getClientName(name)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Insights y Recomendaciones */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Mejor Semana */}
        {weeksHistory && weeksHistory.length > 0 && (() => {
          const bestWeek = [...weeksHistory].sort((a, b) => (b.renewals || 0) - (a.renewals || 0))[0];
          if (!bestWeek) return null;
          return (
            <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-4xl">🏆</div>
                <div>
                  <div className="text-lg font-bold text-foreground">Mejor Semana</div>
                  <div className="text-sm text-muted-foreground">{bestWeek.weekId}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Renovaciones</span>
                  <span className="font-bold text-green-400">{bestWeek.renewals || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Nuevos Clientes</span>
                  <span className="font-bold text-blue-400">{bestWeek.newClients?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bloqueos</span>
                  <span className="font-bold text-red-400">{bestWeek.bannedAccounts?.length || 0}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Peor Semana */}
        {weeksHistory && weeksHistory.length > 0 && (() => {
          const worstWeek = [...weeksHistory].sort((a, b) => (b.bannedAccounts?.length || 0) - (a.bannedAccounts?.length || 0))[0];
          if (!worstWeek) return null;
          return (
            <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-4xl">⚠️</div>
                <div>
                  <div className="text-lg font-bold text-foreground">Más Bloqueos</div>
                  <div className="text-sm text-muted-foreground">{worstWeek.weekId}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cuentas Bloqueadas</span>
                  <span className="font-bold text-red-400">{worstWeek.bannedAccounts?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Renovaciones</span>
                  <span className="font-bold text-green-400">{worstWeek.renewals || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Nuevos Clientes</span>
                  <span className="font-bold text-blue-400">{worstWeek.newClients?.length || 0}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Promedios Generales */}
      {weeksHistory && weeksHistory.length > 0 && (() => {
        const avgBans = Math.round(weeksHistory.reduce((sum, w) => sum + (w.bannedAccounts?.length || 0), 0) / weeksHistory.length);
        const avgRenewals = Math.round(weeksHistory.reduce((sum, w) => sum + (w.renewals || 0), 0) / weeksHistory.length);
        const avgNewClients = Math.round(weeksHistory.reduce((sum, w) => sum + (w.newClients?.length || 0), 0) / weeksHistory.length);

        return (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold text-foreground mb-6">📊 Promedios (Últimas {weeksHistory.length} Semanas)</h2>
            
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <div className="text-3xl font-bold text-red-400 mb-1">{avgBans}</div>
                <div className="text-sm text-muted-foreground">Bloqueos/semana</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="text-3xl font-bold text-green-400 mb-1">{avgRenewals}</div>
                <div className="text-sm text-muted-foreground">Renovaciones/semana</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="text-3xl font-bold text-blue-400 mb-1">{avgNewClients}</div>
                <div className="text-sm text-muted-foreground">Nuevos/semana</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
