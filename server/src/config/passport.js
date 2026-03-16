const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const db = require('./db');

// Local strategy
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await db('users').where({ email, is_active: true }).first();
        if (!user) return done(null, false, { message: 'Invalid credentials' });

        if (!user.password_hash) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return done(null, false, { message: 'Invalid credentials' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
