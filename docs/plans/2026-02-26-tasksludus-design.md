# TasksLudus — Design Document

**Data:** 2026-02-26
**Status:** Aprovado
**Versao:** 1.0

---

## 1. Visao Geral

TasksLudus e um sistema de gerenciamento de equipes de producao de alta produtividade. Focado em equipes de marketing digital, producao de video, design e desenvolvimento web.

### Objetivo
Gerenciar tarefas, medir performance e rastrear campanhas para equipes de producao criativa, com tracking de tempo hibrido e dashboards por role.

### Escopo do MVP (Onda 1)
Sistema completo **sem modulo de vendas**:
- Autenticacao (email/senha + Google OAuth)
- RBAC dinamico com hierarquia
- Tarefas simples e compostas (com subtarefas e templates)
- Time tracking hibrido (automatico por status + ajuste manual)
- Campanhas de trafego (registro manual + vinculo com tarefas)
- Performance scoring (tempo + volume + qualidade + score composto)
- Dashboards por role
- Calendario
- Feed de atividades
- Notificacoes in-app
- Upload S3 + links Google Drive
- Preparado para multi-tenant (organization_id)

### Ondas Futuras
- **Onda 2:** Modulo de vendas (SDR, closer, gestor de vendas, diretor de vendas)
- **Onda 3:** Integracoes (Meta Ads API, Google Ads, Hotmart, Instagram Graph, Evolution API WhatsApp, links rastreaveis)

---

## 2. Arquitetura

### Abordagem: Monolito Modular + Workers

```
Frontend (React SPA)
       |
       | REST API (JSON) + WebSocket (notificacoes)
       |
API Server (Express.js - Monolito Modular)
       |
  +---------+----------+---------+
  |         |          |         |
Postgres   Redis      S3    Evolution API
(main DB)  (cache+    (uploads) (WhatsApp)
           filas)
              |
         Workers (BullMQ)
         - Upload processing
         - Notificacoes
         - Performance scoring
```

**Por que essa abordagem:**
- Monolito modular: simples de desenvolver, debugar e deployar
- Workers separados: operacoes pesadas nao bloqueiam a API
- Escala: multiplas instancias da API + workers independentes
- Nao e microservicos (complexidade desnecessaria para o escopo)

---

## 3. Modelo de Dados

### 3.1 Core

```sql
-- Organizacao (preparado para multi-tenant)
organizations
  id (UUID, PK)
  name (VARCHAR)
  slug (VARCHAR, unique)
  settings (JSONB)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Usuarios
users
  id (UUID, PK)
  organization_id (FK -> organizations)
  name (VARCHAR)
  email (VARCHAR, unique)
  password_hash (VARCHAR, nullable) -- nullable para Google OAuth
  avatar_url (VARCHAR, nullable)
  google_id (VARCHAR, nullable)
  phone_whatsapp (VARCHAR, NOT NULL) -- numero WhatsApp obrigatorio
  is_active (BOOLEAN, default true)
  is_admin (BOOLEAN, default false) -- atributo admin (qualquer role pode ser admin)
  is_superadmin (BOOLEAN, default false)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Roles (dinamicas, criadas pelo admin)
roles
  id (UUID, PK)
  organization_id (FK -> organizations)
  name (VARCHAR)               -- ex: "filmmaker", "gestor_social_media"
  display_name (VARCHAR)       -- ex: "Filmmaker", "Gestor de Social Media"
  level (INT)                  -- 1=produtor, 2=gestor, 3=diretor
  permissions (JSONB)          -- lista de permissoes granulares
  pipeline_config (JSONB)      -- etapas do pipeline para esta role
  is_system (BOOLEAN)          -- true = role padrao, nao deletavel
  created_at (TIMESTAMP)

-- Atribuicao de roles a usuarios (N:N)
user_roles
  user_id (FK -> users)
  role_id (FK -> roles)
  PRIMARY KEY (user_id, role_id)

-- Hierarquia de gestao
management_hierarchy
  manager_id (FK -> users)
  subordinate_id (FK -> users)
  PRIMARY KEY (manager_id, subordinate_id)
```

**Nota sobre admin:** Admin nao e uma role — e um atributo booleano no usuario. Qualquer role (filmmaker, gestor, etc) pode ter is_admin=true, ganhando permissoes administrativas (desativar usuarios, arquivar tarefas, visao total).

### 3.2 Tarefas

