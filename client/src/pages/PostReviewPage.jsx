import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Trash2, Send, Save, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { getScheduledPost, updateScheduledPost, deleteScheduledPost, publishNow } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  draft: 'bg-zinc-500/15 text-zinc-400',
  scheduled: 'bg-amber-500/15 text-amber-400',
  publishing: 'bg-blue-500/15 text-blue-400',
  published: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
};

const STATUS_LABELS = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Erro',
};

const VIDEO_EXT = /\.(mp4|mov|avi|wmv|flv|mkv|webm|m4v)(\?|$)/i;

export default function PostReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role) || user?.producer_type === 'social_media';

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [media, setMedia] = useState([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');

  useEffect(() => {
    loadPost();
  }, [id]);

  async function loadPost() {
    setLoading(true);
    try {
      const { data } = await getScheduledPost(id);
      setPost(data);
      setCaption(data.caption || '');
      setScheduledAt(data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '');
      setThumbnailUrl(data.thumbnail_url || '');
      const m = typeof data.media_urls === 'string' ? JSON.parse(data.media_urls) : (data.media_urls || []);
      setMedia(m);
    } catch {
      toast.error('Erro ao carregar post');
      navigate('/schedule');
    } finally {
      setLoading(false);
    }
  }

  const readOnly = !canManage || ['published', 'publishing'].includes(post?.status);

  function addMedia() {
    const url = newMediaUrl.trim();
    if (!url) return;
    const type = VIDEO_EXT.test(url) ? 'video' : 'image';
    setMedia((m) => [...m, { url, type, order: m.length }]);
    setNewMediaUrl('');
  }

  async function handleSave(asDraft) {
    if (media.length === 0) return toast.error('Adicione pelo menos uma mídia');
    if (!asDraft && !scheduledAt) return toast.error('Defina a data de agendamento');

    setSaving(true);
    try {
      await updateScheduledPost(id, {
        caption,
        scheduled_at: scheduledAt || null,
        thumbnail_url: thumbnailUrl || null,
        media_urls: JSON.stringify(media),
        status: asDraft ? 'draft' : 'scheduled',
      });
      toast.success(asDraft ? 'Rascunho salvo' : 'Post agendado');
      loadPost();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishNow() {
    if (!confirm('Publicar este post agora?')) return;
    setSaving(true);
    try {
      await publishNow(id);
      toast.success('Publicação iniciada');
      loadPost();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao publicar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este post?')) return;
    setDeleting(true);
    try {
      await deleteScheduledPost(id);
      toast.success('Post excluído');
      navigate('/schedule');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!post) return null;

  const formatLabel = CONTENT_TYPE_LABELS[post.delivery_content_type || post.post_type] || post.post_type;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-zinc-100 truncate">
            {post.delivery_title || 'Revisar Post'}
          </h1>
          <p className="text-sm text-zinc-500">{post.client_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[post.status])}>
            {STATUS_LABELS[post.status] || post.status}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400">
            {formatLabel}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {post.error_message && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {post.error_message}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Preview */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500 mb-3 font-medium">Preview</p>
              <CarouselPreview media={media} />
              {caption && (
                <p className="mt-3 text-sm text-zinc-300 line-clamp-4 whitespace-pre-wrap">
                  {caption}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="px-3 pt-3 pb-2">
                <p className="text-[11px] text-zinc-500 mb-0.5">Agendado para</p>
                <p className="text-sm font-medium text-zinc-200">
                  {scheduledAt
                    ? format(new Date(scheduledAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })
                    : 'Não definido'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-3 pt-3 pb-2">
                <p className="text-[11px] text-zinc-500 mb-0.5">Mídias</p>
                <p className="text-sm font-medium text-zinc-200 tabular-nums">{media.length} arquivo(s)</p>
              </CardContent>
            </Card>
          </div>

          {/* External links */}
          <div className="flex gap-2">
            {post.clickup_task_id && (
              <a
                href={`https://app.clickup.com/t/${post.clickup_task_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink size={12} /> ClickUp
              </a>
            )}
            {post.ig_permalink && (
              <a
                href={post.ig_permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink size={12} /> Instagram
              </a>
            )}
          </div>
        </div>

        {/* Right: Edit form */}
        <div className="space-y-5">
          {/* Caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Legenda</Label>
              <span className="text-[11px] text-zinc-500 tabular-nums">{caption.length}/2200</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              rows={6}
              disabled={readOnly}
              className="w-full rounded-lg border border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-zinc-200 resize-none focus:border-[#9A48EA] focus:ring-3 focus:ring-[#9A48EA]/50 outline-none disabled:opacity-50"
              placeholder="Legenda do post..."
            />
          </div>

          {/* Date/time */}
          {!readOnly && (
            <div className="space-y-1.5">
              <Label>Data e Hora</Label>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
            </div>
          )}

          {/* Reel cover */}
          {post.post_type === 'reel' && !readOnly && (
            <div className="space-y-1.5">
              <Label>Capa do Reel</Label>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="URL da capa..."
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className="flex-1"
                />
                {thumbnailUrl && (
                  <div className="w-10 h-14 rounded-md border border-zinc-700 overflow-hidden shrink-0">
                    <img src={thumbnailUrl} alt="Capa" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media */}
          <div className="space-y-1.5">
            <Label>Mídia ({media.length})</Label>
            <SortableMediaGrid
              media={media}
              onChange={setMedia}
              onRemove={(i) => setMedia((m) => m.filter((_, j) => j !== i).map((item, idx) => ({ ...item, order: idx })))}
              readOnly={readOnly}
            />
            {!readOnly && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="URL da mídia..."
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addMedia} disabled={!newMediaUrl.trim()}>
                  Adicionar
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          {!readOnly && (
            <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
              <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                <Save size={14} className="mr-1.5" />
                Rascunho
              </Button>
              <Button variant="outline" onClick={handlePublishNow} disabled={saving}>
                <Send size={14} className="mr-1.5" />
                Publicar Agora
              </Button>
              <Button onClick={() => handleSave(false)} disabled={saving}>
                {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Clock size={14} className="mr-1.5" />}
                Agendar
              </Button>
              <div className="flex-1" />
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
