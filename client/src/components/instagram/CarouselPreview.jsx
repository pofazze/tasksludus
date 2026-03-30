'use client';

import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      <div className={cn('aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600', className)}>
        Sem mídia
      </div>
    );
  }

  // Single image — no carousel needed
  if (media.length === 1) {
    const item = media[0];
    return (
      <div className={cn('aspect-square rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden', className)}>
        {item.type === 'video' ? (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={40} className="text-zinc-600" />
          </div>
        ) : (
          <img src={item.url} alt="Preview" className="w-full h-full object-cover" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Carousel */}
      <div className="overflow-hidden rounded-xl border border-zinc-800" ref={emblaRef}>
        <div className="flex">
          {media.map((item, i) => (
            <div key={item.url} className="flex-[0_0_100%] min-w-0 aspect-square bg-zinc-900">
              {item.type === 'video' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Film size={40} className="text-zinc-600" />
                </div>
              ) : (
                <img src={item.url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
              )}
            </div>
          ))}
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
              i === selectedIndex ? 'bg-[#9A48EA]' : 'bg-zinc-700'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export { CarouselPreview };
