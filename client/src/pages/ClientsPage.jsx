import { useState, useEffect } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Bot, ExternalLink, Eye, Instagram, Loader2, Pencil, Plus, RefreshCw,
} from 'lucide-react';

const EMPTY_FORM = { name: '', company: '', instagram_account: '' };

export default function ClientsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form' | 'instagram'
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Instagram detail
  const [igClient, setIgClient] = useState(null);
  const [igPosts, setIgPosts] = useState([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igSyncing, setIgSyncing] = useState(false);

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

  useEffect(() => { fetchClients(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setView('form');
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({ name: c.name, company: c.company || '', instagram_account: c.instagram_account || '' });
    setView('form');
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await api.put(`/clients/${editId}`, form);
        toast.success('Cliente atualizado');
      } else {
        await api.post('/clients', form);
        toast.success('Cliente criado');
      }
      setView('list');
      fetchClients();
    } catch {
      toast.error('Erro ao salvar cliente');
    }
  };

  // --- Instagram ---
  const openInstagram = async (client) => {
    setIgClient(client);
    setIgPosts([]);
    setIgLoading(true);
    setView('instagram');
    try {
      const { data } = await api.get(`/clients/${client.id}/instagram`);
      setIgPosts(data);
    } catch {
      // no posts yet is fine
    } finally {
      setIgLoading(false);
    }
  };

  const syncInstagram = async () => {
    if (!igClient) return;
    setIgSyncing(true);
    try {
      const { data } = await api.post(`/clients/${igClient.id}/instagram/sync`);
      toast.success(`Sync concluído: ${data.synced} novos posts de ${data.total}`);
      // reload posts
      const { data: posts } = await api.get(`/clients/${igClient.id}/instagram`);
      setIgPosts(posts);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sincronizar Instagram');
    } finally {
      setIgSyncing(false);
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

  const fmtNumber = (n) => n != null ? n.toLocaleString('pt-BR') : '—';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  if (loading) return <PageLoading />;

  // Instagram summary stats
  const igTotalPosts = igPosts.length;
  const igTotalImpressions = igPosts.reduce((s, p) => s + (p.metrics?.impressions || 0), 0);
  const igTotalReach = igPosts.reduce((s, p) => s + (p.metrics?.reach || 0), 0);
  const igTotalEngagement = igPosts.reduce((s, p) => s + (p.metrics?.engagement || 0), 0);

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
                      <TableCell className="font-medium">{c.name}</TableCell>
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
                          {c.instagram_account && (
                            <Button variant="ghost" size="icon" onClick={() => openInstagram(c)} title="Ver Instagram">
                              <Instagram size={16} className="text-pink-400" />
                            </Button>
                          )}
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
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold font-display">
              {editId ? 'Editar Cliente' : 'Novo Cliente'}
            </h1>
          </div>
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  <Instagram size={14} className="text-pink-400" />
                  Instagram
                </Label>
                <Input
                  value={form.instagram_account}
                  onChange={(e) => setForm({ ...form, instagram_account: e.target.value })}
                  placeholder="@conta_do_cliente"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Conta Instagram do cliente para acompanhar métricas de posts
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2 mt-4 max-w-2xl">
            <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </>
      )}

      {view === 'instagram' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => { setView('list'); setIgClient(null); }}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold font-display">
              Instagram — {igClient?.name}
            </h1>
            {igClient?.instagram_account && (
              <a
                href={`https://instagram.com/${igClient.instagram_account.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-400 hover:underline text-sm inline-flex items-center gap-1"
              >
                {igClient.instagram_account.startsWith('@') ? igClient.instagram_account : `@${igClient.instagram_account}`}
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Sync Button */}
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

          {igLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
            </div>
          ) : igPosts.length > 0 ? (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Card>
                  <CardContent className="pt-4 pb-3 px-4 text-center">
                    <p className="text-xs text-muted-foreground">Posts</p>
                    <p className="text-xl font-bold">{igTotalPosts}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4 text-center">
                    <p className="text-xs text-muted-foreground">Impressões</p>
                    <p className="text-xl font-bold">{fmtNumber(igTotalImpressions)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4 text-center">
                    <p className="text-xs text-muted-foreground">Alcance</p>
                    <p className="text-xl font-bold">{fmtNumber(igTotalReach)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4 text-center">
                    <p className="text-xs text-muted-foreground">Engajamento</p>
                    <p className="text-xl font-bold">{fmtNumber(igTotalEngagement)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Posts Table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Impressões</TableHead>
                        <TableHead className="text-right">Alcance</TableHead>
                        <TableHead className="text-right">Engajamento</TableHead>
                        <TableHead className="text-right">Salvos</TableHead>
                        <TableHead>Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {igPosts.map((post) => (
                        <TableRow key={post.id}>
                          <TableCell>
                            <Badge variant="secondary" className={
                              post.post_type === 'reel' ? 'bg-purple-500/15 text-purple-400' :
                              post.post_type === 'carousel' ? 'bg-blue-500/15 text-blue-400' :
                              post.post_type === 'story' ? 'bg-orange-500/15 text-orange-400' :
                              'bg-zinc-800/50 text-zinc-400'
                            }>
                              {post.post_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{fmtDate(post.posted_at)}</TableCell>
                          <TableCell className="text-right">{fmtNumber(post.metrics?.impressions)}</TableCell>
                          <TableCell className="text-right">{fmtNumber(post.metrics?.reach)}</TableCell>
                          <TableCell className="text-right">{fmtNumber(post.metrics?.engagement)}</TableCell>
                          <TableCell className="text-right">{fmtNumber(post.metrics?.saves)}</TableCell>
                          <TableCell>
                            {post.post_url ? (
                              <a
                                href={post.post_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-pink-400 hover:underline"
                              >
                                <Eye size={14} />
                              </a>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <Instagram size={40} className="mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum post sincronizado</p>
              {canManage && (
                <p className="text-sm text-muted-foreground">
                  Clique em "Sincronizar Posts" para buscar dados do Instagram.
                  <br />
                  Certifique-se de que o token do Instagram está configurado em Configurações &gt; Integrações.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
