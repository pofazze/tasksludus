import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import PageLoading from '@/components/common/PageLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp } from 'lucide-react';

export default function SimulatorPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extraDeliveries, setExtraDeliveries] = useState('');
  const [result, setResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const fetchStatus = async () => {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const { data } = await api.get('/simulator', { params: { month } });
      setStatus(data);
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleSimulate = async () => {
    if (!status) return;
    setSimulating(true);
    try {
      const totalDeliveries = (status.deliveries_count || 0) + Number(extraDeliveries || 0);
      const { data } = await api.post('/simulator/calculate', {
        base_salary: status.base_salary,
        deliveries: totalDeliveries,
        curve_config: status.curve_config,
      });
      setResult(data);
    } catch {
      toast.error('Erro ao simular');
    } finally {
      setSimulating(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <h1 className="text-2xl font-bold font-display mb-6">Simulador de Bônus</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Salário Base</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(status?.base_salary)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Entregas no Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#9A48EA]">
              {status?.deliveries_count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Meta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status?.goal_target ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-md mb-6">
        <CardHeader>
          <CardTitle className="text-base">Simular</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Entregas extras</Label>
            <Input
              type="number"
              min="0"
              value={extraDeliveries}
              onChange={(e) => setExtraDeliveries(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Total: {(status?.deliveries_count || 0) + Number(extraDeliveries || 0)} entregas
            </p>
          </div>
          <Button onClick={handleSimulate} disabled={simulating}>
            <TrendingUp size={16} className="mr-2" />
            {simulating ? 'Calculando...' : 'Simular'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-base">Resultado da Simulação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multiplicador</span>
              <span className="font-semibold text-[#9A48EA]">{result.multiplier}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bônus Estimado</span>
              <span className="font-semibold text-green-400">{formatCurrency(result.bonus)}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Total (Salário + Bônus)</span>
              <span className="font-bold text-lg">{formatCurrency(result.total_with_base)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
