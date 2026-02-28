// ============================================================
// src/controllers/product.controller.js
// ============================================================
const { query, withTransaction } = require('../config/db');

// ── Slugify ─────────────────────────────────────────────────
const slugify = (text) =>
  text.toLowerCase()
    .replace(/[àáảãạăắặằẳẵâấậầẩẫ]/g, 'a')
    .replace(/[èéẻẽẹêếệềểễ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôốộồổỗơớợờởỡ]/g, 'o')
    .replace(/[ùúủũụưứựừửữ]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

// ── GET /api/products ───────────────────────────────────────
exports.getProducts = async (req, res) => {
  const {
    page = 1, limit = 12,
    category, search,
    minPrice, maxPrice,
    sortBy = 'created_at', sortDir = 'DESC',
    featured, tags,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = ['p.is_active = true'];

  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  if (minPrice) { params.push(minPrice); conditions.push(`p.price >= $${params.length}`); }
  if (maxPrice) { params.push(maxPrice); conditions.push(`p.price <= $${params.length}`); }
  if (featured === 'true') conditions.push('p.is_featured = true');
  if (tags) {
    params.push(`{${tags}}`);
    conditions.push(`p.tags && $${params.length}::text[]`);
  }

  const allowedSort = { price: 'p.price', name: 'p.name', created_at: 'p.created_at', rating: 'p.rating_avg', sold: 'p.sold_count' };
  const sortCol = allowedSort[sortBy] || 'p.created_at';
  const dir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const WHERE = conditions.join(' AND ');

  try {
    const [{ rows: products }, { rows: countRows }] = await Promise.all([
      query(`
        SELECT p.*, c.name AS category_name, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${WHERE}
        ORDER BY ${sortCol} ${dir}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, parseInt(limit), offset]),
      query(`
        SELECT COUNT(*) FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${WHERE}
      `, params),
    ]);

    const total = parseInt(countRows[0].count);
    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page), limit: parseInt(limit), total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi khi tải sản phẩm.' });
  }
};

// ── GET /api/products/:slug ──────────────────────────────────
exports.getProduct = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE (p.slug = $1 OR p.id::text = $1) AND p.is_active = true
    `, [req.params.slug]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Sản phẩm không tìm thấy.' });

    // Related products
    const product = rows[0];
    const { rows: related } = await query(`
      SELECT id, name, slug, price, sale_price, images, rating_avg, review_count
      FROM products
      WHERE category_id = $1 AND id != $2 AND is_active = true
      ORDER BY sold_count DESC LIMIT 4
    `, [product.category_id, product.id]);

    res.json({ success: true, data: { ...product, related } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── POST /api/products (admin) ───────────────────────────────
exports.createProduct = async (req, res) => {
  const { name, categoryId, description, shortDesc, ingredients, howToUse,
          price, salePrice, stock, sku, weightG, images, tags, isFeatured } = req.body;

  const slug = slugify(name);
  try {
    const { rows } = await query(`
      INSERT INTO products
        (name, slug, category_id, description, short_desc, ingredients, how_to_use,
         price, sale_price, stock, sku, weight_g, images, tags, is_featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [name, slug, categoryId||null, description||null, shortDesc||null,
        ingredients||null, howToUse||null, price, salePrice||null,
        stock||0, sku||null, weightG||null,
        JSON.stringify(images||[]), tags||[], isFeatured||false]);

    res.status(201).json({ success: true, message: 'Tạo sản phẩm thành công.', data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Slug hoặc SKU đã tồn tại.' });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── PUT /api/products/:id (admin) ────────────────────────────
exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const allowed = ['name','category_id','description','short_desc','ingredients',
                   'how_to_use','price','sale_price','stock','images','tags','is_featured','is_active'];

  const updates = [];
  const values  = [];
  let idx = 1;

  for (const key of allowed) {
    const camel = key.replace(/_([a-z])/g, (_,l) => l.toUpperCase());
    if (fields[camel] !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(key === 'images' ? JSON.stringify(fields[camel]) : fields[camel]);
    }
  }
  if (!updates.length) return res.status(400).json({ success: false, message: 'Không có trường nào được cập nhật.' });

  values.push(id);
  try {
    const { rows } = await query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    res.json({ success: true, message: 'Cập nhật thành công.', data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── DELETE /api/products/:id (admin) — Soft delete ───────────
exports.deleteProduct = async (req, res) => {
  try {
    const { rowCount } = await query(
      'UPDATE products SET is_active = false WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    res.json({ success: true, message: 'Đã ẩn sản phẩm.' });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};
