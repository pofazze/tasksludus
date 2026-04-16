exports.up = function (knex) {
  return knex.schema
    .alterTable('approval_items', (table) => {
      table.string('rejection_target', 10).nullable();
    })
    .alterTable('approval_batches', (table) => {
      table.timestamp('review_window_started_at', { useTz: true }).nullable();
      table.timestamp('review_window_fired_at', { useTz: true }).nullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable('approval_batches', (table) => {
      table.dropColumn('review_window_fired_at');
      table.dropColumn('review_window_started_at');
    })
    .alterTable('approval_items', (table) => {
      table.dropColumn('rejection_target');
    });
};
