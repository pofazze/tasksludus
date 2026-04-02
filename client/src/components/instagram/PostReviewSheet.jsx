import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { updateScheduledPost, publishNow, uploadMedia } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { proxyMediaUrl } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import MediaPreviewPopover from '@/components/instagram/MediaPreviewPopover';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, ArrowDown, ArrowUp, Calendar, CheckCircle, ExternalLink,
  Image, Loader2, Plus, Send, Save, Trash2, Upload, Video, XCircle,
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-zinc-500/15 text-zinc-400' },
  scheduled: { label: 'Agendado', color: 'bg-amber-500/15 text-amber-400' },
  publishing: { label: 'Publicando', color: 'bg-blue-500/15 text-blue-400' },
  published: { label: 'Publicado', color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Erro', color: 'bg-red-500/15 text-red-400' },
};

const POST_TYPE_OPTIONS = [
  { value: 'reel', label: 'Reel' },
  { value: 'image', label: 'Feed' },
  { value: 'story', label: 'Story' },
  { value: 'carousel', label: 'Carrossel' },
];

function extractFilename(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split('/').pop() || '';
    return decodeURIComponent(name).replace(/\?.*$/, '');
  } catch {
    return url.split('/').pop()?.split('?')[0] || 'mídia';
  }
}

function parseMedia(post) {
  if (!post) return [];
  const urls = typeof post.media_urls === 'string'
    ? JSON.parse(post.media_urls)
    : (post.media_urls || []);
  return urls.map((url) => ({
    url: typeof url === 'string' ? url : url.url || url,
    type: (typeof url === 'object' && url.type) || 'image',
    order: typeof url === 'object' ? url.order : undefined,
  }));
}

