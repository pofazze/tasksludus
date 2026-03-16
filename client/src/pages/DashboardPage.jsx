import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import {
  CONTENT_TYPE_LABELS,
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
} from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  BarChart3, CheckCircle2, Clock, Target, Trophy, TrendingUp,
  Users, ArrowRight, Package,
} from 'lucide-react';

const PIE_COLORS = ['#9A48EA', '#3B82F6', '#F97316', '#EAB308', '#10B981', '#EC4899', '#6366F1', '#14B8A6'];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [goals, setGoals] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [clients, setClients] = useState([]);

  const isMgmt = isManagement(user?.role);

  const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const month = currentMonth();
        const requests = [
          api.get('/deliveries', { params: { month } }).catch(() => ({ data: [] })),
          api.get('/deliveries/stats').catch(() => ({ data: { total: 0, by_content_type: {}, by_difficulty: {} } })),
          api.get('/ranking', { params: { month } }).catch(() => ({ data: [] })),
        ];

        if (isMgmt) {
          requests.push(
            api.get('/goals', { params: { month } }).catch(() => ({ data: [] })),
            api.get('/users').catch(() => ({ data: [] })),
            api.get('/clients').catch(() => ({ data: [] })),
          );
        }

        const results = await Promise.all(requests);
        setDeliveries(results[0].data);
        setStats(results[1].data);
        setRanking(results[2].data);
        if (results[3]) setGoals(results[3].data);
        if (results[4]) setUsersList(results[4].data);
        if (results[5]) setClients(results[5].data);
      } catch {
        toast.error('Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) return <PageLoading />;

  const totalPublished = deliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const totalInPipeline = deliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const getClientName = (id) => clients.find((c) => c.id === id)?.name;
  const getUserName = (id) => usersList.find((u) => u.id === id)?.name;

  // Pipeline data for chart
  const pipelineData = PIPELINE_ORDER.map((status) => ({
    name: PIPELINE_STATUSES[status],
    total: deliveries.filter((d) => d.status === status).length,
    key: status,
  })).filter((d) => d.total > 0 || ['planejamento', 'captacao', 'design', 'aprovacao', 'publicacao'].includes(d.key));

  // By type for pie
  const byTypeData = Object.entries(stats?.by_content_type || {}).map(([name, count]) => ({
    name: CONTENT_TYPE_LABELS[name] || name,
    value: count,
  }));

  // Workload per user
  const workloadMap = {};
  deliveries.forEach((d) => {
    if (!workloadMap[d.user_id]) workloadMap[d.user_id] = { total: 0, published: 0 };
    workloadMap[d.user_id].total++;
    if (d.status === 'publicacao' || d.status === 'completed') workloadMap[d.user_id].published++;
  });
  const workloadData = Object.entries(workloadMap)
    .map(([uid, data]) => ({
      name: getUserName(uid) || 'Desconhecido',
      total: data.total,
      publicadas: data.published,
    }))
    .sort((a, b) => b.total - a.total);

  // For non-management (producers): personal view
  const myDeliveries = deliveries.filter((d) => d.user_id === user?.id);
  const myPublished = myDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const myInPipeline = myDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;
  const myRank = ranking.find((r) => r.user_id === user?.id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {isMgmt ? (
        /* ========== MANAGEMENT / CEO VIEW ========== */
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/deliveries')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-100">
                  <Package size={22} style={{ color: '#9A48EA' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Total Entregas</p>
                  <p className="text-2xl font-bold">{deliveries.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {totalPublished} publicadas · {totalInPipeline} em produção
                  </p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/users')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-100">
                  <Users size={22} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Equipe Ativa</p>
                  <p className="text-2xl font-bold">{usersList.filter((u) => u.is_active).length}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/goals')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-green-100">
                  <TrendingUp size={22} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Metas Ativas</p>
                  <p className="text-2xl font-bold">{goals.length}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ranking')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-yellow-100">
                  <Trophy size={22} className="text-yellow-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Ranking</p>
                  <p className="text-2xl font-bold">{ranking.length} produtores</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Overview */}
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Pipeline de Produção</h2>
          <div className="flex gap-1 mb-6 overflow-x-auto">
            {PIPELINE_ORDER.map((status) => {
              const count = deliveries.filter((d) => d.status === status).length;
              return (
                <div
                  key={status}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap ${
                    count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  <span className="font-bold text-lg">{count}</span>
                  <span>{PIPELINE_STATUSES[status]}</span>
                </div>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Carga de Trabalho por Pessoa</CardTitle>
              </CardHeader>
              <CardContent>
                {workloadData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={workloadData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} fontSize={12} />
                      <YAxis dataKey="name" type="category" fontSize={12} width={100} />
                      <Tooltip />
                      <Bar dataKey="total" name="Total" fill="#9A48EA" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="publicadas" name="Publicadas" fill="#10B981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Sem dados</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Entregas por Formato</CardTitle>
              </CardHeader>
              <CardContent>
                {byTypeData.length > 0 ? (
                  <div className="flex items-center justify-center gap-6">
                    <ResponsiveContainer width="50%" height={250}>
                      <PieChart>
                        <Pie
                          data={byTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          stroke="none"
                        >
                          {byTypeData.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {byTypeData.map((entry, idx) => (
                        <div key={entry.name} className="flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span>{entry.name}</span>
                          <span className="font-semibold">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ranking + Recent Deliveries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Top Ranking do Mês</CardTitle>
                <button onClick={() => navigate('/ranking')} className="text-sm text-purple-600 hover:underline flex items-center gap-1">
                  Ver completo <ArrowRight size={12} />
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                {ranking.slice(0, 5).map((entry, idx) => (
                  <div key={entry.user_id} className="flex items-center gap-3">
                    <span className={`text-lg font-bold w-6 text-center ${
                      idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-700' : 'text-muted-foreground'
                    }`}>
                      {entry.rank}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={entry.avatar_url} />
                      <AvatarFallback className="text-xs">{initials(entry.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.total_deliveries} entregas</p>
                    </div>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                      {entry.multiplier}x
                    </Badge>
                  </div>
                ))}
                {ranking.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">Sem dados de ranking</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Entregas Recentes</CardTitle>
                <button onClick={() => navigate('/deliveries')} className="text-sm text-purple-600 hover:underline flex items-center gap-1">
                  Ver todas <ArrowRight size={12} />
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                {deliveries.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                        {getUserName(d.user_id) && ` · ${getUserName(d.user_id)}`}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={PIPELINE_STATUS_COLORS[d.status] || (d.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800')}
                    >
                      {PIPELINE_STATUSES[d.status] || d.status}
                    </Badge>
                  </div>
                ))}
                {deliveries.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">Nenhuma entrega este mês</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        /* ========== PRODUCER VIEW ========== */
        <>
          {/* Personal KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/deliveries')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-100">
                  <BarChart3 size={22} className="text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Minhas Entregas</p>
                  <p className="text-2xl font-bold">{myDeliveries.length}</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-green-100">
                  <CheckCircle2 size={22} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Publicadas</p>
                  <p className="text-2xl font-bold">{myPublished}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-100">
                  <Clock size={22} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Em Produção</p>
                  <p className="text-2xl font-bold">{myInPipeline}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ranking')}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-yellow-100">
                  <Trophy size={22} className="text-yellow-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Meu Ranking</p>
                  <p className="text-2xl font-bold">
                    {myRank ? `#${myRank.rank}` : '—'}
                  </p>
                  {myRank && (
                    <p className="text-xs text-muted-foreground">{myRank.multiplier}x multiplicador</p>
                  )}
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Personal pipeline */}
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Meu Pipeline</h2>
          <div className="flex gap-1 mb-6 overflow-x-auto">
            {PIPELINE_ORDER.map((status) => {
              const count = myDeliveries.filter((d) => d.status === status).length;
              return (
                <div
                  key={status}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap ${
                    count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  <span className="font-bold text-lg">{count}</span>
                  <span>{PIPELINE_STATUSES[status]}</span>
                </div>
              );
            })}
          </div>

          {/* Recent deliveries */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Minhas Entregas Recentes</CardTitle>
              <button onClick={() => navigate('/deliveries')} className="text-sm text-purple-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight size={12} />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {myDeliveries.slice(0, 10).map((d) => (
                <div key={d.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={PIPELINE_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-800'}
                  >
                    {PIPELINE_STATUSES[d.status] || d.status}
                  </Badge>
                </div>
              ))}
              {myDeliveries.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhuma entrega este mês</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
