'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const TZ = 'America/Sao_Paulo';

/** Extract year/month/day/hour/minute in BRT from any Date object */
function getBRT(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { year: g('year'), month: g('month'), day: g('day'), hour: g('hour') % 24, minute: g('minute') };
}

/** Build ISO string with -03:00 offset from BRT components */
function brtToISO(year, month, day, hour, minute) {
  const p = (n) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00-03:00`;
}

/** Format a Date for display in BRT */
function fmtBRT(date) {
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DateTimePicker({ value, onChange, className, disabled }) {
  const [open, setOpen] = React.useState(false);

  const dateValue = React.useMemo(() => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d) ? null : d;
  }, [value]);

  const brt = dateValue ? getBRT(dateValue) : null;
  const hour = brt ? brt.hour : 12;
  const minute = brt ? brt.minute : 0;

  // DayPicker works in local tz — we need to give it a Date whose local date matches the BRT date
  const selectedDayForPicker = React.useMemo(() => {
    if (!brt) return undefined;
    // Create a date at noon local time for the BRT calendar date (noon avoids DST edge cases)
    return new Date(brt.year, brt.month - 1, brt.day, 12, 0, 0);
  }, [brt]);

  function handleDaySelect(day) {
    if (!day) return;
    // day is a local Date from DayPicker — extract its local year/month/day
    const iso = brtToISO(day.getFullYear(), day.getMonth() + 1, day.getDate(), hour, minute);
    onChange?.(iso);
  }

  function handleTimeChange(h, m) {
    const b = brt || getBRT(new Date());
    const iso = brtToISO(b.year, b.month, b.day, h, m);
    onChange?.(iso);
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
          'hover:border-slate-400 dark:hover:border-zinc-600 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/50',
          'disabled:pointer-events-none disabled:opacity-50',
          !dateValue && 'text-zinc-500'
        )}
      >
        <CalendarDays size={14} className="text-zinc-500 shrink-0" />
        {dateValue ? fmtBRT(dateValue) : 'Selecionar data e hora'}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
          {/* Calendar overlay - centered */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl p-4 w-[300px]">
          <DayPicker
            mode="single"
            selected={selectedDayForPicker}
            onSelect={handleDaySelect}
            locale={ptBR}
            showOutsideDays
            classNames={{
              root: 'text-sm',
              months: 'flex flex-col',
              month: 'flex flex-col gap-2',
              month_caption: 'flex justify-center items-center px-1 relative',
              caption_label: 'text-sm font-medium text-foreground',
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
              className="h-7 rounded-md border border-border bg-muted px-2 text-sm text-foreground cursor-pointer focus:border-primary outline-none"
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
              className="h-7 rounded-md border border-border bg-muted px-2 text-sm text-foreground cursor-pointer focus:border-primary outline-none"
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
