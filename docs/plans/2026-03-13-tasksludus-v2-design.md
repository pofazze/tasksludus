# TasksLudus v2 — Design Document

**Data:** 2026-03-13
**Status:** Aprovado
**Versao:** 2.0

---

## 1. Visao Geral

TasksLudus e um app companion do ClickUp para gestao de metas, performance e portal de clientes. O ClickUp continua sendo o sistema de tarefas — o TasksLudus se integra via API para trackear entregas, calcular remuneracao variavel, gerenciar planos de clientes e exibir metricas.

### Objetivo
- Definir e trackear metas de entrega para produtores
- Calcular remuneracao variavel com curva progressiva (J-curve)
- Gerenciar planos de clientes com controle de excedentes
- Portal simplificado para clientes acompanharem producao
- Metricas de engajamento do Instagram por publicacao
- Analytics de tempo de producao por tipo/dificuldade

### Contexto
Time de marketing que produz conteudo para dois clientes principais:
- **Ludus Health** — medicos (Dr Shira, Dra Angela, Dr Mateus, Dr Bruno, Dr Wander Fran)
- **Ludus Experts** — experts (Patrick Suyti, Kelly Lemos, Renata Cruz, Renato Lourenzo)

Fluxo de producao gerenciado no ClickUp:
planejamento > captacao > estruturacao > design/edicao de video > aprovacao > agendamento > publicacao

---

## 2. Arquitetura

### Abordagem: Monolito Modular + Workers + Integracao Hibrida

```
                    +--------------+
                    |  Frontend    |
                    | React + PWA  |
                    +------+-------+
                           | REST API + WebSocket
                    +------v-------+
                    |  API Server  |
                    |  Express.js  |
                    +--+---+---+---+
                       |   |   |
            +----------+   |   +----------+
            |          |   |              |
     +------v--+  +----v---v---+   +------v----+
     | Postgres |  |   Redis   |   |  Workers  |
     | (dados)  |  |(cache+fila)|  |  BullMQ   |
     +----------+  +-----------+   +--+---+----+
                                      |   |
                             +--------+   +--------+
                             |        |            |
                      +------v--+ +---v----+ +-----v-----+
                      | ClickUp | |Instagram| | Futuras   |
                      |  API    | |Graph API| |Integracoes|
                      +---------+ +--------+ +-----------+
```

**Integracao hibrida:**
- Webhooks do ClickUp para eventos criticos (tarefa concluida = entrega)
- Worker de sync diario para reconciliacao completa
- Worker de Instagram para metricas periodicas
- Worker de calculo para remuneracao mensal

**Camada de integracoes extensivel:**
- Cada integracao e um modulo isolado (`server/src/integrations/<nome>/`)
- Interface padrao: `sync()`, `handleWebhook()`, `getConfig()`
- Novas integracoes seguem o mesmo padrao

**Infraestrutura:**
- Postgres e Redis online (sem Docker local)
- Conexao via variaveis de ambiente

---

## 3. Modelo de Dados

### 3.1 Usuarios & Auth

```sql
users
  id (UUID, PK)
  name (VARCHAR)
  email (VARCHAR, unique)
  password_hash (VARCHAR, nullable)     -- nullable para Google OAuth
  avatar_url (VARCHAR, nullable)
  google_id (VARCHAR, nullable)
  role (VARCHAR)                        -- ceo, director, manager, account_manager, producer
  producer_type (VARCHAR, nullable)     -- video_editor, designer, captation, social_media
  is_active (BOOLEAN, default true)
  base_salary (DECIMAL, nullable)       -- so CEO pode definir
  auto_calc_enabled (BOOLEAN, default true)  -- switch liga/desliga
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

invite_tokens
  id (UUID, PK)
  email (VARCHAR)
  role (VARCHAR)
  invited_by (FK -> users)
  token (VARCHAR, unique)
  expires_at (TIMESTAMP)
  used_at (TIMESTAMP, nullable)
  created_at (TIMESTAMP)
```

