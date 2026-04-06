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
  video: 'Vídeo',
  mockup: 'Mockup',
  apresentacao: 'Apresentação',
};

// Production pipeline statuses matching ClickUp workflow
export const PIPELINE_STATUSES = {
  triagem: 'Triagem',
  planejamento: 'Planejamento',
  captacao: 'Captação',
  edicao_de_video: 'Edição de Vídeo',
  estruturacao: 'Estruturação',
  design: 'Design',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  agendado: 'Agendado',
  publicacao: 'Publicação',
};

// Status colors — dark theme compatible
export const PIPELINE_STATUS_COLORS = {
  triagem: 'bg-orange-500/15 text-orange-400',
  planejamento: 'bg-zinc-500/15 text-zinc-400',
  captacao: 'bg-sky-500/15 text-sky-400',
  edicao_de_video: 'bg-violet-500/15 text-violet-400',
  estruturacao: 'bg-yellow-500/15 text-yellow-400',
  design: 'bg-blue-500/15 text-blue-400',
  aprovacao: 'bg-pink-500/15 text-pink-400',
  agendamento: 'bg-amber-500/15 text-amber-400',
  agendado: 'bg-teal-500/15 text-teal-400',
  publicacao: 'bg-emerald-500/15 text-emerald-400',
};

// Pipeline order for sorting and display
export const PIPELINE_ORDER = [
  'triagem', 'planejamento', 'captacao', 'edicao_de_video',
  'estruturacao', 'design', 'aprovacao', 'agendamento', 'agendado', 'publicacao',
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
  sm_pending: 'bg-amber-500/15 text-amber-400',
  sm_approved: 'bg-blue-500/15 text-blue-400',
  client_pending: 'bg-purple-500/15 text-purple-400',
  client_approved: 'bg-emerald-500/15 text-emerald-400',
  client_rejected: 'bg-red-500/15 text-red-400',
};
