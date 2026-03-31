const bcrypt = require('bcrypt');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  const existing = await knex('users').where('email', 'igor@igor.com').first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('052446', 10);
  await knex('users').insert({
    name: 'Igor',
    email: 'igor@igor.com',
    password_hash: passwordHash,
    role: 'dev',
    is_active: true,
  });
};

exports.down = async function (knex) {
  await knex('users').where('email', 'igor@igor.com').del();
};
