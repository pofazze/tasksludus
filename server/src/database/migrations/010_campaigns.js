/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('campaigns', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('source').notNullable(); // meta_ads, google_ads, etc.
      table.string('external_id').nullable();
      table.string('name').notNullable();
      table.decimal('budget', 12, 2).nullable();
      table.string('status').notNullable().defaultTo('draft');
      table.date('start_date').nullable();
      table.date('end_date').nullable();
      table.jsonb('metrics').nullable();
      table.timestamps(true, true);
    })
    .createTable('campaign_deliveries', (table) => {
      table.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
      table.uuid('delivery_id').notNullable().references('id').inTable('deliveries').onDelete('CASCADE');
      table.primary(['campaign_id', 'delivery_id']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('campaign_deliveries')
    .dropTableIfExists('campaigns');
};
