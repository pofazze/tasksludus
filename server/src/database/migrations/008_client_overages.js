/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('client_overages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.uuid('client_plan_id').notNullable().references('id').inTable('client_plans').onDelete('CASCADE');
    table.date('month').notNullable();
    table.string('content_type').notNullable();
    table.integer('included_qty').notNullable();
    table.integer('delivered_qty').notNullable();
    table.integer('overage_qty').notNullable();
    table.decimal('overage_unit_price', 12, 2).notNullable();
    table.decimal('overage_total', 12, 2).notNullable();
    table.string('status').notNullable().defaultTo('pending'); // pending, billed, paid
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('client_overages');
};
