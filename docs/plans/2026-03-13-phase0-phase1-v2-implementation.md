# TasksLudus v2 — Phase 0 + Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the monorepo infrastructure (server + client), database schema, auth system, and RBAC — the foundation for all subsequent features.

**Architecture:** Monolito modular Express.js + Workers BullMQ. React SPA + PWA frontend. Postgres and Redis are hosted online (no Docker). ClickUp companion app — does NOT manage tasks, integrates via API.

**Tech Stack:** Express.js, Knex.js 3.x, Passport.js, JWT, BullMQ, React (Vite), Tailwind CSS v4, Shadcn/ui, Recharts, Zustand, TanStack Query, Axios, Socket.io, PWA (vite-plugin-pwa).

**Reference:** Design document at `docs/plans/2026-03-13-tasksludus-v2-design.md`

---

## Phase 0 — Infrastructure & Scaffold

---

### Task 1: Root Monorepo Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env` (local only, gitignored)

**Step 1: Create root package.json**

```json
{
  "name": "tasksludus",
  "version": "2.0.0",
  "private": true,
  "description": "ClickUp companion app for goals, performance tracking, and client portal",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "migrate": "cd server && npx knex migrate:latest",
    "migrate:rollback": "cd server && npx knex migrate:rollback",
    "migrate:make": "cd server && npx knex migrate:make",
    "seed": "cd server && npx knex seed:run",
    "lint": "concurrently \"npm run lint:server\" \"npm run lint:client\"",
    "lint:server": "cd server && npm run lint",
    "lint:client": "cd client && npm run lint"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

**Step 2: Create .gitignore**

```
node_modules/
.env
.env.local
dist/
build/
*.log
.DS_Store
Thumbs.db
coverage/
.vscode/
!.vscode/settings.json
```

**Step 3: Create .env.example**

```env
# Database (Postgres online)
DATABASE_URL=postgresql://user:password@host:5432/tasksludus
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tasksludus
DB_USER=postgres
DB_PASSWORD=password

# Redis (online)
REDIS_URL=redis://user:password@host:6379

# JWT
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# ClickUp
CLICKUP_API_TOKEN=your-clickup-api-token
CLICKUP_WEBHOOK_SECRET=your-clickup-webhook-secret

# Instagram Graph API
INSTAGRAM_ACCESS_TOKEN=your-instagram-access-token

# App
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:5173
```

**Step 4: Create .env with your actual values**

Copy `.env.example` to `.env` and fill in the real Postgres and Redis connection strings.

**Step 5: Install root dependencies**

Run: `npm install`

**Step 6: Commit**

```bash
git add package.json .gitignore .env.example
git commit -m "chore: initialize monorepo with root config"
```

---

### Task 2: Server Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/src/app.js`
- Create: `server/src/config/env.js`
- Create: `server/src/config/db.js`
- Create: `server/src/config/redis.js`
- Create: `server/knexfile.js`

**Step 1: Create server/package.json**

```json
{
  "name": "tasksludus-server",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "lint": "eslint src/",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "express": "^4.21.0",
    "knex": "^3.1.0",
    "pg": "^8.13.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.34.0",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "passport-google-oauth20": "^2.0.0",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "helmet": "^8.0.0",
    "express-rate-limit": "^7.4.0",
    "joi": "^17.13.0",
    "winston": "^3.17.0",
    "socket.io": "^4.8.0",
    "dotenv": "^16.4.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.0",
    "eslint": "^9.14.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

**Step 2: Create server/src/config/env.js**

```js
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// If no .env in server/, try root
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  db: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'tasksludus',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },

  clickup: {
    apiToken: process.env.CLICKUP_API_TOKEN,
    webhookSecret: process.env.CLICKUP_WEBHOOK_SECRET,
  },

  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
  },
};
```

**Step 3: Create server/src/config/db.js**

```js
const knex = require('knex');
const knexConfig = require('../../knexfile');
const env = require('./env');

const environment = env.nodeEnv || 'development';
const db = knex(knexConfig[environment]);

module.exports = db;
```

**Step 4: Create server/src/config/redis.js**

```js
const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

let redis;

if (env.redis.url) {
  redis = new Redis(env.redis.url, {
    maxRetriesPerRequest: null,
  });
} else {
  redis = new Redis({
    maxRetriesPerRequest: null,
  });
}

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

