const db = require('../../../config/db');
const logger = require('../../../utils/logger');
const clickupOAuth = require('../clickup-oauth.service');

/**
 * Auto-assign automation — Test scope: Dr. Wander Fran only
 *
 * When a task changes status in the Dr. Wander Fran list,
 * automatically assign the person responsible for that phase.
 * On publicação, assign ALL people who worked on the task.
 */

const DR_WANDER_LIST_ID = '901113351972';

const LUDUS_HEALTH_FOLDER = '90117692608';
const LUDUS_EXPERTS_FOLDER = '90117692609';

// Video editor per folder
const VIDEO_EDITOR_BY_FOLDER = {
  [LUDUS_HEALTH_FOLDER]: '152562683',   // Victor Costa
  [LUDUS_EXPERTS_FOLDER]: '284598399',  // Filipe Sabino
};

// Phase mapping (everything except video editing — resolved by folder)
const PHASE_ASSIGNEE_MAP = {
  'planejamento':     '284598101',  // Aléxia Sâmella
  'captação':         '284598399',  // Filipe Sabino
  'captacao':         '284598399',  // Filipe Sabino
  'estruturação':     '284598101',  // Aléxia Sâmella
  'estruturacao':     '284598101',  // Aléxia Sâmella
  'design':           '284596872',  // Pedro Torres
  'aprovação':        null,  // Dynamic — resolved from client.social_media_id
  'aprovacao':        null,  // Dynamic — resolved from client.social_media_id
  'agendamento':      '284598101',  // Aléxia Sâmella
  'agendado':         '284598101',  // Aléxia Sâmella
  'publicação':       '284598101',  // Aléxia Sâmella
  'publicacao':       '284598101',  // Aléxia Sâmella
};

const VIDEO_EDITING_STATUSES = ['edição de vídeo', 'edicao de video'];

const NAMES = {
  '284598101': 'Aléxia Sâmella',
  '284598399': 'Filipe Sabino',
  '152562683': 'Victor Costa',
  '284596872': 'Pedro Torres',
  '61001382': 'Wander Fran',
};

const PUBLICACAO_STATUSES = ['publicação', 'publicacao'];

/**
 * Run auto-assign automation
 *
 * @param {string} clickupTaskId - The ClickUp task ID
 * @param {string} newStatusName - The new status name from ClickUp (raw)
 * @param {object} [task] - Pre-fetched task data (avoids extra API call)
 * @returns {{ executed: boolean, action?: string, error?: string }}
 */
