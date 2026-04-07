import React, { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { createScheduledPost, updateScheduledPost } from '@/services/instagram';
import { Image, Film, MessageCircle, Layers, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const POST_TYPES = [
  { value: 'image', label: 'Imagem', icon: Image },
  { value: 'reel', label: 'Reel', icon: Film },
  { value: 'story', label: 'Story', icon: MessageCircle },
  { value: 'carousel', label: 'Carrossel', icon: Layers },
];

const VIDEO_EXT = /\.(mp4|mov|avi|wmv|flv|mkv|webm|m4v)(\?|$)/i;

export default function ScheduledPostForm({ open, onOpenChange, post, clients, onSaved }) {
  const isEdit = !!post?.id;

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
    if (open) {
      if (post) {
        const media = typeof post.media_urls === 'string'
          ? JSON.parse(post.media_urls)
          : (post.media_urls || []);
        setForm({
          client_id: post.client_id || '',
          post_type: post.post_type || 'image',
          caption: post.caption || '',
          media_urls: media,
          thumbnail_url: post.thumbnail_url || '',
          scheduled_at: post.scheduled_at
            ? new Date(post.scheduled_at).toISOString().slice(0, 16)
            : '',
        });
      } else {
        setForm({
          client_id: clients?.[0]?.id || '',
          post_type: 'image',
          caption: '',
          media_urls: [],
          thumbnail_url: '',
          scheduled_at: '',
        });
      }
      setNewMediaUrl('');
    }
  }, [open, post, clients]);

  function addMedia() {
    const url = newMediaUrl.trim();
    if (!url) return;
    const type = VIDEO_EXT.test(url) ? 'video' : 'image';
    setForm((f) => ({
      ...f,
      media_urls: [...f.media_urls, { url, type, order: f.media_urls.length }],
    }));
    setNewMediaUrl('');
  }

  function removeMedia(index) {
    setForm((f) => ({
      ...f,
      media_urls: f.media_urls.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })),
    }));
  }

  async function handleSubmit(asDraft) {
    if (!form.client_id) return toast.error('Selecione um cliente');
    if (form.media_urls.length === 0) return toast.error('Adicione pelo menos uma mídia');
    if (!asDraft && !form.scheduled_at) return toast.error('Defina a data de agendamento');

    setSaving(true);
    try {
      const payload = {
        ...form,
        status: asDraft ? 'draft' : 'scheduled',
        thumbnail_url: form.post_type === 'reel' ? (form.thumbnail_url || null) : null,
        media_urls: JSON.stringify(form.media_urls),
      };
      if (isEdit) {
        await updateScheduledPost(post.id, payload);
        toast.success('Post atualizado');
      } else {
        await createScheduledPost(payload);
        toast.success(asDraft ? 'Rascunho salvo' : 'Post agendado');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Post' : 'Novo Post'}</SheetTitle>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-5">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className="h-8 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm text-foreground cursor-pointer focus:border-primary outline-none"
              >
                <option value="">Selecionar...</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Post type */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-1.5">
                {POST_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, post_type: value }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                      form.post_type === value
                        ? 'bg-[#9A48EA]/15 text-[#C084FC] ring-1 ring-[#9A48EA]/30'
                        : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50'
                    )}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Media grid */}
            <div className="space-y-1.5">
              <Label>Mídia ({form.media_urls.length})</Label>
              <SortableMediaGrid
                media={form.media_urls}
                onChange={(m) => setForm((f) => ({ ...f, media_urls: m }))}
                onRemove={removeMedia}
              />
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="URL da mídia..."
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMedia())}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addMedia} disabled={!newMediaUrl.trim()}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Legenda</Label>
                <span className="text-[11px] text-zinc-500 tabular-nums">{form.caption.length}/2200</span>
              </div>
              <textarea
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value.slice(0, 2200) }))}
                rows={4}
                className="w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm text-foreground resize-none focus:border-primary focus:ring-3 focus:ring-primary/50 outline-none"
                placeholder="Escreva a legenda do post..."
              />
            </div>

            {/* Reel thumbnail */}
            {form.post_type === 'reel' && (
              <div className="space-y-1.5">
                <Label>Capa do Reel (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="URL da imagem de capa..."
                    value={form.thumbnail_url}
                    onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
                    className="flex-1"
                  />
                  {form.thumbnail_url && (
                    <div className="w-8 h-8 rounded-md border border-zinc-700 overflow-hidden shrink-0">
                      <img src={form.thumbnail_url} alt="Capa" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Date/time */}
            <div className="space-y-1.5">
              <Label>Data e Hora</Label>
              <DateTimePicker
                value={form.scheduled_at}
                onChange={(v) => setForm((f) => ({ ...f, scheduled_at: v }))}
              />
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
