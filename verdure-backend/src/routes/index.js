// ============================================================
// src/routes/auth.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');
const ctrl    = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

router.post('/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('password').isLength({ min: 8 }).withMessage('Mật khẩu ít nhất 8 ký tự'),
    body('fullName').trim().notEmpty().withMessage('Vui lòng nhập họ tên'),
    validate,
  ],
  ctrl.register
);

router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
  ],
  ctrl.login
);

router.post('/refresh-token',  ctrl.refreshToken);
router.post('/logout',         authenticate, ctrl.logout);
router.get ('/me',             authenticate, ctrl.getMe);
router.patch('/change-password', authenticate, ctrl.changePassword);

module.exports = router;


// ============================================================
// src/routes/product.routes.js
// ============================================================
const express2 = require('express');
const router2  = express2.Router();
const pCtrl    = require('../controllers/product.controller');
const { authenticate: auth, requireRole } = require('../middleware/auth.middleware');

router2.get('/',       pCtrl.getProducts);
router2.get('/:slug',  pCtrl.getProduct);
router2.post('/',      auth, requireRole('admin'), pCtrl.createProduct);
router2.put('/:id',    auth, requireRole('admin'), pCtrl.updateProduct);
router2.delete('/:id', auth, requireRole('admin'), pCtrl.deleteProduct);

module.exports = router2;


// ============================================================
// src/routes/order.routes.js
// ============================================================
const express3 = require('express');
const router3  = express3.Router();
const oCtrl    = require('../controllers/order.controller');
const { authenticate: auth3, requireRole: role3 } = require('../middleware/auth.middleware');

router3.post ('/',                          auth3, oCtrl.createOrder);
router3.get  ('/my',                        auth3, oCtrl.getMyOrders);
router3.get  ('/:id',                       auth3, oCtrl.getOrder);
router3.patch('/:id/cancel',                auth3, oCtrl.cancelOrder);
router3.patch('/:id/status', auth3, role3('admin','staff'), oCtrl.updateOrderStatus);

module.exports = router3;


// ============================================================
// src/routes/booking.routes.js
// ============================================================
const express4 = require('express');
const router4  = express4.Router();
const bCtrl    = require('../controllers/booking.controller');
const { authenticate: auth4, optionalAuth } = require('../middleware/auth.middleware');

router4.get ('/slots',       bCtrl.getAvailableSlots);
router4.post('/',            optionalAuth, bCtrl.createBooking);
router4.get ('/my',          auth4, bCtrl.getMyBookings);
router4.patch('/:id/cancel', auth4, bCtrl.cancelBooking);

module.exports = router4;


// ============================================================
// src/routes/blog.routes.js
// ============================================================
const express5 = require('express');
const router5  = express5.Router();
const { query: q } = require('../config/db');
const { authenticate: auth5, requireRole: role5 } = require('../middleware/auth.middleware');

// GET /api/blog
router5.get('/', async (req, res) => {
  const { page=1, limit=9, category, featured } = req.query;
  const offset = (parseInt(page)-1)*parseInt(limit);
  const conds = ["status='published'"];
  const params = [];
  if (category) { params.push(category); conds.push(`category=$${params.length}`); }
  if (featured==='true') conds.push('is_featured=true');
  const { rows } = await q(
    `SELECT id,title,slug,excerpt,cover_image,category,tags,view_count,read_time_min,published_at,
            (SELECT full_name FROM users WHERE id=author_id) AS author_name
     FROM blog_posts WHERE ${conds.join(' AND ')}
     ORDER BY published_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params, parseInt(limit), offset]
  );
  res.json({ success:true, data:rows });
});

// GET /api/blog/:slug
router5.get('/:slug', async (req, res) => {
  const { rows } = await q(
    `UPDATE blog_posts SET view_count=view_count+1 WHERE slug=$1 AND status='published' RETURNING *`,
    [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ success:false, message:'Bài viết không tồn tại.' });
  res.json({ success:true, data:rows[0] });
});

// POST /api/blog (admin)
router5.post('/', auth5, role5('admin','staff'), async (req, res) => {
  const { title, excerpt, content, coverImage, category, tags, status, isFeatured, readTimeMin } = req.body;
  const slug = title.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,200);
  const { rows } = await q(
    `INSERT INTO blog_posts (author_id,title,slug,excerpt,content,cover_image,category,tags,status,is_featured,read_time_min,published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.user.id,title,slug,excerpt||null,content,coverImage||null,category||null,tags||[],
     status||'draft',isFeatured||false,readTimeMin||5, status==='published'?new Date():null]
  );
  res.status(201).json({ success:true, data:rows[0] });
});