```sql
-- Templates de tarefa (modelos reutilizaveis)
task_templates
  id (UUID, PK)
  organization_id (FK -> organizations)
  name (VARCHAR)               -- ex: "Producao de Video Completo"
  description (TEXT)
  created_by (FK -> users)
  is_active (BOOLEAN)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Etapas do template (definidas por role, nao por pessoa)
task_template_stages
  id (UUID, PK)
  template_id (FK -> task_templates)
  role_id (FK -> roles)        -- qual role executa esta etapa
  name (VARCHAR)               -- ex: "Filmagem", "Edicao", "Thumb"
  order_index (INT)            -- sequencia
  estimated_duration_min (INT) -- estimativa em minutos
  checklist (JSONB)            -- itens de checklist padrao

-- Tarefas (simples ou mae)
tasks
  id (UUID, PK)
  organization_id (FK -> organizations)
  parent_task_id (FK -> tasks, nullable)     -- NULL = tarefa raiz
  template_id (FK -> task_templates, nullable)
  title (VARCHAR)
  description (TEXT)            -- conteudo TipTap (JSON/HTML)
  status (VARCHAR)              -- backlog, in_progress, review, approved, done
  priority (VARCHAR)            -- low, medium, high, urgent
  size (VARCHAR)                -- small, medium, large
  difficulty (VARCHAR)          -- easy, medium, hard
  assigned_to (FK -> users, nullable)
  assigned_role_id (FK -> roles, nullable)
  created_by (FK -> users)
  due_date (DATE, nullable)
  started_at (TIMESTAMP, nullable)
  completed_at (TIMESTAMP, nullable)
  order_index (INT)             -- posicao no kanban/lista
  briefing (JSONB)              -- campos estruturados por tipo
  checklist (JSONB)             -- [{text, checked}]
  is_archived (BOOLEAN, default false)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Colaboradores de uma tarefa
task_collaborators
  task_id (FK -> tasks)
  user_id (FK -> users)
  role_id (FK -> roles)        -- em qual capacidade colabora
  PRIMARY KEY (task_id, user_id)

-- Dependencias entre tarefas
task_dependencies
  task_id (FK -> tasks)
  depends_on_task_id (FK -> tasks)
  PRIMARY KEY (task_id, depends_on_task_id)
```

### 3.3 Time Tracking

```sql
-- Sessoes de tempo (timer play/pause)
time_entries
  id (UUID, PK)
  task_id (FK -> tasks)
  user_id (FK -> users)
  started_at (TIMESTAMP)
  ended_at (TIMESTAMP, nullable)   -- NULL = timer rodando
  duration_seconds (INT)           -- calculado no fim
  is_manual_adjustment (BOOLEAN)   -- ajustado pelo gestor?
  adjusted_by (FK -> users, nullable)
  notes (TEXT, nullable)
  created_at (TIMESTAMP)

-- Transicoes de status (tracking automatico)
task_status_transitions
  id (UUID, PK)
  task_id (FK -> tasks)
  from_status (VARCHAR)
  to_status (VARCHAR)
  changed_by (FK -> users)
  changed_at (TIMESTAMP)
```

### 3.4 Campanhas

```sql
campaigns
  id (UUID, PK)
  organization_id (FK -> organizations)
  name (VARCHAR)
  platform (VARCHAR)           -- meta, google, tiktok, etc
  budget (DECIMAL)
  status (VARCHAR)             -- draft, active, paused, completed
  start_date (DATE)
  end_date (DATE, nullable)
  created_by (FK -> users)     -- gestor de trafego
  notes (TEXT, nullable)
  metadata (JSONB)             -- preparado para metricas futuras da API
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Vinculo campanha <-> tarefa
campaign_tasks
  campaign_id (FK -> campaigns)
  task_id (FK -> tasks)
  PRIMARY KEY (campaign_id, task_id)
```

### 3.5 Performance

```sql
performance_scores
  id (UUID, PK)
  user_id (FK -> users)
  period_start (DATE)
  period_end (DATE)
  tasks_completed (INT)
  tasks_on_time (INT)
  tasks_rejected (INT)
  avg_completion_time_sec (INT)
  quality_score (DECIMAL)      -- baseado em reprovacoes
  volume_score (DECIMAL)       -- baseado em quantidade
  time_score (DECIMAL)         -- baseado em eficiencia
  overall_score (DECIMAL)      -- score composto
  created_at (TIMESTAMP)
```

### 3.6 Suporte

