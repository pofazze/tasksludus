import { useState, useEffect, useRef } from 'react';
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
import { getDeliveryMedia } from '@/services/approvals';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Loader2, Upload } from 'lucide-react';

export default function ApprovalReviewSheet({ open, onOpenChange, delivery, onApprove }) {
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [postType, setPostType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const fileInputRef = useRef(null);
  const lastFetchedId = useRef(null);

  // Fetch fresh media from ClickUp when opening with a new delivery
  useEffect(() => {
    if (!open || !delivery?.id || delivery.id === lastFetchedId.current) return;
    lastFetchedId.current = delivery.id;

    // Set fallback from delivery object immediately
    setCaption(delivery.caption || delivery.title || '');
    setPostType(delivery.content_type || null);
    setThumbnailUrl(delivery.thumbnail_url || '');
    setMedia(
      delivery.media_urls
        ? typeof delivery.media_urls === 'string'
          ? JSON.parse(delivery.media_urls)
          : delivery.media_urls
        : []
    );

    // Then fetch fresh data from ClickUp
    setLoadingMedia(true);
    getDeliveryMedia(delivery.id)
      .then((fresh) => {
        if (fresh.media_urls?.length > 0) setMedia(fresh.media_urls);
        if (fresh.caption) setCaption(fresh.caption);
        if (fresh.thumbnail_url) setThumbnailUrl(fresh.thumbnail_url);
        if (fresh.post_type) setPostType(fresh.post_type);
      })
      .catch(() => {
        // Keep fallback data from delivery object
      })
      .finally(() => setLoadingMedia(false));
  }, [open, delivery?.id]);

  // Reset fetched ID when sheet closes
  useEffect(() => {
    if (!open) lastFetchedId.current = null;
  }, [open]);

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
              <span className="ml-2 text-xs text-muted-foreground">
                {CONTENT_TYPE_LABELS[postType] || postType}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {loadingMedia ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              Carregando midias...
            </div>
          ) : (
            <>
              {/* Media Preview */}
              <div className="mb-4">
                <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
              </div>

              {/* Sortable Media Grid */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">Midias ({media.length})</span>
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
                <div className="mb-4 p-3 rounded-lg bg-card border border-border">
                  <span className="text-xs text-muted-foreground font-medium mb-2 block">Capa do Reel</span>
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
                            className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-primary transition-colors"
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
                  <span className="text-xs text-muted-foreground font-medium">Legenda</span>
                  <span className="text-xs text-muted-foreground">{caption.length}/2200</span>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                  rows={5}
                  className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
                  placeholder="Legenda da publicacao..."
                />
              </div>
            </>
          )}
        </SheetBody>

        <SheetFooter>
          <Button
            onClick={handleApprove}
            disabled={saving || loadingMedia}
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
