# TasksLudus — Plano de Execução

**Data:** 2026-02-28
**Status:** Aprovado
**Versão:** 1.0
**Base:** Design Document v1.0 (2026-02-26) + Client Role Addition

---

## Visão Geral

Execução do MVP (Onda 1) do TasksLudus usando abordagem **Fundação + Fatias Verticais**:
- Fase 0: Infraestrutura (projeto rodando local)
- Fase 1: Fundação (DB + Auth + RBAC)
- Fase 2: Core em fatias verticais (Tasks + Time Tracking + Campanhas)
- Fase 3: Experiência (Dashboards + Performance + Calendário + Feed)
- Fase 4: Client Portal (role client + dashboard simplificado)
- Fase 5: Polish & Deploy

### Decisões adicionais ao design original
- **Axios** no frontend para chamadas HTTP
- **Role client** (level 0): visualização transparente simplificada de projetos
- Client autenticado via **convite WhatsApp + Google OAuth**
- Client pode **visualizar e comentar**, mas não aprovar/reprovar
- Métricas do client focadas em **progresso + prazos + entregas**
- Client vinculado a **projetos** (que agrupam tarefas-mãe)

---

## Fase 0 — Infraestrutura & Scaffold

**Objetivo:** Projeto rodando localmente com estrutura pronta para desenvolvimento.

| Step | O que | Detalhe |
|------|-------|---------|
| 0.1 | Docker Compose | Postgres 16 + Redis 7 (dev local) |
| 0.2 | Server scaffold | Express.js, estrutura modular (`server/src/modules/`), configs (env, db, redis) |
| 0.3 | Knex setup | knexfile.js, connection pool, migrations folder |
| 0.4 | Client scaffold | Vite + React, Tailwind, Shadcn/ui, React Router, estrutura de pastas |
| 0.5 | Monorepo config | Scripts no root (`npm run dev`, `npm run migrate`), .gitignore, .env.example |
| 0.6 | Lint & format | ESLint + Prettier (configs básicas) |

**Entregável:** `npm run dev` sobe server + client + Postgres + Redis.

---

## Fase 1 — Fundação (Backend Only)

**Objetivo:** Auth funcionando, RBAC ativo, schema do banco completo.

| Step | O que | Detalhe |
|------|-------|---------|
| 1.1 | Migration: tabelas core | `organizations`, `users`, `roles`, `user_roles`, `management_hierarchy` |
| 1.2 | Migration: tabelas de tarefas | `tasks`, `task_templates`, `task_template_stages`, `task_collaborators`, `task_dependencies` |
| 1.3 | Migration: tabelas suporte | `time_entries`, `task_status_transitions`, `campaigns`, `campaign_tasks`, `performance_scores`, `attachments`, `comments`, `notifications`, `activity_feed` |
| 1.4 | Migration: tabelas client | `projects`, `project_tasks` |
| 1.5 | Seeds | Organização padrão, roles do sistema (12 roles incluindo client), superadmin inicial |
| 1.6 | Auth module | Register (via convite), login email/senha, Google OAuth, JWT (access + refresh tokens), logout, forgot/reset password |
| 1.7 | RBAC middleware | Extrai JWT, verifica is_superadmin, is_admin, role permissions, hierarchy, client filtering |
| 1.8 | Users/Roles module | CRUD de users, CRUD de roles, atribuição de roles, hierarquia de gestão |
| 1.9 | Error handling | Middleware global de erros, respostas padronizadas, logging com Winston |
| 1.10 | Validação | Joi schemas para todos os endpoints das fases 1.6-1.8 |

**Entregável:** API com auth + RBAC funcionando. Pode logar, criar users, atribuir roles, hierarchy funciona.

---

## Fase 2 — Core em Fatias Verticais (Backend + Frontend)

### 2A — Layout & Navegação (Frontend)