```sql
-- Uploads/Attachments
attachments
  id (UUID, PK)
  task_id (FK -> tasks)
  uploaded_by (FK -> users)
  file_name (VARCHAR)
  file_type (VARCHAR)          -- image, video, document
  storage_type (VARCHAR)       -- s3, external_link
  url (VARCHAR)                -- S3 URL ou link externo (Drive)
  thumbnail_url (VARCHAR, nullable)
  file_size_bytes (BIGINT, nullable)
  version (INT, default 1)
  created_at (TIMESTAMP)

-- Comentarios
comments
  id (UUID, PK)
  task_id (FK -> tasks)
  user_id (FK -> users)
  content (TEXT)               -- TipTap rich text
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Notificacoes
notifications
  id (UUID, PK)
  user_id (FK -> users)
  type (VARCHAR)               -- task_assigned, task_completed, review_needed
  title (VARCHAR)
  message (TEXT)
  data (JSONB)                 -- metadados (task_id, etc)
  read_at (TIMESTAMP, nullable)
  created_at (TIMESTAMP)

-- Feed de atividades
activity_feed
  id (UUID, PK)
  organization_id (FK -> organizations)
  actor_id (FK -> users)
  action (VARCHAR)             -- created_task, completed_task, assigned_task
  target_type (VARCHAR)        -- task, campaign, user
  target_id (UUID)
  metadata (JSONB)
  created_at (TIMESTAMP)
```

---

## 4. Fluxos Principais

### 4.1 Criacao de tarefa simples
1. Gestor cria tarefa, atribui a produtor (por role ou diretamente)
2. Produtor recebe notificacao
3. Status: backlog -> in_progress (timer automatico inicia)
4. Produtor entrega (upload/link), status: review
5. Gestor aprova -> status: done / reprova -> status: in_progress (version++)

### 4.2 Criacao de tarefa composta (via template)
1. Gestor seleciona template (ex: "Producao de Video Completo")
2. Sistema cria tarefa-mae + subtarefas baseadas nas stages do template
3. Gestor atribui pessoas a cada subtarefa (sistema sugere por role)
4. Subtarefas executam conforme dependencias
5. Subtarefas paralelas rodam simultaneamente
6. Todas subtarefas done -> tarefa-mae automaticamente done

### 4.3 Time tracking hibrido
1. Status muda para in_progress -> time_entry criada (started_at = now)
2. Produtor pode pausar manualmente (ended_at preenchido)
3. Produtor retoma -> nova time_entry criada
4. Status muda para review/done -> time_entry ativa fecha
5. Gestor pode ajustar (is_manual_adjustment = true)
6. Tempo total = soma de todas time_entries da tarefa

### 4.4 Performance scoring (worker)
1. Worker roda periodicamente (diario/semanal)
2. Para cada usuario no periodo: conta tarefas, pontualidade, reprovacoes
3. Calcula tempo medio por tipo/tamanho/dificuldade
4. Gera scores individuais + score composto
5. Dashboard consome scores pre-calculados

### 4.5 Campanhas + vinculo
1. Gestor de trafego cria campanha (nome, plataforma, budget, datas)
2. Vincula tarefas existentes (criativos/videos usados)
3. Dashboard mostra rastreabilidade: campanha -> criativo -> produtor

### 4.6 Permissoes em cascata
1. Middleware extrai JWT, identifica user
2. is_superadmin? -> acesso total
3. is_admin? -> desativar users, arquivar tarefas, visao total
4. Role permissions -> acesso baseado na role
5. management_hierarchy -> acesso aos dados dos subordinados
6. Nega acesso se nenhuma condicao satisfeita

---

## 5. API Endpoints

### Auth
```
POST   /api/auth/register          -- cadastro via convite
POST   /api/auth/login             -- login email/senha -> JWT
POST   /api/auth/google            -- login Google OAuth
POST   /api/auth/refresh           -- refresh token
POST   /api/auth/logout            -- invalidar token
POST   /api/auth/forgot-password   -- email de reset
POST   /api/auth/reset-password    -- resetar senha
```

