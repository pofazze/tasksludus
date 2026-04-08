import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicBatch, clientRespond } from '@/services/approvals';
import InstagramPostPreview from '@/components/approvals/InstagramPostPreview';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function PublicApprovalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBatch();
  }, [token]);

  const fetchBatch = async () => {
    try {
      const result = await getPublicBatch(token);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Link invalido ou expirado');
    } finally {
      setLoading(false);
    }
  };

  // Update a single item in local state without re-fetching
  const updateItemLocally = (itemId, newStatus, rejReason) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((item) =>
        item.id === itemId
          ? { ...item, status: newStatus, rejection_reason: rejReason || null, responded_at: new Date().toISOString() }
          : item
      );
      return { ...prev, items: updatedItems };
    });
  };

  const handleApprove = async (itemId) => {
    setSubmitting(true);
    try {
      const result = await clientRespond(token, itemId, { status: 'approved' });
      updateItemLocally(itemId, 'approved');
      if (!result.allResponded) {
        await fetchBatch();
      }
    } catch {
      alert('Erro ao aprovar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectStart = (itemId) => {
    setRejectingId(itemId);
    setRejectionReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) return;
    setSubmitting(true);
    try {
      const result = await clientRespond(token, rejectingId, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
      });
      updateItemLocally(rejectingId, 'rejected', rejectionReason.trim());
      setRejectingId(null);
      setRejectionReason('');
      if (!result.allResponded) {
        await fetchBatch();
      }
    } catch {
      alert('Erro ao reprovar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-[#9A48EA]" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <AlertTriangle size={48} className="text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-foreground mb-2">Link indisponivel</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const { batch, items } = data;
  const client = { name: batch.client_name, instagram_account: batch.instagram_account, avatar_url: batch.client_avatar_url };
  const respondedCount = items.filter((i) => i.status !== 'pending').length;
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;
  const allResponded = respondedCount === items.length;
  const isRevoked = batch.status === 'revoked';
  const readOnly = allResponded || isRevoked;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-[480px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#9A48EA] flex items-center justify-center text-white text-xs font-bold">
              L
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-semibold">{client?.name}</h1>
              <p className="text-xs text-muted-foreground">
                {respondedCount} de {items.length} publicacoes respondidas
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-[#9A48EA] transition-all duration-500"
              style={{ width: `${(respondedCount / items.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[480px] mx-auto px-4 py-6 space-y-6 pb-24">
        {allResponded && (
          <div className="text-center py-8">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground">Obrigado!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Todas as {items.length} publicacoes foram respondidas.
            </p>
            <div className="flex items-center justify-center gap-4 mt-4">
              {approvedCount > 0 && (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">{approvedCount} aprovada{approvedCount > 1 ? 's' : ''}</span>
                </div>
              )}
              {rejectedCount > 0 && (
                <div className="flex items-center gap-1.5 text-red-400">
                  <XCircle size={16} />
                  <span className="text-sm font-medium">{rejectedCount} reprovada{rejectedCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {isRevoked && (
          <div className="text-center py-8">
            <XCircle size={48} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground">Este link nao esta mais disponivel</h2>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id}>
            <InstagramPostPreview
              item={item}
              client={client}
              readOnly={readOnly || submitting}
              onApprove={handleApprove}
              onReject={handleRejectStart}
            />

            {/* Rejection modal inline */}
            {rejectingId === item.id && (
              <div className="mt-3 p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-foreground mb-2 font-medium">Motivo da reprovacao:</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Descreva o que precisa ser alterado..."
                  className="w-full bg-muted border border-border rounded-lg p-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="flex-1 py-2.5 rounded-lg bg-muted hover:bg-surface-3 text-foreground text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectionReason.trim() || submitting}
                    className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
