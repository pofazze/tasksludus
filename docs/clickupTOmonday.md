# Mapeamento ClickUp → Monday.com — Viabilidade de Migração

## Resumo Executivo

**Viável?** Sim. Todas as funcionalidades que o TasksLudus usa do ClickUp têm equivalente na Monday.com API. A migração exige reescrita do módulo de webhooks, sync e auto-assign, mas a lógica de negócio (publicação, aprovações, notificações, relatórios) permanece intacta.

**Esforço estimado:** 2-3 semanas de desenvolvimento + 1 semana de testes + migração de dados.

**Risco principal:** Monday usa GraphQL (ClickUp usa REST). Toda chamada de API muda de formato.

---

## Mapeamento Estrutural

### Hierarquia de Dados

| ClickUp | Monday.com | Notas |
|---|---|---|
| Team (9011736576) | Workspace | 1:1 |
| Space (Marketing - 90114084559) | Board | 1 board = 1 espaço de trabalho |
| Folder (Ludus Health, Ludus Experts) | **Group** dentro do board | Ou boards separados por categoria |
| List (Dr. Wander, Dr Shira, etc.) | **Group** ou **Board** por cliente | Cada cliente = 1 grupo dentro do board de categoria |
| Task | **Item** | 1:1 |
| Subtask | **Subitem** | 1:1 |
| Custom Field | **Column** (tipada: status, person, date, text, dropdown, file) | Monday é mais rico aqui |
| Tag | **Tags column** | Equivalente |
| Attachment | **File column** ou **Asset** | Upload/download via API |

### Decisão arquitetural necessária

Hoje no ClickUp: 1 List por cliente (Dr. Wander = lista, Dr Shira = outra lista).

No Monday, 2 opções:
- **A)** 1 Board por categoria, 1 Group por cliente (mais compacto)
- **B)** 1 Board por cliente (mais isolado, mais boards pra gerenciar)

**Recomendação:** A — menos boards, mais fácil de administrar.

---

## Mapeamento de Features Usadas

### 1. Webhooks

| ClickUp Event | Monday Event | Status |
|---|---|---|
| `taskStatusUpdated` | `change_status_column_value` | ✅ Equivalente direto |
| `taskCreated` | `create_item` | ✅ Equivalente direto |
| `taskUpdated` | `change_column_value` | ✅ Equivalente direto |
| `taskAssigneeUpdated` | `change_column_value` (coluna Person) | ✅ Precisa filtrar por column_id |
| `taskDeleted` | `delete_item` | ✅ Equivalente |
| `taskDueDateUpdated` | `change_column_value` (coluna Date) | ✅ Precisa filtrar |
| `taskTagUpdated` | `change_column_value` (coluna Tags) | ✅ Precisa filtrar |

**Diferença chave:** ClickUp registra 1 webhook por team (recebe TODOS os eventos). Monday registra 1 webhook **por board + por evento**. Se tiver 10 boards × 5 eventos = 50 webhooks.

**Ambos** exigem verificação do webhook (challenge/response). Padrão similar.

### 2. API Calls (REST → GraphQL)

| ClickUp (REST) | Monday (GraphQL) | Mudança |
|---|---|---|
| `GET /task/{id}` | `query { items(ids: [ID]) { ... } }` | Reescrita total |
| `PUT /task/{id}` (update status) | `mutation { change_column_value(...) }` | Reescrita total |
| `PUT /task/{id}` (assign user) | `mutation { change_column_value(column_id: "person", ...) }` | Reescrita |
| `GET /list/{id}/task?page=N` | `query { boards(ids: [ID]) { items_page(limit: N) { ... } } }` | Reescrita + paginação diferente |
| `GET /space/{id}/folder` | `query { boards(ids: [...]) { groups { ... } } }` | Mapeamento diferente |
| `POST /team/{id}/webhook` | `mutation { create_webhook(...) }` | GraphQL mutation |
| `POST /oauth/token` | OAuth 2.0 padrão | Similar (Monday usa OAuth 2.0) |

**Impacto:** todo `fetch()` pra ClickUp precisa virar chamada GraphQL. São ~11 endpoints únicos.

### 3. Custom Fields → Monday Columns

| ClickUp Custom Field | Monday Column Type | Migração |
|---|---|---|
| `Formato` (dropdown: reel, feed, story, etc.) | **Dropdown column** | ✅ Direto — mapear options pelo label |
| `Entrega` (date) | **Date column** | ✅ Direto |
| `Legenda` (long text) | **Long Text column** | ✅ Direto |
| Status (built-in) | **Status column** (built-in) | ✅ Direto — labels customizáveis |
| Assignee (built-in) | **Person column** | ✅ Direto — user IDs diferentes |
| Tags (built-in) | **Tags column** | ✅ Direto |
| Due Date (built-in) | **Date column** | ✅ Direto |

