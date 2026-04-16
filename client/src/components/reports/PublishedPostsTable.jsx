import { ExternalLink, Download } from 'lucide-react';

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const POST_TYPE_LABELS = { reel: 'Reel', image: 'Imagem', feed: 'Feed', carousel: 'Carrossel', carrossel: 'Carrossel', story: 'Story', tiktok_video: 'Vídeo TikTok', tiktok_photo: 'Foto TikTok', yt_shorts: 'YT Shorts', video: 'Vídeo' };

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export default function PublishedPostsTable({ rows, csvHref }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Publicados no período</h3>
        {csvHref && (
          <a
            href={csvHref}
            className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1"
          >
            <Download size={12} /> Exportar CSV
          </a>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Título</th>
              <th className="text-left p-3">Plataforma</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Link</th>
              <th className="text-left p-3">Designer</th>
              <th className="text-left p-3">Editor</th>
              <th className="text-center p-3">Aprov. 1ª</th>
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sem publicações no período.</td></tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.deliveryId + r.platform} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{fmtDate(r.publishedAt)}</td>
                <td className="p-3 max-w-[280px] truncate" title={r.title}>{r.title}</td>
                <td className="p-3">{PLATFORM_LABELS[r.platform] || r.platform}</td>
                <td className="p-3">{POST_TYPE_LABELS[r.postType] || r.postType}</td>
                <td className="p-3">
                  {r.permalink ? (
                    <a href={r.permalink} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-1">
                      <ExternalLink size={12} /> Abrir
                    </a>
                  ) : '—'}
                </td>
                <td className="p-3">{r.producersByPhase?.em_producao_design || r.producersByPhase?.design || '—'}</td>
                <td className="p-3">{r.producersByPhase?.em_producao_video || r.producersByPhase?.edicao_de_video || '—'}</td>
                <td className="p-3 text-center">{r.firstApproval ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
