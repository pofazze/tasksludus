const env = require('../../../config/env');
const logger = require('../../../utils/logger');

/**
 * Auto-assign automation — Test scope: Dr. Wander Fran only
 *
 * When a task changes status in the Dr. Wander Fran list,
 * automatically assign the person responsible for that phase.
 */

const DR_WANDER_LIST_ID = '901113351972';

// Phase → ClickUp user ID mapping for Dr. Wander Fran
const PHASE_ASSIGNEE_MAP = {
  'planejamento':     '284598101',  // Aléxia Sâmella
  'captação':         '284598399',  // Filipe Sabino
  'captacao':         '284598399',  // Filipe Sabino
  'edição de vídeo':  '152562683',  // Victor Costa
  'edicao de video':  '152562683',  // Victor Costa
  'estruturação':     '284598101',  // Aléxia Sâmella
  'estruturacao':     '284598101',  // Aléxia Sâmella
  'design':           '284596872',  // Pedro Torres
  'aprovação':        '61001382',   // Wander Fran
  'aprovacao':        '61001382',   // Wander Fran
  'agendamento':      '284598101',  // Aléxia Sâmella
  'publicação':       '284598101',  // Aléxia Sâmella
  'publicacao':       '284598101',  // Aléxia Sâmella
};

const NAMES = {
  '284598101': 'Aléxia Sâmella',
  '284598399': 'Filipe Sabino',
  '152562683': 'Victor Costa',
  '284596872': 'Pedro Torres',
  '61001382': 'Wander Fran',
};

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

  const assigneeId = PHASE_ASSIGNEE_MAP[normalized];
  if (!assigneeId) {
    return { executed: false, reason: `no mapping for status "${normalized}"` };
  }

  // Use pre-fetched task or fetch if needed
  if (!task) {
    try {
      const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
        headers: { Authorization: env.clickup.apiToken },
      });
      if (!res.ok) return { executed: false, reason: 'failed to fetch task' };
      task = await res.json();
    } catch (err) {
      return { executed: false, reason: `fetch error: ${err.message}` };
    }
  }

  // Verify task belongs to Dr. Wander Fran list
  if (task.list?.id !== DR_WANDER_LIST_ID) {
    return { executed: false, reason: 'task not in Dr. Wander Fran list' };
  }

  // Check if already assigned to the right person
  const currentAssignees = task.assignees?.map((a) => String(a.id)) || [];
  if (currentAssignees.length === 1 && currentAssignees[0] === assigneeId) {
    return { executed: false, reason: 'already assigned to correct user' };
  }

  // Remove current assignees and add the new one
  const remIds = currentAssignees.map(Number);
  const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
    method: 'PUT',
    headers: {
      Authorization: env.clickup.apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assignees: {
        add: [Number(assigneeId)],
        rem: remIds,
      },
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

module.exports = { run, DR_WANDER_LIST_ID, PHASE_ASSIGNEE_MAP };
