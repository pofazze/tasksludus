import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function RejectionBreakdownChart({ title, data, labelKey, valueKey }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={labelKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Bar dataKey={valueKey}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
