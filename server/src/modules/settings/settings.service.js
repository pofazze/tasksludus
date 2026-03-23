const db = require('../../config/db');
const env = require('../../config/env');

class SettingsService {
  async listSettings() {
    return db('app_settings').orderBy('key');
  }

  async getSetting(key) {
    const setting = await db('app_settings').where({ key }).first();
    if (!setting) {
      throw Object.assign(new Error('Setting not found'), { status: 404 });
    }
    return setting;
  }

  async updateSetting(key, value, updatedBy) {
    const existing = await db('app_settings').where({ key }).first();
    if (existing) {
      const [updated] = await db('app_settings')
        .where({ key })
        .update({
          value: JSON.stringify(value),
          updated_by: updatedBy,
          updated_at: new Date(),
        })
        .returning('*');
      return updated;
    }
    const [created] = await db('app_settings')
      .insert({
        key,
        value: JSON.stringify(value),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .returning('*');
    return created;
  }

  async listIntegrations() {
    return db('integrations').orderBy('type');
  }

  async updateIntegration(id, config, isActive) {
    const updateData = { updated_at: new Date() };
    if (config !== undefined) updateData.config = JSON.stringify(config);
    if (isActive !== undefined) updateData.is_active = isActive;

    const [updated] = await db('integrations')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Integration not found'), { status: 404 });
    }
    return updated;
  }
  async testClickUp() {
    const token = env.clickup.apiToken;
    if (!token) {
      return { connected: false, error: 'CLICKUP_API_TOKEN não configurado no .env' };
    }
    try {
      const res = await fetch('https://api.clickup.com/api/v2/user', {
        headers: { Authorization: token },
      });
      if (!res.ok) {
        return { connected: false, error: `ClickUp retornou ${res.status}` };
      }
      const data = await res.json();
      await db('integrations').where({ type: 'clickup' }).update({ last_sync_at: new Date() });
      return { connected: true, user: data.user?.username, email: data.user?.email };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async testInstagram(accessToken) {
    const integration = await db('integrations').where({ type: 'instagram' }).first();
    const token = accessToken || integration?.config?.access_token || env.instagram.accessToken;
    if (!token) {
      return { connected: false, error: 'Token não configurado' };
    }
    try {
      const res = await fetch(`https://graph.instagram.com/v25.0/me?fields=id,username&access_token=${token}`);
      if (!res.ok) {
        return { connected: false, error: `Instagram retornou ${res.status}` };
      }
      const data = await res.json();
      await db('integrations').where({ type: 'instagram' }).update({ last_sync_at: new Date() });
      return { connected: true, username: data.username, id: data.id };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async getIntegrationByType(type) {
    return db('integrations').where({ type }).first();
  }
}

module.exports = new SettingsService();
