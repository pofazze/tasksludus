const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('./config/passport');
const env = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const goalsRoutes = require('./modules/goals/goals.routes');
const clientsRoutes = require('./modules/clients/clients.routes');
const plansRoutes = require('./modules/plans/plans.routes');
const deliveriesRoutes = require('./modules/deliveries/deliveries.routes');
const calculationsRoutes = require('./modules/calculations/calculations.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const rankingRoutes = require('./modules/ranking/ranking.routes');
const simulatorRoutes = require('./modules/simulator/simulator.routes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport
app.use(passport.initialize());

// Health check
app.get('/api/health', async (req, res) => {
  const db = require('./config/db');
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/calculations', calculationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/simulator', simulatorRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
const server = app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
});

module.exports = { app, server };
