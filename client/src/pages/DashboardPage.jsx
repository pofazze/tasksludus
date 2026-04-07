import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import {
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
  PRODUCER_TYPE_LABELS,
  CONTENT_TYPE_LABELS,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import PageLoading from '@/components/common/PageLoading';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  CheckCircle2, Clock, Trophy, TrendingUp,
  ArrowRight, Package, Crown, Medal, Award,
  BarChart3, Layers, User,
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [goals, setGoals] = useState([]);

  const isMgmt = isManagement(user?.role);

  const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const fetchDashboard = async () => {
    try {
      const month = currentMonth();
      const requests = [
        api.get('/deliveries', { params: { month } }).catch(() => ({ data: [] })),
        api.get('/ranking', { params: { month } }).catch(() => ({ data: [] })),
      ];

      if (isMgmt) {
        requests.push(
          api.get('/goals', { params: { month } }).catch(() => ({ data: [] })),
        );
      }

      const results = await Promise.all(requests);
      setDeliveries(results[0].data);
      setRanking(results[1].data);
      if (results[2]) setGoals(results[2].data);
    } catch {
      if (loading) toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Re-fetch when server pushes relevant events
  useServerEvent(
    ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated', 'ranking:updated', 'goals:updated'],
    fetchDashboard
  );

  if (loading) return <PageLoading />;

  const activeDeliveries = deliveries.filter((d) => d.status !== 'cancelado');
  const totalPublished = activeDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const totalInPipeline = activeDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  // For non-management (producers): personal view
  const myDeliveries = deliveries.filter((d) => d.user_id === user?.id);
  const myPublished = myDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const myInPipeline = myDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;
  const myRank = ranking.find((r) => r.id === user?.id);

  // -- Management: build leaderboard data --
  // Build per-user delivery counts from deliveries array
  const userDeliveryCounts = {};
  deliveries.forEach((d) => {
    if (!userDeliveryCounts[d.user_id]) userDeliveryCounts[d.user_id] = { published: 0, inProduction: 0 };
    if (d.status === 'publicacao' || d.status === 'completed') {
      userDeliveryCounts[d.user_id].published++;
    } else if (d.status !== 'cancelado') {
      userDeliveryCounts[d.user_id].inProduction++;
    }
  });

  // Build per-user goal target lookup from goals array
  const userGoalMap = {};
  goals.forEach((g) => {
    if (g.monthly_target != null) {
      userGoalMap[g.user_id] = parseInt(g.monthly_target, 10);
    }
  });

  // Merge ranking + goals + delivery counts into leaderboard rows
  const leaderboard = ranking.map((entry) => {
    const userId = entry.id;
    const counts = userDeliveryCounts[userId] || { published: 0, inProduction: 0 };
    const meta = userGoalMap[userId] ?? null;
    const total = entry.total_deliveries || 0;
    const pct = meta ? Math.round((total / meta) * 100) : null;

    return {
      userId,
      name: entry.name,
      avatarUrl: entry.avatar_url,
      producerType: entry.producer_type,
      total,
      published: counts.published,
      inProduction: counts.inProduction,
      multiplier: entry.multiplier,
      rank: entry.rank,
      meta,
      pct,
    };
  });

  // Progress bar color based on % of meta achieved
  const progressBarColor = (pct) => {
    if (pct === null) return 'bg-zinc-700';
    if (pct >= 100) return 'bg-[#9A48EA]';
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Position icon for leaderboard
  const positionIcon = (rank) => {
    if (rank === 1) return <Crown size={20} className="text-yellow-400" />;
    if (rank === 2) return <Medal size={20} className="text-zinc-400" />;
    if (rank === 3) return <Award size={20} className="text-amber-600" />;
    return <span className="text-sm font-bold text-muted-foreground tabular-nums">{rank}</span>;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {isMgmt ? (
        /* ========== MANAGEMENT VIEW ========== */
        <>
          {/* Section 1: KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow duration-150"
              onClick={() => navigate('/deliveries')}
            >
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-500/15">
                  <Package size={22} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Entregas do Mês</p>
                  <p className="text-2xl font-bold tabular-nums">{activeDeliveries.length}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-emerald-500/15">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Publicadas</p>
                  <p className="text-2xl font-bold tabular-nums">{totalPublished}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeDeliveries.length > 0
                      ? `${Math.round((totalPublished / activeDeliveries.length) * 100)}% do total`
                      : '0% do total'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-500/15">
                  <Clock size={22} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Em Produção</p>
                  <p className="text-2xl font-bold tabular-nums">{totalInPipeline}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Team Production Leaderboard */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Produção do Time
            </h2>
            <button
              onClick={() => navigate('/ranking')}
              className="cursor-pointer text-sm text-primary hover:underline flex items-center gap-1 transition-colors duration-150"
            >
              Ver ranking <ArrowRight size={12} />
            </button>
          </div>

          <Card className="mb-8">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {leaderboard.length > 0 ? (
                  leaderboard.map((row) => (
                    <div
                      key={row.userId}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 hover:bg-muted/30"
                      onClick={() => navigate('/ranking')}
                    >
                      {/* Position */}
                      <div className="w-7 flex items-center justify-center shrink-0">
                        {positionIcon(row.rank)}
                      </div>

                      {/* Avatar */}
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={row.avatarUrl} />
                        <AvatarFallback className="text-xs">{initials(row.name)}</AvatarFallback>
                      </Avatar>

                      {/* Name + badge + progress + stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium truncate">{row.name}</span>
                          {row.producerType && PRODUCER_TYPE_LABELS[row.producerType] && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {PRODUCER_TYPE_LABELS[row.producerType]}
                            </Badge>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="h-2 bg-muted dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressBarColor(row.pct)}`}
                            style={{ width: row.pct !== null ? `${Math.min(row.pct, 100)}%` : `${row.total > 0 ? Math.min(row.total * 5, 100) : 0}%` }}
                          />
                        </div>

                        {/* Stats line */}
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {row.published} pub · {row.inProduction} prod
                          {row.meta != null && (
                            <> · Meta: {row.meta} ({row.pct}%)</>
                          )}
                        </p>
                      </div>

                      {/* Total count */}
                      <span className="text-lg font-bold tabular-nums shrink-0">{row.total}</span>

                      {/* Multiplier badge */}
                      {row.multiplier != null && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 shrink-0">
                          {row.multiplier}x
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">Sem dados de ranking</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Compact Pipeline */}
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Pipeline de Produção</h2>
          <div className="flex gap-1 overflow-x-auto mb-8">
            {PIPELINE_ORDER.map((status) => {
              const count = deliveries.filter((d) => d.status === status).length;
              return (
                <div
                  key={status}
                  onClick={() => navigate(`/deliveries?status=${status}`)}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-opacity duration-150 hover:opacity-80 ${
                    count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="font-bold text-lg tabular-nums">{count}</span>
                  <span>{PIPELINE_STATUSES[status]}</span>
                </div>
              );
            })}
          </div>

          {/* Section 4: Workload + Deliveries by Format (side-by-side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Workload per team member */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Carga de Trabalho
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {(() => {
                      const workload = {};
                      activeDeliveries.forEach((d) => {
                        if (!d.user_id || d.status === 'publicacao' || d.status === 'completed') return;
                        if (!workload[d.user_id]) workload[d.user_id] = { name: d.user_name || 'Sem responsável', count: 0 };
                        workload[d.user_id].count++;
                      });
                      const sorted = Object.values(workload).sort((a, b) => b.count - a.count);
                      const maxCount = sorted[0]?.count || 1;

                      if (sorted.length === 0) {
                        return <p className="text-center text-muted-foreground py-6 text-sm">Sem entregas em produção</p>;
                      }

                      return sorted.map((w) => (
                        <div key={w.name} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted shrink-0">
                            <User size={14} className="text-zinc-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{w.name}</p>
                            <div className="h-1.5 bg-muted dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${(w.count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{w.count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Deliveries by format */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Entregas por Formato
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {(() => {
                      const byFormat = {};
                      activeDeliveries.forEach((d) => {
                        const key = d.content_type || 'outros';
                        byFormat[key] = (byFormat[key] || 0) + 1;
                      });
                      const sorted = Object.entries(byFormat).sort(([, a], [, b]) => b - a);
                      const maxCount = sorted[0]?.[1] || 1;

                      if (sorted.length === 0) {
                        return <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma entrega este mês</p>;
                      }

                      const formatColors = {
                        reel: 'bg-blue-500',
                        feed: 'bg-emerald-500',
                        story: 'bg-amber-500',
                        carrossel: 'bg-purple-500',
                        banner: 'bg-pink-500',
                        caixinha: 'bg-orange-500',
                        analise: 'bg-cyan-500',
                        pdf: 'bg-red-500',
                        video: 'bg-indigo-500',
                        mockup: 'bg-teal-500',
                      };

                      return sorted.map(([type, count]) => (
                        <div key={type} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted shrink-0">
                            <Layers size={14} className="text-zinc-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{CONTENT_TYPE_LABELS[type] || type}</p>
                            <div className="h-1.5 bg-muted dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${formatColors[type] || 'bg-zinc-500'}`}
                                style={{ width: `${(count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section 5: Recent Deliveries */}
          <Card>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-base font-semibold">Entregas Recentes</h3>
              <button onClick={() => navigate('/deliveries')} className="cursor-pointer text-sm text-primary hover:underline flex items-center gap-1">
                Ver todas <ArrowRight size={12} />
              </button>
            </div>
            <CardContent className="space-y-2">
              {activeDeliveries.slice(0, 10).map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.client_name && <span>{d.client_name} · </span>}
                      {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                      {d.user_name && <span className="text-zinc-600"> · {d.user_name}</span>}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={PIPELINE_STATUS_COLORS[d.status] || 'bg-muted text-foreground'}
                  >
                    {PIPELINE_STATUSES[d.status] || d.status}
                  </Badge>
                </div>
              ))}
              {activeDeliveries.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhuma entrega este mês</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* ========== PRODUCER VIEW ========== */
        <>
          {/* Personal KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/deliveries')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-500/15">
                  <TrendingUp size={22} className="text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Minhas Entregas</p>
                  <p className="text-2xl font-bold tabular-nums">{myDeliveries.length}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-emerald-500/15">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Publicadas</p>
                  <p className="text-2xl font-bold tabular-nums">{myPublished}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-500/15">
                  <Clock size={22} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Em Produção</p>
                  <p className="text-2xl font-bold tabular-nums">{myInPipeline}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ranking')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-yellow-500/15">
                  <Trophy size={22} className="text-yellow-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Meu Ranking</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {myRank ? `#${myRank.rank}` : '\u2014'}
                  </p>
                  {myRank && (
                    <p className="text-xs text-muted-foreground">{myRank.multiplier}x multiplicador</p>
                  )}
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Personal pipeline */}
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Meu Pipeline</h2>
          <div className="flex gap-1 mb-6 overflow-x-auto">
            {PIPELINE_ORDER.map((status) => {
              const count = myDeliveries.filter((d) => d.status === status).length;
              return (
                <div
                  key={status}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap ${
                    count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="font-bold text-lg tabular-nums">{count}</span>
                  <span>{PIPELINE_STATUSES[status]}</span>
                </div>
              );
            })}
          </div>

          {/* Recent deliveries */}
          <Card>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-base font-semibold">Minhas Entregas Recentes</h3>
              <button onClick={() => navigate('/deliveries')} className="cursor-pointer text-sm text-primary hover:underline flex items-center gap-1">
                Ver todas <ArrowRight size={12} />
              </button>
            </div>
            <CardContent className="space-y-3">
              {myDeliveries.slice(0, 10).map((d) => (
                <div key={d.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={PIPELINE_STATUS_COLORS[d.status] || 'bg-muted text-foreground'}
                  >
                    {PIPELINE_STATUSES[d.status] || d.status}
                  </Badge>
                </div>
              ))}
              {myDeliveries.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhuma entrega este mês</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
