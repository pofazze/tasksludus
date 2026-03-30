# UI/UX Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform TasksLudus from basic/functional to premium clean dark UI with redesigned scheduling flow, Instagram grid, and app-wide consistency.

**Architecture:** Phase 1 installs dependencies and creates new components (Sheet, DateTimePicker, MediaGrid). Phase 2 redesigns the scheduling flow (quick create sheet + full review page). Phase 3 redesigns the Instagram tab as a visual grid. Phase 4 applies consistent design tokens app-wide. Each phase is independently testable.

**Tech Stack:** React 19, Tailwind v4, shadcn/base-ui, react-day-picker, @dnd-kit/core+sortable, embla-carousel-react, date-fns

---

## Phase 1: Foundation — Dependencies + New Components

### Task 1: Install new dependencies

**Files:**
- Modify: `client/package.json`

**Step 1: Install all new deps at once**

```bash
cd client && npm install react-day-picker date-fns @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities embla-carousel-react
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add react-day-picker, dnd-kit, embla-carousel, date-fns"
```

---

### Task 2: Create Sheet component (right-side drawer)

**Files:**
- Create: `client/src/components/ui/sheet.jsx`

**Step 1: Create the Sheet component using @base-ui/react Dialog primitives**

The Sheet is a Dialog that slides from the right instead of centering. Use the existing Dialog primitives from `@base-ui/react/dialog`.

```jsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function Sheet({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

function SheetTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

function SheetClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

function SheetOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({ className, children, side = 'right', ...props }) {
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        className={cn(
          'fixed z-50 flex flex-col bg-background ring-1 ring-foreground/10 shadow-lg transition-transform duration-200 ease-out outline-none',
          'data-open:animate-in data-closed:animate-out',
          side === 'right' && 'inset-y-0 right-0 w-full sm:max-w-[480px] data-open:slide-in-from-right data-closed:slide-out-to-right',
          side === 'left' && 'inset-y-0 left-0 w-full sm:max-w-[480px] data-open:slide-in-from-left data-closed:slide-out-to-left',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 rounded-md p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X size={16} />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-6 pt-6 pb-4 border-b border-zinc-800', className)} {...props} />
  );
}

function SheetTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title className={cn('text-base font-semibold text-zinc-100', className)} {...props} />
  );
}

function SheetDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-zinc-500', className)} {...props} />
  );
}

function SheetBody({ className, ...props }) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)} {...props} />
  );
}

function SheetFooter({ className, ...props }) {
  return (
    <div className={cn('flex items-center gap-2 justify-end px-6 py-4 border-t border-zinc-800', className)} {...props} />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
};
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/ui/sheet.jsx
git commit -m "feat: add Sheet/Drawer component based on base-ui Dialog"
```

---

### Task 3: Create DateTimePicker component with react-day-picker

**Files:**
- Create: `client/src/components/ui/date-time-picker.jsx`

**Step 1: Create the component**

This combines a react-day-picker calendar inside a popover with hour/minute selects. Uses @base-ui/react Popover if available, otherwise plain state-controlled dropdown.