### Users & Roles
```
GET    /api/users                  -- listar usuarios
GET    /api/users/:id              -- detalhes
PUT    /api/users/:id              -- editar
PATCH  /api/users/:id/deactivate   -- desativar (admin+)
PATCH  /api/users/:id/admin        -- toggle is_admin (superadmin)
GET    /api/users/:id/performance  -- metricas
GET    /api/users/:id/subordinates -- subordinados

GET    /api/roles                  -- listar roles
POST   /api/roles                  -- criar role (admin+)
PUT    /api/roles/:id              -- editar role
DELETE /api/roles/:id              -- deletar role

POST   /api/users/:id/roles       -- atribuir role
DELETE /api/users/:id/roles/:roleId

POST   /api/hierarchy              -- definir gestor<->subordinado
DELETE /api/hierarchy/:managerId/:subordinateId
```

### Tasks
```
GET    /api/tasks                  -- listar (filtros: status, assigned, role, priority)
POST   /api/tasks                  -- criar simples
POST   /api/tasks/from-template    -- criar via template
GET    /api/tasks/:id              -- detalhes
PUT    /api/tasks/:id              -- editar
PATCH  /api/tasks/:id/status       -- mudar status (dispara time tracking)
PATCH  /api/tasks/:id/archive      -- arquivar (admin+)
DELETE /api/tasks/:id              -- deletar (superadmin)

GET    /api/tasks/:id/subtasks
POST   /api/tasks/:id/subtasks

POST   /api/tasks/:id/collaborators
DELETE /api/tasks/:id/collaborators/:userId

POST   /api/tasks/:id/dependencies
DELETE /api/tasks/:id/dependencies/:depId

GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments
PUT    /api/comments/:id
DELETE /api/comments/:id

GET    /api/tasks/:id/attachments
POST   /api/tasks/:id/attachments
DELETE /api/attachments/:id

GET    /api/tasks/:id/time-entries
POST   /api/tasks/:id/time-entries -- ajuste manual (gestor)
PATCH  /api/time-entries/:id
```

### Task Templates
```
GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PUT    /api/templates/:id
DELETE /api/templates/:id

POST   /api/templates/:id/stages
PUT    /api/template-stages/:id
DELETE /api/template-stages/:id
```

### Campaigns
```
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PUT    /api/campaigns/:id
PATCH  /api/campaigns/:id/status
DELETE /api/campaigns/:id

POST   /api/campaigns/:id/tasks
DELETE /api/campaigns/:id/tasks/:taskId
```

### Performance
```
GET    /api/performance/dashboard
GET    /api/performance/users/:id
GET    /api/performance/team/:managerId
GET    /api/performance/leaderboard
GET    /api/performance/benchmarks
```

### Notifications & Feed
```
GET    /api/notifications
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all
GET    /api/feed
```

### Dashboard
```
GET    /api/dashboard/producer
GET    /api/dashboard/manager
GET    /api/dashboard/director
GET    /api/dashboard/admin
```

### Calendar
```
GET    /api/calendar
GET    /api/calendar/user/:id
```

### WhatsApp (Evolution API)
```
POST   /api/whatsapp/instance          -- criar/conectar instancia
GET    /api/whatsapp/instance/status    -- status da conexao
GET    /api/whatsapp/instance/qrcode   -- QR code
POST   /api/whatsapp/send              -- enviar mensagem
POST   /api/whatsapp/send-bulk         -- enviar em massa
POST   /api/whatsapp/webhook           -- receber eventos
```

---

## 6. Telas do Frontend

### Publicas
- `/login` -- email/senha + Google OAuth
- `/forgot-password` -- recuperar senha
- `/reset-password` -- nova senha via token

### Autenticadas (layout: sidebar + topbar)
- `/dashboard` -- dashboard por role (conteudo dinamico)
- `/tasks` -- central de tarefas (kanban | lista | thumbnails)
- `/tasks/:id` -- detalhe da tarefa (editor, timer, subtarefas, anexos, comentarios)
- `/templates` -- templates de tarefa (criar, editar, preview)
- `/calendar` -- calendario mensal/semanal (tarefas com due_date)
- `/campaigns` -- campanhas de trafego (lista, criar, vincular tarefas)
- `/performance` -- metricas e scores (graficos, ranking, benchmarks)
- `/team` -- gestao de equipe (membros, roles, hierarquia)
- `/feed` -- feed de atividades
- `/notifications` -- central de notificacoes
- `/settings` -- perfil, organizacao, roles, WhatsApp, integracoes

### Componentes Compartilhados
- Sidebar (navegacao, colapsavel)
- Topbar (busca global, notificacoes, avatar)
- Kanban Board (drag & drop com dnd-kit)
- Lista View (tabela com sort/filter)
- Thumbnail View (cards com preview visual)
- TipTap Editor (rich text para briefings e comentarios)
- Timer Widget (play/pause/tempo acumulado)
- Upload Zone (drag & drop + campo de link externo)

