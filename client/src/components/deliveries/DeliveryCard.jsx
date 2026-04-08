import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { proxyMediaUrl } from '@/lib/utils';

export default function DeliveryCard({ delivery, showClient = false, onClick, isDragging = false }) {
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const thumbnail = delivery.media_urls?.[0];
  const thumbUrl = thumbnail ? proxyMediaUrl(thumbnail) : null;

  return (
    <div
      onClick={() => onClick?.(delivery)}
      className={`
        bg-white dark:bg-zinc-900 rounded-xl overflow-hidden cursor-pointer
        transition-all duration-200
        ${isDragging
          ? 'shadow-lg shadow-purple-500/10 ring-1 ring-purple-400/40 scale-[1.01]'
          : 'shadow-sm hover:shadow-md border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700'
        }
      `}
    >
      {/* Thumbnail */}
      {thumbUrl ? (
        <div className="aspect-video w-full overflow-hidden">
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center">
          <span className="text-[10px] text-zinc-300 dark:text-zinc-600">Sem mídia</span>
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium leading-snug line-clamp-2 text-zinc-800 dark:text-zinc-200">
          {delivery.title}
        </p>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
            {CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}
          </span>
          {delivery.user_name && (
            <Avatar className="h-5 w-5">
              <AvatarImage src={delivery.user_avatar_url} />
              <AvatarFallback className="text-[7px] font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {initials(delivery.user_name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        {showClient && delivery.client_name && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 block">{delivery.client_name}</span>
        )}
      </div>
    </div>
  );
}
