import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { proxyMediaUrl } from '@/lib/utils';

export default function MediaPreviewPopover({ media, anchorRect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!media || !anchorRect) return null;

  const style = {
    position: 'fixed',
    top: Math.max(16, Math.min(anchorRect.top - 50, window.innerHeight - 450)),
    right: anchorRect.sheetWidth + 12,
    zIndex: 60,
  };

  return (
    <div ref={ref} style={style} className="w-[400px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-400 truncate">{media.name || 'Preview'}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
          <X size={14} />
        </button>
      </div>
      <div className="p-2">
        {media.type === 'video' ? (
          <video
            src={proxyMediaUrl(media.url)}
            controls
            className="w-full rounded-lg max-h-[400px]"
          />
        ) : (
          <img
            src={proxyMediaUrl(media.url)}
            alt=""
            className="w-full rounded-lg max-h-[400px] object-contain"
          />
        )}
      </div>
    </div>
  );
}
