import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { Heart, MessageCircle, Send, Bookmark } from 'lucide-react';

const POST_TYPE_LABELS = {
  reel: 'Reel',
  feed: 'Feed',
  carrossel: 'Carrossel',
  carousel: 'Carrossel',
  story: 'Story',
  image: 'Feed',
};

export default function InstagramPostPreview({ item, client, readOnly = false, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const media = typeof item.media_urls === 'string' ? JSON.parse(item.media_urls) : (item.media_urls || []);
  const caption = item.caption || '';
  const isLong = caption.length > 125;

  return (
    <div className="bg-black rounded-xl overflow-hidden border border-zinc-800 max-w-[480px] mx-auto">
      {/* Instagram Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9A48EA] to-pink-500 flex items-center justify-center text-white text-xs font-bold">
          {client?.instagram_account?.[0]?.toUpperCase() || client?.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {client?.instagram_account || client?.name}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400">
          {POST_TYPE_LABELS[item.post_type] || item.post_type}
        </Badge>
      </div>

      {/* Media */}
      <div className="bg-zinc-950">
        {media.length > 0 ? (
          <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-600 text-sm">
            Sem midia
          </div>
        )}
      </div>

      {/* Instagram Actions Bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex gap-4">
          <Heart size={22} className="text-zinc-400" />
          <MessageCircle size={22} className="text-zinc-400" />
          <Send size={22} className="text-zinc-400" />
        </div>
        <Bookmark size={22} className="text-zinc-400" />
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-3 pb-3">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            <span className="font-semibold mr-1">{client?.instagram_account || client?.name}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 125)}...
                <button onClick={() => setExpanded(true)} className="text-zinc-500 ml-1">
                  mais
                </button>
              </>
            ) : (
              caption
            )}
          </p>
        </div>
      )}

      {/* Status or Action buttons */}
      {item.status !== 'pending' ? (
        <div className="px-3 pb-3">
          <Badge className={item.status === 'approved'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
          }>
            {item.status === 'approved' ? 'Aprovado' : 'Reprovado'}
          </Badge>
          {item.rejection_reason && (
            <p className="text-xs text-zinc-500 mt-2">Motivo: {item.rejection_reason}</p>
          )}
        </div>
      ) : !readOnly && onApprove && onReject ? (
        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => onApprove(item.id)}
            className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
          >
            Aprovar
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors"
          >
            Reprovar
          </button>
        </div>
      ) : null}
    </div>
  );
}