---

## 7. Tech Stack

### Frontend
- React.js (Vite)
- React Router v6
- TanStack Query (cache/estado servidor)
- Zustand (estado global)
- TipTap (editor rich text)
- dnd-kit (drag & drop)
- FullCalendar (calendario)
- Recharts (graficos)
- Tailwind CSS
- Shadcn/ui (componentes base)
- Socket.io-client (real-time)

### Backend
- Node.js + Express.js (JavaScript, sem TypeScript)
- Knex.js (query builder + migrations)
- Passport.js (auth local + Google OAuth)
- jsonwebtoken (JWT)
- BullMQ (filas de jobs)
- Socket.io (WebSocket)
- multer + aws-sdk (uploads S3)
- node-cron (agendamento)
- helmet + cors + rate-limit (seguranca)
- joi (validacao)
- winston (logging)

### Infraestrutura
- Postgres: AWS RDS ou Supabase
- Redis: AWS ElastiCache ou Redis Cloud
- S3: AWS S3 (lifecycle policies)
- API + Workers: AWS ECS ou Railway/Render
- Frontend: Vercel ou Cloudfront + S3
- CI/CD: GitHub Actions
- Monitoramento: Sentry + CloudWatch

---

## 8. Estrutura de Pastas

```
tasksludus/
  client/                       # Frontend React
    src/
      components/
        ui/                     # Shadcn components
        layout/                 # Sidebar, Topbar, Layout
        tasks/                  # TaskCard, KanbanBoard, TaskDetail
        editor/                 # TipTap wrapper
        common/                 # Timer, UploadZone, etc
      pages/                    # 1 por rota
      hooks/                    # Custom hooks
      services/                 # API calls
      stores/                   # Zustand stores
      utils/
      App.jsx
    public/
    package.json

  server/                       # Backend Express
    src/
      modules/                  # Modulos de dominio
        auth/                   # routes, controller, service, validation
        users/
        roles/
        tasks/
        campaigns/
        performance/
        notifications/
        feed/
        uploads/
        whatsapp/
      middleware/                # Auth, RBAC, error handler
      workers/                  # BullMQ workers
        upload.worker.js
        notification.worker.js
        performance.worker.js
      config/                   # DB, Redis, S3, env
      database/
        migrations/             # Knex migrations
        seeds/                  # Dados iniciais (roles padrao)
      utils/
      app.js
    package.json

  docs/
    plans/
  docker-compose.yml            # Postgres + Redis local
```

---

## 9. Roles Padrao do Sistema

| Role | Level | Descricao |
|---|---|---|
| superadmin | - | Controle total (is_superadmin=true) |
| admin (atributo) | - | Desativar users, arquivar, visao total (is_admin=true) |
| diretor | 3 | Gere todos os gestores, ve performance de todos |
| gestor_social_media | 2 | Gere os 5 tipos de produtor |
| gestor_video | 2 | Qualidade de video, aprova/rejeita entregas de video |
| diretor_trafego | 3 | Supervisiona gestor de trafego |
| gestor_trafego | 2 | Registra campanhas |
| filmmaker | 1 | Filma videos |
| editor_video | 1 | Edita videos |
| designer | 1 | Cria imagens e ativos criativos |
| web_designer | 1 | Cria websites e landing pages |
| social_media_producer | 1 | Cria posts, copies, calendario editorial |

---

## 10. Decisoes de Design

1. **Admin como atributo, nao role:** Qualquer role pode ter is_admin=true. Mais flexivel.
2. **Tarefas compostas via templates:** Templates definem stages por role. Ao instanciar, atribui pessoas.
3. **Time tracking hibrido:** Automatico por status + ajuste manual pelo gestor.
4. **Storage hibrido:** S3 para uploads leves (<100MB) + links Google Drive para pesados.
5. **Pipeline por role:** Cada role tem seu pipeline configuravel (pipeline_config no JSONB).
6. **Performance em todos os niveis:** Nao so produtores — gestores tambem sao avaliados.
7. **Preparado para multi-tenant:** organization_id em todas as tabelas.
8. **Notificacoes in-app no MVP:** WhatsApp (Evolution API) preparado para futuro.
9. **Editor TipTap:** Rich text tipo Notion para briefings e comentarios.
10. **Score composto:** tempo + volume + qualidade com pesos configuraveis.
