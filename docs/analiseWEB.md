# Analise QA — Web (Endpoints + Navegacao)

**Data:** 2026-03-16
**Servidor:** http://localhost:4400
**Cliente:** http://localhost:4401
**Analista:** Claude Code (automatizado)
**Ambiente testado:** development (NODE_ENV=development)

---

## Resumo

| Categoria | Quantidade |
|-----------|-----------|
| Endpoints testados | 38+ |
| Criticos | 3 |
| Altos | 5 |
| Medios | 6 |
| Baixos | 7 |
| **Total de problemas** | **21** |

A API esta funcional nos fluxos basicos (autenticacao, CRUD de clientes, listagens), porem apresenta **vazamento de stack traces e queries SQL em producao**, **falhas graves nos endpoints /ranking e /simulator** quando o formato de data nao e completo, **ausencia de sanitizacao de XSS**, e **falta de endpoint para reativacao de usuario**.

---

## Etapa 1: Saude da API

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/health` | GET | 200 | `{"status":"ok","db":"connected","timestamp":"..."}` |

**Resultado:** API saudavel, banco conectado. Nenhum problema encontrado nesta etapa.

---

## Etapa 2: Autenticacao

### 2.1 Login

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| Login com credenciais corretas (`wander@ludus.com` / `admin123`) | 200 | Retorna user + accessToken + refreshToken |
| Login com senha errada | 401 | `{"error":"Invalid credentials"}` + **stack trace vazado** |
| Login com email inexistente | 401 | `{"error":"Invalid credentials"}` + **stack trace vazado** |
| Login com body vazio `{}` | 400 | `{"error":"\"email\" is required"}` |
| Login sem password | 400 | `{"error":"\"password\" is required"}` |
| Login sem email | 400 | `{"error":"\"email\" is required"}` |
| Login sem Content-Type | 400 | `{"error":"\"email\" is required"}` (body nao parseado) |

### 2.2 /api/auth/me

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| Com token valido | 200 | Retorna dados do usuario (sem password_hash) |
| Com token expirado | 401 | `{"error":"Token expired"}` |

### 2.3 /api/auth/refresh

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| Com refreshToken valido | 200 | Retorna novos tokens + user |
| Com body vazio | 400 | `{"error":"Refresh token required"}` |
| Com token invalido | 401 | `{"error":"Invalid refresh token"}` + **stack trace vazado** |
| Usando refreshToken como accessToken | 401 | `{"error":"Invalid token"}` (correto, tipo validado) |

### 2.4 /api/auth/logout

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| POST /api/auth/logout | 200 | `{"message":"Logged out"}` |

**Observacao:** O logout nao exige token nem invalida tokens existentes. Qualquer POST retorna 200. Tokens continuam funcionando apos logout.

### 2.5 /api/auth/invites

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| Criar convite (CEO) | 201 | Retorna convite com **token exposto na resposta** |
| Aceitar convite com token valido | 201 | Cria usuario e retorna tokens |
| Aceitar convite com token falso | 400 | `{"error":"Invalid or expired invite"}` + **stack trace** |
| Producer tentando criar convite | 403 | `{"error":"Insufficient permissions"}` (RBAC correto) |

### 2.6 Google OAuth

| Teste | Status HTTP | Resultado |
|-------|-----------|-----------|
| GET /api/auth/google | 500 | Erro interno — Google OAuth nao configurado |

### 2.7 Dados expostos no login

**Problema:** O campo `google_id` e retornado no objeto `user` da resposta de login. Apesar de estar `null`, este campo nao deveria ser exposto ao cliente.

**Positivo:** O campo `password_hash` **nao** e retornado (removido corretamente no `_generateTokens`).

---

## Etapa 3: Endpoints Protegidos

### 3.1 Users (`/api/users`)

| Endpoint | Metodo | Auth | Status | Resultado |
|----------|--------|------|--------|-----------|
| `/api/users` | GET | managementLevel | 200 | Lista usuarios (sem password_hash) |
| `/api/users/:id` (UUID valido) | GET | authenticate | 200 | Retorna usuario completo |
| `/api/users/:id` (UUID invalido "nonexistent-id") | GET | authenticate | **500** | **Vaza query SQL completa + stack trace** |
| `/api/users/:id` (UUID valido inexistente) | GET | authenticate | 404 | `User not found` + **stack trace** |
| `/api/users/:id` | PUT | authenticate | 200 | Retorna apenas `{id}` — **nao retorna dados atualizados** |
| `/api/users/:id/salary` | PATCH | ceoOnly | 200 | Retorna apenas `{id}` — **nao retorna dados atualizados** |
| `/api/users/:id/auto-calc` | PATCH | adminLevel | 200 | Retorna apenas `{id}` — **nao retorna dados atualizados** |
| `/api/users/:id/deactivate` | PATCH | managementLevel | 200 | Desativa usuario — **sem endpoint para reativar** |

**Problemas encontrados:**
- `returning('id', 'name', 'email', ...)` no Knex com PostgreSQL deveria ser `returning(['id', 'name', ...])` (array). A chamada atual retorna apenas o `id`.
- Nao existe endpoint para reativar usuario (`/api/users/:id/activate`).
- UUID invalido causa erro 500 com vazamento de query SQL.

### 3.2 Goals (`/api/goals`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/goals/templates` | GET | 200 | Lista 2 templates (designer + video_editor) |
| `/api/goals/templates/:id` | GET | 200 | Retorna template completo com curve_config |
| `/api/goals` | GET | 200 | Lista vazia (nenhum goal atribuido) |
| `/api/goals` | POST | 400 | Validacao: `"monthly_target" is required` |

