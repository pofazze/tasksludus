/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('plans', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    })
    .createTable('plan_limits', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('CASCADE');
      table.string('content_type').notNullable();
      table.integer('monthly_limit').notNullable();
      table.decimal('overage_price', 12, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('client_plans', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('CASCADE');
      table.date('starts_at').notNullable();
      table.date('ends_at').nullable();
      table.string('status').notNullable().defaultTo('active'); // active, paused, cancelled
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('client_plans')
    .dropTableIfExists('plan_limits')
    .dropTableIfExists('plans');
};
