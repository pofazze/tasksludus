import { useEffect, useState } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight, User, Calendar, Building2, Layers, Zap, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants';
import { proxyMediaUrl } from '@/lib/utils';

export default function DeliveryDetailModal({ delivery, onClose, onEdit }) {
  const [activeMedia, setActiveMedia] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    requestAnimationFrame(() => setAnimateIn(true));
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!delivery) return null;

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const mediaUrls = Array.isArray(delivery.media_urls) ? delivery.media_urls : [];
  const hasMedia = mediaUrls.length > 0;

  const infoItems = [
    delivery.user_name && { icon: User, label: 'Responsável', value: delivery.user_name, avatar: { src: delivery.user_avatar_url, fallback: initials(delivery.user_name) } },
    delivery.client_name && { icon: Building2, label: 'Cliente', value: delivery.client_name },
    delivery.content_type && { icon: Layers, label: 'Formato', value: CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type },
    delivery.difficulty && { icon: Zap, label: 'Dificuldade', value: DIFFICULTY_LABELS[delivery.difficulty] || delivery.difficulty },
    delivery.month && { icon: Calendar, label: 'Mês', value: new Date(delivery.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
    delivery.created_at && { icon: Clock, label: 'Criado em', value: new Date(delivery.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) },
  ].filter(Boolean);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Modal */}
      <div
        className={`
          relative w-full max-w-4xl max-h-[92vh] overflow-hidden
          bg-white dark:bg-zinc-900
          rounded-3xl shadow-2xl shadow-black/20
          border border-zinc-200/50 dark:border-zinc-800
          flex flex-col
          transition-all duration-300 ease-out
          ${animateIn ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/20 dark:hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        <div className="flex-1 overflow-y-auto">
          {/* Media section */}
          {hasMedia && (
            <div className="relative bg-zinc-950">
              <div className="aspect-video w-full overflow-hidden">
                <img
                  src={proxyMediaUrl(mediaUrls[activeMedia])}
                  alt=""
                  className="w-full h-full object-contain"
                />
              </div>
              {/* Media nav */}
              {mediaUrls.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveMedia((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setActiveMedia((prev) => (prev + 1) % mediaUrls.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {mediaUrls.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveMedia(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                          i === activeMedia ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/80'
                        }`}
                      />
                    ))}
                  </div>
                  {/* Thumbnails strip */}
                  <div className="flex gap-1.5 px-3 py-2 bg-zinc-900/80 backdrop-blur-sm overflow-x-auto">
                    {mediaUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveMedia(i)}
                        className={`flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                          i === activeMedia ? 'border-purple-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
                        }`}
                      >
                        <img src={proxyMediaUrl(url)} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight font-display">
                  {delivery.title}
                </h2>
                <div className="flex items-center gap-2.5 mt-3 flex-wrap">
                  <span className={`
                    inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase
                    ${PIPELINE_STATUS_COLORS[delivery.status] || 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}
                  `}>
                    {PIPELINE_STATUSES[delivery.status] || delivery.status}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}
                  </span>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {infoItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800"
                >
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-700/50 shadow-sm flex items-center justify-center flex-shrink-0">
                    {item.avatar ? (
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={item.avatar.src} />
                        <AvatarFallback className="text-[9px] font-bold bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                          {item.avatar.fallback}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <item.icon size={16} className="text-zinc-400 dark:text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ClickUp link */}
            {delivery.clickup_task_id && (
              <a
                href={`https://app.clickup.com/t/${delivery.clickup_task_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
              >
                <ExternalLink size={14} />
                Ver no ClickUp — {delivery.clickup_task_id}
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          {onEdit && (
            <button
              onClick={() => onEdit(delivery)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition-all cursor-pointer shadow-sm shadow-purple-600/20"
            >
              Editar
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