module.exports = redis;
```

**Step 5: Create server/src/utils/logger.js**

```js
const winston = require('winston');
const env = require('../config/env');

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
```

**Step 6: Create server/knexfile.js**

```js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'tasksludus',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/database/seeds',
    },
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/database/seeds',
    },
  },
};
```

**Step 7: Create server/src/app.js**

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
});

module.exports = { app, server };
```

**Step 8: Install server dependencies**

Run: `cd server && npm install`

**Step 9: Verify server starts**

Run: `cd server && npm run dev`
Expected: "Server running on port 3000 [development]"

Test: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","timestamp":"..."}`

**Step 10: Commit**

```bash
git add server/
git commit -m "chore: scaffold Express.js server with config"
```

---

### Task 3: Client Scaffold

**Files:**
- Create: `client/` (via Vite CLI)
- Modify: `client/vite.config.js`
- Modify: `client/src/App.jsx`
- Create: `client/public/manifest.json`

**Step 1: Create Vite + React project**

Run: `npm create vite@latest client -- --template react`

**Step 2: Install dependencies**

Run:
```bash
cd client
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install @tanstack/react-query zustand axios react-router-dom recharts socket.io-client lucide-react
```

**Step 3: Configure Vite**

Replace `client/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
```

**Step 4: Configure Tailwind**

Replace `client/src/index.css`:

```css
@import "tailwindcss";
```

**Step 5: Create PWA manifest**

Create `client/public/manifest.json`:

```json
{
  "name": "TasksLudus",
  "short_name": "TasksLudus",
  "description": "Metas, performance e portal de clientes",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#0f172a",
  "background_color": "#ffffff",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Step 6: Create placeholder icon directory**

Run: `mkdir -p client/public/icons`

Create a placeholder note at `client/public/icons/.gitkeep` (icons will be added later).

**Step 7: Clean up default Vite files**

Replace `client/src/App.jsx`:

```jsx
function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">TasksLudus</h1>
        <p className="text-slate-500 mt-2">Metas, performance e portal de clientes</p>
      </div>
    </div>
  );
}

export default App;
```

Delete `client/src/App.css`.

**Step 8: Verify client starts**

Run: `cd client && npm run dev`
Expected: Vite dev server at http://localhost:5173 showing "TasksLudus" heading with Tailwind styling.

**Step 9: Commit**

```bash
git add client/
git commit -m "chore: scaffold React client with Vite, Tailwind, PWA"
```

---

### Task 4: Shadcn/ui Setup

**Files:**
- Create: `client/components.json`
- Create: `client/src/lib/utils.js`
- Create: `client/src/components/ui/` (via shadcn CLI)

**Step 1: Initialize Shadcn**

Run: `cd client && npx shadcn@latest init`

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Step 2: Install essential components**

Run:
```bash
cd client
npx shadcn@latest add button card input label dialog dropdown-menu avatar badge separator switch tabs table toast
```

**Step 3: Verify components installed**

Run: `ls client/src/components/ui/`
Expected: Files for each component (button.jsx, card.jsx, etc.)

**Step 4: Test a component in App.jsx**

Replace `client/src/App.jsx`:

```jsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>TasksLudus</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 mb-4">Metas, performance e portal de clientes</p>
          <Button>Comecar</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
