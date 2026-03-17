/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('delivery_phases', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('delivery_id').references('id').inTable('deliveries').onDelete('SET NULL');
    table.text('clickup_task_id').notNullable();
    table.text('phase').notNullable();
    table.text('assignee_clickup_id');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('entered_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('exited_at');
    table.integer('duration_seconds');
    table.timestamps(true, true);

    table.index('delivery_id');
    table.index('clickup_task_id');
    table.index(['clickup_task_id', 'phase']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('delivery_phases');
};
