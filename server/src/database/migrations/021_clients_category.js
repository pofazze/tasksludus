/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.string('category').nullable(); // 'health' or 'experts'
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.dropColumn('category');
  });
};
