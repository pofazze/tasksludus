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
const webhooksRoutes = require('./modules/webhooks/webhooks.routes');
const instagramRoutes = require('./modules/instagram/instagram.routes');
const eventsRoutes = require('./modules/events/events.routes');
const approvalsRoutes = require('./modules/approvals/approvals.routes');

const app = express();

// Trust proxy (Railway runs behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = env.clientUrl.split(',').map((u) => u.trim());
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing — capture raw body for webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.url.startsWith('/api/webhooks/')) {
      req.rawBody = buf.toString();
    }
  },
}));
app.use(express.urlencoded({ extended: true }));

// Passport
app.use(passport.initialize());

// Allow all bots (Instagram needs to fetch media from our proxy)
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

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
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/approvals', approvalsRoutes);

// Serve frontend static files in production
const path = require('path');
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA fallback — non-API routes serve index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handler
app.use(errorHandler);

// Start BullMQ workers and repeatable jobs (non-blocking — server works without Redis)
try {
  const { setupRepeatable } = require('./queues');
  require('./queues/instagram-publish.worker');
  require('./queues/token-refresh.worker');
  require('./queues/delivery-sync.worker');
  require('./queues/approval-reminder.worker');
  setupRepeatable().catch((err) => logger.error('Failed to setup repeatable jobs', { error: err.message }));
  logger.info('BullMQ workers initialized');
} catch (err) {
  logger.error('BullMQ failed to initialize — scheduling disabled', { error: err.message });
}

// Start server
const server = app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
});

module.exports = { app, server };
