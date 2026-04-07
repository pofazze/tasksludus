import api from './api';

export const listSmPending = () =>
  api.get('/approvals/pending').then((r) => r.data);

export const listByClient = (clientId) =>
  api.get(`/approvals/client/${clientId}`).then((r) => r.data);

export const smApprove = (data) =>
  api.post('/approvals/sm-approve', data).then((r) => r.data);

export const sendToClient = (data) =>
  api.post('/approvals/send-to-client', data).then((r) => r.data);

export const listRejected = (clientId) =>
  api.get(`/approvals/rejected/${clientId}`).then((r) => r.data);

export const listBatches = (clientId) =>
  api.get(`/approvals/batches/${clientId}`).then((r) => r.data);

export const revokeBatch = (batchId) =>
  api.post(`/approvals/batches/${batchId}/revoke`).then((r) => r.data);

export const listWhatsAppGroups = () =>
  api.get('/approvals/whatsapp-groups').then((r) => r.data);

export const getPublicBatch = (token) =>
  api.get(`/approvals/public/${token}`).then((r) => r.data);

export const clientRespond = (token, itemId, data) =>
  api.post(`/approvals/public/${token}/items/${itemId}/respond`, data).then((r) => r.data);
