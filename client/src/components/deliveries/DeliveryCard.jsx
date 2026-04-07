import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { proxyMediaUrl } from '@/lib/utils';

export default function DeliveryCard({ delivery, showClient = false, onClick }) {
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const thumbnail = delivery.media_urls?.[0];
  const thumbUrl = thumbnail ? proxyMediaUrl(thumbnail) : null;

  return (
    <div
      onClick={() => onClick?.(delivery)}
      className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md group"
    >
      {thumbUrl ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-xs">Sem mídia</span>
        </div>
      )}
      <div className="p-3 space-y-2">
        <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
          {delivery.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}</Badge>
          {delivery.created_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(delivery.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        {delivery.user_name && (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={delivery.user_avatar_url} />
              <AvatarFallback className="text-[8px] bg-muted">{initials(delivery.user_name)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">{delivery.user_name}</span>
          </div>
        )}
        {showClient && delivery.client_name && (
          <span className="text-xs text-muted-foreground">{delivery.client_name}</span>
        )}
      </div>
    </div>
  );
}