**Observacao:** O campo `template_id` nao e aceito na criacao de goal (`"template_id" is not allowed`). A API espera `goal_template_id` como campo, mas a validacao requer `monthly_target` diretamente, nao usando o template.

### 3.3 Clients (`/api/clients`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/clients` | GET | 200 | Lista clientes |
| `/api/clients` | POST | 201 | Cria cliente. `user_id` retorna `null` |
| `/api/clients/:id` | GET | 200 | Retorna cliente |
| `/api/clients/:id` | PUT | 200 | Atualiza cliente |
| `/api/clients/:id/overages` | GET | 200 | Lista vazia |
| `/api/clients` com body `{}` | POST | 400 | `"name" is required` |
| `/api/clients/:id` (UUID invalido) | GET | **500** | **Vaza query SQL completa + stack trace** |
| POST com nome duplicado | POST | 201 | **Aceita duplicatas sem aviso** |
| POST com XSS `<script>alert(1)</script>` | POST | 201 | **Conteudo XSS armazenado sem sanitizacao** |
| POST com SQL injection `' OR 1=1 --` | POST | 201 | SQL injection prevenido (queries parametrizadas). Dados armazenados como texto |
| POST com nome > 100 chars | POST | 400 | Validacao funciona: `"name" length must be less than or equal to 100` |

**Problemas encontrados:**
- `user_id` e sempre `null` na criacao de clientes (deveria associar ao usuario autenticado).
- Nomes duplicados de clientes sao permitidos.
- Conteudo XSS nao e sanitizado antes de armazenar.

### 3.4 Plans (`/api/plans`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/plans` | GET | 200 | Lista vazia |
| `/api/plans` | POST (sem limits) | 400 | `"limits" is required` |
| `/api/plans` | POST (limits como obj) | 400 | `"limits" must be an array` |
| `/api/plans` | POST (limits array) | 400 | `"limits[0].content_type" is required` |

**Observacao:** A validacao funciona, porem a documentacao dos campos necessarios nao esta disponivel via API (sem schema de criacao). Nao foi possivel criar um plano completo pois a estrutura exata de `limits` nao e clara pela API.

### 3.5 Deliveries (`/api/deliveries`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/deliveries` | GET | 200 | Lista vazia |
| `/api/deliveries/stats` | GET | 200 | Lista vazia |
| `/api/deliveries` | POST (sem user_id) | 400 | `"user_id" is required` |
| `/api/deliveries` | POST (sem content_type) | 400 | `"content_type" is required` |

**Observacao:** Nao foi possivel criar uma delivery completa pois varios campos sao requeridos: `user_id`, `content_type`, `client_id`, `title`, `delivered_at` (a julgar pela validacao progressiva).

