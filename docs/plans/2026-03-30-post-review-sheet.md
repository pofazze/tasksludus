# PostReviewSheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the navigate-away review flow with an inline Sheet drawer that lets users review, edit caption, publish now, or schedule posts — all without leaving the ClientProfilePage.

**Architecture:** Create a new `PostReviewSheet.jsx` component that receives a post object from AgendamentoTab, displays media preview + editable caption, and provides actions (Publicar Agora, Agendar, Salvar Rascunho). The "Agendar" action reveals an inline DateTimePicker inside the sheet. Then update AgendamentoTab to open this sheet instead of navigating to `/schedule/:id`.

**Tech Stack:** React 19, Shadcn Sheet (base-ui), CarouselPreview (embla), DateTimePicker (react-day-picker), existing instagram.js service APIs, Sonner toasts.

---

### Task 1: Create PostReviewSheet component

**Files:**
- Create: `client/src/components/instagram/PostReviewSheet.jsx`

**Step 1: Create the PostReviewSheet component file**

Create `client/src/components/instagram/PostReviewSheet.jsx` with this content:

```jsx
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { updateScheduledPost, publishNow } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
  SheetDescription, SheetBody, SheetFooter,
} from '@/components/ui/sheet';
import { CarouselPreview } from '@/components/instagram/CarouselPreview';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, ExternalLink, Loader2, Send, Save,
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-zinc-500/15 text-zinc-400' },
  scheduled: { label: 'Agendado', color: 'bg-amber-500/15 text-amber-400' },
  publishing: { label: 'Publicando', color: 'bg-blue-500/15 text-blue-400' },
  published: { label: 'Publicado', color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Erro', color: 'bg-red-500/15 text-red-400' },
};

export default function PostReviewSheet({ post, open, onOpenChange, onUpdated }) {
  const [caption, setCaption] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Reset state when a new post opens
  const postId = post?.id;
  const [lastPostId, setLastPostId] = useState(null);
  if (postId && postId !== lastPostId) {
    setLastPostId(postId);
    setCaption(post.caption || '');
    setScheduling(false);
    setScheduledAt(post.scheduled_at || '');
    setSaving(false);
    setPublishing(false);
  }

  const media = useMemo(() => {
    if (!post) return [];
    const urls = typeof post.media_urls === 'string'
      ? JSON.parse(post.media_urls)
      : (post.media_urls || []);
    return urls.map((url) => ({
      url: typeof url === 'string' ? url : url.url || url,
      type: (typeof url === 'object' && url.type) || 'image',
    }));
  }, [post]);

  const readOnly = post && ['published', 'publishing'].includes(post.status);
  const format = post?.delivery_content_type || post?.post_type;
  const formatLabel = format ? (CONTENT_TYPE_LABELS[format] || format) : null;
  const status = post ? (STATUS_CONFIG[post.status] || STATUS_CONFIG.draft) : null;
  const clickupUrl = post?.clickup_task_id
    ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await updateScheduledPost(post.id, { caption, scheduled_at: null });
      toast.success('Rascunho salvo');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar rascunho');
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      toast.error('Selecione uma data e horário');
      return;
    }
    setSaving(true);
    try {
      await updateScheduledPost(post.id, { caption, scheduled_at: scheduledAt });
      toast.success('Post agendado');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao agendar');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishNow() {
    setPublishing(true);
    try {
      // Save caption first if changed
      if (caption !== (post.caption || '')) {
        await updateScheduledPost(post.id, { caption });
      }
      await publishNow(post.id);
      toast.success('Publicação iniciada');
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error('Erro ao publicar');
    } finally {
      setPublishing(false);
    }
  }

  if (!post) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{post.delivery_title || 'Revisar Post'}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={status.color + ' text-xs'}>
              {status.label}
            </Badge>
            {formatLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {formatLabel}
              </span>
            )}
            {clickupUrl && (
              <a
                href={clickupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-purple-400 hover:underline flex items-center gap-0.5"
              >
                <ExternalLink size={10} /> ClickUp
              </a>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* Media Preview */}
          <CarouselPreview media={media} className="mb-4" />

          {/* Caption */}
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Legenda
          </label>
          {readOnly ? (
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">{caption || '—'}</p>
          ) : (
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Escreva a legenda do post..."
              className="w-full rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[#9A48EA] focus:ring-1 focus:ring-[#9A48EA]/50 outline-none resize-none"
            />
          )}

          {/* Inline DateTimePicker for scheduling */}
          {scheduling && !readOnly && (
            <div className="mt-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
              <p className="text-sm font-medium text-zinc-300 mb-2">Selecionar data e horário</p>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleSchedule}
                  disabled={saving || !scheduledAt}
                  className="bg-[#9A48EA] hover:bg-[#B06AF0] text-white"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Confirmar Agendamento</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScheduling(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </SheetBody>

        {!readOnly && (
          <SheetFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Salvar Rascunho</span>
            </Button>
            {!scheduling && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScheduling(true)}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Agendar</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublishNow}
                  disabled={publishing}
                  className="bg-[#9A48EA] hover:bg-[#B06AF0] text-white"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Publicar Agora</span>
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Verify build**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (file is created but not imported yet, so no errors)

**Step 3: Commit**

```bash
git add client/src/components/instagram/PostReviewSheet.jsx
git commit -m "feat: add PostReviewSheet component with inline review, schedule, publish"
```

---

### Task 2: Wire PostReviewSheet into AgendamentoTab

**Files:**
- Modify: `client/src/components/instagram/AgendamentoTab.jsx`

**Step 1: Replace navigate with sheet open**

In `AgendamentoTab.jsx`, make these changes:

1. Remove the `useNavigate` import and `navigate` usage
2. Add state for the sheet (`reviewPost`, `sheetOpen`)
3. Import `PostReviewSheet`
4. Replace `onReview={() => navigate(...)}` with `onReview={() => openSheet(post)}`
5. Render `<PostReviewSheet>` at the bottom

The complete updated file:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { listScheduledPosts } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PostReviewSheet from '@/components/instagram/PostReviewSheet';
import {
  Calendar, ChevronDown, ChevronRight, Clock, ExternalLink,
  FileText, Image, Loader2, Send,
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-zinc-500/15 text-zinc-400' },
  scheduled: { label: 'Agendado', color: 'bg-amber-500/15 text-amber-400' },
  publishing: { label: 'Publicando', color: 'bg-blue-500/15 text-blue-400' },
  published: { label: 'Publicado', color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { label: 'Erro', color: 'bg-red-500/15 text-red-400' },
};

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function mediaCount(post) {
  const urls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);
  return urls.length;
}

export default function AgendamentoTab({ clientId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [reviewPost, setReviewPost] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchPosts = async () => {
    try {
      const data = await listScheduledPosts({ client_id: clientId });
      setPosts(data);
    } catch {
      toast.error('Erro ao carregar posts agendados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [clientId]);

  const postEvents = useMemo(() => ['post:updated', 'delivery:updated'], []);
  useServerEvent(postEvents, fetchPosts);

  const drafts = useMemo(() => posts.filter((p) => p.status === 'draft'), [posts]);
  const scheduled = useMemo(() => posts.filter((p) => p.status === 'scheduled'), [posts]);
  const published = useMemo(
    () => posts.filter((p) => ['published', 'publishing', 'failed'].includes(p.status)),
    [posts]
  );

  function openSheet(post) {
    setReviewPost(post);
    setSheetOpen(true);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Calendar size={40} className="mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Nenhum post para agendar</p>
        <p className="text-sm text-muted-foreground">
          Posts aparecem aqui quando tarefas chegam na fase &quot;Agendamento&quot; no ClickUp.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pendentes (Drafts) */}
      <Section title="Pendentes" count={drafts.length} icon={<FileText size={16} />} defaultOpen>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum rascunho pendente</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => openSheet(post)} />
            ))}
          </div>
        )}
      </Section>

      {/* Agendados (Scheduled) */}
      <Section title="Agendados" count={scheduled.length} icon={<Clock size={16} />} defaultOpen>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum post agendado</p>
        ) : (
          <div className="space-y-2">
            {scheduled.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => openSheet(post)} />
            ))}
          </div>
        )}
      </Section>

      {/* Publicados (Published) — collapsible */}
      {published.length > 0 && (
        <Section
          title="Publicados"
          count={published.length}
          icon={<Send size={16} />}
          defaultOpen={false}
          open={publishedOpen}
          onToggle={() => setPublishedOpen((o) => !o)}
        >
          <div className="space-y-2">
            {published.map((post) => (
              <PostCard key={post.id} post={post} onReview={() => openSheet(post)} readOnly />
            ))}
          </div>
        </Section>
      )}

      {/* Review Sheet */}
      <PostReviewSheet
        post={reviewPost}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={fetchPosts}
      />
    </div>
  );
}

// ─── Section ────────────────────────────────────────────────

function Section({ title, count, icon, defaultOpen = true, open: controlledOpen, onToggle, children }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const toggle = onToggle || (() => setInternalOpen((o) => !o));

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-2 mb-3 group cursor-pointer"
      >
        {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </button>
      {isOpen && children}
    </div>
  );
}

// ─── PostCard ───────────────────────────────────────────────

function PostCard({ post, onReview, readOnly }) {
  const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const count = mediaCount(post);
  const format = post.delivery_content_type || post.post_type;
  const formatLabel = CONTENT_TYPE_LABELS[format] || format;
  const clickupUrl = post.clickup_task_id ? `https://app.clickup.com/t/${post.clickup_task_id}` : null;

  return (
    <Card className="hover:border-zinc-600 transition-colors">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {post.delivery_title || post.caption?.slice(0, 60) || 'Sem título'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className={status.color + ' text-xs'}>
                {status.label}
              </Badge>
              {formatLabel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {formatLabel}
                </span>
              )}
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Image size={10} /> {count}
                </span>
              )}
              {post.scheduled_at && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock size={10} /> {fmtDateTime(post.scheduled_at)}
                </span>
              )}
              {clickupUrl && (
                <a
                  href={clickupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-purple-400 hover:underline flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} /> ClickUp
                </a>
              )}
            </div>
          </div>

          {/* Action */}
          <Button variant="outline" size="sm" onClick={onReview}>
            {readOnly ? 'Ver' : 'Revisar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

Key changes from original:
- Line 2: Removed `import { useNavigate } from 'react-router-dom';`
- Line 10: Added `import PostReviewSheet from '@/components/instagram/PostReviewSheet';`
- Line 32: Removed `const navigate = useNavigate();`
- Lines 37-38: Added `reviewPost` and `sheetOpen` state
- Lines 62-65: Added `openSheet` function
- Lines 90, 103, 121: Changed `onReview={() => navigate(...)}` to `onReview={() => openSheet(post)}`
- Lines 127-132: Added `<PostReviewSheet>` render

**Step 2: Verify build**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors

**Step 3: Verify in browser**

Run: `cd client && npx vite dev`

1. Open a client page with posts in Agendamento tab
2. Click "Revisar" — should open a sheet drawer from the right (NOT navigate away)
3. Sheet shows media preview, editable caption, status badge, format label
4. Footer shows: Salvar Rascunho, Agendar, Publicar Agora buttons
5. Click "Agendar" — DateTimePicker appears inline in the sheet
6. Select a date and click "Confirmar Agendamento" — post status changes to "scheduled"
7. Close sheet — list re-fetches and reflects updated status

**Step 4: Commit**

```bash
git add client/src/components/instagram/AgendamentoTab.jsx
git commit -m "feat: wire PostReviewSheet into AgendamentoTab, replace navigate with sheet"
```

---

### Task 3: Remove dead PostReviewPage route (cleanup)

**Files:**
- Modify: `client/src/App.jsx` (or wherever `/schedule/:id` route is defined)

**Step 1: Check if `/schedule/:id` route exists and remove it**

Search for the route definition:
```bash
grep -rn "schedule/:id\|PostReviewPage" client/src/
```

If a route like `<Route path="/schedule/:id" element={<PostReviewPage />} />` exists, remove it and its import. The page is no longer needed since we use the inline Sheet.

**Step 2: Verify build**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused PostReviewPage route (replaced by inline sheet)"
```
