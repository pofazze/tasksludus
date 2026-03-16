exports.up = function (knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('whatsapp', 20).nullable();
    table.string('clickup_id').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('whatsapp');
    table.dropColumn('clickup_id');
  });
};
