/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('deliveries', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.string('clickup_task_id').notNullable();
      table.string('title').notNullable();
      table.string('content_type').notNullable(); // reel, feed, carrossel, banner, story, corte, pdf, mockup, apresentacao
      table.string('difficulty').nullable(); // easy, medium, hard
      table.string('urgency').nullable(); // normal, urgent
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.string('status').notNullable().defaultTo('in_progress'); // in_progress, completed
      table.date('month').notNullable();
      table.timestamps(true, true);

      table.unique('clickup_task_id');
      table.index(['user_id', 'month']);
      table.index(['client_id', 'month']);
    })
    .createTable('delivery_time_stats', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('content_type').notNullable();
      table.string('difficulty').notNullable();
      table.integer('avg_production_time_sec').notNullable();
      table.integer('sample_count').notNullable();
      table.date('period').notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['content_type', 'difficulty', 'period']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('delivery_time_stats')
    .dropTableIfExists('deliveries');
};
