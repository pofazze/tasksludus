# Scheduling UI Improvements — Design Doc

**Date:** 2026-04-02
**Status:** Approved

## 1. UI do Sidebar (PostReviewSheet)

### 1.1 Sidebar Redimensionável
- Drag handle na borda esquerda do SheetContent
- Largura salva em localStorage
- Min: 380px, Max: 70vw, Default: 480px

### 1.2 Miniaturas Maiores + Nome da Mídia
- Thumbnails: w-9 h-9 (36px) → w-16 h-16 (64px)
- Exibir filename extraído da URL abaixo do badge de tipo
- Vídeos: thumbnail com ícone de play overlay

### 1.3 Preview ao Clicar na Mídia
- Popover/floating panel ao lado da mídia (não modal centralizado)
- Imagem ~400px ou player de vídeo
- Fecha ao clicar fora ou X

### 1.4 Adicionar Mais Mídias
- Botão "+ Adicionar mídia" abaixo da lista
- URL: input para colar URL (Google Drive, ClickUp, direto)
- Upload: file input para upload local → temp no servidor

### 1.5 Seleção de Capa do Reel
Redesenhar seção de capa com 3 opções:
- Selecionar das imagens do post (grid de thumbnails)
- Upload de capa (file input)
- Selecionar frame do vídeo (player + slider + canvas extraction no browser)

## 2. UI da Aba Agendamento

### 2.1 Tabs Horizontais
- Trocar seções colapsáveis por tabs: Pendentes | Agendados | Publicados
- Count como badge em cada tab
- Conteúdo muda ao clicar

### 2.2 DatePicker como Overlay
- Trocar dropdown (absolute top-full) por overlay centralizado (fixed, centered)
- Backdrop semi-transparente
- Mesmo visual interno do calendário + time picker

## 3. Bugs

### 3.1 Timezone (12h → 9h)
- Causa: DateTimePicker emite string sem timezone, browser interpreta como UTC
- Fix: Anexar -03:00 (Brasília) ao emitir. Servidor armazena com timezone. Exibir com timezone explícito.

### 3.2 Catbox 429 (carousel)
- Causa: uploads simultâneos → rate limit
- Fix: retry com exponential backoff (3 tentativas, 2s/4s/8s)
- Serializar uploads (sequencial, não Promise.all)
- Fallback: servir via /api/instagram/temp-media/:token (tempMediaStore já existe)

## 4. Automação Editor de Vídeo

### 4.1 Mapping por Folder ClickUp
- Folder 90117692608 (Ludus Health) → Victor Costa (152562683)
- Folder 90117692609 (Ludus Experts) → Filipe Sabino (284598399)
- Verificar task.folder.id no auto-assign para "edição de vídeo"
- Demais fases continuam com mapping atual

## Arquivos Impactados

### Client
- `client/src/components/instagram/PostReviewSheet.jsx` — resizable, media names, thumbnails, preview, add media, cover selector
- `client/src/components/instagram/AgendamentoTab.jsx` — tabs
- `client/src/components/ui/date-time-picker.jsx` — overlay mode
- `client/src/components/ui/sheet.jsx` — resizable support
- Novos: `VideoFrameSelector.jsx`, `MediaPreviewPopover.jsx`

### Server
- `server/src/modules/instagram/instagram-publish.service.js` — catbox retry/fallback, serialize uploads
- `server/src/modules/instagram/instagram.controller.js` — media upload endpoint
- `server/src/modules/instagram/instagram.routes.js` — new upload route
- `server/src/modules/webhooks/automations/auto-assign.js` — folder-based video editor mapping
