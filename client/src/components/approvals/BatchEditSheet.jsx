import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { getBatchItems, updateBatchItem, removeBatchItem } from '@/services/approvals';
import { Loader2, Trash2, Save } from 'lucide-react';

export default function BatchEditSheet({ open, onOpenChange, batch, onUpdate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!batch?.id) return;
    setLoading(true);
    try {
      const data = await getBatchItems(batch.id);
      setItems(data.items);
    } catch {
      toast.error('Erro ao carregar itens do lote');
    } finally {
      setLoading(false);
    }
  }, [batch?.id]);

  useEffect(() => {
    if (open && batch?.id) {
      fetchItems();
      setEditingItem(null);
    }
  }, [open, batch?.id, fetchItems]);

  const handleEdit = (item) => {
    setEditingItem(item);
    setCaption(item.caption || '');
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      await updateBatchItem(batch.id, editingItem.id, { caption });
      toast.success('Item atualizado');
      setEditingItem(null);
      await fetchItems();
      onUpdate?.();
    } catch {
      toast.error('Erro ao atualizar item');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (itemId) => {
    setRemovingId(itemId);
    try {
      await removeBatchItem(batch.id, itemId);
      toast.success('Item removido do lote');
      const remaining = items.filter((i) => i.id !== itemId);
      setItems(remaining);
      if (remaining.length === 0) {
        onOpenChange(false);
      }
      onUpdate?.();
    } catch {
      toast.error('Erro ao remover item');
    } finally {
      setRemovingId(null);
    }
  };

  const parseMedia = (mediaUrls) => {
    if (!mediaUrls) return [];
    if (typeof mediaUrls === 'string') {
      try { return JSON.parse(mediaUrls); } catch { return []; }
    }
    return mediaUrls;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar Lote</SheetTitle>
          <SheetDescription>
            <Badge className="bg-purple-500/15 text-purple-400">
              {items.length} item(ns)
            </Badge>
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              Carregando...
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const media = parseMedia(item.media_urls);
                const isEditing = editingItem?.id === item.id;

                return (
                  <Card key={item.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4 space-y-3">
                      {/* Title */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {item.delivery_title || 'Post'}
                        </p>
                        <div className="flex gap-1.5">
                          {!isEditing && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-zinc-400 hover:text-white"
                              onClick={() => handleEdit(item)}
                            >
                              Editar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-950"
                            disabled={removingId === item.id}
                            onClick={() => handleRemove(item.id)}
                          >
                            {removingId === item.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Trash2 size={12} />}
                          </Button>
                        </div>
                      </div>

                      {/* Media preview */}
                      {media.length > 0 && (
                        <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
                      )}

                      {/* Caption */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                            rows={4}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditingItem(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-[#9A48EA] hover:bg-[#B06AF0] gap-1"
                              disabled={saving}
                              onClick={handleSave}
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              Salvar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        item.caption && (
                          <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-wrap">
                            {item.caption}
                          </p>
                        )
                      )}

                      {/* Status badge */}
                      <Badge className={
                        item.status === 'pending' ? 'bg-amber-500/15 text-amber-400' :
                        item.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-red-500/15 text-red-400'
                      }>
                        {item.status === 'pending' ? 'Pendente' :
                         item.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
