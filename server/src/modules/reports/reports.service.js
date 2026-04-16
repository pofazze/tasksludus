const db = require('../../config/db');

const PRODUCTION_PHASES = ['em_producao_video', 'em_producao_design', 'edicao_de_video', 'design'];

function rangeFilter(table, column, { start, end }) {
  if (!start || !end) return null;
  return { column: `${table}.${column}`, start: new Date(start), end: new Date(end) };
}

async function producersWithDeliveriesIn(range) {
  const phases = await db('delivery_phases').whereIn('phase', PRODUCTION_PHASES);
  const filtered = phases.filter((p) => {
    if (!p.entered_at) return false;
    const t = new Date(p.entered_at).getTime();
    return t >= new Date(range.start).getTime() && t <= new Date(range.end).getTime();
  });
  // Map producer → set of deliveryIds
  const map = new Map();
  for (const p of filtered) {
    if (!p.user_id) continue;
    if (!map.has(p.user_id)) map.set(p.user_id, new Set());
    map.get(p.user_id).add(p.delivery_id);
  }
  return map;
}

async function loadUser(id) {
  const user = await db('users').where({ id }).first();
  return user || { id, name: 'Desconhecido', producer_type: null };
}

async function firstApprovalRate(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const items = await db('approval_items');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let total = 0;
    let firstApproved = 0;
    for (const deliveryId of deliveryIds) {
      const itemsForDelivery = items.filter((i) => i.delivery_id === deliveryId);
      if (itemsForDelivery.length === 0) continue;
      total += 1;
      const hasReject = itemsForDelivery.some((i) => i.status === 'rejected');
      const hasApprove = itemsForDelivery.some((i) => i.status === 'approved');
      if (hasApprove && !hasReject) firstApproved += 1;
    }
    if (total === 0) continue;
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      total,
      firstApproved,
      rate: firstApproved / total,
    });
  }
  results.sort((a, b) => b.rate - a.rate);
  return results;
}

async function rejectionRate(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const items = await db('approval_items');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let total = 0;
    let rejected = 0;
    for (const i of items) {
      if (!deliveryIds.has(i.delivery_id)) continue;
      total += 1;
      if (i.status === 'rejected') rejected += 1;
    }
    if (total === 0) continue;
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      total,
      rejected,
      rate: rejected / total,
    });
  }
  results.sort((a, b) => b.rate - a.rate);
  return results;
}

async function reworkPerTask(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const phases = await db('delivery_phases');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let totalRework = 0;
    for (const deliveryId of deliveryIds) {
      totalRework += phases.filter((p) => p.delivery_id === deliveryId && p.phase === 'correcao').length;
    }
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      avgRework: deliveryIds.size ? totalRework / deliveryIds.size : 0,
    });
  }
  results.sort((a, b) => b.avgRework - a.avgRework);
  return results;
}

async function rejectionByCategory(range) {
  const items = await db('approval_items');
  const counts = new Map();
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    const key = i.rejection_category || 'outro';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

async function rejectionByPostType(range) {
  const items = await db('approval_items');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const byType = new Map();
  for (const i of items) {
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    const d = byDelivery.get(i.delivery_id);
    if (!d) continue;
    const postType = d.content_type || 'outro';
    if (!byType.has(postType)) byType.set(postType, { total: 0, rejected: 0 });
    const bucket = byType.get(postType);
    bucket.total += 1;
    if (i.status === 'rejected') bucket.rejected += 1;
  }
  return [...byType.entries()].map(([postType, { total, rejected }]) => ({
    postType, total, rejected, rate: total ? rejected / total : 0,
  }));
}

async function rejectionByTarget(range) {
  const items = await db('approval_items');
  const counts = new Map();
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    if (!i.rejection_target) continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    counts.set(i.rejection_target, (counts.get(i.rejection_target) || 0) + 1);
  }
  return [...counts.entries()].map(([target, count]) => ({ target, count }));
}

