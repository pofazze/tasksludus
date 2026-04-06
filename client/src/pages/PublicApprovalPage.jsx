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

  const handleApprove = async (itemId) => {
    setSubmitting(true);
    try {
      await clientRespond(token, itemId, { status: 'approved' });
      await fetchBatch();
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
      await clientRespond(token, rejectingId, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
      });
      setRejectingId(null);
      setRejectionReason('');
      await fetchBatch();
    } catch {
      alert('Erro ao reprovar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#9A48EA]" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-6 text-center">
        <AlertTriangle size={48} className="text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-zinc-200 mb-2">Link indisponivel</h1>
        <p className="text-zinc-500">{error}</p>
      </div>
    );
  }

  const { batch, items, client } = data;
  const respondedCount = items.filter((i) => i.status !== 'pending').length;
  const allResponded = respondedCount === items.length;
  const isRevoked = batch.status === 'revoked';
  const readOnly = allResponded || isRevoked;

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#09090B]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-[480px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#9A48EA] flex items-center justify-center text-white text-xs font-bold">
              L
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-semibold">{client?.name}</h1>
              <p className="text-xs text-zinc-500">
                {respondedCount} de {items.length} publicacoes respondidas
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
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
            <h2 className="text-lg font-semibold text-zinc-200">Obrigado!</h2>
            <p className="text-sm text-zinc-500 mt-1">Todas as publicacoes foram respondidas.</p>
          </div>
        )}

        {isRevoked && (
          <div className="text-center py-8">
            <XCircle size={48} className="text-zinc-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-zinc-300">Este link nao esta mais disponivel</h2>
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
              <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                <p className="text-sm text-zinc-300 mb-2 font-medium">Motivo da reprovacao:</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Descreva o que precisa ser alterado..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
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
