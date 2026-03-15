/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('monthly_calculations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.date('month').notNullable();
    table.integer('total_deliveries').notNullable().defaultTo(0);
    table.decimal('base_salary', 12, 2).notNullable();
    table.decimal('suggested_bonus', 12, 2).nullable();
    table.decimal('final_bonus', 12, 2).nullable();
    table.decimal('multiplier_applied', 5, 2).nullable();
    table.string('status').notNullable().defaultTo('draft'); // draft, calculated, adjusted, closed
    table.timestamp('calculated_at').nullable();
    table.uuid('closed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('closed_at').nullable();
    table.timestamps(true, true);

    table.unique(['user_id', 'month']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('monthly_calculations');
};