### 4. Attachments / Files

| ClickUp | Monday | Status |
|---|---|---|
| `task.attachments[]` (automático ao anexar) | **File column** com assets | ✅ Equivalente |
| URL direta dos attachments (`clickup-attachments.com`) | `asset.public_url` | ✅ Monday gera URLs públicas |
| Upload via UI (user arrasta) | Upload via UI ou `add_file_to_column` mutation | ✅ |

**Diferença:** ClickUp retorna attachments no GET task. Monday precisa de query separada com `column_values { ... on FileValue { files { asset { public_url } } } }`.

### 5. OAuth / Autenticação

| ClickUp | Monday | Status |
|---|---|---|
| OAuth 2.0 (code → access_token) | OAuth 2.0 (code → access_token) | ✅ Mesmo padrão |
| Token longa duração (sem refresh) | Token longa duração (sem refresh, 70d default) | ✅ Similar |
| Fallback pra API token via env | API token pessoal | ✅ Equivalente |

### 6. Sync de Dados

| ClickUp Sync | Monday Equivalente | Status |
|---|---|---|
| `syncMembers()` — importa membros do workspace | `query { users { ... } }` | ✅ |
| `syncClients()` — importa folders/lists como clientes | `query { boards { groups { ... } } }` | ✅ Precisa mapear grupo→cliente |
| `syncTasks()` — importa tasks paginadas | `query { boards { items_page(limit: 500) { ... } } }` com cursor pagination | ✅ Monday usa cursor, não page number |
| Delivery sync periódico (a cada 5min) | Mesmo — query periódica | ✅ |

### 7. Auto-Assign

| ClickUp | Monday | Status |
|---|---|---|
| `PUT /task/{id}` com `{assignees: {add: [], rem: []}}` | `mutation { change_column_value(column_id: "person", value: "{...}") }` | ✅ Precisa montar JSON do Person column |
| Folder ID → video editor mapping | Board ID ou Group ID → video editor | ✅ Mesmo conceito, IDs diferentes |
| Status name → phase assignee | Status label → phase assignee | ✅ Mesmo conceito |

---

## O Que Muda no Código

### Arquivos que precisam ser REESCRITOS (7 arquivos core)

| Arquivo | Razão |
|---|---|
| `server/src/modules/webhooks/clickup.service.js` (~1000 linhas) | Toda a lógica de webhook + API calls. Reescrita completa pra GraphQL. |
| `server/src/modules/webhooks/clickup-sync.service.js` (~270 linhas) | Sync periódico. REST → GraphQL queries. |
| `server/src/modules/webhooks/clickup-oauth.service.js` (~120 linhas) | OAuth endpoints mudam (Monday tem URLs diferentes). |
| `server/src/modules/webhooks/automations/auto-assign.js` (~230 linhas) | Mesma lógica, mas API call format muda pra GraphQL mutation. |
| `server/src/config/env.js` | Trocar config keys de `clickup.*` pra `monday.*`. |
| `server/src/database/migrations/0XX_clickup_to_monday.js` | Renomear colunas? Ou manter backward compat. |
| `client/src/pages/ClientProfilePage.jsx` | Links ClickUp → Monday. |

### Arquivos que precisam de AJUSTES PONTUAIS (~15 arquivos)

| Arquivo | Mudança |
|---|---|
| `approvals.service.js` | `_moveClickUpTask()` → muda pra GraphQL mutation |
| `instagram-publish.service.js` | `_moveToPublicacao()` → muda pra GraphQL |
| `tiktok-publish.service.js` | Mesmo |
| `youtube-publish.service.js` | Mesmo |
| `notifications.service.js` | Link de task `clickup.com/t/X` → `monday.com/boards/X/pulses/Y` |
| `reports.service.js` | `CLICKUP_URL()` helper → Monday URL format |
| Todas as migrations que referenciam `clickup_task_id` | Manter coluna ou renomear pra `monday_item_id` |
| `server/src/queues/*.worker.js` | `clickupTaskId` variables → `mondayItemId` (ou alias) |

### Arquivos que NÃO MUDAM

| Módulo | Razão |
|---|---|
| Instagram publish (upload flow) | Não toca ClickUp na publicação |
| TikTok publish (upload flow) | Idem |
| YouTube publish (upload flow) | Idem |
| Notifications (compose + dispatch) | Só o link da task muda |
| Reports (queries) | Só o URL helper muda |
| Approvals (batch/window) | Só o `_moveClickUpTask` muda |
| Evolution/WhatsApp | Zero relação com ClickUp |
| Auth/Users | Zero relação |

