import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function PlatformDonut({ title, data, labelMap }) {
  const series = useMemo(() => {
    return Object.entries(data || {})
      .filter(([, v]) => v && v > 0)
      .map(([name, value]) => ({ name, label: labelMap?.[name] || name, value }));
  }, [data, labelMap]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={series} dataKey="value" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {series.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
