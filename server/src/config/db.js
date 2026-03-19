const knex = require('knex');
const knexConfig = require('../../knexfile');
const env = require('./env');
const pg = require('pg');

// Prevent pg from converting DATE columns to JS Date objects (avoids timezone shift)
pg.types.setTypeParser(pg.types.builtins.DATE, (val) => val);

const environment = env.nodeEnv || 'development';
const db = knex(knexConfig[environment]);

module.exports = db;
