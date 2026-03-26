exports.up = async function (knex) {
  await knex.schema.createTable('clickup_oauth_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('clickup_user_id');
    table.string('clickup_username');
    table.string('clickup_email');
    table.text('access_token_encrypted').notNullable();
    table.text('token_iv').notNullable();
    table.text('token_auth_tag').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.uuid('connected_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('clickup_oauth_tokens');
};
