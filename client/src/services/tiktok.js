import api from './api';

export const getOAuthUrl = (clientId) =>
  api.get(`/tiktok/oauth/url/${clientId}`).then((r) => r.data);

export const getConnectionStatus = (clientId) =>
  api.get(`/tiktok/oauth/status/${clientId}`).then((r) => r.data);

export const disconnectTikTok = (clientId) =>
  api.delete(`/tiktok/oauth/${clientId}`).then((r) => r.data);