### 3.2 Clientes & Planos

```sql
clients
  id (UUID, PK)
  user_id (FK -> users, nullable)       -- vincula ao login quando aceitar convite
  name (VARCHAR)
  company (VARCHAR, nullable)           -- "Ludus Health", "Ludus Experts"
  instagram_account (VARCHAR, nullable) -- @conta para puxar metricas
  is_active (BOOLEAN, default true)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

plans
  id (UUID, PK)
  name (VARCHAR)                        -- "Plano Premium", "Plano Basico"
  description (TEXT, nullable)
  is_active (BOOLEAN, default true)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

plan_limits
  id (UUID, PK)
  plan_id (FK -> plans)
  content_type (VARCHAR)                -- reel, feed, carrossel, banner, story, etc.
  monthly_limit (INT)                   -- quantidade inclusa no plano
  overage_price (DECIMAL)              -- preco por unidade excedente
  created_at (TIMESTAMP)

client_plans
  id (UUID, PK)
  client_id (FK -> clients)
  plan_id (FK -> plans)
  starts_at (DATE)
  ends_at (DATE, nullable)
  status (VARCHAR)                      -- active, paused, cancelled
  created_at (TIMESTAMP)
```

### 3.3 Metas & Remuneracao

```sql
goal_templates
  id (UUID, PK)
  role (VARCHAR)                        -- para qual role e o padrao
  producer_type (VARCHAR, nullable)     -- para qual tipo de produtor
  name (VARCHAR)                        -- "Meta Designer Padrao"
  monthly_target (INT)                  -- qtd de entregas para meta base
  multiplier_cap (DECIMAL)             -- 2x, 3x (teto)
  curve_config (JSONB)                 -- configuracao da curva em J
  is_active (BOOLEAN, default true)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

-- curve_config exemplo:
-- {
--   "levels": [
--     { "from": 0,  "to": 5,  "multiplier": 0.3 },
--     { "from": 6,  "to": 10, "multiplier": 0.6 },
--     { "from": 11, "to": 15, "multiplier": 1.0 },
--     { "from": 16, "to": 18, "multiplier": 1.5 },
--     { "from": 19, "to": 20, "multiplier": 2.0 },
--     { "from": 21, "to": null, "multiplier": 3.0 }
--   ]
-- }

user_goals
  id (UUID, PK)
  user_id (FK -> users)
  goal_template_id (FK -> goal_templates, nullable)
  month (DATE)                          -- primeiro dia do mes (2026-03-01)
  monthly_target (INT)                  -- override individual se diferente do template
  multiplier_cap (DECIMAL, nullable)    -- override individual
  curve_config (JSONB, nullable)        -- override individual
  defined_by (FK -> users)             -- quem definiu (CEO/diretor/gerente)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

monthly_calculations
  id (UUID, PK)
  user_id (FK -> users)
  month (DATE)
  total_deliveries (INT)
  base_salary (DECIMAL)
  suggested_bonus (DECIMAL)             -- calculado pelo app
  final_bonus (DECIMAL, nullable)       -- ajustado pelo admin
  multiplier_applied (DECIMAL)
  status (VARCHAR)                      -- draft, calculated, adjusted, closed
  calculated_at (TIMESTAMP, nullable)
  closed_by (FK -> users, nullable)
  closed_at (TIMESTAMP, nullable)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)
```

### 3.4 Entregas & Sync ClickUp

```sql
deliveries
  id (UUID, PK)
  user_id (FK -> users)
  client_id (FK -> clients)
  clickup_task_id (VARCHAR)             -- ID da tarefa no ClickUp
  title (VARCHAR)
  content_type (VARCHAR)                -- reel, feed, carrossel, banner, etc.
  difficulty (VARCHAR, nullable)        -- easy, medium, hard
  urgency (VARCHAR, nullable)           -- normal, urgent
  started_at (TIMESTAMP, nullable)
  completed_at (TIMESTAMP, nullable)
  status (VARCHAR)                      -- in_progress, completed
  month (DATE)                          -- mes de referencia
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

delivery_time_stats
  id (UUID, PK)
  content_type (VARCHAR)
  difficulty (VARCHAR)
  avg_production_time_sec (INT)
  sample_count (INT)
  period (DATE)                         -- mes de referencia
  updated_at (TIMESTAMP)
```

