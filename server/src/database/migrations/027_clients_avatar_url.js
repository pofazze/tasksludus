/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.text('avatar_url').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.dropColumn('avatar_url');
  });
};
