import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { updateScheduledPost, publishNow } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { proxyMediaUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown, ArrowLeft, ArrowUp, Calendar, CheckCircle, Clock, ExternalLink,
  Image, Loader2, Send, Trash2, Video, XCircle,
} from 'lucide-react';

function parseMedia(post) {
  if (!post) return [];
  return typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);
}

function formatDateTimeLocal(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function PostReviewView({ post, clientName, onBack, onSaved }) {
  const isPublished = ['published', 'publishing'].includes(post.status);
  const readOnly = isPublished;

  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [media, setMedia] = useState([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [coverConfirmed, setCoverConfirmed] = useState(false);

  useEffect(() => {
    setCaption(post.caption || '');
    setScheduledAt(formatDateTimeLocal(post.scheduled_at));
    setThumbnailUrl(post.thumbnail_url || '');
    setMedia(parseMedia(post));
    setCoverConfirmed(!post.thumbnail_url);
  }, [post]);

  const format = post.delivery_content_type || post.post_type;
  const formatLabel = CONTENT_TYPE_LABELS[format] || format;
  const isReel = post.post_type === 'reel' || format === 'reel';
  const clickupUrl = post.clickup_task_id ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

  const moveMedia = (index, direction) => {
    const next = [...media];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next.map((m, i) => ({ ...m, order: i })));
  };

  const removeMedia = (index) => {
    setMedia((m) => m.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i })));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await updateScheduledPost(post.id, {
        caption,
        media_urls: media,
        thumbnail_url: isReel ? (thumbnailUrl || null) : null,
        scheduled_at: null,
      });
      toast.success('Rascunho salvo');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (isReel && thumbnailUrl && !coverConfirmed) return toast.error('Confirme a capa do Reel antes de agendar');
    if (!scheduledAt) return toast.error('Defina data e hora para agendar');
    const dt = new Date(scheduledAt);
    if (dt <= new Date()) return toast.error('A data deve ser no futuro');

    setSaving(true);
    try {
      await updateScheduledPost(post.id, {
        caption,
        media_urls: media,
        thumbnail_url: isReel ? (thumbnailUrl || null) : null,
        scheduled_at: dt.toISOString(),
      });
      toast.success('Post agendado');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao agendar');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async () => {
    if (isReel && thumbnailUrl && !coverConfirmed) return toast.error('Confirme a capa do Reel antes de publicar');
    if (!confirm('Publicar este post agora?')) return;
    setPublishing(true);
    try {
      await updateScheduledPost(post.id, { caption, media_urls: media, thumbnail_url: isReel ? (thumbnailUrl || null) : null });
      await publishNow(post.id);
      toast.success('Publicação iniciada');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold font-display truncate">
            {post.delivery_title || 'Revisar Post'}
          </h1>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        {formatLabel && (
          <Badge variant="secondary">{formatLabel}</Badge>
        )}
        <Badge variant="secondary" className={
          post.status === 'draft' ? 'bg-zinc-500/15 text-zinc-400' :
          post.status === 'scheduled' ? 'bg-amber-500/15 text-amber-400' :
          post.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' :
          post.status === 'failed' ? 'bg-red-500/15 text-red-400' :
          'bg-blue-500/15 text-blue-400'
        }>
          {post.status === 'draft' ? 'Rascunho' :
           post.status === 'scheduled' ? 'Agendado' :
           post.status === 'published' ? 'Publicado' :
           post.status === 'failed' ? 'Erro' :
           'Publicando'}
        </Badge>
        {clickupUrl && (
          <a
            href={clickupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-purple-400 hover:underline"
          >
            Abrir no ClickUp <ExternalLink size={12} />
          </a>
        )}
        {post.ig_permalink && (
          <a
            href={post.ig_permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-pink-400 hover:underline"
          >
            Ver no Instagram <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Error message */}
      {post.error_message && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 mb-6">
          {post.error_message}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Agendado para</p>
            <p className="text-sm font-medium mt-1">{post.scheduled_at ? fmtDateTime(post.scheduled_at) : 'Não definido'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Image size={12} /> Mídias</p>
            <p className="text-sm font-medium mt-1">{media.length} arquivo{media.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={12} /> Criado em</p>
            <p className="text-sm font-medium mt-1">{fmtDateTime(post.created_at)}</p>
          </CardContent>
        </Card>
        {post.published_at && (
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Send size={12} /> Publicado em</p>
              <p className="text-sm font-medium mt-1">{fmtDateTime(post.published_at)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Caption */}
      <div className="space-y-1.5 mb-6">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Legenda</Label>
          <span className={`text-xs ${caption.length > 2200 ? 'text-red-400' : 'text-muted-foreground'}`}>
            {caption.length}/2200
          </span>
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={6}
          maxLength={2200}
          readOnly={readOnly}
          placeholder="Legenda do post..."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-50"
          disabled={readOnly}
        />
      </div>

      {/* Date/Time */}
      {!readOnly && (
        <div className="space-y-1.5 mb-6">
          <Label className="text-sm font-semibold">Data e Hora</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="max-w-xs"
          />
        </div>
      )}

      {/* Cover Image (Reels only) */}
      {isReel && (
        <div className="space-y-1.5 mb-6">
          <Label className="text-sm font-semibold">Capa do Reel</Label>
          {readOnly ? (
            thumbnailUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={proxyMediaUrl(thumbnailUrl)}
                  alt="Capa"
                  className="w-16 h-28 rounded object-cover border border-zinc-700"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-muted-foreground truncate">{thumbnailUrl}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma capa definida</p>
            )
          ) : thumbnailUrl ? (
            <div className={`rounded-lg border p-4 ${coverConfirmed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex gap-4">
                <img
                  src={proxyMediaUrl(thumbnailUrl)}
                  alt="Capa"
                  className="w-24 h-[170px] rounded-lg object-cover border border-zinc-700 shrink-0"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0 space-y-3">
                  {coverConfirmed ? (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle size={16} />
                      <span className="text-sm font-medium">Capa confirmada</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-400">
                      <Image size={16} />
                      <span className="text-sm font-medium">Confirme a capa do Reel</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {coverConfirmed
                      ? 'Esta imagem sera usada como capa na aba de Reels do Instagram.'
                      : 'Uma imagem foi detectada nos anexos. Confirme se ela deve ser usada como capa deste Reel.'}
                  </p>
                  <div className="flex gap-2">
                    {!coverConfirmed ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => setCoverConfirmed(true)}
                        >
                          <CheckCircle size={14} className="mr-1.5" />
                          Sim, usar como capa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                          onClick={() => { setThumbnailUrl(''); setCoverConfirmed(true); }}
                        >
                          <XCircle size={14} className="mr-1.5" />
                          Nao usar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-400"
                        onClick={() => { setThumbnailUrl(''); setCoverConfirmed(true); }}
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        Remover capa
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Input
                value={thumbnailUrl}
                onChange={(e) => { setThumbnailUrl(e.target.value); setCoverConfirmed(false); }}
                placeholder="URL da imagem de capa (opcional)"
              />
            </>
          )}
        </div>
      )}

      {/* Media */}
      <div className="mb-8">
        <Label className="text-sm font-semibold">Mídia ({media.length})</Label>
        {media.length > 0 ? (
          <div className="space-y-2 mt-2">
            {media.map((m, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                {/* Thumbnail */}
                {m.type === 'video' ? (
                  <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                    <Video size={20} className="text-blue-400" />
                  </div>
                ) : m.url ? (
                  <img
                    src={proxyMediaUrl(m.url)}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                    onError={(e) => { e.target.outerHTML = '<div class="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center shrink-0"><svg class="text-zinc-500" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>'; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                    <Image size={20} className="text-zinc-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{m.url || 'Sem URL'}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {m.type === 'video' ? 'Vídeo' : 'Imagem'}
                  </Badge>
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveMedia(i, -1)}
                      disabled={i === 0}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveMedia(i, 1)}
                      disabled={i === media.length - 1}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-red-400"
                      onClick={() => removeMedia(i)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Nenhuma mídia adicionada</p>
        )}
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
          >
            Salvar Rascunho
          </Button>
          <Button
            variant="outline"
            onClick={handlePublishNow}
            disabled={saving || publishing}
          >
            {publishing && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Publicar Agora
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={saving || publishing}
          >
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </div>
      )}
    </div>
  );
}
