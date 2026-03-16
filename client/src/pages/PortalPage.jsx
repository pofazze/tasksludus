import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { CONTENT_TYPE_LABELS, PIPELINE_STATUSES, PIPELINE_STATUS_COLORS } from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, CheckCircle2, Clock } from 'lucide-react';

export default function PortalPage() {
  const user = useAuthStore((s) => s.user);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeliveries = async () => {
    try {
      // TODO: backend should auto-filter by client association for role=client
      const { data } = await api.get('/deliveries');
      setDeliveries(data);
    } catch {
      toast.error('Erro ao carregar entregas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeliveries(); }, []);

  if (loading) return <PageLoading />;

  const published = deliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const inPipeline = deliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Portal do Cliente</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-4 py-6">
            <Clock size={28} className="text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Em Produção</p>
              <p className="text-2xl font-bold">{inPipeline}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-6">
            <CheckCircle2 size={28} className="text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Publicadas</p>
              <p className="text-2xl font-bold">{published}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-6">
            <Package size={28} style={{ color: '#9A48EA' }} />
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{deliveries.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entregas Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.slice(0, 20).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[d.status] || ''}>
                      {PIPELINE_STATUSES[d.status] || d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.month ? d.month.slice(0, 7) : '—'}</TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma entrega encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="py-8 text-center text-muted-foreground">
          Mais funcionalidades em breve
        </CardContent>
      </Card>
    </div>
  );
}
