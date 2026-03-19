exports.up = async function (knex) {
  await knex.schema.createTable('scheduled_posts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.uuid('delivery_id').nullable().references('id').inTable('deliveries').onDelete('SET NULL');
    table.string('clickup_task_id').nullable();
    table.text('caption').nullable();
    table.string('post_type').notNullable();
    table.jsonb('media_urls').defaultTo('[]');
    table.string('thumbnail_url').nullable();
    table.timestamp('scheduled_at').nullable();
    table.string('status').notNullable().defaultTo('draft');
    table.string('ig_container_id').nullable();
    table.string('ig_media_id').nullable();
    table.string('ig_permalink').nullable();
    table.text('error_message').nullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('published_at').nullable();
    table.timestamps(true, true);

    table.index('client_id');
    table.index('scheduled_at');
    table.index('status');
    table.index(['client_id', 'scheduled_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('scheduled_posts');
};
