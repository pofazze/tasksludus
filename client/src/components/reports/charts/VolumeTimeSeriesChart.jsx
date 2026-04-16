import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function VolumeTimeSeriesChart({ data, granularity, onGranularityChange }) {
  const [buckets, producerIds] = useMemo(() => {
    const bucketSet = new Set();
    const idSet = new Set();
    for (const r of data || []) {
      bucketSet.add(r.bucket);
      idSet.add(r.producerId);
    }
    return [[...bucketSet].sort(), [...idSet]];
  }, [data]);

  const series = useMemo(() => {
    return buckets.map((bucket) => {
      const row = { bucket };
      for (const pid of producerIds) {
        const match = (data || []).find((r) => r.bucket === bucket && r.producerId === pid);
        row[pid] = match ? match.count : 0;
      }
      return row;
    });
  }, [buckets, producerIds, data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Volume por período</h3>
        <select
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-xs"
        >
          <option value="day">Dia</option>
          <option value="week">Semana</option>
          <option value="month">Mês</option>
          <option value="year">Ano</option>
        </select>
      </div>
      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            {producerIds.map((pid, i) => (
              <Line key={pid} type="monotone" dataKey={pid} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
