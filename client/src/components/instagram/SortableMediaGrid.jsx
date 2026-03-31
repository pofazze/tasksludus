'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical, Film, Image as ImageIcon } from 'lucide-react';
import { cn, proxyMediaUrl } from '@/lib/utils';

function SortableItem({ item, index, onRemove, readOnly }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.url, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isVideo = item.type === 'video';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group aspect-square rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900',
        isDragging && 'z-10 opacity-70 ring-2 ring-[#9A48EA]',
      )}
    >
      {/* Order badge */}
      <span className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-black/70 text-[10px] font-medium text-zinc-300 tabular-nums">
        {index + 1}
      </span>

      {/* Drag handle */}
      {!readOnly && (
        <button
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded-md bg-black/70 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
      )}

      {/* Remove button */}
      {!readOnly && onRemove && (
        <button
          onClick={() => onRemove(index)}
          className="absolute bottom-1.5 right-1.5 z-10 p-1 rounded-md bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-red-300"
        >
          <X size={12} />
        </button>
      )}

      {/* Media preview */}
      {isVideo ? (
        <div className="w-full h-full flex items-center justify-center bg-zinc-900">
          <Film size={24} className="text-zinc-600" />
        </div>
      ) : (
        <img
          src={proxyMediaUrl(item.url)}
          alt={`Mídia ${index + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
            const icon = document.createElement('div');
            icon.innerHTML = '?';
            e.target.parentElement.appendChild(icon);
          }}
        />
      )}

      {/* Type badge */}
      <span className={cn(
        'absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium',
        isVideo ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700/80 text-zinc-400'
      )}>
        {isVideo ? 'Vídeo' : 'Imagem'}
      </span>
    </div>
  );
}

function SortableMediaGrid({ media, onChange, onRemove, readOnly = false, className }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = media.findIndex((m) => m.url === active.id);
      const newIndex = media.findIndex((m) => m.url === over.id);
      const reordered = arrayMove(media, oldIndex, newIndex).map((m, i) => ({
        ...m,
        order: i,
      }));
      onChange(reordered);
    }
  }

  if (!media || media.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-zinc-700 text-zinc-500 text-sm">
        Nenhuma mídia adicionada
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={media.map((m) => m.url)} strategy={rectSortingStrategy}>
        <div className={cn('grid grid-cols-3 gap-2', className)}>
          {media.map((item, index) => (
            <SortableItem
              key={item.url}
              item={item}
              index={index}
              onRemove={onRemove}
              readOnly={readOnly}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export { SortableMediaGrid };