module.exports = router5;


// ============================================================
// src/routes/category.routes.js
// ============================================================
const express6 = require('express');
const router6  = express6.Router();
const { query: q6 } = require('../config/db');
const { authenticate: auth6, requireRole: role6 } = require('../middleware/auth.middleware');

router6.get('/', async (_req, res) => {
  const { rows } = await q6('SELECT * FROM categories WHERE is_active=true ORDER BY sort_order,name');
  res.json({ success:true, data:rows });
});

router6.post('/', auth6, role6('admin'), async (req, res) => {
  const { name, description, imageUrl, parentId, sortOrder } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const { rows } = await q6(
    'INSERT INTO categories(name,slug,description,image_url,parent_id,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [name,slug,description||null,imageUrl||null,parentId||null,sortOrder||0]
  );
  res.status(201).json({ success:true, data:rows[0] });
});

module.exports = router6;


// ============================================================
// src/routes/user.routes.js
// ============================================================
const express7 = require('express');
const router7  = express7.Router();
const { query: q7 } = require('../config/db');
const { authenticate: auth7, requireRole: role7 } = require('../middleware/auth.middleware');

// Profile update
router7.patch('/profile', auth7, async (req, res) => {
  const { fullName, phone, avatarUrl } = req.body;
  const { rows } = await q7(
    'UPDATE users SET full_name=$1,phone=$2,avatar_url=$3 WHERE id=$4 RETURNING id,email,full_name,phone,avatar_url,role',
    [fullName, phone||null, avatarUrl||null, req7.user.id]
  );
  res.json({ success:true, data:rows[0] });
});

// Wishlist
router7.get('/wishlist', auth7, async (req, res) => {
  const { rows } = await q7(
    `SELECT p.id,p.name,p.slug,p.price,p.sale_price,p.images,p.rating_avg
     FROM wishlists w JOIN products p ON w.product_id=p.id WHERE w.user_id=$1`,
    [req.user.id]
  );
  res.json({ success:true, data:rows });
});

router7.post('/wishlist/:productId', auth7, async (req, res) => {
  await q7('INSERT INTO wishlists(user_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.productId]);
  res.json({ success:true, message:'Đã thêm vào yêu thích.' });
});

router7.delete('/wishlist/:productId', auth7, async (req, res) => {
  await q7('DELETE FROM wishlists WHERE user_id=$1 AND product_id=$2', [req.user.id, req.params.productId]);
  res.json({ success:true, message:'Đã xóa khỏi yêu thích.' });
});

// Admin: list users
router7.get('/', auth7, role7('admin'), async (_req, res) => {
  const { rows } = await q7('SELECT id,email,full_name,phone,role,is_active,created_at FROM users ORDER BY created_at DESC');
  res.json({ success:true, data:rows });
});

module.exports = router7;


// ============================================================
// src/routes/review.routes.js
// ============================================================
const express8 = require('express');
const router8  = express8.Router();
const { query: q8, withTransaction: wt8 } = require('../config/db');
const { authenticate: auth8 } = require('../middleware/auth.middleware');

router8.get('/product/:productId', async (req, res) => {
  const { rows } = await q8(
    `SELECT r.*, u.full_name AS user_name, u.avatar_url
     FROM reviews r LEFT JOIN users u ON r.user_id=u.id
     WHERE r.product_id=$1 AND r.is_approved=true ORDER BY r.created_at DESC`,
    [req.params.productId]
  );
  res.json({ success:true, data:rows });
});

router8.post('/', auth8, async (req, res) => {
  const { productId, orderId, rating, title, body } = req.body;
  try {
    const { rows } = await q8(
      'INSERT INTO reviews(product_id,user_id,order_id,rating,title,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [productId, req.user.id, orderId||null, rating, title||null, body||null]
    );
    // Cập nhật rating_avg
    await q8(`
      UPDATE products SET
        rating_avg = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE product_id=$1 AND is_approved=true),
        review_count = (SELECT COUNT(*) FROM reviews WHERE product_id=$1 AND is_approved=true)
      WHERE id=$1
    `, [productId]);
    res.status(201).json({ success:true, data:rows[0] });
  } catch (err) {
    res.status(500).json({ success:false, message:'Lỗi khi đăng đánh giá.' });
  }
});

module.exports = router8;


// ============================================================
// src/middleware/validate.middleware.js
// ============================================================
// NOTE: Export separately but included here for reference
const { validationResult } = require('express-validator');
const validateMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};
module.exports = validateMiddleware;
