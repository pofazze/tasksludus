exports.up = function (knex) {
  return knex.schema.alterTable('approval_items', (table) => {
    table.string('rejection_category', 30).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('approval_items', (table) => {
    table.dropColumn('rejection_category');
  });
};