export default function PostReviewSheet({ post, open, onOpenChange, onUpdated }) {
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [media, setMedia] = useState([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [coverConfirmed, setCoverConfirmed] = useState(false);
  const [selectedPostType, setSelectedPostType] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [previewAnchor, setPreviewAnchor] = useState(null);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const fileInputRef = useRef(null);

  // Reset state when a new post opens
  const postId = post?.id;
  const [lastPostId, setLastPostId] = useState(null);
  if (postId && postId !== lastPostId) {
    setLastPostId(postId);
    setCaption(post.caption || '');
    setScheduledAt(post.scheduled_at || '');
    setSaving(false);
    setPublishing(false);
    setMedia(parseMedia(post));
    setThumbnailUrl(post.thumbnail_url || '');
    setCoverConfirmed(!post.thumbnail_url);
    setSelectedPostType(post.post_type || null);
  }

  const readOnly = post && ['published', 'publishing'].includes(post.status);
  const format = post?.delivery_content_type || post?.post_type;
  const effectivePostType = selectedPostType || post?.post_type;
  const formatLabel = format ? (CONTENT_TYPE_LABELS[format] || format) : null;
  const status = post ? (STATUS_CONFIG[post.status] || STATUS_CONFIG.draft) : null;
  const isReel = effectivePostType === 'reel' || format === 'reel';
  const hasFormat = !!effectivePostType;
  const clickupUrl = post?.clickup_task_id
    ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

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

  function addMediaFromUrl(url) {
    const isVideo = /\.(mp4|mov|avi|webm)(\?|$)/i.test(url);
    setMedia((prev) => [...prev, { url, type: isVideo ? 'video' : 'image', order: prev.length }]);
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { url, type } = await uploadMedia(file);
        setMedia((prev) => [...prev, { url, type, order: prev.length }]);
      } catch {
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
    e.target.value = '';
  }

  function buildPayload(extra = {}) {
    return {
      caption,
      media_urls: media,
      thumbnail_url: isReel ? (thumbnailUrl || null) : null,
      post_type: effectivePostType,
      ...extra,
    };
  }

  async function handleSaveDraft() {
    if (!hasFormat) {
      return toast.error('Selecione o formato do post');
    }
    setSaving(true);
    try {
      await updateScheduledPost(post.id, buildPayload({ scheduled_at: null }));
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
    if (!hasFormat) {
      return toast.error('Selecione o formato antes de agendar');
    }
    if (isReel && thumbnailUrl && !coverConfirmed) {
      return toast.error('Confirme a capa do Reel antes de agendar');
    }
    if (!scheduledAt) {
      return toast.error('Selecione uma data e horário');
    }
    setSaving(true);
    try {
      await updateScheduledPost(post.id, buildPayload({ scheduled_at: scheduledAt }));
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
    if (!hasFormat) {
      return toast.error('Selecione o formato antes de publicar');
    }
    if (isReel && thumbnailUrl && !coverConfirmed) {
      return toast.error('Confirme a capa do Reel antes de publicar');
    }
    setPublishing(true);
    try {
      await updateScheduledPost(post.id, buildPayload());
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
            {formatLabel ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {formatLabel}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                Não definido
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
          {post.error_message && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 mt-2">
              {post.error_message}
            </div>
          )}
        </SheetHeader>

        <SheetBody>
          {/* Format selector — required when post_type is not set */}
          {!readOnly && !hasFormat && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-amber-400 mb-2">
                <AlertTriangle size={14} />
                <span className="text-xs font-medium">Formato obrigatório</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2.5">
                Selecione o formato para poder agendar ou publicar.
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {POST_TYPE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setSelectedPostType(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Format badge when selected inline (not from ClickUp) */}
          {!readOnly && hasFormat && !format && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400">Formato:</span>
              <Badge variant="secondary" className="text-[10px]">
                {POST_TYPE_OPTIONS.find((o) => o.value === effectivePostType)?.label || effectivePostType}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] text-zinc-500 px-1.5"
                onClick={() => setSelectedPostType(null)}
              >
                Alterar
              </Button>
            </div>
          )}

          {/* Media Preview */}
          <CarouselPreview media={media} className="mb-4" />

          {/* Reel Cover */}
          {isReel && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Capa do Reel
              </label>
              {readOnly ? (
                thumbnailUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={proxyMediaUrl(thumbnailUrl)}
                      alt="Capa"
                      className="w-12 h-20 rounded object-cover border border-zinc-700"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span className="text-xs text-muted-foreground">Capa definida</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma capa definida</p>
                )
              ) : thumbnailUrl ? (
                <div className={`rounded-lg border p-3 ${coverConfirmed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex gap-3">
                    <img
                      src={proxyMediaUrl(thumbnailUrl)}
                      alt="Capa"
                      className="w-16 h-28 rounded-lg object-cover border border-zinc-700 shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      {coverConfirmed ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle size={14} />
                          <span className="text-xs font-medium">Capa confirmada</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <Image size={14} />
                          <span className="text-xs font-medium">Confirme a capa do Reel</span>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {coverConfirmed
                          ? 'Será usada como capa na aba de Reels.'
                          : 'Imagem detectada nos anexos. Confirme se deve ser a capa.'}
                      </p>
                      <div className="flex gap-1.5">
                        {!coverConfirmed ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => setCoverConfirmed(true)}
                            >
                              <CheckCircle size={12} className="mr-1" />
                              Usar capa
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                              onClick={() => { setThumbnailUrl(''); setCoverConfirmed(true); }}
                            >
                              <XCircle size={12} className="mr-1" />
                              Não usar
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-zinc-400"
                            onClick={() => { setThumbnailUrl(''); setCoverConfirmed(true); }}
                          >
                            <Trash2 size={12} className="mr-1" />
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma capa detectada</p>
              )}
            </div>
          )}

          {/* Media List (Attachments) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Mídia ({media.length})
            </label>
            {media.length > 0 ? (
              <div className="space-y-1.5">
                {media.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                    {m.type === 'video' ? (
                      <div
                        className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPreviewAnchor({ top: rect.top, sheetWidth: window.innerWidth - rect.left + 20 });
                          setPreviewMedia({ url: m.url, type: m.type, name: extractFilename(m.url) });
                        }}
                      >
                        <Video size={20} className="text-blue-400" />
                      </div>
                    ) : m.url ? (
                      <img
                        src={proxyMediaUrl(m.url)}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPreviewAnchor({ top: rect.top, sheetWidth: window.innerWidth - rect.left + 20 });
                          setPreviewMedia({ url: m.url, type: m.type, name: extractFilename(m.url) });
                        }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                        <Image size={20} className="text-zinc-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Badge variant="secondary" className="text-[10px]">
                        {m.type === 'video' ? 'Vídeo' : 'Imagem'}
                      </Badge>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {extractFilename(m.url)}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveMedia(i, -1)}
                          disabled={i === 0}
                        >
                          <ArrowUp size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveMedia(i, 1)}
                          disabled={i === media.length - 1}
                        >
                          <ArrowDown size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-500 hover:text-red-400"
                          onClick={() => removeMedia(i)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma mídia</p>
            )}

            {/* Add Media */}
            {!readOnly && (
              <div className="mt-2 flex gap-2">
                <div className="flex-1 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Colar URL de mídia..."
                    value={newMediaUrl}
                    onChange={(e) => setNewMediaUrl(e.target.value)}
                    className="flex-1 h-8 rounded-lg border border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-[#9A48EA] outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newMediaUrl.trim()) {
                        addMediaFromUrl(newMediaUrl.trim());
                        setNewMediaUrl('');
                      }
                    }}
                  />
                  <Button
                    variant="outline" size="sm" className="h-8 text-xs shrink-0"
                    disabled={!newMediaUrl.trim()}
                    onClick={() => { addMediaFromUrl(newMediaUrl.trim()); setNewMediaUrl(''); }}
                  >
                    <Plus size={12} className="mr-1" /> URL
                  </Button>
                </div>
                <Button
                  variant="outline" size="sm" className="h-8 text-xs shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} className="mr-1" /> Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            )}
          </div>

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

          {/* Date/Time Picker — always visible */}
          {!readOnly && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Data e horário
              </label>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
            </div>
          )}
        </SheetBody>

        {!readOnly && (
          <SheetFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saving || !hasFormat}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Salvar Rascunho</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSchedule}
              disabled={saving || !scheduledAt || !hasFormat}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Agendar</span>
            </Button>
            <Button
              size="sm"
              onClick={handlePublishNow}
              disabled={publishing || !hasFormat}
              className="bg-[#9A48EA] hover:bg-[#B06AF0] text-white"
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Publicar Agora</span>
            </Button>
          </SheetFooter>
        )}
      </SheetContent>

      <MediaPreviewPopover
        media={previewMedia}
        anchorRect={previewAnchor}
        onClose={() => { setPreviewMedia(null); setPreviewAnchor(null); }}
      />
    </Sheet>
  );
}
