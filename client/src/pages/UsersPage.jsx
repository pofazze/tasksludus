import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isCeo, isManagement } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import { ROLE_LABELS, PRODUCER_TYPE_LABELS, PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, PIPELINE_ORDER } from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Pencil, UserX, UserPlus, Phone, Eye, Package, Target, DollarSign } from 'lucide-react';

const ROLE_COLORS = {
  ceo: 'bg-purple-500/15 text-purple-400',
  director: 'bg-blue-500/15 text-blue-400',
  manager: 'bg-emerald-500/15 text-emerald-400',
  account_manager: 'bg-yellow-500/15 text-yellow-400',
  producer: 'bg-orange-500/15 text-orange-400',
  client: 'bg-zinc-800/50 text-zinc-300',
};

const EMPTY_INVITE = {
  name: '', email: '', password: '', whatsapp: '',
  role: 'producer', producer_type: 'video_editor',
};

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ name: '', base_salary: '', whatsapp: '', base_deliveries: '' });
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviteSending, setInviteSending] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openEdit = (u) => {
    setSelectedUser(u);
    setForm({ name: u.name, base_salary: u.base_salary ?? '', whatsapp: u.whatsapp || '', base_deliveries: u.base_deliveries ?? '' });
    setView('edit');
  };

  const handleSave = async () => {
    try {
      const updateData = { name: form.name };
      if (form.whatsapp !== (selectedUser.whatsapp || '')) {
        updateData.whatsapp = form.whatsapp || null;
      }
      if (form.base_deliveries !== (selectedUser.base_deliveries ?? '')) {
        updateData.base_deliveries = form.base_deliveries !== '' ? Number(form.base_deliveries) : null;
      }
      await api.put(`/users/${selectedUser.id}`, updateData);
      if (isCeo(user?.role) && form.base_salary !== selectedUser.base_salary) {
        await api.patch(`/users/${selectedUser.id}/salary`, {
          base_salary: Number(form.base_salary),
        });
      }
      toast.success('Usuário atualizado');
      setView('list');
      fetchUsers();
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  const toggleAutoCalc = async (u) => {
    try {
      await api.patch(`/users/${u.id}/auto-calc`);
      toast.success('Auto-calc atualizado');
      fetchUsers();
    } catch {
      toast.error('Erro ao atualizar auto-calc');
    }
  };

  const setInvField = (key, value) => setInviteForm((f) => ({ ...f, [key]: value }));

  const handleInvite = async () => {
    setInviteSending(true);
    try {
      const payload = { email: inviteForm.email, role: inviteForm.role };
      if (inviteForm.role === 'producer') payload.producer_type = inviteForm.producer_type;
      if (inviteForm.name) payload.name = inviteForm.name;
      if (inviteForm.password) payload.password = inviteForm.password;
      if (inviteForm.whatsapp) payload.whatsapp = inviteForm.whatsapp;

      const { data } = await api.post('/auth/invites', payload);
      if (data.directCreation) {
        toast.success(`Usuário ${inviteForm.name} criado`);
      } else {
        toast.success('Convite enviado para ' + inviteForm.email);
      }
      setView('list');
      setInviteForm(EMPTY_INVITE);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar convite');
    } finally {
      setInviteSending(false);
    }
  };

  const deactivate = async (u) => {
    if (!confirm(`Desativar ${u.name}?`)) return;
    try {
      await api.patch(`/users/${u.id}/deactivate`);
      toast.success('Usuário desativado');
      fetchUsers();
    } catch {
      toast.error('Erro ao desativar');
    }
  };

  const openDetail = async (u) => {
    setSelectedUser(u);
    setView('detail');
    setDetailLoading(true);
    setDetailData(null);
    try {
      const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const [deliveriesRes, calcsRes, goalsRes] = await Promise.all([
        api.get('/deliveries', { params: { month, user_id: u.id } }).catch(() => ({ data: [] })),
        api.get('/calculations', { params: { month, user_id: u.id } }).catch(() => ({ data: [] })),
        api.get('/goals', { params: { month, user_id: u.id } }).catch(() => ({ data: [] })),
      ]);
      setDetailData({
        deliveries: deliveriesRes.data,
        calculation: calcsRes.data?.[0] || null,
        goal: goalsRes.data?.[0] || null,
      });
    } catch {
      toast.error('Erro ao carregar detalhes');
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return <PageLoading />;

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  return (
    <div>
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold font-display">Equipe</h1>
            {isManagement(user?.role) && (
              <Button onClick={() => { setInviteForm(EMPTY_INVITE); setView('invite'); }}>
                <UserPlus size={16} className="mr-2" /> Adicionar Membro
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membro</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Cargo</TableHead>
                    {isCeo(user?.role) && <TableHead>Salário</TableHead>}
                    <TableHead>Auto-calc</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={!u.is_active ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.avatar_url} />
                            <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium">{u.name}</span>
                            {u.producer_type && (
                              <p className="text-xs text-muted-foreground">
                                {PRODUCER_TYPE_LABELS[u.producer_type] || u.producer_type}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                      <TableCell>
                        {u.whatsapp ? (
                          <a
                            href={`https://wa.me/${u.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"
                          >
                            <Phone size={12} />
                            {u.whatsapp}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={ROLE_COLORS[u.role]}>
                          {u.role === 'producer' && u.producer_type && PRODUCER_TYPE_LABELS[u.producer_type]
                            ? PRODUCER_TYPE_LABELS[u.producer_type]
                            : ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      {isCeo(user?.role) && (
                        <TableCell>{formatCurrency(u.base_salary)}</TableCell>
                      )}
                      <TableCell>
                        <Switch
                          checked={u.auto_calc_enabled}
                          onCheckedChange={() => toggleAutoCalc(u)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openDetail(u)} title="Ver detalhes">
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                            <Pencil size={16} />
                          </Button>
                          {isManagement(user?.role) && u.is_active && u.id !== user?.id && (
                            <Button variant="ghost" size="icon" onClick={() => deactivate(u)}>
                              <UserX size={16} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {view === 'edit' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold font-display">Editar — {selectedUser?.name}</h1>
          </div>
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="(99) 99999-9999"
                />
              </div>
              {isCeo(user?.role) && (
                <>
                  <div>
                    <Label>Salário Base</Label>
                    <Input
                      type="number"
                      value={form.base_salary}
                      onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Entrega Base (mínima p/ ativar boost)</Label>
                    <Input
                      type="number"
                      value={form.base_deliveries}
                      onChange={(e) => setForm({ ...form, base_deliveries: e.target.value })}
                      placeholder="Padrão do cargo"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Deixe vazio para usar o padrão do cargo
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2 mt-4 max-w-2xl">
            <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </>
      )}

      {view === 'detail' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft size={18} />
            </Button>
            <Avatar className="h-10 w-10">
              <AvatarImage src={selectedUser?.avatar_url} />
              <AvatarFallback>{initials(selectedUser?.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold font-display">{selectedUser?.name}</h1>
              <p className="text-sm text-muted-foreground">
                {selectedUser?.role === 'producer' && selectedUser?.producer_type && PRODUCER_TYPE_LABELS[selectedUser.producer_type]
                  ? PRODUCER_TYPE_LABELS[selectedUser.producer_type]
                  : ROLE_LABELS[selectedUser?.role] || selectedUser?.role}
              </p>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
            </div>
          ) : detailData ? (
            <div className="space-y-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package size={14} className="text-purple-400" />
                    <span className="text-xs text-muted-foreground">Entregas</span>
                  </div>
                  <p className="text-xl font-bold">{detailData.deliveries.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {detailData.deliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length} publicadas
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Target size={14} className="text-blue-400" />
                    <span className="text-xs text-muted-foreground">Meta</span>
                  </div>
                  <p className="text-xl font-bold">
                    {detailData.goal?.monthly_target ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    entregas/mês
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={14} className="text-emerald-400" />
                    <span className="text-xs text-muted-foreground">Boost</span>
                  </div>
                  <p className="text-xl font-bold">
                    {detailData.calculation
                      ? formatCurrency(detailData.calculation.final_bonus ?? detailData.calculation.suggested_bonus)
                      : '—'}
                  </p>
                  {detailData.calculation && (
                    <p className="text-xs text-muted-foreground">
                      {detailData.calculation.multiplier_applied}x multiplicador
                    </p>
                  )}
                </div>
              </div>

              {/* Calculation Details */}
              {detailData.calculation && isCeo(user?.role) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <h3 className="text-sm font-semibold">Detalhes do Cálculo</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Salário Base</span>
                      <span>{formatCurrency(detailData.calculation.base_salary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Multiplicador</span>
                      <span>{detailData.calculation.multiplier_applied}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bônus Sugerido</span>
                      <span>{formatCurrency(detailData.calculation.suggested_bonus)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bônus Final</span>
                      <span className="font-semibold">
                        {detailData.calculation.final_bonus != null
                          ? formatCurrency(detailData.calculation.final_bonus)
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Workload: deliveries by pipeline status */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Carga de Trabalho</h3>
                <div className="flex gap-1 flex-wrap">
                  {PIPELINE_ORDER.map((status) => {
                    const count = detailData.deliveries.filter((d) => d.status === status).length;
                    if (count === 0) return null;
                    return (
                      <div
                        key={status}
                        className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg text-xs ${PIPELINE_STATUS_COLORS[status]}`}
                      >
                        <span className="font-bold text-base">{count}</span>
                        <span>{PIPELINE_STATUSES[status]}</span>
                      </div>
                    );
                  })}
                  {detailData.deliveries.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma entrega este mês</p>
                  )}
                </div>
              </div>

              {/* Recent deliveries list */}
              {detailData.deliveries.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Entregas do Mês ({detailData.deliveries.length})</h3>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {detailData.deliveries.map((d) => (
                      <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm truncate flex-1 mr-2">{d.title}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs shrink-0 ${PIPELINE_STATUS_COLORS[d.status] || 'bg-zinc-800/50 text-zinc-300'}`}
                        >
                          {PIPELINE_STATUSES[d.status] || d.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {view === 'invite' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold font-display">Adicionar Membro</h1>
          </div>
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={inviteForm.name}
                    onChange={(e) => setInvField('name', e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInvField('email', e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={inviteForm.password}
                    onChange={(e) => setInvField('password', e.target.value)}
                    placeholder="Min. 6 caracteres"
                  />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input
                    value={inviteForm.whatsapp}
                    onChange={(e) => setInvField('whatsapp', e.target.value)}
                    placeholder="(99) 99999-9999"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cargo</Label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInvField('role', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="director">Diretor</option>
                    <option value="manager">Gerente</option>
                    <option value="account_manager">Atendimento</option>
                    <option value="producer">Produtor</option>
                    <option value="client">Cliente</option>
                  </select>
                </div>
                {inviteForm.role === 'producer' && (
                  <div>
                    <Label>Tipo de Produtor</Label>
                    <select
                      value={inviteForm.producer_type}
                      onChange={(e) => setInvField('producer_type', e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="video_editor">Editor de Vídeo</option>
                      <option value="designer">Designer</option>
                      <option value="captation">Captação</option>
                      <option value="social_media">Social Media</option>
                    </select>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Preencha nome e senha para criar diretamente. Só email = envia convite por link.
              </p>
            </CardContent>
          </Card>
          <div className="flex gap-2 mt-4 max-w-2xl">
            <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviteSending}>
              {inviteSending ? 'Criando...' : inviteForm.name && inviteForm.password ? 'Criar Usuário' : 'Enviar Convite'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