async function run(clickupTaskId, newStatusName, task) {
  const normalized = newStatusName?.toLowerCase().trim();
  if (!normalized) {
    return { executed: false, reason: 'no status name' };
  }

  let assigneeId;
  if (VIDEO_EDITING_STATUSES.includes(normalized)) {
    const folderId = task.folder?.id;
    assigneeId = VIDEO_EDITOR_BY_FOLDER[folderId];
    if (!assigneeId) {
      assigneeId = '152562683'; // Fallback to Victor
      logger.warn('auto-assign: unknown folder for video editing, defaulting to Victor', { folderId, clickupTaskId });
    }
  } else {
    assigneeId = PHASE_ASSIGNEE_MAP[normalized];
  }

  // Dynamic lookup for approval phase — find social media from client
  if (['aprovação', 'aprovacao'].includes(normalized) && !assigneeId) {
    const listId = task?.list?.id;
    if (listId) {
      const client = await db('clients').where({ clickup_list_id: listId }).first();
      if (client?.social_media_id) {
        const smUser = await db('users').where({ id: client.social_media_id }).first();
        if (smUser?.clickup_id) {
          assigneeId = smUser.clickup_id;
          logger.info(`auto-assign: approval phase → dynamic SM lookup → ${smUser.name} (${assigneeId})`);
        }
      }
    }
  }

  if (!assigneeId) {
    return { executed: false, reason: `no mapping for status "${normalized}"` };
  }

  // Use pre-fetched task or fetch if needed
  if (!task) {
    try {
      const token = await clickupOAuth.getDecryptedToken();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
        headers: { Authorization: token },
      });
      if (!res.ok) return { executed: false, reason: 'failed to fetch task' };
      task = await res.json();
    } catch (err) {
      return { executed: false, reason: `fetch error: ${err.message}` };
    }
  }

  // Verify client has automations enabled
  const listId = task.list?.id;
  if (!listId) {
    return { executed: false, reason: 'task has no list' };
  }
  const client = await db('clients').where({ clickup_list_id: listId }).first();
  if (!client?.automations_enabled) {
    return { executed: false, reason: `automations disabled for list ${listId}` };
  }

  // PUBLICAÇÃO: assign ALL people who worked on this task
  if (PUBLICACAO_STATUSES.includes(normalized)) {
    return assignAllContributors(clickupTaskId, task);
  }

  // Normal phase: assign the single responsible person
  const currentAssignees = task.assignees?.map((a) => String(a.id)) || [];
  if (currentAssignees.length === 1 && currentAssignees[0] === assigneeId) {
    return { executed: false, reason: 'already assigned to correct user' };
  }

  const remIds = currentAssignees.map(Number);
  const token = await clickupOAuth.getDecryptedToken();
  const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
    method: 'PUT',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assignees: { add: [Number(assigneeId)], rem: remIds },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const error = `ClickUp API error ${res.status}: ${body}`;
    logger.error(`auto-assign: ${error}`);
    return { executed: false, error };
  }

  logger.info(`auto-assign: task ${clickupTaskId} → ${normalized} → assigned to ${NAMES[assigneeId] || assigneeId}`);

  return {
    executed: true,
    action: `assigned ${NAMES[assigneeId] || assigneeId} for phase "${normalized}"`,
    taskId: clickupTaskId,
    phase: normalized,
    assigneeId,
  };
}

/**
 * On publicação: query delivery_phases for all distinct assignees and assign them all
 */
async function assignAllContributors(clickupTaskId, task) {
  // Get all unique assignees from delivery_phases
  const phases = await db('delivery_phases')
    .where({ clickup_task_id: clickupTaskId })
    .whereNotNull('assignee_clickup_id')
    .distinct('assignee_clickup_id');

  const allAssigneeIds = [...new Set(phases.map((p) => p.assignee_clickup_id))];

  if (allAssigneeIds.length === 0) {
    return { executed: false, reason: 'no assignees found in phase history' };
  }

  const currentAssignees = task.assignees?.map((a) => String(a.id)) || [];
  const toAdd = allAssigneeIds.filter((id) => !currentAssignees.includes(id));
  // Don't remove anyone — just add all contributors
  const remIds = currentAssignees.filter((id) => !allAssigneeIds.includes(id)).map(Number);

  if (toAdd.length === 0 && remIds.length === 0) {
    return { executed: false, reason: 'all contributors already assigned' };
  }

  const token = await clickupOAuth.getDecryptedToken();
  const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
    method: 'PUT',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assignees: {
        add: toAdd.map(Number),
        rem: remIds,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const error = `ClickUp API error ${res.status}: ${body}`;
    logger.error(`auto-assign (publicação): ${error}`);
    return { executed: false, error };
  }

  const names = allAssigneeIds.map((id) => NAMES[id] || id).join(', ');
  logger.info(`auto-assign (publicação): task ${clickupTaskId} → assigned ALL contributors: ${names}`);

  return {
    executed: true,
    action: `publicação — assigned all contributors: ${names}`,
    taskId: clickupTaskId,
    phase: 'publicação',
    assigneeIds: allAssigneeIds,
  };
}

module.exports = { run, DR_WANDER_LIST_ID, PHASE_ASSIGNEE_MAP, VIDEO_EDITOR_BY_FOLDER, LUDUS_HEALTH_FOLDER, LUDUS_EXPERTS_FOLDER };
