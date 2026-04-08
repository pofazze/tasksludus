import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { Heart, MessageCircle, Send, Bookmark, ArrowRight, Undo2, CheckCircle2, XCircle } from 'lucide-react';

const POST_TYPE_LABELS = {
  reel: 'Reel', feed: 'Feed', carrossel: 'Carrossel', carousel: 'Carrossel',
  story: 'Story', image: 'Feed',
};

export default function InstagramPostPreview({ item, client, readOnly = false, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const media = typeof item.media_urls === 'string' ? JSON.parse(item.media_urls) : (item.media_urls || []);
  const caption = item.caption || '';
  const isLong = caption.length > 125;
  const igHandle = client?.instagram_account
    ? (client.instagram_account.startsWith('@') ? client.instagram_account : `@${client.instagram_account}`)
    : client?.name;

  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-border max-w-[480px] mx-auto">
      {/* Instagram Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Profile photo */}
        {client?.avatar_url ? (
          <img
            src={client.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover ring-2 ring-pink-500/30"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold ring-2 ring-pink-500/30">
            {client?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{igHandle}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground border-0">
          {POST_TYPE_LABELS[item.post_type] || item.post_type}
        </Badge>
      </div>

      {/* Media */}
      <div className="bg-card">
        {media.length > 0 ? (
          <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
        ) : (
          <div className="aspect-square flex items-center justify-center text-muted-foreground text-sm">
            Sem mídia
          </div>
        )}
      </div>

      {/* Instagram Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex gap-4">
          <Heart size={22} className="text-muted-foreground" />
          <MessageCircle size={22} className="text-muted-foreground" />
          <Send size={22} className="text-muted-foreground" />
        </div>
        <Bookmark size={22} className="text-muted-foreground" />
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-4 pb-3">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            <span className="font-semibold mr-1.5">{igHandle}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 125)}...
                <button onClick={() => setExpanded(true)} className="text-muted-foreground ml-1 cursor-pointer">
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
        <div className="px-4 pb-4">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${
            item.status === 'approved'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {item.status === 'approved'
              ? <CheckCircle2 size={16} />
              : <XCircle size={16} />
            }
            <span className="text-sm font-medium">
              {item.status === 'approved' ? 'Aprovado' : 'Reprovado'}
            </span>
          </div>
          {item.rejection_reason && (
            <p className="text-xs text-muted-foreground mt-2 px-1">Motivo: {item.rejection_reason}</p>
          )}
        </div>
      ) : !readOnly && onApprove && onReject ? (
        <div className="px-4 pb-4 flex gap-2.5">
          <button
            onClick={() => onApprove(item.id)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-sm transition-all cursor-pointer"
          >
            Aprovar
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary hover:bg-surface-3 active:scale-[0.98] text-foreground font-semibold text-sm transition-all cursor-pointer border border-border"
          >
            <Undo2 size={16} />
            Reprovar
          </button>
        </div>
      ) : null}
    </div>
  );
}