---

## Gaps e Limitações do Monday

### ⚠️ Pontos de atenção

1. **Webhook por board:** Monday exige 1 webhook por board × evento. Se organizar como 1 board por categoria com N groups, precisa de poucos webhooks. Se 1 board por cliente, escala mal.

2. **Rate limits:** Monday limita a ~5.000 pontos de complexidade/minuto. Cada query tem um custo. O sync periódico (a cada 5min pra ~170 deliveries) precisa ser otimizado.

3. **Attachments mais complexos:** Monday requer query GraphQL com fragments pra ler files. ClickUp devolve attachments inline no GET task.

4. **URLs de task:** ClickUp = `clickup.com/t/{taskId}` (simples). Monday = `monday.com/boards/{boardId}/pulses/{itemId}` (precisa do boardId + itemId).

5. **Nomes de coluna:** Monday usa `column_id` (tipo `status`, `person3`, `date_1`). Precisa mapear pra nomes humanos. ClickUp usa nomes direto no custom_fields.

6. **Sem "Space":** Monday não tem o conceito de Space. A hierarquia é Workspace → Board → Group → Item. Menos níveis.

### ✅ Vantagens do Monday

1. **Automations built-in:** Monday tem automações nativas (quando status muda → assign pessoa). Pode simplificar o auto-assign.
2. **Dashboard nativo:** Monday tem dashboards visuais que podem complementar os relatórios do TasksLudus.
3. **Colunas tipadas:** Mais estruturado que ClickUp custom fields.
4. **GraphQL:** Mais eficiente pra queries complexas (buscar exatamente o que precisa, sem over-fetch).

---

## Estratégia de Migração Recomendada

### Fase 0 — Preparação (1 dia)
- Estruturar o Monday: criar boards, groups, columns equivalentes
- Mapear IDs hardcoded (team → workspace, folder → board, user → user)
- Criar app Monday → OAuth credentials

### Fase 1 — Abstração (3-5 dias)
- Criar camada de abstração `project-management.service.js` que expõe:
  - `getTask(taskId)`
  - `updateTaskStatus(taskId, status)`
  - `assignUser(taskId, userId)`
  - `getTasks(clientId)`
  - `registerWebhook(boardId, event)`
- Implementar pra ClickUp primeiro (extrair do código atual)
- Trocar todos os 15+ arquivos pra usar essa abstração
- Tudo continua funcionando com ClickUp

### Fase 2 — Monday Implementation (5-7 dias)
- Implementar a mesma interface pra Monday (GraphQL)
- Toggle via env: `PROJECT_MANAGEMENT=monday` ou `PROJECT_MANAGEMENT=clickup`
- Testar em paralelo

### Fase 3 — Migração de Dados (2-3 dias)
- Script pra exportar deliveries/tasks do ClickUp → importar como items no Monday
- Mapear `clickup_task_id` → `monday_item_id` em todas as tabelas
- Migrar attachments

### Fase 4 — Cutover (1 dia)
- Desligar webhooks ClickUp
- Ligar webhooks Monday
- Flip env var
- Monitorar

---

## Colunas do DB afetadas

| Tabela | Coluna | Ação |
|---|---|---|
| `deliveries` | `clickup_task_id` | Renomear pra `external_task_id` ou manter + adicionar `monday_item_id` |
| `clients` | `clickup_list_id` | → `monday_group_id` ou `external_list_id` |
| `delivery_phases` | `clickup_task_id` | Mesmo tratamento |
| `delivery_phases` | `assignee_clickup_id` | → `assignee_external_id` |
| `scheduled_posts` | `clickup_task_id` | Mesmo |
| `users` | `clickup_id` | → `monday_user_id` ou `external_user_id` |
| `clickup_oauth_tokens` | toda a tabela | → `monday_oauth_tokens` |
| `webhook_events` | `source: 'clickup'` | → `source: 'monday'` |

---

## Conclusão

| Aspecto | Avaliação |
|---|---|
| **Viabilidade técnica** | ✅ 100% viável — nenhum blocker |
| **Esforço** | 🟡 Médio-alto (~3 semanas) |
| **Risco** | 🟡 Médio (GraphQL rewrite + data migration) |
| **Benefício** | Depende do motivo da migração (custo? UX? features?) |

**Recomendação:** se a decisão de migrar for tomada, a Fase 1 (abstração) pode ser feita **agora** sem compromisso — ela melhora o código independente de migrar ou não, e torna qualquer migração futura (Monday, Asana, Notion) trivial.