### 3.5 Excedente de Clientes

```sql
client_overages
  id (UUID, PK)
  client_id (FK -> clients)
  client_plan_id (FK -> client_plans)
  month (DATE)
  content_type (VARCHAR)
  included_qty (INT)                    -- do plano
  delivered_qty (INT)                   -- real
  overage_qty (INT)                     -- excedente
  overage_unit_price (DECIMAL)
  overage_total (DECIMAL)
  status (VARCHAR)                      -- pending, billed, paid
  created_at (TIMESTAMP)
```

### 3.6 Instagram Metrics

```sql
instagram_posts
  id (UUID, PK)
  delivery_id (FK -> deliveries, nullable)
  client_id (FK -> clients)
  instagram_media_id (VARCHAR)
  post_url (VARCHAR, nullable)
  post_type (VARCHAR)                   -- reel, feed, carousel, story
  posted_at (TIMESTAMP)
  created_at (TIMESTAMP)

instagram_metrics
  id (UUID, PK)
  post_id (FK -> instagram_posts)
  impressions (INT)
  reach (INT)
  engagement (INT)
  saves (INT)
  shares (INT)
  comments_count (INT)
  video_views (INT, nullable)
  reel_skip_rate (DECIMAL, nullable)
  fetched_at (TIMESTAMP)
```

### 3.7 Campanhas (futuro — Kommo + Meta Ads)

```sql
campaigns
  id (UUID, PK)
  client_id (FK -> clients)
  source (VARCHAR)                -- meta_ads, google_ads, etc.
  external_id (VARCHAR)           -- ID na plataforma de origem
  name (VARCHAR)
  budget (DECIMAL, nullable)
  status (VARCHAR)
  start_date (DATE, nullable)
  end_date (DATE, nullable)
  metrics (JSONB)                 -- metricas brutas da plataforma
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)

campaign_deliveries
  campaign_id (FK -> campaigns)
  delivery_id (FK -> deliveries)
  PRIMARY KEY (campaign_id, delivery_id)
```

### 3.8 Configuracoes & Integracoes

```sql
app_settings
  id (UUID, PK)
  key (VARCHAR, unique)                 -- ranking_show_names, default_currency, etc.
  value (JSONB)
  updated_by (FK -> users, nullable)
  updated_at (TIMESTAMP)

integrations
  id (UUID, PK)
  type (VARCHAR)                        -- clickup, instagram, evolution_api, payment_gateway
  config (JSONB)                        -- tokens, URLs, etc. (encriptado)
  is_active (BOOLEAN, default true)
  last_sync_at (TIMESTAMP, nullable)
  created_at (TIMESTAMP)
  updated_at (TIMESTAMP)
```

---

## 4. Roles & Permissoes

| Role | Ve | Define metas | Define salarios/curvas | Configura planos | Configura sistema |
|------|-----|-------------|----------------------|-----------------|-------------------|
| **CEO** | Tudo | Sim, todos | Sim | Sim | Sim |
| **Diretor** | Tudo | Sim, todos | Nao | Sim | Nao |
| **Gerente** | Tudo | Sim, todos | Nao | Nao | Nao |
| **Gestor de conta** | Seus clientes + entregas | Nao | Nao | Nao | Nao |
| **Produtor** | Suas metas, entregas, ranking, simulador | Nao | Nao | Nao | Nao |
| **Cliente** | Seus projetos, calendario, galeria, metricas IG | Nao | Nao | Nao | Nao |

**Tipos de gestor de conta:** trafego, comercial, contas, conteudo
**Tipos de produtor:** video_editor, designer, captation, social_media

