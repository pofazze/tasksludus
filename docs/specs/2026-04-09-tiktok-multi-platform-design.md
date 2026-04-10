# TikTok + Multi-Platform Publishing - Design Spec

## Visão Geral

Adicionar suporte a publicação no TikTok e arquitetura multi-plataforma ao TasksLudus. O SM pode selecionar plataformas (Instagram, TikTok) por post, com conteúdo compartilhado ou personalizado por plataforma. Tags do ClickUp pré-selecionam as plataformas, mas podem ser ajustadas no sistema.

## Abordagem: Post por Plataforma com Grupo de Vinculação

Cada plataforma gera seu próprio `scheduled_post`. Posts relacionados (mesmo conteúdo, plataformas diferentes) são vinculados por `post_group_id`. Cada post é independente (status, horário, legenda próprios). Escalável para novas plataformas (YouTube, etc.) sem mudança de schema.

---

## 1. Banco de Dados

### 1.1 Alterações em `scheduled_posts`

```sql
ALTER TABLE scheduled_posts ADD COLUMN platform VARCHAR(20) NOT NULL DEFAULT 'instagram';
ALTER TABLE scheduled_posts ADD COLUMN post_group_id UUID NULL;
ALTER TABLE scheduled_posts ADD COLUMN tiktok_publish_id VARCHAR(100) NULL;
ALTER TABLE scheduled_posts ADD COLUMN tiktok_permalink VARCHAR(500) NULL;

CREATE INDEX idx_scheduled_posts_platform ON scheduled_posts(platform);
CREATE INDEX idx_scheduled_posts_post_group_id ON scheduled_posts(post_group_id);
```

Posts existentes recebem `platform = 'instagram'` automaticamente via DEFAULT.

### 1.2 Nova tabela `client_tiktok_tokens`

```sql
CREATE TABLE client_tiktok_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tiktok_open_id VARCHAR(255),
  tiktok_username VARCHAR(255),
  access_token_encrypted TEXT,
  token_iv TEXT,
  token_auth_tag TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_encrypted TEXT,
  refresh_token_iv TEXT,
  refresh_token_auth_tag TEXT,
  refresh_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Criptografia: mesma AES-256-GCM usada pelo Instagram (`TOKEN_ENCRYPTION_KEY`).

### 1.3 Alteração em `deliveries`

```sql
ALTER TABLE deliveries ADD COLUMN target_platforms JSONB DEFAULT '["instagram"]';
```

Populado automaticamente pela sync do ClickUp baseado nas tags da task. Editável pelo SM no TasksLudus.

---

## 2. Backend - Serviços TikTok

### 2.1 Estrutura de arquivos

```
server/src/
  modules/
    tiktok/
      tiktok.routes.js
      tiktok.controller.js
      tiktok-oauth.service.js
      tiktok-publish.service.js
  queues/
    tiktok-publish.worker.js
```

### 2.2 OAuth Service (`tiktok-oauth.service.js`)

Mesmo padrão do `instagram-oauth.service.js`:

- `getAuthUrl(clientId)` → URL de autorização TikTok (`https://www.tiktok.com/v2/auth/authorize/`)
  - Scopes: `video.publish,user.info.basic`
  - State: `{clientId}:{csrfToken}` base64
- `handleCallback(code, clientId)` → POST `https://open.tiktokapis.com/v2/oauth/token/` com `grant_type=authorization_code`
  - Salva `access_token` (24h), `refresh_token` (365 dias), `open_id`
  - Criptografa tokens com AES-256-GCM
- `refreshToken(clientId)` → POST com `grant_type=refresh_token`
  - O `refresh_token` retornado pode ser diferente (sempre atualizar)
- `getDecryptedToken(clientId)` → retorna access_token descriptografado
- `getConnectionStatus(clientId)` → status + username
- `disconnectClient(clientId)` → POST `https://open.tiktokapis.com/v2/oauth/revoke/` + deleta registro

### 2.3 Publish Service (`tiktok-publish.service.js`)

Entry point: `executeScheduledPost(postId)`

**Fluxo:**
1. Busca post do DB, valida status
2. Descriptografa token TikTok do cliente
3. Consulta `queryCreatorInfo()` para validar capabilities
4. Resolve URLs de mídia (re-fetch do ClickUp se necessário)
5. Publica baseado no tipo:
   - **Vídeo**: POST `/v2/post/publish/video/init/` com `PULL_FROM_URL` ou `FILE_UPLOAD`
   - **Foto/Carrossel**: POST `/v2/post/publish/content/init/` com `media_type: "PHOTO"`
