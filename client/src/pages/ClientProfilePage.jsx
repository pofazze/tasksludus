import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import { getConnectionStatus, getOAuthUrl, disconnectInstagram, listScheduledPosts } from '@/services/instagram';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import {
  CONTENT_TYPE_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
  DIFFICULTY_LABELS,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import AgendamentoTab from '@/components/instagram/AgendamentoTab';
import ApprovalTab from '@/components/approvals/ApprovalTab';
import CorrectionTab from '@/components/approvals/CorrectionTab';

import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import KanbanBoard from '@/components/deliveries/KanbanBoard';
import DeliveryListTable from '@/components/deliveries/DeliveryListTable';
import DeliveryDetailModal from '@/components/deliveries/DeliveryDetailModal';
import {
  ArrowLeft, Calendar, CheckCircle2, ClipboardCheck, Clock, ExternalLink, Eye,
  Filter, Image as ImageIcon, Instagram, LayoutGrid, List, Loader2, Package, RefreshCw, TrendingUp, User, Users,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────
const fmtNumber = (n) => (n != null ? n.toLocaleString('pt-BR') : '—');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }) : '—';

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const days = Math.floor(h / 24);
    const remH = h % 24;
    return `${days}d ${remH}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Main Component ───────────────────────────────────────
export default function ClientProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role) || user?.producer_type === 'social_media';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Internal views: 'profile' | 'delivery'
  const [view, setView] = useState('profile');
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [modalDelivery, setModalDelivery] = useState(null);
  const [phases, setPhases] = useState([]);
  const [phasesLoading, setPhasesLoading] = useState(false);

  // Tab: 'entregas' | 'aprovacao' | 'correcao' | 'instagram'
  const [activeTab, setActiveTab] = useState('entregas');
  const [entregasView, setEntregasView] = useState('kanban'); // 'kanban' | 'list'
  const [draftCount, setDraftCount] = useState(0);

  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  // Instagram sync
  const [igSyncing, setIgSyncing] = useState(false);

  // Instagram OAuth connection
  const [igConnection, setIgConnection] = useState(null);
  const [igConnecting, setIgConnecting] = useState(false);

  // Kanban month filter (empty string = all time)
  const [kanbanMonth, setKanbanMonth] = useState(getCurrentMonth());

  const fetchProfile = async () => {
    try {
      const { data } = await api.get(`/clients/${id}/profile`);
      setProfile(data);
    } catch {
      if (loading) {
        toast.error('Erro ao carregar perfil do cliente');
        navigate('/clients');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id]);

  // Re-fetch when server pushes relevant events
  const profileEvents = useMemo(() => ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated'], []);
  useServerEvent(profileEvents, fetchProfile);

  // Fetch draft count for Agendamento tab badge
  useEffect(() => {
    listScheduledPosts({ client_id: id, status: 'draft' })
      .then((data) => setDraftCount(data.length))
      .catch(() => {});
  }, [id]);

  // Fetch Instagram connection status
  useEffect(() => {
    getConnectionStatus(id).then(setIgConnection).catch(() => setIgConnection(null));
    // Check for OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      toast.success('Instagram conectado com sucesso!');
      getConnectionStatus(id).then(setIgConnection);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [id]);

  // ─── Delivery detail ──────────────────────────────────
  const openDeliveryDetail = async (delivery) => {
    setSelectedDelivery(delivery);
    setView('delivery');
    setPhasesLoading(true);
    try {
      const { data } = await api.get(`/deliveries/${delivery.id}/phases`);
      setPhases(data);
    } catch {
      setPhases([]);
    } finally {
      setPhasesLoading(false);
    }
  };

  const backToProfile = () => {
    setView('profile');
    setSelectedDelivery(null);
    setPhases([]);
  };

  const handleKanbanStatusChange = async (deliveryId, newStatus) => {
    try {
      await api.put(`/deliveries/${deliveryId}`, { status: newStatus });
      toast.success('Status atualizado');
      fetchProfile();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleKanbanCardClick = (delivery) => {
    setModalDelivery(delivery);
  };


  // ─── Instagram sync ───────────────────────────────────
  const syncInstagram = async () => {
    setIgSyncing(true);
    try {
      const { data: result } = await api.post(`/clients/${id}/instagram/sync`);
      toast.success(`Sync concluído: ${result.synced} novos posts de ${result.total}`);
      const { data } = await api.get(`/clients/${id}/profile`);
      setProfile(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sincronizar Instagram');
    } finally {
      setIgSyncing(false);
    }
  };

  // ─── Derived data ─────────────────────────────────────
  const availableMonths = useMemo(() => {
    if (!profile) return [];
    const months = new Set();
    for (const d of profile.deliveries) {
      if (d.month) months.add(d.month.slice(0, 7));
    }
    return [...months].sort().reverse();
  }, [profile]);

  const kanbanDeliveries = useMemo(() => {
    if (!profile) return {};
    const filtered = profile.deliveries.filter((d) => {
      if (kanbanMonth && d.month) {
        const dm = d.month.slice(0, 7);
        if (dm !== kanbanMonth) return false;
      }
      return true;
    });
    const grouped = {};
    for (const status of PIPELINE_ORDER) {
      grouped[status] = filtered.filter((d) => d.status === status);
    }
    return grouped;
  }, [profile, kanbanMonth]);

  const filteredDeliveries = useMemo(() => {
    if (!profile) return [];
    return profile.deliveries.filter((d) => {
      if (filterMonth && d.month && d.month.slice(0, 7) !== filterMonth) return false;
      if (filterStatus && d.status !== filterStatus) return false;
      if (filterType && d.content_type !== filterType) return false;
      return true;
    });
  }, [profile, filterMonth, filterStatus, filterType]);

  const distinctFormats = useMemo(() => {
    if (!profile) return 0;
    return new Set(profile.deliveries.map((d) => d.content_type).filter(Boolean)).size;
  }, [profile]);

  if (loading) return <PageLoading />;
  if (!profile) return null;

  const { client, metrics, igPosts } = profile;

  // ═══════════════════════════════════════════════════════
  // DELIVERY DETAIL VIEW
  // ═══════════════════════════════════════════════════════
  if (view === 'delivery' && selectedDelivery) {
    const d = selectedDelivery;
    const clickupUrl = d.clickup_task_id
      ? `https://app.clickup.com/t/${d.clickup_task_id}`
      : null;

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={backToProfile}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold font-display truncate">{d.title}</h1>
            <p className="text-sm text-muted-foreground">{client.name}</p>
          </div>
        </div>

        {/* Status & badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[d.status] || ''}>
            {PIPELINE_STATUSES[d.status] || d.status}
          </Badge>
          {d.content_type && (
            <Badge variant="outline">{CONTENT_TYPE_LABELS[d.content_type] || d.content_type}</Badge>
          )}
          {d.difficulty && (
            <Badge variant="outline">{DIFFICULTY_LABELS[d.difficulty] || d.difficulty}</Badge>
          )}
          {d.urgency && d.urgency !== 'normal' && (
            <Badge variant="destructive">{d.urgency}</Badge>
          )}
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><User size={12} /> Responsável</p>
              <p className="text-sm font-medium mt-1">{d.user_name || '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Mês</p>
              <p className="text-sm font-medium mt-1">{d.month ? new Date(d.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={12} /> Início</p>
              <p className="text-sm font-medium mt-1">{fmtDate(d.started_at || d.created_at)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 size={12} /> Conclusão</p>
              <p className="text-sm font-medium mt-1">{fmtDate(d.completed_at)}</p>
            </CardContent>
          </Card>
        </div>

        {/* ClickUp link */}
        {clickupUrl && (
          <div className="mb-8">
            <a
              href={clickupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline"
            >
              Abrir no ClickUp <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* Phase Timeline */}
        <h2 className="text-lg font-semibold mb-4">Timeline de Fases</h2>
        {phasesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : phases.length > 0 ? (
          <div className="relative ml-4">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-zinc-700" />

            {phases.map((phase, i) => {
              const isActive = !phase.exited_at;
              const statusColor = PIPELINE_STATUS_COLORS[phase.phase] || 'bg-zinc-500/15 text-zinc-400';
              return (
                <div key={phase.id} className="relative pl-10 pb-6 last:pb-0">
                  {/* Node dot */}
                  <div className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-background ${
                    isActive ? 'bg-purple-500' : 'bg-zinc-600'
                  }`}>
                    {isActive && (
                      <span className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-40" />
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                    <Badge variant="secondary" className={`${statusColor} shrink-0`}>
                      {PIPELINE_STATUSES[phase.phase] || phase.phase}
                    </Badge>
                    <div className="text-sm space-y-0.5">
                      {phase.user_name && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <User size={11} /> {phase.user_name}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        {fmtDateTime(phase.entered_at)}
                        {phase.exited_at && ` → ${fmtDateTime(phase.exited_at)}`}
                      </p>
                      {phase.duration_seconds != null && (
                        <p className="text-xs text-muted-foreground/70">
                          Duração: {formatDuration(phase.duration_seconds)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6">Nenhuma fase registrada para esta entrega.</p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // PROFILE VIEW
  // ═══════════════════════════════════════════════════════
  const clientInitials = client.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/clients')}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft size={12} /> Voltar para clientes
        </button>

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="w-12 h-12 rounded-xl shrink-0">
            <AvatarImage src={client.avatar_url} className="rounded-xl object-cover" />
            <AvatarFallback className="rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 text-lg font-bold">
              {clientInitials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-display truncate">{client.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                client.is_active !== false
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-zinc-500/15 text-zinc-400'
              }`}>
                {client.is_active !== false ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
              {client.company && (
                <span className="text-sm text-zinc-500">{client.company}</span>
              )}
              {client.instagram_account && (
                <a
                  href={`https://instagram.com/${client.instagram_account.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-400 hover:text-pink-300 text-sm inline-flex items-center gap-1 transition-colors"
                >
                  <Instagram size={12} />
                  {client.instagram_account.startsWith('@') ? client.instagram_account : `@${client.instagram_account}`}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Compact metrics row */}
        <div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 mt-4 sm:mt-5 px-1">
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-zinc-500" />
            <span className="text-sm font-semibold tabular-nums">{metrics.totalDeliveries}</span>
            <span className="text-xs text-zinc-500">entregas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span className="text-sm font-semibold tabular-nums text-emerald-400">{metrics.publishedCount}</span>
            <span className="text-xs text-zinc-500">publicadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-amber-400" />
            <span className="text-sm font-semibold tabular-nums text-amber-400">{metrics.inProduction}</span>
            <span className="text-xs text-zinc-500">em produção</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-zinc-500" />
            <span className="text-sm font-semibold tabular-nums">{distinctFormats}</span>
            <span className="text-xs text-zinc-500">formatos</span>
          </div>
          {client.instagram_account && (
            <>
              <div className="flex items-center gap-1.5">
                <Instagram size={13} className="text-pink-400" />
                <span className="text-sm font-semibold tabular-nums text-pink-400">{metrics.igSummary.totalPosts}</span>
                <span className="text-xs text-zinc-500">posts IG</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-pink-400" />
                <span className="text-sm font-semibold tabular-nums text-pink-400">{fmtNumber(metrics.igSummary.totalReach)}</span>
                <span className="text-xs text-zinc-500">alcance</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────── */}
      <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 mb-5 -mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto">
        {[
          { key: 'entregas', icon: Package, label: 'Entregas' },
          { key: 'aprovacao', icon: ClipboardCheck, label: 'Aprovação' },
          { key: 'correcao', icon: RefreshCw, label: 'Correção' },
          { key: 'instagram', icon: Instagram, label: 'Instagram' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === key
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Icon size={15} />
            {label}
            {activeTab === key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
            )}
          </button>
        ))}

        {/* View toggle (only on entregas tab) */}
        {activeTab === 'entregas' && (
          <div className="ml-auto flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 shrink-0 my-1.5">
            <button
              onClick={() => setEntregasView('kanban')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                entregasView === 'kanban'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-200'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setEntregasView('list')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                entregasView === 'list'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-200'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <List size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ─── Tab: Entregas (kanban + list) ─────────────── */}
      {activeTab === 'entregas' && (
        <>
          {/* Month filter */}
          <div className="flex items-center gap-1 mb-4 overflow-x-auto">
            <button
              onClick={() => setKanbanMonth('')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                kanbanMonth === ''
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                  : 'bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Todo tempo
            </button>
            {availableMonths.map((m) => {
              const [y, mo] = m.split('-');
              const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
              return (
                <button
                  key={m}
                  onClick={() => setKanbanMonth(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    kanbanMonth === m
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                      : 'bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {entregasView === 'kanban' ? (
            <KanbanBoard
              deliveries={Object.values(kanbanDeliveries).flat()}
              onStatusChange={handleKanbanStatusChange}
              onCardClick={handleKanbanCardClick}
            />
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <DeliveryListTable
                deliveries={filteredDeliveries}
                onRowClick={handleKanbanCardClick}
                onEdit={(d) => openDeliveryDetail(d)}
                canManage={canManage}
              />
            </div>
          )}
        </>
      )}

      {/* ─── Tab: Aprovação ────────────────────────────── */}
      {activeTab === 'aprovacao' && <ApprovalTab clientId={id} />}

      {/* ─── Tab: Correção ─────────────────────────────── */}
      {activeTab === 'correcao' && <CorrectionTab clientId={id} />}

      {/* ─── Tab: Instagram ────────────────────────────── */}
      {activeTab === 'instagram' && (
        <>
          {/* Instagram Connection Card */}
          {canManage && (
            <Card className="mb-6">
              <CardContent className="py-4 px-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      igConnection?.connected ? 'bg-emerald-500/15' : 'bg-zinc-800'
                    }`}>
                      <Instagram size={18} className={igConnection?.connected ? 'text-emerald-400' : 'text-zinc-500'} />
                    </div>
                    <div>
                      {igConnection?.connected ? (
                        <>
                          <p className="text-sm font-medium text-emerald-400">Conectado</p>
                          <p className="text-xs text-muted-foreground">
                            @{igConnection.username}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium">Instagram Business</p>
                          <p className="text-xs text-muted-foreground">Conecte para publicar automaticamente</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {igConnection?.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                        disabled={igConnecting}
                        onClick={async () => {
                          if (!confirm('Desconectar o Instagram deste cliente?')) return;
                          setIgConnecting(true);
                          try {
                            await disconnectInstagram(id);
                            setIgConnection({ connected: false });
                            toast.success('Instagram desconectado');
                          } catch {
                            toast.error('Erro ao desconectar');
                          } finally {
                            setIgConnecting(false);
                          }
                        }}
                      >
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={igConnecting}
                        onClick={async () => {
                          setIgConnecting(true);
                          try {
                            const { url } = await getOAuthUrl(id);
                            window.location.href = url;
                          } catch {
                            toast.error('Erro ao iniciar conexão');
                            setIgConnecting(false);
                          }
                        }}
                      >
                        {igConnecting ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Instagram size={14} className="mr-2" />}
                        Conectar Instagram
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {canManage && (
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={syncInstagram} disabled={igSyncing}>
                {igSyncing ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <RefreshCw size={14} className="mr-2" />
                )}
                {igSyncing ? 'Sincronizando...' : 'Sincronizar Posts'}
              </Button>
            </div>
          )}

          {igPosts.length > 0 ? (
            <>
              {/* Metrics summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Posts', value: igPosts.length },
                  { label: 'Impressões', value: igPosts.reduce((s, p) => s + (p.metrics?.impressions || 0), 0) },
                  { label: 'Alcance', value: igPosts.reduce((s, p) => s + (p.metrics?.reach || 0), 0) },
                  { label: 'Engajamento', value: igPosts.reduce((s, p) => s + (p.metrics?.engagement || 0), 0) },
                ].map(({ label, value }) => (
                  <Card key={label}>
                    <CardContent className="px-3 pt-3 pb-2">
                      <p className="text-[11px] text-zinc-500">{label}</p>
                      <p className="text-base font-semibold text-zinc-100 tabular-nums">
                        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Visual grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {igPosts.map((p) => (
                  <a
                    key={p.id}
                    href={p.post_url || p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                  >
                    {p.media_url ? (
                      <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <ImageIcon size={24} />
                      </div>
                    )}
                    {/* Type badge */}
                    {p.media_type && p.media_type !== 'IMAGE' && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/60 text-white">
                        {p.media_type === 'VIDEO' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : p.media_type}
                      </span>
                    )}
                    {/* Metrics overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-xs">
                      {p.metrics?.impressions != null && (
                        <span className="flex items-center gap-1 tabular-nums">
                          <Eye size={12} /> {p.metrics.impressions >= 1000 ? `${(p.metrics.impressions / 1000).toFixed(1)}k` : p.metrics.impressions}
                        </span>
                      )}
                      {p.metrics?.reach != null && (
                        <span className="flex items-center gap-1 tabular-nums">
                          <Users size={12} /> {p.metrics.reach >= 1000 ? `${(p.metrics.reach / 1000).toFixed(1)}k` : p.metrics.reach}
                        </span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <Instagram size={40} className="mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum post sincronizado</p>
              {canManage && (
                <p className="text-sm text-muted-foreground">
                  Clique em &quot;Sincronizar Posts&quot; para buscar dados do Instagram.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Delivery Detail Modal */}
      {modalDelivery && (
        <DeliveryDetailModal
          delivery={modalDelivery}
          onClose={() => setModalDelivery(null)}
          onEdit={(d) => {
            setModalDelivery(null);
            openDeliveryDetail(d);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────

// MetricCard kept for potential reuse in delivery detail view
function MetricCard({ label, value, icon, accent }) {
  const accentStyles = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    pink: 'text-pink-400',
  };

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</p>
        <p className={`text-xl font-bold mt-1 ${accentStyles[accent] || ''}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-3.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
        active
          ? 'bg-zinc-800 text-zinc-100 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}
