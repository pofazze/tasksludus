import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import {
  listScheduledPosts, deleteScheduledPost, publishNow,
} from '@/services/instagram';
import useAuthStore from '@/stores/authStore';
import useServerEvent from '@/hooks/useServerEvent';
import { isManagement } from '@/lib/roles';
import { proxyMediaUrl } from '@/lib/utils';
import PageLoading from '@/components/common/PageLoading';
import ScheduledPostForm from '@/components/instagram/ScheduledPostForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Send,
  Image, Film, Video, Layers, MessageCircle, Loader2, Calendar,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const days = [];
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: new Date(year, month, d), day: d, isCurrentMonth: true });
  }
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startPad - totalDays + 1);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }
  return days;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const STATUS_COLORS = {
  draft: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' },
  scheduled: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-400' },
  publishing: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-400' },
  published: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-400' },
  failed: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-400' },
};

const STATUS_LABELS = {
  draft: 'Rascunho', scheduled: 'Agendado', publishing: 'Publicando',
  published: 'Publicado', failed: 'Falhou',
};

const TYPE_ICONS = { image: Image, video: Video, reel: Film, story: MessageCircle, carousel: Layers };

// ─── Component ────────────────────────────────────────────

export default function ScheduleCalendarPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = isManagement(user?.role) || user?.producer_type === 'social_media';

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
    } catch {
      toast.error('Erro ao carregar posts');
    }
  }, [monthStr, filterClient]);

  useEffect(() => {
    api.get('/clients?is_active=true')
      .then(({ data }) => setClients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

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

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const todayKey = dateKey(new Date());

  const handleDelete = async (postId) => {
    if (!confirm('Excluir este post?')) return;
    try { await deleteScheduledPost(postId); toast.success('Post removido'); fetchPosts(); }
    catch { toast.error('Erro ao remover'); }
  };

  const handlePublishNow = async (postId) => {
    if (!confirm('Publicar agora?')) return;
    try { await publishNow(postId); toast.success('Publicação iniciada'); fetchPosts(); }
    catch { toast.error('Erro ao publicar'); }
  };

  // Stats
  const totalPosts = posts.length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const draftCount = posts.filter(p => p.status === 'draft').length;

  if (loading) return <PageLoading />;

  return (
    <div className="-m-4 md:-m-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">Agenda</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {totalPosts} posts · {scheduledCount} agendados · {publishedCount} publicados · {draftCount} rascunhos
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm text-zinc-700 dark:text-zinc-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none transition-all cursor-pointer"
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {canManage && (
              <button
                onClick={() => { setEditingPost(null); setFormOpen(true); }}
                className="h-9 px-4 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition-all shadow-sm shadow-purple-600/20 flex items-center gap-2 cursor-pointer"
              >
                <Plus size={15} /> Novo Post
              </button>
            )}
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            <ChevronLeft size={18} className="text-zinc-500" />
          </button>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            <ChevronRight size={18} className="text-zinc-500" />
          </button>
        </div>
      </div>

      {/* ── Calendar ──────────────────────────────────────── */}
      <div className="px-4 md:px-6 pb-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider py-3 border-b border-zinc-100 dark:border-zinc-800">
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
              const hasContent = dayPosts.length > 0;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day.date)}
                  className={`
                    relative min-h-[80px] sm:min-h-[110px] p-2 text-left transition-all cursor-pointer
                    border-b border-r border-zinc-100 dark:border-zinc-800/60
                    ${!day.isCurrentMonth ? 'opacity-25' : ''}
                    ${isSelected
                      ? 'bg-purple-50 dark:bg-purple-500/5 ring-1 ring-inset ring-purple-300 dark:ring-purple-500/30'
                      : hasContent
                        ? 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                        : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20'
                    }
                  `}
                >
                  {/* Day number */}
                  <span className={`
                    text-xs font-medium inline-flex items-center justify-center
                    ${isToday
                      ? 'w-6 h-6 rounded-full bg-purple-600 text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                    }
                  `}>
                    {day.day}
                  </span>

                  {/* Post dots / chips */}
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map((p) => {
                      const colors = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
                      const firstMedia = (typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls || [])[0];
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate ${colors.bg} ${colors.text}`}
                        >
                          {firstMedia ? (
                            <img src={proxyMediaUrl(firstMedia)} alt="" className="w-4 h-4 rounded-sm object-cover shrink-0" />
                          ) : (
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
                          )}
                          <span className="truncate hidden sm:inline">{p.client_name || 'Post'}</span>
                        </div>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 pl-1">+{dayPosts.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Selected day detail ──────────────────────────── */}
        {selectedDate && (
          <div className="mt-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Calendar size={14} className="text-purple-500" />
                {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{selectedDayPosts.length} post(s)</span>
            </div>

            {selectedDayPosts.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar size={28} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400 dark:text-zinc-500">Nenhum post neste dia</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {selectedDayPosts.map((p) => {
                  const TypeIcon = TYPE_ICONS[p.post_type] || Image;
                  const colors = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
                  const time = p.scheduled_at
                    ? new Date(p.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                    : null;
                  const mediaUrls = typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls || [];
                  const firstMedia = mediaUrls[0];

                  return (
                    <div key={p.id} className="flex items-start gap-4 px-5 py-4 group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                      {/* Thumbnail */}
                      {firstMedia ? (
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                          <img src={proxyMediaUrl(firstMedia)} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <TypeIcon size={20} className="text-zinc-400 dark:text-zinc-600" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {STATUS_LABELS[p.status] || p.status}
                          </span>
                          {time && <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">{time}</span>}
                          {mediaUrls.length > 1 && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{mediaUrls.length} arquivos</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{p.client_name || 'Post'}</p>
                        {p.caption && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{p.caption}</p>
                        )}
                        {p.ig_permalink && (
                          <a href={p.ig_permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-1 inline-block">
                            Ver no Instagram
                          </a>
                        )}
                        {p.error_message && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{p.error_message}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {canManage && !['published', 'publishing'].includes(p.status) && (
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingPost(p); setFormOpen(true); }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handlePublishNow(p.id)}
                            className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                            title="Publicar agora"
                          >
                            <Send size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form */}
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