6. Recebe `publish_id`
7. Poll `/v2/post/publish/status/fetch/` até status final
8. Atualiza post: `status='published'`, `tiktok_publish_id`, `tiktok_permalink`
9. Move task no ClickUp para "publicação"
10. Emite SSE events

**Rate limit**: 6 req/min por token

**Métodos:**
- `publishVideo(token, videoUrl, caption, privacyLevel)` → `/v2/post/publish/video/init/`
- `publishPhoto(token, photoUrls, caption, coverIndex, privacyLevel)` → `/v2/post/publish/content/init/`
- `queryCreatorInfo(token)` → `/v2/post/publish/creator_info/query/`
- `pollPublishStatus(token, publishId)` → `/v2/post/publish/status/fetch/`
- `_uploadVideoChunked(uploadUrl, buffer, chunkSize)` → PUT com Content-Range

**Post type mapping (delivery → TikTok):**
- `reel` / `video` → vídeo TikTok
- `carrossel` → foto/carrossel TikTok (até 35 imagens)
- `feed` → foto TikTok (single image)
- `story` → **não suportado no TikTok** (ignorar)

**Privacy level**: `PUBLIC_TO_EVERYONE` por padrão. Configurable.

### 2.4 Rotas (`tiktok.routes.js`)

```
# OAuth (requer auth)
GET    /api/tiktok/oauth/url/:clientId     # Gera link de autorização
GET    /api/tiktok/oauth/callback          # Callback do TikTok (sem auth)
GET    /api/tiktok/oauth/status/:clientId  # Status da conexão
DELETE /api/tiktok/oauth/:clientId          # Desconectar
```

### 2.5 BullMQ Queue (`tiktok-publish.worker.js`)

Nova queue `tiktok-publish` separada:
- Rate limit: 5 jobs por 60 segundos
- Retry: 3 tentativas, backoff exponencial [30s, 60s, 120s]
- Concurrency: 1
- Cleanup: remove completed after 100, failed after 200

### 2.6 Token Refresh

Adicionar ao `token-refresh.worker.js` existente:
- Bloco separado para tokens TikTok
- Intervalo: a cada 23h (token expira em 24h)
- Marca `is_active = false` se refresh falhar

---

## 3. Backend - Alterações no Scheduling Existente

### 3.1 Criação de posts multi-plataforma

O `instagram.controller.js` no `createScheduledPost` aceita:

```json
{
  "client_id": "...",
  "platforms": ["instagram", "tiktok"],   // novo - array de plataformas
  "caption": "legenda compartilhada",
  "platform_overrides": {                  // novo - overrides por plataforma
    "tiktok": {
      "caption": "legenda diferente pro TikTok",
      "scheduled_at": "2026-04-10T14:00:00Z"
    }
  },
  "media_urls": [...],
  "post_type": "carousel",
  "scheduled_at": "2026-04-10T10:00:00Z"
}
```

**Lógica:**
- Se `platforms` tem 1 item: cria 1 post normal
- Se `platforms` tem N items: gera `post_group_id`, cria N posts
- Cada post aplica overrides da sua plataforma (ou usa valores compartilhados)
- Roteia cada post pro worker correto (`instagram-publish` ou `tiktok-publish`)

### 3.2 Validação

Atualizar `instagram.validation.js`:
- `platform`: string, válidos: `'instagram'`, `'tiktok'`
- `platforms`: array de strings (alternativa a `platform` no create)
- `platform_overrides`: objeto opcional com overrides por plataforma
- `post_type` para TikTok: excluir `'story'`

### 3.3 ClickUp Sync

No `clickup.service.js` e `clickup-sync.service.js`:

**Mapeamento de tags:**
```javascript
const PLATFORM_TAGS = {
  'instagram': 'instagram', 'insta': 'instagram', 'ig': 'instagram',
  'tiktok': 'tiktok', 'tik tok': 'tiktok', 'tt': 'tiktok',
};
```

**Aplicação:**
- `autoCreateDelivery()` → lê tags da task, salva em `target_platforms`
- `handleTaskUpdated()` → se tags mudaram, atualiza `target_platforms`
- `autoCreateScheduledPost()` → cria um post por plataforma no `target_platforms`
  - Vinculados pelo mesmo `post_group_id`
  - `story` → só Instagram, ignora TikTok

**Default:** se nenhuma tag de plataforma → `["instagram"]`

---

