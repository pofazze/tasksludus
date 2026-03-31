// ClickUp list ID → category mapping from workspace data
const HEALTH_LISTS = ['901113287382', '901113287385', '901113287468', '901113287473', '901113351972'];
const EXPERTS_LISTS = ['901113286851', '901113287367', '901113287397', '901113287408'];

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  for (const listId of HEALTH_LISTS) {
    await knex('clients').where('clickup_list_id', listId).update({ category: 'health' });
  }
  for (const listId of EXPERTS_LISTS) {
    await knex('clients').where('clickup_list_id', listId).update({ category: 'experts' });
  }
};

exports.down = async function (knex) {
  await knex('clients').update({ category: null });
};
