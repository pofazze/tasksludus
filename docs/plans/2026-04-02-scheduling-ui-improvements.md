# Scheduling UI Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix timezone bug, catbox 429, video editor auto-assign; improve PostReviewSheet (resizable, media names, previews, add media, cover selector); tabs for AgendamentoTab; overlay DateTimePicker.

**Architecture:** Client-side React components with Tailwind v4. Server Express + Knex. No test suite exists — verify manually. All times treated as America/Sao_Paulo (UTC-3). Catbox uploads serialized with retry/fallback.

**Tech Stack:** React 19, Tailwind v4, Shadcn/ui, Lucide icons, date-fns, Express 4, Knex, BullMQ

---

## Phase 1: Bug Fixes (Server + Client)

### Task 1: Fix Timezone Bug

The DateTimePicker emits `"yyyy-MM-dd'T'HH:mm"` without timezone. The server stores it and when read back, `new Date()` interprets it as UTC, shifting -3h on display.

**Files:**
- Modify: `client/src/components/ui/date-time-picker.jsx:36-41` (emitChange)
- Modify: `client/src/components/instagram/PostReviewSheet.jsx:62` (scheduledAt init)
- Modify: `client/src/components/instagram/AgendamentoTab.jsx:23-24` (fmtDateTime)

**Step 1: Fix DateTimePicker to emit with Brasília timezone offset**

In `date-time-picker.jsx`, change `emitChange` to append `-03:00`:

```jsx
function emitChange(date) {
  if (onChange) {
    // Emit as Brasília time (UTC-3) — the app is 100% BR
    const str = format(date, "yyyy-MM-dd'T'HH:mm") + '-03:00';
    onChange(str);
  }
}
```

**Step 2: Fix PostReviewSheet scheduledAt initialization**

In `PostReviewSheet.jsx` line 62, when loading `post.scheduled_at`, parse it properly. The stored value may be UTC or have timezone. We need to display as Brasília time:

```jsx
// In the reset block (line 62), convert stored UTC to local display value
const storedDate = post.scheduled_at;
if (storedDate) {
  // Parse as Date and format for the picker (it expects yyyy-MM-dd'T'HH:mm with offset)
  const d = new Date(storedDate);
  // Convert to Brasília: get UTC time, subtract 3 hours
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  // But only if the stored value is UTC (no offset). If it already has -03:00, Date parses correctly.
  // Safest: always use the Date object which handles timezone, then format as BRT
  setScheduledAt(post.scheduled_at);
} else {
  setScheduledAt('');
}
```

Actually simpler: since DateTimePicker now emits with `-03:00`, and the server stores the full ISO string, `new Date(post.scheduled_at)` will parse correctly. The DateTimePicker `dateValue` memo already does `new Date(value)` which handles timezone offsets. The display `format()` uses the local Date methods which show BRT on a BRT browser. **No change needed in PostReviewSheet** — the fix is entirely in the emitChange.

**Step 3: Fix fmtDateTime in AgendamentoTab**

The `fmtDateTime` at line 23-24 uses `toLocaleString('pt-BR')` which already converts to local time. Once the server stores with proper timezone, this will work correctly. Verify by adding `timeZone: 'America/Sao_Paulo'` for safety:

```jsx
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }) : '—';
```

**Step 4: Verify manually**

1. Open a draft post, set time to 14:00
2. Save and refresh — should still show 14:00
3. Check database: should have `2026-04-02T14:00:00-03:00` or equivalent UTC `17:00:00Z`

**Step 5: Commit**

```
fix: handle Brasília timezone in scheduling date picker
```

---

### Task 2: Fix Catbox 429 — Retry + Serialize Uploads

**Files:**
- Modify: `server/src/modules/instagram/instagram-publish.service.js:40-50` (media URL mapping)
- Modify: `server/src/modules/instagram/instagram-publish.service.js:312-332` (_uploadToTempStorage)

**Step 1: Add retry with backoff to _uploadToTempStorage**

In `instagram-publish.service.js`, wrap the upload in a retry loop:

```javascript
async _uploadToTempStorage(buffer, filename, contentType) {
  const blob = new Blob([buffer], { type: contentType });

  const MAX_RETRIES = 3;
  const BACKOFF_MS = [2000, 4000, 8000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '1h');
    formData.append('fileToUpload', blob, filename);

    if (attempt > 0) {
      logger.info('Retrying temp storage upload', { attempt, filename, delay: BACKOFF_MS[attempt - 1] });
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }

    logger.info('Uploading to temp storage', { filename, contentType, sizeMB: (buffer.length / 1024 / 1024).toFixed(1), attempt });
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: formData,
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      logger.warn('Temp storage rate limited (429), will retry', { attempt, filename });
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      if (attempt < MAX_RETRIES) continue;
      throw new Error(`Temp storage upload failed after ${MAX_RETRIES} retries: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const url = (await res.text()).trim();
    if (!url.startsWith('http')) {
      if (attempt < MAX_RETRIES) continue;
      throw new Error(`Temp storage error: ${url.slice(0, 200)}`);
    }
    return url;
  }
}
```

**Step 2: Serialize media downloads (sequential instead of parallel)**

In `executeScheduledPost`, change the `Promise.all` media mapping (~line 40-50) to sequential:

Find the existing code that does:
```javascript
mediaUrls = await Promise.all(mediaUrls.map(async (m) => {
```

Replace with sequential loop:
```javascript
const resolvedMedia = [];
for (const m of mediaUrls) {
  const { url: tempUrl, token } = await this._prepareTempMediaUrl(m.url);
  tempTokens.push(token);
  resolvedMedia.push({ ...m, url: tempUrl });
}
mediaUrls = resolvedMedia;
```

Also serialize the thumbnail download (it's already sequential, just verify).

**Step 3: Verify**

Trigger a carousel publish with 3+ images. Check logs for sequential uploads without 429 errors.

**Step 4: Commit**

```
fix: serialize catbox uploads and add retry with backoff for 429
```

---

### Task 3: Auto-Assign Video Editor by Folder

**Files:**
- Modify: `server/src/modules/webhooks/automations/auto-assign.js:16-30` (PHASE_ASSIGNEE_MAP)
- Modify: `server/src/modules/webhooks/automations/auto-assign.js:50-125` (run function)

**Step 1: Add folder-based mapping**

Replace the single `PHASE_ASSIGNEE_MAP` with a system that checks folder for video editing:

```javascript
const LUDUS_HEALTH_FOLDER = '90117692608';
const LUDUS_EXPERTS_FOLDER = '90117692609';

// Video editor per folder
const VIDEO_EDITOR_BY_FOLDER = {
  [LUDUS_HEALTH_FOLDER]: '152562683',   // Victor Costa
  [LUDUS_EXPERTS_FOLDER]: '284598399',  // Filipe Sabino
};

// Default phase mapping (everything except video editing)
const PHASE_ASSIGNEE_MAP = {
  'planejamento':     '284598101',  // Aléxia Sâmella
  'captação':         '284598399',  // Filipe Sabino
  'captacao':         '284598399',  // Filipe Sabino
  'estruturação':     '284598101',  // Aléxia Sâmella
  'estruturacao':     '284598101',  // Aléxia Sâmella
  'design':           '284596872',  // Pedro Torres
  'aprovação':        '61001382',   // Wander Fran
  'aprovacao':        '61001382',   // Wander Fran
  'agendamento':      '284598101',  // Aléxia Sâmella
  'publicação':       '284598101',  // Aléxia Sâmella
  'publicacao':       '284598101',  // Aléxia Sâmella
};

const VIDEO_EDITING_STATUSES = ['edição de vídeo', 'edicao de video'];
```

**Step 2: Update run() to resolve video editor by folder**

In the `run` function, after getting `normalized`, resolve the assignee:

```javascript
let assigneeId;
if (VIDEO_EDITING_STATUSES.includes(normalized)) {
  const folderId = task.folder?.id;
  assigneeId = VIDEO_EDITOR_BY_FOLDER[folderId];
  if (!assigneeId) {
    // Fallback to Victor if folder unknown
    assigneeId = '152562683';
    logger.warn('auto-assign: unknown folder for video editing, defaulting to Victor', { folderId, clickupTaskId });
  }
} else {
  assigneeId = PHASE_ASSIGNEE_MAP[normalized];
}

if (!assigneeId) {
  return { executed: false, reason: `no mapping for status "${normalized}"` };
}
```

**Step 3: Update NAMES map**

Already has both Victor and Filipe. No change needed.

**Step 4: Verify**

Check logs when a Ludus Experts task enters "edição de vídeo" — should assign Filipe instead of Victor.

**Step 5: Commit**

```
feat: assign video editor by ClickUp folder (Victor=Health, Filipe=Experts)
```

---

## Phase 2: UI Foundation

### Task 4: DateTimePicker as Overlay

**Files:**
- Modify: `client/src/components/ui/date-time-picker.jsx:78-136` (popup rendering)

**Step 1: Change dropdown to centered overlay**

Replace the `absolute top-full` positioned div with a fixed centered overlay + backdrop:

```jsx
{open && (
  <>
    {/* Backdrop */}
    <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
    {/* Calendar overlay - centered */}
    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl p-4 w-[300px]">
      <DayPicker ... />
      {/* Time picker */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
        ...existing time picker...
      </div>
    </div>
  </>
)}
```

Remove the `ref` and click-outside handler since backdrop handles closing. Keep the `ref` on the button for accessibility.

**Step 2: Verify**

Open PostReviewSheet, click date picker — should appear centered as overlay with dark backdrop.

**Step 3: Commit**

```
feat: date time picker as centered overlay instead of dropdown
```

---

### Task 5: AgendamentoTab — Tabs Instead of Collapsible Sections

**Files:**
- Modify: `client/src/components/instagram/AgendamentoTab.jsx:87-141` (render section)

**Step 1: Replace Section components with tabs**

Replace the entire render block (lines 87-141) with a tab-based UI:

```jsx
const [activeTab, setActiveTab] = useState('draft');

const tabs = [
  { key: 'draft', label: 'Pendentes', count: drafts.length, icon: FileText },
  { key: 'scheduled', label: 'Agendados', count: scheduled.length, icon: Clock },
  { key: 'published', label: 'Publicados', count: published.length, icon: Send },
];

const activePosts = activeTab === 'draft' ? drafts
  : activeTab === 'scheduled' ? scheduled
  : published;

return (
  <div className="space-y-4">
    {/* Tab bar */}
    <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
              isActive
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Icon size={14} />
            {tab.label}
            <Badge variant="secondary" className={cn('text-[10px] ml-1', isActive ? 'bg-zinc-700' : 'bg-zinc-800/50')}>
              {tab.count}
            </Badge>
          </button>
        );
      })}
    </div>

    {/* Tab content */}
    {activePosts.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {activeTab === 'draft' ? 'Nenhum rascunho pendente'
          : activeTab === 'scheduled' ? 'Nenhum post agendado'
          : 'Nenhum post publicado'}
      </p>
    ) : (
      <div className="space-y-2">
        {activePosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onReview={() => openSheet(post)}
            readOnly={activeTab === 'published'}
          />
        ))}
      </div>
    )}

    <PostReviewSheet post={reviewPost} open={sheetOpen} onOpenChange={setSheetOpen} onUpdated={fetchPosts} />
  </div>
);
```

Remove the `Section` component (lines 146-164), the `publishedOpen` state (line 34), and unused imports (`ChevronDown`, `ChevronRight`).

Add `cn` import from `@/lib/utils`.

**Step 2: Verify**

Open a client profile → Agendamento tab. Should see 3 horizontal tabs with counts.

**Step 3: Commit**

```
feat: replace collapsible sections with tabs in AgendamentoTab
```

---

### Task 6: Resizable PostReviewSheet

**Files:**
- Modify: `client/src/components/ui/sheet.jsx:32-56` (SheetContent)

**Step 1: Add resize drag handle to SheetContent**

Add a resize handle on the left edge of SheetContent. Use `mousedown` + `mousemove` to track drag. Save width in localStorage.

In `sheet.jsx`, modify the SheetContent component:

```jsx
function SheetContent({ className, children, side = 'right', ...props }) {
  const STORAGE_KEY = 'sheet-width';
  const MIN_W = 380;
  const MAX_W = typeof window !== 'undefined' ? window.innerWidth * 0.7 : 800;
  const DEFAULT_W = 480;

  const [width, setWidth] = React.useState(() => {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_W; }
    catch { return DEFAULT_W; }
  });
  const dragging = React.useRef(false);

  React.useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;
      const w = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setWidth(w);
    }
    function onMouseUp() {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
      }
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [width]);

  function startDrag(e) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <Dialog.Popup
      {...props}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex flex-col gap-4 border-l border-zinc-800 bg-zinc-950 p-6 shadow-xl transition-transform duration-300',
        'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
        className
      )}
      style={{ width: `${width}px` }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#9A48EA]/30 active:bg-[#9A48EA]/50 transition-colors z-10"
      />
      <Dialog.Close className="absolute right-4 top-4 rounded-sm text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors">
        <X className="h-4 w-4" />
      </Dialog.Close>
      {children}
    </Dialog.Popup>
  );
}
```

Remove any existing hardcoded width classes from SheetContent (check if there's a `w-[400px]` or `max-w-*` class).

**Step 2: Save width on localStorage persist**

Already handled in the `onMouseUp` handler. Width persists across sessions.

**Step 3: Verify**

Open PostReviewSheet, hover left edge — cursor should become col-resize. Drag to resize. Close and reopen — should remember width.

**Step 4: Commit**

```
feat: resizable sheet sidebar with drag handle and localStorage persistence
```

---

## Phase 3: PostReviewSheet Media Improvements

### Task 7: Bigger Thumbnails + Media Names

**Files:**
- Modify: `client/src/components/instagram/PostReviewSheet.jsx:339-405` (media list)

**Step 1: Extract filename from URL**

Add a helper function at the top of the file:

```jsx
function extractFilename(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split('/').pop() || '';
    // Remove query params artifacts, decode URI
    return decodeURIComponent(name).replace(/\?.*$/, '');
  } catch {
    // Fallback: get last segment
    return url.split('/').pop()?.split('?')[0] || 'mídia';
  }
}
```

**Step 2: Update media list item rendering**

Replace the media list item (lines 346-399) with bigger thumbnails and filename:

```jsx
{media.map((m, i) => (
  <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
    {m.type === 'video' ? (
      <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 relative cursor-pointer">
        <Video size={20} className="text-blue-400" />
      </div>
    ) : m.url ? (
      <img
        src={proxyMediaUrl(m.url)}
        alt=""
        className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    ) : (
      <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
        <Image size={20} className="text-zinc-500" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <Badge variant="secondary" className="text-[10px]">
        {m.type === 'video' ? 'Vídeo' : 'Imagem'}
      </Badge>
      <p className="text-[10px] text-zinc-500 truncate mt-0.5">
        {extractFilename(m.url)}
      </p>
    </div>
    {!readOnly && (
      <div className="flex items-center gap-0.5 shrink-0">
        ...existing move/delete buttons...
      </div>
    )}
  </div>
))}
```

**Step 3: Commit**

```
feat: bigger media thumbnails (64px) and display filenames in PostReviewSheet
```

---

### Task 8: Media Preview Popover

**Files:**
- Create: `client/src/components/instagram/MediaPreviewPopover.jsx`
- Modify: `client/src/components/instagram/PostReviewSheet.jsx` (wrap thumbnails with click handler)

**Step 1: Create MediaPreviewPopover component**

```jsx
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { proxyMediaUrl } from '@/lib/utils';

export default function MediaPreviewPopover({ media, anchorRect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!media || !anchorRect) return null;

  // Position to the left of the sidebar
  const style = {
    position: 'fixed',
    top: Math.max(16, Math.min(anchorRect.top - 50, window.innerHeight - 450)),
    right: anchorRect.sheetWidth + 12,
    zIndex: 60,
  };

  return (
    <div ref={ref} style={style} className="w-[400px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-400 truncate">{media.name || 'Preview'}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
          <X size={14} />
        </button>
      </div>
      <div className="p-2">
        {media.type === 'video' ? (
          <video
            src={proxyMediaUrl(media.url)}
            controls
            className="w-full rounded-lg max-h-[400px]"
          />
        ) : (
          <img
            src={proxyMediaUrl(media.url)}
            alt=""
            className="w-full rounded-lg max-h-[400px] object-contain"
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add click handler in PostReviewSheet**

Add state for preview:

```jsx
const [previewMedia, setPreviewMedia] = useState(null);
const [previewAnchor, setPreviewAnchor] = useState(null);
```

Wrap thumbnail images/video placeholders with onClick:

```jsx
onClick={(e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  setPreviewAnchor({ top: rect.top, sheetWidth: window.innerWidth - rect.left + 20 });
  setPreviewMedia({ url: m.url, type: m.type, name: extractFilename(m.url) });
}}
```

Add the popover in the render:

```jsx
<MediaPreviewPopover
  media={previewMedia}
  anchorRect={previewAnchor}
  onClose={() => { setPreviewMedia(null); setPreviewAnchor(null); }}
/>
```

**Step 3: Commit**

```
feat: media preview popover on thumbnail click in PostReviewSheet
```

---

### Task 9: Add Media (URL + Upload)

**Files:**
- Modify: `server/src/modules/instagram/instagram.controller.js` (add upload endpoint)
- Modify: `server/src/modules/instagram/instagram.routes.js` (add upload route)
- Modify: `client/src/services/instagram.js` (add upload API)
- Modify: `client/src/components/instagram/PostReviewSheet.jsx` (add media UI)

**Step 1: Server — media upload endpoint**

Add to `instagram.controller.js` a new method that accepts a file upload via multipart, stores it in `tempMediaStore`, and returns a URL:

```javascript
const multer = require('multer');
const crypto = require('crypto');

// In the controller:
async uploadMedia(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const token = crypto.randomUUID();
    const { buffer, mimetype, originalname } = req.file;
    // Store in temp media store (10 min TTL)
    tempMediaStore.set(token, { buffer, contentType: mimetype, filename: originalname });
    setTimeout(() => tempMediaStore.delete(token), 10 * 60 * 1000);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/api/instagram/temp-media/${token}`;
    const type = mimetype.startsWith('video/') ? 'video' : 'image';
    res.json({ url, type, filename: originalname });
  } catch (err) {
    next(err);
  }
}
```

Note: `tempMediaStore` is defined in `instagram-publish.service.js`. Import it or move to a shared module. Simplest: export it from the service and import in controller.

**Step 2: Server — add route**

In `instagram.routes.js`, add multer middleware and route:

```javascript
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post('/upload-media', auth, upload.single('file'), ctrl.uploadMedia.bind(ctrl));
```

**Step 3: Client — API function**

In `client/src/services/instagram.js`:

```javascript
export async function uploadMedia(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/instagram/upload-media', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data; // { url, type, filename }
}
```

**Step 4: Client — Add Media UI in PostReviewSheet**

After the media list, add a section (only when `!readOnly`):

```jsx
{!readOnly && (
  <div className="mt-2 flex gap-2">
    {/* URL input */}
    <div className="flex-1 flex gap-1.5">
      <input
        type="text"
        placeholder="Colar URL de mídia..."
        value={newMediaUrl}
        onChange={(e) => setNewMediaUrl(e.target.value)}
        className="flex-1 h-8 rounded-lg border border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-[#9A48EA] outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && newMediaUrl.trim()) {
            addMediaFromUrl(newMediaUrl.trim());
            setNewMediaUrl('');
          }
        }}
      />
      <Button
        variant="outline" size="sm" className="h-8 text-xs"
        disabled={!newMediaUrl.trim()}
        onClick={() => { addMediaFromUrl(newMediaUrl.trim()); setNewMediaUrl(''); }}
      >
        <Plus size={12} className="mr-1" /> URL
      </Button>
    </div>
    {/* File upload */}
    <Button
      variant="outline" size="sm" className="h-8 text-xs"
      onClick={() => fileInputRef.current?.click()}
    >
      <Upload size={12} className="mr-1" /> Upload
    </Button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={handleFileUpload}
    />
  </div>
)}
```

Add state and handlers:

```jsx
const [newMediaUrl, setNewMediaUrl] = useState('');
const fileInputRef = useRef(null);

function addMediaFromUrl(url) {
  const isVideo = /\.(mp4|mov|avi|webm)(\?|$)/i.test(url);
  setMedia((prev) => [...prev, { url, type: isVideo ? 'video' : 'image', order: prev.length }]);
}

async function handleFileUpload(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    try {
      const { url, type } = await uploadMedia(file);
      setMedia((prev) => [...prev, { url, type, order: prev.length }]);
    } catch {
      toast.error(`Erro ao enviar ${file.name}`);
    }
  }
  e.target.value = '';
}
```

Import `Plus`, `Upload` from lucide-react. Import `uploadMedia` from services.

**Step 5: Commit**

```
feat: add media via URL or file upload in PostReviewSheet
```

---

### Task 10: Reel Cover Selector Redesign

**Files:**
- Create: `client/src/components/instagram/VideoFrameSelector.jsx`
- Modify: `client/src/components/instagram/PostReviewSheet.jsx:250-337` (cover section)

**Step 1: Create VideoFrameSelector component**

Component that loads a video, shows a slider to scrub frames, and extracts a frame via canvas:

```jsx
import { useState, useRef, useCallback } from 'react';
import { proxyMediaUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export default function VideoFrameSelector({ videoUrl, onSelectFrame, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);

  const handleLoaded = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      setDuration(v.duration);
      setReady(true);
    }
  }, []);

  function handleSeek(e) {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
  }

  function captureFrame() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (blob) onSelectFrame(blob);
    }, 'image/jpeg', 0.9);
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        src={proxyMediaUrl(videoUrl)}
        onLoadedMetadata={handleLoaded}
        className="w-full rounded-lg max-h-[200px] bg-black"
        crossOrigin="anonymous"
        preload="metadata"
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      {ready && (
        <>
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-[#9A48EA] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-[#9A48EA] hover:bg-[#B06AF0] text-white" onClick={captureFrame}>
              <Check size={12} className="mr-1" /> Usar este frame
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Redesign cover section in PostReviewSheet**

Replace the entire reel cover section (lines 250-337) with a new design offering 3 options:

```jsx
{isReel && !readOnly && (
  <div className="mb-4">
    <label className="block text-sm font-medium text-zinc-300 mb-2">Capa do Reel</label>

    {/* Current cover preview */}
    {thumbnailUrl && (
      <div className="flex items-center gap-3 mb-3 p-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
        <img src={proxyMediaUrl(thumbnailUrl)} alt="Capa" className="w-12 h-20 rounded object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
        <div className="flex-1">
          <p className="text-xs text-emerald-400 font-medium">Capa selecionada</p>
          <p className="text-[10px] text-zinc-500 truncate">{extractFilename(thumbnailUrl)}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500 hover:text-red-400" onClick={() => { setThumbnailUrl(''); setCoverConfirmed(true); }}>
          <Trash2 size={12} />
        </Button>
      </div>
    )}

    {/* Cover options */}
    {coverMode === null && (
      <div className="flex gap-2 flex-wrap">
        {/* Select from post images */}
        {media.filter((m) => m.type === 'image').length > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCoverMode('select')}>
            <Image size={12} className="mr-1" /> Selecionar imagem
          </Button>
        )}
        {/* Upload */}
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => coverFileRef.current?.click()}>
          <Upload size={12} className="mr-1" /> Upload de capa
        </Button>
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
        {/* Video frame */}
        {media.some((m) => m.type === 'video') && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCoverMode('frame')}>
            <Video size={12} className="mr-1" /> Frame do vídeo
          </Button>
        )}
      </div>
    )}

    {/* Select from images */}
    {coverMode === 'select' && (
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-2">
          {media.filter((m) => m.type === 'image').map((m, i) => (
            <img
              key={i}
              src={proxyMediaUrl(m.url)}
              alt=""
              className="w-full aspect-[9/16] rounded-lg object-cover cursor-pointer border-2 border-transparent hover:border-[#9A48EA] transition-colors"
              onClick={() => { setThumbnailUrl(m.url); setCoverConfirmed(true); setCoverMode(null); }}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400" onClick={() => setCoverMode(null)}>Cancelar</Button>
      </div>
    )}

    {/* Video frame selector */}
    {coverMode === 'frame' && (
      <VideoFrameSelector
        videoUrl={media.find((m) => m.type === 'video')?.url}
        onSelectFrame={async (blob) => {
          try {
            const file = new File([blob], 'cover-frame.jpg', { type: 'image/jpeg' });
            const { url } = await uploadMedia(file);
            setThumbnailUrl(url);
            setCoverConfirmed(true);
            setCoverMode(null);
          } catch {
            toast.error('Erro ao enviar frame');
          }
        }}
        onCancel={() => setCoverMode(null)}
      />
    )}
  </div>
)}
```

Add state:
```jsx
const [coverMode, setCoverMode] = useState(null); // null | 'select' | 'frame'
const coverFileRef = useRef(null);

async function handleCoverUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const { url } = await uploadMedia(file);
    setThumbnailUrl(url);
    setCoverConfirmed(true);
  } catch {
    toast.error('Erro ao enviar capa');
  }
  e.target.value = '';
}
```

Keep the read-only view (lines 256-269) as-is for published posts.

**Step 3: Commit**

```
feat: redesign reel cover selector with image pick, upload, and video frame extraction
```

---

## Task Execution Order

1. **Task 1** — Timezone fix (independent)
2. **Task 2** — Catbox retry (independent)
3. **Task 3** — Auto-assign (independent)
4. **Task 4** — DateTimePicker overlay (independent)
5. **Task 5** — AgendamentoTab tabs (independent)
6. **Task 6** — Resizable sheet (independent)
7. **Task 7** — Thumbnails + names (depends on 6 for visual check)
8. **Task 8** — Media preview popover (depends on 7)
9. **Task 9** — Add media (depends on 7, needs server endpoint)
10. **Task 10** — Cover selector (depends on 9 for uploadMedia)

Tasks 1-6 can be done in parallel. Tasks 7-10 are sequential.
