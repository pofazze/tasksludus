import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import {
  CONTENT_TYPE_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
} from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink, Pencil, Plus } from 'lucide-react';

const EMPTY_FORM = {
  title: '', user_id: '', client_id: '', content_type: '',
  difficulty: 'medium', urgency: 'normal', status: 'planejamento', month: '',
  clickup_task_id: '',
};

export default function DeliveriesPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role);
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const fetchDeliveries = async () => {
    try {
      const params = {};
      if (filterMonth) params.month = filterMonth + '-01';
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.content_type = filterType;
      const { data } = await api.get('/deliveries', { params });
      setDeliveries(data);
    } catch {
      toast.error('Erro ao carregar entregas');
    } finally {
      setLoading(false);
    }
  };

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
  useEffect(() => { fetchDeliveries(); }, [filterMonth, filterStatus, filterType]);

  const getUserName = (id) => users.find((u) => u.id === id)?.name || '—';
  const getClientName = (id) => clients.find((c) => c.id === id)?.name || '—';

  const getStatusLabel = (status) =>
    PIPELINE_STATUSES[status] || (status === 'in_progress' ? 'Em progresso' : status === 'completed' ? 'Publicação' : status);
  const getStatusColor = (status) =>
    PIPELINE_STATUS_COLORS[status] || (status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800');

  const openNew = () => {
    setEditId(null);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setForm({ ...EMPTY_FORM, month: currentMonth });
    setDialogOpen(true);
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
    setDialogOpen(true);
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
      setDialogOpen(false);
      fetchDeliveries();
    } catch {
      toast.error('Erro ao salvar entrega');
    }
  };

  if (loading) return <PageLoading />;

  // Pipeline summary counts
  const pipelineCounts = {};
  PIPELINE_ORDER.forEach((s) => { pipelineCounts[s] = 0; });
  deliveries.forEach((d) => {
    if (pipelineCounts[d.status] !== undefined) pipelineCounts[d.status]++;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Entregas</h1>
        {canManage && (
          <Button onClick={openNew}>
            <Plus size={16} className="mr-2" /> Nova Entrega
          </Button>
        )}
      </div>

      {/* Pipeline Overview */}
      {deliveries.length > 0 && (
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {PIPELINE_ORDER.map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
              className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-all ${
                filterStatus === status
                  ? 'ring-2 ring-purple-500 ' + PIPELINE_STATUS_COLORS[status]
                  : pipelineCounts[status] > 0
                    ? PIPELINE_STATUS_COLORS[status]
                    : 'bg-gray-50 text-gray-400'
              }`}
            >
              <span className="font-bold text-lg">{pipelineCounts[status]}</span>
              <span>{PIPELINE_STATUSES[status]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          {PIPELINE_ORDER.map((s) => (
            <option key={s} value={s}>{PIPELINE_STATUSES[s]}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todos os formatos</option>
          {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ClickUp</TableHead>
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell>{getUserName(d.user_id)}</TableCell>
                  <TableCell>{getClientName(d.client_id)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getStatusColor(d.status)}>
                      {getStatusLabel(d.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {d.clickup_task_id ? (
                      <a
                        href={`https://app.clickup.com/t/${d.clickup_task_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-purple-600 hover:underline"
                      >
                        {d.clickup_task_id}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                        <Pencil size={16} />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">
                    Nenhuma entrega encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Entrega' : 'Nova Entrega'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
            {!editId && (
              <>
                <div>
                  <Label>Responsável</Label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
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
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Formato</Label>
                <select
                  value={form.content_type}
                  onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
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
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="easy">Fácil</option>
                  <option value="medium">Média</option>
                  <option value="hard">Difícil</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {PIPELINE_ORDER.map((s) => (
                    <option key={s} value={s}>{PIPELINE_STATUSES[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Mês</Label>
                <input
                  type="month"
                  value={form.month}
                  onChange={(e) => setForm({ ...form, month: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  disabled={!!editId}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
