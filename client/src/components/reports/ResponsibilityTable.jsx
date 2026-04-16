const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

const PHASE_LABELS = {
  em_producao_design: 'Produção — Design',
  em_producao_video: 'Produção — Vídeo',
  design: 'Design (fila)',
  edicao_de_video: 'Vídeo (fila)',
  captacao: 'Captação',
  estruturacao: 'Estruturação',
  correcao: 'Correção',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  agendado: 'Agendado',
};

export default function ResponsibilityTable({ rows }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <h3 className="text-sm font-medium text-foreground p-3 border-b border-border">Responsáveis no período</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Produtor</th>
              <th className="text-left p-3">Função</th>
              <th className="text-right p-3">Tasks</th>
              <th className="text-left p-3">Fases</th>
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sem produtores envolvidos no período.</td></tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.producerId} className="border-t border-border">
                <td className="p-3 font-medium">{r.producerName}</td>
                <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
                <td className="p-3 text-right">{r.taskCount}</td>
                <td className="p-3 text-xs">{(r.phases || []).map((p) => PHASE_LABELS[p] || p).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
