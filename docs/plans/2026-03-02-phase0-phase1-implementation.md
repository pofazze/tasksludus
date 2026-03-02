# TasksLudus Phase 0 + Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the project infrastructure and build the foundation (DB schema, auth, RBAC) so the system can authenticate users, manage roles, and enforce permissions.

**Architecture:** Monolito modular Express.js com modules auto-contidos (routes → controller → service → validation). Docker Compose para Postgres 16 + Redis 7 local. Knex.js para migrations/queries. JWT auth com Passport.js (local + Google OAuth).

**Tech Stack:** Node.js, Express.js, Knex.js, PostgreSQL 16, Redis 7, Passport.js, JWT, Joi, Winston, Docker Compose, Vite, React, Tailwind CSS, Shadcn/ui, Axios, ESLint, Prettier

---

## Task 1: Docker Compose (Postgres + Redis)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: tasksludus-postgres
    environment:
      POSTGRES_DB: tasksludus_dev
      POSTGRES_USER: tasksludus
      POSTGRES_PASSWORD: secret
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: tasksludus-redis
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

**Step 2: Create .env.example**

```env
# Server
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:5173

# Database
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=tasksludus_dev
DB_NAME_TEST=tasksludus_test
DB_USER=tasksludus
DB_PASSWORD=secret

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT
JWT_SECRET=your-jwt-secret-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=sa-east-1
AWS_S3_BUCKET=tasksludus-uploads
```

**Step 3: Create .gitignore**

```gitignore
node_modules/
.env
dist/
.DS_Store
*.log
coverage/
.vite/
```

**Step 4: Start containers and verify**

Run: `docker compose up -d`
Run: `docker compose ps`
Expected: Both `tasksludus-postgres` and `tasksludus-redis` running healthy.

**Step 5: Copy .env.example to .env**

Run: `cp .env.example .env`

**Step 6: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "feat: add Docker Compose (Postgres 16 + Redis 7) and env config"
```

---

## Task 2: Server Scaffold (Express.js)

**Files:**
- Create: `server/package.json`
- Create: `server/app.js`
- Create: `server/server.js`
- Create: `server/src/config/env.js`
- Create: `server/src/config/database.js`
- Create: `server/src/config/redis.js`
- Create: `server/src/config/logger.js`
- Create: `server/src/utils/AppError.js`
- Create: `server/src/utils/asyncHandler.js`
- Create: `server/src/middleware/errorHandler.js`
- Create: `server/src/middleware/requestLogger.js`

**Step 1: Initialize server package.json**

Run: `mkdir -p server && cd server && npm init -y`

**Step 2: Install core dependencies**

Run (from `server/`):
```bash
npm install express cors helmet express-rate-limit cookie-parser dotenv knex pg ioredis passport passport-jwt passport-local passport-google-oauth20 jsonwebtoken bcryptjs joi winston multer @aws-sdk/client-s3 bullmq socket.io uuid
```

**Step 3: Install dev dependencies**

Run (from `server/`):
```bash
npm install -D nodemon jest supertest
```

**Step 4: Create server/src/config/env.js**

```javascript
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'tasksludus_dev',
    user: process.env.DB_USER || 'tasksludus',
    password: process.env.DB_PASSWORD || 'secret',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'sa-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'tasksludus-uploads',
  },
};

module.exports = env;
```

**Step 5: Create server/src/config/logger.js**

```javascript
const winston = require('winston');
const env = require('./env');

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.nodeEnv === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [new winston.transports.Console()],
});

module.exports = { logger };
```

**Step 6: Create server/src/config/database.js**

```javascript
const knex = require('knex');
const knexfile = require('../../knexfile');
const env = require('./env');

const config = knexfile[env.nodeEnv];
const db = knex(config);

module.exports = db;
```

**Step 7: Create server/src/config/redis.js**

```javascript
const Redis = require('ioredis');
const env = require('./env');
const { logger } = require('./logger');

const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  maxRetriesPerRequest: null,
});

redis.on('connect', () => logger.info('[Redis] Connected'));
redis.on('error', (err) => logger.error('[Redis] Error:', err.message));

module.exports = { redis };
```

**Step 8: Create server/src/utils/AppError.js**

```javascript
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
```

**Step 9: Create server/src/utils/asyncHandler.js**

```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
```

**Step 10: Create server/src/middleware/errorHandler.js**

```javascript
const { logger } = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  if (!err.isOperational) {
    logger.error('Unexpected error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

module.exports = { errorHandler };
```

**Step 11: Create server/src/middleware/requestLogger.js**

```javascript
const { logger } = require('../config/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
};

module.exports = { requestLogger };
```

**Step 12: Create server/knexfile.js**

```javascript
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'tasksludus_dev',
      user: process.env.DB_USER || 'tasksludus',
      password: process.env.DB_PASSWORD || 'secret',
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

  test: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME_TEST || 'tasksludus_test',
      user: process.env.DB_USER || 'tasksludus',
      password: process.env.DB_PASSWORD || 'secret',
    },
    pool: { min: 1, max: 5 },
    migrations: { directory: './src/database/migrations' },
    seeds: { directory: './src/database/seeds' },
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: { directory: './src/database/migrations' },
  },
};
```

**Step 13: Create server/app.js**

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const env = require('./src/config/env');
const { errorHandler } = require('./src/middleware/errorHandler');
const { requestLogger } = require('./src/middleware/requestLogger');

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(requestLogger);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'TasksLudus API is running' });
});

// Routes will be added here as modules are built

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
```

**Step 14: Create server/server.js**

```javascript
const http = require('http');
const app = require('./app');
const env = require('./src/config/env');
const { logger } = require('./src/config/logger');

const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info(`[Server] Running on port ${env.port} (${env.nodeEnv})`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
  server.close(() => process.exit(1));
});
```

**Step 15: Add scripts to server/package.json**

Update `scripts` in `server/package.json`:
```json
{
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "migrate": "knex migrate:latest --knexfile knexfile.js",
    "migrate:rollback": "knex migrate:rollback --knexfile knexfile.js",
    "migrate:make": "knex migrate:make --knexfile knexfile.js",
    "seed": "knex seed:run --knexfile knexfile.js",
    "test": "jest --runInBand --forceExit"
  }
}
```

**Step 16: Create empty directory structure**

```bash
mkdir -p server/src/modules/auth
mkdir -p server/src/modules/users
mkdir -p server/src/modules/roles
mkdir -p server/src/modules/tasks
mkdir -p server/src/modules/campaigns
mkdir -p server/src/modules/performance
mkdir -p server/src/modules/notifications
mkdir -p server/src/modules/feed
mkdir -p server/src/modules/uploads
mkdir -p server/src/modules/projects
mkdir -p server/src/modules/whatsapp
mkdir -p server/src/modules/dashboard
mkdir -p server/src/middleware
mkdir -p server/src/workers
mkdir -p server/src/database/migrations
mkdir -p server/src/database/seeds
mkdir -p server/src/utils
```

