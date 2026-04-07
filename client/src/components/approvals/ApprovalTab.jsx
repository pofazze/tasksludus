import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { listByClient, listBatches, smApprove, sendToClient, revokeBatch, getBatchItems, updateBatchItem, removeBatchItem } from '@/services/approvals';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ApprovalReviewSheet from '@/components/approvals/ApprovalReviewSheet';
import BatchEditSheet from '@/components/approvals/BatchEditSheet';
import { CheckCircle2, Send, XCircle, Loader2, Pencil } from 'lucide-react';

const SSE_EVENTS = ['approval:updated', 'delivery:updated'];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }) : '—';

export default function ApprovalTab({ clientId }) {
  const [deliveries, setDeliveries] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sheet state
  const [reviewDelivery, setReviewDelivery] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Selected sm_approved items to send to client
  const [selected, setSelected] = useState({});

  // Prepared content (caption, media_urls, etc.) stored after SM approval
  const [preparedContent, setPreparedContent] = useState({});

  // Batch edit state
  const [editBatch, setEditBatch] = useState(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  // Loading states
  const [sending, setSending] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [dels, bats] = await Promise.all([
        listByClient(clientId),
        listBatches(clientId),
      ]);
      setDeliveries(dels);
      setBatches(bats);
    } catch {
      toast.error('Erro ao carregar aprovacoes');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useServerEvent(SSE_EVENTS, () => {
    fetchData();
  });

  // Sections
  const smPending = deliveries.filter((d) => d.approval_status === 'sm_pending');
  const smApproved = deliveries.filter((d) => d.approval_status === 'sm_approved');
  const clientPending = deliveries.filter((d) => d.approval_status === 'client_pending');

  // Handle SM approve via sheet
  const handleSmApprove = async ({ delivery_id, caption, media_urls, thumbnail_url, post_type }) => {
    await smApprove({ delivery_id, caption, media_urls, thumbnail_url, post_type });
    // Store prepared content so it can be sent later
    setPreparedContent((prev) => ({
      ...prev,
      [delivery_id]: { caption, media_urls, thumbnail_url, post_type },
    }));
    await fetchData();
  };

  // Toggle selection for sm_approved items
  const toggleSelect = (deliveryId) => {
    setSelected((prev) => ({ ...prev, [deliveryId]: !prev[deliveryId] }));
  };

  const selectedIds = smApproved.filter((d) => selected[d.id]).map((d) => d.id);

  const handleSendToClient = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos uma entrega');
      return;
    }

    const items = selectedIds.map((id) => {
      const content = preparedContent[id] || {};
      const delivery = smApproved.find((d) => d.id === id);
      return {
        delivery_id: id,
        caption: content.caption ?? delivery?.caption ?? delivery?.title ?? '',
        media_urls: content.media_urls ?? delivery?.media_urls ?? [],
        thumbnail_url: content.thumbnail_url ?? delivery?.thumbnail_url ?? null,
        post_type: content.post_type ?? delivery?.content_type ?? 'feed',
      };
    });

    setSending(true);
    try {
      await sendToClient({ client_id: clientId, items });
      toast.success('Enviado para aprovacao do cliente');
      setSelected({});
      await fetchData();
    } catch {
      toast.error('Erro ao enviar para o cliente');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (batchId) => {
    setRevokingId(batchId);
    try {
      await revokeBatch(batchId);
      toast.success('Lote revogado');
      await fetchData();
    } catch {
      toast.error('Erro ao revogar lote');
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando...
      </div>
    );
  }

  const isEmpty = deliveries.length === 0 && batches.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
        <CheckCircle2 size={32} className="text-zinc-700" />
        <span className="text-sm">Nenhuma entrega em aprovacao</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ─── SM Pending ─────────────────────────────────── */}
      {smPending.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Aguardando Revisao do Social Media ({smPending.length})
          </h3>
          <div className="space-y-2">
            {smPending.map((delivery) => (
              <Card key={delivery.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {delivery.title || `Entrega #${delivery.id}`}
                    </p>
                    {delivery.due_date && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Prazo: {fmtDate(delivery.due_date)}
                      </p>
                    )}
                  </div>
                  <Badge className={APPROVAL_STATUS_COLORS['sm_pending']}>
                    {APPROVAL_STATUS_LABELS['sm_pending']}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 hover:bg-zinc-800 shrink-0"
                    onClick={() => { setReviewDelivery(delivery); setSheetOpen(true); }}
                  >
                    Revisar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── SM Approved ────────────────────────────────── */}
      {smApproved.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Aprovado pelo Social Media ({smApproved.length})
            </h3>
            <Button
              size="sm"
              className="bg-[#9A48EA] hover:bg-[#B06AF0] gap-1.5"
              disabled={selectedIds.length === 0 || sending}
              onClick={handleSendToClient}
            >
              {sending
                ? <Loader2 size={13} className="animate-spin" />
                : <Send size={13} />}
              Enviar para Cliente
              {selectedIds.length > 0 && (
                <span className="ml-1 bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {selectedIds.length}
                </span>
              )}
            </Button>
          </div>
          <div className="space-y-2">
            {smApproved.map((delivery) => (
              <Card key={delivery.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected[delivery.id]}
                    onChange={() => toggleSelect(delivery.id)}
                    className="w-4 h-4 accent-[#9A48EA] shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {delivery.title || `Entrega #${delivery.id}`}
                    </p>
                    {delivery.due_date && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Prazo: {fmtDate(delivery.due_date)}
                      </p>
                    )}
                  </div>
                  <Badge className={APPROVAL_STATUS_COLORS['sm_approved']}>
                    {APPROVAL_STATUS_LABELS['sm_approved']}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── Client Pending ─────────────────────────────── */}
      {clientPending.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Aguardando Aprovacao do Cliente ({clientPending.length})
          </h3>
          <div className="space-y-2">
            {clientPending.map((delivery) => (
              <Card key={delivery.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {delivery.title || `Entrega #${delivery.id}`}
                    </p>
                    {delivery.due_date && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Prazo: {fmtDate(delivery.due_date)}
                      </p>
                    )}
                  </div>
                  <Badge className={APPROVAL_STATUS_COLORS['client_pending']}>
                    {APPROVAL_STATUS_LABELS['client_pending']}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── Active Batches ─────────────────────────────── */}
      {batches.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Lotes Ativos ({batches.length})
          </h3>
          <div className="space-y-2">
            {batches.map((batch) => (
              <Card key={batch.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      Lote de {fmtDate(batch.created_at)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {batch.total_items || 0} post(s)
                      {batch.pending_count > 0 && ` · ${batch.pending_count} pendente(s)`}
                      {batch.approved_count > 0 && ` · ${batch.approved_count} aprovado(s)`}
                      {batch.rejected_count > 0 && ` · ${batch.rejected_count} rejeitado(s)`}
                    </p>
                  </div>
                  <Badge className="bg-purple-500/15 text-purple-400">
                    Ativo
                  </Badge>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 hover:bg-zinc-800 gap-1"
                      onClick={() => { setEditBatch(batch); setEditSheetOpen(true); }}
                    >
                      <Pencil size={13} />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-800 text-red-400 hover:bg-red-950 gap-1"
                      disabled={revokingId === batch.id}
                      onClick={() => handleRevoke(batch.id)}
                    >
                      {revokingId === batch.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <XCircle size={13} />}
                      Revogar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ─── Review Sheet ────────────────────────────────── */}
      <ApprovalReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        delivery={reviewDelivery}
        onApprove={handleSmApprove}
      />

      {/* ─── Batch Edit Sheet ──────────────────────────── */}
      <BatchEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        batch={editBatch}
        onUpdate={fetchData}
      />
    </div>
  );
}
