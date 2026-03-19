import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { ROLE_LABELS, PRODUCER_TYPE_LABELS } from '@/lib/constants';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Save, X } from 'lucide-react';

const ROLES = [
  { key: 'director', label: ROLE_LABELS.director, color: 'bg-blue-500/15 text-blue-400' },
  { key: 'manager', label: ROLE_LABELS.manager, color: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'account_manager', label: ROLE_LABELS.account_manager, color: 'bg-yellow-500/15 text-yellow-400' },
  { key: 'producer:video_editor', label: PRODUCER_TYPE_LABELS.video_editor, color: 'bg-orange-500/15 text-orange-400' },
  { key: 'producer:designer', label: PRODUCER_TYPE_LABELS.designer, color: 'bg-violet-500/15 text-violet-400' },
  { key: 'producer:captation', label: PRODUCER_TYPE_LABELS.captation, color: 'bg-sky-500/15 text-sky-400' },
  { key: 'producer:social_media', label: PRODUCER_TYPE_LABELS.social_media, color: 'bg-pink-500/15 text-pink-400' },
];

export default function SalariesPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValues, setEditValues] = useState({ salary: '', expected_deliveries: '' });
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/settings');
      const roleSettings = {};
      // Parse role settings from app settings
      for (const s of data) {
        if (s.key?.startsWith('role:')) {
          try {
            roleSettings[s.key] = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
          } catch {
            roleSettings[s.key] = s.value;
          }
        }
      }
      setSettings(roleSettings);
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const getRoleData = (roleKey) => {
    const key = `role:${roleKey}`;
    return settings[key] || { salary: 0, expected_deliveries: 0 };
  };

  const startEdit = (roleKey) => {
    const data = getRoleData(roleKey);
    setEditingKey(roleKey);
    setEditValues({
      salary: data.salary || '',
      expected_deliveries: data.expected_deliveries || '',
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValues({ salary: '', expected_deliveries: '' });
  };

  const saveRole = async (roleKey) => {
    setSaving(true);
    try {
      const value = {
        salary: Number(editValues.salary) || 0,
        expected_deliveries: Number(editValues.expected_deliveries) || 0,
      };
      await api.put(`/settings/role:${roleKey}`, { value });
      setSettings((prev) => ({ ...prev, [`role:${roleKey}`]: value }));
      toast.success('Cargo atualizado');
      setEditingKey(null);
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, roleKey) => {
    if (e.key === 'Enter') saveRole(roleKey);
    if (e.key === 'Escape') cancelEdit();
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Cargos</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Salário Base</TableHead>
                <TableHead className="text-right">Produção Esperada/mês</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLES.map(({ key, label, color }) => {
                const data = getRoleData(key);
                const isEditing = editingKey === key;

                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Badge variant="secondary" className={color}>
                        {label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-muted-foreground text-sm">R$</span>
                          <Input
                            type="number"
                            value={editValues.salary}
                            onChange={(e) => setEditValues({ ...editValues, salary: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, key)}
                            className="w-28 text-right h-8"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className={!data.salary ? 'text-muted-foreground' : ''}>
                          {data.salary ? formatCurrency(data.salary) : 'Não definido'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValues.expected_deliveries}
                          onChange={(e) => setEditValues({ ...editValues, expected_deliveries: e.target.value })}
                          onKeyDown={(e) => handleKeyDown(e, key)}
                          className="w-24 text-right h-8 ml-auto"
                          placeholder="0"
                        />
                      ) : (
                        <span className={!data.expected_deliveries ? 'text-muted-foreground' : ''}>
                          {data.expected_deliveries || '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} disabled={saving}>
                            <X size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
                            onClick={() => saveRole(key)}
                            disabled={saving}
                          >
                            <Save size={14} />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(key)}>
                          <Pencil size={14} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
