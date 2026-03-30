import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createScheduledPost, updateScheduledPost } from '@/services/instagram';
import api from '@/services/api';
import {
  Image, Video, Film, Layers, MessageCircle, ExternalLink, Loader2, X,
} from 'lucide-react';

const POST_TYPES = [
  { value: 'image', label: 'Imagem', icon: Image },
  { value: 'reel', label: 'Reel', icon: Film },
  { value: 'story', label: 'Story', icon: MessageCircle },
  { value: 'carousel', label: 'Carrossel', icon: Layers },
];

export default function ScheduledPostForm({ open, onOpenChange, post, clients, onSaved }) {
  const isEditing = !!post?.id;

  const [form, setForm] = useState({
    client_id: '',
    post_type: 'image',
    caption: '',
    media_urls: [],
    thumbnail_url: '',
    scheduled_at: '',
  });
  const [saving, setSaving] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState('');

  useEffect(() => {
    if (post) {
      const mediaUrls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);
      setForm({
        client_id: post.client_id || '',
        post_type: post.post_type || 'image',
        caption: post.caption || '',
        media_urls: mediaUrls,
        thumbnail_url: post.thumbnail_url || '',
        scheduled_at: post.scheduled_at ? formatDateTimeLocal(post.scheduled_at) : '',
      });
    } else {
      setForm({ client_id: '', post_type: 'image', caption: '', media_urls: [], thumbnail_url: '', scheduled_at: '' });
    }
  }, [post, open]);

  function formatDateTimeLocal(isoDate) {
    const d = new Date(isoDate);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const addMedia = () => {
    if (!newMediaUrl.trim()) return;
    const isVideo = /\.(mp4|mov|avi|webm)(\?|$)/i.test(newMediaUrl);
    setForm((f) => ({
      ...f,
      media_urls: [...f.media_urls, { url: newMediaUrl.trim(), type: isVideo ? 'video' : 'image', order: f.media_urls.length }],
    }));
    setNewMediaUrl('');
  };

  const removeMedia = (index) => {
    setForm((f) => ({
      ...f,
      media_urls: f.media_urls.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })),
    }));
  };

  const handleSubmit = async (asDraft) => {
    if (!form.client_id) return toast.error('Selecione um cliente');
    if (form.media_urls.length === 0) return toast.error('Adicione pelo menos uma mídia');

    setSaving(true);
    try {
      const payload = {
        ...form,
        thumbnail_url: form.post_type === 'reel' ? (form.thumbnail_url || null) : null,
        scheduled_at: asDraft ? null : (form.scheduled_at || null),
      };
      if (!asDraft && !form.scheduled_at) {
        return toast.error('Defina data e hora para agendar');
      }

      if (isEditing) {
        await updateScheduledPost(post.id, payload);
        toast.success(asDraft ? 'Rascunho salvo' : 'Post agendado');
      } else {
        await createScheduledPost(payload);
        toast.success(asDraft ? 'Rascunho criado' : 'Post agendado');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Post' : 'Novo Post'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edite o conteúdo e agendamento.' : 'Crie um post para publicar no Instagram.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Client */}
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <select
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione...</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Post Type */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {POST_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, post_type: value }))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    form.post_type === value
                      ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                      : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Caption</Label>
              <span className={`text-xs ${form.caption.length > 2200 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {form.caption.length}/2200
              </span>
            </div>
            <textarea
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              rows={4}
              maxLength={2200}
              placeholder="Escreva a legenda do post..."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Media URLs */}
          <div className="space-y-1.5">
            <Label>Mídia</Label>
            {form.media_urls.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {form.media_urls.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-zinc-800/50 px-3 py-2 text-xs">
                    <Badge variant="secondary" className="shrink-0">
                      {m.type === 'video' ? 'Video' : 'Imagem'}
                    </Badge>
                    <span className="truncate flex-1 text-muted-foreground">{m.url}</span>
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newMediaUrl}
                onChange={(e) => setNewMediaUrl(e.target.value)}
                placeholder="URL da imagem ou vídeo"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addMedia}>
                Adicionar
              </Button>
            </div>
          </div>

          {/* Cover Image (Reels only) */}
          {form.post_type === 'reel' && (
            <div className="space-y-1.5">
              <Label>Capa do Reel</Label>
              <Input
                value={form.thumbnail_url}
                onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                placeholder="URL da imagem de capa (opcional)"
              />
              {form.thumbnail_url && (
                <div className="flex items-center gap-2 mt-1.5">
                  <img
                    src={form.thumbnail_url}
                    alt="Capa"
                    className="w-16 h-28 rounded object-cover border border-zinc-700"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, thumbnail_url: '' }))}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Imagem exibida como capa na aba de Reels do Instagram</p>
            </div>
          )}

          {/* DateTime */}
          <div className="space-y-1.5">
            <Label>Data e Hora</Label>
            <Input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
            />
          </div>

          {/* Delivery link */}
          {post?.delivery_id && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink size={12} />
              Vinculado a uma entrega
              {post.clickup_task_id && (
                <a
                  href={`https://app.clickup.com/t/${post.clickup_task_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline ml-1"
                >
                  ClickUp
                </a>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancelar</Button>
          </DialogClose>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(true)}
            disabled={saving}
          >
            Salvar Rascunho
          </Button>
          <Button
            size="sm"
            onClick={() => handleSubmit(false)}
            disabled={saving}
          >
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