**Regras:**
- CEO, Diretor e Gerente veem todos os usuarios e clientes
- Gestor de conta ve os clientes que atende e as entregas relacionadas
- Produtor ve apenas os proprios dados
- Cliente ve apenas o que e do seu plano/projeto
- Switch `auto_calc_enabled` so CEO e Diretor podem alterar
- Salarios e curvas so CEO pode definir

---

## 5. Metas & Remuneracao — Curva em J

### Modelo
- **Salario base** configuravel por usuario (definido pelo CEO)
- **Meta de entregas** mensal configuravel (definida por CEO/diretor/gerente)
- **Curva progressiva em J:** valor por entrega sobe conforme produz mais
- **Template por role** com overrides individuais
- **Teto configuravel** (2x, 3x do salario base)
- **Switch liga/desliga** por usuario para calculo automatico

### Fluxo mensal
1. Admin define metas para o mes (ou herda do template)
2. Entregas sao trackeadas automaticamente via ClickUp (status "Concluido" + campo "Formato")
3. Admin clica "calcular sugestao" — app aplica a curva e sugere bonus
4. Admin pode ajustar manualmente
5. Admin fecha o mes — valores sao travados

### Dificuldade e urgencia
- NAO impactam remuneracao
- Usados para analytics: tempo medio de producao por tipo + dificuldade
- Calculo de tempo ideal por nivel de dificuldade
- Tracking de cumprimento de urgencias

### Aplicabilidade
- Por enquanto apenas produtores
- Sistema flexivel para expandir a qualquer role no futuro

---

## 6. Planos de Clientes

### Modelo
- Planos configuraveis com limites por tipo de conteudo
- Cada cliente tem um plano ativo
- Planos diferentes para clientes diferentes

### Excedente
- Entregas alem do plano sao calculadas automaticamente
- Valor unitario do excedente definido no plano
- Excedente acumulado com status: pending > billed > paid
- Cobrado junto da proxima assinatura (controle operacional, sem gateway por enquanto)

---

## 7. Integracoes

| Integracao | Status | Proposito |
|-----------|--------|-----------|
| **ClickUp API** | MVP | Sync de tarefas, entregas, status |
| **Instagram Graph API** | MVP | Metricas de engajamento por publicacao |
| **Kommo CRM** | Futuro | Dados de clientes, pipeline de vendas, metricas comerciais |
| **Meta Ads API** | Futuro | Resultados de campanhas (custo, alcance, conversoes) |
| **Evolution API** | Futuro | Notificacoes WhatsApp, convites |
| **Gateway de pagamento** | Futuro | Cobranca automatica de planos e excedentes |

### Metricas combinadas (futuro)
Campanha no Meta Ads > criativo produzido (entrega no ClickUp) > post no Instagram (engajamento) > lead no Kommo (conversao)

Dashboard unificado: custo por lead, ROAS, performance do criativo vs resultado da campanha.

---

## 8. Telas do Frontend

### Publicas
- `/login` — email/senha + Google OAuth
- `/invite/:token` — aceitar convite, criar conta

### CEO / Diretor / Gerente
- `/dashboard` — visao geral: entregas do mes, metas ativas, alertas, resumo financeiro
- `/users` — lista de usuarios, switch auto_calc, atribuir metas
- `/users/:id` — perfil do usuario, metas, historico de remuneracao, entregas
- `/goals` — definir/editar metas mensais, templates de curva
- `/goals/templates` — criar/editar curvas padrao por role
- `/calculations` — calculos mensais: botao "calcular sugestao", ajustar, fechar mes
- `/clients` — lista de clientes, planos ativos, excedentes
- `/clients/:id` — perfil do cliente, entregas, metricas IG, historico
- `/plans` — criar/editar planos (limites por tipo, preco excedente)
- `/analytics` — tempo medio por tipo/dificuldade, urgencias, tendencias
- `/settings` — integracoes (ClickUp, Instagram), ranking (nomes on/off), convites

### Gestor de Conta
- `/dashboard` — seus clientes, entregas em andamento, status
- `/clients` — apenas os clientes que atende
- `/clients/:id` — perfil do cliente, entregas, metricas IG

