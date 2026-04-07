import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { proxyMediaUrl } from '@/lib/utils';

export default function DeliveryDetailModal({ delivery, onClose, onEdit }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!delivery) return null;

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const mediaUrls = Array.isArray(delivery.media_urls) ? delivery.media_urls : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="text-xl font-bold font-display truncate">{delivery.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[delivery.status] || ''}>{PIPELINE_STATUSES[delivery.status] || delivery.status}</Badge>
              <Badge variant="outline">{CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}</Badge>
              {delivery.difficulty && <Badge variant="outline">{DIFFICULTY_LABELS[delivery.difficulty] || delivery.difficulty}</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0"><X size={18} /></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {mediaUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mediaUrls.map((url, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img src={proxyMediaUrl(url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {delivery.user_name && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Responsável</p>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6"><AvatarImage src={delivery.user_avatar_url} /><AvatarFallback className="text-[8px] bg-muted">{initials(delivery.user_name)}</AvatarFallback></Avatar>
                  <span className="text-sm">{delivery.user_name}</span>
                </div>
              </div>
            )}
            {delivery.client_name && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Cliente</p>
                <span className="text-sm">{delivery.client_name}</span>
              </div>
            )}
            {delivery.month && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Mês</p>
                <span className="text-sm">{new Date(delivery.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
              </div>
            )}
            {delivery.created_at && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Criado em</p>
                <span className="text-sm">{new Date(delivery.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>
          {delivery.clickup_task_id && (
            <a href={`https://app.clickup.com/t/${delivery.clickup_task_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink size={14} /> Ver no ClickUp ({delivery.clickup_task_id})
            </a>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          {onEdit && <Button variant="outline" onClick={() => onEdit(delivery)}>Editar</Button>}
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
