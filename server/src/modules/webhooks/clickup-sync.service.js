const db = require('../../config/db');
const logger = require('../../utils/logger');
const clickupService = require('./clickup.service');
const { extractPlatformsFromTags } = require('./clickup.service');
const clickupOAuth = require('./clickup-oauth.service');

const TEAM_ID = '9011736576';
const MARKETING_SPACE_ID = '90114084559';
const API_BASE = 'https://api.clickup.com/api/v2';

class ClickUpSyncService {
  async fetchJson(url) {
    const token = await clickupOAuth.getDecryptedToken();
    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) {
      throw new Error(`ClickUp API ${res.status}: ${url}`);
    }
    return res.json();
  }

  /**
   * Full sync: members → clients → deliveries
   */
  async fullSync() {
    logger.info('ClickUp full sync started');
    const stats = {
      members: { created: 0, updated: 0 },
      clients: { created: 0, updated: 0 },
      deliveries: { created: 0, updated: 0, skipped: 0, total: 0 },
    };

    // 1) Sync team members → users
    await this.syncMembers(stats);

    // 2) Sync spaces/folders/lists → clients
    const lists = await this.syncClients(stats);

    // 3) Sync tasks from each list → deliveries
    for (const list of lists) {
      await this.syncTasks(list.id, list.clientId, stats);
    }

    logger.info('ClickUp full sync complete', stats);
    return stats;
  }

  /**
   * Sync workspace members → users table
   */
  async syncMembers(stats) {
    const data = await this.fetchJson(`${API_BASE}/team/${TEAM_ID}`);
    const members = data.team?.members || [];

    for (const member of members) {
      const cu = member.user;
      const clickupId = String(cu.id);

      // Try match by clickup_id first, then email
      let user = await db('users').where({ clickup_id: clickupId }).first();
      if (!user) {
        user = await db('users').where({ email: cu.email }).first();
      }

      if (user) {
        // Update clickup_id and avatar if missing
        const updates = {};
        if (!user.clickup_id) updates.clickup_id = clickupId;
        if (!user.avatar_url && cu.profilePicture) updates.avatar_url = cu.profilePicture;
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          await db('users').where({ id: user.id }).update(updates);
          stats.members.updated++;
        }
      } else {
        // Create new user (no password — needs invite to set one)
        await db('users').insert({
          name: cu.username,
          email: cu.email,
          clickup_id: clickupId,
          avatar_url: cu.profilePicture || null,
          role: cu.role === 1 ? 'ceo' : cu.role === 2 ? 'director' : 'producer',
          is_active: true,
          auto_calc_enabled: true,
        });
        stats.members.created++;
        logger.info(`Created user from ClickUp: ${cu.username} (${cu.email})`);
      }
    }
  }

  /**
   * Sync Marketing space folders/lists → clients table
   * Returns list of { id, name, clientId } for task sync
   */
  async syncClients(stats) {
    const foldersData = await this.fetchJson(`${API_BASE}/space/${MARKETING_SPACE_ID}/folder`);
    const folders = foldersData.folders || [];
    const syncedLists = [];

    for (const folder of folders) {
      for (const list of folder.lists || []) {
        // Skip global view lists
        if (list.name.toLowerCase().includes('todas as tasks')) continue;

        const listId = String(list.id);
        const clientName = list.name;
        const company = folder.name; // "Ludus Health" or "Ludus Experts"

        // Match client by clickup_list_id first, then by name (case-insensitive)
        let client = await db('clients').where({ clickup_list_id: listId }).first();
        if (!client) {
          client = await db('clients')
            .whereRaw('LOWER(name) = ?', [clientName.toLowerCase()])
            .first();
        }

        if (client) {
          const updates = {};
          if (!client.clickup_list_id) updates.clickup_list_id = listId;
          if (!client.company && company) updates.company = company;
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date();
            await db('clients').where({ id: client.id }).update(updates);
            stats.clients.updated++;
          }
          syncedLists.push({ id: listId, name: clientName, clientId: client.id });
        } else {
          const [newClient] = await db('clients')
            .insert({
              name: clientName,
              company,
              clickup_list_id: listId,
              is_active: true,
            })
            .returning('*');
          stats.clients.created++;
          syncedLists.push({ id: listId, name: clientName, clientId: newClient.id });
          logger.info(`Created client from ClickUp: ${clientName} (${company})`);
        }
      }
    }

    return syncedLists;
  }

  /**
   * Sync all tasks from a ClickUp list → deliveries table
   */
  async syncTasks(listId, clientId, stats) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await this.fetchJson(
        `${API_BASE}/list/${listId}/task?page=${page}&subtasks=true&include_closed=true`
      );
      const tasks = data.tasks || [];

      for (const task of tasks) {
        await this.syncSingleTask(task, clientId, stats);
      }

      stats.deliveries.total += tasks.length;
      hasMore = !data.last_page && tasks.length > 0;
      page++;
    }
  }

  /**
   * Sync a single ClickUp task → delivery record
   */
  async syncSingleTask(task, clientId, stats) {
    const clickupTaskId = task.id;

    // Find assignee (first assignee)
    let userId = null;
    if (task.assignees?.length > 0) {
      const clickupUserId = String(task.assignees[0].id);
      const user = await db('users').where({ clickup_id: clickupUserId }).first();
      userId = user?.id || null;
    }

    // Extract content_type from Formato custom field (null when not set — user selects in app)
    let contentType = null;
    const formatoField = task.custom_fields?.find((cf) => cf.name === 'Formato');
    if (formatoField?.value != null && formatoField.type_config?.options) {
      const option = formatoField.type_config.options[formatoField.value];
      if (option) {
        contentType = clickupService.mapContentType(option.name);
      }
    }

    // Map status
    const status = clickupService.mapClickUpStatus(task.status?.status) || 'planejamento';

    // Extract month from Entrega date field or date_created
    const entregaField = task.custom_fields?.find((cf) => cf.name?.includes('Entrega'));
    let month;
    if (entregaField?.value) {
      const d = new Date(Number(entregaField.value));
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (task.date_created) {
      const d = new Date(Number(task.date_created));
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // Completed at
    const completedAt = (status === 'publicacao') ? new Date() : null;

    // Started at from date_created
    const startedAt = task.date_created ? new Date(Number(task.date_created)) : null;

    // Check if delivery exists
    const existing = await db('deliveries').where({ clickup_task_id: clickupTaskId }).first();

    if (existing) {
      // Update with latest data from ClickUp
      const updates = {
        title: task.name,
        status,
        content_type: contentType,
        updated_at: new Date(),
      };
      if (userId) updates.user_id = userId;
      if (completedAt && !existing.completed_at) updates.completed_at = completedAt;

      await db('deliveries').where({ id: existing.id }).update(updates);
      stats.deliveries.updated++;

      // Safety net: create scheduled post for deliveries in "agendamento" missing one
      if (status === 'agendamento') {
        const existingPost = await db('scheduled_posts')
          .where({ clickup_task_id: clickupTaskId })
          .first();
        if (!existingPost) {
          await clickupService.autoCreateScheduledPost(clickupTaskId, { ...existing, status, content_type: contentType }, task);
        }
      }
    } else {
      // Create new delivery — skip if no assignee
      if (!userId) {
        logger.warn(`Skipping task ${clickupTaskId} "${task.name}": no assignee mapped`);
        stats.deliveries.skipped++;
        return;
      }

      const [newDelivery] = await db('deliveries').insert({
        clickup_task_id: clickupTaskId,
        title: task.name,
        user_id: userId,
        client_id: clientId,
        content_type: contentType,
        status,
        month,
        started_at: startedAt,
        completed_at: completedAt,
        target_platforms: JSON.stringify(extractPlatformsFromTags(task.tags)),
      }).returning('*');
      stats.deliveries.created++;

      // Create scheduled post if task is already in agendamento
      if (status === 'agendamento') {
        await clickupService.autoCreateScheduledPost(clickupTaskId, newDelivery, task);
      }
    }
  }
}

module.exports = new ClickUpSyncService();
