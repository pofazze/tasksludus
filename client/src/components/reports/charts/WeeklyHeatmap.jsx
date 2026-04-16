import { useMemo } from 'react';

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function shade(seconds, maxSeconds) {
  if (!seconds) return 'bg-muted';
  const ratio = Math.min(1, seconds / (maxSeconds || 1));
  if (ratio > 0.8) return 'bg-purple-500';
  if (ratio > 0.6) return 'bg-purple-400';
  if (ratio > 0.4) return 'bg-purple-300';
  if (ratio > 0.2) return 'bg-purple-200';
  return 'bg-purple-100';
}

export default function WeeklyHeatmap({ data, title }) {
  const [grid, maxSeconds] = useMemo(() => {
    const g = new Map();
    let max = 0;
    for (const r of data || []) {
      const key = `${r.dayOfWeek}|${r.hour}`;
      g.set(key, r.seconds);
      if (r.seconds > max) max = r.seconds;
    }
    return [g, max];
  }, [data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title || 'Heatmap semanal (tempo de produção)'}</h3>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-[2px]">
          <div className="flex gap-[2px] pl-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-5 text-[10px] text-muted-foreground text-center">{h}</div>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, dow) => (
            <div key={dow} className="flex gap-[2px] items-center">
              <div className="w-8 text-[10px] text-muted-foreground">{DOW_LABELS[dow]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const seconds = grid.get(`${dow}|${h}`) || 0;
                return (
                  <div
                    key={h}
                    className={`w-5 h-5 rounded ${shade(seconds, maxSeconds)}`}
                    title={`${DOW_LABELS[dow]} ${h}h — ${Math.round(seconds / 60)} min`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
