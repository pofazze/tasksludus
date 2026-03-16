const db = require('../../config/db');

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
    const [updated] = await db('app_settings')
      .where({ key })
      .update({
        value: JSON.stringify(value),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Setting not found'), { status: 404 });
    }
    return updated;
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
}

module.exports = new SettingsService();
