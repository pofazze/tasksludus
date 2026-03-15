const knex = require('knex');
const knexConfig = require('../../knexfile');
const env = require('./env');

const environment = env.nodeEnv || 'development';
const db = knex(knexConfig[environment]);

module.exports = db;
