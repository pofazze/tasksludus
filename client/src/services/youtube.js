import api from './api';

export const getYouTubeOAuthUrl = (clientId) =>
  api.get(`/youtube/oauth/url/${clientId}`).then((r) => r.data);

export const getYouTubeConnectionStatus = (clientId) =>
  api.get(`/youtube/oauth/status/${clientId}`).then((r) => r.data);

export const disconnectYouTube = (clientId) =>
  api.delete(`/youtube/oauth/${clientId}`).then((r) => r.data);
