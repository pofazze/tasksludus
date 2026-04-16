import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PHASE_COLORS = {
  em_producao_design: '#A855F7',
  em_producao_video: '#6366F1',
  correcao: '#EF4444',
  aprovacao: '#EC4899',
  agendamento: '#F59E0B',
  design: '#3B82F6',
  edicao_de_video: '#8B5CF6',
  captacao: '#06B6D4',
  estruturacao: '#EAB308',
  planejamento: '#64748B',
};

const PHASE_LABELS = {
  em_producao_design: 'Em Produção - Design',
  em_producao_video: 'Em Produção - Vídeo',
  correcao: 'Correção',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  design: 'Design',
  edicao_de_video: 'Edição de Vídeo',
  captacao: 'Captação',
  estruturacao: 'Estruturação',
  planejamento: 'Planejamento',
};

export default function PhaseDistributionChart({ data, producerNameMap }) {
  const [rows, phases] = useMemo(() => {
    const byProducer = new Map();
    const phaseSet = new Set();
    for (const r of data || []) {
      phaseSet.add(r.phase);
      if (!byProducer.has(r.producerId)) {
        byProducer.set(r.producerId, { producerId: r.producerId, producerName: producerNameMap?.get(r.producerId) || r.producerId });
      }
      byProducer.get(r.producerId)[r.phase] = r.count;
    }
    return [[...byProducer.values()], [...phaseSet]];
  }, [data, producerNameMap]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Distribuição de fases</h3>
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">Distribuição de fases</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="producerName" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend formatter={(value) => PHASE_LABELS[value] || value} />
          {phases.map((p) => (
            <Bar key={p} dataKey={p} stackId="a" fill={PHASE_COLORS[p] || '#9CA3AF'} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
