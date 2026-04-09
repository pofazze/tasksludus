import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { proxyMediaUrl } from '@/lib/utils';
import { Heart, MessageCircle, Send, Bookmark, ArrowRight, Undo2, CheckCircle2, XCircle, ArrowUpDown } from 'lucide-react';

const POST_TYPE_LABELS = {
  reel: 'Reel', feed: 'Feed', carrossel: 'Carrossel', carousel: 'Carrossel',
  story: 'Story', image: 'Feed',
};

const POST_TYPE_ASPECT = {
  reel: '9:16', story: '9:16', video: '9:16',
  feed: '1:1', image: '1:1',
  carrossel: '1:1', carousel: '1:1',
};

export default function InstagramPostPreview({ item, client, readOnly = false, onApprove, onReject, onMediaChange }) {
  const isStory = item.post_type === 'story';

  if (isStory) {
    return <StoryPreview item={item} client={client} readOnly={readOnly} onApprove={onApprove} onReject={onReject} />;
  }

  return <PostPreview item={item} client={client} readOnly={readOnly} onApprove={onApprove} onReject={onReject} onMediaChange={onMediaChange} />;
}

// ─── Story Layout ──────────────────────────────────────────

function StoryPreview({ item, client, readOnly, onApprove, onReject }) {
  const media = typeof item.media_urls === 'string' ? JSON.parse(item.media_urls) : (item.media_urls || []);
  const firstMedia = media[0];
  const src = firstMedia ? proxyMediaUrl(firstMedia.url) : null;
  const igHandle = client?.instagram_account
    ? (client.instagram_account.startsWith('@') ? client.instagram_account : `@${client.instagram_account}`)
    : client?.name;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border max-w-[480px] mx-auto bg-black aspect-[9/16] max-h-[680px]">
      {/* Media fullscreen */}
      {src ? (
        firstMedia.type === 'video' ? (
          <video src={src} controls className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src={src} alt="Story" className="absolute inset-0 w-full h-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Sem mídia
        </div>
      )}

      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* Progress bar */}
      <div className="absolute top-2 inset-x-3 flex gap-1">
        {media.length > 0 && media.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div className="h-full w-full bg-white rounded-full" />
          </div>
        ))}
      </div>

      {/* Header overlay */}
      <div className="absolute top-5 inset-x-0 flex items-center gap-2.5 px-3">
        {client?.avatar_url ? (
          <img
            src={client.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover ring-2 ring-white/30"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white/30">
            {client?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <p className="text-[13px] font-semibold text-white drop-shadow-sm">{igHandle}</p>
        <span className="text-[11px] text-white/50">agora</span>
      </div>

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Status or Action buttons — overlaid at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        {item.status !== 'pending' ? (
          <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-sm ${
            item.status === 'approved'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {item.status === 'approved' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span className="text-sm font-medium">
              {item.status === 'approved' ? 'Aprovado' : 'Reprovado'}
            </span>
          </div>
        ) : !readOnly && onApprove && onReject ? (
          <div className="flex gap-2.5">
            <button
              onClick={() => onApprove(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-sm transition-all cursor-pointer backdrop-blur-sm"
            >
              Aprovar
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => onReject(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white font-semibold text-sm transition-all cursor-pointer backdrop-blur-sm border border-white/20"
            >
              <Undo2 size={16} />
              Reprovar
            </button>
          </div>
        ) : null}

        {item.rejection_reason && (
          <p className="text-xs text-white/70 mt-2 text-center">Motivo: {item.rejection_reason}</p>
        )}
      </div>
    </div>
  );
}

// ─── Post Layout (Feed / Reel / Carrossel) ─────────────────

function PostPreview({ item, client, readOnly, onApprove, onReject, onMediaChange }) {
  const [expanded, setExpanded] = useState(false);
  const [reordering, setReordering] = useState(false);
  const media = typeof item.media_urls === 'string' ? JSON.parse(item.media_urls) : (item.media_urls || []);
  const isCarousel = media.length > 1;
  const caption = item.caption || '';
  const aspectRatio = POST_TYPE_ASPECT[item.post_type] || '1:1';
  const isLong = caption.length > 125;
  const igHandle = client?.instagram_account
    ? (client.instagram_account.startsWith('@') ? client.instagram_account : `@${client.instagram_account}`)
    : client?.name;

  return (
    <div className="bg-black rounded-2xl overflow-hidden border border-border max-w-[480px] mx-auto">
      {/* Instagram Header */}
      <div className="flex items-center gap-3 px-4 py-3">
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
          <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} aspectRatio={aspectRatio} />
        ) : (
          <div className="aspect-square flex items-center justify-center text-muted-foreground text-sm">
            Sem mídia
          </div>
        )}
      </div>

      {/* Reorder toggle for carousels */}
      {isCarousel && !readOnly && item.status === 'pending' && onMediaChange && (
        <>
          <div className="px-4 pt-2">
            <button
              onClick={() => setReordering((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowUpDown size={13} />
              {reordering ? 'Ocultar ordem' : 'Alterar ordem'}
            </button>
          </div>
          {reordering && (
            <div className="px-4 pt-2">
              <SortableMediaGrid
                media={media}
                onChange={(newMedia) => onMediaChange(item.id, newMedia)}
              />
            </div>
          )}
        </>
      )}

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
            {item.status === 'approved' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
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
