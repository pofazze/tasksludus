exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.integer('base_deliveries').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('base_deliveries');
  });
};