### Produtor
- `/dashboard` — metas do mes, entregas feitas, bonus estimado, ranking
- `/deliveries` — historico de entregas
- `/simulator` — "se eu entregar mais X, ganho Y"
- `/history` — meses anteriores (entregas, bonus recebido)

### Cliente
- `/portal` — visao geral: producao em andamento, proximas publicacoes
- `/portal/calendar` — calendario de publicacoes
- `/portal/gallery` — conteudos finalizados + metricas Instagram
- `/portal/status` — em que etapa cada conteudo esta

### Layout
- **Sidebar** com navegacao por role, notificacoes, avatar e logout (tudo no lado esquerdo)
- Sem topbar separada

### Componentes compartilhados
- Cards de metricas
- Graficos (Recharts)
- Tabelas com filtro/sort

---

## 9. API Endpoints

### Auth
```
POST   /api/auth/login              -- email/senha -> JWT
POST   /api/auth/google             -- Google OAuth -> JWT
POST   /api/auth/refresh            -- refresh token
POST   /api/auth/logout             -- invalidar token
POST   /api/invites                 -- criar convite (CEO/diretor/gerente)
POST   /api/invites/:token/accept   -- aceitar convite, criar conta
```

### Users
```
GET    /api/users                   -- listar usuarios
GET    /api/users/:id               -- detalhes
PUT    /api/users/:id               -- editar
PATCH  /api/users/:id/salary        -- definir salario (CEO only)
PATCH  /api/users/:id/auto-calc     -- switch liga/desliga (CEO/diretor)
PATCH  /api/users/:id/deactivate    -- desativar
```

### Goals & Curves
```
GET    /api/goal-templates           -- listar templates de curva
POST   /api/goal-templates           -- criar template
PUT    /api/goal-templates/:id       -- editar
DELETE /api/goal-templates/:id       -- deletar

GET    /api/goals                    -- listar metas (filtro: mes, user)
POST   /api/goals                    -- definir meta para usuario
PUT    /api/goals/:id                -- editar meta
```

### Calculations
```
GET    /api/calculations             -- listar calculos (filtro: mes, status)
POST   /api/calculations/suggest     -- botao "calcular sugestao"
PUT    /api/calculations/:id         -- ajustar valor manualmente
PATCH  /api/calculations/:id/close   -- fechar mes para um user
PATCH  /api/calculations/close-all   -- fechar mes inteiro
```

### Deliveries
```
GET    /api/deliveries               -- listar entregas (filtros: user, client, mes, tipo)
GET    /api/deliveries/:id           -- detalhes
GET    /api/deliveries/stats         -- analytics de tempo (tipo, dificuldade)
```

### Clients & Plans
```
GET    /api/clients                  -- listar clientes
POST   /api/clients                  -- criar cliente
GET    /api/clients/:id              -- detalhes
PUT    /api/clients/:id              -- editar

GET    /api/plans                    -- listar planos
POST   /api/plans                    -- criar plano
PUT    /api/plans/:id                -- editar plano
DELETE /api/plans/:id                -- deletar plano

POST   /api/clients/:id/plan         -- atribuir plano a cliente
GET    /api/clients/:id/overages     -- excedentes do cliente
```

### Instagram
```
GET    /api/instagram/posts          -- posts sincronizados (filtro: client)
GET    /api/instagram/posts/:id/metrics  -- metricas de um post
POST   /api/instagram/sync/:clientId     -- forcar sync de um cliente
```

### Portal do Cliente
```
GET    /api/portal/overview          -- visao geral
GET    /api/portal/calendar          -- calendario de publicacoes
GET    /api/portal/gallery           -- conteudos finalizados + metricas
GET    /api/portal/status            -- status de producao por conteudo
```

### Simulator & Ranking
```
GET    /api/simulator                -- dados para simulacao
POST   /api/simulator/calculate      -- "se entregar mais X, ganho Y"
GET    /api/ranking                  -- ranking do mes
GET    /api/ranking/history          -- ranking de meses anteriores
```

