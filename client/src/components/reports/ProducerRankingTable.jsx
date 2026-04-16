const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function ProducerRankingTable({ rows, reworkByProducer }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;

  const reworkMap = new Map((reworkByProducer || []).map((r) => [r.producerId, r.avgRework]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3">#</th>
            <th className="text-left p-3">Produtor</th>
            <th className="text-left p-3">Função</th>
            <th className="text-right p-3">Volume</th>
            <th className="text-right p-3">Aprov. 1ª</th>
            <th className="text-right p-3">Retrabalho (média)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.producerId} className="border-t border-border">
              <td className="p-3">{i + 1}</td>
              <td className="p-3 font-medium">{r.producerName}</td>
              <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
              <td className="p-3 text-right">{r.volume}</td>
              <td className="p-3 text-right">{fmtPct(r.firstApprovalRate)}</td>
              <td className="p-3 text-right">{reworkMap.has(r.producerId) ? reworkMap.get(r.producerId).toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
