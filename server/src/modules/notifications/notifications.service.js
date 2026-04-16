const db = require('../../config/db');
const evolution = require('../evolution/evolution.service');
const logger = require('../../utils/logger');

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const TARGET_LABELS = { cover: 'capa', video: 'vídeo' };

const PRODUCER_PHASE_FOR_REJECTION = (postType, rejectionTarget) => {
  if (rejectionTarget === 'cover') return 'design';
  if (rejectionTarget === 'video') return 'edicao_de_video';
  if (['reel', 'video', 'tiktok_video'].includes(postType)) return 'edicao_de_video';
  return 'design';
};

async function getCategoryGroup(category) {
  if (!category) return null;
  try {
    const row = await db('app_settings').where({ key: 'category_whatsapp_groups' }).first();
    if (!row) return null;
    const map = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return map?.[category] || null;
  } catch (err) {
    logger.warn('category_whatsapp_groups lookup failed', { error: err.message });
    return null;
  }
}

async function safeSend(jid, text, context) {
  if (!jid || !text) return;
  try {
    await evolution.sendText(jid, text);
  } catch (err) {
    logger.error('notifications send failed', { ...context, jid, error: err.message });
  }
}

async function resolveProducer(deliveryId, phaseName) {
  const rows = await db('delivery_phases')
    .where({ delivery_id: deliveryId, phase: phaseName })
    .orderBy('entered_at', 'desc');
  for (const row of rows) {
    if (row.user_id) {
      const user = await db('users').where({ id: row.user_id }).first();
      if (user) return user;
    }
    if (row.assignee_clickup_id) {
      const user = await db('users').where({ clickup_id: row.assignee_clickup_id }).first();
      if (user) return user;
    }
  }
  return null;
}

function fmtItemLine(item) {
  const url = item.clickup_task_id ? `https://app.clickup.com/t/${item.clickup_task_id}` : '';
  const head = `• ${item.delivery_title || item.delivery_id}${url ? ` → ${url}` : ''}`;
  if (item.status === 'rejected' || item.rejection_reason) {
    const target = TARGET_LABELS[item.rejection_target];
    const targetSuffix = target ? ` (alvo: ${target})` : '';
    return `${head}\n  Motivo: ${item.rejection_reason || '—'}${targetSuffix}`;
  }
  return head;
}

function composeBatchDigest(clientName, approved, rejected) {
  const sections = [`*Lote do cliente ${clientName} revisado*`];
  if (approved.length) {
    sections.push(`✅ Aprovados (${approved.length}):\n${approved.map(fmtItemLine).join('\n')}`);
  }
  if (rejected.length) {
    sections.push(`❌ Reprovados (${rejected.length}):\n${rejected.map(fmtItemLine).join('\n')}`);
  }
  return sections.join('\n\n');
}

function composeProducerDigest(clientName, items) {
  const lines = items.map(fmtItemLine).join('\n');
  return `*Tasks reprovadas pra você*\n\nCliente: ${clientName}\n${lines}`;
}

function composeCategoryRejectionDigest(clientName, items) {
  const lines = items.map(fmtItemLine).join('\n');
  return `*Reprovações no cliente ${clientName}*\n\n❌ ${items.length} item(ns) voltaram pra correção:\n${lines}`;
}

function composePublishDigest(deliveryTitle, clientName, platformLinks) {
  const lines = platformLinks
    .filter((l) => l.url)
    .map((l) => `• ${PLATFORM_LABELS[l.platform] || l.platform} → ${l.url}`)
    .join('\n');
  // clientName is omitted for the client-facing leg — the client obviously
  // knows which client they are. Only the internal (category-group) leg
  // needs the label so the MKT team knows which client the post belongs to.
  const clientLine = clientName ? `\nCliente: ${clientName}` : '';
  return `✅ *Publicado*: ${deliveryTitle}${clientLine}\n${lines}`;
}

async function notifyBatchReviewWindow(batch, items) {
  const client = await db('clients').where({ id: batch.client_id }).first();
  const clientName = client?.name || 'cliente';

  const approved = items.filter((i) => i.status === 'approved');
  const rejected = items.filter((i) => i.status === 'rejected');
  if (approved.length === 0 && rejected.length === 0) return;

  const sm = batch.social_media_id ? await db('users').where({ id: batch.social_media_id }).first() : null;
  if (sm?.whatsapp) {
    const jid = evolution.buildPersonalJid(sm.whatsapp);
    await safeSend(jid, composeBatchDigest(clientName, approved, rejected), { batchId: batch.id, role: 'sm' });
  } else {
    logger.warn('SM has no whatsapp; skipping batch digest', { batchId: batch.id });
  }

  if (rejected.length) {
    await notifyRejections(batch, rejected);
  }
}

async function notifyRejections(batch, rejectedItems) {
  const client = await db('clients').where({ id: batch.client_id }).first();
  const clientName = client?.name || 'cliente';

  const itemsByProducer = new Map();
  for (const item of rejectedItems) {
    const phase = PRODUCER_PHASE_FOR_REJECTION(item.post_type, item.rejection_target);
    const producer = await resolveProducer(item.delivery_id, phase);
    if (!producer) {
      logger.warn('No producer found for rejection routing', { itemId: item.id, deliveryId: item.delivery_id, phase });
      continue;
    }
    if (!itemsByProducer.has(producer.id)) itemsByProducer.set(producer.id, { producer, items: [] });
    itemsByProducer.get(producer.id).items.push(item);
  }

  for (const { producer, items } of itemsByProducer.values()) {
    if (!producer.whatsapp) {
      logger.warn('Producer has no whatsapp; skipping', { userId: producer.id });
      continue;
    }
    const jid = evolution.buildPersonalJid(producer.whatsapp);
    await safeSend(jid, composeProducerDigest(clientName, items), { batchId: batch.id, role: 'producer', userId: producer.id });
  }

  if (client?.category) {
    const groupJid = await getCategoryGroup(client.category);
    if (groupJid) {
      await safeSend(groupJid, composeCategoryRejectionDigest(clientName, rejectedItems), { batchId: batch.id, role: 'category-group', category: client.category });
    } else {
      logger.warn('No category WhatsApp group mapped', { category: client.category });
    }
  }
}

async function notifyPublishSuccess(post) {
  const client = await db('clients').where({ id: post.client_id }).first();
  const clientName = client?.name || 'cliente';

  let platformLinks;
  if (post.post_group_id) {
    const siblings = await db('scheduled_posts').where({ post_group_id: post.post_group_id });
    platformLinks = siblings
      .filter((s) => s.status === 'published')
      .map((s) => ({ platform: s.platform, url: s.platform === 'instagram' ? s.ig_permalink : s.platform === 'tiktok' ? s.tiktok_permalink : null }));
  } else {
    platformLinks = [{ platform: post.platform, url: post.platform === 'instagram' ? post.ig_permalink : post.platform === 'tiktok' ? post.tiktok_permalink : null }];
  }

  const title = post.delivery_title || post.caption?.slice(0, 80) || 'post';
  const clientText = composePublishDigest(title, null, platformLinks);
  const internalText = composePublishDigest(title, clientName, platformLinks);

  if (client?.whatsapp_group) {
    await safeSend(client.whatsapp_group, clientText, { postId: post.id, role: 'client-group' });
  }
  if (client?.category) {
    const groupJid = await getCategoryGroup(client.category);
    if (groupJid) {
      await safeSend(groupJid, internalText, { postId: post.id, role: 'category-group', category: client.category });
    }
  }
}

module.exports = {
  notifyBatchReviewWindow,
  notifyRejections,
  notifyPublishSuccess,
};