```

**Step 5: Verify in browser**

Run: `cd client && npm run dev`
Expected: Styled card with button at http://localhost:5173

**Step 6: Commit**

```bash
git add client/
git commit -m "chore: add Shadcn/ui components"
```

---

### Task 5: Lint & Format Setup

**Files:**
- Create: `server/eslint.config.js`
- Create: `client/eslint.config.js` (may already exist from Vite)
- Create: `.prettierrc`

**Step 1: Create .prettierrc at root**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

**Step 2: Create server/eslint.config.js**

```js
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
```

**Step 3: Install server eslint dependency**

Run: `cd server && npm install -D @eslint/js`

**Step 4: Verify lint runs**

Run: `cd server && npm run lint`
Expected: No errors

Run: `cd client && npm run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add .prettierrc server/eslint.config.js
git commit -m "chore: add ESLint and Prettier config"
```

---

## Phase 1 — Foundation (Database + Auth + RBAC)

---

### Task 6: Database Migrations — Users & Auth

**Files:**
- Create: `server/src/database/migrations/001_users.js`
- Create: `server/src/database/migrations/002_invite_tokens.js`

**Step 1: Create users migration**

Create `server/src/database/migrations/001_users.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password_hash').nullable();
    table.string('avatar_url').nullable();
    table.string('google_id').nullable();
    table.string('role').notNullable(); // ceo, director, manager, account_manager, producer, client
    table.string('producer_type').nullable(); // video_editor, designer, captation, social_media
    table.boolean('is_active').defaultTo(true);
    table.decimal('base_salary', 12, 2).nullable();
    table.boolean('auto_calc_enabled').defaultTo(true);
    table.timestamps(true, true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
```

**Step 2: Create invite_tokens migration**

Create `server/src/database/migrations/002_invite_tokens.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('invite_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable();
    table.string('role').notNullable();
    table.string('producer_type').nullable();
    table.uuid('invited_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invite_tokens');
};
```

**Step 3: Run migrations**

Run: `cd server && npx knex migrate:latest`
Expected: Batch 1 run: 2 migrations

**Step 4: Verify tables exist**

Run: `cd server && npx knex raw "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"`
Or check via your Postgres client.

**Step 5: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add users and invite_tokens migrations"
```

---

### Task 7: Database Migrations — Clients & Plans

**Files:**
- Create: `server/src/database/migrations/003_clients.js`
- Create: `server/src/database/migrations/004_plans.js`

**Step 1: Create clients migration**

Create `server/src/database/migrations/003_clients.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('clients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('name').notNullable();
    table.string('company').nullable();
    table.string('instagram_account').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('clients');
};
```

**Step 2: Create plans migration**

Create `server/src/database/migrations/004_plans.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('plans', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    .createTable('plan_limits', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('CASCADE');
      table.string('content_type').notNullable();
      table.integer('monthly_limit').notNullable();
      table.decimal('overage_price', 12, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('client_plans', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('CASCADE');
      table.date('starts_at').notNullable();
      table.date('ends_at').nullable();
      table.string('status').notNullable().defaultTo('active'); // active, paused, cancelled
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('client_plans')
    .dropTableIfExists('plan_limits')
    .dropTableIfExists('plans');
};
```

**Step 3: Run migrations**

Run: `cd server && npx knex migrate:latest`
Expected: Batch 2 run: 2 migrations

**Step 4: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add clients and plans migrations"
```

---

### Task 8: Database Migrations — Goals & Calculations

**Files:**
- Create: `server/src/database/migrations/005_goals.js`
- Create: `server/src/database/migrations/006_calculations.js`

**Step 1: Create goals migration**

Create `server/src/database/migrations/005_goals.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('goal_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('role').notNullable();
      table.string('producer_type').nullable();
      table.string('name').notNullable();
      table.integer('monthly_target').notNullable();
      table.decimal('multiplier_cap', 5, 2).notNullable();
      table.jsonb('curve_config').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    .createTable('user_goals', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('goal_template_id').nullable().references('id').inTable('goal_templates').onDelete('SET NULL');
      table.date('month').notNullable(); // first day of month (2026-03-01)
      table.integer('monthly_target').notNullable();
      table.decimal('multiplier_cap', 5, 2).nullable();
      table.jsonb('curve_config').nullable();
      table.uuid('defined_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamps(true, true);

      table.unique(['user_id', 'month']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('user_goals')
    .dropTableIfExists('goal_templates');
};
```

**Step 2: Create calculations migration**

Create `server/src/database/migrations/006_calculations.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('monthly_calculations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.date('month').notNullable();
    table.integer('total_deliveries').notNullable().defaultTo(0);
    table.decimal('base_salary', 12, 2).notNullable();
    table.decimal('suggested_bonus', 12, 2).nullable();
    table.decimal('final_bonus', 12, 2).nullable();
    table.decimal('multiplier_applied', 5, 2).nullable();
    table.string('status').notNullable().defaultTo('draft'); // draft, calculated, adjusted, closed
    table.timestamp('calculated_at').nullable();
    table.uuid('closed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('closed_at').nullable();
    table.timestamps(true, true);

    table.unique(['user_id', 'month']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('monthly_calculations');
};
```

**Step 3: Run migrations**

Run: `cd server && npx knex migrate:latest`
Expected: Batch 3 run: 2 migrations

**Step 4: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add goals and calculations migrations"
```

---

### Task 9: Database Migrations — Deliveries & Time Stats

**Files:**
- Create: `server/src/database/migrations/007_deliveries.js`

**Step 1: Create deliveries migration**

Create `server/src/database/migrations/007_deliveries.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('deliveries', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('clickup_task_id').notNullable();
      table.string('title').notNullable();
      table.string('content_type').notNullable(); // reel, feed, carrossel, banner, story, corte, pdf, mockup, apresentacao
      table.string('difficulty').nullable(); // easy, medium, hard
      table.string('urgency').nullable(); // normal, urgent
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.string('status').notNullable().defaultTo('in_progress'); // in_progress, completed
      table.date('month').notNullable();
      table.timestamps(true, true);

      table.unique('clickup_task_id');
      table.index(['user_id', 'month']);
      table.index(['client_id', 'month']);
    })
    .createTable('delivery_time_stats', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('content_type').notNullable();
      table.string('difficulty').notNullable();
      table.integer('avg_production_time_sec').notNullable();
      table.integer('sample_count').notNullable();
      table.date('period').notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['content_type', 'difficulty', 'period']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('delivery_time_stats')
    .dropTableIfExists('deliveries');
};
```

**Step 2: Run migrations**

Run: `cd server && npx knex migrate:latest`
Expected: Batch 4 run: 1 migration

**Step 3: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add deliveries and time stats migrations"
```

---

### Task 10: Database Migrations — Client Overages, Instagram, Campaigns, Settings

**Files:**
- Create: `server/src/database/migrations/008_client_overages.js`
- Create: `server/src/database/migrations/009_instagram.js`
- Create: `server/src/database/migrations/010_campaigns.js`
- Create: `server/src/database/migrations/011_settings.js`

**Step 1: Create client_overages migration**

Create `server/src/database/migrations/008_client_overages.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('client_overages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.uuid('client_plan_id').notNullable().references('id').inTable('client_plans').onDelete('CASCADE');
    table.date('month').notNullable();
    table.string('content_type').notNullable();
    table.integer('included_qty').notNullable();
    table.integer('delivered_qty').notNullable();
    table.integer('overage_qty').notNullable();
    table.decimal('overage_unit_price', 12, 2).notNullable();
    table.decimal('overage_total', 12, 2).notNullable();
    table.string('status').notNullable().defaultTo('pending'); // pending, billed, paid
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('client_overages');
};
```

**Step 2: Create instagram migration**

Create `server/src/database/migrations/009_instagram.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('instagram_posts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('delivery_id').nullable().references('id').inTable('deliveries').onDelete('SET NULL');
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('instagram_media_id').notNullable().unique();
      table.string('post_url').nullable();
      table.string('post_type').notNullable(); // reel, feed, carousel, story
      table.timestamp('posted_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('instagram_metrics', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('post_id').notNullable().references('id').inTable('instagram_posts').onDelete('CASCADE');
      table.integer('impressions').defaultTo(0);
      table.integer('reach').defaultTo(0);
      table.integer('engagement').defaultTo(0);
      table.integer('saves').defaultTo(0);
      table.integer('shares').defaultTo(0);
      table.integer('comments_count').defaultTo(0);
      table.integer('video_views').nullable();
      table.decimal('reel_skip_rate', 5, 2).nullable();
      table.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('instagram_metrics')
    .dropTableIfExists('instagram_posts');
};
```

**Step 3: Create campaigns migration (future-ready)**

Create `server/src/database/migrations/010_campaigns.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('campaigns', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('source').notNullable(); // meta_ads, google_ads, etc.
      table.string('external_id').nullable();
      table.string('name').notNullable();
      table.decimal('budget', 12, 2).nullable();
      table.string('status').notNullable().defaultTo('draft');
      table.date('start_date').nullable();
      table.date('end_date').nullable();
      table.jsonb('metrics').nullable();
      table.timestamps(true, true);
    })
    .createTable('campaign_deliveries', (table) => {
      table.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
      table.uuid('delivery_id').notNullable().references('id').inTable('deliveries').onDelete('CASCADE');
      table.primary(['campaign_id', 'delivery_id']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('campaign_deliveries')
    .dropTableIfExists('campaigns');
};
```

**Step 4: Create settings migration**

Create `server/src/database/migrations/011_settings.js`:

```js
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('app_settings', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('key').notNullable().unique();
      table.jsonb('value').notNullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('integrations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('type').notNullable().unique(); // clickup, instagram, kommo, meta_ads, evolution, payment
      table.jsonb('config').notNullable().defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_sync_at').nullable();
      table.timestamps(true, true);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('integrations')
    .dropTableIfExists('app_settings');
};
```

**Step 5: Run all migrations**

Run: `cd server && npx knex migrate:latest`
Expected: Batch 5 run: 4 migrations

**Step 6: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add overages, instagram, campaigns, settings migrations"
```

---

### Task 11: Database Seeds

**Files:**
- Create: `server/src/database/seeds/001_initial.js`

**Step 1: Create seed file**

Create `server/src/database/seeds/001_initial.js`:

```js
const bcrypt = require('bcrypt');

/**
 * @param {import('knex').Knex} knex
 */
exports.seed = async function (knex) {
  // Clean tables in order (respect foreign keys)
  await knex('campaign_deliveries').del();
  await knex('campaigns').del();
  await knex('instagram_metrics').del();
  await knex('instagram_posts').del();
  await knex('client_overages').del();
  await knex('delivery_time_stats').del();
  await knex('deliveries').del();
  await knex('monthly_calculations').del();
  await knex('user_goals').del();
  await knex('goal_templates').del();
  await knex('client_plans').del();
  await knex('plan_limits').del();
  await knex('plans').del();
  await knex('clients').del();
  await knex('invite_tokens').del();
  await knex('integrations').del();
  await knex('app_settings').del();
  await knex('users').del();

  // CEO user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const [ceo] = await knex('users')
    .insert({
      name: 'Wander Fran',
      email: 'wander@ludus.com',
      password_hash: passwordHash,
      role: 'ceo',
      is_active: true,
    })
    .returning('*');

  // Default app settings
  await knex('app_settings').insert([
    { key: 'ranking_show_names', value: JSON.stringify(true), updated_by: ceo.id },
    { key: 'default_currency', value: JSON.stringify('BRL'), updated_by: ceo.id },
  ]);

  // Default integrations (inactive until configured)
  await knex('integrations').insert([
    { type: 'clickup', config: JSON.stringify({}), is_active: false },
    { type: 'instagram', config: JSON.stringify({}), is_active: false },
  ]);

  // Example goal template — Designer
  await knex('goal_templates').insert({
    role: 'producer',
    producer_type: 'designer',
    name: 'Meta Designer Padrao',
    monthly_target: 20,
    multiplier_cap: 3.0,
    curve_config: JSON.stringify({
      levels: [
        { from: 0, to: 5, multiplier: 0.3 },
        { from: 6, to: 10, multiplier: 0.6 },
        { from: 11, to: 15, multiplier: 1.0 },
        { from: 16, to: 18, multiplier: 1.5 },
        { from: 19, to: 20, multiplier: 2.0 },
        { from: 21, to: null, multiplier: 3.0 },
      ],
    }),
  });

  // Example goal template — Video Editor
  await knex('goal_templates').insert({
    role: 'producer',
    producer_type: 'video_editor',
    name: 'Meta Editor de Video Padrao',
    monthly_target: 15,
    multiplier_cap: 3.0,
    curve_config: JSON.stringify({
      levels: [
        { from: 0, to: 3, multiplier: 0.3 },
        { from: 4, to: 7, multiplier: 0.6 },
        { from: 8, to: 11, multiplier: 1.0 },
        { from: 12, to: 13, multiplier: 1.5 },
        { from: 14, to: 15, multiplier: 2.0 },
        { from: 16, to: null, multiplier: 3.0 },
      ],
    }),
  });

  console.log('Seed completed: CEO user + settings + goal templates');
};
```

**Step 2: Run seeds**

Run: `cd server && npx knex seed:run`
Expected: "Seed completed: CEO user + settings + goal templates"

**Step 3: Commit**

```bash
git add server/src/database/seeds/
git commit -m "feat: add initial seeds (CEO, settings, goal templates)"
```

---

### Task 12: Auth Module — Service & Controller

**Files:**
- Create: `server/src/modules/auth/auth.service.js`
- Create: `server/src/modules/auth/auth.controller.js`
- Create: `server/src/modules/auth/auth.routes.js`
- Create: `server/src/modules/auth/auth.validation.js`

**Step 1: Create auth validation**

Create `server/src/modules/auth/auth.validation.js`:

```js
const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerFromInviteSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  password: Joi.string().min(6).required(),
  google_id: Joi.string().optional(),
});

const createInviteSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string()
    .valid('director', 'manager', 'account_manager', 'producer', 'client')
    .required(),
  producer_type: Joi.string()
    .valid('video_editor', 'designer', 'captation', 'social_media')
    .when('role', { is: 'producer', then: Joi.required(), otherwise: Joi.forbidden() }),
});

module.exports = {
  loginSchema,
  registerFromInviteSchema,
  createInviteSchema,
};
```

**Step 2: Create auth service**

Create `server/src/modules/auth/auth.service.js`:

```js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');

class AuthService {
  async login(email, password) {
    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    if (!user.password_hash) {
      throw Object.assign(new Error('Please login with Google'), { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    return this._generateTokens(user);
  }

  async googleLogin(googleId, email, name, avatarUrl) {
    let user = await db('users').where({ google_id: googleId }).first();

    if (!user) {
      user = await db('users').where({ email }).first();
      if (user) {
        // Link Google account to existing user
        await db('users').where({ id: user.id }).update({ google_id: googleId, avatar_url: avatarUrl });
        user.google_id = googleId;
      }
    }

    if (!user) {
      throw Object.assign(new Error('No account found. Please use an invite link.'), { status: 401 });
    }

    if (!user.is_active) {
      throw Object.assign(new Error('Account is deactivated'), { status: 401 });
    }

    return this._generateTokens(user);
  }

  async registerFromInvite(token, name, password, googleId) {
    const invite = await db('invite_tokens')
      .where({ token })
      .whereNull('used_at')
      .where('expires_at', '>', new Date())
      .first();

    if (!invite) {
      throw Object.assign(new Error('Invalid or expired invite'), { status: 400 });
    }

    const existing = await db('users').where({ email: invite.email }).first();
    if (existing) {
      throw Object.assign(new Error('User already exists'), { status: 409 });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const [user] = await db('users')
      .insert({
        name,
        email: invite.email,
        password_hash: passwordHash,
        google_id: googleId || null,
        role: invite.role,
        producer_type: invite.producer_type || null,
      })
      .returning('*');

    await db('invite_tokens').where({ id: invite.id }).update({ used_at: new Date() });

    return this._generateTokens(user);
  }

  async createInvite(email, role, producerType, invitedBy) {
    const existing = await db('users').where({ email }).first();
    if (existing) {
      throw Object.assign(new Error('User with this email already exists'), { status: 409 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db('invite_tokens')
      .insert({
        email,
        role,
        producer_type: producerType || null,
        invited_by: invitedBy,
        token,
        expires_at: expiresAt,
      })
      .returning('*');

    return invite;
  }

  async refreshToken(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const user = await db('users').where({ id: payload.sub, is_active: true }).first();
      if (!user) {
        throw new Error('User not found');
      }

      return this._generateTokens(user);
    } catch (err) {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
    }
  }

  _generateTokens(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      producerType: user.producer_type,
    };

    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      env.jwt.refreshSecret,
      { expiresIn: env.jwt.refreshExpiresIn }
    );

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }
}

module.exports = new AuthService();
```

**Step 3: Create auth controller**

Create `server/src/modules/auth/auth.controller.js`:

```js
const authService = require('./auth.service');
const { loginSchema, registerFromInviteSchema, createInviteSchema } = require('./auth.validation');

class AuthController {
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.login(value.email, value.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async googleCallback(req, res, next) {
    try {
      const { id: googleId, emails, displayName, photos } = req.user;
      const email = emails[0].value;
      const avatarUrl = photos?.[0]?.value || null;

      const result = await authService.googleLogin(googleId, email, displayName, avatarUrl);

      // Redirect to frontend with tokens
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?${params}`);
    } catch (err) {
      next(err);
    }
  }

  async acceptInvite(req, res, next) {
    try {
      const { token } = req.params;
      const { error, value } = registerFromInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.registerFromInvite(
        token,
        value.name,
        value.password,
        value.google_id
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async createInvite(req, res, next) {
    try {
      const { error, value } = createInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const invite = await authService.createInvite(
        value.email,
        value.role,
        value.producer_type,
        req.user.id
      );
      res.status(201).json(invite);
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(_req, res) {
    // JWT is stateless — client just discards the token
    // Future: add token to Redis blacklist
    res.json({ message: 'Logged out' });
  }

  async me(req, res) {
    res.json({ user: req.user });
  }
}

module.exports = new AuthController();
```

**Step 4: Create auth routes**

Create `server/src/modules/auth/auth.routes.js`:

```js
const express = require('express');
const passport = require('passport');
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Public routes
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/invites/:token/accept', authController.acceptInvite.bind(authController));

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  authController.googleCallback.bind(authController)
);

// Protected routes
router.get('/me', authenticate, authController.me.bind(authController));
router.post(
  '/invites',
  authenticate,
  authorize('ceo', 'director', 'manager'),
  authController.createInvite.bind(authController)
);

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/auth/
git commit -m "feat: add auth module (login, invite, Google OAuth, JWT)"
```

---

### Task 13: Auth Middleware & Passport Config

**Files:**
- Create: `server/src/middleware/auth.js`
- Create: `server/src/middleware/errorHandler.js`
- Create: `server/src/config/passport.js`

**Step 1: Create auth middleware**

Create `server/src/middleware/auth.js`:

```js
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
```

**Step 2: Create error handler middleware**

Create `server/src/middleware/errorHandler.js`:

```js
const logger = require('../utils/logger');

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    logger.error(`${status} - ${message}`, { stack: err.stack });
  } else {
    logger.warn(`${status} - ${message}`);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
```

**Step 3: Create Passport config**

Create `server/src/config/passport.js`:

```js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const db = require('./db');
const env = require('./env');

// Local strategy
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await db('users').where({ email, is_active: true }).first();
        if (!user) return done(null, false, { message: 'Invalid credentials' });

        if (!user.password_hash) {
          return done(null, false, { message: 'Please login with Google' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return done(null, false, { message: 'Invalid credentials' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Google OAuth strategy
if (env.google.clientId && env.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.google.clientId,
        clientSecret: env.google.clientSecret,
        callbackURL: env.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          return done(null, profile);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

module.exports = passport;
```

**Step 4: Commit**

```bash
git add server/src/middleware/ server/src/config/passport.js
git commit -m "feat: add auth middleware, error handler, Passport config"
```

---

### Task 14: Users Module

**Files:**
- Create: `server/src/modules/users/users.service.js`
- Create: `server/src/modules/users/users.controller.js`
- Create: `server/src/modules/users/users.routes.js`
- Create: `server/src/modules/users/users.validation.js`

**Step 1: Create users validation**

Create `server/src/modules/users/users.validation.js`:

```js
const Joi = require('joi');

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  avatar_url: Joi.string().uri().allow(null).optional(),
}).min(1);

const updateSalarySchema = Joi.object({
  base_salary: Joi.number().precision(2).min(0).required(),
});

module.exports = {
  updateUserSchema,
  updateSalarySchema,
};
```

**Step 2: Create users service**

Create `server/src/modules/users/users.service.js`:

```js
const db = require('../../config/db');

class UsersService {
  async list(filters = {}) {
    const query = db('users')
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url', 'created_at')
      .orderBy('name');

    if (filters.role) query.where('role', filters.role);
    if (filters.producer_type) query.where('producer_type', filters.producer_type);
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);

    return query;
  }

  async getById(id) {
    const user = await db('users')
      .where({ id })
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url', 'created_at', 'updated_at')
      .first();

    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return user;
  }

  async update(id, data) {
    const [updated] = await db('users')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'avatar_url');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }

  async updateSalary(id, baseSalary) {
    const [updated] = await db('users')
      .where({ id })
      .update({ base_salary: baseSalary, updated_at: new Date() })
      .returning('id', 'name', 'base_salary');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }

  async toggleAutoCalc(id) {
    const user = await db('users').where({ id }).first();
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    const [updated] = await db('users')
      .where({ id })
      .update({ auto_calc_enabled: !user.auto_calc_enabled, updated_at: new Date() })
      .returning('id', 'name', 'auto_calc_enabled');

    return updated;
  }

  async deactivate(id) {
    const [updated] = await db('users')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('id', 'name', 'is_active');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }
}

module.exports = new UsersService();
```

**Step 3: Create users controller**

Create `server/src/modules/users/users.controller.js`:

```js
const usersService = require('./users.service');
const { updateUserSchema, updateSalarySchema } = require('./users.validation');

class UsersController {
  async list(req, res, next) {
    try {
      const { role, producer_type, is_active } = req.query;
      const users = await usersService.list({ role, producer_type, is_active });
      res.json(users);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await usersService.getById(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateUserSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const user = await usersService.update(req.params.id, value);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async updateSalary(req, res, next) {
    try {
      const { error, value } = updateSalarySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const user = await usersService.updateSalary(req.params.id, value.base_salary);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async toggleAutoCalc(req, res, next) {
    try {
      const user = await usersService.toggleAutoCalc(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async deactivate(req, res, next) {
    try {
      const user = await usersService.deactivate(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UsersController();
```

**Step 4: Create users routes**

Create `server/src/modules/users/users.routes.js`:

```js
const express = require('express');
const usersController = require('./users.controller');
const { authenticate, authorize, ceoOnly, adminLevel, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', managementLevel, usersController.list.bind(usersController));
router.get('/:id', usersController.getById.bind(usersController));
router.put('/:id', usersController.update.bind(usersController));
router.patch('/:id/salary', ceoOnly, usersController.updateSalary.bind(usersController));
router.patch('/:id/auto-calc', adminLevel, usersController.toggleAutoCalc.bind(usersController));
router.patch('/:id/deactivate', managementLevel, usersController.deactivate.bind(usersController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/users/
git commit -m "feat: add users module (CRUD, salary, auto-calc toggle)"
```

---

### Task 15: Wire Everything Into App.js

**Files:**
- Modify: `server/src/app.js`

**Step 1: Update app.js to register all routes and middleware**

Replace `server/src/app.js`:

```js
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
```

**Step 2: Verify server starts with all modules**

Run: `cd server && npm run dev`
Expected: "Server running on port 3000 [development]"

**Step 3: Test health check with DB**

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","db":"connected","timestamp":"..."}`

**Step 4: Test login endpoint**

Run:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wander@ludus.com","password":"admin123"}'
```
Expected: JSON with `user`, `accessToken`, `refreshToken`

**Step 5: Test protected route**

Using the accessToken from step 4:
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```
Expected: JSON with user data

**Step 6: Test RBAC**

```bash
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer <accessToken>"
```
Expected: Array with the CEO user (since CEO has management-level access)

**Step 7: Commit**

```bash
git add server/src/app.js
git commit -m "feat: wire auth and users modules into Express app"
```

---

## Summary

| Task | What | Phase |
|------|------|-------|
| 1 | Root monorepo setup (.gitignore, .env, package.json) | 0 |
| 2 | Server scaffold (Express, Knex, Redis, Logger) | 0 |
| 3 | Client scaffold (Vite, React, Tailwind, PWA) | 0 |
| 4 | Shadcn/ui setup | 0 |
| 5 | Lint & format config | 0 |
| 6 | Migration: users + invite_tokens | 1 |
| 7 | Migration: clients + plans | 1 |
| 8 | Migration: goals + calculations | 1 |
| 9 | Migration: deliveries + time stats | 1 |
| 10 | Migration: overages, instagram, campaigns, settings | 1 |
| 11 | Seeds: CEO + settings + goal templates | 1 |
| 12 | Auth module (service, controller, routes, validation) | 1 |
| 13 | Auth middleware + Passport config | 1 |
| 14 | Users module (CRUD, salary, auto-calc) | 1 |
| 15 | Wire everything into app.js | 1 |

**Entregavel Phase 0:** `npm run dev` sobe server + client, Tailwind + Shadcn funcionando.

**Entregavel Phase 1:** API com auth JWT + Google OAuth, RBAC por role, CRUD de usuarios, todas as tabelas do banco criadas e seedadas. Login funcional com o CEO.