**Step 17: Verify server starts**

Run: `cd server && npm run dev`
Expected: `[Server] Running on port 3001 (development)`

Test: `curl http://localhost:3001/api/health`
Expected: `{"success":true,"message":"TasksLudus API is running"}`

**Step 18: Commit**

```bash
git add server/
git commit -m "feat: scaffold Express.js server with configs and middleware"
```

---

## Task 3: Client Scaffold (Vite + React + Tailwind + Shadcn/ui)

**Files:**
- Create: `client/` (entire Vite scaffold)
- Create: `client/src/lib/axios.js`
- Create: `client/src/App.jsx`

**Step 1: Create Vite React project**

Run (from project root):
```bash
npm create vite@latest client -- --template react
cd client && npm install
```

**Step 2: Install frontend dependencies**

Run (from `client/`):
```bash
npm install axios react-router-dom@6 zustand @tanstack/react-query socket.io-client recharts
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind CSS**

Replace `client/src/index.css` with:
```css
@import "tailwindcss";
```

Add Tailwind plugin to `client/vite.config.js`:
```javascript
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

**Step 4: Initialize Shadcn/ui**

Run (from `client/`):
```bash
npx shadcn@latest init
```
Select: New York style, Zinc color, CSS variables yes.

**Step 5: Create Axios instance**

