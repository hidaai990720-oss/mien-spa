// ============================================================
// src/controllers/order.controller.js
// ============================================================
const { query, withTransaction } = require('../config/db');

// Tạo mã đơn hàng: VD-20250615-XXXX
const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `VD-${date}-${rand}`;
};

// ── POST /api/orders ─────────────────────────────────────────
exports.createOrder = async (req, res) => {
  const {
    items,               // [{productId, quantity}]
    paymentMethod,
    shippingName, shippingPhone, shippingAddress, shippingCity,
    couponCode, notes,
  } = req.body;

  if (!items?.length) return res.status(400).json({ success: false, message: 'Giỏ hàng trống.' });

  try {
    const result = await withTransaction(async (client) => {
      // 1. Lấy thông tin sản phẩm và kiểm tra tồn kho
      const productIds = items.map(i => i.productId);
      const { rows: products } = await client.query(
        `SELECT id, name, sku, price, sale_price, stock FROM products WHERE id = ANY($1::uuid[]) AND is_active = true`,
        [productIds]
      );

      const productMap = Object.fromEntries(products.map(p => [p.id, p]));
      const orderItems = [];
      let subtotal = 0;

      for (const item of items) {
        const p = productMap[item.productId];
        if (!p) throw { status: 400, message: `Sản phẩm ${item.productId} không tồn tại.` };
        if (p.stock < item.quantity) throw { status: 400, message: `${p.name} chỉ còn ${p.stock} sản phẩm.` };

        const unitPrice = p.sale_price || p.price;
        const itemSubtotal = unitPrice * item.quantity;
        subtotal += itemSubtotal;
        orderItems.push({ ...item, product: p, unitPrice, subtotal: itemSubtotal });
      }

      // 2. Áp dụng coupon
      let discountAmount = 0;
      if (couponCode) {
        const { rows: coupons } = await client.query(`
          SELECT * FROM coupons
          WHERE code = $1 AND is_active = true
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (usage_limit IS NULL OR used_count < usage_limit)
            AND min_order <= $2
        `, [couponCode.toUpperCase(), subtotal]);

        if (!coupons.length) throw { status: 400, message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn.' };

        const coupon = coupons[0];
        discountAmount = coupon.type === 'percent'
          ? Math.min(subtotal * coupon.value / 100, coupon.max_discount || Infinity)
          : coupon.value;

        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
      }

      const shippingFee = subtotal >= 500000 ? 0 : 30000; // Free ship đơn ≥ 500k
      const total = subtotal - discountAmount + shippingFee;

      // 3. Tạo đơn hàng
      const { rows: [order] } = await client.query(`
        INSERT INTO orders
          (user_id, order_number, payment_method, subtotal, discount_amount, shipping_fee, total,
           coupon_code, shipping_name, shipping_phone, shipping_address, shipping_city, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [req.user?.id || null, generateOrderNumber(), paymentMethod,
          subtotal, discountAmount, shippingFee, total,
          couponCode?.toUpperCase() || null,
          shippingName, shippingPhone, shippingAddress, shippingCity, notes || null]);

      // 4. Tạo order items + cập nhật stock
      for (const item of orderItems) {
        await client.query(`
          INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity, subtotal)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [order.id, item.productId, item.product.name, item.product.sku, item.unitPrice, item.quantity, item.subtotal]);

        await client.query(
          'UPDATE products SET stock = stock - $1, sold_count = sold_count + $1 WHERE id = $2',
          [item.quantity, item.productId]
        );
      }

      return order;
    });

    res.status(201).json({
      success: true,
      message: `Đặt hàng thành công! Mã đơn hàng: ${result.order_number}`,
      data: result,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi tạo đơn hàng.' });
  }
};

// ── GET /api/orders (lịch sử đơn hàng user) ─────────────────
exports.getMyOrders = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions = ['o.user_id = $1'];
  const params = [req.user.id];

  if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }

  try {
    const { rows } = await query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'name', oi.product_name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price
        )) AS items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── GET /api/orders/:id ──────────────────────────────────────
exports.getOrder = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'productId', oi.product_id, 'name', oi.product_name,
          'sku', oi.product_sku, 'unitPrice', oi.unit_price,
          'quantity', oi.quantity, 'subtotal', oi.subtotal
        )) AS items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE (o.id::text = $1 OR o.order_number = $1)
        AND (o.user_id = $2 OR $3 = 'admin')
      GROUP BY o.id
    `, [req.params.id, req.user.id, req.user.role]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── PATCH /api/orders/:id/cancel ────────────────────────────
exports.cancelOrder = async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT status, user_id FROM orders WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    const order = rows[0];

    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền hủy đơn này.' });
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Không thể hủy đơn hàng ở trạng thái này.' });
    }

    await withTransaction(async (client) => {
      await client.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', req.params.id]);
      // Hoàn lại stock
      const { rows: items } = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]
      );
      for (const item of items) {
        await client.query(
          'UPDATE products SET stock = stock + $1, sold_count = sold_count - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    });

    res.json({ success: true, message: 'Đã hủy đơn hàng.' });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── PATCH /api/orders/:id/status (admin) ─────────────────────
exports.updateOrderStatus = async (req, res) => {
  const validStatuses = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'];
  const { status } = req.body;
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
  }
  try {
    const extra = status === 'delivered' ? ', delivered_at = NOW()' : status === 'shipped' ? ', shipped_at = NOW()' : '';
    const { rows } = await query(
      `UPDATE orders SET status = $1 ${extra} WHERE id = $2 RETURNING *`, [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    res.json({ success: true, message: 'Cập nhật trạng thái thành công.', data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};
