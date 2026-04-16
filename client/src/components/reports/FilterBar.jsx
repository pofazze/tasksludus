import { useEffect, useState } from 'react';
import api from '@/services/api';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function FilterBar({ filters, onChange }) {
  const [clients, setClients] = useState([]);
  const [producers, setProducers] = useState([]);

  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data || [])).catch(() => setClients([]));
    api.get('/users').then((r) => setProducers((r.data || []).filter((u) => u.role === 'producer'))).catch(() => setProducers([]));
  }, []);

  useEffect(() => {
    if (!filters.start || !filters.end) onChange({ ...filters, ...defaultRange() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap gap-3 items-end mb-4 p-3 rounded-lg border border-border bg-card">
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">De</label>
        <input
          type="date"
          value={filters.start || ''}
          onChange={(e) => onChange({ ...filters, start: e.target.value })}
          className="px-2 py-1 rounded border border-border bg-background text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Até</label>
        <input
          type="date"
          value={filters.end || ''}
          onChange={(e) => onChange({ ...filters, end: e.target.value })}
          className="px-2 py-1 rounded border border-border bg-background text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Cliente</label>
        <select
          value={filters.clientId || ''}
          onChange={(e) => onChange({ ...filters, clientId: e.target.value || undefined })}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[160px]"
        >
          <option value="">Todos</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Produtor</label>
        <select
          value={filters.producerId || ''}
          onChange={(e) => onChange({ ...filters, producerId: e.target.value || undefined })}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[160px]"
        >
          <option value="">Todos</option>
          {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    </div>
  );
}
