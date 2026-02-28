// ============================================================
// src/controllers/auth.controller.js
// ============================================================
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');

// ── Helpers ─────────────────────────────────────────────────
const generateTokens = (userId) => ({
  accessToken: jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  }),
  refreshToken: jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  }),
});

const userResponse = (u) => ({
  id: u.id, email: u.email, fullName: u.full_name,
  phone: u.phone, avatarUrl: u.avatar_url, role: u.role,
});

// ── Register ─────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { email, password, fullName, phone } = req.body;
  try {
    // Kiểm tra email tồn tại
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ success: false, message: 'Email này đã được đăng ký.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { accessToken, refreshToken } = generateTokens(uuidv4());

    const { rows } = await query(`
      INSERT INTO users (email, password_hash, full_name, phone, refresh_token)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [email.toLowerCase().trim(), passwordHash, fullName.trim(), phone || null, refreshToken]);

    // Re-generate with real id
    const tokens = generateTokens(rows[0].id);
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, rows[0].id]);

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công! Chào mừng bạn đến với Verdure Spa.',
      data: { user: userResponse(rows[0]), ...tokens },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── Login ─────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản của bạn đã bị khóa.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    const tokens = generateTokens(user.id);
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, user.id]);

    res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: { user: userResponse(user), ...tokens },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── Refresh Token ─────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Thiếu refresh token.' });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { rows } = await query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND is_active = true',
      [decoded.userId, refreshToken]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Refresh token không hợp lệ.' });
    }
    const tokens = generateTokens(rows[0].id);
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, rows[0].id]);
    res.json({ success: true, data: tokens });
  } catch {
    res.status(401).json({ success: false, message: 'Refresh token hết hạn.' });
  }
};

// ── Logout ─────────────────────────────────────────────────
exports.logout = async (req, res) => {
  await query('UPDATE users SET refresh_token = NULL WHERE id = $1', [req.user.id]);
  res.json({ success: true, message: 'Đã đăng xuất.' });
};

// ── Get Me ─────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json({ success: true, data: userResponse(rows[0]) });
};

// ── Change Password ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng.' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};
