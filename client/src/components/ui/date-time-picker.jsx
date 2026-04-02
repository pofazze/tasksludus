'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format, setHours, setMinutes } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

function DateTimePicker({ value, onChange, className, disabled }) {
  const [open, setOpen] = React.useState(false);

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
      // Emit as Brasília time (UTC-3) — the app is 100% BR
      const str = format(date, "yyyy-MM-dd'T'HH:mm") + '-03:00';
      onChange(str);
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className={cn('relative', className)}>
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
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
          {/* Calendar overlay - centered */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl p-4 w-[300px]">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            locale={ptBR}
            showOutsideDays
            classNames={{
              root: 'text-sm',
              months: 'flex flex-col',
              month: 'flex flex-col gap-2',
              month_caption: 'flex justify-center items-center px-1 relative',
              caption_label: 'text-sm font-medium text-zinc-200',
              nav: 'flex items-center',
              button_previous: 'absolute left-0 h-6 w-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-colors',
              button_next: 'absolute right-0 h-6 w-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-colors',
              weekdays: 'flex',
              weekday: 'w-9 text-[11px] font-medium text-zinc-500 text-center',
              week: 'flex',
              day: 'w-9 h-9 text-center p-0',
              day_button: 'w-9 h-9 text-sm rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-colors flex items-center justify-center',
              selected: 'bg-[#9A48EA] text-white hover:bg-[#B06AF0]',
              today: 'font-bold text-[#9A48EA]',
              outside: 'text-zinc-700',
              disabled: 'text-zinc-800 cursor-not-allowed',
              chevron: 'w-3.5 h-3.5',
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
        </>
      )}
    </div>
  );
}

export { DateTimePicker };
