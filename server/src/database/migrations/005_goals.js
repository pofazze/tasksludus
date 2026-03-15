/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('goal_templates', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('role').notNullable();
      table.string('producer_type').nullable();
      table.string('name').notNullable();
      table.integer('monthly_target').notNullable();
      table.decimal('multiplier_cap', 5, 2).notNullable();
      table.jsonb('curve_config').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    .createTable('user_goals', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('goal_template_id').nullable().references('id').inTable('goal_templates').onDelete('SET NULL');
      table.date('month').notNullable(); // first day of month (2026-03-01)
      table.integer('monthly_target').notNullable();
      table.decimal('multiplier_cap', 5, 2).nullable();
      table.jsonb('curve_config').nullable();
      table.uuid('defined_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamps(true, true);

      table.unique(['user_id', 'month']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('user_goals')
    .dropTableIfExists('goal_templates');
};
