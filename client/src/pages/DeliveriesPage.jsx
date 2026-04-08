import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import {
  CONTENT_TYPE_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_ORDER,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import PageLoading from '@/components/common/PageLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import KanbanBoard from '@/components/deliveries/KanbanBoard';
import DeliveryListTable from '@/components/deliveries/DeliveryListTable';
import DeliveryDetailModal from '@/components/deliveries/DeliveryDetailModal';
import DeliveryCard from '@/components/deliveries/DeliveryCard';
import ApprovalTab from '@/components/approvals/ApprovalTab';
import CorrectionTab from '@/components/approvals/CorrectionTab';
import AgendamentoTab from '@/components/instagram/AgendamentoTab';
import {
  ArrowLeft, LayoutGrid, List, Plus,
  Calendar, CheckCircle, AlertTriangle, Instagram,
} from 'lucide-react';

const SSE_EVENTS = ['delivery:updated', 'delivery:created', 'delivery:deleted'];

const EMPTY_FORM = {
  title: '', user_id: '', client_id: '', content_type: '',
  difficulty: 'medium', urgency: 'normal', status: 'planejamento', month: '',
  clickup_task_id: '',
};

export default function DeliveriesPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role);

  // Data
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Views
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [pipelineView, setPipelineView] = useState('kanban'); // 'kanban' | 'list'
  const [activeTab, setActiveTab] = useState('pipeline');

  // Form
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Detail modal
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');

  // Agendamento tab filter
  const [agendamentoFilter, setAgendamentoFilter] = useState('todos');

  // Client selector for tabs that need clientId
  const [selectedClientId, setSelectedClientId] = useState('');

  // ─── Data fetching ────────────────────────────────────────

  const fetchDeliveries = useCallback(async () => {
    try {
      const params = {};
      if (filterMonth) params.month = filterMonth + '-01';
      if (filterType) params.content_type = filterType;
      const { data } = await api.get('/deliveries', { params });
      setDeliveries(data);
    } catch {
      toast.error('Erro ao carregar entregas');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterType]);

  const fetchRelated = async () => {
    try {
      const [usersRes, clientsRes] = await Promise.all([
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/clients'),
      ]);
      setUsers(usersRes.data);
      setClients(clientsRes.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchRelated(); }, []);
  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  // SSE: re-fetch on delivery changes
  useServerEvent(SSE_EVENTS, () => { fetchDeliveries(); });

  // ─── Handlers ─────────────────────────────────────────────

  const handleStatusChange = async (deliveryId, newStatus) => {
    try {
      await api.put(`/deliveries/${deliveryId}`, { status: newStatus });
      toast.success('Status atualizado');
      fetchDeliveries();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleCardClick = (delivery) => {
    setSelectedDelivery(delivery);
  };

  const openNew = () => {
    setEditId(null);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setForm({ ...EMPTY_FORM, month: currentMonth });
    setView('form');
  };

  const openEdit = (d) => {
    setEditId(d.id);
    const month = d.month ? d.month.slice(0, 7) : '';
    setForm({
      title: d.title, user_id: d.user_id, client_id: d.client_id,
      content_type: d.content_type, difficulty: d.difficulty || 'medium',
      urgency: d.urgency || 'normal', status: d.status, month,
      clickup_task_id: d.clickup_task_id || '',
    });
    setView('form');
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, month: form.month + '-01' };
      if (payload.clickup_task_id === '') delete payload.clickup_task_id;
      if (editId) {
        const { user_id, client_id, month, clickup_task_id, ...updatePayload } = payload;
        await api.put(`/deliveries/${editId}`, updatePayload);
        toast.success('Entrega atualizada');
      } else {
        await api.post('/deliveries', payload);
        toast.success('Entrega criada');
      }
      setView('list');
      fetchDeliveries();
    } catch {
      toast.error('Erro ao salvar entrega');
    }
  };

  // ─── Derived data ─────────────────────────────────────────

  const agendamentoDeliveries = useMemo(() => {
    const base = deliveries.filter(
      (d) => d.status === 'agendamento' || d.status === 'agendado'
    );
    if (agendamentoFilter === 'agendados') return base.filter((d) => d.status === 'agendado');
    if (agendamentoFilter === 'aprovados') return base.filter((d) => d.approval_status === 'client_approved');
    return base;
  }, [deliveries, agendamentoFilter]);

  // ─── Client selector helper ───────────────────────────────

  const ClientSelector = ({ value, onChange }) => (
    <div className="mb-5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full max-w-xs rounded-xl border border-border dark:border-border bg-white dark:bg-muted px-3 text-sm text-muted-foreground dark:text-foreground focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none transition-all cursor-pointer"
      >
        <option value="">Selecione um cliente...</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );

  const NoClientMessage = () => (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <div className="w-16 h-16 rounded-2xl bg-secondary dark:bg-muted flex items-center justify-center">
        <Calendar size={28} className="text-muted-foreground dark:text-muted-foreground" />
      </div>
      <span className="text-sm font-medium">Selecione um cliente para continuar</span>
    </div>
  );

  // ─── Loading ──────────────────────────────────────────────

  if (loading) return <PageLoading />;

  // ─── Form view ────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setView('list')}>
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-2xl font-bold font-display">
            {editId ? 'Editar Entrega' : 'Nova Entrega'}
          </h1>
        </div>
        <Card className="max-w-2xl">
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Titulo</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            {!editId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Responsavel</Label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="native-select"
                  >
                    <option value="">Selecione...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Cliente</Label>
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="native-select"
                  >
                    <option value="">Selecione...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Formato</Label>
                <select
                  value={form.content_type}
                  onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                  className="native-select"
                >
                  <option value="">Selecione...</option>
                  {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Dificuldade</Label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  className="native-select"
                >
                  <option value="easy">Facil</option>
                  <option value="medium">Media</option>
                  <option value="hard">Dificil</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="native-select"
                >
                  {PIPELINE_ORDER.map((s) => (
                    <option key={s} value={s}>{PIPELINE_STATUSES[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Mes</Label>
                <input
                  type="month"
                  value={form.month}
                  onChange={(e) => setForm({ ...form, month: e.target.value })}
                  className="native-select"
                  disabled={!!editId}
                />
              </div>
            </div>
            {!editId && (
              <div>
                <Label>ClickUp Task ID <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input
                  value={form.clickup_task_id}
                  onChange={(e) => setForm({ ...form, clickup_task_id: e.target.value })}
                  placeholder="Ex: 86abc123"
                />
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex gap-2 mt-4 max-w-2xl">
          <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </div>
    );
  }

  // ─── Main tabbed view ─────────────────────────────────────

  return (
    <div className="-m-4 md:-m-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground dark:text-white tracking-tight">
              Entregas
            </h1>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
              {deliveries.length} {deliveries.length === 1 ? 'entrega' : 'entregas'} este mês
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="h-9 rounded-xl border border-border dark:border-border bg-white dark:bg-muted px-3 text-sm text-muted-foreground dark:text-foreground focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none transition-all"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-9 rounded-xl border border-border dark:border-border bg-white dark:bg-muted px-3 text-sm text-muted-foreground dark:text-foreground focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none transition-all cursor-pointer"
            >
              <option value="">Todos os formatos</option>
              {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {canManage && (
              <button
                onClick={openNew}
                className="h-9 px-4 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition-all shadow-sm shadow-purple-600/20 flex items-center gap-2 cursor-pointer"
              >
                <Plus size={15} /> Nova
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs Navigation ───────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border dark:border-border -mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto">
          {[
            { key: 'pipeline', icon: LayoutGrid, label: 'Pipeline' },
            { key: 'agendamento', icon: Calendar, label: 'Agendamento' },
            { key: 'instagram', icon: Instagram, label: 'Instagram' },
            { key: 'aprovacao', icon: CheckCircle, label: 'Aprovação' },
            { key: 'correcao', icon: AlertTriangle, label: 'Correção' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer
                ${activeTab === key
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                }
              `}
            >
              <Icon size={15} />
              {label}
              {activeTab === key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
              )}
            </button>
          ))}

          {/* View toggle (only on pipeline tab) */}
          {activeTab === 'pipeline' && (
            <div className="ml-auto flex items-center gap-0.5 bg-secondary dark:bg-muted rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setPipelineView('kanban')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  pipelineView === 'kanban'
                    ? 'bg-white dark:bg-surface-3 shadow-sm text-foreground dark:text-foreground'
                    : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setPipelineView('list')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  pipelineView === 'list'
                    ? 'bg-white dark:bg-surface-3 shadow-sm text-foreground dark:text-foreground'
                    : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                }`}
              >
                <List size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-5 pb-4">

        {/* Tab 1: Pipeline */}
        {activeTab === 'pipeline' && (
          pipelineView === 'kanban' ? (
            <KanbanBoard
              deliveries={deliveries}
              onStatusChange={handleStatusChange}
              onCardClick={handleCardClick}
            />
          ) : (
            <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-border overflow-hidden">
              <DeliveryListTable
                deliveries={deliveries}
                onRowClick={handleCardClick}
                onEdit={openEdit}
                canManage={canManage}
              />
            </div>
          )
        )}

        {/* Tab 2: Agendamento */}
        {activeTab === 'agendamento' && (
          <>
            <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-secondary dark:bg-muted w-fit">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'agendados', label: 'Agendados' },
                { key: 'aprovados', label: 'Aprovados' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setAgendamentoFilter(opt.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    agendamentoFilter === opt.key
                      ? 'bg-white dark:bg-surface-3 text-foreground dark:text-foreground shadow-sm'
                      : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {agendamentoDeliveries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="w-16 h-16 rounded-2xl bg-secondary dark:bg-muted flex items-center justify-center">
                  <Calendar size={28} className="text-muted-foreground dark:text-muted-foreground" />
                </div>
                <span className="text-sm font-medium">Nenhuma entrega para agendamento</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {agendamentoDeliveries.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} showClient onClick={handleCardClick} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 3: Instagram */}
        {activeTab === 'instagram' && (
          <>
            <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
            {selectedClientId ? (
              <AgendamentoTab clientId={selectedClientId} />
            ) : (
              <NoClientMessage />
            )}
          </>
        )}

        {/* Tab 4: Aprovação */}
        {activeTab === 'aprovacao' && (
          <>
            <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
            {selectedClientId ? (
              <ApprovalTab clientId={selectedClientId} />
            ) : (
              <NoClientMessage />
            )}
          </>
        )}

        {/* Tab 5: Correção */}
        {activeTab === 'correcao' && (
          <>
            <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
            {selectedClientId ? (
              <CorrectionTab clientId={selectedClientId} />
            ) : (
              <NoClientMessage />
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onEdit={(d) => {
            setSelectedDelivery(null);
            openEdit(d);
          }}
        />
      )}
    </div>
  );
}
