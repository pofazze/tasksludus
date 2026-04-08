import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { listRejected } from '@/services/approvals';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const SSE_EVENTS = ['approval:updated', 'delivery:updated'];

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }) : '—';

export default function CorrectionTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const data = await listRejected(clientId);
      setItems(data);
    } catch {
      toast.error('Erro ao carregar correcoes');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useServerEvent(SSE_EVENTS, fetchData);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
        <CheckCircle2 size={32} className="text-zinc-700" />
        <span className="text-sm">Nenhuma correcao pendente</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={14} className="text-red-400" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Correcoes Pendentes ({items.length})
        </span>
      </div>

      {items.map((item) => {
        const media = item.media_urls
          ? typeof item.media_urls === 'string'
            ? JSON.parse(item.media_urls)
            : item.media_urls
          : [];

        return (
          <Card key={item.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              {/* Media preview */}
              {media.length > 0 && (
                <div className="max-h-48 overflow-hidden">
                  <CarouselPreview
                    media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))}
                  />
                </div>
              )}

              <div className="p-4 space-y-3">
                {/* Title + type */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {item.title || `Entrega #${item.id}`}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {item.post_type && (CONTENT_TYPE_LABELS[item.post_type] || item.post_type)}
                      {item.responded_at && ` · Reprovado em ${fmtDateTime(item.responded_at)}`}
                    </p>
                  </div>
                  <Badge className="bg-red-500/15 text-red-400 shrink-0">
                    Reprovado
                  </Badge>
                </div>

                {/* Rejection reason */}
                {item.rejection_reason && (
                  <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                    <p className="text-xs font-medium text-red-400 mb-1">Motivo da reprovacao:</p>
                    <p className="text-sm text-zinc-300">{item.rejection_reason}</p>
                  </div>
                )}

                {/* Caption preview */}
                {item.caption && (
                  <div className="rounded-lg bg-zinc-800/50 p-3">
                    <p className="text-xs font-medium text-zinc-500 mb-1">Legenda:</p>
                    <p className="text-sm text-zinc-400 line-clamp-3">{item.caption}</p>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        );
      })}

    </div>
  );
}
