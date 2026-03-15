const express = require('express');
const passport = require('passport');
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Public routes
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.post('/invites/:token/accept', authController.acceptInvite.bind(authController));

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  authController.googleCallback.bind(authController)
);

// Protected routes
router.get('/me', authenticate, authController.me.bind(authController));
router.post(
  '/invites',
  authenticate,
  authorize('ceo', 'director', 'manager'),
  authController.createInvite.bind(authController)
);

module.exports = router;
