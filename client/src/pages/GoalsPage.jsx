import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/services/api';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Plus, Trash2, Target, TrendingUp } from 'lucide-react';

const EMPTY_TEMPLATE = {
  role: 'producer', producer_type: 'video_editor', name: '',
  monthly_target: '', multiplier_cap: '',
  curve_config: { levels: [{ from: 0, to: 10, multiplier: 1 }] },
};

const EMPTY_GOAL = {
  user_id: '', goal_template_id: '', month: '', monthly_target: '',
  multiplier_cap: '', curve_config: null,
};

export default function GoalsPage() {
  const [templates, setTemplates] = useState([]);
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Template dialog
  const [tplDialog, setTplDialog] = useState(false);
  const [tplEditId, setTplEditId] = useState(null);
  const [tplForm, setTplForm] = useState(EMPTY_TEMPLATE);

  // Goal dialog
  const [goalDialog, setGoalDialog] = useState(false);
  const [goalEditId, setGoalEditId] = useState(null);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL);

  // Goal filters
  const [goalMonth, setGoalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [goalUser, setGoalUser] = useState('');

  const fetchAll = async () => {
    try {
      const [tplRes, usersRes] = await Promise.all([
        api.get('/goals/templates'),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setTemplates(tplRes.data);
      setUsers(usersRes.data);
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchGoals = async () => {
    try {
      const params = {};
      if (goalMonth) params.month = goalMonth + '-01';
      if (goalUser) params.user_id = goalUser;
      const [goalsRes, delRes] = await Promise.all([
        api.get('/goals', { params }),
        api.get('/deliveries', { params: { month: goalMonth ? goalMonth + '-01' : undefined } }).catch(() => ({ data: [] })),
      ]);
      setGoals(goalsRes.data);
      setDeliveries(delRes.data);
    } catch {
      toast.error('Erro ao carregar metas');
    }
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { fetchGoals(); }, [goalMonth, goalUser]);

  // --- Template CRUD ---
  const openNewTemplate = () => {
    setTplEditId(null);
    setTplForm(EMPTY_TEMPLATE);
    setTplDialog(true);
  };

  const openEditTemplate = (t) => {
    setTplEditId(t.id);
    setTplForm({
      role: t.role, producer_type: t.producer_type, name: t.name,
      monthly_target: t.monthly_target, multiplier_cap: t.multiplier_cap,
      curve_config: t.curve_config || { levels: [{ from: 0, to: 10, multiplier: 1 }] },
    });
    setTplDialog(true);
  };

  const saveTemplate = async () => {
    try {
      const payload = {
        ...tplForm,
        monthly_target: Number(tplForm.monthly_target),
        multiplier_cap: Number(tplForm.multiplier_cap),
      };
      if (tplEditId) {
        const { role, producer_type, ...update } = payload;
        await api.put(`/goals/templates/${tplEditId}`, update);
        toast.success('Template atualizado');
      } else {
        await api.post('/goals/templates', payload);
        toast.success('Template criado');
      }
      setTplDialog(false);
      fetchAll();
    } catch {
      toast.error('Erro ao salvar template');
    }
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Excluir template?')) return;
    try {
      await api.delete(`/goals/templates/${id}`);
      toast.success('Template excluído');
      fetchAll();
    } catch {
      toast.error('Erro ao excluir template');
    }
  };

  // Curve editor helpers
  const updateLevel = (idx, field, value) => {
    const levels = [...tplForm.curve_config.levels];
    levels[idx] = { ...levels[idx], [field]: Number(value) };
    setTplForm({ ...tplForm, curve_config: { levels } });
  };

  const addLevel = () => {
    const levels = [...tplForm.curve_config.levels];
    const last = levels[levels.length - 1];
    levels.push({ from: (last?.to || 0) + 1, to: (last?.to || 0) + 10, multiplier: 1 });
    setTplForm({ ...tplForm, curve_config: { levels } });
  };

  const removeLevel = (idx) => {
    const levels = tplForm.curve_config.levels.filter((_, i) => i !== idx);
    setTplForm({ ...tplForm, curve_config: { levels } });
  };

  // --- User Goals CRUD ---
  const openNewGoal = () => {
    setGoalEditId(null);
    setGoalForm({ ...EMPTY_GOAL, month: goalMonth });
    setGoalDialog(true);
  };

  const openEditGoal = (g) => {
    setGoalEditId(g.id);
    setGoalForm({
      user_id: g.user_id, goal_template_id: g.goal_template_id || '',
      month: g.month ? g.month.slice(0, 7) : '',
      monthly_target: g.monthly_target, multiplier_cap: g.multiplier_cap || '',
      curve_config: g.curve_config,
    });
    setGoalDialog(true);
  };

  const saveGoal = async () => {
    try {
      const payload = {
        ...goalForm,
        monthly_target: Number(goalForm.monthly_target),
        month: goalForm.month + '-01',
      };
      if (goalForm.multiplier_cap) payload.multiplier_cap = Number(goalForm.multiplier_cap);
      if (!goalForm.goal_template_id) delete payload.goal_template_id;
      if (!goalForm.curve_config) delete payload.curve_config;

      if (goalEditId) {
        const { user_id, month, goal_template_id, ...update } = payload;
        await api.put(`/goals/${goalEditId}`, update);
        toast.success('Meta atualizada');
      } else {
        await api.post('/goals', payload);
        toast.success('Meta criada');
      }
      setGoalDialog(false);
      fetchGoals();
    } catch {
      toast.error('Erro ao salvar meta');
    }
  };

  const getUserName = (id) => users.find((u) => u.id === id)?.name || '—';

  // Metrics
  const getUserDeliveryCount = (userId) =>
    deliveries.filter((d) => d.user_id === userId && d.status === 'completed').length;

  const goalsWithProgress = goals.map((g) => {
    const done = getUserDeliveryCount(g.user_id);
    const pct = g.monthly_target > 0 ? Math.round((done / g.monthly_target) * 100) : 0;
    return { ...g, done, pct };
  });

  const chartData = goalsWithProgress.map((g) => ({
    name: getUserName(g.user_id).split(' ')[0],
    meta: g.monthly_target,
    entregas: g.done,
  }));

  const totalGoals = goals.length;
  const goalsHit = goalsWithProgress.filter((g) => g.pct >= 100).length;
  const avgProgress = totalGoals > 0
    ? Math.round(goalsWithProgress.reduce((sum, g) => sum + g.pct, 0) / totalGoals)
    : 0;

  if (loading) return <PageLoading />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Metas</h1>

      <Tabs defaultValue="goals">
        <TabsList>
          <TabsTrigger value="goals">Metas do Mês</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* Goals Tab */}
        <TabsContent value="goals">
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-purple-100">
                  <Target size={22} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Metas Ativas</p>
                  <p className="text-2xl font-bold">{totalGoals}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-green-100">
                  <TrendingUp size={22} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Metas Atingidas</p>
                  <p className="text-2xl font-bold">{goalsHit}<span className="text-sm text-muted-foreground font-normal">/{totalGoals}</span></p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-2.5 bg-blue-100">
                  <Target size={22} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Progresso Médio</p>
                  <p className="text-2xl font-bold">{avgProgress}%</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart: Goal vs Deliveries */}
          {chartData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Meta vs Entregas por Usuário</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="meta" name="Meta" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entregas" name="Entregas" fill="#9A48EA" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Filters + Table */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <input
                type="month"
                value={goalMonth}
                onChange={(e) => setGoalMonth(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              />
              <select
                value={goalUser}
                onChange={(e) => setGoalUser(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos os usuários</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={openNewGoal}>
              <Plus size={16} className="mr-2" /> Nova Meta
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Mês</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Entregas</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Mult. Max</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goalsWithProgress.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{getUserName(g.user_id)}</TableCell>
                      <TableCell>{g.month ? g.month.slice(0, 7) : '—'}</TableCell>
                      <TableCell>{g.monthly_target}</TableCell>
                      <TableCell>{g.done}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(g.pct, 100)}%`,
                                backgroundColor: g.pct >= 100 ? '#22C55E' : '#9A48EA',
                              }}
                            />
                          </div>
                          <Badge
                            variant="secondary"
                            className={g.pct >= 100 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                          >
                            {g.pct}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{g.multiplier_cap ? `${g.multiplier_cap}x` : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditGoal(g)}>
                          <Pencil size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {goals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma meta encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-4">
            <Button onClick={openNewTemplate}>
              <Plus size={16} className="mr-2" /> Novo Template
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Meta Mensal</TableHead>
                    <TableHead>Multiplicador Max</TableHead>
                    <TableHead>Níveis</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.producer_type}</TableCell>
                      <TableCell>{t.monthly_target}</TableCell>
                      <TableCell>{t.multiplier_cap}x</TableCell>
                      <TableCell>{t.curve_config?.levels?.length || 0}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditTemplate(t)}>
                            <Pencil size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t.id)}>
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {templates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum template cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={tplDialog} onOpenChange={setTplDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tplEditId ? 'Editar Template' : 'Novo Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
            </div>
            {!tplEditId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Role</Label>
                  <select
                    value={tplForm.role}
                    onChange={(e) => setTplForm({ ...tplForm, role: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="producer">Producer</option>
                  </select>
                </div>
                <div>
                  <Label>Tipo Produtor</Label>
                  <select
                    value={tplForm.producer_type}
                    onChange={(e) => setTplForm({ ...tplForm, producer_type: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="video_editor">Video Editor</option>
                    <option value="designer">Designer</option>
                    <option value="captation">Captação</option>
                    <option value="social_media">Social Media</option>
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meta Mensal</Label>
                <Input
                  type="number"
                  value={tplForm.monthly_target}
                  onChange={(e) => setTplForm({ ...tplForm, monthly_target: e.target.value })}
                />
              </div>
              <div>
                <Label>Multiplicador Máximo</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={tplForm.multiplier_cap}
                  onChange={(e) => setTplForm({ ...tplForm, multiplier_cap: e.target.value })}
                />
              </div>
            </div>

            {/* Curve Config Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Curva J (Níveis)</Label>
                <Button variant="outline" size="sm" onClick={addLevel}>+ Nível</Button>
              </div>
              <div className="space-y-2">
                {tplForm.curve_config.levels.map((level, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="number" placeholder="De"
                      value={level.from}
                      onChange={(e) => updateLevel(idx, 'from', e.target.value)}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      type="number" placeholder="Até"
                      value={level.to ?? ''}
                      onChange={(e) => updateLevel(idx, 'to', e.target.value)}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number" step="0.1" placeholder="Mult"
                      value={level.multiplier}
                      onChange={(e) => updateLevel(idx, 'multiplier', e.target.value)}
                      className="w-24"
                    />
                    {tplForm.curve_config.levels.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLevel(idx)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplDialog(false)}>Cancelar</Button>
            <Button onClick={saveTemplate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal Dialog */}
      <Dialog open={goalDialog} onOpenChange={setGoalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{goalEditId ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!goalEditId && (
              <>
                <div>
                  <Label>Usuário</Label>
                  <select
                    value={goalForm.user_id}
                    onChange={(e) => setGoalForm({ ...goalForm, user_id: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Template (opcional)</Label>
                  <select
                    value={goalForm.goal_template_id}
                    onChange={(e) => setGoalForm({ ...goalForm, goal_template_id: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Nenhum</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Mês</Label>
                  <input
                    type="month"
                    value={goalForm.month}
                    onChange={(e) => setGoalForm({ ...goalForm, month: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meta Mensal</Label>
                <Input
                  type="number"
                  value={goalForm.monthly_target}
                  onChange={(e) => setGoalForm({ ...goalForm, monthly_target: e.target.value })}
                />
              </div>
              <div>
                <Label>Multiplicador Max</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={goalForm.multiplier_cap}
                  onChange={(e) => setGoalForm({ ...goalForm, multiplier_cap: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialog(false)}>Cancelar</Button>
            <Button onClick={saveGoal}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
