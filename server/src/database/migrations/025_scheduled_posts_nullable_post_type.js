exports.up = function (knex) {
  return knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('post_type').nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('post_type').notNullable().defaultTo('image').alter();
  });
};
