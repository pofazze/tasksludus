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
};
