const env = require('../../config/env');
const logger = require('../../utils/logger');

class EvolutionService {
  constructor() {
    this.baseUrl = null;
    this.apiKey = null;
  }

  _init() {
    if (!this.baseUrl) {
      this.baseUrl = env.evolution.apiUrl?.replace(/\/$/, '');
      this.apiKey = env.evolution.apiKey;
    }
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  /**
   * Send a text message via Evolution API
   * @param {string} remoteJid - Recipient JID (e.g. 5511999999999@s.whatsapp.net or 120363...@g.us)
   * @param {string} text - Message text
   */
  async sendText(remoteJid, text) {
    this._init();
    if (!this.baseUrl || !this.apiKey) {
      logger.warn('Evolution API not configured, skipping message send');
      return null;
    }

    const instanceName = this._getInstanceName();
    const url = `${this.baseUrl}/message/sendText/${instanceName}`;
    const body = { number: remoteJid, text };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        logger.error('Evolution API sendText failed', { status: res.status, error: err, remoteJid });
        return null;
      }

      const data = await res.json();
      logger.info('Evolution API message sent', { remoteJid });
      return data;
    } catch (err) {
      logger.error('Evolution API sendText error', { error: err.message, remoteJid });
      return null;
    }
  }

  /**
   * List all groups the instance is part of
   * @returns {Array<{ id: string, subject: string }>} groups
   */
  async listGroups() {
    this._init();
    if (!this.baseUrl || !this.apiKey) {
      logger.warn('Evolution API not configured');
      return [];
    }

    const instanceName = this._getInstanceName();
    const url = `${this.baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this._headers(),
      });

      if (!res.ok) {
        const err = await res.text();
        logger.error('Evolution API listGroups failed', { status: res.status, error: err });
        return [];
      }

      const data = await res.json();
      return (data || []).map((g) => ({
        id: g.id,
        subject: g.subject,
      }));
    } catch (err) {
      logger.error('Evolution API listGroups error', { error: err.message });
      return [];
    }
  }

  /**
   * Build WhatsApp JID from phone number
   * @param {string} phone - Phone number (e.g. 5511999999999)
   * @returns {string} JID (e.g. 5511999999999@s.whatsapp.net)
   */
  buildPersonalJid(phone) {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
  }

  _getInstanceName() {
    return process.env.EVOLUTION_INSTANCE_NAME || 'tasksludus';
  }
}

module.exports = new EvolutionService();