Create `client/src/lib/axios.js`:
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 + token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });

        localStorage.setItem('access_token', data.data.accessToken);
        localStorage.setItem('refresh_token', data.data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

**Step 6: Create basic App.jsx**

Replace `client/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div className="p-8 text-2xl font-bold">TasksLudus</div>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

**Step 7: Create client directory structure**

```bash
mkdir -p client/src/components/ui
mkdir -p client/src/components/layout
mkdir -p client/src/components/tasks
mkdir -p client/src/components/editor
mkdir -p client/src/components/common
mkdir -p client/src/pages
mkdir -p client/src/hooks
mkdir -p client/src/services
mkdir -p client/src/stores
mkdir -p client/src/utils
```

**Step 8: Verify client starts**

Run: `cd client && npm run dev`
Expected: Vite dev server at http://localhost:5173, "TasksLudus" visible on page.

**Step 9: Commit**

```bash
git add client/
git commit -m "feat: scaffold React client with Vite, Tailwind, Shadcn/ui, Axios"
```

---

## Task 4: Root Monorepo Config

**Files:**
- Create: `package.json` (root)

**Step 1: Create root package.json**

```json
{
  "name": "tasksludus",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "migrate": "cd server && npm run migrate",
    "migrate:rollback": "cd server && npm run migrate:rollback",
    "seed": "cd server && npm run seed",
    "test": "cd server && npm test",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "setup": "npm run docker:up && cd server && npm install && cd ../client && npm install && cd .. && npm run migrate && npm run seed"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

**Step 2: Install root dependency**

Run: `npm install`

**Step 3: Verify full dev stack**

Run: `npm run docker:up && npm run dev`
Expected: Postgres + Redis containers running, server on :3001, client on :5173.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add root monorepo config with dev/migrate/seed scripts"
```

---

## Task 5: ESLint + Prettier

**Files:**
- Create: `server/.eslintrc.json`
- Create: `server/.prettierrc`
- Create: `client/.prettierrc`

**Step 1: Install ESLint + Prettier in server**

Run (from `server/`):
```bash
npm install -D eslint prettier eslint-config-prettier
```

**Step 2: Create server/.eslintrc.json**

```json
{
  "env": {
    "node": true,
    "es2022": true,
    "jest": true
  },
  "extends": ["eslint:recommended", "prettier"],
  "parserOptions": {
    "ecmaVersion": 2022
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off"
  }
}
```

**Step 3: Create shared .prettierrc at root**

Create `.prettierrc`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

**Step 4: Add lint scripts to server/package.json**

Add to scripts:
```json
{
  "lint": "eslint src/ --ext .js",
  "format": "prettier --write \"src/**/*.js\""
}
```

**Step 5: Commit**

```bash
git add server/.eslintrc.json .prettierrc
git commit -m "feat: add ESLint + Prettier configuration"
```

---

## Task 6: Migration — Core Tables (organizations, users, roles)

**Files:**
- Create: `server/src/database/migrations/20260302000001_create_organizations.js`
- Create: `server/src/database/migrations/20260302000002_create_users.js`
- Create: `server/src/database/migrations/20260302000003_create_roles_and_hierarchy.js`

**Step 1: Create organizations migration**

```javascript
// server/src/database/migrations/20260302000001_create_organizations.js
exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('slug', 100).notNullable().unique();
    table.jsonb('settings').defaultTo('{}');
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('organizations');
};
```

**Step 2: Create users migration**

```javascript
// server/src/database/migrations/20260302000002_create_users.js
exports.up = async function (knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).nullable();
    table.string('avatar_url').nullable();
    table.string('google_id', 255).nullable().unique();
    table.string('phone_whatsapp', 50).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_admin').notNullable().defaultTo(false);
    table.boolean('is_superadmin').notNullable().defaultTo(false);
    table.timestamps(true, true);

    table.index('organization_id');
    table.index('email');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('users');
};
```

**Step 3: Create roles and hierarchy migration**

```javascript
// server/src/database/migrations/20260302000003_create_roles_and_hierarchy.js
exports.up = async function (knex) {
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('display_name', 150).notNullable();
    table.integer('level').notNullable();
    table.jsonb('permissions').defaultTo('[]');
    table.jsonb('pipeline_config').defaultTo('{}');
    table.boolean('is_system').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['organization_id', 'name']);
  });

  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').notNullable()
      .references('id').inTable('roles').onDelete('CASCADE');
    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.createTable('management_hierarchy', (table) => {
    table.uuid('manager_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.uuid('subordinate_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.primary(['manager_id', 'subordinate_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('management_hierarchy');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('roles');
};
```

**Step 4: Run migrations**

Run: `cd server && npx knex migrate:latest --knexfile knexfile.js`
Expected: 3 migrations executed successfully.

**Step 5: Verify tables exist**

Run: `docker exec tasksludus-postgres psql -U tasksludus -d tasksludus_dev -c "\dt"`
Expected: organizations, users, roles, user_roles, management_hierarchy tables listed.

**Step 6: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add core migrations (organizations, users, roles, hierarchy)"
```

---

## Task 7: Migration — Task Tables

**Files:**
- Create: `server/src/database/migrations/20260302000004_create_tasks.js`
- Create: `server/src/database/migrations/20260302000005_create_task_templates.js`

**Step 1: Create tasks migration**

```javascript
// server/src/database/migrations/20260302000004_create_tasks.js
exports.up = async function (knex) {
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('parent_task_id').nullable()
      .references('id').inTable('tasks').onDelete('SET NULL');
    table.uuid('template_id').nullable();
    table.string('title', 255).notNullable();
    table.text('description').nullable();
    table.string('status', 50).notNullable().defaultTo('backlog');
    table.string('priority', 20).notNullable().defaultTo('medium');
    table.string('size', 20).nullable();
    table.string('difficulty', 20).nullable();
    table.uuid('assigned_to').nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.uuid('assigned_role_id').nullable()
      .references('id').inTable('roles').onDelete('SET NULL');
    table.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.date('due_date').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.integer('order_index').notNullable().defaultTo(0);
    table.jsonb('briefing').defaultTo('{}');
    table.jsonb('checklist').defaultTo('[]');
    table.boolean('is_archived').notNullable().defaultTo(false);
    table.timestamps(true, true);

    table.index('organization_id');
    table.index('assigned_to');
    table.index('status');
    table.index('parent_task_id');
  });

  await knex.schema.createTable('task_collaborators', (table) => {
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').nullable()
      .references('id').inTable('roles').onDelete('SET NULL');
    table.primary(['task_id', 'user_id']);
  });

  await knex.schema.createTable('task_dependencies', (table) => {
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('depends_on_task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.primary(['task_id', 'depends_on_task_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('task_dependencies');
  await knex.schema.dropTableIfExists('task_collaborators');
  await knex.schema.dropTableIfExists('tasks');
};
```

**Step 2: Create task templates migration**

```javascript
// server/src/database/migrations/20260302000005_create_task_templates.js
exports.up = async function (knex) {
  await knex.schema.createTable('task_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Add FK now that task_templates exists
  await knex.schema.alterTable('tasks', (table) => {
    table.foreign('template_id').references('id').inTable('task_templates').onDelete('SET NULL');
  });

  await knex.schema.createTable('task_template_stages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('template_id').notNullable()
      .references('id').inTable('task_templates').onDelete('CASCADE');
    table.uuid('role_id').notNullable()
      .references('id').inTable('roles').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.integer('order_index').notNullable();
    table.integer('estimated_duration_min').nullable();
    table.jsonb('checklist').defaultTo('[]');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('task_template_stages');
  await knex.schema.alterTable('tasks', (table) => {
    table.dropForeign('template_id');
  });
  await knex.schema.dropTableIfExists('task_templates');
};
```

**Step 3: Run migrations**

Run: `cd server && npx knex migrate:latest --knexfile knexfile.js`
Expected: 2 new migrations executed.

**Step 4: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add task and template migrations"
```

---

## Task 8: Migration — Support Tables (time tracking, campaigns, performance, support)

**Files:**
- Create: `server/src/database/migrations/20260302000006_create_time_tracking.js`
- Create: `server/src/database/migrations/20260302000007_create_campaigns.js`
- Create: `server/src/database/migrations/20260302000008_create_performance.js`
- Create: `server/src/database/migrations/20260302000009_create_support_tables.js`
- Create: `server/src/database/migrations/20260302000010_create_projects.js`

**Step 1: Create time tracking migration**

```javascript
// server/src/database/migrations/20260302000006_create_time_tracking.js
exports.up = async function (knex) {
  await knex.schema.createTable('time_entries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('started_at').notNullable();
    table.timestamp('ended_at').nullable();
    table.integer('duration_seconds').nullable();
    table.boolean('is_manual_adjustment').notNullable().defaultTo(false);
    table.uuid('adjusted_by').nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.text('notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('task_id');
    table.index('user_id');
  });

  await knex.schema.createTable('task_status_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.string('from_status', 50).notNullable();
    table.string('to_status', 50).notNullable();
    table.uuid('changed_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('changed_at').defaultTo(knex.fn.now());

    table.index('task_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('task_status_transitions');
  await knex.schema.dropTableIfExists('time_entries');
};
```

**Step 2: Create campaigns migration**

```javascript
// server/src/database/migrations/20260302000007_create_campaigns.js
exports.up = async function (knex) {
  await knex.schema.createTable('campaigns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('platform', 50).notNullable();
    table.decimal('budget', 12, 2).nullable();
    table.string('status', 50).notNullable().defaultTo('draft');
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.text('notes').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);

    table.index('organization_id');
  });

  await knex.schema.createTable('campaign_tasks', (table) => {
    table.uuid('campaign_id').notNullable()
      .references('id').inTable('campaigns').onDelete('CASCADE');
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.primary(['campaign_id', 'task_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('campaign_tasks');
  await knex.schema.dropTableIfExists('campaigns');
};
```

**Step 3: Create performance migration**

```javascript
// server/src/database/migrations/20260302000008_create_performance.js
exports.up = async function (knex) {
  await knex.schema.createTable('performance_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.integer('tasks_completed').notNullable().defaultTo(0);
    table.integer('tasks_on_time').notNullable().defaultTo(0);
    table.integer('tasks_rejected').notNullable().defaultTo(0);
    table.integer('avg_completion_time_sec').nullable();
    table.decimal('quality_score', 5, 2).nullable();
    table.decimal('volume_score', 5, 2).nullable();
    table.decimal('time_score', 5, 2).nullable();
    table.decimal('overall_score', 5, 2).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('user_id');
    table.index(['period_start', 'period_end']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('performance_scores');
};
```

**Step 4: Create support tables migration**

```javascript
// server/src/database/migrations/20260302000009_create_support_tables.js
exports.up = async function (knex) {
  await knex.schema.createTable('attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('uploaded_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('file_name', 255).notNullable();
    table.string('file_type', 50).notNullable();
    table.string('storage_type', 20).notNullable();
    table.string('url', 1024).notNullable();
    table.string('thumbnail_url', 1024).nullable();
    table.bigInteger('file_size_bytes').nullable();
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('task_id');
  });

  await knex.schema.createTable('comments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.text('content').notNullable();
    table.timestamps(true, true);

    table.index('task_id');
  });

  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('type', 50).notNullable();
    table.string('title', 255).notNullable();
    table.text('message').nullable();
    table.jsonb('data').defaultTo('{}');
    table.timestamp('read_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('user_id');
    table.index('read_at');
  });

  await knex.schema.createTable('activity_feed', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('actor_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('action', 100).notNullable();
    table.string('target_type', 50).notNullable();
    table.uuid('target_id').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('organization_id');
    table.index('created_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('activity_feed');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('comments');
  await knex.schema.dropTableIfExists('attachments');
};
```

**Step 5: Create projects migration (for client portal)**

```javascript
// server/src/database/migrations/20260302000010_create_projects.js
exports.up = async function (knex) {
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('client_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.string('status', 50).notNullable().defaultTo('active');
    table.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.timestamps(true, true);

    table.index('organization_id');
    table.index('client_id');
  });

  await knex.schema.createTable('project_tasks', (table) => {
    table.uuid('project_id').notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.primary(['project_id', 'task_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('project_tasks');
  await knex.schema.dropTableIfExists('projects');
};
```

**Step 6: Run all migrations**

Run: `cd server && npx knex migrate:latest --knexfile knexfile.js`
Expected: 5 new migrations executed successfully.

**Step 7: Verify all tables**

Run: `docker exec tasksludus-postgres psql -U tasksludus -d tasksludus_dev -c "\dt"`
Expected: All 18 tables listed (organizations, users, roles, user_roles, management_hierarchy, tasks, task_collaborators, task_dependencies, task_templates, task_template_stages, time_entries, task_status_transitions, campaigns, campaign_tasks, performance_scores, attachments, comments, notifications, activity_feed, projects, project_tasks).

**Step 8: Commit**

```bash
git add server/src/database/migrations/
git commit -m "feat: add all remaining migrations (time tracking, campaigns, performance, support, projects)"
```

---

## Task 9: Seeds (organization, roles, superadmin)

**Files:**
- Create: `server/src/database/seeds/01_organizations.js`
- Create: `server/src/database/seeds/02_roles.js`
- Create: `server/src/database/seeds/03_superadmin.js`

**Step 1: Create organization seed**

```javascript
// server/src/database/seeds/01_organizations.js
const ORG_ID = '00000000-0000-0000-0000-000000000001';

exports.seed = async function (knex) {
  await knex('organizations').del();
  await knex('organizations').insert([
    {
      id: ORG_ID,
      name: 'TasksLudus',
      slug: 'tasksludus',
      settings: JSON.stringify({ timezone: 'America/Sao_Paulo' }),
    },
  ]);
};

exports.ORG_ID = ORG_ID;
```

**Step 2: Create roles seed**

```javascript
// server/src/database/seeds/02_roles.js
const { ORG_ID } = require('./01_organizations');

const SYSTEM_ROLES = [
  {
    name: 'diretor',
    display_name: 'Diretor',
    level: 3,
    permissions: ['tasks:read', 'tasks:update', 'users:read', 'performance:read', 'campaigns:read', 'dashboard:director'],
  },
  {
    name: 'gestor_social_media',
    display_name: 'Gestor de Social Media',
    level: 2,
    permissions: ['tasks:create', 'tasks:read', 'tasks:update', 'tasks:review', 'users:read', 'performance:read:team', 'dashboard:manager'],
  },
  {
    name: 'gestor_video',
    display_name: 'Gestor de Video',
    level: 2,
    permissions: ['tasks:create', 'tasks:read', 'tasks:update', 'tasks:review', 'users:read', 'performance:read:team', 'dashboard:manager'],
  },
  {
    name: 'diretor_trafego',
    display_name: 'Diretor de Trafego',
    level: 3,
    permissions: ['tasks:read', 'tasks:update', 'campaigns:read', 'campaigns:update', 'users:read', 'performance:read', 'dashboard:director'],
  },
  {
    name: 'gestor_trafego',
    display_name: 'Gestor de Trafego',
    level: 2,
    permissions: ['tasks:create', 'tasks:read', 'campaigns:create', 'campaigns:read', 'campaigns:update', 'dashboard:manager'],
  },
  {
    name: 'filmmaker',
    display_name: 'Filmmaker',
    level: 1,
    permissions: ['tasks:read:own', 'tasks:update:own', 'dashboard:producer'],
  },
  {
    name: 'editor_video',
    display_name: 'Editor de Video',
    level: 1,
    permissions: ['tasks:read:own', 'tasks:update:own', 'dashboard:producer'],
  },
  {
    name: 'designer',
    display_name: 'Designer',
    level: 1,
    permissions: ['tasks:read:own', 'tasks:update:own', 'dashboard:producer'],
  },
  {
    name: 'web_designer',
    display_name: 'Web Designer',
    level: 1,
    permissions: ['tasks:read:own', 'tasks:update:own', 'dashboard:producer'],
  },
  {
    name: 'social_media_producer',
    display_name: 'Produtor de Social Media',
    level: 1,
    permissions: ['tasks:read:own', 'tasks:update:own', 'dashboard:producer'],
  },
  {
    name: 'client',
    display_name: 'Client',
    level: 0,
    permissions: ['projects:read:own', 'tasks:read:own', 'comments:create', 'dashboard:client'],
  },
];

exports.seed = async function (knex) {
  await knex('user_roles').del();
  await knex('roles').del();

  const roles = SYSTEM_ROLES.map((role) => ({
    organization_id: ORG_ID,
    name: role.name,
    display_name: role.display_name,
    level: role.level,
    permissions: JSON.stringify(role.permissions),
    pipeline_config: '{}',
    is_system: true,
  }));

  await knex('roles').insert(roles);
};
```

**Step 3: Create superadmin seed**

```javascript
// server/src/database/seeds/03_superadmin.js
const bcrypt = require('bcryptjs');
const { ORG_ID } = require('./01_organizations');

exports.seed = async function (knex) {
  const passwordHash = await bcrypt.hash('admin123', 12);

  await knex('users').del();
  await knex('users').insert([
    {
      id: '00000000-0000-0000-0000-000000000002',
      organization_id: ORG_ID,
      name: 'Super Admin',
      email: 'admin@tasksludus.com',
      password_hash: passwordHash,
      phone_whatsapp: '+5511999999999',
      is_active: true,
      is_admin: true,
      is_superadmin: true,
    },
  ]);
};
```

**Step 4: Run seeds**

Run: `cd server && npx knex seed:run --knexfile knexfile.js`
Expected: Seeds executed — 1 org, 11 roles, 1 superadmin user created.

**Step 5: Verify data**

Run: `docker exec tasksludus-postgres psql -U tasksludus -d tasksludus_dev -c "SELECT name, level FROM roles ORDER BY level"`
Expected: 11 roles from client (0) to diretor (3).

**Step 6: Commit**

```bash
git add server/src/database/seeds/
git commit -m "feat: add seeds (default org, 11 system roles, superadmin user)"
```

---

## Task 10: Auth Module — Passport Strategies

**Files:**
- Create: `server/src/modules/auth/auth.strategies.js`
- Create: `server/src/middleware/authenticate.js`

**Step 1: Create Passport JWT + Local + Google strategies**

```javascript
// server/src/modules/auth/auth.strategies.js
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const env = require('../../config/env');

// JWT Strategy — used by authenticate middleware
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.jwt.secret,
    },
    async (payload, done) => {
      try {
        const user = await db('users').where({ id: payload.sub, is_active: true }).first();
        if (!user) return done(null, false);

        // Attach roles
        const roles = await db('roles')
          .join('user_roles', 'roles.id', 'user_roles.role_id')
          .where('user_roles.user_id', user.id)
          .select('roles.*');

        user.roles = roles;
        user.permissions = roles.flatMap((r) => JSON.parse(r.permissions || '[]'));
        user.organizationId = user.organization_id;
        user.userId = user.id;

        return done(null, user);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

// Local Strategy — email/password login
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await db('users').where({ email: email.toLowerCase(), is_active: true }).first();
        if (!user) return done(null, false, { message: 'Invalid email or password' });
        if (!user.password_hash) return done(null, false, { message: 'Please use Google login' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return done(null, false, { message: 'Invalid email or password' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Google OAuth Strategy
if (env.google.clientId) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.google.clientId,
        clientSecret: env.google.clientSecret,
        callbackURL: env.google.callbackUrl,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value.toLowerCase();

          // Find existing user by google_id or email
          let user = await db('users')
            .where({ google_id: profile.id })
            .orWhere({ email })
            .first();

          if (user) {
            // Update google_id if not set
            if (!user.google_id) {
              await db('users').where({ id: user.id }).update({
                google_id: profile.id,
                avatar_url: user.avatar_url || profile.photos?.[0]?.value,
              });
              user.google_id = profile.id;
            }
          }
          // Note: we don't auto-create users. They must be invited first.
          // If user doesn't exist, return false.
          if (!user || !user.is_active) {
            return done(null, false, { message: 'Account not found. Please contact your admin for an invite.' });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}
```

**Step 2: Create authenticate middleware**

```javascript
// server/src/middleware/authenticate.js
const passport = require('passport');
const { AppError } = require('../utils/AppError');

const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return next(new AppError(info?.message || 'Unauthorized', 401));
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = { authenticate };
```

**Step 3: Initialize Passport in app.js**

Add to `server/app.js` (after cookieParser):
```javascript
const passport = require('passport');
require('./src/modules/auth/auth.strategies');
app.use(passport.initialize());
```

**Step 4: Commit**

```bash
git add server/src/modules/auth/auth.strategies.js server/src/middleware/authenticate.js server/app.js
git commit -m "feat: add Passport strategies (JWT, Local, Google OAuth) and authenticate middleware"
```

---

## Task 11: Auth Module — Service, Controller, Routes, Validation

**Files:**
- Create: `server/src/modules/auth/auth.service.js`
- Create: `server/src/modules/auth/auth.controller.js`
- Create: `server/src/modules/auth/auth.routes.js`
- Create: `server/src/modules/auth/auth.validation.js`
- Create: `server/src/middleware/validate.js`

**Step 1: Create validate middleware**

```javascript
// server/src/middleware/validate.js
const { AppError } = require('../utils/AppError');

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    return next(new AppError(message, 400));
  }

  req.body = value;
  next();
};

module.exports = { validate };
```

**Step 2: Create auth validation schemas**

```javascript
// server/src/modules/auth/auth.validation.js
const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  phone_whatsapp: Joi.string().min(10).max(50).required(),
  invite_token: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(128).required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshSchema,
};
```

**Step 3: Create auth service**

```javascript
// server/src/modules/auth/auth.service.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const { redis } = require('../../config/redis');
const env = require('../../config/env');
const { AppError } = require('../../utils/AppError');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { sub: user.id, org: user.organization_id },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, jti: uuidv4() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

const register = async ({ name, email, password, phone_whatsapp, invite_token }) => {
  // Verify invite token exists in Redis
  const inviteData = await redis.get(`invite:${invite_token}`);
  if (!inviteData) throw new AppError('Invalid or expired invite token', 400);

  const invite = JSON.parse(inviteData);

  // Check email not taken
  const existing = await db('users').where({ email: email.toLowerCase() }).first();
  if (existing) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db('users')
    .insert({
      organization_id: invite.organization_id,
      name,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      phone_whatsapp,
    })
    .returning('*');

  // Assign role from invite
  if (invite.role_id) {
    await db('user_roles').insert({ user_id: user.id, role_id: invite.role_id });
  }

  // Delete used invite
  await redis.del(`invite:${invite_token}`);

  const tokens = generateTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

const login = async (user) => {
  const tokens = generateTokens(user);

  // Store refresh token in Redis
  const decoded = jwt.decode(tokens.refreshToken);
  await redis.set(
    `refresh:${decoded.jti}`,
    user.id,
    'EX',
    7 * 24 * 60 * 60 // 7 days
  );

  return { user: sanitizeUser(user), ...tokens };
};

const refresh = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
    const userId = await redis.get(`refresh:${decoded.jti}`);

    if (!userId) throw new AppError('Invalid refresh token', 401);

    const user = await db('users').where({ id: userId, is_active: true }).first();
    if (!user) throw new AppError('User not found', 401);

    // Rotate: delete old, create new
    await redis.del(`refresh:${decoded.jti}`);
    const tokens = generateTokens(user);

    const newDecoded = jwt.decode(tokens.refreshToken);
    await redis.set(`refresh:${newDecoded.jti}`, user.id, 'EX', 7 * 24 * 60 * 60);

    return { user: sanitizeUser(user), ...tokens };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid refresh token', 401);
  }
};

const logout = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
    await redis.del(`refresh:${decoded.jti}`);
  } catch {
    // Token already invalid, that's fine
  }
};

const forgotPassword = async (email) => {
  const user = await db('users').where({ email: email.toLowerCase(), is_active: true }).first();
  if (!user) return; // Don't reveal if email exists

  const resetToken = uuidv4();
  await redis.set(`reset:${resetToken}`, user.id, 'EX', 60 * 60); // 1 hour

  // TODO: Send email with reset link (Phase 5)
  // For now, log the token
  const { logger } = require('../../config/logger');
  logger.info(`[Auth] Password reset token for ${email}: ${resetToken}`);
};

const resetPassword = async (token, newPassword) => {
  const userId = await redis.get(`reset:${token}`);
  if (!userId) throw new AppError('Invalid or expired reset token', 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db('users').where({ id: userId }).update({ password_hash: passwordHash });
  await redis.del(`reset:${token}`);
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar_url: user.avatar_url,
  is_admin: user.is_admin,
  is_superadmin: user.is_superadmin,
  organization_id: user.organization_id,
});

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, generateTokens };
```

**Step 4: Create auth controller**

```javascript
// server/src/modules/auth/auth.controller.js
const passport = require('passport');
const authService = require('./auth.service');
const { AppError } = require('../../utils/AppError');
const env = require('../../config/env');

const register = async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, data: result });
};

const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return next(new AppError(info?.message || 'Invalid credentials', 401));

    const result = await authService.login(user);
    res.json({ success: true, data: result });
  })(req, res, next);
};

const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
});

const googleCallback = (req, res, next) => {
  passport.authenticate('google', { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.redirect(`${env.clientUrl}/login?error=${encodeURIComponent(info?.message || 'Google auth failed')}`);
    }

    const result = await authService.login(user);
    // Redirect to frontend with tokens
    res.redirect(
      `${env.clientUrl}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`
    );
  })(req, res, next);
};

const refreshToken = async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  res.json({ success: true, data: result });
};

const logout = async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.json({ success: true, message: 'Logged out' });
};

const forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
};