```jsx
'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format, parse, setHours, setMinutes } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function DateTimePicker({ value, onChange, className, disabled }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // Parse value: "YYYY-MM-DDTHH:mm" string or Date
  const dateValue = React.useMemo(() => {
    if (!value) return null;
    if (value instanceof Date) return value;
    return new Date(value);
  }, [value]);

  const selectedDate = dateValue && !isNaN(dateValue) ? dateValue : null;
  const hour = selectedDate ? selectedDate.getHours() : 12;
  const minute = selectedDate ? selectedDate.getMinutes() : 0;

  function handleDaySelect(day) {
    if (!day) return;
    const next = setMinutes(setHours(day, hour), minute);
    emitChange(next);
  }

  function handleTimeChange(h, m) {
    const base = selectedDate || new Date();
    const next = setMinutes(setHours(base, h), m);
    emitChange(next);
  }

  function emitChange(date) {
    if (onChange) {
      // Emit as "YYYY-MM-DDTHH:mm" string for form compatibility
      const str = format(date, "yyyy-MM-dd'T'HH:mm");
      onChange(str);
    }
  }

  // Close on click outside
  React.useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 h-8 w-full rounded-lg border border-zinc-700 bg-transparent px-2.5 py-1 text-sm transition-colors cursor-pointer',
          'hover:border-zinc-600 focus-visible:border-[#9A48EA] focus-visible:ring-3 focus-visible:ring-[#9A48EA]/50',
          'disabled:pointer-events-none disabled:opacity-50',
          !selectedDate && 'text-zinc-500'
        )}
      >
        <CalendarDays size={14} className="text-zinc-500 shrink-0" />
        {selectedDate
          ? format(selectedDate, "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })
          : 'Selecionar data e hora'
        }
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg p-3 w-[280px]">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            locale={ptBR}
            showOutsideDays
            className="text-sm"
            classNames={{
              months: 'flex flex-col',
              month: 'flex flex-col gap-2',
              caption: 'flex justify-between items-center px-1',
              caption_label: 'text-sm font-medium text-zinc-200',
              nav: 'flex items-center gap-1',
              nav_button: 'h-6 w-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-colors',
              table: 'w-full border-collapse',
              head_row: 'flex',
              head_cell: 'w-9 text-[11px] font-medium text-zinc-500 text-center',
              row: 'flex',
              cell: 'w-9 h-9 text-center p-0',
              day: 'w-9 h-9 text-sm rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-colors flex items-center justify-center',
              day_selected: 'bg-[#9A48EA] text-white hover:bg-[#B06AF0]',
              day_today: 'font-bold text-[#9A48EA]',
              day_outside: 'text-zinc-700',
              day_disabled: 'text-zinc-800 cursor-not-allowed',
            }}
            components={{
              IconLeft: () => <ChevronLeft size={14} />,
              IconRight: () => <ChevronRight size={14} />,
            }}
          />

          {/* Time picker */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">Horário:</span>
            <select
              value={hour}
              onChange={(e) => handleTimeChange(Number(e.target.value), minute)}
              className="h-7 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200 cursor-pointer focus:border-[#9A48EA] outline-none"
            >
              {hours.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>
            <span className="text-zinc-500">:</span>
            <select
              value={minute}
              onChange={(e) => handleTimeChange(hour, Number(e.target.value))}
              className="h-7 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200 cursor-pointer focus:border-[#9A48EA] outline-none"
            >
              {minutes.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export { DateTimePicker };
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/ui/date-time-picker.jsx
git commit -m "feat: add DateTimePicker component with react-day-picker"
```

---

### Task 4: Create SortableMediaGrid component with dnd-kit

**Files:**
- Create: `client/src/components/instagram/SortableMediaGrid.jsx`

**Step 1: Create the drag-and-drop media grid**

```jsx
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
import { cn } from '@/lib/utils';

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
          src={item.url}
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
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/instagram/SortableMediaGrid.jsx
git commit -m "feat: add SortableMediaGrid with dnd-kit drag-and-drop"
```

---

### Task 5: Create CarouselPreview component with embla-carousel

**Files:**
- Create: `client/src/components/instagram/CarouselPreview.jsx`

**Step 1: Create Instagram-style carousel preview**

```jsx
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
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/instagram/CarouselPreview.jsx
git commit -m "feat: add CarouselPreview with embla-carousel"
```

---

## Phase 2: Scheduling Flow Redesign

### Task 6: Replace ScheduledPostForm dialog with Sheet-based quick create

**Files:**
- Modify: `client/src/components/instagram/ScheduledPostForm.jsx`

**Step 1: Rewrite ScheduledPostForm to use Sheet + DateTimePicker + SortableMediaGrid**

Replace the entire file. The new form uses Sheet (slides from right), DateTimePicker (replaces datetime-local), and shows media as grid thumbnails.

```jsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { createScheduledPost, updateScheduledPost } from '@/services/instagram';
import { Image, Film, MessageCircle, Layers, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const POST_TYPES = [
  { value: 'image', label: 'Imagem', icon: Image },
  { value: 'reel', label: 'Reel', icon: Film },
  { value: 'story', label: 'Story', icon: MessageCircle },
  { value: 'carousel', label: 'Carrossel', icon: Layers },
];

const VIDEO_EXT = /\.(mp4|mov|avi|wmv|flv|mkv|webm|m4v)(\?|$)/i;

export default function ScheduledPostForm({ open, onOpenChange, post, clients, onSaved }) {
  const isEdit = !!post?.id;

  const [form, setForm] = useState({
    client_id: '',
    post_type: 'image',
    caption: '',
    media_urls: [],
    thumbnail_url: '',
    scheduled_at: '',
  });
  const [saving, setSaving] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState('');

  useEffect(() => {
    if (open) {
      if (post) {
        const media = typeof post.media_urls === 'string'
          ? JSON.parse(post.media_urls)
          : (post.media_urls || []);
        setForm({
          client_id: post.client_id || '',
          post_type: post.post_type || 'image',
          caption: post.caption || '',
          media_urls: media,
          thumbnail_url: post.thumbnail_url || '',
          scheduled_at: post.scheduled_at
            ? new Date(post.scheduled_at).toISOString().slice(0, 16)
            : '',
        });
      } else {
        setForm({
          client_id: clients?.[0]?.id || '',
          post_type: 'image',
          caption: '',
          media_urls: [],
          thumbnail_url: '',
          scheduled_at: '',
        });
      }
      setNewMediaUrl('');
    }
  }, [open, post, clients]);

  function addMedia() {
    const url = newMediaUrl.trim();
    if (!url) return;
    const type = VIDEO_EXT.test(url) ? 'video' : 'image';
    setForm((f) => ({
      ...f,
      media_urls: [...f.media_urls, { url, type, order: f.media_urls.length }],
    }));
    setNewMediaUrl('');
  }

  function removeMedia(index) {
    setForm((f) => ({
      ...f,
      media_urls: f.media_urls.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })),
    }));
  }

  async function handleSubmit(asDraft) {
    if (!form.client_id) return toast.error('Selecione um cliente');
    if (form.media_urls.length === 0) return toast.error('Adicione pelo menos uma mídia');
    if (!asDraft && !form.scheduled_at) return toast.error('Defina a data de agendamento');

    setSaving(true);
    try {
      const payload = {
        ...form,
        status: asDraft ? 'draft' : 'scheduled',
        media_urls: JSON.stringify(form.media_urls),
      };
      if (isEdit) {
        await updateScheduledPost(post.id, payload);
        toast.success('Post atualizado');
      } else {
        await createScheduledPost(payload);
        toast.success(asDraft ? 'Rascunho salvo' : 'Post agendado');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Post' : 'Novo Post'}</SheetTitle>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-5">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className="h-8 w-full rounded-lg border border-zinc-700 bg-transparent px-2.5 text-sm text-zinc-200 cursor-pointer focus:border-[#9A48EA] outline-none"
              >
                <option value="">Selecionar...</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Post type */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-1.5">
                {POST_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, post_type: value }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                      form.post_type === value
                        ? 'bg-[#9A48EA]/15 text-[#C084FC] ring-1 ring-[#9A48EA]/30'
                        : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
                    )}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Media grid */}
            <div className="space-y-1.5">
              <Label>Mídia ({form.media_urls.length})</Label>
              <SortableMediaGrid
                media={form.media_urls}
                onChange={(m) => setForm((f) => ({ ...f, media_urls: m }))}
                onRemove={removeMedia}
              />
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="URL da mídia..."
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addMedia} disabled={!newMediaUrl.trim()}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Legenda</Label>
                <span className="text-[11px] text-zinc-500 tabular-nums">{form.caption.length}/2200</span>
              </div>
              <textarea
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value.slice(0, 2200) }))}
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-transparent px-2.5 py-2 text-sm text-zinc-200 resize-none focus:border-[#9A48EA] focus:ring-3 focus:ring-[#9A48EA]/50 outline-none"
                placeholder="Escreva a legenda do post..."
              />
            </div>

            {/* Reel thumbnail */}
            {form.post_type === 'reel' && (
              <div className="space-y-1.5">
                <Label>Capa do Reel (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="URL da imagem de capa..."
                    value={form.thumbnail_url}
                    onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                    className="flex-1"
                  />
                  {form.thumbnail_url && (
                    <div className="w-8 h-8 rounded-md border border-zinc-700 overflow-hidden shrink-0">
                      <img src={form.thumbnail_url} alt="Capa" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Date/time */}
            <div className="space-y-1.5">
              <Label>Data e Hora</Label>
              <DateTimePicker
                value={form.scheduled_at}
                onChange={(v) => setForm((f) => ({ ...f, scheduled_at: v }))}
              />
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/instagram/ScheduledPostForm.jsx
git commit -m "feat: redesign ScheduledPostForm as Sheet with DateTimePicker and media grid"
```