### Settings
```
GET    /api/settings                 -- configuracoes do app
PUT    /api/settings/:key            -- atualizar configuracao
GET    /api/integrations             -- integracoes ativas
PUT    /api/integrations/:id         -- atualizar config de integracao
```

### Webhooks
```
POST   /api/webhooks/clickup         -- recebe eventos do ClickUp
```

---

## 10. Tech Stack

### Frontend
- React.js (Vite)
- React Router v6
- TanStack Query (cache/estado servidor)
- Zustand (estado global)
- Recharts (graficos)
- Tailwind CSS
- Shadcn/ui (componentes base)
- Axios (HTTP client)
- Socket.io-client (real-time)
- PWA (manifest.json + service worker)

### Backend
- Node.js + Express.js (JavaScript)
- Knex.js (query builder + migrations)
- Passport.js (auth local + Google OAuth)
- jsonwebtoken (JWT)
- BullMQ (filas de jobs)
- Socket.io (WebSocket)
- helmet + cors + rate-limit (seguranca)
- joi (validacao)
- winston (logging)

### Infraestrutura
- Postgres (online)
- Redis (online)
- API + Workers: Railway/Render
- Frontend: Vercel
- CI/CD: GitHub Actions
- Monitoramento: Sentry

---

## 11. Estrutura de Pastas

```
tasksludus/
  client/
    src/
      components/
        ui/                    # Shadcn components
        layout/                # Sidebar (nav + notif + avatar)
        dashboard/             # Cards, graficos
        goals/                 # Metas, curvas
        calculations/          # Calculos mensais
        deliveries/            # Entregas
        clients/               # Clientes, planos
        portal/                # Portal do cliente
        simulator/             # Simulador do produtor
        ranking/               # Ranking
        common/                # Compartilhados
      pages/                   # 1 por rota
      hooks/                   # Custom hooks
      services/                # API calls (Axios)
      stores/                  # Zustand stores
      utils/
      App.jsx
    public/
      manifest.json            # PWA
      sw.js                    # Service Worker
    package.json

  server/
    src/
      modules/
        auth/                  # routes, controller, service, validation
        users/
        goals/
        calculations/
        deliveries/
        clients/
        plans/
        portal/
        ranking/
        simulator/
        settings/
      integrations/
        clickup/               # sync, webhook handler, api client
        instagram/             # sync, api client
        kommo/                 # (futuro)
        meta-ads/              # (futuro)
        evolution/             # (futuro)
        payment/               # (futuro)
      middleware/              # Auth, RBAC, error handler
      workers/
        clickup-sync.worker.js
        instagram-sync.worker.js
        calculation.worker.js
      config/                  # DB, Redis, env
      database/
        migrations/
        seeds/
      utils/
      app.js
    package.json

  docs/
    plans/
  package.json                 # Scripts root
  .env.example
```

---

## 12. Decisoes de Design

1. **ClickUp como base:** Nao recriar gestao de tarefas — integrar via API
2. **Integracao hibrida:** Webhooks para eventos criticos + polling diario para consistencia
3. **Curva em J:** Remuneracao progressiva que incentiva alta producao
4. **Template + override:** Curvas padrao por role com ajustes individuais
5. **Calculo semi-automatico:** "Calcular sugestao" + ajuste manual + switch por usuario
6. **Planos operacionais:** Controle de limites e excedentes, sem gateway por enquanto
7. **Dificuldade para analytics:** Nao impacta remuneracao, apenas tempo medio
8. **Integracoes extensiveis:** Modulo padrao para adicionar novas integracoes facilmente
9. **Auth por convite:** Ninguem faz auto-cadastro, todos entram por link
10. **Ranking configuravel:** Admin decide se mostra nomes ou anonimo
11. **Preparado para expansao:** Remuneracao variavel para qualquer role no futuro
12. **PWA:** Acesso rapido pelo celular sem instalar app nativo