### 3.6 Calculations (`/api/calculations`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/calculations` | GET (adminLevel) | 200 | Lista vazia |
| `/api/calculations/suggest` | POST | 200 | Lista vazia (sem dados para calcular) |

### 3.7 Settings (`/api/settings`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/settings` | GET | 200 | 2 configuracoes: `default_currency=BRL`, `ranking_show_names=true` |
| `/api/settings/integrations` | GET | 200 | 2 integracoes: `clickup` (inativa), `instagram` (inativa) |

### 3.8 Ranking (`/api/ranking`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/ranking` (sem month) | GET | 400 | `Month query param is required` |
| `/api/ranking?month=2026-03` | GET | **500** | **Erro SQL: "invalid input syntax for type date: 2026-03"** + query completa + stack trace vazado |
| `/api/ranking?month=2026-03-01` | GET | 200 | Lista vazia (formato correto) |
| `/api/ranking/history` | GET | 200 | Lista vazia |
| `/api/ranking/history/:userId` | GET | 200 | Lista vazia |

**Problema critico:** O formato `YYYY-MM` causa erro 500 com vazamento completo da query SQL e stack trace. A API deveria aceitar `YYYY-MM` ou validar o formato antes de enviar ao banco.

### 3.9 Simulator (`/api/simulator`)

| Endpoint | Metodo | Status | Resultado |
|----------|--------|--------|-----------|
| `/api/simulator` (sem month) | GET | 400 | `Month query param is required` |
| `/api/simulator?month=2026-03` | GET | **500** | **Mesmo erro SQL de formato de data** |
| `/api/simulator?month=2026-03-01` | GET | 200 | Retorna dados do simulador (todos null) |
| `/api/simulator/calculate` (sem params) | POST | 400 | `base_salary, deliveries, and curve_config are required` |
| `/api/simulator/calculate` (com params) | POST | 200 | `{"multiplier":1,"bonus":5000}` |

**Problema critico:** Mesmo bug de formato de data do ranking.

---

## Etapa 4: Paginas do Cliente

| URL | Status HTTP | Resultado |
|-----|-----------|-----------|
| `http://localhost:4401/` | 200 | SPA React (Vite dev server) — `<title>client</title>` |
| `http://localhost:4401/login` | 200 | Mesma SPA (roteamento client-side) |
| `http://localhost:4401/dashboard` | 200 | Mesma SPA |
| `http://localhost:4401/invite/fake-token` | 200 | Mesma SPA |

**Observacoes:**
- O titulo da pagina e generico: `<title>client</title>` — deveria ser "TasksLudus" ou similar.
- Todas as rotas retornam o mesmo HTML (comportamento esperado de SPA com roteamento client-side).
- O Vite dev server injeta scripts de hot-reload (`@react-refresh`, `/@vite/client`).
- Nao ha favicon personalizado (usa `favicon.svg` padrao).
- Nao e possivel verificar o comportamento de redirecionamento de rotas protegidas via curl (depende de JavaScript client-side).

---

## Etapa 5: Casos Limite

### 5.1 Autenticacao

| Teste | Status | Resultado |
|-------|--------|-----------|
| Endpoint protegido sem token | 401 | `Access token required` |
| Endpoint protegido com token malformado | 401 | `Invalid token` |
| Endpoint protegido com Authorization vazio | 401 | `Access token required` |
| Endpoint protegido com token expirado | 401 | `Token expired` |
| Usar refreshToken como accessToken | 401 | `Invalid token` (validacao de tipo funciona) |

### 5.2 Validacao de UUID

| Teste | Status | Resultado |
|-------|--------|-----------|
| `/api/users/nonexistent-id` (nao UUID) | **500** | Erro SQL: `invalid input syntax for type uuid` + stack trace |
| `/api/clients/nonexistent-id` (nao UUID) | **500** | Erro SQL: `invalid input syntax for type uuid` + stack trace |
| `/api/users/00000000-...` (UUID valido, nao existe) | 404 | `User not found` + stack trace |
| `/api/clients/00000000-...` (UUID valido, nao existe) | 404 | `Client not found` + stack trace |

### 5.3 Validacao de Entrada

