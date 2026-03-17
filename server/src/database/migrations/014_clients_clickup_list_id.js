exports.up = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.string('clickup_list_id').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.dropColumn('clickup_list_id');
  });
};