const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  res.json({ success: true, message: 'Password reset successfully' });
};

module.exports = { register, login, googleAuth, googleCallback, refreshToken, logout, forgotPassword, resetPassword };
```

**Step 5: Create auth routes**

```javascript
// server/src/modules/auth/auth.routes.js
const router = require('express').Router();
const { asyncHandler } = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const controller = require('./auth.controller');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshSchema,
} = require('./auth.validation');

router.post('/register', validate(registerSchema), asyncHandler(controller.register));
router.post('/login', validate(loginSchema), controller.login);
router.get('/google', controller.googleAuth);
router.get('/google/callback', controller.googleCallback);
router.post('/refresh', validate(refreshSchema), asyncHandler(controller.refreshToken));
router.post('/logout', asyncHandler(controller.logout));
router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(controller.resetPassword));

module.exports = router;
```

**Step 6: Register auth routes in app.js**

Add to `server/app.js` (after health check):
```javascript
const authRoutes = require('./src/modules/auth/auth.routes');
app.use('/api/auth', authRoutes);
```

**Step 7: Test login endpoint manually**

Run: `curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@tasksludus.com","password":"admin123"}'`
Expected: JSON with `success: true`, user data, accessToken, refreshToken.

**Step 8: Commit**

```bash
git add server/src/modules/auth/ server/src/middleware/validate.js server/app.js
git commit -m "feat: add auth module (register, login, Google OAuth, JWT refresh, password reset)"
```

