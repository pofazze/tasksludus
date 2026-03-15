/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('app_settings', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('key').notNullable().unique();
      table.jsonb('value').notNullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('integrations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('type').notNullable().unique(); // clickup, instagram, kommo, meta_ads, evolution, payment
      table.jsonb('config').notNullable().defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_sync_at').nullable();
      table.timestamps(true, true);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('integrations')
    .dropTableIfExists('app_settings');
};
