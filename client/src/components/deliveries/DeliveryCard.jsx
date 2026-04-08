import { CONTENT_TYPE_LABELS, PIPELINE_STATUSES, PIPELINE_STATUS_COLORS } from '@/lib/constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { proxyMediaUrl } from '@/lib/utils';
import { GripVertical, Image } from 'lucide-react';

const FORMAT_ICONS = {
  reel: '🎬', feed: '📸', story: '📱', carrossel: '🎠', banner: '🖼️',
  caixinha: '📦', analise: '📊', pdf: '📄', video: '🎥', mockup: '🎨',
  apresentacao: '📑',
};

export default function DeliveryCard({ delivery, showClient = false, onClick, isDragging = false }) {
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const thumbnail = delivery.media_urls?.[0];
  const thumbUrl = thumbnail ? proxyMediaUrl(thumbnail) : null;
  const formatEmoji = FORMAT_ICONS[delivery.content_type] || '📋';

  return (
    <div
      onClick={() => onClick?.(delivery)}
      className={`
        group relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer
        border border-zinc-200/80 dark:border-zinc-800
        transition-all duration-300 ease-out
        ${isDragging
          ? 'shadow-2xl shadow-purple-500/20 scale-[1.02] rotate-1 ring-2 ring-purple-400/50'
          : 'hover:shadow-xl hover:shadow-zinc-900/5 dark:hover:shadow-black/30 hover:-translate-y-1 hover:border-purple-300 dark:hover:border-purple-500/30'
        }
      `}
    >
      {/* Drag handle indicator */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-60 transition-opacity">
        <GripVertical size={14} className="text-zinc-400" />
      </div>

      {/* Thumbnail */}
      {thumbUrl ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      ) : (
        <div className="aspect-[16/10] w-full bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-900 flex flex-col items-center justify-center gap-1.5">
          <div className="w-10 h-10 rounded-xl bg-zinc-200/80 dark:bg-zinc-700/50 flex items-center justify-center">
            <Image size={18} className="text-zinc-400 dark:text-zinc-500" />
          </div>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium">Sem mídia</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3.5">
        {/* Title */}
        <p className="text-[13px] font-semibold leading-tight line-clamp-2 text-zinc-800 dark:text-zinc-100 group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors duration-200">
          {delivery.title}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-2.5">
          <span className="text-sm" title={CONTENT_TYPE_LABELS[delivery.content_type]}>{formatEmoji}</span>
          <span className={`
            inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase
            ${PIPELINE_STATUS_COLORS[delivery.status] || 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}
          `}>
            {PIPELINE_STATUSES[delivery.status] || delivery.status}
          </span>
          {delivery.created_at && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-auto tabular-nums">
              {new Date(delivery.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        {/* User */}
        {delivery.user_name && (
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80">
            <Avatar className="h-5 w-5 ring-1 ring-zinc-200 dark:ring-zinc-700">
              <AvatarImage src={delivery.user_avatar_url} />
              <AvatarFallback className="text-[7px] font-bold bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                {initials(delivery.user_name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-medium">{delivery.user_name}</span>
          </div>
        )}

        {/* Client (optional) */}
        {showClient && delivery.client_name && (
          <div className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">
            {delivery.client_name}
          </div>
        )}
      </div>
    </div>
  );
}