---

## Task 12: RBAC Middleware

**Files:**
- Create: `server/src/middleware/rbac.js`

**Step 1: Create RBAC middleware**

```javascript
// server/src/middleware/rbac.js
const db = require('../config/database');
const { AppError } = require('../utils/AppError');

// Check if user has a specific permission
const checkPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const { user } = req;
    if (!user) return next(new AppError('Unauthorized', 401));

    // Superadmin bypasses all permission checks
    if (user.is_superadmin) return next();

    // Admin has elevated permissions
    if (user.is_admin) return next();

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some((perm) =>
      user.permissions.includes(perm)
    );

    if (!hasPermission) {
      return next(new AppError('Forbidden: insufficient permissions', 403));
    }

    next();
  };
};

// Require minimum role level
const requireLevel = (minLevel) => {
  return (req, res, next) => {
    const { user } = req;
    if (!user) return next(new AppError('Unauthorized', 401));

    if (user.is_superadmin) return next();

    const maxLevel = Math.max(...user.roles.map((r) => r.level), 0);
    if (maxLevel < minLevel) {
      return next(new AppError('Forbidden: insufficient role level', 403));
    }

    next();
  };
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  const { user } = req;
  if (!user) return next(new AppError('Unauthorized', 401));
  if (!user.is_admin && !user.is_superadmin) {
    return next(new AppError('Forbidden: admin access required', 403));
  }
  next();
};

// Check if user is superadmin
const requireSuperAdmin = (req, res, next) => {
  const { user } = req;
  if (!user) return next(new AppError('Unauthorized', 401));
  if (!user.is_superadmin) {
    return next(new AppError('Forbidden: superadmin access required', 403));
  }
  next();
};

// Check if user can access subordinate's data (via hierarchy)
const checkHierarchy = async (req, res, next) => {
  const { user } = req;
  const targetUserId = req.params.id || req.params.userId;

  if (!user) return next(new AppError('Unauthorized', 401));
  if (!targetUserId) return next();

  // Can always access own data
  if (user.id === targetUserId) return next();

  // Superadmin/admin can access anyone
  if (user.is_superadmin || user.is_admin) return next();

  // Check management hierarchy
  const relation = await db('management_hierarchy')
    .where({ manager_id: user.id, subordinate_id: targetUserId })
    .first();

  if (!relation) {
    return next(new AppError('Forbidden: not your subordinate', 403));
  }

  next();
};

module.exports = { checkPermission, requireLevel, requireAdmin, requireSuperAdmin, checkHierarchy };
```

