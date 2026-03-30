import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { updateScheduledPost, publishNow } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, ExternalLink, Loader2, Send, Save,
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-zinc-500/15 text-zinc-400' },
  scheduled: { label: 'Agendado', color: 'bg-amber-500/15 text-amber-400' },
  publishing: { label: 'Publicando', color: 'bg-blue-500/15 text-blue-400' },
  published: { label: 'Publicado', color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Erro', color: 'bg-red-500/15 text-red-400' },
};

export default function PostReviewSheet({ post, open, onOpenChange, onUpdated }) {
  const [caption, setCaption] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Reset state when a new post opens
  const postId = post?.id;
  const [lastPostId, setLastPostId] = useState(null);
  if (postId && postId !== lastPostId) {
    setLastPostId(postId);
    setCaption(post.caption || '');
    setScheduling(false);
    setScheduledAt(post.scheduled_at || '');
    setSaving(false);
    setPublishing(false);
  }

  const media = useMemo(() => {
    if (!post) return [];
    const urls = typeof post.media_urls === 'string'
      ? JSON.parse(post.media_urls)
      : (post.media_urls || []);
    return urls.map((url) => ({
      url: typeof url === 'string' ? url : url.url || url,
      type: (typeof url === 'object' && url.type) || 'image',
    }));
  }, [post]);

  const readOnly = post && ['published', 'publishing'].includes(post.status);
  const format = post?.delivery_content_type || post?.post_type;
  const formatLabel = format ? (CONTENT_TYPE_LABELS[format] || format) : null;
  const status = post ? (STATUS_CONFIG[post.status] || STATUS_CONFIG.draft) : null;
  const clickupUrl = post?.clickup_task_id
    ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await updateScheduledPost(post.id, { caption, scheduled_at: null });
      toast.success('Rascunho salvo');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar rascunho');
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      toast.error('Selecione uma data e horário');
      return;
    }
    setSaving(true);
    try {
      await updateScheduledPost(post.id, { caption, scheduled_at: scheduledAt });
      toast.success('Post agendado');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao agendar');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishNow() {
    setPublishing(true);
    try {
      // Save caption first if changed
      if (caption !== (post.caption || '')) {
        await updateScheduledPost(post.id, { caption });
      }
      await publishNow(post.id);
      toast.success('Publicação iniciada');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  }

  if (!post) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{post.delivery_title || 'Revisar Post'}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={status.color + ' text-xs'}>
              {status.label}
            </Badge>
            {formatLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {formatLabel}
              </span>
            )}
            {clickupUrl && (
              <a
                href={clickupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-purple-400 hover:underline flex items-center gap-0.5"
              >
                <ExternalLink size={10} /> ClickUp
              </a>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* Media Preview */}
          <CarouselPreview media={media} className="mb-4" />

          {/* Caption */}
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Legenda
          </label>
          {readOnly ? (
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">{caption || '—'}</p>
          ) : (
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Escreva a legenda do post..."
              className="w-full rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[#9A48EA] focus:ring-1 focus:ring-[#9A48EA]/50 outline-none resize-none"
            />
          )}

          {/* Inline DateTimePicker for scheduling */}
          {scheduling && !readOnly && (
            <div className="mt-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
              <p className="text-sm font-medium text-zinc-300 mb-2">Selecionar data e horário</p>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleSchedule}
                  disabled={saving || !scheduledAt}
                  className="bg-[#9A48EA] hover:bg-[#B06AF0] text-white"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Confirmar Agendamento</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScheduling(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </SheetBody>

        {!readOnly && (
          <SheetFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Salvar Rascunho</span>
            </Button>
            {!scheduling && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScheduling(true)}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Agendar</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublishNow}
                  disabled={publishing}
                  className="bg-[#9A48EA] hover:bg-[#B06AF0] text-white"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Publicar Agora</span>
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
