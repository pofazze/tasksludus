import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { listScheduledPosts } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calendar, ChevronDown, ChevronRight, Clock, ExternalLink,
  FileText, Image, Loader2, Send,
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-zinc-500/15 text-zinc-400' },
  scheduled: { label: 'Agendado', color: 'bg-amber-500/15 text-amber-400' },
  publishing: { label: 'Publicando', color: 'bg-blue-500/15 text-blue-400' },
  published: { label: 'Publicado', color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Erro', color: 'bg-red-500/15 text-red-400' },
};

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function mediaCount(post) {
  const urls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);
  return urls.length;
}

export default function AgendamentoTab({ clientId, onReviewPost }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishedOpen, setPublishedOpen] = useState(false);

  const fetchPosts = async () => {
    try {
      const data = await listScheduledPosts({ client_id: clientId });
      setPosts(data);
    } catch {
      toast.error('Erro ao carregar posts agendados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [clientId]);

  // Re-fetch when server pushes post events
  const postEvents = useMemo(() => ['post:updated', 'delivery:updated'], []);
  useServerEvent(postEvents, fetchPosts);

  const drafts = useMemo(() => posts.filter((p) => p.status === 'draft'), [posts]);
  const scheduled = useMemo(() => posts.filter((p) => p.status === 'scheduled'), [posts]);
  const published = useMemo(
    () => posts.filter((p) => ['published', 'publishing', 'failed'].includes(p.status)),
    [posts]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Calendar size={40} className="mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Nenhum post para agendar</p>
        <p className="text-sm text-muted-foreground">
          Posts aparecem aqui quando tarefas chegam na fase &quot;Agendamento&quot; no ClickUp.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pendentes (Drafts) */}
      <Section title="Pendentes" count={drafts.length} icon={<FileText size={16} />} defaultOpen>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum rascunho pendente</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => onReviewPost(post)} />
            ))}
          </div>
        )}
      </Section>

      {/* Agendados (Scheduled) */}
      <Section title="Agendados" count={scheduled.length} icon={<Clock size={16} />} defaultOpen>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum post agendado</p>
        ) : (
          <div className="space-y-2">
            {scheduled.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => onReviewPost(post)} />
            ))}
          </div>
        )}
      </Section>

      {/* Publicados (Published) — collapsible */}
      {published.length > 0 && (
        <Section
          title="Publicados"
          count={published.length}
          icon={<Send size={16} />}
          defaultOpen={false}
          open={publishedOpen}
          onToggle={() => setPublishedOpen((o) => !o)}
        >
          <div className="space-y-2">
            {published.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => onReviewPost(post)} readOnly />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Section ────────────────────────────────────────────────

function Section({ title, count, icon, defaultOpen = true, open: controlledOpen, onToggle, children }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const toggle = onToggle || (() => setInternalOpen((o) => !o));

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-2 mb-3 group cursor-pointer"
      >
        {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </button>
      {isOpen && children}
    </div>
  );
}

// ─── PostCard ───────────────────────────────────────────────

function PostCard({ post, onReview, readOnly }) {
  const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const count = mediaCount(post);
  const format = post.delivery_content_type || post.post_type;
  const formatLabel = CONTENT_TYPE_LABELS[format] || format;
  const clickupUrl = post.clickup_task_id ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

  return (
    <Card className="hover:border-zinc-600 transition-colors">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {post.delivery_title || post.caption?.slice(0, 60) || 'Sem título'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className={status.color + ' text-xs'}>
                {status.label}
              </Badge>
              {formatLabel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {formatLabel}
                </span>
              )}
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Image size={10} /> {count}
                </span>
              )}
              {post.scheduled_at && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock size={10} /> {fmtDateTime(post.scheduled_at)}
                </span>
              )}
              {clickupUrl && (
                <a
                  href={clickupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-purple-400 hover:underline flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} /> ClickUp
                </a>
              )}
            </div>
          </div>

          {/* Action */}
          <Button variant="outline" size="sm" onClick={onReview}>
            {readOnly ? 'Ver' : 'Revisar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
