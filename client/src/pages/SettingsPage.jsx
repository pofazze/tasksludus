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
import { useSearchParams } from 'react-router-dom';
import { Send, CheckCircle2, XCircle, Loader2, Plug, Webhook, RefreshCw, Unplug, Smartphone, QrCode } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { theme, setTheme } = useTheme();

  // ClickUp test
  const [clickupResult, setClickupResult] = useState(null);
  const [clickupTesting, setClickupTesting] = useState(false);

  // Webhooks
  const [webhooks, setWebhooks] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookRegistering, setWebhookRegistering] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState([]);

  // ClickUp OAuth
  const [clickupOAuth, setClickupOAuth] = useState(null); // { connected, source, username, email }
  const [clickupConnecting, setClickupConnecting] = useState(false);
  const [clickupDisconnecting, setClickupDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // ClickUp Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // WhatsApp / Evolution API
  const [waNumber, setWaNumber] = useState('');
  const waInstanceName = 'tasksludus';
  const [waConnecting, setWaConnecting] = useState(false);
  const [waQrCode, setWaQrCode] = useState(null); // base64 QR image
  const [waState, setWaState] = useState(null); // 'open', 'close', 'connecting'
  const [waPolling, setWaPolling] = useState(false);

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

  const fetchClickUpOAuth = async () => {
    try {
      const { data } = await api.get('/webhooks/clickup/oauth/status');
      setClickupOAuth(data);
    } catch { /* ignore */ }
  };

  // WhatsApp phone mask: (11) 99999-8888 or (11) 9999-8888
  const formatWaNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleWaNumberChange = (e) => {
    setWaNumber(formatWaNumber(e.target.value));
  };

  const handleWaConnect = async () => {
    const cleanNumber = waNumber.replace(/\D/g, '');
    if (cleanNumber.length < 10 || cleanNumber.length > 11) {
      toast.error('Numero invalido. Use formato: (11) 99999-8888');
      return;
    }
    const fullNumber = `55${cleanNumber}`;

    setWaConnecting(true);
    setWaQrCode(null);
    setWaState(null);

    try {
      // Step 1: Create instance
      await api.post('/settings/evolution/create-instance', {
        instanceName: waInstanceName,
        number: fullNumber,
      });

      // Step 2: Get QR code
      const { data } = await api.get(`/settings/evolution/connect/${waInstanceName}`);
      if (data.base64) {
        setWaQrCode(data.base64);
        startWaPolling();
      } else if (data.pairingCode) {
        // Instance might already be connecting
        toast.info(`Codigo de pareamento: ${data.pairingCode}`);
        startWaPolling();
      }
    } catch (err) {
      // If instance already exists, try to just connect
      try {
        const { data } = await api.get(`/settings/evolution/connect/${waInstanceName}`);
        if (data.base64) {
          setWaQrCode(data.base64);
          startWaPolling();
        }
      } catch {
        toast.error(err.response?.data?.error || 'Erro ao conectar WhatsApp');
      }
    } finally {
      setWaConnecting(false);
    }
  };

  const startWaPolling = () => {
    setWaPolling(true);
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/settings/evolution/connection-state/${waInstanceName}`);
        const state = data.state || data.instance?.state;
        setWaState(state);
        if (state === 'open') {
          clearInterval(interval);
          setWaPolling(false);
          setWaQrCode(null);
          toast.success('WhatsApp conectado com sucesso!');
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    // Stop polling after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      setWaPolling(false);
    }, 120000);
  };

  const checkWaState = async () => {
    try {
      const { data } = await api.get(`/settings/evolution/connection-state/${waInstanceName}`);
      setWaState(data.state || data.instance?.state || null);
    } catch {
      setWaState(null);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchClickUpOAuth();
    checkWaState();
  }, []);

  // Handle ClickUp OAuth callback redirect
  useEffect(() => {
    if (searchParams.get('clickup_connected') === 'true') {
      toast.success('ClickUp conectado com sucesso!');
      fetchClickUpOAuth();
      searchParams.delete('clickup_connected');
      setSearchParams(searchParams, { replace: true });
    }
    const clickupError = searchParams.get('clickup_error');
    if (clickupError) {
      toast.error(`Erro ao conectar ClickUp: ${clickupError}`);
      searchParams.delete('clickup_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

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

  const connectClickUp = async () => {
    setClickupConnecting(true);
    try {
      const { data } = await api.get('/webhooks/clickup/oauth/url');
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar conexão');
      setClickupConnecting(false);
    }
  };

  const disconnectClickUp = async () => {
    setClickupDisconnecting(true);
    try {
      await api.delete('/webhooks/clickup/oauth');
      toast.success('ClickUp desconectado');
      setClickupOAuth({ connected: false });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao desconectar');
    } finally {
      setClickupDisconnecting(false);
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

      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">Aparência</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="invites">Convites</TabsTrigger>
        </TabsList>

        {/* Appearance Settings */}
        <TabsContent value="appearance">
          <div className="space-y-4 max-w-lg">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  {[
                    { value: 'light', label: 'Claro' },
                    { value: 'dark', label: 'Escuro' },
                    { value: 'system', label: 'Sistema' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        theme === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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
                  {/* OAuth Connection Status */}
                  {clickupOAuth?.connected && clickupOAuth.source === 'oauth' ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                        <div>
                          <span className="text-green-400 font-medium">
                            Conectado via OAuth — @{clickupOAuth.username}
                          </span>
                          <p className="text-green-400/70 text-xs">{clickupOAuth.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={disconnectClickUp}
                        disabled={clickupDisconnecting}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        {clickupDisconnecting ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <Unplug size={14} className="mr-1" />
                        )}
                        Desconectar
                      </Button>
                    </div>
                  ) : clickupOAuth?.connected && clickupOAuth.source === 'env' ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
                        <div>
                          <span className="text-amber-400 font-medium">Conectado via token manual</span>
                          <p className="text-amber-400/70 text-xs">Variável CLICKUP_API_TOKEN no servidor</p>
                        </div>
                      </div>
                      <Button
                        onClick={connectClickUp}
                        disabled={clickupConnecting}
                        className="bg-purple-600 hover:bg-purple-700"
                        size="sm"
                      >
                        {clickupConnecting ? (
                          <Loader2 size={14} className="mr-2 animate-spin" />
                        ) : (
                          <Plug size={14} className="mr-2" />
                        )}
                        Conectar via OAuth
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm">
                      <div className="flex items-center gap-2">
                        <XCircle size={16} className="text-red-400 shrink-0" />
                        <span className="text-red-400">ClickUp não conectado</span>
                      </div>
                      <Button
                        onClick={connectClickUp}
                        disabled={clickupConnecting}
                        className="bg-purple-600 hover:bg-purple-700"
                        size="sm"
                      >
                        {clickupConnecting ? (
                          <Loader2 size={14} className="mr-2 animate-spin" />
                        ) : (
                          <Plug size={14} className="mr-2" />
                        )}
                        Conectar ClickUp
                      </Button>
                    </div>
                  )}

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
                          ? `Teste OK — ${clickupResult.user} (${clickupResult.email})`
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
                      onClick={runClickUpSync}
                      disabled={syncing}
                      className="bg-purple-600 hover:bg-purple-700"
                      size="sm"
                    >
                      {syncing ? <><Loader2 size={14} className="mr-2 animate-spin" /> Sincronizando...</> : <><RefreshCw size={14} className="mr-2" /> Sincronizar ClickUp</>}
                    </Button>
                  </div>

                  {syncResult && (
                    <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                      <p><strong>Membros:</strong> {syncResult.members.created} criados, {syncResult.members.updated} atualizados</p>
                      <p><strong>Clientes:</strong> {syncResult.clients.created} criados, {syncResult.clients.updated} atualizados</p>
                      <p><strong>Entregas:</strong> {syncResult.deliveries.created} criadas, {syncResult.deliveries.updated} atualizadas, {syncResult.deliveries.skipped} ignoradas ({syncResult.deliveries.total} total no ClickUp)</p>
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

            {/* WhatsApp / Evolution API */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-emerald-500/15">
                      <Smartphone size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">WhatsApp</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Conexao via Evolution API (Baileys)
                      </p>
                    </div>
                  </div>
                  {waState === 'open' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400">Conectado</Badge>
                  ) : waState === 'connecting' ? (
                    <Badge className="bg-amber-500/15 text-amber-400">Conectando...</Badge>
                  ) : (
                    <Badge className="bg-zinc-500/15 text-zinc-400">Desconectado</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {waState === 'open' ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <CheckCircle2 size={16} />
                    <span>WhatsApp conectado e funcionando</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 max-w-xs">
                      <Label htmlFor="wa-number">Numero do WhatsApp</Label>
                      <Input
                        id="wa-number"
                        value={waNumber}
                        onChange={handleWaNumberChange}
                        placeholder="(11) 99999-8888"
                        maxLength={15}
                      />
                      <p className="text-[11px] text-zinc-500">DDD + numero (o 55 e adicionado automaticamente)</p>
                    </div>
                    <Button
                      onClick={handleWaConnect}
                      disabled={waConnecting || !waNumber}
                      className="bg-emerald-600 hover:bg-emerald-500"
                    >
                      {waConnecting ? (
                        <Loader2 size={14} className="animate-spin mr-2" />
                      ) : (
                        <QrCode size={14} className="mr-2" />
                      )}
                      Conectar WhatsApp
                    </Button>
                  </>
                )}

                {/* QR Code Modal */}
                {waQrCode && (
                  <div className="mt-4 p-6 rounded-xl bg-white flex flex-col items-center gap-4 max-w-xs mx-auto">
                    <p className="text-sm font-medium text-zinc-800">Escaneie o QR Code no WhatsApp</p>
                    <img
                      src={waQrCode.startsWith('data:') ? waQrCode : `data:image/png;base64,${waQrCode}`}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64"
                    />
                    {waPolling && (
                      <div className="flex items-center gap-2 text-zinc-600 text-xs">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Aguardando leitura do QR Code...</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

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
                      className="native-select"
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
                        className="native-select"
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
