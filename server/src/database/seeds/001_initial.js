const bcrypt = require('bcrypt');

/**
 * @param {import('knex').Knex} knex
 */
exports.seed = async function (knex) {
  // Clean tables in order (respect foreign keys)
  await knex('campaign_deliveries').del();
  await knex('campaigns').del();
  await knex('instagram_metrics').del();
  await knex('instagram_posts').del();
  await knex('client_overages').del();
  await knex('delivery_time_stats').del();
  await knex('deliveries').del();
  await knex('monthly_calculations').del();
  await knex('user_goals').del();
  await knex('goal_templates').del();
  await knex('client_plans').del();
  await knex('plan_limits').del();
  await knex('plans').del();
  await knex('clients').del();
  await knex('invite_tokens').del();
  await knex('integrations').del();
  await knex('app_settings').del();
  await knex('users').del();

  // CEO user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const [ceo] = await knex('users')
    .insert({
      name: 'Wander Fran',
      email: 'wander@ludus.com',
      password_hash: passwordHash,
      role: 'ceo',
      is_active: true,
    })
    .returning('*');

  // Default app settings
  await knex('app_settings').insert([
    { key: 'ranking_show_names', value: JSON.stringify(true), updated_by: ceo.id },
    { key: 'default_currency', value: JSON.stringify('BRL'), updated_by: ceo.id },
  ]);

  // Default integrations (inactive until configured)
  await knex('integrations').insert([
    { type: 'clickup', config: JSON.stringify({}), is_active: false },
    { type: 'instagram', config: JSON.stringify({}), is_active: false },
  ]);

  // Example goal template — Designer
  await knex('goal_templates').insert({
    role: 'producer',
    producer_type: 'designer',
    name: 'Meta Designer Padrao',
    monthly_target: 20,
    multiplier_cap: 3.0,
    curve_config: JSON.stringify({
      levels: [
        { from: 0, to: 5, multiplier: 0.3 },
        { from: 6, to: 10, multiplier: 0.6 },
        { from: 11, to: 15, multiplier: 1.0 },
        { from: 16, to: 18, multiplier: 1.5 },
        { from: 19, to: 20, multiplier: 2.0 },
        { from: 21, to: null, multiplier: 3.0 },
      ],
    }),
  });

  // Example goal template — Video Editor
  await knex('goal_templates').insert({
    role: 'producer',
    producer_type: 'video_editor',
    name: 'Meta Editor de Video Padrao',
    monthly_target: 15,
    multiplier_cap: 3.0,
    curve_config: JSON.stringify({
      levels: [
        { from: 0, to: 3, multiplier: 0.3 },
        { from: 4, to: 7, multiplier: 0.6 },
        { from: 8, to: 11, multiplier: 1.0 },
        { from: 12, to: 13, multiplier: 1.5 },
        { from: 14, to: 15, multiplier: 2.0 },
        { from: 16, to: null, multiplier: 3.0 },
      ],
    }),
  });

  console.log('Seed completed: CEO user + settings + goal templates');
};