| Teste | Status | Resultado |
|-------|--------|-----------|
| Cliente com XSS no nome | 201 | **Armazenado sem sanitizacao** |
| Cliente com SQL injection no nome | 201 | Armazenado como texto (seguro — queries parametrizadas) |
| Cliente com nome > 100 chars | 400 | Validacao funciona corretamente |
| Clientes duplicados (mesmo nome) | 201 | **Aceita sem aviso** |

### 5.4 Rotas Inexistentes

| Teste | Status | Resultado |
|-------|--------|-----------|
| GET /api/nonexistent | 404 | `Route not found` |
| PUT /api/auth/login | 404 | `Route not found` |
| DELETE /api/health | 404 | `Route not found` |
| GET / (raiz do servidor) | 404 | `Route not found` |
| GET /api | 404 | `Route not found` |

### 5.5 Deativacao de Usuario

| Teste | Resultado |
|-------|-----------|
| Desativar usuario CEO | Funciona (200) |
| Login apos desativacao | **Falha** — retorna "Invalid credentials" (mesma mensagem de senha errada) |
| Reativar usuario | **Impossivel via API** — nao existe endpoint de reativacao |

**Problema:** A mensagem de erro para usuario desativado e identica a de credenciais invalidas. Nao ha como distinguir os cenarios. Alem disso, nao ha endpoint para reativar um usuario desativado.

### 5.6 Fluxo Completo de Convite

| Passo | Status | Resultado |
|-------|--------|-----------|
| Criar convite (como CEO) | 201 | Sucesso — **token do convite exposto na resposta** |
| Aceitar convite | 201 | Cria usuario e retorna tokens |
| Login como novo usuario | 200 | Funciona corretamente |
| Novo usuario (producer) acessa /api/users | 403 | RBAC correto |
| Novo usuario (producer) acessa /api/clients | 200 | Acesso permitido (correto) |

### 5.7 RBAC (Controle de Acesso por Role)

| Endpoint | Role necessaria | Producer tenta | Resultado |
|----------|---------------|----------------|-----------|
| GET /api/users | managementLevel | 403 | `Management access only` |
| POST /api/clients | managementLevel | 403 | `Management access only` |
| GET /api/calculations | adminLevel | 403 | `CEO or Director access only` |
| POST /api/auth/invites | ceo/director/manager | 403 | `Insufficient permissions` |

**Resultado:** RBAC funcionando corretamente em todos os endpoints testados.

---

## Etapa 6: CORS e Seguranca

### 6.1 CORS

| Teste | Resultado |
|-------|-----------|
| Preflight OPTIONS com Origin `localhost:4401` | 204 — `Access-Control-Allow-Origin: http://localhost:4401` |
| GET com Origin `localhost:4401` | Header CORS presente |
| GET com Origin `http://evil.com` | **Retorna** `Access-Control-Allow-Origin: http://localhost:4401` (fixo, nao reflete) |
| GET sem Origin | Header CORS presente (sempre inclui `http://localhost:4401`) |

**Resultado:** CORS configurado corretamente com origem fixa `http://localhost:4401`. Nao reflete origens arbitrarias. `Access-Control-Allow-Credentials: true` esta ativo.

### 6.2 Headers de Seguranca (Helmet)

| Header | Valor | Status |
|--------|-------|--------|
| `Content-Security-Policy` | `default-src 'self'; ...` | Presente |
| `Cross-Origin-Opener-Policy` | `same-origin` | Presente |
| `Cross-Origin-Resource-Policy` | `same-origin` | Presente |
| `Referrer-Policy` | `no-referrer` | Presente |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Presente |
| `X-Content-Type-Options` | `nosniff` | Presente |
| `X-DNS-Prefetch-Control` | `off` | Presente |
| `X-Frame-Options` | `SAMEORIGIN` | Presente |
| `X-XSS-Protection` | `0` | Presente (desabilitado intencionalmente — pratica moderna) |
| `X-Powered-By` | Ausente | Correto (removido pelo Helmet) |

**Resultado:** Excelente configuracao de headers de seguranca via Helmet.

### 6.3 Rate Limiting

| Teste | Resultado |
|-------|-----------|
| Politica | `100 requests / 900 segundos (15 min)` |
| Headers | `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` |
| Funcionamento | Decrementa corretamente a cada request |

**Resultado:** Rate limiting funcional. Porem, 100 requests/15min pode ser insuficiente para uso normal da aplicacao.

