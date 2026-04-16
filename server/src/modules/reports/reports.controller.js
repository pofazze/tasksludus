const Joi = require('joi');
const service = require('./reports.service');

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
};