## 4. Frontend

### 4.1 ScheduledPostForm

- Novo seletor de plataformas (chips toggle: Instagram / TikTok)
  - Múltipla seleção
  - Pré-selecionado baseado em `target_platforms` da delivery (se vinculada)
- Quando múltiplas plataformas:
  - Legenda compartilhada por padrão
  - Toggle "Personalizar legenda por plataforma" → segundo textarea
  - Horário compartilhado por padrão
  - Toggle "Horários diferentes" → segundo date picker
- Ao salvar com múltiplas: POST com `platforms` array
- `story` desabilita TikTok automaticamente

### 4.2 ScheduleCalendarPage

- Badge de plataforma no chip do post (ícone ou letra: IG / TK)
- Filtro por plataforma no header (além do filtro por cliente)
- Posts do mesmo `post_group_id`: indicador visual de vínculo (ex: borda colorida)
- `firstMedia` já corrigido para suportar objetos `{url, type, order}`

### 4.3 Página de conexão do cliente

- Adicionar "Conectar TikTok" ao lado de "Conectar Instagram"
- Status independente por plataforma (conectado/desconectado)
- Mostra username do TikTok quando conectado

### 4.4 ApprovalReviewSheet

- Mostrar `target_platforms` da delivery como badges (Instagram / TikTok)
- SM pode adicionar/remover plataformas antes de aprovar
- Ao aprovar: `smApprove` cria `scheduled_post` por plataforma com `post_group_id`

### 4.5 PublicApprovalPage (aprovação do cliente)

- Posts do mesmo `post_group_id` no batch: card único com badges de plataforma
- Posts independentes: cards separados
- Cliente aprova o conteúdo (vale pra todas as plataformas do grupo)

### 4.6 Services

Novo arquivo `client/src/services/tiktok.js`:
- `getOAuthUrl(clientId)`
- `getConnectionStatus(clientId)`
- `disconnectTikTok(clientId)`

---

## 5. Configuração

### 5.1 Variáveis de ambiente

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://server-production-bea3.up.railway.app/api/tiktok/oauth/callback
```

Usar o mesmo `TOKEN_ENCRYPTION_KEY` para criptografar tokens do TikTok.

### 5.2 env.js

```javascript
tiktok: {
  clientKey: process.env.TIKTOK_CLIENT_KEY,
  clientSecret: process.env.TIKTOK_CLIENT_SECRET,
  redirectUri: process.env.TIKTOK_REDIRECT_URI,
}
```

---

## 6. Fluxo Completo

```
ClickUp: task criada com tags "instagram" + "tiktok"
  ↓
Webhook → autoCreateDelivery(target_platforms: ["instagram", "tiktok"])
  ↓
Task chega em "aprovação" → sm_pending
  ↓
SM abre ApprovalReviewSheet → vê badges Instagram + TikTok
SM pode ajustar plataformas
  ↓
SM aprova → smApprove cria 2 scheduled_posts (post_group_id compartilhado)
  ↓
SM envia pro cliente → batch com 1 item (ambas plataformas)
  ↓
Cliente aprova → client_approved
  ↓
SM agenda (pode personalizar legenda/horário por plataforma)
  ↓
Horário chega:
  ├─ instagram-publish worker → publica no Instagram
  └─ tiktok-publish worker → publica no TikTok
  ↓
Cada post atualiza status independentemente
  ↓
UI atualiza via SSE
```

---

## 7. Limites TikTok (referência)

| Recurso | Limite |
|---------|--------|
| Rate limit | 6 req/min por token |
| Vídeo duração | até 300 segundos |
| Legenda vídeo | 2200 chars UTF-16 |
| Título foto | 90 chars UTF-16 |
| Fotos por carrossel | até 35 |
| Upload URL validade | 1 hora |
| Access token | 24h |
| Refresh token | 365 dias |
| Agendamento nativo | Não existe |
| App não auditado | Conteúdo restrito a SELF_ONLY |

---

## 8. Pré-requisitos

1. Criar app no TikTok Developer Portal
2. Configurar redirect URI
3. Solicitar scopes: `video.publish`, `user.info.basic`
4. Submeter app para review/audit (necessário para posts públicos)
5. Verificar domínio para PULL_FROM_URL (se aplicável)
6. Adicionar env vars ao Railway

---

## 9. Fora de Escopo

- Publicação no YouTube (futura integração, mesma arquitetura)
- TikTok Analytics
- TikTok DMs
- Agendamento nativo TikTok (não existe na API)
