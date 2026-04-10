import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import { getConnectionStatus, getOAuthUrl, disconnectInstagram, listScheduledPosts } from '@/services/instagram';
import { getOAuthUrl as getTikTokOAuthUrl, getConnectionStatus as getTikTokConnectionStatus, disconnectTikTok } from '@/services/tiktok';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

  const [view, setView] = useState('profile');
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [modalDelivery, setModalDelivery] = useState(null);
  const [phases, setPhases] = useState([]);
  const [phasesLoading, setPhasesLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('entregas');
  const [entregasView, setEntregasView] = useState('kanban');
  const [draftCount, setDraftCount] = useState(0);

  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const [igSyncing, setIgSyncing] = useState(false);
  const [igConnection, setIgConnection] = useState(null);
  const [igConnecting, setIgConnecting] = useState(false);
  const [tkConnection, setTkConnection] = useState(null);
  const [tkConnecting, setTkConnecting] = useState(false);
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

  useEffect(() => { fetchProfile(); }, [id]);

  const profileEvents = useMemo(() => ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated'], []);
  useServerEvent(profileEvents, fetchProfile);

  useEffect(() => {
    listScheduledPosts({ client_id: id, status: 'draft' })
      .then((data) => setDraftCount(data.length))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    getConnectionStatus(id).then(setIgConnection).catch(() => setIgConnection(null));
    getTikTokConnectionStatus(id).then(setTkConnection).catch(() => setTkConnection(null));
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      toast.success('Instagram conectado com sucesso!');
      getConnectionStatus(id).then(setIgConnection);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_connected') === 'true') {
      toast.success('TikTok conectado com sucesso!');
      getTikTokConnectionStatus(id).then(setTkConnection);
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

  const handleKanbanCardClick = (delivery) => setModalDelivery(delivery);

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

  // Tab badge counts
  const approvalCount = useMemo(() => {
    if (!profile) return 0;
    return profile.deliveries.filter((d) =>
      d.approval_status && ['sm_pending', 'sm_approved', 'client_pending'].includes(d.approval_status)
    ).length;
  }, [profile]);

  const correctionCount = useMemo(() => {
    if (!profile) return 0;
    return profile.deliveries.filter((d) => d.approval_status === 'client_rejected').length;
  }, [profile]);

  if (loading) return <PageLoading />;
  if (!profile) return null;

  const { client, metrics, igPosts } = profile;

  // ═══════════════════════════════════════════════════════
  // DELIVERY DETAIL VIEW
  // ═══════════════════════════════════════════════════════
  if (view === 'delivery' && selectedDelivery) {
    const d = selectedDelivery;
    const clickupUrl = d.clickup_task_id ? `https://app.clickup.com/t/${d.clickup_task_id}` : null;

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={backToProfile}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display truncate">{d.title}</h1>
            <p className="text-sm text-muted-foreground">{client.name}</p>
          </div>
          {clickupUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={clickupUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} className="mr-1.5" /> ClickUp
              </a>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[d.status] || ''}>
            {PIPELINE_STATUSES[d.status] || d.status}
          </Badge>
          {d.content_type && <Badge variant="outline">{CONTENT_TYPE_LABELS[d.content_type] || d.content_type}</Badge>}
          {d.difficulty && <Badge variant="outline">{DIFFICULTY_LABELS[d.difficulty] || d.difficulty}</Badge>}
          {d.urgency && d.urgency !== 'normal' && <Badge variant="destructive">{d.urgency}</Badge>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: User, label: 'Responsável', value: d.user_name || '—' },
            { icon: Calendar, label: 'Mês', value: d.month ? new Date(d.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—' },
            { icon: Clock, label: 'Início', value: fmtDate(d.started_at || d.created_at) },
            { icon: CheckCircle2, label: 'Conclusão', value: fmtDate(d.completed_at) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Icon size={12} /> {label}</p>
                <p className="text-sm font-medium mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <h2 className="text-base font-semibold mb-4">Timeline de Fases</h2>
        {phasesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : phases.length > 0 ? (
          <div className="relative ml-4">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
            {phases.map((phase) => {
              const isActive = !phase.exited_at;
              const statusColor = PIPELINE_STATUS_COLORS[phase.phase] || '';
              return (
                <div key={phase.id} className="relative pl-10 pb-6 last:pb-0">
                  <div className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-background ${
                    isActive ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}>
                    {isActive && <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40" />}
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
                        <p className="text-xs text-muted-foreground/70">Duração: {formatDuration(phase.duration_seconds)}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6">Nenhuma fase registrada.</p>
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
      {/* Back link */}
      <button
        onClick={() => navigate('/clients')}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-5"
      >
        <ArrowLeft size={12} /> Clientes
      </button>

      {/* ─── Header Card ─────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar className="w-14 h-14 rounded-xl shrink-0">
            <AvatarImage src={client.avatar_url} className="rounded-xl object-cover" />
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-lg font-bold">
              {clientInitials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold font-display truncate">{client.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                client.is_active !== false
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {client.is_active !== false ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {client.company && <span className="text-sm text-muted-foreground">{client.company}</span>}
              {client.instagram_account && (
                <a
                  href={`https://instagram.com/${client.instagram_account.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-500 hover:text-pink-400 text-sm inline-flex items-center gap-1 transition-colors"
                >
                  <Instagram size={13} />
                  {client.instagram_account.startsWith('@') ? client.instagram_account : `@${client.instagram_account}`}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-border">
          {[
            { icon: Package, value: metrics.totalDeliveries, label: 'entregas', color: 'text-foreground' },
            { icon: CheckCircle2, value: metrics.publishedCount, label: 'publicadas', color: 'text-emerald-500' },
            { icon: Clock, value: metrics.inProduction, label: 'em produção', color: 'text-amber-500' },
            { icon: Filter, value: distinctFormats, label: 'formatos', color: 'text-foreground' },
            ...(client.instagram_account ? [
              { icon: Instagram, value: metrics.igSummary.totalPosts, label: 'posts IG', color: 'text-pink-500' },
              { icon: TrendingUp, value: fmtNumber(metrics.igSummary.totalReach), label: 'alcance', color: 'text-pink-500' },
            ] : []),
          ].map(({ icon: Icon, value, label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon size={14} className={color} />
              <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-3 mb-5">
          <TabsList variant="line" className="flex-1 overflow-x-auto">
            <TabsTrigger value="entregas"><Package size={14} /> Pipeline</TabsTrigger>
            <TabsTrigger value="aprovacao">
              <ClipboardCheck size={14} /> Aprovação
              {approvalCount > 0 && <CountBadge count={approvalCount} />}
            </TabsTrigger>
            <TabsTrigger value="correcao">
              <RefreshCw size={14} /> Correção
              {correctionCount > 0 && <CountBadge count={correctionCount} color="destructive" />}
            </TabsTrigger>
            <TabsTrigger value="agendamento">
              <Calendar size={14} /> Agendamento
              {draftCount > 0 && <CountBadge count={draftCount} />}
            </TabsTrigger>
            <TabsTrigger value="instagram"><Instagram size={14} /> Instagram</TabsTrigger>
          </TabsList>

          {activeTab === 'entregas' && (
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setEntregasView('kanban')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  entregasView === 'kanban' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setEntregasView('list')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  entregasView === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List size={15} />
              </button>
            </div>
          )}
        </div>

        {/* ─── Tab: Pipeline ───────────────────────────── */}
        <TabsContent value="entregas">
          {/* Month pills */}
          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
            <MonthPill active={kanbanMonth === ''} onClick={() => setKanbanMonth('')}>Todo tempo</MonthPill>
            {availableMonths.map((m) => {
              const [y, mo] = m.split('-');
              const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
              return <MonthPill key={m} active={kanbanMonth === m} onClick={() => setKanbanMonth(m)}>{label}</MonthPill>;
            })}
          </div>

          {entregasView === 'kanban' ? (
            <KanbanBoard
              deliveries={Object.values(kanbanDeliveries).flat()}
              onStatusChange={handleKanbanStatusChange}
              onCardClick={handleKanbanCardClick}
            />
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <DeliveryListTable
                deliveries={filteredDeliveries}
                onRowClick={handleKanbanCardClick}
                onEdit={(d) => openDeliveryDetail(d)}
                canManage={canManage}
              />
            </div>
          )}
        </TabsContent>

        {/* ─── Tab: Aprovação ──────────────────────────── */}
        <TabsContent value="aprovacao">
          <ApprovalTab clientId={id} />
        </TabsContent>

        {/* ─── Tab: Correção ───────────────────────────── */}
        <TabsContent value="correcao">
          <CorrectionTab clientId={id} />
        </TabsContent>

        {/* ─── Tab: Agendamento ────────────────────────── */}
        <TabsContent value="agendamento">
          <AgendamentoTab clientId={id} />
        </TabsContent>

        {/* ─── Tab: Instagram ──────────────────────────── */}
        <TabsContent value="instagram">
          <InstagramSection
            clientId={id}
            canManage={canManage}
            igConnection={igConnection}
            setIgConnection={setIgConnection}
            igConnecting={igConnecting}
            setIgConnecting={setIgConnecting}
            igSyncing={igSyncing}
            syncInstagram={syncInstagram}
            igPosts={igPosts}
            tkConnection={tkConnection}
            setTkConnection={setTkConnection}
            tkConnecting={tkConnecting}
            setTkConnecting={setTkConnecting}
          />
        </TabsContent>
      </Tabs>

      {modalDelivery && (
        <DeliveryDetailModal
          delivery={modalDelivery}
          onClose={() => setModalDelivery(null)}
          onEdit={(d) => { setModalDelivery(null); openDeliveryDetail(d); }}
        />
      )}
    </div>
  );
}

// ─── MonthPill ────────────────────────────────────────────
function CountBadge({ count, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary text-primary-foreground',
    destructive: 'bg-destructive text-white',
  };
  return (
    <span className={`ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold inline-flex items-center justify-center leading-none ${colors[color]}`}>
      {count}
    </span>
  );
}

function MonthPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
        active
          ? 'bg-primary/15 text-primary'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Instagram Section ────────────────────────────────────
function InstagramSection({ clientId, canManage, igConnection, setIgConnection, igConnecting, setIgConnecting, igSyncing, syncInstagram, igPosts, tkConnection, setTkConnection, tkConnecting, setTkConnecting }) {
  return (
    <div className="space-y-5">
      {canManage && (
        <>
          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    igConnection?.connected ? 'bg-emerald-500/15' : 'bg-muted'
                  }`}>
                    <Instagram size={18} className={igConnection?.connected ? 'text-emerald-500' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    {igConnection?.connected ? (
                      <>
                        <p className="text-sm font-medium text-emerald-500">Conectado</p>
                        <p className="text-xs text-muted-foreground">@{igConnection.username}</p>
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
                    <>
                      <Button size="sm" variant="outline" onClick={syncInstagram} disabled={igSyncing}>
                        {igSyncing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
                        {igSyncing ? 'Sincronizando...' : 'Sincronizar'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={igConnecting}
                        onClick={async () => {
                          if (!confirm('Desconectar o Instagram deste cliente?')) return;
                          setIgConnecting(true);
                          try {
                            await disconnectInstagram(clientId);
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
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={igConnecting}
                      onClick={async () => {
                        setIgConnecting(true);
                        try {
                          const { url } = await getOAuthUrl(clientId);
                          window.location.href = url;
                        } catch {
                          toast.error('Erro ao iniciar conexão');
                          setIgConnecting(false);
                        }
                      }}
                    >
                      {igConnecting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Instagram size={14} className="mr-1.5" />}
                      Conectar Instagram
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    tkConnection?.connected ? 'bg-emerald-500/15' : 'bg-muted'
                  }`}>
                    <span className={`text-sm font-black ${tkConnection?.connected ? 'text-emerald-500' : 'text-muted-foreground'}`}>TK</span>
                  </div>
                  <div>
                    {tkConnection?.connected ? (
                      <>
                        <p className="text-sm font-medium text-emerald-500">Conectado</p>
                        <p className="text-xs text-muted-foreground">@{tkConnection.username}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium">TikTok</p>
                        <p className="text-xs text-muted-foreground">Conecte para publicar automaticamente</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {tkConnection?.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={tkConnecting}
                      onClick={async () => {
                        if (!confirm('Desconectar o TikTok deste cliente?')) return;
                        setTkConnecting(true);
                        try {
                          await disconnectTikTok(clientId);
                          setTkConnection({ connected: false });
                          toast.success('TikTok desconectado');
                        } catch {
                          toast.error('Erro ao desconectar');
                        } finally {
                          setTkConnecting(false);
                        }
                      }}
                    >
                      Desconectar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={tkConnecting}
                      onClick={async () => {
                        setTkConnecting(true);
                        try {
                          const { url } = await getTikTokOAuthUrl(clientId);
                          window.location.href = url;
                        } catch {
                          toast.error('Erro ao iniciar conexão');
                          setTkConnecting(false);
                        }
                      }}
                    >
                      {tkConnecting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <span className="mr-1.5 text-xs font-black">TK</span>}
                      Conectar TikTok
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {igPosts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Posts', value: igPosts.length },
              { label: 'Impressões', value: igPosts.reduce((s, p) => s + (p.metrics?.impressions || 0), 0) },
              { label: 'Alcance', value: igPosts.reduce((s, p) => s + (p.metrics?.reach || 0), 0) },
              { label: 'Engajamento', value: igPosts.reduce((s, p) => s + (p.metrics?.engagement || 0), 0) },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="px-3 pt-3 pb-2">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-base font-semibold tabular-nums">
                    {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {igPosts.map((p) => (
              <a
                key={p.id}
                href={p.post_url || p.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square rounded-lg overflow-hidden bg-card border border-border hover:border-primary/40 transition-colors cursor-pointer"
              >
                {p.media_url ? (
                  <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon size={24} />
                  </div>
                )}
                {p.media_type && p.media_type !== 'IMAGE' && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/60 text-white">
                    {p.media_type === 'VIDEO' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : p.media_type}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-xs">
                  {p.metrics?.impressions != null && (
                    <span className="flex items-center gap-1 tabular-nums"><Eye size={12} /> {p.metrics.impressions >= 1000 ? `${(p.metrics.impressions / 1000).toFixed(1)}k` : p.metrics.impressions}</span>
                  )}
                  {p.metrics?.reach != null && (
                    <span className="flex items-center gap-1 tabular-nums"><Users size={12} /> {p.metrics.reach >= 1000 ? `${(p.metrics.reach / 1000).toFixed(1)}k` : p.metrics.reach}</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-16 space-y-3">
          <Instagram size={40} className="mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum post sincronizado</p>
          {canManage && <p className="text-sm text-muted-foreground">Clique em &quot;Sincronizar&quot; para buscar dados do Instagram.</p>}
        </div>
      )}
    </div>
  );
}
