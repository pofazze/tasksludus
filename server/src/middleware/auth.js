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
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url')
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

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// CEO-only actions
function ceoOnly(req, res, next) {
  if (req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'CEO access only' });
  }
  next();
}

// CEO or Director
function adminLevel(req, res, next) {
  if (!['ceo', 'director'].includes(req.user.role)) {
    return res.status(403).json({ error: 'CEO or Director access only' });
  }
  next();
}

// CEO, Director, or Manager
function managementLevel(req, res, next) {
  if (!['ceo', 'director', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Management access only' });
  }
  next();
}

module.exports = {
  authenticate,
  authorize,
  ceoOnly,
  adminLevel,
  managementLevel,
};