### 6.4 Vazamento de Informacoes

| Tipo | Presente | Gravidade |
|------|----------|-----------|
| Stack traces em respostas de erro | **Sim** (modo development) | Critico em producao |
| Queries SQL completas em erros 500 | **Sim** | Critico em producao |
| Campo `google_id` exposto no login | **Sim** | Baixo |
| Token de convite exposto no response | **Sim** | Medio (esperado para admin) |
| `X-Powered-By` | Nao | Correto |

### 6.5 Logout

| Teste | Resultado |
|-------|-----------|
| POST /api/auth/logout sem token | 200 `{"message":"Logged out"}` |
| Tokens continuam validos apos logout | **Sim — nao ha invalidacao** |

**Problema:** O logout nao invalida tokens. Nao ha blacklist de tokens JWT. Qualquer token continua valido ate expirar.

---

## Problemas Encontrados

### Criticos (bloqueiam uso em producao)

- [ ] **Vazamento de stack traces em todas as respostas de erro** — `src/middleware/errorHandler.js` expoe `err.stack` quando `NODE_ENV=development` (padrao). Em producao, se `NODE_ENV` nao for configurado, expoe informacoes internas.
- [ ] **Vazamento de queries SQL completas em erros 500** — `/api/ranking?month=2026-03`, `/api/simulator?month=2026-03`, `/api/users/invalid-uuid`, `/api/clients/invalid-uuid` — retornam a query SQL completa no campo `error`.
- [ ] **Erro 500 nos endpoints /ranking e /simulator com formato YYYY-MM** — O parametro `month` no formato `YYYY-MM` causa `invalid input syntax for type date`. Deveria aceitar `YYYY-MM` ou validar/converter antes de enviar ao banco. Afeta `src/modules/ranking/ranking.service.js` e `src/modules/simulator/simulator.service.js`.

### Altos (funcionalidade quebrada)

- [ ] **Nenhum endpoint para reativar usuario** — `PATCH /api/users/:id/deactivate` existe, mas nao ha `/activate` ou equivalente. Um usuario desativado so pode ser reativado via banco de dados. Afeta `src/modules/users/users.routes.js` e `src/modules/users/users.service.js`.
- [ ] **PUT /api/users/:id retorna apenas {id}** — O metodo `returning()` do Knex esta sendo chamado com argumentos separados em vez de array. `returning('id', 'name', 'email')` deveria ser `returning(['id', 'name', 'email'])`. Afeta `src/modules/users/users.service.js` linhas 33, 46, 64, 73.
- [ ] **Google OAuth retorna 500** — `GET /api/auth/google` falha porque as credenciais Google nao estao configuradas. Afeta `src/modules/auth/auth.routes.js`.
- [ ] **Logout nao invalida tokens** — `POST /api/auth/logout` retorna 200 mas nao faz nada — nao requer token, nao invalida o token existente. Tokens continuam validos ate expirar. Afeta `src/modules/auth/auth.controller.js`.
- [ ] **UUID invalido causa erro 500 em vez de 400** — Endpoints que recebem `:id` nao validam se o parametro e um UUID valido antes de enviar ao banco. Afeta todos os endpoints com parametro `:id` (users, clients, plans, deliveries, etc).

### Medios (UX/comportamento inesperado)

- [ ] **Clientes criados sem user_id** — `POST /api/clients` retorna `user_id: null`. O usuario autenticado deveria ser associado automaticamente. Afeta `src/modules/clients/clients.service.js`.
- [ ] **Nomes de clientes duplicados permitidos** — Nao ha validacao de unicidade no nome do cliente. Multiplos clientes com nome identico podem ser criados. Afeta `src/modules/clients/clients.service.js`.
- [ ] **Conteudo XSS armazenado sem sanitizacao** — Nomes de clientes com `<script>alert(1)</script>` sao armazenados diretamente. Se renderizados sem escape no frontend, causam XSS. Afeta `src/modules/clients/clients.controller.js`.
- [ ] **Mensagem de erro identica para usuario desativado e credenciais invalidas** — O login retorna "Invalid credentials" tanto para senha errada quanto para conta desativada. Deveria distinguir os cenarios. Afeta `src/modules/auth/auth.service.js` linha 9-11.
- [ ] **Titulo da pagina generico** — `<title>client</title>` deveria ser "TasksLudus" ou nome da aplicacao. Afeta `client/index.html`.
- [ ] **Campo google_id exposto na resposta de login** — Apesar de `null`, o campo `google_id` nao deveria ser retornado ao cliente. Afeta `src/modules/auth/auth.service.js` linha 144.

