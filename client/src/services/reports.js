import api from './api';

function qs(params) {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return cleaned;
}

export const reportsApi = {
  firstApprovalRate: (params) => api.get('/reports/quality/first-approval-rate', { params: qs(params) }).then((r) => r.data),
  rejectionRate: (params) => api.get('/reports/quality/rejection-rate', { params: qs(params) }).then((r) => r.data),
  reworkPerTask: (params) => api.get('/reports/quality/rework-per-task', { params: qs(params) }).then((r) => r.data),
  rejectionByCategory: (params) => api.get('/reports/quality/rejection-by-category', { params: qs(params) }).then((r) => r.data),
  rejectionByPostType: (params) => api.get('/reports/quality/rejection-by-post-type', { params: qs(params) }).then((r) => r.data),
  rejectionByTarget: (params) => api.get('/reports/quality/rejection-by-target', { params: qs(params) }).then((r) => r.data),
  ranking: (params) => api.get('/reports/quality/ranking', { params: qs(params) }).then((r) => r.data),
  volumeTimeseries: (params) => api.get('/reports/quality/volume-timeseries', { params: qs(params) }).then((r) => r.data),
  activeTasks: (params) => api.get('/reports/capacity/active-tasks', { params: qs(params) }).then((r) => r.data),
  avgPhaseDuration: (params) => api.get('/reports/capacity/avg-phase-duration', { params: qs(params) }).then((r) => r.data),
  totalHours: (params) => api.get('/reports/capacity/total-hours', { params: qs(params) }).then((r) => r.data),
  overdue: (params) => api.get('/reports/capacity/overdue', { params: qs(params) }).then((r) => r.data),
  phaseDistribution: (params) => api.get('/reports/capacity/phase-distribution', { params: qs(params) }).then((r) => r.data),
  weeklyHeatmap: (params) => api.get('/reports/capacity/weekly-heatmap', { params: qs(params) }).then((r) => r.data),
  avgWorkTimeseries: (params) => api.get('/reports/capacity/avg-work-timeseries', { params: qs(params) }).then((r) => r.data),
  clientSummary: (clientId, params) => api.get(`/reports/client/${clientId}/summary`, { params: qs(params) }).then((r) => r.data),
  publishedList: (clientId, params) => api.get(`/reports/client/${clientId}/published-list`, { params: qs(params) }).then((r) => r.data),
  clientFirstApprovalRate: (clientId, params) => api.get(`/reports/client/${clientId}/first-approval-rate`, { params: qs(params) }).then((r) => r.data),
  clientRejectionVolume: (clientId, params) => api.get(`/reports/client/${clientId}/rejection-volume`, { params: qs(params) }).then((r) => r.data),
  clientAvgCycleTime: (clientId, params) => api.get(`/reports/client/${clientId}/avg-cycle-time`, { params: qs(params) }).then((r) => r.data),
  clientResponsibilityHistory: (clientId, params) => api.get(`/reports/client/${clientId}/responsibility-history`, { params: qs(params) }).then((r) => r.data),
  publishedListCsvUrl: (clientId, params) => {
    const search = new URLSearchParams(qs(params)).toString();
    return `/api/reports/client/${clientId}/published-list.csv${search ? `?${search}` : ''}`;
  },
};
