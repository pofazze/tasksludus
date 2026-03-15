/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('instagram_posts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('delivery_id').nullable().references('id').inTable('deliveries').onDelete('SET NULL');
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('instagram_media_id').notNullable().unique();
      table.string('post_url').nullable();
      table.string('post_type').notNullable(); // reel, feed, carousel, story
      table.timestamp('posted_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('instagram_metrics', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('post_id').notNullable().references('id').inTable('instagram_posts').onDelete('CASCADE');
      table.integer('impressions').defaultTo(0);
      table.integer('reach').defaultTo(0);
      table.integer('engagement').defaultTo(0);
      table.integer('saves').defaultTo(0);
      table.integer('shares').defaultTo(0);
      table.integer('comments_count').defaultTo(0);
      table.integer('video_views').nullable();
      table.decimal('reel_skip_rate', 5, 2).nullable();
      table.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('instagram_metrics')
    .dropTableIfExists('instagram_posts');
};
