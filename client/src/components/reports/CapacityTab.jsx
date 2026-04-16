import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ProducerCapacityTable from './ProducerCapacityTable';
import TaskListCard from './TaskListCard';
import PhaseDistributionChart from './charts/PhaseDistributionChart';
import WorkTimeSeriesChart from './charts/WorkTimeSeriesChart';
import WeeklyHeatmap from './charts/WeeklyHeatmap';

function fmtHours(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function CapacityTab({ filters }) {
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState([]);
  const [active, setActive] = useState([]);
  const [overdueRows, setOverdueRows] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [granularity, setGranularity] = useState('day');
  const [heatmapProducerId, setHeatmapProducerId] = useState('');

  useEffect(() => {
    if (!filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end, clientId: filters.clientId, producerId: filters.producerId };
    Promise.all([
      reportsApi.totalHours(params),
      reportsApi.activeTasks(params),
      reportsApi.overdue(params),
      reportsApi.phaseDistribution(params),
      reportsApi.avgWorkTimeseries({ ...params, granularity }),
      reportsApi.weeklyHeatmap({ ...params, producerId: heatmapProducerId || params.producerId }),
    ]).then(([h, a, o, d, ts, hm]) => {
      setHours(h); setActive(a); setOverdueRows(o); setDistribution(d); setTimeseries(ts); setHeatmap(hm);
    }).catch(() => {
      toast.error('Erro ao carregar relatórios de capacidade');
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.clientId, filters.producerId, granularity, heatmapProducerId]);

  const producerNameMap = useMemo(() => {
    const m = new Map();
    for (const r of hours) m.set(r.producerId, r.producerName);
    return m;
  }, [hours]);

  const totalSeconds = hours.reduce((sum, r) => sum + (r.productionSeconds || 0), 0);
  const activeCount = active.reduce((sum, r) => sum + (r.count || 0), 0);
  const overdueCount = overdueRows.reduce((sum, r) => sum + (r.count || 0), 0);
  const days = filters.start && filters.end
    ? Math.max(1, Math.ceil((new Date(filters.end).getTime() - new Date(filters.start).getTime()) / (24 * 60 * 60 * 1000)))
    : 1;
  const avgSecondsPerDay = Math.round(totalSeconds / days);

  if (loading) return <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Total de horas (período)" value={fmtHours(totalSeconds)} />
        <KpiCard label="Tarefas ativas" value={activeCount} />
        <KpiCard label="Em atraso" value={overdueCount} />
        <KpiCard label="Horas/dia (média)" value={fmtHours(avgSecondsPerDay)} />
      </div>

      <ProducerCapacityTable hours={hours} active={active} overdue={overdueRows} />

      <PhaseDistributionChart data={distribution} producerNameMap={producerNameMap} />

      <WorkTimeSeriesChart
        data={timeseries}
        granularity={granularity}
        onGranularityChange={setGranularity}
        producerNameMap={producerNameMap}
      />

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Heatmap do produtor:</label>
        <select
          value={heatmapProducerId}
          onChange={(e) => setHeatmapProducerId(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-xs"
        >
          <option value="">Todos</option>
          {hours.map((r) => <option key={r.producerId} value={r.producerId}>{r.producerName}</option>)}
        </select>
      </div>

      <WeeklyHeatmap data={heatmap} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TaskListCard title="Ativas agora" rows={active} />
        <TaskListCard title="Em atraso" rows={overdueRows} />
      </div>
    </div>
  );
}
