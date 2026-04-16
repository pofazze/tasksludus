import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ClientSelector from './ClientSelector';
import PlatformDonut from './charts/PlatformDonut';
import RejectionBreakdownChart from './charts/RejectionBreakdownChart';
import PublishedPostsTable from './PublishedPostsTable';
import ResponsibilityTable from './ResponsibilityTable';

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const POST_TYPE_LABELS = { reel: 'Reel', image: 'Imagem', feed: 'Feed', carousel: 'Carrossel', carrossel: 'Carrossel', story: 'Story', tiktok_video: 'Vídeo TikTok', tiktok_photo: 'Foto TikTok', yt_shorts: 'YT Shorts', video: 'Vídeo', outro: 'Outro' };

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function ClientTab({ filters }) {
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState([]);
  const [firstApproval, setFirstApproval] = useState(null);
  const [rejections, setRejections] = useState(null);
  const [cycleTime, setCycleTime] = useState(null);
  const [responsibility, setResponsibility] = useState([]);

  useEffect(() => {
    if (!clientId || !filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end };
    Promise.all([
      reportsApi.clientSummary(clientId, params),
      reportsApi.publishedList(clientId, params),
      reportsApi.clientFirstApprovalRate(clientId, params),
      reportsApi.clientRejectionVolume(clientId, params),
      reportsApi.clientAvgCycleTime(clientId, params),
      reportsApi.clientResponsibilityHistory(clientId, params),
    ]).then(([s, l, fa, rej, ct, resp]) => {
      setSummary(s); setList(l); setFirstApproval(fa); setRejections(rej); setCycleTime(ct); setResponsibility(resp);
    }).catch(() => {
      toast.error('Erro ao carregar relatório do cliente');
    }).finally(() => setLoading(false));
  }, [clientId, filters.start, filters.end]);

  const csvHref = clientId && filters.start && filters.end
    ? reportsApi.publishedListCsvUrl(clientId, { start: filters.start, end: filters.end })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end p-3 rounded-lg border border-border bg-card">
        <ClientSelector value={clientId} onChange={setClientId} />
      </div>

      {!clientId && (
        <p className="text-sm text-muted-foreground py-12 text-center">Selecione um cliente pra começar.</p>
      )}

      {clientId && loading && (
        <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
      )}

      {clientId && !loading && (
        <>
          <div className="flex flex-wrap gap-3">
            <KpiCard label="Total publicado" value={summary?.totalPublished ?? 0} />
            <KpiCard label="% aprov. 1ª" value={fmtPct(firstApproval?.rate)} />
            <KpiCard label="Reprovações" value={rejections?.total ?? 0} />
            <KpiCard label="Ciclo médio (dias)" value={cycleTime?.avgDaysStartToPublish ?? '—'} subtitle={cycleTime?.medianDays !== undefined ? `Mediana: ${cycleTime.medianDays}` : null} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlatformDonut title="Por plataforma" data={summary?.byPlatform} labelMap={PLATFORM_LABELS} />
            <PlatformDonut title="Por tipo de post" data={summary?.byPostType} labelMap={POST_TYPE_LABELS} />
          </div>

          <PublishedPostsTable rows={list} csvHref={csvHref} />

          <ResponsibilityTable rows={responsibility} />

          <RejectionBreakdownChart title="Reprovações por categoria" data={rejections?.byCategory || []} labelKey="category" valueKey="count" />
        </>
      )}
    </div>
  );
}
