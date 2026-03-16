# Analise QA — Desenvolvimento (Codigo + Estrutura)

**Data:** 2026-03-16

---

## Resumo

Analise completa do codigo-fonte do TasksLudus (server + client). Foram analisados todos os modulos backend, todas as paginas frontend, middlewares, migrations, seeds, dependencias e configuracoes de seguranca.

| Severidade | Quantidade |
|---|---|
| Criticos | 3 |
| Altos | 8 |
| Medios | 14 |
| Baixos | 12 |
| **Total** | **37** |

---

## Etapa 1: Build e Lint

### Build (Client)
- **Status:** Sucesso
- Build completo em ~4.57s via Vite 6.4.1
- Bundle JS: 341.03 kB (gzip: 110.58 kB)
- Bundle CSS: 58.15 kB (gzip: 10.06 kB)
- Nenhum erro de build

### Lint (Client)
- **Status:** 1 erro, 3 warnings
- **ERRO:** `Sidebar.jsx:77` — variavel `Icon` definida mas nunca usada (na verdade e usada como `<Icon>` via destructuring, mas o ESLint nao reconhece o pattern `icon: Icon` como uso). Apesar de funcionar em runtime, o lint reporta erro.
- **WARNING:** `badge.jsx:49` — Fast refresh nao funciona quando o arquivo exporta constantes alem de componentes
- **WARNING:** `button.jsx:57` — Mesmo problema de fast refresh
- **WARNING:** `tabs.jsx:81` — Mesmo problema de fast refresh

### Lint (Server)
- **Status:** 1 erro, 2 warnings
- **ERRO:** `auth.controller.js:26` — `URLSearchParams` nao esta definido no escopo ESLint. O `URLSearchParams` e uma API global do Node.js (disponivel desde Node 10), mas nao foi adicionado ao `globals` do ESLint.
- **WARNING:** `auth.service.js:119` — `_err` definida mas nunca usada (pattern com prefixo `_` deveria ser ignorado pela config, e de fato a config tem `argsIgnorePattern: '^_'`, mas `_err` nao e argumento de funcao, e sim variavel catch)
- **WARNING:** `auth.service.js:144` — `password_hash` atribuida mas nunca usada (destructuring para remover do objeto, pattern correto mas ESLint nao reconhece)

---

## Etapa 2: Estrutura do Codigo

### Backend — Modulos do Servidor

Todos os 10 modulos existem e seguem o pattern correto:

| Modulo | Validation | Service | Controller | Routes | Status |
|---|---|---|---|---|---|
| auth | OK | OK | OK | OK | Completo |
| users | OK | OK | OK | OK | Completo |
| goals | OK | OK | OK | OK | Completo |
| clients | OK | OK | OK | OK | Completo |
| plans | OK | OK | OK | OK | Completo |
| deliveries | OK | OK | OK | OK | Completo |
| calculations | OK | OK | OK | OK | Completo |
| settings | — | OK | OK | OK | Sem validation (usa verificacao manual) |
| ranking | — | OK | OK | OK | Sem validation |
| simulator | — | OK | OK | OK | Sem validation (usa verificacao manual) |

**Observacao:** Os modulos `settings`, `ranking` e `simulator` nao possuem arquivo de validacao (`.validation.js`). A validacao de input e feita inline nos controllers com verificacoes manuais simples (`if (!month)`, `if (value === undefined)`), o que e menos robusto que usar Joi.

### Backend — Middleware e Config

| Arquivo | Status |
|---|---|
| `middleware/auth.js` | OK — authenticate, authorize, ceoOnly, adminLevel, managementLevel |
| `middleware/errorHandler.js` | OK — handler global com logging |
| `config/env.js` | OK — carrega .env |
| `config/db.js` | OK — Knex setup |
| `config/passport.js` | OK — Local + Google OAuth |
| `config/redis.js` | Existe mas **nunca e importado** por nenhum modulo |
| `utils/logger.js` | OK — Winston logger |

### Frontend — Paginas

| Pagina | Arquivo | Status |
|---|---|---|
| LoginPage | `pages/LoginPage.jsx` | OK |
| InviteAcceptPage | `pages/InviteAcceptPage.jsx` | OK |
| AuthCallbackPage | `pages/AuthCallbackPage.jsx` | OK |
| DashboardPage | `pages/DashboardPage.jsx` | OK (placeholder — dados estaticos) |

### Frontend — Componentes de Layout

| Componente | Arquivo | Status |
|---|---|---|
| Sidebar | `components/layout/Sidebar.jsx` | OK |
| AuthLayout | `components/layout/AuthLayout.jsx` | OK |
| ProtectedRoute | `components/layout/ProtectedRoute.jsx` | OK |

### Frontend — Stores e Services

| Item | Arquivo | Status |
|---|---|---|
| authStore | `stores/authStore.js` | OK — Zustand store com login/logout/loadUser |
| api | `services/api.js` | OK — Axios com interceptors para token e refresh |

