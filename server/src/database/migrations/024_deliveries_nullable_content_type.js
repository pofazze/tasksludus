exports.up = function (knex) {
  return knex.schema.alterTable('deliveries', (table) => {
    table.string('content_type').nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('deliveries', (table) => {
    table.string('content_type').notNullable().defaultTo('video').alter();
  });
};