**Step 2: Commit**

```bash
git add server/src/middleware/rbac.js
git commit -m "feat: add RBAC middleware (permissions, levels, admin, hierarchy checks)"
```

---

## Task 13: Users Module

**Files:**
- Create: `server/src/modules/users/users.service.js`
- Create: `server/src/modules/users/users.controller.js`
- Create: `server/src/modules/users/users.routes.js`
- Create: `server/src/modules/users/users.validation.js`

**Step 1: Create users validation**

```javascript
// server/src/modules/users/users.validation.js
const Joi = require('joi');

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  phone_whatsapp: Joi.string().min(10).max(50),
  avatar_url: Joi.string().uri().allow(null),
}).min(1);

const assignRoleSchema = Joi.object({
  role_id: Joi.string().uuid().required(),
});

const hierarchySchema = Joi.object({
  manager_id: Joi.string().uuid().required(),
  subordinate_id: Joi.string().uuid().required(),
});

module.exports = { updateUserSchema, assignRoleSchema, hierarchySchema };
```

**Step 2: Create users service**

```javascript
// server/src/modules/users/users.service.js
const db = require('../../config/database');
const { AppError } = require('../../utils/AppError');

const listUsers = async (organizationId, { page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const [{ count }] = await db('users')
    .where({ organization_id: organizationId, is_active: true })
    .count('id as count');

  const users = await db('users')
    .where({ organization_id: organizationId, is_active: true })
    .select('id', 'name', 'email', 'avatar_url', 'phone_whatsapp', 'is_admin', 'is_superadmin', 'created_at')
    .orderBy('name')
    .limit(limit)
    .offset(offset);

  // Attach roles to each user
  const userIds = users.map((u) => u.id);
  const userRoles = await db('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .whereIn('user_roles.user_id', userIds)
    .select('user_roles.user_id', 'roles.id', 'roles.name', 'roles.display_name', 'roles.level');

  const rolesMap = {};
  userRoles.forEach((ur) => {
    if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
    rolesMap[ur.user_id].push({ id: ur.id, name: ur.name, display_name: ur.display_name, level: ur.level });
  });

  users.forEach((u) => {
    u.roles = rolesMap[u.id] || [];
  });

  return { users, total: Number(count), page, limit };
};

const getUserById = async (id) => {
  const user = await db('users')
    .where({ id })
    .select('id', 'name', 'email', 'avatar_url', 'phone_whatsapp', 'is_admin', 'is_superadmin', 'is_active', 'created_at')
    .first();

  if (!user) throw new AppError('User not found', 404);

  const roles = await db('roles')
    .join('user_roles', 'roles.id', 'user_roles.role_id')
    .where('user_roles.user_id', id)
    .select('roles.*');

  user.roles = roles;
  return user;
};

const updateUser = async (id, data) => {
  const [user] = await db('users')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('id', 'name', 'email', 'avatar_url', 'phone_whatsapp');

  if (!user) throw new AppError('User not found', 404);
  return user;
};

const deactivateUser = async (id) => {
  const [user] = await db('users')
    .where({ id })
    .update({ is_active: false, updated_at: db.fn.now() })
    .returning('id');

  if (!user) throw new AppError('User not found', 404);
  return user;
};

const toggleAdmin = async (id) => {
  const user = await db('users').where({ id }).first();
  if (!user) throw new AppError('User not found', 404);

  const [updated] = await db('users')
    .where({ id })
    .update({ is_admin: !user.is_admin, updated_at: db.fn.now() })
    .returning('id', 'is_admin');

  return updated;
};

const assignRole = async (userId, roleId) => {
  const existing = await db('user_roles').where({ user_id: userId, role_id: roleId }).first();
  if (existing) throw new AppError('Role already assigned', 409);

  await db('user_roles').insert({ user_id: userId, role_id: roleId });
};

const removeRole = async (userId, roleId) => {
  const deleted = await db('user_roles').where({ user_id: userId, role_id: roleId }).del();
  if (!deleted) throw new AppError('Role assignment not found', 404);
};

const getSubordinates = async (managerId) => {
  const subordinates = await db('users')
    .join('management_hierarchy', 'users.id', 'management_hierarchy.subordinate_id')
    .where('management_hierarchy.manager_id', managerId)
    .where('users.is_active', true)
    .select('users.id', 'users.name', 'users.email', 'users.avatar_url');

  return subordinates;
};

const setHierarchy = async (managerId, subordinateId) => {
  if (managerId === subordinateId) throw new AppError('Cannot be your own manager', 400);

  const existing = await db('management_hierarchy')
    .where({ manager_id: managerId, subordinate_id: subordinateId })
    .first();
  if (existing) throw new AppError('Hierarchy relation already exists', 409);

  await db('management_hierarchy').insert({ manager_id: managerId, subordinate_id: subordinateId });
};

const removeHierarchy = async (managerId, subordinateId) => {
  const deleted = await db('management_hierarchy')
    .where({ manager_id: managerId, subordinate_id: subordinateId })
    .del();
  if (!deleted) throw new AppError('Hierarchy relation not found', 404);
};

module.exports = {
  listUsers, getUserById, updateUser, deactivateUser, toggleAdmin,
  assignRole, removeRole, getSubordinates, setHierarchy, removeHierarchy,
};
```

