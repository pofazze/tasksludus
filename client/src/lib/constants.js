// Content formats matching ClickUp "Formato" custom field
export const CONTENT_TYPE_LABELS = {
  reel: 'Reel',
  feed: 'Feed',
  story: 'Story',
  cortes: 'Cortes',
  banner: 'Banner',
  caixinha: 'Caixinha',
  carrossel: 'Carrossel',
  corte: 'Corte',
  foto_com_frase: 'Foto com Frase',
  analise: 'Análise',
  video_com_frase: 'Vídeo com Frase',
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
  publicacao: 'Publicação',
};

// Status colors matching ClickUp
export const PIPELINE_STATUS_COLORS = {
  triagem: 'bg-orange-100 text-orange-800',
  planejamento: 'bg-gray-100 text-gray-800',
  captacao: 'bg-sky-100 text-sky-800',
  edicao_de_video: 'bg-violet-100 text-violet-800',
  estruturacao: 'bg-yellow-100 text-yellow-800',
  design: 'bg-blue-100 text-blue-800',
  aprovacao: 'bg-pink-100 text-pink-800',
  agendamento: 'bg-amber-100 text-amber-800',
  publicacao: 'bg-green-100 text-green-800',
};

// Pipeline order for sorting and display
export const PIPELINE_ORDER = [
  'triagem', 'planejamento', 'captacao', 'edicao_de_video',
  'estruturacao', 'design', 'aprovacao', 'agendamento', 'publicacao',
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
