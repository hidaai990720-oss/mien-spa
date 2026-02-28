// ============================================================
// src/controllers/booking.controller.js
// ============================================================
const { query } = require('../config/db');

// ── Lấy slot còn trống trong ngày ───────────────────────────
exports.getAvailableSlots = async (req, res) => {
  const { serviceId, date } = req.query;
  if (!serviceId || !date) {
    return res.status(400).json({ success: false, message: 'Cần serviceId và date.' });
  }

  // Tất cả slot trong ngày từ 8h-20h, mỗi 30 phút
  const allSlots = [];
  for (let h = 8; h < 20; h++) {
    allSlots.push(`${String(h).padStart(2,'0')}:00`);
    allSlots.push(`${String(h).padStart(2,'0')}:30`);
  }

  try {
    const { rows: booked } = await query(`
      SELECT time_slot::text FROM bookings
      WHERE service_id = $1 AND booking_date = $2
        AND status NOT IN ('cancelled','no_show')
    `, [serviceId, date]);

    const bookedTimes = new Set(booked.map(b => b.time_slot.slice(0,5)));
    const available = allSlots.filter(s => !bookedTimes.has(s));

    res.json({ success: true, data: { date, available, booked: [...bookedTimes] } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── POST /api/bookings ───────────────────────────────────────
exports.createBooking = async (req, res) => {
  const { serviceId, bookingDate, timeSlot, guestName, guestPhone, guestEmail, notes } = req.body;

  try {
    // Kiểm tra service tồn tại
    const { rows: services } = await query(
      'SELECT * FROM services WHERE id = $1 AND is_active = true', [serviceId]
    );
    if (!services.length) return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại.' });
    const service = services[0];

    // Kiểm tra slot chưa bị đặt
    const { rows: existing } = await query(`
      SELECT id FROM bookings
      WHERE service_id = $1 AND booking_date = $2 AND time_slot = $3
        AND status NOT IN ('cancelled','no_show')
    `, [serviceId, bookingDate, timeSlot]);

    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Khung giờ này đã được đặt, vui lòng chọn giờ khác.' });
    }

    const { rows: [booking] } = await query(`
      INSERT INTO bookings
        (user_id, service_id, booking_date, time_slot, duration_min,
         guest_name, guest_phone, guest_email, notes, total_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      req.user?.id || null, serviceId, bookingDate, timeSlot,
      service.duration_min, guestName || null, guestPhone || null,
      guestEmail || null, notes || null, service.price,
    ]);

    res.status(201).json({
      success: true,
      message: `Đặt lịch thành công! Chúng tôi sẽ liên hệ xác nhận trong vòng 30 phút.`,
      data: { ...booking, serviceName: service.name },
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Khung giờ đã được đặt.' });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── GET /api/bookings/my ─────────────────────────────────────
exports.getMyBookings = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT b.*, s.name AS service_name, s.image_url AS service_image
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.user_id = $1
      ORDER BY b.booking_date DESC, b.time_slot DESC
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};

// ── PATCH /api/bookings/:id/cancel ──────────────────────────
exports.cancelBooking = async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lịch hẹn không tồn tại.' });

    const booking = rows[0];
    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền hủy lịch này.' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Lịch hẹn đã được hủy trước đó.' });
    }

    await query('UPDATE bookings SET status = $1 WHERE id = $2', ['cancelled', req.params.id]);
    res.json({ success: true, message: 'Đã hủy lịch hẹn.' });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
};