---

### Task 7: Create PostReviewPage (full-page two-column review)

**Files:**
- Create: `client/src/pages/PostReviewPage.jsx`
- Modify: `client/src/App.jsx` (add route)

**Step 1: Create the full-page review component**

Two-column layout: left = Instagram-style preview with CarouselPreview, right = edit form with SortableMediaGrid + DateTimePicker.

```jsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Trash2, Send, Save, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { getScheduledPost, updateScheduledPost, deleteScheduledPost, publishNow } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  draft: 'bg-zinc-500/15 text-zinc-400',
  scheduled: 'bg-amber-500/15 text-amber-400',
  publishing: 'bg-blue-500/15 text-blue-400',
  published: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
};

const STATUS_LABELS = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Erro',
};

const VIDEO_EXT = /\.(mp4|mov|avi|wmv|flv|mkv|webm|m4v)(\?|$)/i;

export default function PostReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role) || user?.producer_type === 'social_media';

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [media, setMedia] = useState([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');

  useEffect(() => {
    loadPost();
  }, [id]);

  async function loadPost() {
    setLoading(true);
    try {
      const { data } = await getScheduledPost(id);
      setPost(data);
      setCaption(data.caption || '');
      setScheduledAt(data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '');
      setThumbnailUrl(data.thumbnail_url || '');
      const m = typeof data.media_urls === 'string' ? JSON.parse(data.media_urls) : (data.media_urls || []);
      setMedia(m);
    } catch {
      toast.error('Erro ao carregar post');
      navigate('/schedule');
    } finally {
      setLoading(false);
    }
  }

  const readOnly = !canManage || ['published', 'publishing'].includes(post?.status);

  function addMedia() {
    const url = newMediaUrl.trim();
    if (!url) return;
    const type = VIDEO_EXT.test(url) ? 'video' : 'image';
    setMedia((m) => [...m, { url, type, order: m.length }]);
    setNewMediaUrl('');
  }

  async function handleSave(asDraft) {
    if (media.length === 0) return toast.error('Adicione pelo menos uma mídia');
    if (!asDraft && !scheduledAt) return toast.error('Defina a data de agendamento');

    setSaving(true);
    try {
      await updateScheduledPost(id, {
        caption,
        scheduled_at: scheduledAt || null,
        thumbnail_url: thumbnailUrl || null,
        media_urls: JSON.stringify(media),
        status: asDraft ? 'draft' : 'scheduled',
      });
      toast.success(asDraft ? 'Rascunho salvo' : 'Post agendado');
      loadPost();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishNow() {
    if (!confirm('Publicar este post agora?')) return;
    setSaving(true);
    try {
      await publishNow(id);
      toast.success('Publicação iniciada');
      loadPost();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao publicar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este post?')) return;
    setDeleting(true);
    try {
      await deleteScheduledPost(id);
      toast.success('Post excluído');
      navigate('/schedule');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!post) return null;

  const formatLabel = CONTENT_TYPE_LABELS[post.delivery_content_type || post.post_type] || post.post_type;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-zinc-100 truncate">
            {post.delivery_title || 'Revisar Post'}
          </h1>
          <p className="text-sm text-zinc-500">{post.client_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[post.status])}>
            {STATUS_LABELS[post.status] || post.status}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400">
            {formatLabel}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {post.error_message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {post.error_message}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Preview */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500 mb-3 font-medium">Preview</p>
              <CarouselPreview media={media} />
              {caption && (
                <p className="mt-3 text-sm text-zinc-300 line-clamp-4 whitespace-pre-wrap">
                  {caption}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card size="sm">
              <CardContent className="px-3 pt-3 pb-2">
                <p className="text-[11px] text-zinc-500 mb-0.5">Agendado para</p>
                <p className="text-sm font-medium text-zinc-200">
                  {scheduledAt
                    ? format(new Date(scheduledAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })
                    : 'Não definido'}
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="px-3 pt-3 pb-2">
                <p className="text-[11px] text-zinc-500 mb-0.5">Mídias</p>
                <p className="text-sm font-medium text-zinc-200 tabular-nums">{media.length} arquivo(s)</p>
              </CardContent>
            </Card>
          </div>

          {/* External links */}
          <div className="flex gap-2">
            {post.clickup_task_id && (
              <a
                href={`https://app.clickup.com/t/${post.clickup_task_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink size={12} /> ClickUp
              </a>
            )}
            {post.ig_permalink && (
              <a
                href={post.ig_permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink size={12} /> Instagram
              </a>
            )}
          </div>
        </div>

        {/* Right: Edit form */}
        <div className="space-y-5">
          {/* Caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Legenda</Label>
              <span className="text-[11px] text-zinc-500 tabular-nums">{caption.length}/2200</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              rows={6}
              disabled={readOnly}
              className="w-full rounded-lg border border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-zinc-200 resize-none focus:border-[#9A48EA] focus:ring-3 focus:ring-[#9A48EA]/50 outline-none disabled:opacity-50"
              placeholder="Legenda do post..."
            />
          </div>

          {/* Date/time */}
          {!readOnly && (
            <div className="space-y-1.5">
              <Label>Data e Hora</Label>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
            </div>
          )}

          {/* Reel cover */}
          {post.post_type === 'reel' && !readOnly && (
            <div className="space-y-1.5">
              <Label>Capa do Reel</Label>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="URL da capa..."
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className="flex-1"
                />
                {thumbnailUrl && (
                  <div className="w-10 h-14 rounded-md border border-zinc-700 overflow-hidden shrink-0">
                    <img src={thumbnailUrl} alt="Capa" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media */}
          <div className="space-y-1.5">
            <Label>Mídia ({media.length})</Label>
            <SortableMediaGrid
              media={media}
              onChange={setMedia}
              onRemove={(i) => setMedia((m) => m.filter((_, j) => j !== i).map((item, idx) => ({ ...item, order: idx })))}
              readOnly={readOnly}
            />
            {!readOnly && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="URL da mídia..."
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addMedia} disabled={!newMediaUrl.trim()}>
                  Adicionar
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          {!readOnly && (
            <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
              <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                <Save size={14} className="mr-1.5" />
                Rascunho
              </Button>
              <Button variant="outline" onClick={handlePublishNow} disabled={saving}>
                <Send size={14} className="mr-1.5" />
                Publicar Agora
              </Button>
              <Button onClick={() => handleSave(false)} disabled={saving}>
                {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Clock size={14} className="mr-1.5" />}
                Agendar
              </Button>
              <div className="flex-1" />
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add route to App.jsx**

In `client/src/App.jsx`, add the import and route:

Import (add near other lazy imports):
```javascript
const PostReviewPage = React.lazy(() => import('./pages/PostReviewPage'));
```

Route (add after the `/schedule` route, inside the ALL_INTERNAL group):
```jsx
<Route path="/schedule/:id" element={<ProtectedRoute roles={ALL_INTERNAL}><PostReviewPage /></ProtectedRoute>} />
```

**Step 3: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add client/src/pages/PostReviewPage.jsx client/src/App.jsx
git commit -m "feat: add PostReviewPage with two-column layout and carousel preview"
```

---

### Task 8: Update ScheduleCalendarPage to use new components

**Files:**
- Modify: `client/src/pages/ScheduleCalendarPage.jsx`

**Step 1: Update the page**

Key changes to the existing ScheduleCalendarPage:
1. Clicking a post navigates to `/schedule/:id` instead of opening edit in dialog
2. "Novo Post" opens the Sheet (ScheduledPostForm is now Sheet-based)
3. Calendar cells get slightly larger min-height
4. Day detail panel gets cleaner card styling
5. Replace hardcoded status/type styles with consistent tokens

Find and replace these specific sections:

**1a.** Change the "Edit" click handler in the PostCard section (inside the day detail panel). Find the edit button click that does `setEditingPost(p); setFormOpen(true);` and change it to `navigate(\`/schedule/${p.id}\`)`.

Add `useNavigate` import if not present:
```javascript
import { useNavigate } from 'react-router-dom';
```

And in the component:
```javascript
const navigate = useNavigate();
```

**1b.** Change the edit button in day detail from opening the form to navigating:
```jsx
// Old:
onClick={() => { setEditingPost(p); setFormOpen(true); }}
// New:
onClick={() => navigate(`/schedule/${p.id}`)}
```

**1c.** Change the calendar cell post chips — clicking a post chip navigates to review:
```jsx
// Change post chip click from selecting date to navigating
onClick={(e) => { e.stopPropagation(); navigate(`/schedule/${p.id}`); }}
```

**1d.** Increase calendar cell min-height from `min-h-[80px]` to `min-h-[100px]`.

**1e.** The "Novo Post" button and the form dialog remain — they now open the Sheet automatically since ScheduledPostForm is Sheet-based.

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/ScheduleCalendarPage.jsx
git commit -m "feat: update ScheduleCalendarPage to navigate to review page"
```

---

### Task 9: Update AgendamentoTab to navigate to PostReviewPage

**Files:**
- Modify: `client/src/components/instagram/AgendamentoTab.jsx`

**Step 1: Replace onReviewPost prop with navigation**

Currently AgendamentoTab calls `onReviewPost(post)` which triggers an inline PostReviewView in ClientProfilePage. Change this to navigate to `/schedule/:id` instead.

Add navigation:
```javascript
import { useNavigate } from 'react-router-dom';
```

In the component:
```javascript
const navigate = useNavigate();
```

Change the "Revisar"/"Ver" button in PostCard from:
```jsx
onClick={() => onReview?.()}
```
To:
```jsx
onClick={() => navigate(`/schedule/${post.id}`)}
```

Remove the `onReview` and `onReviewPost` props — they're no longer needed.

**Step 2: Update ClientProfilePage to remove PostReviewView inline usage**

In `client/src/pages/ClientProfilePage.jsx`, find where the `view === 'post-review'` state renders `PostReviewView`. Remove:
- The `selectedPost` state variable
- The `view === 'post-review'` conditional render
- The PostReviewView import
- The onReviewPost callback

Keep the AgendamentoTab render but remove the `onReviewPost` prop.

**Step 3: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add client/src/components/instagram/AgendamentoTab.jsx client/src/pages/ClientProfilePage.jsx
git commit -m "feat: navigate to PostReviewPage from AgendamentoTab"
```

---

## Phase 3: Instagram Tab Visual Grid

### Task 10: Redesign Instagram tab in ClientProfilePage as visual grid

**Files:**
- Modify: `client/src/pages/ClientProfilePage.jsx`

**Step 1: Replace the Instagram tab table with a visual grid**

Find the `{activeTab === 'instagram' && (` section (around line 600). Replace the table with a 3-column grid of post cards.

Replace the table rendering section with:

```jsx
{/* Instagram Posts Grid */}
{igPosts.length > 0 ? (
  <>
    {/* Metrics summary bar */}
    <div className="grid grid-cols-4 gap-3 mb-4">
      {[
        { label: 'Posts', value: igPosts.length },
        { label: 'Impressões', value: igPosts.reduce((s, p) => s + (p.impressions || 0), 0) },
        { label: 'Alcance', value: igPosts.reduce((s, p) => s + (p.reach || 0), 0) },
        { label: 'Engajamento', value: igPosts.reduce((s, p) => s + (p.engagement || 0), 0) },
      ].map(({ label, value }) => (
        <Card key={label} size="sm">
          <CardContent className="px-3 pt-3 pb-2">
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p className="text-base font-semibold text-zinc-100 tabular-nums">
              {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Visual grid */}
    <div className="grid grid-cols-3 gap-1.5">
      {igPosts.map((p) => (
        <a
          key={p.id}
          href={p.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
        >
          {p.media_url ? (
            <img src={p.media_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-700">
              <Image size={24} />
            </div>
          )}
          {/* Type badge */}
          {p.media_type && p.media_type !== 'IMAGE' && (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/60 text-white">
              {p.media_type === 'VIDEO' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : p.media_type}
            </span>
          )}
          {/* Metrics overlay on hover */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-xs">
            {p.impressions != null && (
              <span className="flex items-center gap-1 tabular-nums">
                <Eye size={12} /> {p.impressions >= 1000 ? `${(p.impressions / 1000).toFixed(1)}k` : p.impressions}
              </span>
            )}
            {p.reach != null && (
              <span className="flex items-center gap-1 tabular-nums">
                <Users size={12} /> {p.reach >= 1000 ? `${(p.reach / 1000).toFixed(1)}k` : p.reach}
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  </>
) : (
  <div className="text-center py-12 space-y-3">
    <Instagram size={40} className="mx-auto text-zinc-600" />
    <p className="text-zinc-500">Nenhum post sincronizado</p>
    {canManage && (
      <p className="text-sm text-zinc-500">
        Clique em &quot;Sincronizar Posts&quot; para buscar dados do Instagram.
      </p>
    )}
  </div>
)}
```

Make sure `Eye` and `Users` icons are imported from lucide-react.

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/ClientProfilePage.jsx
git commit -m "feat: redesign Instagram tab as visual grid with hover metrics"
```

---

## Phase 4: App-Wide Design Consistency

### Task 11: Update global CSS tokens and base styles

**Files:**
- Modify: `client/src/index.css`

**Step 1: Adjust CSS variables for cleaner dark theme**

The existing theme is already close to the target. Key adjustments:
- Verify `--background: #09090B` (should already be set)
- Verify `--card: #111114` matches `--bg-elevated: #18181B` — adjust card to `#18181B` for better contrast
- Add `--surface-hover: rgba(255,255,255,0.04)` if not present
- Ensure all border colors use `#27272A` consistently

In the `:root` section, ensure these values (modify only what differs):
```css
--card: oklch(0.14 0.005 285);  /* adjust to be slightly lighter ~#18181B */
```

Add to the body/base layer styles:
```css
* {
  font-feature-settings: 'tnum' var(--tnum, );
}
.tabular-nums {
  --tnum: 'tnum';
}
```

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style: refine global CSS tokens for clean dark theme"
```

---

### Task 12: App-wide card and spacing consistency pass

**Files:**
- Modify: Multiple pages (DashboardPage, DeliveriesPage, ClientsPage, GoalsPage, etc.)

**Step 1: Audit and fix card patterns**

Do a search-and-replace pass across all pages for consistent patterns:

1. All `Card` components should use the default shadcn styling (already `bg-card ring-1 ring-foreground/10 rounded-xl`)
2. Ensure `CardContent` uses consistent padding: `px-4` or `px-5` (not mixed)
3. Tables should have `hover:bg-zinc-800/50` on rows
4. All status badges should use the consistent palette:
   - draft/inactive: `bg-zinc-500/15 text-zinc-400`
   - scheduled/pending: `bg-amber-500/15 text-amber-400`
   - active/publishing: `bg-blue-500/15 text-blue-400`
   - published/success: `bg-emerald-500/15 text-emerald-400`
   - failed/error: `bg-red-500/15 text-red-400`

This is a cleanup pass — don't change functionality, only visual consistency.

**Step 2: Verify build**

```bash
cd client && npx vite build --mode development 2>&1 | tail -5
```
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/ client/src/components/
git commit -m "style: app-wide card and spacing consistency pass"
```

---

## Summary of Changes

| Task | File(s) | Description |
|------|---------|-------------|
| 1 | package.json | Install react-day-picker, dnd-kit, embla-carousel, date-fns |
| 2 | components/ui/sheet.jsx | New Sheet/Drawer component |
| 3 | components/ui/date-time-picker.jsx | New DateTimePicker with react-day-picker |
| 4 | components/instagram/SortableMediaGrid.jsx | New drag-drop media grid |
| 5 | components/instagram/CarouselPreview.jsx | New carousel preview with embla |
| 6 | components/instagram/ScheduledPostForm.jsx | Rewrite as Sheet-based form |
| 7 | pages/PostReviewPage.jsx, App.jsx | New full-page review with two-column layout |
| 8 | pages/ScheduleCalendarPage.jsx | Navigate to review page on post click |
| 9 | components/instagram/AgendamentoTab.jsx, pages/ClientProfilePage.jsx | Navigate to review page, remove inline PostReviewView |
| 10 | pages/ClientProfilePage.jsx | Instagram tab as visual grid |
| 11 | index.css | Refine global CSS tokens |
| 12 | All pages | Consistency pass |

## No Backend Changes

All changes are frontend-only. The existing API endpoints remain unchanged.
