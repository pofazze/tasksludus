import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isCeo, isAdmin } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, Lock, DollarSign, Users, TrendingUp, BarChart3, ArrowLeft } from 'lucide-react';

const STATUS_COLORS = {
  draft: 'bg-zinc-500/15 text-zinc-400',
  calculated: 'bg-blue-500/15 text-blue-400',
  adjusted: 'bg-orange-500/15 text-orange-400',
  closed: 'bg-emerald-500/15 text-emerald-400',
};

const STATUS_LABELS = {
  draft: 'Rascunho',
  calculated: 'Calculado',
  adjusted: 'Ajustado',
  closed: 'Fechado',
};

export default function CalculationsPage() {
  const user = useAuthStore((s) => s.user);
  const [calculations, setCalculations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [view, setView] = useState('list'); // 'list' | 'adjust'
  const [adjustCalc, setAdjustCalc] = useState(null);
  const [adjustValue, setAdjustValue] = useState('');

  const fetchData = async () => {
    try {
      const params = {};
      if (filterMonth) params.month = filterMonth + '-01';
      const { data } = await api.get('/calculations', { params });
      setCalculations(data);
    } catch {
      toast.error('Erro ao carregar cálculos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterMonth]);

  const handleSuggest = async () => {
    if (!filterMonth) {
      toast.error('Selecione um mês');
      return;
    }
    setCalculating(true);
    try {
      const { data } = await api.post('/calculations/suggest', { month: filterMonth + '-01' });
      toast.success(`Cálculos gerados para ${data.length} produtores`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao calcular sugestões');
    } finally {
      setCalculating(false);
    }
  };

  const handleCloseAll = async () => {
    if (!filterMonth) {
      toast.error('Selecione um mês');
      return;
    }
    if (!confirm('Fechar todos os cálculos do mês? Esta ação não pode ser desfeita.')) return;
    try {
      await api.patch('/calculations/close-all', { month: filterMonth + '-01' });
      toast.success('Mês fechado com sucesso');
      fetchData();
    } catch {
      toast.error('Erro ao fechar mês');
    }
  };

  const openAdjust = (calc) => {
    setAdjustCalc(calc);
    setAdjustValue(calc.final_bonus ?? calc.suggested_bonus ?? '');
    setView('adjust');
  };

  const handleAdjust = async () => {
    try {
      await api.put(`/calculations/${adjustCalc.id}`, {
        final_bonus: Number(adjustValue),
      });
      toast.success('Bônus ajustado');
      setView('list');
      fetchData();
    } catch {
      toast.error('Erro ao ajustar bônus');
    }
  };

  if (loading) return <PageLoading />;

  const totalSuggested = calculations.reduce((s, c) => s + (parseFloat(c.suggested_bonus) || 0), 0);
  const totalFinal = calculations.reduce((s, c) => s + (parseFloat(c.final_bonus) || parseFloat(c.suggested_bonus) || 0), 0);
  const totalDeliveries = calculations.reduce((s, c) => s + (c.total_deliveries || 0), 0);
  const closedCount = calculations.filter((c) => c.status === 'closed').length;

  return (
    <div>
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold font-display">Cálculos & Boost</h1>
            <div className="flex gap-2">
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="native-select"
              />
              {isAdmin(user?.role) && (
                <Button onClick={handleSuggest} disabled={calculating}>
                  <Calculator size={16} className="mr-2" />
                  {calculating ? 'Calculando...' : 'Calcular Sugestão'}
                </Button>
              )}
              {isCeo(user?.role) && calculations.length > 0 && (
                <Button variant="destructive" onClick={handleCloseAll}>
                  <Lock size={16} className="mr-2" /> Fechar Mês
                </Button>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-500/15">
                  <Users size={22} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Produtores</p>
                  <p className="text-2xl font-bold">{calculations.length}</p>
                  <p className="text-xs text-muted-foreground">{closedCount} fechados</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-orange-500/15">
                  <BarChart3 size={22} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Entregas</p>
                  <p className="text-2xl font-bold">{totalDeliveries}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-500/15">
                  <DollarSign size={22} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Sugerido</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalSuggested)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-emerald-500/15">
                  <TrendingUp size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Boost</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalFinal)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produtor</TableHead>
                    <TableHead className="text-right">Entregas</TableHead>
                    <TableHead className="text-right">Multiplicador</TableHead>
                    <TableHead className="text-right">Salário Base</TableHead>
                    <TableHead className="text-right">Bônus Sugerido</TableHead>
                    <TableHead className="text-right">Bônus Final</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.user_name}</p>
                          {c.user_producer_type && (
                            <p className="text-xs text-muted-foreground">{c.user_producer_type}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.total_deliveries}</TableCell>
                      <TableCell className="text-right font-mono">
                        {c.multiplier_applied ? `${c.multiplier_applied}x` : '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(c.base_salary)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.suggested_bonus)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {c.final_bonus != null ? formatCurrency(c.final_bonus) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[c.status] || ''}>
                          {STATUS_LABELS[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status !== 'closed' && (
                          <Button variant="ghost" size="sm" onClick={() => openAdjust(c)}>
                            Ajustar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {calculations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum cálculo para este mês. Clique em "Calcular Sugestão" para gerar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {view === 'adjust' && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold font-display">
              Ajustar Bônus — {adjustCalc?.user_name}
            </h1>
          </div>
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Entregas publicadas</span>
                  <p className="font-medium text-lg">{adjustCalc?.total_deliveries}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Multiplicador</span>
                  <p className="font-medium text-lg">{adjustCalc?.multiplier_applied}x</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Salário Base</span>
                  <p className="font-medium">{adjustCalc && formatCurrency(adjustCalc.base_salary)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sugerido</span>
                  <p className="font-medium">{adjustCalc && formatCurrency(adjustCalc.suggested_bonus)}</p>
                </div>
              </div>
              <div>
                <Label>Bônus Final (R$)</Label>
                <Input type="number" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2 mt-4 max-w-2xl">
            <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
            <Button onClick={handleAdjust}>Salvar</Button>
          </div>
        </>
      )}
    </div>
  );
}
