const Joi = require('joi');
const service = require('./reports.service');
const db = require('../../config/db');

const querySchema = Joi.object({
  start: Joi.date().required(),
  end: Joi.date().required(),
  clientId: Joi.string().optional(),
  producerId: Joi.string().optional(),
  granularity: Joi.string().valid('day', 'week', 'month', 'year').optional(),
}).unknown(true);

function validate(req, res) {
  const { error, value } = querySchema.validate(req.query);
  if (error) {
    res.status(400).json({ error: error.details[0].message });
    return null;
  }
  return value;
}

function filterByProducer(rows, producerId) {
  if (!producerId) return rows;
  return rows.filter((r) => r.producerId === producerId);
}

async function ensureClientAllowed(req, res) {
  const clientId = req.params.clientId;
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return null;
  }
  const client = await db('clients').where({ id: clientId }).first();
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  if (req._scopedAccountManagerId && client.account_manager_id !== req._scopedAccountManagerId) {
    res.status(403).json({ error: 'Reports: this client is not in your scope' });
    return null;
  }
  return client;
}

async function firstApprovalRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.firstApprovalRate(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function rejectionRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionRate(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function reworkPerTask(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.reworkPerTask(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function rejectionByCategory(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByCategory(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function rejectionByPostType(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByPostType(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function rejectionByTarget(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByTarget(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function ranking(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.ranking(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function volumeTimeseries(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.volumeTimeseries(v);
    res.json(v.producerId ? out.filter((r) => r.producerId === v.producerId) : out);
  } catch (err) { next(err); }
}

async function activeTasks(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.activeTasks(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function avgPhaseDuration(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.avgPhaseDuration(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function totalHours(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.totalHours(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function overdue(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.overdue(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function phaseDistribution(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.phaseDistribution(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function weeklyHeatmap(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.weeklyHeatmap(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function avgWorkTimeseries(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.avgWorkTimeseries(v);
    res.json(v.producerId ? out.filter((r) => r.producerId === v.producerId) : out);
  } catch (err) { next(err); }
}

async function clientSummary(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientSummary({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function publishedList(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.publishedList({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientFirstApprovalRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientFirstApprovalRate({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientRejectionVolume(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientRejectionVolume({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientAvgCycleTime(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientAvgCycleTime({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientResponsibilityHistory(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientResponsibilityHistory({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function publishedListCsv(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const rows = await service.publishedList({ ...v, clientId: req.params.clientId });
    const csv = service.publishedListToCsv(rows);
    const safeName = (client.name || 'cliente').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="publicados_${safeName}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
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
  publishedListCsv,
};
