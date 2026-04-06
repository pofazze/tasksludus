# Sistema de Aprovacao em Dois Niveis com Integracao Evolution API

**Data:** 2026-04-06
**Status:** Aprovado

## Visao Geral

Sistema de aprovacao de publicacoes em dois niveis (social media → cliente) integrado ao fluxo ClickUp existente. O social media revisa o trabalho dos produtores (designer/editor), prepara o conteudo (ordena midias, edita legenda, seleciona capa de reel), e envia para aprovacao do cliente via link publico temporario no WhatsApp (Evolution API). O cliente aprova ou reprova cada publicacao individualmente numa pagina mobile-first que simula o layout do Instagram.

## Modelo de Dados

### Novas tabelas

#### `approval_batches`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID PK | |
| token | UUID UNIQUE | Token publico do link |
| client_id | FK → clients | Cliente que aprova |
| created_by | FK → users | Social media que criou |
| status | enum | `pending`, `completed`, `revoked` |
| created_at | timestamp | |
| completed_at | timestamp | Quando todas foram respondidas |
| revoked_at | timestamp | Quando revogado pelo social media |

#### `approval_items`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID PK | |
| batch_id | FK → approval_batches | |
| delivery_id | FK → deliveries | Task sendo aprovada |
| caption | text | Legenda preparada pelo social media |
| media_urls | JSONB | Midias ordenadas (mesmo formato do scheduled_posts) |
| thumbnail_url | text | Capa do reel |
| post_type | text | reel, feed, carrossel, story |
| status | enum | `pending`, `approved`, `rejected` |
| rejection_reason | text | Motivo da reprovacao (preenchido pelo cliente) |
| responded_at | timestamp | |
| created_at | timestamp | |

### Alteracoes em tabelas existentes

#### `clients` -- adicionar:

- `social_media_id` (FK → users, nullable) -- social media responsavel pelo cliente
- `whatsapp` (varchar 20, nullable) -- numero pessoal do cliente (formato: `5511999999999`)
- `whatsapp_group` (varchar 50, nullable) -- remoteJid do grupo de producao (formato: `120363...@g.us`)

#### `users` -- adicionar:

- `evolution_instance_url` (text, nullable, criptografado AES-256-GCM) -- para uso futuro
- `evolution_api_key` (text, nullable, criptografado AES-256-GCM) -- para uso futuro

#### `deliveries` -- adicionar:

- `approval_status` (varchar, nullable) -- status interno de aprovacao

### Status interno de aprovacao (`approval_status`)

```
null → sm_pending → sm_approved → client_pending → client_approved / client_rejected
```

| Status | Significado |
|--------|-------------|
| `null` | Ainda nao chegou em aprovacao |
| `sm_pending` | Aguardando aprovacao do social media |
| `sm_approved` | Social media aprovou, pronto para enviar ao cliente |
| `client_pending` | Enviado para o cliente, aguardando resposta |
| `client_approved` | Cliente aprovou |
| `client_rejected` | Cliente reprovou |

## Fluxo de Aprovacao

### Etapa 1: Social Media

1. Task chega em "aprovacao" no ClickUp
2. Webhook auto-assign para o social media do cliente (via `clients.social_media_id`)
3. `approval_status` = `sm_pending`
4. Social media acessa a task no TasksLudus
5. Revisa conteudo: ve/edita legenda, remove midias, ordena carrossel (drag-and-drop), seleciona capa de reel
6. Midias vem do ClickUp (attachments da task)
7. Social media clica "Aprovar" → `approval_status` = `sm_approved`

### Etapa 2: Envio para Cliente

1. Social media seleciona uma ou mais tasks com `approval_status` = `sm_approved`
2. Clica "Enviar para aprovacao do cliente"
3. Sistema verifica se ja existe um `approval_batch` com status `pending` para aquele cliente
   - Se existe: adiciona novos `approval_items` ao batch existente (mesmo link) e reenvia mensagem no WhatsApp informando que ha novas publicacoes
   - Se nao existe: cria novo `approval_batch` com token UUID
4. Cria `approval_item` para cada task (copiando midias, legenda, capa, tipo)
5. `approval_status` de cada delivery = `client_pending`
6. Envia mensagem via Evolution API para o `whatsapp_group` do cliente
7. Cria job BullMQ repeatable de lembrete a cada 24h (se nao existir)

### Etapa 3: Aprovacao do Cliente

1. Cliente abre link publico `/aprovacao/:token`
2. Ve lista vertical de publicacoes simulando layout Instagram
3. Para cada publicacao, pode aprovar ou reprovar
4. Se reprovar: escreve motivo obrigatorio
5. Cada publicacao e independente -- ao responder, segue seu caminho imediatamente:
   - **Aprovada:** `approval_status` = `client_approved`, move para "agendamento" no ClickUp
   - **Reprovada:** `approval_status` = `client_rejected`, move para "correcao" no ClickUp, notifica social media via WhatsApp com o motivo
6. Quando todas as publicacoes do batch sao respondidas: batch status = `completed`, cancela job de lembrete

### Ciclo de Correcao

Quando uma task volta de "correcao" para "aprovacao" no ClickUp, o ciclo recomeça: `approval_status` volta para `sm_pending`.

## Pagina Publica de Aprovacao (Mobile-first)

### Rota e acesso

- URL: `/aprovacao/:token`
- Sem login, sem autenticacao
- Token UUID valida contra `approval_batches`
- Se token invalido/revogado: tela de erro amigavel

### Layout

**Header:**
- Logo Ludus
- Nome do cliente
- Contador: "3 de 5 publicacoes respondidas"

