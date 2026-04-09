import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { listSmPending, listSmApproved, listSmRejected, smApprove, smRevert } from '@/services/approvals';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, CONTENT_TYPE_LABELS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ApprovalReviewSheet from '@/components/approvals/ApprovalReviewSheet';
import { ClipboardCheck, AlertTriangle, RotateCcw, CheckCircle2, Undo2 } from 'lucide-react';

const SSE_EVENTS = ['approval:updated', 'delivery:updated'];

export default function ApprovalsPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [approved, setApproved] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');
  const [tab, setTab] = useState('pending'); // 'pending' | 'approved' | 'corrections'
  const [revertingId, setRevertingId] = useState(null);

  const [reviewDelivery, setReviewDelivery] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const [pending, smApprovedList, rejected] = await Promise.all([
        listSmPending(),
        listSmApproved(),
        listSmRejected(),
      ]);
      setDeliveries(pending);
      setApproved(smApprovedList);
      setCorrections(rejected);
    } catch {
      toast.error('Erro ao carregar aprovacoes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  useServerEvent(SSE_EVENTS, fetchDeliveries);

  const clients = useMemo(() => {
    const map = {};
    deliveries.forEach((d) => {
      if (d.client_id && d.client_name) {
        map[d.client_id] = d.client_name;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [deliveries]);

  const filtered = clientFilter === 'all'
    ? deliveries
    : deliveries.filter((d) => String(d.client_id) === clientFilter);

  const handleRevisar = (delivery) => {
    setReviewDelivery(delivery);
    setSheetOpen(true);
  };

  const handleApprove = async (data) => {
    await smApprove(data);
    await fetchDeliveries();
  };

  const handleResubmit = async (data) => {
    await smApprove(data);
    await fetchDeliveries();
  };

  const handleRevert = async (deliveryId) => {
    setRevertingId(deliveryId);
    try {
      await smRevert({ delivery_id: deliveryId });
      toast.success('Tarefa voltou para pendente');
      await fetchDeliveries();
    } catch {
      toast.error('Erro ao voltar tarefa');
    } finally {
      setRevertingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 flex items-center justify-center text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#9A48EA]/15 flex items-center justify-center">
          <ClipboardCheck size={16} className="text-[#C084FC]" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">Aprovacoes</h1>
          <p className="text-xs text-muted-foreground">Entregas aguardando sua revisao</p>
        </div>

        {/* Client filter */}
        {clients.length > 1 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-44 h-8 text-xs bg-card border-border">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border pb-2">
        <button
          onClick={() => setTab('pending')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            tab === 'pending' ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardCheck size={13} />
          Pendentes
          {deliveries.length > 0 && (
            <span className="bg-amber-500/15 text-amber-400 text-xs rounded-full px-1.5 py-0.5 leading-none">
              {deliveries.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('approved')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            tab === 'approved' ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckCircle2 size={13} />
          Aprovados
          {approved.length > 0 && (
            <span className="bg-emerald-500/15 text-emerald-400 text-xs rounded-full px-1.5 py-0.5 leading-none">
              {approved.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('corrections')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            tab === 'corrections' ? 'bg-muted text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle size={13} />
          Correcoes
          {corrections.length > 0 && (
            <span className="bg-red-500/15 text-red-400 text-xs rounded-full px-1.5 py-0.5 leading-none">
              {corrections.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardCheck size={40} className="mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Nenhuma aprovacao pendente</p>
              <p className="text-xs mt-1">Todas as entregas foram revisadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((delivery) => (
                <Card key={delivery.id} className="bg-card/60 border-border">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {delivery.title}
                      </p>
                      {delivery.client_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {delivery.client_name}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={`text-xs shrink-0 ${
                        APPROVAL_STATUS_COLORS[delivery.approval_status] || 'bg-surface-3 text-muted-foreground'
                      }`}
                    >
                      {APPROVAL_STATUS_LABELS[delivery.approval_status] || delivery.approval_status}
                    </Badge>
                    <Button
                      size="sm"
                      className="shrink-0 bg-[#9A48EA] hover:bg-[#B06AF0] text-white text-xs h-7"
                      onClick={() => handleRevisar(delivery)}
                    >
                      Revisar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Approved tab */}
      {tab === 'approved' && (
        <>
          {approved.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CheckCircle2 size={40} className="mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Nenhuma entrega aprovada</p>
              <p className="text-xs mt-1">Entregas aprovadas por voce aparecerao aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approved.map((delivery) => (
                <Card key={delivery.id} className="bg-card/60 border-border">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {delivery.title}
                      </p>
                      {delivery.client_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {delivery.client_name}
                        </p>
                      )}
                    </div>
                    <Badge className="text-xs shrink-0 bg-emerald-500/15 text-emerald-400">
                      Aprovado (SM)
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs h-7 gap-1 border-border hover:bg-muted"
                      disabled={revertingId === delivery.id}
                      onClick={() => handleRevert(delivery.id)}
                    >
                      <Undo2 size={12} />
                      Voltar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Corrections tab */}
      {tab === 'corrections' && (
        <>
          {corrections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <AlertTriangle size={40} className="mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Nenhuma correcao pendente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {corrections.map((item) => (
                <Card key={item.id} className="bg-card/60 border-border">
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        {item.client_name && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {item.client_name}
                          </p>
                        )}
                      </div>
                      <Badge className="text-xs shrink-0 bg-red-500/15 text-red-400">
                        Reprovado
                      </Badge>
                      <Button
                        size="sm"
                        className="shrink-0 bg-[#9A48EA] hover:bg-[#B06AF0] text-white text-xs h-7 gap-1"
                        onClick={() => handleRevisar(item)}
                      >
                        <RotateCcw size={12} />
                        Corrigir
                      </Button>
                    </div>
                    {item.rejection_reason && (
                      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
                        <p className="text-xs font-medium text-red-400 mb-0.5">Motivo:</p>
                        <p className="text-sm text-foreground">{item.rejection_reason}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ApprovalReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        delivery={reviewDelivery}
        onApprove={tab === 'corrections' ? handleResubmit : handleApprove}
      />
    </div>
  );
}
