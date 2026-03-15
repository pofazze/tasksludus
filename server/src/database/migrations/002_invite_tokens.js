/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('invite_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable();
    table.string('role').notNullable();
    table.string('producer_type').nullable();
    table.uuid('invited_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invite_tokens');
};
