import { useEffect, useState } from 'react';
import api from '@/services/api';

export default function ClientSelector({ value, onChange }) {
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data || [])).catch(() => setClients([]));
  }, []);

  const filtered = clients.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));
  const selected = clients.find((c) => c.id === value);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Cliente</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[200px]"
        />
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[220px]"
        >
          <option value="">{selected ? selected.name : 'Selecione...'}</option>
          {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </div>
  );
}