| Step | O que | Detalhe |
|------|-------|---------|
| 2A.1 | Auth pages | Login, forgot password, reset password (com Google OAuth) |
| 2A.2 | Layout autenticado | Sidebar colapsável, Topbar (busca, notificações, avatar), outlet para conteúdo |
| 2A.3 | Roteamento | React Router v6 com guards de auth e role-based redirects |
| 2A.4 | Auth store & service | Zustand store (user, token), Axios interceptors (JWT auto-refresh), API service layer |

### 2B — Tasks

| Step | O que | Detalhe |
|------|-------|---------|
| 2B.1 | Tasks API | CRUD completo, filtros (status, assigned, role, priority), subtarefas, colaboradores, dependências |
| 2B.2 | Tasks page — Kanban | Kanban board com dnd-kit, colunas por status, drag & drop muda status |
| 2B.3 | Tasks page — Lista | Tabela com sort/filter, batch actions |
| 2B.4 | Tasks page — Thumbnails | Cards com preview visual (para criativos) |
| 2B.5 | Task Detail | Editor TipTap (briefing), checklist, subtarefas, anexos, comentários, status flow |
| 2B.6 | Templates API + UI | CRUD de templates, stages por role, instanciar template → tarefas |
| 2B.7 | Uploads | Upload S3 (multer + aws-sdk) + campo link externo (Google Drive), preview |

### 2C — Time Tracking

| Step | O que | Detalhe |
|------|-------|---------|
| 2C.1 | Time tracking API | Auto-start/stop por status, pause/resume manual, ajuste por gestor |
| 2C.2 | Timer widget | Play/pause no task detail, tempo acumulado, histórico de entries |
| 2C.3 | Status transitions | Log automático de transições, dispara time tracking |

### 2D — Campanhas

| Step | O que | Detalhe |
|------|-------|---------|
| 2D.1 | Campaigns API | CRUD, status flow, vínculo com tarefas |
| 2D.2 | Campaigns UI | Lista de campanhas, criar/editar, vincular tarefas existentes |

**Entregável:** Sistema funcional com tasks (3 views), templates, time tracking, campanhas. Frontend com layout completo e auth.

---

## Fase 3 — Experiência

### 3A — Performance & Scoring

| Step | O que | Detalhe |
|------|-------|---------|
| 3A.1 | Performance worker | BullMQ worker: calcula scores (tempo + volume + qualidade + composto) periodicamente |
| 3A.2 | Performance API | Endpoints: dashboard, user, team, leaderboard, benchmarks |
| 3A.3 | Performance UI | Gráficos (Recharts), ranking, comparação entre períodos, benchmarks por role/size/difficulty |

### 3B — Dashboards por Role

| Step | O que | Detalhe |
|------|-------|---------|
| 3B.1 | Dashboard produtor | Minhas tarefas, timer ativo, score pessoal, próximas entregas |
| 3B.2 | Dashboard gestor | Tarefas da equipe, pendências de review, performance do time, alertas de atraso |
| 3B.3 | Dashboard diretor | Visão macro de todas as equipes, KPIs, tendências, gargalos |
| 3B.4 | Dashboard admin | Visão total: users, roles, organização, métricas globais |

### 3C — Calendário

| Step | O que | Detalhe |
|------|-------|---------|
| 3C.1 | Calendar API | Endpoint que retorna tarefas com due_date em formato calendar-friendly |
| 3C.2 | Calendar UI | FullCalendar (mensal/semanal), click abre task detail, filtros por user/role |

### 3D — Feed & Notificações

| Step | O que | Detalhe |
|------|-------|---------|
| 3D.1 | Activity feed | API + UI: feed cronológico de ações (criou tarefa, completou, atribuiu) |
| 3D.2 | Notifications API | CRUD notificações, mark as read, Socket.io real-time push |
| 3D.3 | Notifications UI | Dropdown na topbar, badge de contagem, central de notificações |
| 3D.4 | Notification worker | BullMQ worker: gera notificações para eventos (task assigned, review needed, etc) |

**Entregável:** Dashboards funcionais por role, calendário integrado, feed de atividades, notificações real-time.

---

## Fase 4 — Client Portal

