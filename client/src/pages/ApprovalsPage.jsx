import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { listSmPending, smApprove } from '@/services/approvals';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ApprovalReviewSheet from '@/components/approvals/ApprovalReviewSheet';
import { ClipboardCheck } from 'lucide-react';

const SSE_EVENTS = ['approval:updated', 'delivery:updated'];

export default function ApprovalsPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');

  const [reviewDelivery, setReviewDelivery] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const data = await listSmPending();
      setDeliveries(data);
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 flex items-center justify-center text-zinc-500 text-sm">
        Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-[#9A48EA]/15 flex items-center justify-center">
          <ClipboardCheck size={16} className="text-[#C084FC]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Aprovacoes</h1>
            {filtered.length > 0 && (
              <Badge className="bg-amber-500/15 text-amber-400 text-xs">
                {filtered.length}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">Entregas aguardando sua revisao</p>
        </div>

        {/* Client filter */}
        {clients.length > 1 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-44 h-8 text-xs bg-zinc-900 border-zinc-700">
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

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <ClipboardCheck size={40} className="mb-3 text-zinc-700" />
          <p className="text-sm font-medium">Nenhuma aprovacao pendente</p>
          <p className="text-xs mt-1">Todas as entregas foram revisadas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((delivery) => (
            <Card key={delivery.id} className="bg-zinc-900/60 border-zinc-800">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {delivery.title}
                  </p>
                  {delivery.client_name && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {delivery.client_name}
                    </p>
                  )}
                </div>
                <Badge
                  className={`text-xs shrink-0 ${
                    APPROVAL_STATUS_COLORS[delivery.approval_status] || 'bg-zinc-700 text-zinc-300'
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

      <ApprovalReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        delivery={reviewDelivery}
        onApprove={handleApprove}
      />
    </div>
  );
}
