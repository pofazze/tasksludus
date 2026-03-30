import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import {
  listScheduledPosts, deleteScheduledPost, publishNow,
} from '@/services/instagram';
import useAuthStore from '@/stores/authStore';
import useServerEvent from '@/hooks/useServerEvent';
import { isManagement } from '@/lib/roles';
import PageLoading from '@/components/common/PageLoading';
import ScheduledPostForm from '@/components/instagram/ScheduledPostForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, Send,
  Image, Film, Video, Layers, MessageCircle, Loader2, CalendarDays,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const days = [];
  // Previous month padding
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: new Date(year, month, d), day: d, isCurrentMonth: true });
  }
  // Next month padding (fill to 42 = 6 weeks)
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startPad - totalDays + 1);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }

  return days;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const STATUS_STYLES = {
  draft: 'bg-zinc-700/40 text-zinc-400',
  scheduled: 'bg-purple-500/15 text-purple-400',
  publishing: 'bg-amber-500/15 text-amber-400',
  published: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-zinc-600/30 text-zinc-500',
};

const STATUS_LABELS = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const TYPE_ICONS = {
  image: Image,
  video: Video,
  reel: Film,
  story: MessageCircle,
  carousel: Layers,
};

// ─── Component ────────────────────────────────────────────

export default function ScheduleCalendarPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role) || user?.producer_type === 'social_media';
  const navigate = useNavigate();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [posts, setPosts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const fetchPosts = useCallback(async () => {
    try {
      const params = { month: monthStr };
      if (filterClient) params.client_id = filterClient;
      const data = await listScheduledPosts(params);
      setPosts(data);
    } catch (err) {
      console.error('fetchPosts error:', err);
      toast.error('Erro ao carregar posts agendados');
    }
  }, [monthStr, filterClient]);

  // Load clients once on mount
  useEffect(() => {
    api.get('/clients?is_active=true')
      .then(({ data }) => setClients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch posts whenever month or client filter changes
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Re-fetch when server pushes post events
  const postEvents = useMemo(() => ['post:updated', 'delivery:updated'], []);
  useServerEvent(postEvents, fetchPosts);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const postsByDate = useMemo(() => {
    const map = {};
    for (const p of posts) {
      const d = p.scheduled_at ? new Date(p.scheduled_at) : new Date(p.created_at);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [posts]);

  const selectedDayPosts = useMemo(() => {
    if (!selectedDate) return [];
    return postsByDate[dateKey(selectedDate)] || [];
  }, [selectedDate, postsByDate]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const today = new Date();
  const todayKey = dateKey(today);

  const handleDelete = async (postId) => {
    if (!confirm('Excluir este post agendado?')) return;
    try {
      await deleteScheduledPost(postId);
      toast.success('Post removido');
      fetchPosts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    }
  };

  const handlePublishNow = async (postId) => {
    if (!confirm('Publicar este post agora?')) return;
    try {
      await publishNow(postId);
      toast.success('Publicação iniciada');
      fetchPosts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao publicar');
    }
  };

  const openNewPost = () => {
    setEditingPost(null);
    setFormOpen(true);
  };

  const openEditPost = (post) => {
    setEditingPost(post);
    setFormOpen(true);
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Agenda Instagram</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Calendário de publicações</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openNewPost}>
            <Plus size={14} className="mr-1.5" /> Novo Post
          </Button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="bg-transparent border border-zinc-700 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="mb-6">
        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const key = dateKey(day.date);
              const dayPosts = postsByDate[key] || [];
              const isToday = key === todayKey;
              const isSelected = selectedDate && key === dateKey(selectedDate);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={`relative min-h-[100px] p-1.5 border-b border-r border-zinc-800/50 text-left transition-colors cursor-pointer ${
                    !day.isCurrentMonth ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-purple-500/8 ring-1 ring-inset ring-purple-500/30' : 'hover:bg-white/[0.02]'}`}
                >
                  <span className={`text-xs font-medium block mb-1 ${
                    isToday ? 'bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center' : 'text-muted-foreground'
                  }`}>
                    {day.day}
                  </span>

                  {/* Post chips */}
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map((p) => {
                      const TypeIcon = TYPE_ICONS[p.post_type] || Image;
                      return (
                        <div
                          key={p.id}
                          onClick={(e) => { e.stopPropagation(); navigate(`/schedule/${p.id}`); }}
                          className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:brightness-125 ${STATUS_STYLES[p.status] || 'bg-zinc-800'}`}
                        >
                          <TypeIcon size={9} className="shrink-0" />
                          <span className="truncate">{p.client_name || 'Post'}</span>
                        </div>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-muted-foreground pl-1">
                        +{dayPosts.length - 3} mais
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail */}
      {selectedDate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays size={14} />
                {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <span className="text-xs text-muted-foreground">{selectedDayPosts.length} post(s)</span>
            </div>

            {selectedDayPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum post neste dia</p>
            ) : (
              <div className="space-y-3">
                {selectedDayPosts.map((p) => {
                  const TypeIcon = TYPE_ICONS[p.post_type] || Image;
                  const time = p.scheduled_at
                    ? new Date(p.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const mediaCount = (typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls || []).length;

                  return (
                    <div key={p.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 p-3 hover:border-zinc-700 transition-colors">
                      {/* Thumbnail placeholder */}
                      <div className="w-12 h-12 rounded-md bg-zinc-800/50 flex items-center justify-center shrink-0">
                        <TypeIcon size={20} className="text-zinc-500" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="secondary" className={`text-[10px] ${STATUS_STYLES[p.status]}`}>
                            {STATUS_LABELS[p.status] || p.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{time}</span>
                          {mediaCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">{mediaCount} arquivo(s)</span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{p.client_name || 'Post'}</p>
                        {p.caption && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.caption}</p>
                        )}
                        {p.ig_permalink && (
                          <a
                            href={p.ig_permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:underline mt-1 inline-block"
                          >
                            Ver no Instagram
                          </a>
                        )}
                        {p.error_message && (
                          <p className="text-xs text-red-400 mt-1">{p.error_message}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {canManage && !['published', 'publishing'].includes(p.status) && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/schedule/${p.id}`)} title="Editar">
                            <Edit2 size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            onClick={() => handlePublishNow(p.id)}
                            title="Publicar agora"
                          >
                            <Send size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleDelete(p.id)}
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form Dialog */}
      <ScheduledPostForm
        open={formOpen}
        onOpenChange={setFormOpen}
        post={editingPost}
        clients={clients}
        onSaved={fetchPosts}
      />
    </div>
  );
}