### Frontend — Roteamento (App.jsx)

Rotas definidas no `App.jsx`:
- `/login` — LoginPage (publica)
- `/invite/:token` — InviteAcceptPage (publica)
- `/auth/callback` — AuthCallbackPage (publica)
- `/dashboard` — DashboardPage (protegida)
- `/` — Redireciona para `/dashboard`
- `*` — Redireciona para `/dashboard`

**Problema:** A Sidebar define rotas para `/users`, `/goals`, `/calculations`, `/clients`, `/deliveries`, `/ranking`, `/settings`, `/portal`, `/simulator`, mas **nenhuma dessas paginas existe**. O App.jsx so tem rota para `/dashboard`. Ao clicar em qualquer item da sidebar, o usuario sera redirecionado de volta ao `/dashboard` pela rota catch-all `*`.

---

## Etapa 3: Qualidade do Codigo

### Backend

#### Modulo: auth

**Arquivos:** `auth.validation.js`, `auth.service.js`, `auth.controller.js`, `auth.routes.js`

Problemas encontrados:
1. **URL de redirect inconsistente** (`auth.controller.js:30`): O fallback para `CLIENT_URL` usa `http://localhost:5173`, enquanto `env.js` define `http://localhost:4401`. Deveria usar `env.clientUrl` ao inves de `process.env.CLIENT_URL`.
2. **Logout nao invalida token** (`auth.controller.js:83-87`): O logout apenas retorna uma mensagem. JWT stateless nao e invalidado. Comentario indica futuro uso de Redis blacklist, mas Redis nao esta integrado.
3. **Tokens enviados via URL** (`auth.controller.js:26-29`): Na callback do Google OAuth, tokens de acesso e refresh sao enviados como query parameters na URL de redirect. Isso e inseguro — tokens ficam em logs de servidor, historico do browser e podem vazar via Referer header.
4. **Password hash nao utilizado** (`auth.service.js:144`): A variavel `password_hash` e extraida via destructuring mas a verificacao da lint indica que a logica de remocao do campo poderia ser mais limpa.

#### Modulo: users

**Arquivos:** `users.validation.js`, `users.service.js`, `users.controller.js`, `users.routes.js`

Problemas encontrados:
1. **BUG: `.returning()` com argumentos incorretos** (`users.service.js:33,46,64,73`): Knex `.returning()` aceita um unico argumento (string ou array). O codigo usa `.returning('id', 'name', 'email', ...)` (multiplos argumentos), o que faz o Knex ignorar tudo exceto o primeiro argumento (`'id'`). Deveria ser `.returning(['id', 'name', 'email', ...])`.
2. **Sem validacao de UUID nos parametros de rota** (`users.controller.js`): `req.params.id` nao e validado como UUID antes de ser passado ao banco. Um ID invalido resultara em erro do PostgreSQL ao inves de um 400 limpo.
3. **Sem verificacao de auto-edicao**: O endpoint `PUT /:id` permite que qualquer usuario autenticado edite qualquer outro usuario. Nao ha verificacao se o usuario esta editando seu proprio perfil ou se tem permissao para editar outros.
4. **`is_active` no filtro de listagem** (`users.controller.js:8`): O valor `is_active` vem como string da query (`"true"/"false"`), mas e passado diretamente ao Knex onde. Pode nao funcionar como esperado se o banco espera boolean.

#### Modulo: goals

**Arquivos:** `goals.validation.js`, `goals.service.js`, `goals.controller.js`, `goals.routes.js`

Problemas encontrados:
1. **Sem validacao de UUID em `req.params.id`**: Parametros de rota nao sao validados.
2. **Sem verificacao de duplicidade** ao criar user_goal: A tabela tem `unique(['user_id', 'month'])`, mas o service nao trata o erro de duplicidade de forma amigavel — resultara em erro 500 do PostgreSQL.

#### Modulo: clients

**Arquivos:** `clients.validation.js`, `clients.service.js`, `clients.controller.js`, `clients.routes.js`

Problemas encontrados:
1. **Sem validacao de UUID em `req.params.id`**.
2. **`is_active` do query como string** — mesmo problema do modulo users.

#### Modulo: plans

**Arquivos:** `plans.validation.js`, `plans.service.js`, `plans.controller.js`, `plans.routes.js`

Problemas encontrados:
1. **Sem validacao de UUID em `req.params.id` e `req.params.clientId`**.
2. **Operacao de update nao e transacional** (`plans.service.js:32-52`): O update do plano e a recriacao dos limits sao feitos em queries separadas sem `db.transaction()`. Se o delete dos limits funcionar mas o insert falhar, os dados ficam inconsistentes.
3. **Delete cascade perigoso**: Deletar um plano remove todos os `plan_limits` e `client_plans` via CASCADE, sem aviso ou soft delete.

#### Modulo: deliveries

**Arquivos:** `deliveries.validation.js`, `deliveries.service.js`, `deliveries.controller.js`, `deliveries.routes.js`

