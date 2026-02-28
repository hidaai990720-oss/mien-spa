// ============================================================
// verdure-backend/src/server.js — Entry Point
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');

const db = require('./config/db');

// Routes
const authRoutes     = require('./routes/auth.routes');
const productRoutes  = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const orderRoutes    = require('./routes/order.routes');
const blogRoutes     = require('./routes/blog.routes');
const bookingRoutes  = require('./routes/booking.routes');
const userRoutes     = require('./routes/user.routes');
const reviewRoutes   = require('./routes/review.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100,
  message: { success: false, message: 'Quá nhiều request, vui lòng thử lại sau.' },
});
app.use('/api', limiter);

// Auth route có giới hạn nghiêm hơn
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 tiếng
  max: 10,
  message: { success: false, message: 'Quá nhiều lần đăng nhập, thử lại sau 1 giờ.' },
});
app.use('/api/auth', authLimiter);

// ── Parsing ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Static files ──────────────────────────────────────────
app.use('/uploads', express.static('uploads'));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/blog',       blogRoutes);
app.use('/api/bookings',   bookingRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/reviews',    reviewRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} không tồn tại.` });
});

// ── Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi máy chủ nội bộ',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 Verdure Spa API đang chạy tại http://localhost:${PORT}`);
  console.log(`📊 Môi trường: ${process.env.NODE_ENV}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
