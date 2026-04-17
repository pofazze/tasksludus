exports.up = async function (knex) {
  await knex.schema.createTable('client_youtube_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.string('channel_id', 255).nullable();
    table.string('channel_title', 255).nullable();
    table.text('access_token_encrypted').nullable();
    table.text('token_iv').nullable();
    table.text('token_auth_tag').nullable();
    table.timestamp('token_expires_at', { useTz: true }).nullable();
    table.text('refresh_token_encrypted').nullable();
    table.text('refresh_token_iv').nullable();
    table.text('refresh_token_auth_tag').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.unique('client_id');
  });

  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('youtube_video_id', 50).nullable();
    table.string('youtube_permalink', 500).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.dropColumn('youtube_permalink');
    table.dropColumn('youtube_video_id');
  });
  await knex.schema.dropTableIfExists('client_youtube_tokens');
};
