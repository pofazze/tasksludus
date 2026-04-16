import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export default function TaskListCard({ title, rows }) {
  const [open, setOpen] = useState(false);
  const totalTasks = (rows || []).reduce((sum, r) => sum + (r.count || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="font-medium text-foreground">{title}</span>
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {(rows || []).length === 0 && <p className="text-sm text-muted-foreground">Nada aqui.</p>}
          {(rows || []).map((r) => (
            <div key={r.producerId} className="space-y-1">
              <p className="text-sm font-medium text-foreground">{r.producerName} · {r.count}</p>
              <ul className="space-y-1">
                {(r.tasks || []).map((t, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.clickupUrl && (
                      <a href={t.clickupUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-1">
                        <ExternalLink size={12} /> ClickUp
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
