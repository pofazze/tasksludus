import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isCeo, isManagement } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import { ROLE_LABELS, PRODUCER_TYPE_LABELS } from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, UserX, UserPlus, Phone } from 'lucide-react';

const ROLE_COLORS = {
  ceo: 'bg-purple-100 text-purple-800',
  director: 'bg-blue-100 text-blue-800',
  manager: 'bg-green-100 text-green-800',
  account_manager: 'bg-yellow-100 text-yellow-800',
  producer: 'bg-orange-100 text-orange-800',
  client: 'bg-gray-100 text-gray-800',
};

const EMPTY_INVITE = {
  name: '', email: '', password: '', whatsapp: '',
  role: 'producer', producer_type: 'video_editor',
};

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', base_salary: '', whatsapp: '' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [inviteSending, setInviteSending] = useState(false);

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
    setEditUser(u);
    setForm({ name: u.name, base_salary: u.base_salary ?? '', whatsapp: u.whatsapp || '' });
  };

  const handleSave = async () => {
    try {
      const updateData = { name: form.name };
      if (form.whatsapp !== (editUser.whatsapp || '')) {
        updateData.whatsapp = form.whatsapp || null;
      }
      await api.put(`/users/${editUser.id}`, updateData);
      if (isCeo(user?.role) && form.base_salary !== editUser.base_salary) {
        await api.patch(`/users/${editUser.id}/salary`, {
          base_salary: Number(form.base_salary),
        });
      }
      toast.success('Usuário atualizado');
      setEditUser(null);
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
      setInviteOpen(false);
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

  if (loading) return <PageLoading />;

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {isManagement(user?.role) && (
          <Button onClick={() => setInviteOpen(true)}>
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
                        className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline"
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
                      {ROLE_LABELS[u.role] || u.role}
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

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <div>
                <Label>Salário Base</Label>
                <Input
                  type="number"
                  value={form.base_salary}
                  onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite / Create User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviteSending}>
              {inviteSending ? 'Criando...' : inviteForm.name && inviteForm.password ? 'Criar Usuário' : 'Enviar Convite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