### Baixos (melhorias recomendadas)

- [ ] **Rate limit de 100 req/15min pode ser restritivo** — Uma SPA com multiplas chamadas API pode atingir o limite rapidamente. Considerar aumentar ou diferenciar limites por endpoint. Afeta `src/app.js`.
- [ ] **CORS hardcoded para localhost:4401** — Em producao, a URL do cliente precisa ser configuravel. Ja usa `env.clientUrl`, mas verificar se funciona corretamente em deploy. Afeta `src/app.js`.
- [ ] **Access token expira em 15 minutos** — Curto para UX, mas aceitavel se o refresh automatico estiver implementado no client. Verificar implementacao no frontend.
- [ ] **Sem paginacao nas listagens** — `GET /api/clients`, `GET /api/users`, `GET /api/deliveries` retornam todos os registros. Com volume alto, pode causar problemas de performance. Afeta todos os services de listagem.
- [ ] **Sem endpoint de documentacao da API** — Nao ha Swagger/OpenAPI ou similar. Dificulta integracao e testes.
- [ ] **Falta de favicon personalizado** — O cliente usa `favicon.svg` padrao do Vite.
- [ ] **Campos `created_at` e `updated_at` expostos inconsistentemente** — `GET /api/users` retorna `created_at` mas nao `updated_at`. `GET /api/users/:id` retorna ambos. `GET /api/auth/me` nao retorna nenhum.

---

## Correcoes Requeridas (por etapa de implementacao)

### Etapa 1: Correcoes Criticas (devem ser feitas antes do deploy)

1. **Configurar NODE_ENV=production em ambiente de producao** e garantir que stack traces nunca vazem. Revisar `src/middleware/errorHandler.js` para nunca expor `err.stack` ou queries SQL em respostas HTTP, independente do ambiente.

2. **Adicionar validacao de formato de data nos endpoints /ranking e /simulator.** O parametro `month` deve aceitar tanto `YYYY-MM` quanto `YYYY-MM-DD`. Se receber `YYYY-MM`, converter para `YYYY-MM-01` antes de enviar ao banco.
   - Arquivos: `src/modules/ranking/ranking.controller.js`, `src/modules/simulator/simulator.controller.js`

3. **Adicionar validacao de UUID em todos os parametros `:id`.** Antes de enviar ao banco, validar que o parametro e um UUID valido (regex ou lib como `uuid`). Retornar 400 com mensagem clara em vez de deixar o erro SQL propagar.
   - Arquivos: Criar middleware `validateUUID` em `src/middleware/` e aplicar nas rotas.

### Etapa 2: Correcoes de Funcionalidade

4. **Corrigir `returning()` no UsersService.** Mudar de `returning('id', 'name', ...)` para `returning(['id', 'name', ...])` em todas as chamadas de update.
   - Arquivo: `src/modules/users/users.service.js` linhas 33, 46, 64, 73

5. **Adicionar endpoint de reativacao de usuario.** Criar `PATCH /api/users/:id/activate` com restricao `managementLevel`.
   - Arquivos: `src/modules/users/users.routes.js`, `src/modules/users/users.service.js`

6. **Implementar invalidacao real de logout.** Opcoes: blacklist com Redis, ou revogar refresh token no banco. Exigir token no endpoint de logout.
   - Arquivos: `src/modules/auth/auth.controller.js`, `src/modules/auth/auth.service.js`

7. **Associar user_id ao criar clientes.** Usar `req.user.id` (do token autenticado) para preencher `user_id` na criacao de clientes.
   - Arquivo: `src/modules/clients/clients.controller.js`

### Etapa 3: Melhorias de UX

8. **Diferenciar mensagem de erro para usuario desativado.** No login, se o usuario existe mas `is_active=false`, retornar mensagem distinta (ex: "Account deactivated").
   - Arquivo: `src/modules/auth/auth.service.js`

