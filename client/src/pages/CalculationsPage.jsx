import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isCeo, isAdmin } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, Lock, DollarSign, Users, BarChart3 } from 'lucide-react';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  suggested: 'bg-blue-100 text-blue-800',
  adjusted: 'bg-orange-100 text-orange-800',
  closed: 'bg-green-100 text-green-800',
};

const STATUS_LABELS = {
  pending: 'Pendente',
  suggested: 'Sugerido',
  adjusted: 'Ajustado',
  closed: 'Fechado',
};

export default function CalculationsPage() {
  const user = useAuthStore((s) => s.user);
  const [calculations, setCalculations] = useState([]);
  const [users, setUsers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [adjustCalc, setAdjustCalc] = useState(null);
  const [adjustValue, setAdjustValue] = useState('');

  const fetchData = async () => {
    try {
      const params = {};
      if (filterMonth) params.month = filterMonth + '-01';
      const [calcRes, usersRes, delRes] = await Promise.all([
        api.get('/calculations', { params }),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/deliveries', { params: filterMonth ? { month: filterMonth + '-01' } : {} }).catch(() => ({ data: [] })),
      ]);
      setCalculations(calcRes.data);
      setUsers(usersRes.data);
      setDeliveries(delRes.data);
    } catch {
      toast.error('Erro ao carregar cálculos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterMonth]);

  const getUserName = (id) => users.find((u) => u.id === id)?.name || '—';
  const getUserSalary = (id) => users.find((u) => u.id === id)?.base_salary;
  const getUserDeliveries = (id) => deliveries.filter((d) => d.user_id === id && (d.status === 'publicacao' || d.status === 'completed')).length;

  const handleSuggest = async () => {
    if (!filterMonth) {
      toast.error('Selecione um mês');
      return;
    }
    try {
      await api.post('/calculations/suggest', { month: filterMonth + '-01' });
      toast.success('Sugestões calculadas');
      fetchData();
    } catch {
      toast.error('Erro ao calcular sugestões');
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
    setAdjustDialog(true);
  };

  const handleAdjust = async () => {
    try {
      await api.put(`/calculations/${adjustCalc.id}`, {
        final_bonus: Number(adjustValue),
      });
      toast.success('Bônus ajustado');
      setAdjustDialog(false);
      fetchData();
    } catch {
      toast.error('Erro ao ajustar bônus');
    }
  };

  if (loading) return <PageLoading />;

  // Summary metrics
  const totalSuggested = calculations.reduce((s, c) => s + (c.suggested_bonus || 0), 0);
  const totalFinal = calculations.reduce((s, c) => s + (c.final_bonus || 0), 0);
  const closedCount = calculations.filter((c) => c.status === 'closed').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cálculos</h1>
        <div className="flex gap-2">
          {isAdmin(user?.role) && (
            <Button onClick={handleSuggest}>
              <Calculator size={16} className="mr-2" /> Calcular Sugestão
            </Button>
          )}
          {isCeo(user?.role) && (
            <Button variant="destructive" onClick={handleCloseAll}>
              <Lock size={16} className="mr-2" /> Fechar Mês
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
          placeholder="Selecione o mês"
        />
      </div>

      {/* Summary Cards */}
      {calculations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg p-2.5 bg-blue-100">
                <Users size={22} className="text-blue-600" />
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
              <div className="rounded-lg p-2.5 bg-purple-100">
                <DollarSign size={22} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sugerido</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSuggested)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg p-2.5 bg-green-100">
                <BarChart3 size={22} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Final</p>
                <p className="text-2xl font-bold">{formatCurrency(totalFinal)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Entregas</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">Bônus Sugerido</TableHead>
                <TableHead className="text-right">Bônus Final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{getUserName(c.user_id)}</TableCell>
                  <TableCell className="text-right">{getUserDeliveries(c.user_id)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(getUserSalary(c.user_id))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.suggested_bonus)}</TableCell>
                  <TableCell className="text-right font-medium">
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
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {filterMonth ? 'Nenhum cálculo para este mês' : 'Selecione um mês para ver os cálculos'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Bônus</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Usuário</span>
                <p className="font-medium">{adjustCalc && getUserName(adjustCalc.user_id)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Entregas</span>
                <p className="font-medium">{adjustCalc && getUserDeliveries(adjustCalc.user_id)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Salário Base</span>
                <p className="font-medium">{adjustCalc && formatCurrency(getUserSalary(adjustCalc.user_id))}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Sugerido</span>
                <p className="font-medium">{adjustCalc && formatCurrency(adjustCalc.suggested_bonus)}</p>
              </div>
            </div>
            <div>
              <Label>Bônus Final</Label>
              <Input
                type="number"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdjust}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
