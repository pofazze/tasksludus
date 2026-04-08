'use client';

import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { cn, proxyMediaUrl } from '@/lib/utils';

function CarouselPreview({ media, className }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => emblaApi.off('select', onSelect);
  }, [emblaApi, onSelect]);

  if (!media || media.length === 0) {
    return (
      <div className={cn('aspect-square max-h-[520px] rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground', className)}>
        Sem mídia
      </div>
    );
  }

  // Single image — no carousel needed
  if (media.length === 1) {
    const item = media[0];
    const src = proxyMediaUrl(item.url);
    return (
      <div className={cn('aspect-square max-h-[520px] rounded-xl bg-card border border-border overflow-hidden', className)}>
        {item.type === 'video' ? (
          <video src={src} controls className="w-full h-full object-contain" />
        ) : (
          <img src={src} alt="Preview" className="w-full h-full object-contain" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Carousel */}
      <div className="overflow-hidden rounded-xl border border-border" ref={emblaRef}>
        <div className="flex">
          {media.map((item, i) => {
            const src = proxyMediaUrl(item.url);
            return (
              <div key={item.url} className="flex-[0_0_100%] min-w-0 aspect-square max-h-[520px] bg-card">
                {item.type === 'video' ? (
                  <video src={src} controls className="w-full h-full object-contain" />
                ) : (
                  <img src={src} alt={`Slide ${i + 1}`} className="w-full h-full object-contain" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation arrows */}
      {canScrollPrev && (
        <button
          onClick={() => emblaApi?.scrollPrev()}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors cursor-pointer"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      {canScrollNext && (
        <button
          onClick={() => emblaApi?.scrollNext()}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors cursor-pointer"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 mt-2">
        {media.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-colors cursor-pointer',
              i === selectedIndex ? 'bg-[#9A48EA]' : 'bg-surface-3'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export { CarouselPreview };
