/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password_hash').nullable();
    table.string('avatar_url').nullable();
    table.string('google_id').nullable();
    table.string('role').notNullable(); // ceo, director, manager, account_manager, producer, client
    table.string('producer_type').nullable(); // video_editor, designer, captation, social_media
    table.boolean('is_active').defaultTo(true);
    table.decimal('base_salary', 12, 2).nullable();
    table.boolean('auto_calc_enabled').defaultTo(true);
    table.timestamps(true, true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
