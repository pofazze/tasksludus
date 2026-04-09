# TikTok API - Planejamento de Integração

## Visão Geral

Integrar a publicação de conteúdo no TikTok usando a Content Posting API e Login Kit (Web). Um único app TikTok Developer para a agência, cada cliente autoriza via OAuth.

---

## Arquitetura

```
Agência (1 app TikTok)
    ├── Cliente A → OAuth → access_token_A
    ├── Cliente B → OAuth → access_token_B
    └── Cliente C → OAuth → access_token_C
```

- 1 `client_key` + 1 `client_secret` (configurados no .env)
- Cada cliente conecta sua conta TikTok via link de autorização
- Tokens armazenados por cliente no banco

---

## Autenticação (OAuth 2.0)

### Fluxo de Conexão

1. SM clica em "Conectar TikTok" na página do cliente
2. Redireciona para:
   ```
   https://www.tiktok.com/v2/auth/authorize/
     ?client_key={TIKTOK_CLIENT_KEY}
     &response_type=code
     &scope=video.publish,user.info.basic
     &redirect_uri={TIKTOK_REDIRECT_URI}
     &state={client_id}:{csrf_token}
   ```
3. Cliente loga no TikTok e autoriza
4. TikTok redireciona para nosso callback com `code`
5. Backend troca code por tokens:
   ```
   POST https://open.tiktokapis.com/v2/oauth/token/
   Content-Type: application/x-www-form-urlencoded

   client_key={key}
   &client_secret={secret}
   &code={code}
   &grant_type=authorization_code
   &redirect_uri={uri}
   ```
6. Resposta:
   ```json
   {
     "access_token": "...",
     "expires_in": 86400,
     "refresh_token": "...",
     "refresh_expires_in": 31536000,
     "open_id": "...",
     "scope": "video.publish,user.info.basic",
     "token_type": "Bearer"
   }
   ```
7. Salva tokens no banco vinculados ao cliente

### Tokens

| Token | Duração | Uso |
|-------|---------|-----|
| access_token | 24 horas | Chamadas à API |
| refresh_token | 365 dias | Renovar access_token |

### Refresh Automático

- Endpoint: `POST https://open.tiktokapis.com/v2/oauth/token/`
- Params: `grant_type=refresh_token`, `refresh_token`, `client_key`, `client_secret`
- O `refresh_token` retornado pode ser diferente do enviado (sempre atualizar no banco)
- Implementar via cron/BullMQ antes do access_token expirar (~23h)

### Revogação

```
POST https://open.tiktokapis.com/v2/oauth/revoke/
client_key, client_secret, token (access_token)
```

---

## Endpoints de Publicação

### Consultar Info do Criador

```
POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/
Authorization: Bearer {access_token}
```

Retorna: privacy options permitidas, capabilities do criador. Chamar antes de publicar para validar.

### Publicar Vídeo

```
POST https://open.tiktokapis.com/v2/post/publish/video/init/
Authorization: Bearer {access_token}
Content-Type: application/json; charset=UTF-8
```

**Modo PULL_FROM_URL** (TikTok puxa de URL verificada):
```json
{
  "post_info": {
    "title": "Legenda do vídeo #hashtag",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_comment": false,
    "disable_duet": false,
    "disable_stitch": false,
    "video_cover_timestamp_ms": 1000
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "https://nossodominio.com/media/video.mp4"
  }
}
```

**Modo FILE_UPLOAD** (upload chunked):
```json
{
  "post_info": { "..." },
  "source_info": {
    "source": "FILE_UPLOAD",
    "video_size": 52428800,
    "chunk_size": 10485760,
    "total_chunk_count": 5
  }
}
```

Resposta retorna `publish_id` + `upload_url` (expira em 1h).
Upload via PUT com headers `Content-Range: bytes {start}-{end}/{total}`.

### Publicar Fotos / Carrossel

```
POST https://open.tiktokapis.com/v2/post/publish/content/init/
Authorization: Bearer {access_token}
Content-Type: application/json; charset=UTF-8
```

```json
{
  "media_type": "PHOTO",
  "post_mode": "DIRECT_POST",
  "post_info": {
    "title": "Legenda do post",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_comment": false
  },
  "source_info": {
    "photo_images": [
      "https://nossodominio.com/media/img1.webp",
      "https://nossodominio.com/media/img2.webp",
      "https://nossodominio.com/media/img3.webp"
    ],
    "photo_cover_index": 0
  }
}
```

- Até **35 fotos** por carrossel
- URLs devem ser públicas e de domínio verificado
- `photo_cover_index`: índice (base 0) da foto de capa
- Título: máx 90 chars / Descrição: máx 4000 chars

### Verificar Status da Publicação

```
POST https://open.tiktokapis.com/v2/post/publish/status/fetch/
Authorization: Bearer {access_token}

{ "publish_id": "..." }
```

