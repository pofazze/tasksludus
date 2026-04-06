import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SortableMediaGrid } from '@/components/instagram/SortableMediaGrid';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { uploadMedia } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Loader2, Upload } from 'lucide-react';

export default function ApprovalReviewSheet({ open, onOpenChange, delivery, onApprove }) {
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [postType, setPostType] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Reset state when delivery changes
  const [lastDeliveryId, setLastDeliveryId] = useState(null);
  if (delivery?.id && delivery.id !== lastDeliveryId) {
    setLastDeliveryId(delivery.id);
    setCaption(delivery.caption || delivery.title || '');
    setMedia(
      delivery.media_urls
        ? typeof delivery.media_urls === 'string'
          ? JSON.parse(delivery.media_urls)
          : delivery.media_urls
        : []
    );
    setThumbnailUrl(delivery.thumbnail_url || '');
    setPostType(delivery.content_type || null);
  }

  const isReel = ['reel', 'video'].includes(postType);
  const imageCount = media.filter((m) => m.type === 'image').length;

  const handleApprove = async () => {
    if (media.length === 0) {
      toast.error('Adicione pelo menos uma midia');
      return;
    }
    if (isReel && imageCount > 1 && !thumbnailUrl) {
      toast.error('Selecione a capa do Reel');
      return;
    }

    setSaving(true);
    try {
      await onApprove({
        delivery_id: delivery.id,
        caption,
        media_urls: media,
        thumbnail_url: isReel ? (thumbnailUrl || null) : null,
        post_type: postType || delivery.content_type || 'feed',
      });
      onOpenChange(false);
      toast.success('Aprovado pelo social media');
    } catch {
      toast.error('Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMedia = (index) => {
    setMedia((prev) => prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })));
  };

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{delivery?.title || 'Revisao'}</SheetTitle>
          <SheetDescription>
            <Badge className="bg-amber-500/15 text-amber-400">Aprovacao SM</Badge>
            {postType && (
              <span className="ml-2 text-xs text-zinc-500">
                {CONTENT_TYPE_LABELS[postType] || postType}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* Media Preview */}
          <div className="mb-4">
            <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
          </div>

          {/* Sortable Media Grid */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-medium">Midias ({media.length})</span>
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="mr-1" /> Adicionar
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
            <SortableMediaGrid
              media={media}
              onChange={setMedia}
              onRemove={handleRemoveMedia}
            />
          </div>

          {/* Reel Cover */}
          {isReel && imageCount > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400 font-medium mb-2 block">Capa do Reel</span>
              {thumbnailUrl ? (
                <div className="flex items-center gap-2">
                  <img
                    src={proxyMediaUrl(thumbnailUrl)}
                    alt="cover"
                    className="w-12 h-12 rounded object-cover"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setThumbnailUrl('')}>
                    Alterar
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {media
                    .filter((m) => m.type === 'image')
                    .map((m) => (
                      <button
                        key={m.url}
                        onClick={() => setThumbnailUrl(m.url)}
                        className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-[#9A48EA] transition-colors"
                      >
                        <img src={proxyMediaUrl(m.url)} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400 font-medium">Legenda</span>
              <span className="text-xs text-zinc-600">{caption.length}/2200</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              rows={5}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
              placeholder="Legenda da publicacao..."
            />
          </div>
        </SheetBody>

        <SheetFooter>
          <Button
            onClick={handleApprove}
            disabled={saving}
            className="w-full bg-[#9A48EA] hover:bg-[#B06AF0]"
          >
            {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            Aprovar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