async function ranking(range) {
  const [rates, producerMap] = await Promise.all([
    firstApprovalRate(range),
    producersWithDeliveriesIn(range),
  ]);
  const rateByUser = new Map(rates.map((r) => [r.producerId, r]));
  const out = [];
  for (const [userId, deliveryIds] of producerMap.entries()) {
    const user = await loadUser(userId);
    const r = rateByUser.get(userId);
    out.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      volume: deliveryIds.size,
      firstApprovalRate: r ? r.rate : null,
      score: deliveryIds.size * (r ? r.rate : 0),
    });
  }
  out.sort((a, b) => b.volume - a.volume);
  return out;
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  if (granularity === 'year') return `${d.getUTCFullYear()}`;
  if (granularity === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (granularity === 'week') {
    // ISO week start: Monday. UTC-only computation.
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayOfWeek = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - dayOfWeek);
    return copy.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10); // day
}

async function volumeTimeseries({ start, end, granularity = 'day', producerId }) {
  const producerMap = await producersWithDeliveriesIn({ start, end });
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const counts = new Map();
  for (const [userId, deliveryIds] of producerMap.entries()) {
    if (producerId && userId !== producerId) continue;
    for (const deliveryId of deliveryIds) {
      const d = byDelivery.get(deliveryId);
      if (!d) continue;
      const ref = d.completed_at || d.updated_at;
      if (!ref) continue;
      const key = `${userId}|${bucketKey(ref, granularity)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([k, count]) => {
    const [pid, bucket] = k.split('|');
    return { producerId: pid, bucket, count };
  });
}

const PRODUCTION_ONLY = ['em_producao_video', 'em_producao_design'];
const CLICKUP_URL = (taskId) => `https://app.clickup.com/t/${taskId}`;

async function activeTasks(range) {
  const phases = await db('delivery_phases');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const open = phases.filter((p) => p.exited_at === null && p.user_id);
  const grouped = new Map();
  for (const p of open) {
    const key = `${p.user_id}|${p.phase}`;
    if (!grouped.has(key)) grouped.set(key, { producerId: p.user_id, phase: p.phase, tasks: [] });
    const d = byDelivery.get(p.delivery_id);
    grouped.get(key).tasks.push({
      title: d?.title || p.delivery_id,
      clickupUrl: (p.clickup_task_id || d?.clickup_task_id) ? CLICKUP_URL(p.clickup_task_id || d.clickup_task_id) : null,
    });
  }
  const results = [];
  for (const entry of grouped.values()) {
    const user = await loadUser(entry.producerId);
    results.push({
      producerId: entry.producerId,
      producerName: user.name,
      producerType: user.producer_type,
      phase: entry.phase,
      count: entry.tasks.length,
      tasks: entry.tasks,
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

function median(nums) {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function avgPhaseDuration(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const closed = phases.filter((p) => {
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const grouped = new Map();
  for (const p of closed) {
    const key = `${p.user_id}|${p.phase}`;
    if (!grouped.has(key)) grouped.set(key, { producerId: p.user_id, phase: p.phase, values: [] });
    grouped.get(key).values.push(p.duration_seconds);
  }
  const results = [];
  for (const entry of grouped.values()) {
    const user = await loadUser(entry.producerId);
    const sum = entry.values.reduce((acc, n) => acc + n, 0);
    results.push({
      producerId: entry.producerId,
      producerName: user.name,
      producerType: user.producer_type,
      phase: entry.phase,
      sampleSize: entry.values.length,
      avgSeconds: Math.round(sum / entry.values.length),
      medianSeconds: median(entry.values),
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function totalHours(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const production = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const perUser = new Map();
  for (const p of production) {
    perUser.set(p.user_id, (perUser.get(p.user_id) || 0) + p.duration_seconds);
  }
  const results = [];
  for (const [userId, seconds] of perUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      productionSeconds: seconds,
    });
  }
  results.sort((a, b) => b.productionSeconds - a.productionSeconds);
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function overdue(range) {
  const now = range.now ? new Date(range.now) : new Date();
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const byDeliveryPhases = new Map();
  for (const p of phases) {
    if (!byDeliveryPhases.has(p.delivery_id)) byDeliveryPhases.set(p.delivery_id, []);
    byDeliveryPhases.get(p.delivery_id).push(p);
  }
  const perUser = new Map();
  for (const d of deliveries) {
    if (!d.due_date) continue;
    if (d.status === 'publicado') continue;
    if (new Date(d.due_date).getTime() >= now.getTime()) continue;
    const rows = (byDeliveryPhases.get(d.id) || []).slice().sort((a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime());
    const open = rows.find((p) => p.exited_at === null);
    const candidate = open || rows[0];
    if (!candidate || !candidate.user_id) continue;
    if (!perUser.has(candidate.user_id)) perUser.set(candidate.user_id, []);
    perUser.get(candidate.user_id).push({
      title: d.title || d.id,
      dueDate: d.due_date,
      phase: candidate.phase,
      clickupUrl: d.clickup_task_id ? CLICKUP_URL(d.clickup_task_id) : null,
    });
  }
  const results = [];
  for (const [userId, tasks] of perUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      count: tasks.length,
      tasks,
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function phaseDistribution(range) {
  const phases = await db('delivery_phases');
  const open = phases.filter((p) => p.exited_at === null && p.user_id);
  const counts = new Map();
  for (const p of open) {
    const key = `${p.user_id}|${p.phase}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const results = [];
  for (const [key, count] of counts.entries()) {
    const [producerId, phase] = key.split('|');
    results.push({ producerId, phase, count });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function weeklyHeatmap(range) {
  const phases = await db('delivery_phases');
  const filter = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (range.producerId && p.user_id !== range.producerId) return false;
    return true;
  });
  const grid = new Map();
  for (const p of filter) {
    let cursor = new Date(p.entered_at).getTime();
    const endMs = new Date(p.exited_at).getTime();
    while (cursor < endMs) {
      const d = new Date(cursor);
      const hourStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).getTime();
      const hourEnd = hourStart + 60 * 60 * 1000;
      const sliceEnd = Math.min(endMs, hourEnd);
      const slice = Math.round((sliceEnd - cursor) / 1000);
      const key = `${d.getUTCDay()}|${d.getUTCHours()}`;
      grid.set(key, (grid.get(key) || 0) + slice);
      cursor = sliceEnd;
    }
  }
  const results = [];
  for (const [key, seconds] of grid.entries()) {
    const [dayOfWeek, hour] = key.split('|').map(Number);
    results.push({ dayOfWeek, hour, seconds });
  }
  return results;
}

async function avgWorkTimeseries(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const closed = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const byKey = new Map();
  for (const p of closed) {
    if (range.producerId && p.user_id !== range.producerId) continue;
    const bucket = bucketKey(p.exited_at, range.granularity || 'day');
    const key = `${p.user_id}|${bucket}`;
    if (!byKey.has(key)) byKey.set(key, { producerId: p.user_id, bucket, sum: 0, count: 0 });
    const entry = byKey.get(key);
    entry.sum += p.duration_seconds;
    entry.count += 1;
  }
  return [...byKey.values()].map(({ producerId, bucket, sum, count }) => ({
    producerId,
    bucket,
    avgSeconds: Math.round(sum / count),
  }));
}

const CLIENT_PLATFORMS = ['instagram', 'tiktok', 'youtube'];
const CLIENT_POST_TYPES_ALL = ['reel', 'image', 'carousel', 'carrossel', 'story', 'tiktok_video', 'tiktok_photo', 'yt_shorts', 'feed', 'video'];

async function clientSummary({ start, end, clientId }) {
  const posts = await db('scheduled_posts');
  const filtered = posts.filter((p) => {
    if (p.client_id !== clientId) return false;
    if (p.status !== 'published') return false;
    const t = p.published_at ? new Date(p.published_at).getTime() : null;
    if (!t) return false;
    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
  });
  const byPlatform = Object.fromEntries(CLIENT_PLATFORMS.map((pl) => [pl, 0]));
  const byPostType = {};
  for (const p of filtered) {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    const key = p.post_type || 'outro';
    byPostType[key] = (byPostType[key] || 0) + 1;
  }
  return {
    totalPublished: filtered.length,
    byPlatform,
    byPostType,
  };
}

async function publishedList({ start, end, clientId }) {
  const posts = await db('scheduled_posts');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const phases = await db('delivery_phases');
  const items = await db('approval_items');

  const filtered = posts.filter((p) => {
    if (p.client_id !== clientId) return false;
    if (p.status !== 'published') return false;
    const t = p.published_at ? new Date(p.published_at).getTime() : null;
    if (!t) return false;
    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
  });

  const results = [];
  for (const p of filtered) {
    const delivery = byDelivery.get(p.delivery_id);
    const producersByPhase = {};
    const deliveryPhaseRows = phases
      .filter((ph) => ph.delivery_id === p.delivery_id)
      .sort((a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime());
    for (const row of deliveryPhaseRows) {
      if (!producersByPhase[row.phase] && row.user_id) {
        const user = await loadUser(row.user_id);
        producersByPhase[row.phase] = user.name;
      }
    }
    const deliveryItems = items.filter((i) => i.delivery_id === p.delivery_id);
    const hasRejection = deliveryItems.some((i) => i.status === 'rejected');
    const hasApproval = deliveryItems.some((i) => i.status === 'approved');
    const firstApproval = hasApproval && !hasRejection;
    const permalink = p.platform === 'instagram' ? p.ig_permalink : p.platform === 'tiktok' ? p.tiktok_permalink : null;
    results.push({
      deliveryId: p.delivery_id,
      title: delivery?.title || p.caption?.slice(0, 80) || p.delivery_id,
      publishedAt: p.published_at,
      platform: p.platform,
      permalink,
      postType: p.post_type,
      producersByPhase,
      firstApproval,
    });
  }
  results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return results;
}

async function clientFirstApprovalRate({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const items = await db('approval_items');
  const clientDeliveries = deliveries.filter((d) => d.client_id === clientId);
  const deliveryIds = new Set(clientDeliveries.map((d) => d.id));

  let total = 0;
  let firstApproved = 0;
  for (const deliveryId of deliveryIds) {
    const forDelivery = items.filter((i) => {
      if (i.delivery_id !== deliveryId) return false;
      const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
      if (!t) return false;
      return t >= new Date(start).getTime() && t <= new Date(end).getTime();
    });
    if (forDelivery.length === 0) continue;
    total += 1;
    const hasReject = forDelivery.some((i) => i.status === 'rejected');
    const hasApprove = forDelivery.some((i) => i.status === 'approved');
    if (hasApprove && !hasReject) firstApproved += 1;
  }
  return { total, firstApproved, rate: total ? firstApproved / total : 0 };
}

async function clientRejectionVolume({ start, end, clientId }) {
  const items = await db('approval_items');
  const deliveries = await db('deliveries');
  const clientDeliveryIds = new Set(deliveries.filter((d) => d.client_id === clientId).map((d) => d.id));

  const counts = new Map();
  let total = 0;
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    if (!clientDeliveryIds.has(i.delivery_id)) continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t) continue;
    if (t < new Date(start).getTime() || t > new Date(end).getTime()) continue;
    total += 1;
    const key = i.rejection_category || 'outro';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    total,
    byCategory: [...counts.entries()].map(([category, count]) => ({ category, count })),
  };
}

async function clientAvgCycleTime({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const byDeliveryPhases = new Map();
  for (const p of phases) {
    if (!byDeliveryPhases.has(p.delivery_id)) byDeliveryPhases.set(p.delivery_id, []);
    byDeliveryPhases.get(p.delivery_id).push(p);
  }
  const durations = [];
  const byTypeMap = new Map();
  for (const d of deliveries) {
    if (d.client_id !== clientId) continue;
    const completed = d.completed_at ? new Date(d.completed_at).getTime() : null;
    if (!completed) continue;
    if (completed < new Date(start).getTime() || completed > new Date(end).getTime()) continue;
    let startedMs = d.started_at ? new Date(d.started_at).getTime() : null;
    if (!startedMs) {
      const rows = byDeliveryPhases.get(d.id) || [];
      if (rows.length) {
        const earliest = rows.reduce((lo, r) => Math.min(lo, new Date(r.entered_at).getTime()), Infinity);
        if (Number.isFinite(earliest)) startedMs = earliest;
      }
    }
    if (!startedMs) continue;
    const days = Math.max(0, Math.round((completed - startedMs) / (24 * 60 * 60 * 1000)));
    durations.push(days);
    const key = d.content_type || 'outro';
    if (!byTypeMap.has(key)) byTypeMap.set(key, []);
    byTypeMap.get(key).push(days);
  }
  const avg = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 0;
  return {
    avgDaysStartToPublish: avg,
    medianDays: median(durations),
    byPostType: [...byTypeMap.entries()].map(([postType, arr]) => ({
      postType,
      avgDays: Math.round(arr.reduce((s, n) => s + n, 0) / arr.length),
    })),
  };
}

async function clientResponsibilityHistory({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const inRange = new Set(
    deliveries
      .filter((d) => d.client_id === clientId)
      .filter((d) => {
        const t = d.completed_at ? new Date(d.completed_at).getTime() : null;
        if (!t) return true;
        return t >= new Date(start).getTime() && t <= new Date(end).getTime();
      })
      .map((d) => d.id),
  );
  const rows = phases.filter((p) => inRange.has(p.delivery_id) && p.user_id);
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { deliveryIds: new Set(), phases: new Set() });
    const entry = byUser.get(row.user_id);
    entry.deliveryIds.add(row.delivery_id);
    entry.phases.add(row.phase);
  }
  const results = [];
  for (const [userId, { deliveryIds, phases: phaseSet }] of byUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      taskCount: deliveryIds.size,
      phases: [...phaseSet],
    });
  }
  results.sort((a, b) => b.taskCount - a.taskCount);
  return results;
}

function publishedListToCsv(rows) {
  const headers = ['data_publicacao', 'titulo', 'plataforma', 'tipo', 'link', 'designer', 'editor_video', 'aprovacao_primeira'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const date = r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 10) : '';
    const designer = r.producersByPhase?.em_producao_design || r.producersByPhase?.design || '';
    const editor = r.producersByPhase?.em_producao_video || r.producersByPhase?.edicao_de_video || '';
    const row = [
      date,
      csvEscape(r.title),
      r.platform || '',
      r.postType || '',
      csvEscape(r.permalink || ''),
      csvEscape(designer),
      csvEscape(editor),
      r.firstApproval ? 'sim' : 'nao',
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

module.exports = {
  firstApprovalRate,
  rejectionRate,
  reworkPerTask,
  rejectionByCategory,
  rejectionByPostType,
  rejectionByTarget,
  ranking,
  volumeTimeseries,
  activeTasks,
  avgPhaseDuration,
  totalHours,
  overdue,
  phaseDistribution,
  weeklyHeatmap,
  avgWorkTimeseries,
  clientSummary,
  publishedList,
  clientFirstApprovalRate,
  clientRejectionVolume,
  clientAvgCycleTime,
  clientResponsibilityHistory,
  publishedListToCsv,
  PRODUCTION_PHASES,
};
