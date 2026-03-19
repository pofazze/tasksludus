exports.up = async function (knex) {
  await knex.schema.createTable('client_instagram_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.string('ig_user_id').notNullable();
    table.string('ig_username').nullable();
    table.text('access_token_encrypted').notNullable();
    table.text('token_iv').notNullable();
    table.text('token_auth_tag').notNullable();
    table.timestamp('token_expires_at').notNullable();
    table.timestamp('token_refreshed_at').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.unique('client_id');
    table.index('token_expires_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('client_instagram_tokens');
};