Problemas encontrados:
1. **Sem validacao de UUID em `req.params.id`**.
2. **`clickup_task_id` e `.notNullable()` na migration** (`007_deliveries.js:10`) mas e `allow(null, '')` na validation (`deliveries.validation.js:7`). Isso pode causar erro ao inserir sem `clickup_task_id`.

#### Modulo: calculations

**Arquivos:** `calculations.validation.js`, `calculations.service.js`, `calculations.controller.js`, `calculations.routes.js`

Problemas encontrados:
1. **Sem validacao de UUID em `req.params.id`**.
2. **`closeAll` nao valida formato do month** (`calculations.controller.js:51`): Apenas verifica se `month` existe, mas nao valida se e uma data valida.
3. **Logica de calculo duplicada**: O metodo `_calculateMultiplier` em `calculations.service.js:104-120` e identico ao mesmo metodo em `simulator.service.js:38-48`. Deveria ser extraido para um utilitario compartilhado.

#### Modulo: settings

**Arquivos:** `settings.service.js`, `settings.controller.js`, `settings.routes.js`

Problemas encontrados:
1. **Sem arquivo de validacao**: Nao usa Joi para validar inputs. Verificacao manual minima (`if (value === undefined)`).
2. **`updateIntegration` nao valida `config` nem `is_active`**: Aceita qualquer dado sem verificacao de tipo ou estrutura.

#### Modulo: ranking

**Arquivos:** `ranking.service.js`, `ranking.controller.js`, `ranking.routes.js`

Problemas encontrados:
1. **`JSON.parse` pode lançar excecao** (`ranking.service.js:26`): `JSON.parse(showNames.value)` pode falhar se o valor armazenado nao for JSON valido. Nao ha try/catch.
2. **Sem validacao de `month`** alem de verificar se existe.
3. **Sem validacao de `userId`** no endpoint de historico — qualquer usuario pode ver o historico de qualquer outro.

#### Modulo: simulator

**Arquivos:** `simulator.service.js`, `simulator.controller.js`, `simulator.routes.js`

Problemas encontrados:
1. **Sem validacao Joi**: Verifica manualmente (`if (!base_salary || deliveries === undefined || !curve_config)`).
2. **Logica de calculo duplicada** com `calculations.service.js`.
3. **Sem validacao de tipo dos inputs** no endpoint `/calculate`: `base_salary` e `deliveries` nao sao verificados como numeros.

### Frontend

#### LoginPage.jsx
- **Estado de loading:** OK — botao desabilitado durante login
- **Estado de erro:** OK — mensagem de erro exibida
- **Acessibilidade:** OK — labels com `htmlFor`, inputs com `id`
- **Problema:** Botao de toggle de senha tem `tabIndex={-1}` (bom), mas nao tem `aria-label`
- **Problema:** Strings hardcoded em portugues sem sistema i18n

#### InviteAcceptPage.jsx
- **Estado de loading:** OK
- **Estado de erro:** OK
- **Acessibilidade:** OK — labels presentes
- **Problema:** Sem `aria-label` no toggle de senha
- **Problema:** Strings hardcoded

#### AuthCallbackPage.jsx
- **Estado de loading:** OK — mostra "Autenticando..."
- **Problema:** Nao exibe mensagem de erro se a autenticacao falhar (apenas redireciona para `/login`)
- **Problema:** Tokens passados via URL query params ficam visiveis no historico do browser

#### DashboardPage.jsx
- **Problema:** Conteudo e 100% estatico/placeholder. Mostra `—` ao inves de dados reais
- **Problema:** Nao busca dados do backend (entregas do mes, bonus estimado)
- **Problema:** Nao tem estado de loading

#### Sidebar.jsx
- **Acessibilidade:** OK — botao de logout tem `title="Sair"`
- **Problema:** Lint erro — `Icon` reportado como nao utilizado (falso positivo do ESLint com destructuring renaming)
- **Problema:** Links para paginas que nao existem (/users, /goals, /calculations, /clients, /deliveries, /ranking, /settings, /portal, /simulator)

#### ProtectedRoute.jsx
- **Estado de loading:** OK — mostra "Carregando..."
- **Logica de roles:** OK — redireciona se role nao autorizada
- **Problema:** Loading state nao tem spinner, apenas texto

#### AuthLayout.jsx
- OK — layout simples com Sidebar + Outlet

#### Componente Toaster (sonner.jsx)
- **Problema:** Componente definido mas **nunca utilizado** em nenhuma pagina ou no App.jsx. Importa `useTheme` de `next-themes`, que depende de um `ThemeProvider` que nao existe na aplicacao.

---

## Etapa 4: Seguranca