**Lista vertical (scroll):**
Cada publicacao simula o layout do Instagram:
- Foto de perfil + nome da conta Instagram do cliente (de `clients.instagram_account`)
- Midia principal (imagem, video com player, ou carrossel com swipe/dots)
- Legenda com "ver mais" se longa
- Badge do tipo do post (Feed, Reel, Story, Carrossel)
- Data prevista de publicacao (se houver)

**Acoes por publicacao:**
- Botao verde "Aprovar"
- Botao vermelho "Reprovar"
- Se reprovar: abre textarea para motivo (obrigatorio)
- Apos responder: badge de status (aprovado/reprovado) e botoes desabilitados

**Quando todas respondidas:**
- Mensagem de agradecimento
- Batch completo

**Responsividade:**
- Mobile-first: botoes grandes, touch-friendly, scroll suave
- Desktop: largura maxima ~480px centralizado (simulando celular)

## Integracao Evolution API

### Configuracao

**`.env` (instancia geral da plataforma):**
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`

**Banco (por social media, para uso futuro):**
- `users.evolution_instance_url` (criptografado AES-256-GCM)
- `users.evolution_api_key` (criptografado AES-256-GCM)

Nesta feature, todas as mensagens saem pela instancia geral.

### Mensagens

**1. Envio inicial (grupo de producao):**

> Ola! As publicacoes de *[nome do cliente]* estao prontas para aprovacao.
> Acesse o link para revisar e aprovar: [link]
>
> *[quantidade] publicacoes aguardando aprovacao.*

**2. Lembrete <=24h (grupo de producao):**

> Lembrete: ainda ha publicacoes de *[nome do cliente]* aguardando aprovacao.
> [X] de [Y] publicacoes pendentes.
> Acesse: [link]

**3. Lembrete >24h (WhatsApp pessoal do cliente):**

> Ola *[nome do cliente]*! Suas publicacoes ainda aguardam aprovacao.
> [X] de [Y] publicacoes pendentes.
> Acesse: [link]

**4. Notificacao de reprovacao (WhatsApp pessoal do social media):**

> *[nome do cliente]* reprovou uma publicacao:
> *Titulo:* [titulo da delivery]
> *Motivo:* [motivo escrito pelo cliente]
>
> Acesse a plataforma para revisar.

### Instancia de envio

| Mensagem | Destino | Instancia |
|----------|---------|-----------|
| Envio inicial | Grupo de producao do cliente | Geral |
| Lembrete <=24h | Grupo de producao do cliente | Geral |
| Lembrete >24h | WhatsApp pessoal do cliente | Geral |
| Reprovacao | WhatsApp pessoal do social media | Geral |

### Selecao de grupo de producao

No cadastro/edicao do cliente:
1. Sistema chama Evolution API (instancia geral) para listar grupos do numero da empresa
2. Mostra dropdown com nomes dos grupos
3. Social media seleciona o grupo correto
4. Salva o `remoteJid` no campo `whatsapp_group`

## BullMQ Jobs

- **`approval-reminder`**: repeatable a cada 24h por batch. Verifica se batch ainda e `pending`. Conta quantos items pendentes. Envia para grupo (<=24h desde criacao) ou pessoal (>24h). Cancela quando batch `completed` ou `revoked`.
- **`approval-notification`**: job unico disparado quando cliente reprova. Envia motivo para WhatsApp pessoal do social media.

## Alteracao no Auto-Assign

**Arquivo:** `server/src/modules/webhooks/automations/auto-assign.js`

**Antes:**
```javascript
'aprovacao': '61001382', // Wander Fran
```

**Depois:**
Buscar `clients.social_media_id` do cliente associado a delivery, resolver o `clickup_id` do social media, e atribuir no ClickUp.

## Interface no TasksLudus

### Pagina `/aprovacoes` (visao geral)

Lista todas as aprovacoes pendentes do social media logado:
- Filtro por cliente
- Status de cada delivery (sm_pending, sm_approved, client_pending, etc.)
- Acoes rapidas (aprovar, enviar para cliente)
- Link para revogar batches ativos

### Tab no cliente `/clients/:id`

Tab "Aprovacao" ao lado das tabs existentes:
- Tasks pendentes de aprovacao do social media
- Interface de preparacao (legenda, midias, ordenacao, capa)
- Botao aprovar
- Selecao e envio para cliente
- Historico de batches enviados

Ambas reutilizam componentes existentes: `SortableMediaGrid`, `CarouselPreview`, `VideoFrameSelector`.

## Seguranca

- UUID v4 (122 bits de entropia) no token do link
- Rate limiting na API publica
- Token funciona somente enquanto batch esta `pending`
- Revogacao pelo social media a qualquer momento
- Sem dados sensiveis expostos (apenas conteudo das publicacoes)
- Campos Evolution API criptografados com AES-256-GCM no banco

## Edge Cases

| Cenario | Comportamento |
|---------|--------------|
| Link revogado | Tela: "Este link nao esta mais disponivel" |
| Link completo | Mostra publicacoes com status final (read-only) |
| Novo envio com batch pendente existente | Adiciona items ao batch existente, mesmo link |
| Task volta de "correcao" para "aprovacao" | Novo ciclo, `approval_status` = `sm_pending` |
| Apos responder | Final, nao pode mudar. Novo batch apos correcao |
| Social media remove item pendente | Permitido enquanto item `pending` |
| WhatsApp pessoal do cliente nao cadastrado | Lembretes >24h falham silenciosamente, so vai no grupo |
| Grupo de producao nao cadastrado | Erro -- social media avisado para cadastrar o grupo |
