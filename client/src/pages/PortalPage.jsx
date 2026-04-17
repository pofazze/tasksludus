import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { getOAuthUrl as getInstagramOAuthUrl, getConnectionStatus as getInstagramConnectionStatus, disconnectInstagram } from '@/services/instagram';
import { getOAuthUrl as getTikTokOAuthUrl, getConnectionStatus as getTikTokConnectionStatus, disconnectTikTok } from '@/services/tiktok';
import { getYouTubeOAuthUrl, getYouTubeConnectionStatus, disconnectYouTube } from '@/services/youtube';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import PageLoading from '@/components/common/PageLoading';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: 'bg-pink-500/15 text-pink-500', icon: 'IG', getUrl: getInstagramOAuthUrl, getStatus: getInstagramConnectionStatus, disconnect: disconnectInstagram, nameField: 'username' },
  { key: 'tiktok', label: 'TikTok', color: 'bg-emerald-500/15 text-emerald-500', icon: 'TK', getUrl: getTikTokOAuthUrl, getStatus: getTikTokConnectionStatus, disconnect: disconnectTikTok, nameField: 'username' },
  { key: 'youtube', label: 'YouTube', color: 'bg-red-500/15 text-red-500', icon: 'YT', getUrl: getYouTubeOAuthUrl, getStatus: getYouTubeConnectionStatus, disconnect: disconnectYouTube, nameField: 'channelTitle' },
];

export default function PortalPage() {
  const user = useAuthStore((s) => s.user);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState({});
  const [deliveries, setDeliveries] = useState([]);
  const [connecting, setConnecting] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Find the client linked to this user
        const { data: clients } = await api.get('/clients');
        const myClient = clients.find((c) => c.user_id === user?.id);
        if (!myClient) {
          setLoading(false);
          return;
        }
        setClient(myClient);

        // Fetch connection statuses in parallel
        const statuses = {};
        await Promise.all(PLATFORMS.map(async (p) => {
          try {
            statuses[p.key] = await p.getStatus(myClient.id);
          } catch {
            statuses[p.key] = { connected: false };
          }
        }));
        setConnections(statuses);

        // Fetch deliveries for this client
        const { data: allDeliveries } = await api.get('/deliveries');
        setDeliveries((allDeliveries || []).filter((d) => d.client_id === myClient.id).slice(0, 20));
      } catch {
        toast.error('Erro ao carregar portal');
      } finally {
        setLoading(false);
      }
    })();

    // Handle OAuth return
    const params = new URLSearchParams(window.location.search);
    for (const p of PLATFORMS) {
      if (params.get(p.key) === 'connected' || params.get(`${p.key}_connected`) === 'true') {
        toast.success(`${p.label} conectado!`);
        window.history.replaceState({}, '', '/portal');
      }
    }
  }, [user]);

  if (loading) return <PageLoading />;
  if (!client) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Nenhum cliente vinculado à sua conta. Entre em contato com o administrador.</p>
      </div>
    );
  }

  const connectedCount = PLATFORMS.filter((p) => connections[p.key]?.connected).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold text-foreground">Portal do Cliente</h1>

      {/* Social Connections */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Minhas Redes Sociais</h2>
        <div className="space-y-3">
          {PLATFORMS.map((p) => {
            const status = connections[p.key];
            return (
              <Card key={p.key}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${status?.connected ? p.color : 'bg-muted'}`}>
                        <span className={`text-sm font-black ${status?.connected ? '' : 'text-muted-foreground'}`}>{p.icon}</span>
                      </div>
                      <div>
                        {status?.connected ? (
                          <>
                            <p className="text-sm font-medium text-emerald-500">Conectado</p>
                            <p className="text-xs text-muted-foreground">{status[p.nameField] || p.label}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{p.label}</p>
                            <p className="text-xs text-muted-foreground">Conecte para publicar automaticamente</p>
                          </>
                        )}
                      </div>
                    </div>
                    {status?.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={async () => {
                          if (!confirm(`Desconectar ${p.label}?`)) return;
                          try {
                            await p.disconnect(client.id);
                            setConnections((c) => ({ ...c, [p.key]: { connected: false } }));
                            toast.success(`${p.label} desconectado`);
                          } catch {
                            toast.error('Erro ao desconectar');
                          }
                        }}
                      >
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={connecting === p.key}
                        onClick={async () => {
                          setConnecting(p.key);
                          try {
                            const { url } = await p.getUrl(client.id);
                            window.location.href = url;
                          } catch {
                            toast.error(`Erro ao iniciar conexão com ${p.label}`);
                            setConnecting(null);
                          }
                        }}
                      >
                        {connecting === p.key ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                        Conectar {p.label}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(connectedCount / 3) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{connectedCount} de 3</span>
        </div>
      </section>

      {/* Deliveries */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Suas Entregas</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma entrega encontrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Título</th>
                  <th className="text-left p-3">Formato</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-3 font-medium truncate max-w-[300px]">{d.title}</td>
                    <td className="p-3 text-muted-foreground">{CONTENT_TYPE_LABELS[d.content_type] || d.content_type || '—'}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`${PIPELINE_STATUS_COLORS[d.status] || ''} text-xs`}>
                        {PIPELINE_STATUSES[d.status] || d.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