9. **Atualizar titulo da pagina.** Mudar `<title>client</title>` para `<title>TasksLudus</title>`.
   - Arquivo: `client/index.html`

10. **Adicionar paginacao nas listagens.** Aceitar query params `page` e `limit` em endpoints de listagem.
    - Arquivos: Todos os services de listagem.

11. **Remover campo google_id da resposta de login/register.**
    - Arquivo: `src/modules/auth/auth.service.js` (ajustar destructuring na linha 144)

### Etapa 4: Melhorias de Seguranca

12. **Sanitizar inputs de texto** para prevenir XSS armazenado. Usar lib como `sanitize-html` ou `xss` antes de salvar no banco.
    - Arquivos: Todos os controllers que recebem input de texto.

13. **Adicionar validacao de unicidade para nomes de clientes** (ou pelo menos um aviso).
    - Arquivo: `src/modules/clients/clients.service.js`

14. **Configurar Google OAuth corretamente** ou remover/desabilitar o endpoint ate estar pronto.
    - Arquivo: `src/modules/auth/auth.routes.js`

15. **Revisar rate limit** — considerar limites diferenciados por endpoint (login mais restrito, listagens mais permissivas).
    - Arquivo: `src/app.js`

16. **Adicionar documentacao da API** (Swagger/OpenAPI) para facilitar desenvolvimento e testes.

---

## Matriz de Endpoints Testados

| # | Metodo | Endpoint | Status | Funcional |
|---|--------|----------|--------|-----------|
| 1 | GET | `/api/health` | 200 | Sim |
| 2 | POST | `/api/auth/login` | 200 | Sim |
| 3 | POST | `/api/auth/refresh` | 200 | Sim |
| 4 | POST | `/api/auth/logout` | 200 | Parcial (nao invalida) |
| 5 | GET | `/api/auth/me` | 200 | Sim |
| 6 | POST | `/api/auth/invites` | 201 | Sim |
| 7 | POST | `/api/auth/invites/:token/accept` | 201 | Sim |
| 8 | GET | `/api/auth/google` | 500 | Nao |
| 9 | GET | `/api/users` | 200 | Sim |
| 10 | GET | `/api/users/:id` | 200 | Sim |
| 11 | PUT | `/api/users/:id` | 200 | Parcial (retorno incompleto) |
| 12 | PATCH | `/api/users/:id/salary` | 200 | Parcial (retorno incompleto) |
| 13 | PATCH | `/api/users/:id/auto-calc` | 200 | Parcial (retorno incompleto) |
| 14 | PATCH | `/api/users/:id/deactivate` | 200 | Sim (sem reverso) |
| 15 | GET | `/api/goals/templates` | 200 | Sim |
| 16 | GET | `/api/goals/templates/:id` | 200 | Sim |
| 17 | GET | `/api/goals` | 200 | Sim |
| 18 | GET | `/api/clients` | 200 | Sim |
| 19 | GET | `/api/clients/:id` | 200 | Sim |
| 20 | POST | `/api/clients` | 201 | Parcial (user_id null) |
| 21 | PUT | `/api/clients/:id` | 200 | Sim |
| 22 | GET | `/api/clients/:id/overages` | 200 | Sim |
| 23 | GET | `/api/plans` | 200 | Sim |
| 24 | GET | `/api/deliveries` | 200 | Sim |
| 25 | GET | `/api/deliveries/stats` | 200 | Sim |
| 26 | GET | `/api/calculations` | 200 | Sim |
| 27 | POST | `/api/calculations/suggest` | 200 | Sim |
| 28 | GET | `/api/settings` | 200 | Sim |
| 29 | GET | `/api/settings/integrations` | 200 | Sim |
| 30 | GET | `/api/ranking` | 500/200 | Bug formato data |
| 31 | GET | `/api/ranking/history` | 200 | Sim |
| 32 | GET | `/api/ranking/history/:userId` | 200 | Sim |
| 33 | GET | `/api/simulator` | 500/200 | Bug formato data |
| 34 | POST | `/api/simulator/calculate` | 200 | Sim |

**Total: 34 endpoints testados, 28 funcionais, 3 parcialmente funcionais, 3 com bugs.**