**Step 3: Create users controller**

```javascript
// server/src/modules/users/users.controller.js
const usersService = require('./users.service');

const listUsers = async (req, res) => {
  const result = await usersService.listUsers(req.user.organization_id, req.query);
  res.json({ success: true, data: result });
};

const getUser = async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  res.json({ success: true, data: user });
};

const updateUser = async (req, res) => {
  const user = await usersService.updateUser(req.params.id, req.body);
  res.json({ success: true, data: user });
};

const deactivateUser = async (req, res) => {
  await usersService.deactivateUser(req.params.id);
  res.json({ success: true, message: 'User deactivated' });
};

const toggleAdmin = async (req, res) => {
  const user = await usersService.toggleAdmin(req.params.id);
  res.json({ success: true, data: user });
};

const assignRole = async (req, res) => {
  await usersService.assignRole(req.params.id, req.body.role_id);
  res.status(201).json({ success: true, message: 'Role assigned' });
};

const removeRole = async (req, res) => {
  await usersService.removeRole(req.params.id, req.params.roleId);
  res.json({ success: true, message: 'Role removed' });
};

const getSubordinates = async (req, res) => {
  const subordinates = await usersService.getSubordinates(req.params.id);
  res.json({ success: true, data: subordinates });
};

const setHierarchy = async (req, res) => {
  await usersService.setHierarchy(req.body.manager_id, req.body.subordinate_id);
  res.status(201).json({ success: true, message: 'Hierarchy set' });
};

const removeHierarchy = async (req, res) => {
  await usersService.removeHierarchy(req.params.managerId, req.params.subordinateId);
  res.json({ success: true, message: 'Hierarchy removed' });
};

module.exports = {
  listUsers, getUser, updateUser, deactivateUser, toggleAdmin,
  assignRole, removeRole, getSubordinates, setHierarchy, removeHierarchy,
};
```

**Step 4: Create users routes**

```javascript
// server/src/modules/users/users.routes.js
const router = require('express').Router();
const { authenticate } = require('../../middleware/authenticate');
const { requireAdmin, requireSuperAdmin, checkHierarchy } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./users.controller');
const { updateUserSchema, assignRoleSchema, hierarchySchema } = require('./users.validation');

router.get('/', authenticate, asyncHandler(controller.listUsers));
router.get('/:id', authenticate, asyncHandler(controller.getUser));
router.put('/:id', authenticate, validate(updateUserSchema), asyncHandler(controller.updateUser));
router.patch('/:id/deactivate', authenticate, requireAdmin, asyncHandler(controller.deactivateUser));
router.patch('/:id/admin', authenticate, requireSuperAdmin, asyncHandler(controller.toggleAdmin));
router.get('/:id/subordinates', authenticate, checkHierarchy, asyncHandler(controller.getSubordinates));

// Role assignment
router.post('/:id/roles', authenticate, requireAdmin, validate(assignRoleSchema), asyncHandler(controller.assignRole));
router.delete('/:id/roles/:roleId', authenticate, requireAdmin, asyncHandler(controller.removeRole));

// Hierarchy
router.post('/hierarchy', authenticate, requireAdmin, validate(hierarchySchema), asyncHandler(controller.setHierarchy));
router.delete('/hierarchy/:managerId/:subordinateId', authenticate, requireAdmin, asyncHandler(controller.removeHierarchy));

module.exports = router;
```

**Step 5: Register users routes in app.js**

Add to `server/app.js`:
```javascript
const usersRoutes = require('./src/modules/users/users.routes');
app.use('/api/users', usersRoutes);
```

**Step 6: Commit**

```bash
git add server/src/modules/users/ server/app.js
git commit -m "feat: add users module (CRUD, role assignment, hierarchy, admin toggle)"
```

---

## Task 14: Roles Module

**Files:**
- Create: `server/src/modules/roles/roles.service.js`
- Create: `server/src/modules/roles/roles.controller.js`
- Create: `server/src/modules/roles/roles.routes.js`
- Create: `server/src/modules/roles/roles.validation.js`

**Step 1: Create roles validation**

