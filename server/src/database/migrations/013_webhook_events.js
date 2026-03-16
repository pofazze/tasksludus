exports.up = function (knex) {
  return knex.schema.createTable('webhook_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('source').notNullable(); // 'clickup'
    table.string('event_type').notNullable(); // 'taskStatusUpdated', 'taskCreated', etc.
    table.string('webhook_id').nullable();
    table.jsonb('payload').notNullable();
    table.string('status').notNullable().defaultTo('received'); // received, processed, failed
    table.text('error').nullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('webhook_events');
};
