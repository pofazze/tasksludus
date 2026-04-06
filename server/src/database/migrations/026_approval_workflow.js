/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('approval_batches', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('token').notNullable().unique().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('pending');
      table.timestamp('completed_at').nullable();
      table.timestamp('revoked_at').nullable();
      table.timestamps(true, true);
    })
    .createTable('approval_items', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('batch_id').notNullable().references('id').inTable('approval_batches').onDelete('CASCADE');
      table.uuid('delivery_id').notNullable().references('id').inTable('deliveries').onDelete('CASCADE');
      table.text('caption').nullable();
      table.jsonb('media_urls').nullable();
      table.text('thumbnail_url').nullable();
      table.string('post_type', 20).nullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.text('rejection_reason').nullable();
      table.timestamp('responded_at').nullable();
      table.timestamps(true, true);
    })
    .then(() => knex.schema.alterTable('clients', (table) => {
      table.uuid('social_media_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('whatsapp', 20).nullable();
      table.string('whatsapp_group', 50).nullable();
    }))
    .then(() => knex.schema.alterTable('deliveries', (table) => {
      table.string('approval_status', 30).nullable();
    }))
    .then(() => knex.schema.alterTable('users', (table) => {
      table.text('evolution_instance_url').nullable();
      table.text('evolution_instance_iv').nullable();
      table.text('evolution_instance_auth_tag').nullable();
      table.text('evolution_api_key_encrypted').nullable();
      table.text('evolution_api_key_iv').nullable();
      table.text('evolution_api_key_auth_tag').nullable();
    }));
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('approval_items')
    .dropTableIfExists('approval_batches')
    .then(() => knex.schema.alterTable('clients', (table) => {
      table.dropColumn('social_media_id');
      table.dropColumn('whatsapp');
      table.dropColumn('whatsapp_group');
    }))
    .then(() => knex.schema.alterTable('deliveries', (table) => {
      table.dropColumn('approval_status');
    }))
    .then(() => knex.schema.alterTable('users', (table) => {
      table.dropColumn('evolution_instance_url');
      table.dropColumn('evolution_instance_iv');
      table.dropColumn('evolution_instance_auth_tag');
      table.dropColumn('evolution_api_key_encrypted');
      table.dropColumn('evolution_api_key_iv');
      table.dropColumn('evolution_api_key_auth_tag');
    }));
};