```javascript
// server/src/modules/roles/roles.validation.js
const Joi = require('joi');

const createRoleSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  display_name: Joi.string().min(2).max(150).required(),
  level: Joi.number().integer().min(0).max(3).required(),
  permissions: Joi.array().items(Joi.string()).default([]),
  pipeline_config: Joi.object().default({}),
});

const updateRoleSchema = Joi.object({
  display_name: Joi.string().min(2).max(150),
  level: Joi.number().integer().min(0).max(3),
  permissions: Joi.array().items(Joi.string()),
  pipeline_config: Joi.object(),
}).min(1);

module.exports = { createRoleSchema, updateRoleSchema };
```

**Step 2: Create roles service**

```javascript
// server/src/modules/roles/roles.service.js
const db = require('../../config/database');
const { AppError } = require('../../utils/AppError');

const listRoles = async (organizationId) => {
  return db('roles')
    .where({ organization_id: organizationId })
    .orderBy('level')
    .orderBy('name');
};

const createRole = async (organizationId, data) => {
  const [role] = await db('roles')
    .insert({
      organization_id: organizationId,
      name: data.name,
      display_name: data.display_name,
      level: data.level,
      permissions: JSON.stringify(data.permissions),
      pipeline_config: JSON.stringify(data.pipeline_config),
      is_system: false,
    })
    .returning('*');

  return role;
};

const updateRole = async (id, data) => {
  const role = await db('roles').where({ id }).first();
  if (!role) throw new AppError('Role not found', 404);

  const updateData = {};
  if (data.display_name) updateData.display_name = data.display_name;
  if (data.level !== undefined) updateData.level = data.level;
  if (data.permissions) updateData.permissions = JSON.stringify(data.permissions);
  if (data.pipeline_config) updateData.pipeline_config = JSON.stringify(data.pipeline_config);

  const [updated] = await db('roles').where({ id }).update(updateData).returning('*');
  return updated;
};

const deleteRole = async (id) => {
  const role = await db('roles').where({ id }).first();
  if (!role) throw new AppError('Role not found', 404);
  if (role.is_system) throw new AppError('Cannot delete system role', 400);

  await db('roles').where({ id }).del();
};

module.exports = { listRoles, createRole, updateRole, deleteRole };
```

**Step 3: Create roles controller**

```javascript
// server/src/modules/roles/roles.controller.js
const rolesService = require('./roles.service');

const listRoles = async (req, res) => {
  const roles = await rolesService.listRoles(req.user.organization_id);
  res.json({ success: true, data: roles });
};

const createRole = async (req, res) => {
  const role = await rolesService.createRole(req.user.organization_id, req.body);
  res.status(201).json({ success: true, data: role });
};

const updateRole = async (req, res) => {
  const role = await rolesService.updateRole(req.params.id, req.body);
  res.json({ success: true, data: role });
};

const deleteRole = async (req, res) => {
  await rolesService.deleteRole(req.params.id);
  res.json({ success: true, message: 'Role deleted' });
};

module.exports = { listRoles, createRole, updateRole, deleteRole };
```

**Step 4: Create roles routes**

```javascript
// server/src/modules/roles/roles.routes.js
const router = require('express').Router();
const { authenticate } = require('../../middleware/authenticate');
const { requireAdmin } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./roles.controller');
const { createRoleSchema, updateRoleSchema } = require('./roles.validation');

router.get('/', authenticate, asyncHandler(controller.listRoles));
router.post('/', authenticate, requireAdmin, validate(createRoleSchema), asyncHandler(controller.createRole));
router.put('/:id', authenticate, requireAdmin, validate(updateRoleSchema), asyncHandler(controller.updateRole));
router.delete('/:id', authenticate, requireAdmin, asyncHandler(controller.deleteRole));

module.exports = router;
```

**Step 5: Register roles routes in app.js**

Add to `server/app.js`:
```javascript
const rolesRoutes = require('./src/modules/roles/roles.routes');
app.use('/api/roles', rolesRoutes);
```

**Step 6: Commit**

```bash
git add server/src/modules/roles/ server/app.js
git commit -m "feat: add roles module (CRUD, system role protection)"
```

---

## Task 15: Integration Test — Auth Flow

**Files:**
- Create: `server/src/tests/auth.test.js`
- Create: `server/jest.config.js`

**Step 1: Create jest config**

```javascript
// server/jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterSetup: [],
};
```

**Step 2: Write auth integration test**

```javascript
// server/src/tests/auth.test.js
const request = require('supertest');
const app = require('../../app');
const db = require('../config/database');

beforeAll(async () => {
  await db.migrate.latest();
  await db.seed.run();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tasksludus.com', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@tasksludus.com');
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tasksludus.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'test1234' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should refresh tokens', async () => {
    // Login first
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tasksludus.com', password: 'admin123' });

    const { refreshToken } = loginRes.body.data;

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });
});

describe('Protected routes', () => {
  let accessToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tasksludus.com', password: 'admin123' });
    accessToken = res.body.data.accessToken;
  });

  it('should access /api/users with valid token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject /api/users without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('should access /api/roles with valid token', async () => {
    const res = await request(app)
      .get('/api/roles')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Run tests**

Run: `cd server && NODE_ENV=test npm test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add server/src/tests/ server/jest.config.js
git commit -m "test: add auth integration tests (login, refresh, protected routes)"
```

---

## Summary

| Task | Description | Files | Commit |
|------|-------------|-------|--------|
| 1 | Docker Compose | docker-compose.yml, .env.example, .gitignore | `feat: add Docker Compose` |
| 2 | Server Scaffold | server/ (app.js, server.js, configs, middleware, utils) | `feat: scaffold Express.js server` |
| 3 | Client Scaffold | client/ (Vite, React, Tailwind, Shadcn/ui, Axios) | `feat: scaffold React client` |
| 4 | Root Monorepo | package.json (root) | `feat: add root monorepo config` |
| 5 | Lint & Format | ESLint, Prettier | `feat: add ESLint + Prettier` |
| 6 | Migration: Core | organizations, users, roles, hierarchy | `feat: add core migrations` |
| 7 | Migration: Tasks | tasks, templates, collaborators, dependencies | `feat: add task migrations` |
| 8 | Migration: Support | time_entries, campaigns, performance, attachments, comments, notifications, feed, projects | `feat: add support migrations` |
| 9 | Seeds | org, 11 roles (including client), superadmin | `feat: add seeds` |
| 10 | Auth Strategies | Passport JWT + Local + Google, authenticate middleware | `feat: add Passport strategies` |
| 11 | Auth Module | service, controller, routes, validation | `feat: add auth module` |
| 12 | RBAC Middleware | permissions, levels, admin, hierarchy checks | `feat: add RBAC middleware` |
| 13 | Users Module | service, controller, routes, validation | `feat: add users module` |
| 14 | Roles Module | service, controller, routes, validation | `feat: add roles module` |
| 15 | Integration Tests | auth flow tests (login, refresh, protected routes) | `test: add auth integration tests` |
