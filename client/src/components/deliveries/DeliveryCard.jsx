import { CONTENT_TYPE_LABELS, PIPELINE_STATUSES } from '@/lib/constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { proxyMediaUrl } from '@/lib/utils';
import { Image } from 'lucide-react';

const FORMAT_COLORS = {
  reel: { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-700 dark:text-blue-400' },
  feed: { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
  story: { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400' },
  carrossel: { bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400' },
  banner: { bg: 'bg-pink-100 dark:bg-pink-500/15', text: 'text-pink-700 dark:text-pink-400' },
  caixinha: { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-400' },
  analise: { bg: 'bg-cyan-100 dark:bg-cyan-500/15', text: 'text-cyan-700 dark:text-cyan-400' },
  pdf: { bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-700 dark:text-red-400' },
  video: { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-400' },
  mockup: { bg: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-400' },
  apresentacao: { bg: 'bg-violet-100 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-400' },
};

const STATUS_DOT = {
  triagem: 'bg-orange-400', planejamento: 'bg-zinc-400', captacao: 'bg-sky-400',
  edicao_de_video: 'bg-violet-400', estruturacao: 'bg-yellow-400', design: 'bg-blue-400',
  aprovacao: 'bg-pink-400', correcao: 'bg-red-400', agendamento: 'bg-amber-400',
  agendado: 'bg-teal-400', publicacao: 'bg-emerald-400',
};

export default function DeliveryCard({ delivery, showClient = false, onClick, isDragging = false }) {
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const thumbnail = delivery.media_urls?.[0];
  const thumbUrl = thumbnail ? proxyMediaUrl(thumbnail) : null;
  const fmtColor = FORMAT_COLORS[delivery.content_type] || { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400' };
  const statusDot = STATUS_DOT[delivery.status] || 'bg-zinc-400';

  return (
    <div
      onClick={() => onClick?.(delivery)}
      className={`
        group bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer
        transition-all duration-200
        ${isDragging
          ? 'shadow-lg shadow-purple-500/10 ring-1 ring-purple-400/40 scale-[1.01]'
          : 'shadow-sm hover:shadow-md border border-zinc-100 dark:border-zinc-800 hover:border-purple-200 dark:hover:border-purple-500/30'
        }
      `}
    >
      {/* Thumbnail */}
      {thumbUrl ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          {/* Status dot overlay */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
            <span className="text-[9px] text-white font-medium">{PIPELINE_STATUSES[delivery.status]}</span>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800/50 dark:to-zinc-900 flex items-center justify-center">
          <Image size={20} className="text-zinc-300 dark:text-zinc-600" />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
            <span className="text-[9px] text-zinc-600 dark:text-zinc-300 font-medium">{PIPELINE_STATUSES[delivery.status]}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-zinc-800 dark:text-zinc-200 group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">
          {delivery.title}
        </p>

        {/* Format badge + date */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${fmtColor.bg} ${fmtColor.text}`}>
            {CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}
          </span>
          {delivery.created_at && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-auto tabular-nums">
              {new Date(delivery.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        {/* User row */}
        {delivery.user_name && (
          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <Avatar className="h-5 w-5 ring-1 ring-zinc-200 dark:ring-zinc-700">
              <AvatarImage src={delivery.user_avatar_url} />
              <AvatarFallback className="text-[7px] font-bold bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                {initials(delivery.user_name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-medium">{delivery.user_name}</span>
          </div>
        )}

        {showClient && delivery.client_name && (
          <div className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">
            {delivery.client_name}
          </div>
        )}
      </div>
    </div>
  );
}