### JWT
- **Secret:** Carregado de `process.env.JWT_SECRET`. **Problema:** Nao ha fallback nem validacao que o secret existe ao iniciar o servidor. Se `JWT_SECRET` nao estiver definido, `jwt.sign()` usara `undefined` como secret, o que pode gerar tokens validos mas inseguros.
- **Expiracao:** Access token: 15 minutos (bom). Refresh token: 7 dias (aceitavel).
- **Refresh logic:** OK — verifica tipo `'refresh'`, busca usuario ativo no banco.
- **Problema:** Refresh tokens nao sao invalidados apos uso (replay attack possivel). Sem blacklist.
- **Problema:** Sem rotacao de refresh token — o mesmo refresh token pode ser usado infinitas vezes durante 7 dias.

### Password Hashing
- **Bcrypt rounds:** 10 (aceitavel, mas 12 seria mais seguro para producao).
- **Senha minima:** 6 caracteres (fraca — recomendado minimo 8, preferencialmente com requisitos de complexidade).

### CORS
- **Configuracao:** `cors({ origin: env.clientUrl, credentials: true })` — OK, restrito a URL do client.
- **Problema:** Em desenvolvimento, se `CLIENT_URL` nao estiver definido, permite apenas `http://localhost:4401`.

### Rate Limiting
- **Configuracao:** 100 requests por 15 minutos por IP em `/api/`.
- **Problema:** Rate limiting e global para todas as rotas. Endpoints de login deviam ter rate limit mais agressivo (ex: 5 tentativas por minuto).
- **Problema:** Nao ha rate limiting especifico para o endpoint de refresh token.

### Input Sanitization
- **Problema:** Nenhuma sanitizacao de HTML/XSS e aplicada em campos de texto (name, title, description). O Joi apenas valida formato/tamanho, nao sanitiza conteudo.
- **Problema:** Parametros de rota (`req.params.id`) nao sao validados como UUID antes de serem usados em queries SQL. Embora o Knex parametrize queries (prevenindo SQL injection classica), IDs invalidos geram erros 500 ao inves de 400.

### Dados Sensiveis
- **OK:** `password_hash` e removido das respostas no `auth.service.js:144`.
- **Problema:** O endpoint `GET /api/users/:id` retorna `base_salary` para qualquer usuario autenticado, incluindo produtores que podem ver salarios de outros.
- **Problema:** Tokens passados como query params no OAuth callback (visiveis em logs e historico).

