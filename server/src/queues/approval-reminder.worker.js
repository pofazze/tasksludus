const { Worker } = require('bullmq');
const db = require('../config/db');
const logger = require('../utils/logger');
const evolutionService = require('../modules/evolution/evolution.service');
const env = require('../config/env');
const { connection } = require('./index');

const worker = new Worker('approval-reminder', async (job) => {
  const { batchId } = job.data;
  logger.info('Processing approval reminder', { batchId, jobId: job.id });

  const batch = await db('approval_batches').where({ id: batchId }).first();
  if (!batch || batch.status !== 'pending') {
    logger.info('Batch no longer pending, skipping reminder', { batchId, status: batch?.status });
    return;
  }

  const client = await db('clients').where({ id: batch.client_id }).first();
  if (!client) {
    logger.warn('Client not found for batch', { batchId, clientId: batch.client_id });
    return;
  }

  const { count: pendingCount } = await db('approval_items')
    .where({ batch_id: batchId, status: 'pending' })
    .count('id as count')
    .first();
  const { count: totalCount } = await db('approval_items')
    .where({ batch_id: batchId })
    .count('id as count')
    .first();

  if (Number(pendingCount) === 0) {
    logger.info('No pending items, skipping reminder', { batchId });
    return;
  }

  const baseUrl = env.clientUrl.split(',')[0].trim();
  const approvalLink = `${baseUrl}/aprovacao/${batch.token}`;

  const hoursSinceCreation = (Date.now() - new Date(batch.created_at).getTime()) / (1000 * 60 * 60);

  const reminderMessage = hoursSinceCreation <= 24
    ? `Lembrete: ainda ha publicacoes de *${client.name}* aguardando aprovacao.\n${pendingCount} de ${totalCount} publicacoes pendentes.\nAcesse: ${approvalLink}`
    : `Ola *${client.name}*! Suas publicacoes ainda aguardam aprovacao.\n${pendingCount} de ${totalCount} publicacoes pendentes.\nAcesse: ${approvalLink}`;

  if (hoursSinceCreation <= 24) {
    // First: try group, fallback to personal
    const dest = client.whatsapp_group || (client.whatsapp ? evolutionService.buildPersonalJid(client.whatsapp) : null);
    if (dest) {
      await evolutionService.sendText(dest, reminderMessage);
      logger.info('Reminder sent', { batchId, dest });
    }
  } else {
    // After 24h: try personal, fallback to group
    const dest = client.whatsapp ? evolutionService.buildPersonalJid(client.whatsapp) : client.whatsapp_group;
    if (dest) {
      await evolutionService.sendText(dest, reminderMessage);
      logger.info('Reminder sent', { batchId, dest });
    }
  }
}, {
  connection,
  concurrency: 1,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

worker.on('completed', (job) => {
  logger.info('Approval reminder job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Approval reminder job failed', { jobId: job?.id, error: err.message });
});

module.exports = worker;
