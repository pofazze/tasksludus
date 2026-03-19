import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import PageLoading from '@/components/common/PageLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Send, CheckCircle2, XCircle, Loader2, Plug, Webhook, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  // ClickUp test
  const [clickupResult, setClickupResult] = useState(null);
  const [clickupTesting, setClickupTesting] = useState(false);

  // Webhooks
  const [webhooks, setWebhooks] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookRegistering, setWebhookRegistering] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState([]);

  // ClickUp Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Invite form
  const [inviteForm, setInviteForm] = useState({
    name: '', email: '', password: '', whatsapp: '',
    role: 'producer', producer_type: 'video_editor',
  });
  const [inviteSending, setInviteSending] = useState(false);

  const fetchSettings = async () => {
    try {
      const [settingsRes, integrationsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/integrations'),
      ]);
      setSettings(settingsRes.data);
      setIntegrations(integrationsRes.data);
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const getSettingValue = (key) => settings.find((s) => s.key === key)?.value;

  const updateSetting = async (key, value) => {
    try {
      await api.put(`/settings/${key}`, { value });
      toast.success('Configuração atualizada');
      fetchSettings();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const toggleIntegration = async (integration) => {
    try {
      await api.put(`/settings/integrations/${integration.id}`, {
        is_active: !integration.is_active,
      });
      toast.success(integration.is_active ? 'Integração desativada' : 'Integração ativada');
      fetchSettings();
    } catch {
      toast.error('Erro ao atualizar integração');
    }
  };

  const testClickUp = async () => {
    setClickupTesting(true);
    setClickupResult(null);
    try {
      const { data } = await api.post('/settings/integrations/test/clickup');
      setClickupResult(data);
      if (data.connected) {
        toast.success('ClickUp conectado!');
      } else {
        toast.error(data.error);
      }
    } catch {
      setClickupResult({ connected: false, error: 'Erro na requisição' });
    } finally {
      setClickupTesting(false);
    }
  };

  const setField = (key, value) => setInviteForm((f) => ({ ...f, [key]: value }));

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteSending(true);
    try {
      const payload = {
        email: inviteForm.email,
        role: inviteForm.role,
      };
      if (inviteForm.role === 'producer') payload.producer_type = inviteForm.producer_type;
      if (inviteForm.name) payload.name = inviteForm.name;
      if (inviteForm.password) payload.password = inviteForm.password;
      if (inviteForm.whatsapp) payload.whatsapp = inviteForm.whatsapp;

      const { data } = await api.post('/auth/invites', payload);
      if (data.directCreation) {
        toast.success(`Usuário ${inviteForm.name} criado com sucesso`);
      } else {
        toast.success('Convite enviado para ' + inviteForm.email);
      }
      setInviteForm({ name: '', email: '', password: '', whatsapp: '', role: 'producer', producer_type: 'video_editor' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar convite');
    } finally {
      setInviteSending(false);
    }
  };

  const fetchWebhooks = async () => {
    try {
      const { data } = await api.get('/webhooks/clickup');
      setWebhooks(data.webhooks || []);
    } catch { /* ignore */ }
  };

  const fetchWebhookEvents = async () => {
    try {
      const { data } = await api.get('/webhooks/events', { params: { limit: 20 } });
      setWebhookEvents(data);
    } catch { /* ignore */ }
  };

  const registerWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Informe a URL do webhook');
      return;
    }
    setWebhookRegistering(true);
    try {
      const { data } = await api.post('/webhooks/clickup/register', { endpoint_url: webhookUrl });
      toast.success('Webhook registrado com sucesso!');
      if (data.webhook?.secret) {
        toast.info('Secret salvo. Configure CLICKUP_WEBHOOK_SECRET no .env');
      }
      fetchWebhooks();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar webhook');
    } finally {
      setWebhookRegistering(false);
    }
  };

  const runClickUpSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post('/webhooks/clickup/sync');
      setSyncResult(data);
      toast.success(
        `Sync completo: ${data.members.created + data.members.updated} membros, ` +
        `${data.clients.created + data.clients.updated} clientes, ` +
        `${data.deliveries.created + data.deliveries.updated} entregas`
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sincronizar com ClickUp');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString('pt-BR') : null;

  if (loading) return <PageLoading />;

  const clickupInteg = integrations.find((i) => i.type === 'clickup');
  const instagramInteg = integrations.find((i) => i.type === 'instagram');

  return (
    <div>
      <h1 className="text-2xl font-bold font-display mb-6">Configurações</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="invites">Convites</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <div className="space-y-4 max-w-lg">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exibir nomes no ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Quando desativado, o ranking mostra apenas iniciais
                  </p>
                  <Switch
                    checked={getSettingValue('ranking_show_names') === true}
                    onCheckedChange={(checked) => updateSetting('ranking_show_names', checked)}
                  />
                </div>
              </CardContent>
            </Card>
            {settings
              .filter((s) => s.key !== 'ranking_show_names')
              .map((s) => (
                <Card key={s.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{s.key}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {typeof s.value === 'boolean' ? (
                      <Switch
                        checked={s.value}
                        onCheckedChange={(checked) => updateSetting(s.key, checked)}
                      />
                    ) : (
                      <Input
                        defaultValue={String(s.value ?? '')}
                        onBlur={(e) => {
                          if (e.target.value !== String(s.value ?? '')) {
                            updateSetting(s.key, s.type === 'number' ? Number(e.target.value) : e.target.value);
                          }
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations">
          <div className="space-y-6 max-w-2xl">

            {/* ClickUp */}
            {clickupInteg && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg p-2 bg-purple-500/15">
                        <Plug size={18} className="text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">ClickUp</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Sincronização de tarefas e entregas
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {clickupInteg.last_sync_at && (
                        <span className="text-xs text-muted-foreground">
                          Testado: {formatDate(clickupInteg.last_sync_at)}
                        </span>
                      )}
                      <Badge variant={clickupInteg.is_active ? 'default' : 'secondary'}>
                        {clickupInteg.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Switch
                        checked={clickupInteg.is_active}
                        onCheckedChange={() => toggleIntegration(clickupInteg)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 border text-sm">
                    <span className="text-muted-foreground">Token configurado via</span>
                    <Badge variant="outline">CLICKUP_API_TOKEN</Badge>
                    <span className="text-muted-foreground">no arquivo .env</span>
                  </div>

                  {clickupResult && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                      clickupResult.connected
                        ? 'bg-emerald-500/10 text-green-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {clickupResult.connected ? (
                        <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                      ) : (
                        <XCircle size={16} className="text-red-400 shrink-0" />
                      )}
                      <span>
                        {clickupResult.connected
                          ? `Conectado — ${clickupResult.user} (${clickupResult.email})`
                          : clickupResult.error}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testClickUp}
                      disabled={clickupTesting}
                    >
                      {clickupTesting ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <Plug size={14} className="mr-2" />
                      )}
                      Testar Conexão
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { fetchWebhooks(); fetchWebhookEvents(); }}
                    >
                      <Webhook size={14} className="mr-2" />
                      Ver Webhooks
                    </Button>
                  </div>

                  {/* Data Sync */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium mb-2">Importação de Dados</h4>
                    <p className="text-sm text-zinc-500 mb-3">
                      Importa membros, clientes e tarefas do ClickUp para o banco de dados.
                    </p>
                    <Button
                      onClick={runClickUpSync}
                      disabled={syncing}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {syncing ? <><Loader2 size={14} className="mr-2 animate-spin" /> Sincronizando...</> : <><RefreshCw size={14} className="mr-2" /> Sincronizar ClickUp</>}
                    </Button>

                    {syncResult && (
                      <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg text-sm space-y-1">
                        <p><strong>Membros:</strong> {syncResult.members.created} criados, {syncResult.members.updated} atualizados</p>
                        <p><strong>Clientes:</strong> {syncResult.clients.created} criados, {syncResult.clients.updated} atualizados</p>
                        <p><strong>Entregas:</strong> {syncResult.deliveries.created} criadas, {syncResult.deliveries.updated} atualizadas, {syncResult.deliveries.skipped} ignoradas ({syncResult.deliveries.total} total no ClickUp)</p>
                      </div>
                    )}
                  </div>

                  {/* Webhook Management */}
                  {webhooks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Webhooks registrados</p>
                      {webhooks.map((wh) => (
                        <div key={wh.id} className="flex items-center gap-2 p-2 rounded bg-zinc-800/50 border text-xs">
                          <Badge variant={wh.health?.status === 'active' ? 'default' : 'secondary'}>
                            {wh.health?.status || 'unknown'}
                          </Badge>
                          <span className="truncate flex-1 font-mono">{wh.endpoint}</span>
                          <span className="text-muted-foreground">{wh.events?.length || 0} eventos</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Registrar Webhook</p>
                    <div className="flex gap-2">
                      <Input
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://seu-servidor.com/api/webhooks/clickup"
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={registerWebhook}
                        disabled={webhookRegistering}
                      >
                        {webhookRegistering ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          'Registrar'
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Eventos: taskCreated, taskUpdated, taskStatusUpdated, taskAssigneeUpdated, etc.
                    </p>
                  </div>

                  {/* Recent webhook events */}
                  {webhookEvents.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Últimos Eventos</p>
                        <Button variant="ghost" size="sm" onClick={fetchWebhookEvents}>
                          <RefreshCw size={12} className="mr-1" /> Atualizar
                        </Button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {webhookEvents.map((ev) => (
                          <div key={ev.id} className="flex items-center gap-2 p-1.5 rounded text-xs bg-zinc-800/50">
                            <Badge
                              variant="secondary"
                              className={ev.status === 'processed' ? 'bg-emerald-500/15 text-emerald-400' : ev.status === 'failed' ? 'bg-red-500/15 text-red-400' : ''}
                            >
                              {ev.status}
                            </Badge>
                            <span className="font-mono">{ev.event_type}</span>
                            <span className="text-muted-foreground ml-auto">{formatDate(ev.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Instagram */}
            {instagramInteg && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-pink-500/15">
                      <Plug size={18} className="text-pink-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Instagram</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Contas Instagram são vinculadas diretamente na página de Clientes
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Other integrations */}
            {integrations
              .filter((i) => i.type !== 'clickup' && i.type !== 'instagram')
              .map((integ) => (
                <Card key={integ.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg p-2 bg-zinc-800/50">
                          <Plug size={18} className="text-zinc-400" />
                        </div>
                        <CardTitle className="text-base capitalize">{integ.type.replace('_', ' ')}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={integ.is_active ? 'default' : 'secondary'}>
                          {integ.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <Switch
                          checked={integ.is_active}
                          onCheckedChange={() => toggleIntegration(integ)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}

            {integrations.length === 0 && (
              <p className="text-muted-foreground">Nenhuma integração configurada</p>
            )}
          </div>
        </TabsContent>

        {/* Invites */}
        <TabsContent value="invites">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="text-base">Adicionar Membro</CardTitle>
              <p className="text-sm text-muted-foreground">
                Preencha nome e senha para criar diretamente, ou apenas email para enviar convite.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={inviteForm.name}
                      onChange={(e) => setField('name', e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setField('email', e.target.value)}
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
                      onChange={(e) => setField('password', e.target.value)}
                      placeholder="Min. 6 caracteres"
                    />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input
                      value={inviteForm.whatsapp}
                      onChange={(e) => setField('whatsapp', e.target.value)}
                      placeholder="(99) 99999-9999"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cargo</Label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setField('role', e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-[#111114] text-foreground"
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
                        onChange={(e) => setField('producer_type', e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm bg-[#111114] text-foreground"
                      >
                        <option value="video_editor">Editor de Vídeo</option>
                        <option value="designer">Designer</option>
                        <option value="captation">Captação</option>
                        <option value="social_media">Social Media</option>
                      </select>
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={inviteSending}>
                  <Send size={16} className="mr-2" />
                  {inviteSending ? 'Criando...' : inviteForm.name && inviteForm.password ? 'Criar Usuário' : 'Enviar Convite'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
