import { useState, useEffect, useMemo } from 'react';
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
import {
  ArrowLeft, ArrowRight, Bot, Building2, ExternalLink, Instagram, Loader2, Pencil, Plus, Search, Users,
} from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  company: '',
  instagram_account: '',
  user_id: '',
  is_active: true,
  clickup_list_id: '',
  automations_enabled: false,
  category: '',
  whatsapp: '',
  whatsapp_group: '',
  social_media_id: '',
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [whatsappGroups, setWhatsappGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

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

  const fetchWhatsAppGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data } = await api.get('/approvals/whatsapp-groups');
      setWhatsappGroups(data);
    } catch {
      toast.error('Erro ao carregar grupos do WhatsApp');
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  const filteredClients = useMemo(() => {
    let list = clients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.instagram_account?.toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'active') list = list.filter((c) => c.is_active);
    if (statusFilter === 'inactive') list = list.filter((c) => !c.is_active);
    return list;
  }, [clients, search, statusFilter]);

  const groupedClients = useMemo(() => {
    const health = filteredClients.filter((c) => c.category === 'health');
    const experts = filteredClients.filter((c) => c.category === 'experts');
    const other = filteredClients.filter((c) => !c.category || (c.category !== 'health' && c.category !== 'experts'));
    const groups = [];
    if (health.length > 0) groups.push({ label: 'Ludus Health', clients: health });
    if (experts.length > 0) groups.push({ label: 'Ludus Experts', clients: experts });
    if (other.length > 0) groups.push({ label: 'Outros', clients: other });
    return groups;
  }, [filteredClients]);

  const activeCount = clients.filter((c) => c.is_active).length;
  const inactiveCount = clients.filter((c) => !c.is_active).length;

  const nameError = touched.name && form.name.length < 2 ? 'Nome deve ter pelo menos 2 caracteres' : '';

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTouched({});
    fetchUsers();
    setView('form');
  };

  const openEdit = (e, c) => {
    e.stopPropagation();
    setEditId(c.id);
    setForm({
      name: c.name,
      company: c.company || '',
      instagram_account: c.instagram_account || '',
      user_id: c.user_id || '',
      is_active: c.is_active ?? true,
      clickup_list_id: c.clickup_list_id || '',
      automations_enabled: c.automations_enabled ?? false,
      category: c.category || '',
      whatsapp: c.whatsapp || '',
      whatsapp_group: c.whatsapp_group || '',
      social_media_id: c.social_media_id || '',
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
      category: form.category || null,
      whatsapp: form.whatsapp || null,
      whatsapp_group: form.whatsapp_group || null,
      social_media_id: form.social_media_id || null,
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

  const toggleAutomation = async (e, client) => {
    e.stopPropagation();
    const next = !client.automations_enabled;
    try {
      await api.put(`/clients/${client.id}`, { automations_enabled: next });
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, automations_enabled: next } : c));
      toast.success(`Automações ${next ? 'ativadas' : 'desativadas'} para ${client.name}`);
    } catch {
      toast.error('Erro ao alterar automações');
    }
  };

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  if (loading) return <PageLoading />;

  return (
    <div>
      {view === 'list' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold font-display">Clientes</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {activeCount} ativos · {inactiveCount} inativos
              </p>
            </div>
            {canManage && (
              <Button onClick={openNew}>
                <Plus size={16} className="mr-2" /> Novo Cliente
              </Button>
            )}
          </div>

          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
            <div className="relative flex-1 sm:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, empresa ou Instagram..."
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5 overflow-x-auto shrink-0">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'active', label: 'Ativos' },
                { key: 'inactive', label: 'Inativos' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === key
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Client card grid */}
          {groupedClients.length > 0 ? (
            <div className="space-y-8">
              {groupedClients.map(({ label: groupLabel, clients: groupClients }) => (
              <div key={groupLabel}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{groupLabel}</h2>
                  <span className="text-xs text-zinc-600">({groupClients.length})</span>
                </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupClients.map((c) => (
                <Card
                  key={c.id}
                  className="group cursor-pointer transition-all duration-150 hover:ring-zinc-700 hover:shadow-md"
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#9A48EA]/15 text-[#9A48EA] text-sm font-bold shrink-0">
                        {initials(c.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold truncate group-hover:text-[#9A48EA] transition-colors">
                            {c.name}
                          </h3>
                          {!c.is_active && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-500/15 text-zinc-400 shrink-0">
                              Inativo
                            </span>
                          )}
                        </div>
                        {c.company && (
                          <p className="text-xs text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                            <Building2 size={10} />
                            {c.company}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {canManage && (
                          <button
                            onClick={(e) => openEdit(e, c)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <ArrowRight size={14} className="text-zinc-600 ml-1" />
                      </div>
                    </div>

                    {/* Bottom row: Instagram + Automations */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/50">
                      {c.instagram_account ? (
                        <a
                          href={`https://instagram.com/${c.instagram_account.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300 transition-colors"
                        >
                          <Instagram size={12} />
                          {c.instagram_account.startsWith('@') ? c.instagram_account : `@${c.instagram_account}`}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                          <Instagram size={12} />
                          Sem conta
                        </span>
                      )}

                      <span className="flex-1" />

                      {canManage ? (
                        <button
                          onClick={(e) => toggleAutomation(e, c)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                            c.automations_enabled
                              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                              : 'bg-zinc-800/50 text-zinc-600 hover:bg-zinc-700/50'
                          }`}
                        >
                          <Bot size={10} />
                          {c.automations_enabled ? 'Auto' : 'Manual'}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-[11px] ${
                          c.automations_enabled ? 'text-emerald-400' : 'text-zinc-600'
                        }`}>
                          <Bot size={10} />
                          {c.automations_enabled ? 'Auto' : 'Manual'}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
              </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={40} className="text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">
                {search || statusFilter !== 'all'
                  ? 'Nenhum cliente encontrado com esses filtros'
                  : 'Nenhum cliente cadastrado'}
              </p>
              {canManage && !search && statusFilter === 'all' && (
                <Button onClick={openNew} variant="outline" className="mt-4">
                  <Plus size={16} className="mr-2" /> Adicionar primeiro cliente
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {view === 'form' && (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Coluna principal */}
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <Label htmlFor="category">Divisão</Label>
                    <Select
                      value={form.category || '_none'}
                      onValueChange={(val) => setForm({ ...form, category: val === '_none' ? '' : val })}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Selecione a divisão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma</SelectItem>
                        <SelectItem value="health">Ludus Health</SelectItem>
                        <SelectItem value="experts">Ludus Experts</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <Separator className="my-4" />
                  <h3 className="text-sm font-medium text-zinc-300">WhatsApp</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp">WhatsApp do Cliente</Label>
                      <Input
                        id="whatsapp"
                        value={form.whatsapp}
                        onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                        placeholder="5511999999999"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="social_media_id">Social Media Responsavel</Label>
                      <Select
                        value={form.social_media_id || '_none'}
                        onValueChange={(val) => setForm({ ...form, social_media_id: val === '_none' ? '' : val })}
                      >
                        <SelectTrigger id="social_media_id">
                          <SelectValue placeholder="Selecione o social media" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nenhum</SelectItem>
                          {users.filter((u) => u.producer_type === 'social_media').map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp_group">Grupo de Producao (WhatsApp)</Label>
                    <div className="flex gap-2">
                      <Select
                        value={form.whatsapp_group || '_none'}
                        onValueChange={(val) => setForm({ ...form, whatsapp_group: val === '_none' ? '' : val })}
                      >
                        <SelectTrigger id="whatsapp_group" className="flex-1">
                          <SelectValue placeholder="Selecione o grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nenhum</SelectItem>
                          {whatsappGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.subject}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={fetchWhatsAppGroups} disabled={loadingGroups}>
                        {loadingGroups ? <Loader2 size={14} className="animate-spin" /> : 'Carregar'}
                      </Button>
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
