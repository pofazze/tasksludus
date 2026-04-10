exports.up = async function (knex) {
  // 1. Alter scheduled_posts: add platform, post_group_id, tiktok fields
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('platform', 20).notNullable().defaultTo('instagram');
    table.uuid('post_group_id').nullable();
    table.string('tiktok_publish_id', 100).nullable();
    table.string('tiktok_permalink', 500).nullable();

    table.index('platform');
    table.index('post_group_id');
  });

  // 2. Create client_tiktok_tokens table
  await knex.schema.createTable('client_tiktok_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.string('tiktok_open_id', 255).nullable();
    table.string('tiktok_username', 255).nullable();
    table.text('access_token_encrypted').nullable();
    table.text('token_iv').nullable();
    table.text('token_auth_tag').nullable();
    table.timestamp('token_expires_at', { useTz: true }).nullable();
    table.text('refresh_token_encrypted').nullable();
    table.text('refresh_token_iv').nullable();
    table.text('refresh_token_auth_tag').nullable();
    table.timestamp('refresh_expires_at', { useTz: true }).nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.unique('client_id');
  });

  // 3. Alter deliveries: add target_platforms
  await knex.schema.alterTable('deliveries', (table) => {
    table.jsonb('target_platforms').defaultTo(JSON.stringify(['instagram']));
  });
};

exports.down = async function (knex) {
  // Reverse in reverse order

  // 3. Remove target_platforms from deliveries
  await knex.schema.alterTable('deliveries', (table) => {
    table.dropColumn('target_platforms');
  });

  // 2. Drop client_tiktok_tokens
  await knex.schema.dropTableIfExists('client_tiktok_tokens');

  // 1. Remove added columns and indexes from scheduled_posts
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.dropIndex('platform');
    table.dropIndex('post_group_id');
    table.dropColumn('platform');
    table.dropColumn('post_group_id');
    table.dropColumn('tiktok_publish_id');
    table.dropColumn('tiktok_permalink');
  });
};
