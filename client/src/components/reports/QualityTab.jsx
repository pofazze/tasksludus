import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ProducerRankingTable from './ProducerRankingTable';
import VolumeTimeSeriesChart from './charts/VolumeTimeSeriesChart';
import RejectionBreakdownChart from './charts/RejectionBreakdownChart';

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function QualityTab({ filters }) {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState([]);
  const [firstApproval, setFirstApproval] = useState([]);
  const [rejectionRate, setRejectionRate] = useState([]);
  const [rework, setRework] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byPostType, setByPostType] = useState([]);
  const [byTarget, setByTarget] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [granularity, setGranularity] = useState('day');

  useEffect(() => {
    if (!filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end, clientId: filters.clientId, producerId: filters.producerId };
    Promise.all([
      reportsApi.ranking(params),
      reportsApi.firstApprovalRate(params),
      reportsApi.rejectionRate(params),
      reportsApi.reworkPerTask(params),
      reportsApi.rejectionByCategory(params),
      reportsApi.rejectionByPostType(params),
      reportsApi.rejectionByTarget(params),
      reportsApi.volumeTimeseries({ ...params, granularity }),
    ]).then(([rRanking, rFirst, rRej, rRew, rCat, rPt, rTar, rTs]) => {
      setRanking(rRanking);
      setFirstApproval(rFirst);
      setRejectionRate(rRej);
      setRework(rRew);
      setByCategory(rCat);
      setByPostType(rPt);
      setByTarget(rTar);
      setTimeseries(rTs);
    }).catch(() => {
      toast.error('Erro ao carregar relatórios');
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.clientId, filters.producerId, granularity]);

  const totalTasks = ranking.reduce((sum, r) => sum + (r.volume || 0), 0);
  const avgFirstApproval = firstApproval.length
    ? firstApproval.reduce((sum, r) => sum + (r.rate || 0), 0) / firstApproval.length
    : null;
  const avgRejection = rejectionRate.length
    ? rejectionRate.reduce((sum, r) => sum + (r.rate || 0), 0) / rejectionRate.length
    : null;
  const avgRework = rework.length
    ? rework.reduce((sum, r) => sum + (r.avgRework || 0), 0) / rework.length
    : null;

  if (loading) return <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Total tasks" value={totalTasks} />
        <KpiCard label="% aprov. 1ª (média)" value={fmtPct(avgFirstApproval)} />
        <KpiCard label="% reprovação (média)" value={fmtPct(avgRejection)} />
        <KpiCard label="Retrabalho médio" value={avgRework !== null ? avgRework.toFixed(2) : '—'} />
      </div>

      <ProducerRankingTable rows={ranking} reworkByProducer={rework} />

      <VolumeTimeSeriesChart data={timeseries} granularity={granularity} onGranularityChange={setGranularity} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RejectionBreakdownChart title="Reprovações por categoria" data={byCategory} labelKey="category" valueKey="count" />
        <RejectionBreakdownChart title="Reprovações por tipo de post" data={byPostType} labelKey="postType" valueKey="rejected" />
      </div>

      <RejectionBreakdownChart title="Reprovações por alvo (capa / vídeo)" data={byTarget} labelKey="target" valueKey="count" />
    </div>
  );
}
