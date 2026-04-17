const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, env.jwt.secret);

    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await db('users')
      .where({ id: payload.sub, is_active: true })
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url', 'whatsapp', 'clickup_id')
      .first();

    if (!user) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role === 'dev') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// CEO-only actions
function ceoOnly(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'CEO access only' });
  }
  next();
}

// CEO or Director
function adminLevel(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (!['ceo', 'director'].includes(req.user.role)) {
    return res.status(403).json({ error: 'CEO or Director access only' });
  }
  next();
}

// CEO, Director, or Manager
function managementLevel(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (!['ceo', 'director', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Management access only' });
  }
  next();
}

// CEO, Director, Manager, or Social Media producer
function managementOrSocialMedia(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (['ceo', 'director', 'manager'].includes(req.user.role)) {
    return next();
  }
  if (req.user.role === 'producer' && req.user.producer_type === 'social_media') {
    return next();
  }
  return res.status(403).json({ error: 'Management or Social Media access only' });
}

function managementOrClientOwn(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (['ceo', 'director', 'manager'].includes(req.user.role)) return next();
  if (req.user.role === 'producer' && req.user.producer_type === 'social_media') return next();
  if (req.user.role === 'client') {
    return db('clients').where({ user_id: req.user.id }).first()
      .then((client) => {
        if (client && client.id === req.params.clientId) return next();
        return res.status(403).json({ error: 'You can only manage your own social accounts' });
      })
      .catch(() => res.status(500).json({ error: 'Internal error checking client ownership' }));
  }
  return res.status(403).json({ error: 'Management or account owner access only' });
}

module.exports = {
  authenticate,
  authorize,
  ceoOnly,
  adminLevel,
  managementLevel,
  managementOrSocialMedia,
  managementOrClientOwn,
};