### .env
- **OK:** `.env` esta no `.gitignore`.
- **Problema:** Senha padrao no seed e `admin123` — extremamente fraca e previsivel.
- **Problema:** Nenhuma validacao que variaveis de ambiente criticas existem ao iniciar (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`). O servidor inicia sem elas e quebra em runtime.

---

## Etapa 5: Banco de Dados

### Migrations

11 migrations encontradas, criando as seguintes tabelas:

| Migration | Tabelas |
|---|---|
| 001_users | `users` |
| 002_invite_tokens | `invite_tokens` |
| 003_clients | `clients` |
| 004_plans | `plans`, `plan_limits`, `client_plans` |
| 005_goals | `goal_templates`, `user_goals` |
| 006_calculations | `monthly_calculations` |
| 007_deliveries | `deliveries`, `delivery_time_stats` |
| 008_client_overages | `client_overages` |
| 009_instagram | `instagram_posts`, `instagram_metrics` |
| 010_campaigns | `campaigns`, `campaign_deliveries` |
| 011_settings | `app_settings`, `integrations` |

**Total:** 16 tabelas

### Foreign Keys

Todas as foreign keys estao corretamente definidas com `onDelete` apropriado:
- `CASCADE` para relacoes dependentes (invite_tokens.invited_by, plan_limits.plan_id, etc.)
- `SET NULL` para relacoes opcionais (clients.user_id, monthly_calculations.closed_by, etc.)

### Indexes

**Indexes existentes:**
- `users.email` — UNIQUE (automatico)
- `invite_tokens.token` — UNIQUE (automatico)
- `deliveries` — INDEX em `['user_id', 'month']` e `['client_id', 'month']`
- `deliveries.clickup_task_id` — UNIQUE
- `user_goals` — UNIQUE em `['user_id', 'month']`
- `monthly_calculations` — UNIQUE em `['user_id', 'month']`
- `delivery_time_stats` — UNIQUE em `['content_type', 'difficulty', 'period']`

**Indexes faltantes (recomendados):**
- `monthly_calculations.month` — frequentemente filtrado
- `monthly_calculations.status` — frequentemente filtrado
- `clients.is_active` — frequentemente filtrado
- `deliveries.status` — frequentemente filtrado
- `client_plans.client_id` + `status` — usado em `plans.service.js:64`
- `users.google_id` — usado em lookup de Google OAuth
- `users.role` — frequentemente filtrado
- `instagram_posts.client_id` — frequentemente consultado
- `campaigns.client_id` — frequentemente consultado

### Inconsistencias Schema vs Codigo

1. **`deliveries.clickup_task_id`**: Na migration (`007_deliveries.js:10`) e `.notNullable()`, mas na validation (`deliveries.validation.js:7`) aceita `null` e string vazia. Inserir uma delivery sem `clickup_task_id` causara erro do PostgreSQL.
2. **Tabela `integrations`**: A coluna `config` tem `defaultTo('{}')` que e uma string, nao JSON. Deveria ser `defaultTo(knex.raw("'{}'::jsonb"))`.

### Seed Data

- Seed cria 1 usuario CEO com senha `admin123` (fraca)
- Cria 2 app_settings: `ranking_show_names` e `default_currency`
- Cria 2 integrations: `clickup` e `instagram` (inativos)
- Cria 2 goal templates: Designer e Video Editor
- **Consistente com o schema** — seed deleta todas as tabelas na ordem correta respeitando foreign keys

---

## Etapa 6: Funcionalidades Faltantes

### Paginas Definidas na Sidebar vs Existentes

| Rota | Role(s) | Pagina Existe? | Status |
|---|---|---|---|
| `/dashboard` | todos | Sim | Placeholder (dados estaticos) |
| `/users` | ceo, director, manager | **NAO** | Faltante |
| `/goals` | ceo, director, manager | **NAO** | Faltante |
| `/calculations` | ceo, director | **NAO** | Faltante |
| `/clients` | ceo, director, manager, account_manager | **NAO** | Faltante |
| `/deliveries` | ceo, director, manager, account_manager, producer | **NAO** | Faltante |
| `/ranking` | ceo, director, manager, producer | **NAO** | Faltante |
| `/settings` | ceo | **NAO** | Faltante |
| `/portal` | client | **NAO** | Faltante |
| `/simulator` | producer | **NAO** | Faltante |

**9 de 10 paginas estao faltando.** A unica pagina funcional e a DashboardPage, que e um placeholder.

### Endpoints da API vs Uso no Frontend

Os endpoints da API backend estao todos implementados mas **nenhum e chamado pelo frontend** alem de:
- `POST /api/auth/login` — usado pelo LoginPage
- `POST /api/auth/refresh` — usado pelo interceptor do Axios
- `GET /api/auth/me` — usado pelo authStore.loadUser
- `POST /api/auth/invites/:token/accept` — usado pelo InviteAcceptPage
- `GET /api/auth/google` — link direto no LoginPage

**Endpoints sem uso no frontend:**
- Todos os endpoints de `/api/users/*`
- Todos os endpoints de `/api/goals/*`
- Todos os endpoints de `/api/clients/*`
- Todos os endpoints de `/api/plans/*`
- Todos os endpoints de `/api/deliveries/*`
- Todos os endpoints de `/api/calculations/*`
- Todos os endpoints de `/api/settings/*`
- Todos os endpoints de `/api/ranking/*`
- Todos os endpoints de `/api/simulator/*`

### Funcionalidades do Backend sem Frontend

- CRUD de usuarios (listagem, edicao, salario, auto-calc, desativar)
- CRUD de goal templates e user goals
- CRUD de clientes e overages
- CRUD de planos e atribuicao a clientes
- CRUD de entregas
- Motor de calculo de bonus (suggest, adjust, close)
- Rankings e historico
- Simulador de bonus
- Configuracoes e integracoes

### Codigo Nao Utilizado

1. **`config/redis.js`** — Configurado mas nunca importado por nenhum modulo
2. **`bullmq`** (server package.json) — Dependencia instalada mas nunca importada
3. **`socket.io`** (server package.json) — Dependencia instalada mas nunca importada
4. **`socket.io-client`** (client package.json) — Dependencia instalada mas nunca importada
5. **`recharts`** (client package.json) — Dependencia instalada mas nunca importada
6. **`@tanstack/react-query`** (client package.json) — Dependencia instalada mas nunca importada
7. **Componente `Toaster`** (`components/ui/sonner.jsx`) — Definido mas nunca usado
8. **Componentes UI nao usados**: `dialog.jsx`, `dropdown-menu.jsx`, `switch.jsx`, `table.jsx`, `tabs.jsx` — definidos mas nao usados em nenhuma pagina (provavelmente reservados para uso futuro)
9. **Proxy de Socket.IO** no `vite.config.js` — configurado mas socket.io nao e usado

### Comentarios de Futuro/Placeholder

- `auth.controller.js:85`: `// Future: add token to Redis blacklist` — Funcionalidade nao implementada
- `DashboardPage.jsx:25-26`: Cards exibem `—` como placeholder para dados que deviam vir da API

### Testes

- **Nenhum arquivo de teste existe** no projeto (nem server nem client)
- `package.json` do server tem scripts `test: jest --runInBand` e dependencias `jest` e `supertest`, mas nenhum teste foi escrito

---

## Etapa 7: Dependencias

### Server (`package.json`)

| Pacote | Versao | Status |
|---|---|---|
| bcrypt | ^5.1.1 | OK |
| **bullmq** | ^5.34.0 | **Nao utilizado** — remover |
| cors | ^2.8.5 | OK |
| dotenv | ^16.4.0 | OK |
| express | ^4.21.0 | OK |
| express-rate-limit | ^7.4.0 | OK |
| helmet | ^8.0.0 | OK |
| **ioredis** | ^5.4.0 | **Configurado mas nao usado** — redis.js nunca e importado |
| joi | ^17.13.0 | OK |
| jsonwebtoken | ^9.0.2 | OK |
| knex | ^3.1.0 | OK |
| passport | ^0.7.0 | OK |
| passport-google-oauth20 | ^2.0.0 | OK |
| passport-local | ^1.0.0 | OK |
| pg | ^8.13.0 | OK |
| **socket.io** | ^4.8.0 | **Nao utilizado** — remover |
| winston | ^3.17.0 | OK |

**DevDependencies:** eslint, jest, nodemon, supertest — OK

### Client (`package.json`)

| Pacote | Versao | Status |
|---|---|---|
| @base-ui/react | ^1.3.0 | OK — usado pelos componentes UI |
| @fontsource-variable/geist | ^5.2.8 | OK |
| **@tanstack/react-query** | ^5.90.21 | **Nao utilizado** — remover ou integrar |
| axios | ^1.13.6 | OK |
| class-variance-authority | ^0.7.1 | OK |
| clsx | ^2.1.1 | OK |
| lucide-react | ^0.577.0 | OK |
| next-themes | ^0.4.6 | Usado apenas por sonner.jsx que nao e usado — considerar remover |
| react | ^19.2.4 | OK |
| react-dom | ^19.2.4 | OK |
| react-router-dom | ^7.13.1 | OK |
| **recharts** | ^3.8.0 | **Nao utilizado** — remover ou integrar quando graficos forem necessarios |
| shadcn | ^4.0.8 | OK |
| **socket.io-client** | ^4.8.3 | **Nao utilizado** — remover |
| sonner | ^2.0.7 | Definido mas componente Toaster nao esta no App |
| tailwind-merge | ^3.5.0 | OK |
| tw-animate-css | ^1.4.0 | OK |
| zustand | ^5.0.11 | OK |

**DevDependencies:** eslint, tailwindcss, vite, plugin-react — OK

### Imports vs Dependencias

Todas as dependencias importadas no codigo estao presentes no `package.json`. Nao ha imports de pacotes ausentes. As dependencias extras mencionadas acima sao "mortas" — instaladas mas nunca usadas.

---

## Problemas Encontrados

### Criticos (bloqueiam uso)

- [ ] **BUG: `.returning()` com argumentos incorretos** — `server/src/modules/users/users.service.js:33,46,64,73`. Metodo Knex `.returning('id', 'name', ...)` ignora todos exceto o primeiro argumento. Deve ser `.returning(['id', 'name', ...])`. Causa retorno de dados incompletos nas operacoes de update do modulo de usuarios.
- [ ] **9 paginas do frontend nao existem** — Sidebar mostra links para `/users`, `/goals`, `/calculations`, `/clients`, `/deliveries`, `/ranking`, `/settings`, `/portal`, `/simulator`, mas nenhuma pagina foi implementada. Usuarios clicam e sao redirecionados para o Dashboard.
- [ ] **Sem validacao de variaveis de ambiente criticas** — `server/src/config/env.js`. Se `JWT_SECRET` ou `JWT_REFRESH_SECRET` nao estiverem definidos, o servidor inicia mas gera tokens com `undefined` como secret, comprometendo toda a seguranca.

### Altos (funcionalidade quebrada)

- [ ] **DashboardPage e placeholder** — `client/src/pages/DashboardPage.jsx`. Exibe `—` ao inves de dados reais. Nao faz nenhuma chamada API.
- [ ] **URL de redirect do OAuth inconsistente** — `server/src/modules/auth/auth.controller.js:30`. Usa fallback `localhost:5173` ao inves de `env.clientUrl` (`localhost:4401`). Quebra login via Google em desenvolvimento.
- [ ] **Inconsistencia `clickup_task_id`** — Migration define como NOT NULL, validation aceita null. Inserir delivery sem `clickup_task_id` falhara com erro SQL.
- [ ] **Tokens no URL do OAuth callback** — `server/src/modules/auth/auth.controller.js:26-29`. Access/refresh tokens enviados como query params, expostos em logs e historico do browser.
- [ ] **Operacao de update de plano nao e transacional** — `server/src/modules/plans/plans.service.js:32-52`. Delete de limits + insert pode falhar parcialmente.
- [ ] **ESLint erro: URLSearchParams indefinido** — `server/src/modules/auth/auth.controller.js:26`. Funciona em runtime (Node.js global), mas ESLint reporta erro. Necessario adicionar ao globals do ESLint.
- [ ] **Refresh tokens sem invalidacao** — Mesmo refresh token pode ser reutilizado infinitamente durante 7 dias. Sem blacklist ou rotacao.
- [ ] **Nenhum teste automatizado** — Projeto tem dependencias de teste (jest, supertest) mas 0 testes escritos.

### Medios (qualidade/manutencao)

- [ ] **Sem validacao de UUID nos parametros de rota** — Todos os controllers passam `req.params.id` diretamente ao banco sem validar formato UUID. Gera erros 500 ao inves de 400 para IDs invalidos.
- [ ] **Modulos settings, ranking e simulator sem arquivo de validacao Joi** — Usam verificacoes manuais inline menos robustas.
- [ ] **`is_active` query param recebido como string** — `server/src/modules/users/users.controller.js:8`, `clients.controller.js:8`. String `"true"/"false"` passada ao Knex `.where()` pode nao funcionar corretamente.
- [ ] **Logica de calculo de multiplicador duplicada** — `calculations.service.js:104-120` e `simulator.service.js:38-48`. Deveria ser um utilitario compartilhado.
- [ ] **Redis configurado mas nao integrado** — `server/src/config/redis.js` existe mas nunca e importado. Conexao com Redis e tentada inutilmente ao importar.
- [ ] **Componente Toaster nao integrado** — `client/src/components/ui/sonner.jsx` definido mas nao adicionado ao App.jsx. Toast notifications nao funcionam.
- [ ] **`JSON.parse` sem try/catch** — `server/src/modules/ranking/ranking.service.js:26`. Pode lançar excecao se valor do setting nao for JSON valido.
- [ ] **Sem tratamento de duplicidade em user_goals** — `goals.service.js`. Constraint UNIQUE causa erro 500 ao inves de 409 amigavel.
- [ ] **Ranking expoe dados de outros usuarios sem restricao** — Qualquer usuario pode ver historico de qualquer outro via `/ranking/history/:userId`.
- [ ] **`base_salary` exposto em GET /users/:id** — Qualquer usuario autenticado pode ver salario de qualquer outro.
- [ ] **Endpoint GET /users/:id sem restricao de role** — Qualquer usuario autenticado pode ver detalhes de qualquer outro, incluindo dados sensiveis.
- [ ] **Seed com senha fraca** — `server/src/database/seeds/001_initial.js:28`. Senha do CEO e `admin123`.
- [ ] **Sem contexto de loading visual** (spinner) — `client/src/components/layout/ProtectedRoute.jsx:10`. Mostra apenas texto sem indicacao visual de progresso.
- [ ] **3 warnings de fast refresh** — `badge.jsx`, `button.jsx`, `tabs.jsx`. Exportam constantes junto com componentes.

### Baixos (melhorias recomendadas)

- [ ] **5 dependencias nao utilizadas** — `bullmq`, `socket.io`, `ioredis` (server); `socket.io-client`, `recharts`, `@tanstack/react-query` (client). Aumentam o tamanho de `node_modules` sem necessidade.
- [ ] **Proxy de Socket.IO configurado no Vite** mas socket.io nao e usado — `client/vite.config.js:20-23`.
- [ ] **Sem aria-label no botao toggle de senha** — `LoginPage.jsx:68`, `InviteAcceptPage.jsx:72`. Botao de mostrar/ocultar senha nao acessivel para leitores de tela.
- [ ] **Strings hardcoded em portugues** — Toda a UI usa strings inline sem sistema de internacionalizacao (i18n).
- [ ] **Sem validacao de input no frontend** — Os formularios dependem apenas de `required` HTML e `minLength`. Sem validacao de formato de email, complexidade de senha, etc.
- [ ] **Senha minima de 6 caracteres** — `server/src/modules/auth/auth.validation.js:5,10`. Recomendado minimo de 8 com requisitos de complexidade.
- [ ] **Bcrypt salt rounds = 10** — `server/src/modules/auth/auth.service.js:65`, `seeds/001_initial.js:28`. Em producao, 12 rounds e mais seguro.
- [ ] **Rate limit global sem especifico para login** — `server/src/app.js:29-35`. 100 req/15min e muito alto para endpoint de autenticacao.
- [ ] **Sem sanitizacao HTML/XSS** — Campos de texto (name, title, description) nao sao sanitizados contra XSS.
- [ ] **Componentes UI gerados mas nao usados** — `dialog.jsx`, `dropdown-menu.jsx`, `switch.jsx`, `table.jsx`, `tabs.jsx` estao no bundle sem necessidade atual.
- [ ] **Falta index em colunas frequentemente filtradas** — `monthly_calculations.month`, `monthly_calculations.status`, `users.google_id`, `users.role`, `clients.is_active`.
- [ ] **AuthCallbackPage nao exibe erro** — Se tokens nao vierem nos query params, apenas redireciona sem feedback.

---

## Correcoes Requeridas (por etapa de implementacao)

### Etapa 1: Correcoes Criticas

1. **Corrigir `.returning()` no `users.service.js`**: Trocar `.returning('id', 'name', ...)` por `.returning(['id', 'name', ...])` nas linhas 33, 46, 64 e 73.

2. **Adicionar validacao de variaveis de ambiente**: Em `config/env.js`, adicionar verificacao ao iniciar:
   ```js
   const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
   required.forEach(key => {
     if (!process.env[key]) throw new Error(`Missing required env: ${key}`);
   });
   ```

3. **Corrigir URL de redirect do OAuth**: Em `auth.controller.js:30`, trocar `process.env.CLIENT_URL || 'http://localhost:5173'` por `env.clientUrl` (importar env do config).

4. **Corrigir inconsistencia `clickup_task_id`**: Alterar migration para `.nullable()` ou alterar validation para `.required()`. Recomendado: tornar nullable na migration, pois nem toda delivery vem do ClickUp.

### Etapa 2: Correcoes de Funcionalidade

1. **Adicionar transacao no update de planos**: Envolver delete + insert de plan_limits em `db.transaction()` no `plans.service.js`.

2. **Tratar erro de duplicidade em user_goals**: No `goals.service.js:createUserGoal`, adicionar try/catch para unique constraint violation e retornar 409.

3. **Adicionar validacao de UUID nos controllers**: Criar middleware ou validacao Joi para `req.params.id` como UUID antes de cada operacao de banco.

4. **Corrigir conversao de `is_active` query param**: Converter string `"true"/"false"` para boolean antes de passar ao Knex.

5. **Adicionar `try/catch` no `JSON.parse`** do ranking service.

6. **Corrigir ESLint**: Adicionar `URLSearchParams` ao globals do ESLint no server. Considerar adicionar `URL` tambem.

### Etapa 3: Melhorias de Qualidade

1. **Extrair logica de calculo de multiplicador**: Criar `server/src/utils/curveCalculator.js` e usar em `calculations.service.js` e `simulator.service.js`.

2. **Criar validacoes Joi para settings, ranking e simulator**: Adicionar `.validation.js` para cada modulo.

3. **Integrar componente Toaster**: Adicionar `<Toaster />` ao `App.jsx` e usar `toast()` para feedback de acoes.

4. **Adicionar loading spinner visual**: Trocar texto "Carregando..." por spinner animado no ProtectedRoute.

5. **Remover dependencias nao utilizadas**: `bullmq`, `socket.io`, `ioredis` do server; `socket.io-client`, `recharts`, `@tanstack/react-query` do client (manter se planejado para uso futuro proximo).

6. **Remover proxy de Socket.IO** do vite.config.js.

7. **Adicionar aria-labels** nos botoes de toggle de senha.

8. **Implementar testes automatizados**: Pelo menos testes unitarios para os services e testes de integracao para as rotas criticas.

### Etapa 4: Melhorias de Seguranca

1. **Implementar blacklist de JWT via Redis**: Integrar `redis.js` (que ja existe) para invalidar tokens no logout e na rotacao de refresh tokens.

2. **Implementar rotacao de refresh token**: Cada vez que um refresh token e usado, emitir um novo e invalidar o anterior.

3. **Mover tokens do OAuth para metodo mais seguro**: Usar cookies HttpOnly ou state temporario ao inves de query params.

4. **Adicionar rate limiting especifico para login**: Limitar `/api/auth/login` a ~5 tentativas por minuto por IP.

5. **Restringir acesso a dados sensiveis**: `base_salary` so deve ser retornado para ceo/director. Criar projections diferentes por role.

6. **Adicionar sanitizacao de HTML/XSS**: Usar biblioteca como `dompurify` ou `xss` para sanitizar inputs de texto.

7. **Aumentar requisitos de senha**: Minimo 8 caracteres com pelo menos 1 numero e 1 letra.

8. **Trocar senha do seed**: Usar variavel de ambiente ou gerar senha forte aleatoria.

### Etapa 5: Paginas e Funcionalidades Faltantes

As seguintes paginas precisam ser criadas no frontend para que a aplicacao seja funcional:

1. **UsersPage** (`/users`) — Listagem, edicao, convite de usuarios. Roles: ceo, director, manager.
2. **GoalsPage** (`/goals`) — Gerenciamento de goal templates e user goals. Roles: ceo, director, manager.
3. **CalculationsPage** (`/calculations`) — Calculo de bonus, ajustes, fechamento. Roles: ceo, director.
4. **ClientsPage** (`/clients`) — CRUD de clientes, planos atribuidos, overages. Roles: ceo, director, manager, account_manager.
5. **DeliveriesPage** (`/deliveries`) — Listagem de entregas, filtros, estatisticas. Roles: todos exceto client.
6. **RankingPage** (`/ranking`) — Ranking mensal de produtores. Roles: ceo, director, manager, producer.
7. **SettingsPage** (`/settings`) — Configuracoes do sistema e integracoes. Role: ceo.
8. **PortalPage** (`/portal`) — Portal do cliente com visao de entregas e overages. Role: client.
9. **SimulatorPage** (`/simulator`) — Simulador de bonus para produtores. Role: producer.
10. **DashboardPage** — Implementar conteudo real com dados da API (entregas do mes, bonus estimado, graficos).

Alem disso, cada pagina precisa ser adicionada ao roteamento do `App.jsx` dentro da rota protegida com as roles apropriadas.

---

*Documento gerado em 2026-03-16 por analise automatizada do codigo-fonte.*
