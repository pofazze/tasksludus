import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Bot, ExternalLink, Eye, Instagram, Pencil, Plus,
} from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  company: '',
  instagram_account: '',
  user_id: '',
  is_active: true,
  clickup_list_id: '',
  automations_enabled: false,
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});

  const fetchClients = async () => {
    try {
      const { data } = await api.get('/clients');
      setClients(data);
    } catch {
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      // silently fail — select will just be empty
    }
  };

  useEffect(() => { fetchClients(); }, []);

  const nameError = touched.name && form.name.length < 2 ? 'Nome deve ter pelo menos 2 caracteres' : '';

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTouched({});
    fetchUsers();
    setView('form');
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      company: c.company || '',
      instagram_account: c.instagram_account || '',
      user_id: c.user_id || '',
      is_active: c.is_active ?? true,
      clickup_list_id: c.clickup_list_id || '',
      automations_enabled: c.automations_enabled ?? false,
    });
    setTouched({});
    fetchUsers();
    setView('form');
  };

  const handleSave = async () => {
    if (form.name.length < 2) {
      setTouched({ ...touched, name: true });
      return;
    }
    const payload = {
      ...form,
      user_id: form.user_id || null,
      clickup_list_id: form.clickup_list_id || null,
    };
    try {
      if (editId) {
        await api.put(`/clients/${editId}`, payload);
        toast.success('Cliente atualizado');
      } else {
        await api.post('/clients', payload);
        toast.success('Cliente criado');
      }
      setView('list');
      fetchClients();
    } catch {
      toast.error('Erro ao salvar cliente');
    }
  };

  const toggleAutomation = async (client) => {
    const next = !client.automations_enabled;
    try {
      await api.put(`/clients/${client.id}`, { automations_enabled: next });
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, automations_enabled: next } : c));
      toast.success(`Automações ${next ? 'ativadas' : 'desativadas'} para ${client.name}`);
    } catch {
      toast.error('Erro ao alterar automações');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold font-display">Clientes</h1>
            {canManage && (
              <Button onClick={openNew}>
                <Plus size={16} className="mr-2" /> Novo Cliente
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Instagram</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Automações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <button
                          onClick={() => navigate(`/clients/${c.id}`)}
                          className="font-medium hover:text-purple-400 transition-colors cursor-pointer text-left"
                        >
                          {c.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.company || '—'}</TableCell>
                      <TableCell>
                        {c.instagram_account ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`https://instagram.com/${c.instagram_account.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-pink-400 hover:underline"
                            >
                              <Instagram size={14} />
                              {c.instagram_account.startsWith('@') ? c.instagram_account : `@${c.instagram_account}`}
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? 'default' : 'secondary'}>
                          {c.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <button
                            onClick={() => toggleAutomation(c)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                              c.automations_enabled
                                ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700/50'
                            }`}
                          >
                            <Bot size={12} />
                            {c.automations_enabled ? 'Ligado' : 'Desligado'}
                          </button>
                        ) : (
                          <Badge variant={c.automations_enabled ? 'default' : 'secondary'}>
                            <Bot size={12} className="mr-1" />
                            {c.automations_enabled ? 'Ligado' : 'Desligado'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${c.id}`)} title="Ver perfil">
                            <Eye size={16} />
                          </Button>
                          {canManage && (
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil size={16} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum cliente cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {view === 'form' && (
        <>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setView('list')}>
                <ArrowLeft size={18} />
              </Button>
              <h1 className="text-2xl font-bold font-display">
                {editId ? 'Editar Cliente' : 'Novo Cliente'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Coluna principal */}
            <div className="col-span-2 space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        onBlur={() => setTouched({ ...touched, name: true })}
                        placeholder="Nome do cliente"
                        className={nameError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                      {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Empresa</Label>
                      <Input
                        id="company"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Nome da empresa"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user_id">Responsável</Label>
                    <Select
                      value={form.user_id}
                      onValueChange={(val) => setForm({ ...form, user_id: val === '_none' ? '' : val })}
                    >
                      <SelectTrigger id="user_id">
                        <SelectValue placeholder="Selecione um responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Integrações</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="instagram" className="flex items-center gap-1.5">
                        <Instagram size={14} className="text-pink-400" />
                        Instagram
                      </Label>
                      <Input
                        id="instagram"
                        value={form.instagram_account}
                        onChange={(e) => setForm({ ...form, instagram_account: e.target.value })}
                        placeholder="@conta_do_cliente"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clickup">ClickUp List ID</Label>
                      <Input
                        id="clickup"
                        value={form.clickup_list_id}
                        onChange={(e) => setForm({ ...form, clickup_list_id: e.target.value })}
                        placeholder="Ex: 901100123456"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Status</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.is_active ? 'Visível nos relatórios' : 'Oculto dos relatórios'}
                      </p>
                    </div>
                    <Switch
                      id="is_active"
                      checked={form.is_active}
                      onCheckedChange={(val) => setForm({ ...form, is_active: val })}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Automações</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Sync com ClickUp</p>
                    </div>
                    <Switch
                      id="automations"
                      checked={form.automations_enabled}
                      onCheckedChange={(val) => setForm({ ...form, automations_enabled: val })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
