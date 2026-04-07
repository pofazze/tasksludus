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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
    <div className="mb-4">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="native-select"
      >
        <option value="">Selecione um cliente...</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );

  const NoClientMessage = () => (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <Calendar size={32} />
      <span className="text-sm">Selecione um cliente</span>
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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Entregas</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="native-select"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="native-select"
          >
            <option value="">Todos os formatos</option>
            {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {canManage && (
            <Button onClick={openNew}>
              <Plus size={16} className="mr-2" /> Nova Entrega
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">
            <LayoutGrid size={14} />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="agendamento">
            <Calendar size={14} />
            Agendamento
          </TabsTrigger>
          <TabsTrigger value="instagram">
            <Instagram size={14} />
            Instagram
          </TabsTrigger>
          <TabsTrigger value="aprovacao">
            <CheckCircle size={14} />
            Aprovacao
          </TabsTrigger>
          <TabsTrigger value="correcao">
            <AlertTriangle size={14} />
            Correcao
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Pipeline ──────────────────────────────── */}
        <TabsContent value="pipeline">
          {/* View toggle */}
          <div className="flex items-center gap-1 mb-4">
            <Button
              variant={pipelineView === 'kanban' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setPipelineView('kanban')}
              className="h-8 w-8"
            >
              <LayoutGrid size={16} />
            </Button>
            <Button
              variant={pipelineView === 'list' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setPipelineView('list')}
              className="h-8 w-8"
            >
              <List size={16} />
            </Button>
          </div>

          {pipelineView === 'kanban' ? (
            <KanbanBoard
              deliveries={deliveries}
              onStatusChange={handleStatusChange}
              onCardClick={handleCardClick}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <DeliveryListTable
                  deliveries={deliveries}
                  onRowClick={handleCardClick}
                  onEdit={openEdit}
                  canManage={canManage}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 2: Agendamento ───────────────────────────── */}
        <TabsContent value="agendamento">
          {/* Filter toggle */}
          <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-muted w-fit">
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'agendados', label: 'Agendados' },
              { key: 'aprovados', label: 'Aprovados' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAgendamentoFilter(opt.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  agendamentoFilter === opt.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {agendamentoDeliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Calendar size={32} />
              <span className="text-sm">Nenhuma entrega para agendamento</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {agendamentoDeliveries.map((d) => (
                <DeliveryCard
                  key={d.id}
                  delivery={d}
                  showClient
                  onClick={handleCardClick}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Instagram ─────────────────────────────── */}
        <TabsContent value="instagram">
          <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
          {selectedClientId ? (
            <AgendamentoTab clientId={selectedClientId} />
          ) : (
            <NoClientMessage />
          )}
        </TabsContent>

        {/* ── Tab 4: Aprovacao ─────────────────────────────── */}
        <TabsContent value="aprovacao">
          <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
          {selectedClientId ? (
            <ApprovalTab clientId={selectedClientId} />
          ) : (
            <NoClientMessage />
          )}
        </TabsContent>

        {/* ── Tab 5: Correcao ──────────────────────────────── */}
        <TabsContent value="correcao">
          <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
          {selectedClientId ? (
            <CorrectionTab clientId={selectedClientId} />
          ) : (
            <NoClientMessage />
          )}
        </TabsContent>
      </Tabs>

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
