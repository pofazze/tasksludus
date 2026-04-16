const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

function fmtHours(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function ProducerCapacityTable({ hours, active, overdue }) {
  if (!hours || hours.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  }

  const activeByUser = new Map();
  for (const row of (active || [])) {
    activeByUser.set(row.producerId, (activeByUser.get(row.producerId) || 0) + (row.count || 0));
  }
  const overdueByUser = new Map((overdue || []).map((r) => [r.producerId, r.count]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3">#</th>
            <th className="text-left p-3">Produtor</th>
            <th className="text-left p-3">Função</th>
            <th className="text-right p-3">Horas produzidas</th>
            <th className="text-right p-3">Ativas agora</th>
            <th className="text-right p-3">Em atraso</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((r, i) => (
            <tr key={r.producerId} className="border-t border-border">
              <td className="p-3">{i + 1}</td>
              <td className="p-3 font-medium">{r.producerName}</td>
              <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
              <td className="p-3 text-right">{fmtHours(r.productionSeconds)}</td>
              <td className="p-3 text-right">{activeByUser.get(r.producerId) || 0}</td>
              <td className="p-3 text-right">{overdueByUser.get(r.producerId) || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
