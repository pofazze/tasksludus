'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format, setHours, setMinutes } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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
