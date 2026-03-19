import api from './api';

// --- OAuth ---

export const getOAuthUrl = (clientId) =>
  api.get(`/instagram/oauth/url/${clientId}`).then((r) => r.data);

export const disconnectInstagram = (clientId) =>
  api.delete(`/instagram/oauth/${clientId}`).then((r) => r.data);

export const getConnectionStatus = (clientId) =>
  api.get(`/instagram/oauth/status/${clientId}`).then((r) => r.data);

// --- Scheduled Posts ---

export const listScheduledPosts = (params = {}) =>
  api.get('/instagram/scheduled', { params }).then((r) => r.data);

export const getScheduledPost = (id) =>
  api.get(`/instagram/scheduled/${id}`).then((r) => r.data);

export const createScheduledPost = (data) =>
  api.post('/instagram/scheduled', data).then((r) => r.data);

export const updateScheduledPost = (id, data) =>
  api.put(`/instagram/scheduled/${id}`, data).then((r) => r.data);

export const deleteScheduledPost = (id) =>
  api.delete(`/instagram/scheduled/${id}`).then((r) => r.data);

export const publishNow = (id) =>
  api.post(`/instagram/scheduled/${id}/publish-now`).then((r) => r.data);

// --- Calendar ---

export const getCalendarPosts = (clientId, month) =>
  api.get(`/instagram/calendar/${clientId}`, { params: { month } }).then((r) => r.data);
