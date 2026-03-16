import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ExternalLink, Eye, Instagram, Loader2, Pencil, Plus, RefreshCw,
} from 'lucide-react';

const EMPTY_FORM = { name: '', company: '', instagram_account: '' };

export default function ClientsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditId(c.id);
    setForm({ name: c.name, company: c.company || '', instagram_account: c.instagram_account || '' });
    setDialogOpen(true);
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
      setDialogOpen(false);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
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
                          className="inline-flex items-center gap-1.5 text-sm text-pink-600 hover:underline"
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.instagram_account && (
                        <Button variant="ghost" size="icon" onClick={() => openInstagram(c)} title="Ver Instagram">
                          <Instagram size={16} className="text-pink-600" />
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum cliente cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                <Instagram size={14} className="text-pink-600" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instagram Detail Dialog */}
      <Dialog open={!!igClient} onOpenChange={(open) => !open && setIgClient(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram size={20} className="text-pink-600" />
              Instagram — {igClient?.name}
              {igClient?.instagram_account && (
                <a
                  href={`https://instagram.com/${igClient.instagram_account.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-normal text-pink-600 hover:underline inline-flex items-center gap-1"
                >
                  {igClient.instagram_account.startsWith('@') ? igClient.instagram_account : `@${igClient.instagram_account}`}
                  <ExternalLink size={10} />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Sync Button */}
          {canManage && (
            <div className="flex justify-end">
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
              <Loader2 className="h-6 w-6 animate-spin text-pink-600" />
            </div>
          ) : igPosts.length > 0 ? (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                          post.post_type === 'reel' ? 'bg-purple-100 text-purple-800' :
                          post.post_type === 'carousel' ? 'bg-blue-100 text-blue-800' :
                          post.post_type === 'story' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
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
                            className="inline-flex items-center text-pink-600 hover:underline"
                          >
                            <Eye size={14} />
                          </a>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
