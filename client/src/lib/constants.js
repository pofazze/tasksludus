// Content formats matching ClickUp "Formato" custom field
export const CONTENT_TYPE_LABELS = {
  reel: 'Reel',
  feed: 'Feed',
  story: 'Story',
  banner: 'Banner',
  caixinha: 'Caixinha',
  carrossel: 'Carrossel',
  analise: 'Análise',
  pdf: 'PDF',
  video: 'YouTube',
  mockup: 'Mockup',
  apresentacao: 'Apresentação',
  tiktok_video: 'Vídeo TikTok',
  tiktok_photo: 'Foto TikTok',
  yt_shorts: 'YouTube Shorts',
};

// Production pipeline statuses matching ClickUp workflow
export const PIPELINE_STATUSES = {
  planejamento: 'Planejamento',
  captacao: 'Captação',
  estruturacao: 'Estruturação',
  edicao_de_video: 'Edição de Vídeo',
  em_producao_video: 'Em Produção - Vídeo',
  design: 'Design',
  em_producao_design: 'Em Produção - Design',
  correcao: 'Correção',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  agendado: 'Agendado',
  publicado: 'Publicado',
};

// Status colors — light/dark dual mode
export const PIPELINE_STATUS_COLORS = {
  planejamento: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-400',
  captacao: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  estruturacao: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
  edicao_de_video: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  em_producao_video: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  design: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  em_producao_design: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  correcao: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  aprovacao: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400',
  agendamento: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  agendado: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  publicado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
};

// Pipeline order for sorting and display
export const PIPELINE_ORDER = [
  'planejamento', 'captacao', 'estruturacao', 'edicao_de_video',
  'em_producao_video', 'design', 'em_producao_design', 'correcao', 'aprovacao', 'agendamento', 'agendado', 'publicado',
];

export const DIFFICULTY_LABELS = {
  easy: 'Fácil',
  medium: 'Média',
  hard: 'Difícil',
};

// Legacy status labels (kept for backward compat)
export const STATUS_LABELS = {
  in_progress: 'Em progresso',
  completed: 'Concluída',
  ...PIPELINE_STATUSES,
};

export const ROLE_LABELS = {
  dev: 'Dev',
  ceo: 'CEO',
  director: 'Diretor',
  manager: 'Gerente',
  account_manager: 'Atendimento',
  producer: 'Produtor',
  client: 'Cliente',
};

export const PRODUCER_TYPE_LABELS = {
  video_editor: 'Editor de Vídeo',
  designer: 'Designer',
  captation: 'Captação',
  social_media: 'Social Media',
};

// ClickUp role mapping
export const CLICKUP_ROLE_LABELS = {
  1: 'Owner',
  2: 'Admin',
  3: 'Member',
  4: 'Guest',
};

export const APPROVAL_STATUS_LABELS = {
  sm_pending: 'Aguardando Social Media',
  sm_approved: 'Aprovado (SM)',
  client_pending: 'Aguardando Cliente',
  client_approved: 'Aprovado',
  client_rejected: 'Reprovado',
};

export const APPROVAL_STATUS_COLORS = {
  sm_pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  sm_approved: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  client_pending: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  client_approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  client_rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};