Publicação é assíncrona - precisa pollar este endpoint até o status ser final.

---

## Limites e Restrições

| Recurso | Limite |
|---------|--------|
| Rate limit | 6 req/min por token |
| Vídeo duração | até 300 segundos |
| Legenda vídeo | 2200 chars UTF-16 |
| Título foto | 90 chars UTF-16 |
| Descrição foto | 4000 chars UTF-16 |
| Fotos por carrossel | até 35 |
| Upload URL validade | 1 hora |
| Agendamento nativo | Não existe |

### App não auditado

Conteúdo publicado por apps sem audit fica **restrito a SELF_ONLY** (privado). Precisa passar pelo app review do TikTok para publicar conteúdo público.

---

## Comparação com Instagram (já implementado)

| Feature | Instagram | TikTok |
|---------|-----------|--------|
| Carrossel | 2-10 itens | até 35 fotos |
| Vídeo | Reels | Vídeos (até 300s) |
| Agendamento | Nativo na API | Não existe (implementar via BullMQ) |
| Upload | URL | URL verificada ou chunked upload |
| OAuth token | 60 dias | 24h (refresh 365 dias) |
| Legenda | 2200 chars | 2200 (vídeo) / 4000 (foto) |
| Post types | feed, reel, story, carousel | vídeo, foto/carrossel |

---

## Mudanças no Banco de Dados

### Tabela `clients` - novos campos

```sql
ALTER TABLE clients ADD COLUMN tiktok_access_token TEXT;
ALTER TABLE clients ADD COLUMN tiktok_refresh_token TEXT;
ALTER TABLE clients ADD COLUMN tiktok_token_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN tiktok_refresh_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN tiktok_open_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN tiktok_username VARCHAR(255);
```

### Tabela `scheduled_posts` - suporte a TikTok

O campo `platform` (ou novo campo) precisa suportar `tiktok` além de `instagram`. Os campos existentes (`media_urls`, `caption`, `post_type`, `scheduled_at`) já servem.

Campos adicionais potenciais:
- `tiktok_privacy_level` (ou usar default PUBLIC_TO_EVERYONE)
- `tiktok_publish_id` (para tracking de status)

---

## Estrutura de Arquivos (estimativa)

```
server/src/
  modules/
    tiktok/
      tiktok.routes.js          # Rotas OAuth + publicação
      tiktok.controller.js      # Controllers
      tiktok-oauth.service.js   # OAuth flow (auth, token, refresh, revoke)
      tiktok-publish.service.js # Publicação (vídeo, foto, carrossel, status)
  database/
    migrations/
      XXX_tiktok_integration.js # Migration novos campos

client/src/
  services/
    tiktok.js                   # API calls do frontend
  components/
    tiktok/
      TikTokConnectButton.jsx   # Botão conectar/desconectar
      TikTokPostPreview.jsx     # Preview de post TikTok
```

---

## Fluxo de Publicação (como vai funcionar)

1. SM cria/agenda post selecionando plataforma "TikTok"
2. No horário agendado, BullMQ job dispara
3. Backend consulta `creator_info` para validar capabilities
4. Se vídeo: usa PULL_FROM_URL (se domínio verificado) ou FILE_UPLOAD (chunked)
5. Se foto/carrossel: usa `/content/init/` com array de URLs
6. Recebe `publish_id`
7. Pollar `/status/fetch/` até status final
8. Atualiza `scheduled_posts.status` para `published` ou `failed`

---

## Pré-requisitos para Começar

1. [ ] Criar app no TikTok Developer Portal
2. [ ] Configurar redirect URI (ex: `https://api.ludus.com/tiktok/callback`)
3. [ ] Solicitar scopes: `video.publish`, `user.info.basic`
4. [ ] Submeter app para review/audit (necessário para posts públicos)
5. [ ] Verificar domínio para PULL_FROM_URL (se aplicável)
6. [ ] Adicionar `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET` no .env

---

## Erros Comuns da API

| Código | Erro | Significado |
|--------|------|-------------|
| 400 | `invalid_param` | Parâmetro inválido |
| 401 | `access_token_invalid` | Token expirado/inválido |
| 401 | `scope_not_authorized` | Scope não autorizado |
| 403 | `spam_risk_too_many_posts` | Quota diária excedida |
| 403 | `spam_risk_user_banned_from_posting` | Usuário banido |
| 403 | `reached_active_user_cap` | Limite de usuários ativos do app |
| 403 | `unaudited_client_can_only_post_to_private_accounts` | App sem audit |
| 403 | `url_ownership_unverified` | Domínio não verificado |
| 403 | `privacy_level_option_mismatch` | Privacy level inválido |
| 429 | `rate_limit_exceeded` | Rate limit |
