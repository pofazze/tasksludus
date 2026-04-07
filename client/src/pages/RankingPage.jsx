import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import PageLoading from '@/components/common/PageLoading';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';

const PODIUM_STYLES = [
  { border: 'border-yellow-400 border-2', bg: 'bg-yellow-500/10', icon: 'text-yellow-400', label: 'Ouro' },
  { border: 'border-zinc-400 border-2', bg: 'bg-zinc-500/10', icon: 'text-zinc-400', label: 'Prata' },
  { border: 'border-amber-500 border-2', bg: 'bg-amber-500/10', icon: 'text-amber-500', label: 'Bronze' },
];

export default function RankingPage() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchRanking = async () => {
    try {
      const [rankRes, settingsRes] = await Promise.all([
        api.get('/ranking', { params: { month: month + '-01' } }),
        api.get('/settings').catch(() => ({ data: [] })),
      ]);
      setRanking(rankRes.data);
      const nameSetting = settingsRes.data.find((s) => s.key === 'ranking_show_names');
      if (nameSetting) setShowNames(nameSetting.value !== false);
    } catch {
      toast.error('Erro ao carregar ranking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); fetchRanking(); }, [month]);

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const displayName = (name) => showNames ? name : initials(name);

  if (loading) return <PageLoading />;

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Ranking</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="native-select"
        />
      </div>

      {/* Podium Top 3 */}
      {top3.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Pódio</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {top3.map((entry, idx) => {
              const style = PODIUM_STYLES[idx];
              return (
                <Card key={entry.user_id} className={`${style.border} ${style.bg}`}>
                  <CardContent className="flex flex-col items-center py-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy size={24} className={style.icon} />
                      <span className="text-xs font-medium text-muted-foreground">{style.label}</span>
                    </div>
                    <span className="text-3xl font-bold">#{entry.rank}</span>
                    <Avatar className="h-14 w-14 mt-3">
                      <AvatarImage src={entry.avatar_url} />
                      <AvatarFallback className="text-lg">{initials(entry.name)}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold mt-2 text-lg">{displayName(entry.name)}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-muted-foreground">{entry.total_deliveries} entregas</span>
                      <Badge variant="secondary" className="bg-purple-500/15 text-purple-400">
                        {entry.multiplier}x
                      </Badge>
                    </div>
                    {entry.bonus != null && entry.bonus > 0 && (
                      <p className="text-sm font-medium text-green-400 mt-1">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.bonus)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Full Table */}
      {ranking.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">Multiplicador</TableHead>
                  {ranking[0]?.bonus != null && <TableHead className="text-right">Bônus</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((entry, idx) => (
                  <TableRow key={entry.user_id} className={idx < 3 ? 'font-medium' : ''}>
                    <TableCell>
                      <span className={`font-bold ${
                        idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-zinc-400' : idx === 2 ? 'text-amber-500' : ''
                      }`}>
                        {entry.rank}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={entry.avatar_url} />
                          <AvatarFallback className="text-xs">{initials(entry.name)}</AvatarFallback>
                        </Avatar>
                        <span>{displayName(entry.name)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{entry.total_deliveries}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="bg-purple-500/15 text-purple-400">
                        {entry.multiplier}x
                      </Badge>
                    </TableCell>
                    {ranking[0]?.bonus != null && (
                      <TableCell className="text-right">
                        {entry.bonus != null
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.bonus)
                          : '—'}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {ranking.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum dado de ranking para este mês
          </CardContent>
        </Card>
      )}
    </div>
  );
}