### Modelo de Dados

```sql
-- Projetos (agrupa tarefas-mãe para um client)
projects
  id (UUID, PK)
  organization_id (FK -> organizations)
  client_id (FK -> users)           -- user com role 'client'
  name (VARCHAR)
  description (TEXT)
  status (VARCHAR)                   -- active, paused, completed
  created_by (FK -> users)           -- gestor que criou
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- Vínculo projeto <-> tarefas
project_tasks
  project_id (FK -> projects)
  task_id (FK -> tasks)
  PRIMARY KEY (project_id, task_id)
```

### Role Client

| Role | Level | Descrição |
|------|-------|-----------|
| client | 0 | Visualiza projetos vinculados, comenta entregas, vê métricas de progresso |

### Permissões do Client

**Vê:**
- Projetos ativos vinculados a ele
- Progresso geral (% conclusão)
- Etapas macro (filmagem, edição, design) sem detalhe interno
- Prazos e próximas entregas
- Histórico de entregas
- Tarefas no prazo vs atrasadas

**Pode fazer:**
- Comentar em tarefas/entregas
- Ver anexos/entregas finais

**NÃO vê:**
- Time tracking individual
- Performance/scores de produtores
- Subtarefas internas e detalhes operacionais
- Quem especificamente está trabalhando (vê apenas etapa macro)

### Auth do Client
- Convite via WhatsApp (Evolution API)
- Login via Google OAuth

### Steps

| Step | O que | Detalhe |
|------|-------|---------|
| 4.1 | Migration: projects | Tabelas `projects` e `project_tasks` |
| 4.2 | Role client + seed | Role `client` (level 0), permissions limitadas |
| 4.3 | RBAC update | Middleware reconhece role client, filtra dados por `project_tasks` |
| 4.4 | Projects API | CRUD de projetos (gestor cria), vincular tarefas, listar por client |
| 4.5 | Convite WhatsApp | Endpoint que envia convite via Evolution API + link de registro com Google OAuth |
| 4.6 | Dashboard client | Projetos ativos, progresso (% conclusão), prazos, próximas entregas, histórico |
| 4.7 | Client task view | Tarefas macro (sem subtarefas internas), status, comentários |
| 4.8 | Client metrics | Tarefas no prazo vs atrasadas, entregas realizadas, timeline do projeto |

**Entregável:** Clients podem ser convidados, logar, ver seus projetos e interagir com entregas.

---

## Fase 5 — Polish & Deploy

| Step | O que | Detalhe |
|------|-------|---------|
| 5.1 | Testes | Unitários (services), integração (API endpoints), E2E (auth, tasks, time tracking) |
| 5.2 | Segurança | Helmet, CORS, rate limiting, sanitização de inputs, audit SQL injection/XSS |
| 5.3 | Otimizações | Queries N+1, indexes Postgres, cache Redis (sessions, queries frequentes), paginação |
| 5.4 | WhatsApp setup | Evolution API: criar instância, conectar, enviar notificações + convites client |
| 5.5 | CI/CD | GitHub Actions: lint, test, build, deploy |
| 5.6 | Deploy | Postgres (RDS/Supabase), Redis (ElastiCache), API+Workers (Railway/Render), Frontend (Vercel) |
| 5.7 | Monitoramento | Sentry (errors), logging produção, health checks |

**Entregável:** Sistema em produção, testado, seguro, monitorado.

---

## Resumo

| Fase | Nome | Steps | Foco |
|------|------|-------|------|
| 0 | Infraestrutura & Scaffold | 6 | Projeto rodando local |
| 1 | Fundação | 10 | DB + Auth + RBAC |
| 2 | Core Vertical | 15 | Tasks + Time Tracking + Campanhas |
| 3 | Experiência | 11 | Dashboards + Performance + Calendário + Feed |
| 4 | Client Portal | 8 | Role client + dashboard simplificado |
| 5 | Polish & Deploy | 7 | Testes + segurança + deploy |
| **Total** | | **57 steps** | |
