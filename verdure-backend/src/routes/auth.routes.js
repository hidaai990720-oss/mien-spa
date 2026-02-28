// Auto-generated route stubs — xem logic chi tiết trong src/routes/index.js
// Các file này được import bởi server.js

// auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};
const router = express.Router();
router.post('/register', [body('email').isEmail(), body('password').isLength({min:8}), body('fullName').notEmpty(), validate], ctrl.register);
router.post('/login',    [body('email').isEmail(), body('password').notEmpty(), validate], ctrl.login);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/logout',   authenticate, ctrl.logout);
router.get('/me',        authenticate, ctrl.getMe);
router.patch('/change-password', authenticate, ctrl.changePassword);
module.exports = router;
