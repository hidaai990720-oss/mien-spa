// ============================================================
// src/config/migrate.js — Tạo toàn bộ bảng PostgreSQL
// Chạy: node src/config/migrate.js
// ============================================================
require('dotenv').config();
const { pool } = require('./db');

const migrations = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  avatar_url    TEXT,
  role          VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer','staff','admin')),
  is_active     BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  refresh_token TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  image_url   TEXT,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  description   TEXT,
  short_desc    VARCHAR(500),
  ingredients   TEXT,           -- Thành phần
  how_to_use    TEXT,           -- Cách sử dụng
  price         NUMERIC(12,0) NOT NULL CHECK (price >= 0),
  sale_price    NUMERIC(12,0)  CHECK (sale_price >= 0),
  stock         INTEGER DEFAULT 0 NOT NULL,
  sku           VARCHAR(100) UNIQUE,
  weight_g      INTEGER,        -- Trọng lượng (gram)
  images        JSONB DEFAULT '[]',  -- [{url, alt, is_primary}]
  tags          TEXT[] DEFAULT '{}',
  is_featured   BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  rating_avg    NUMERIC(2,1) DEFAULT 0,
  review_count  INTEGER DEFAULT 0,
  sold_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured   ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_active     ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_slug       ON products(slug);

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  order_number    VARCHAR(20) UNIQUE NOT NULL,
  status          VARCHAR(30) DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status  VARCHAR(20) DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid','paid','refunded','partial')),
  payment_method  VARCHAR(30) CHECK (payment_method IN ('cod','vnpay','momo','bank_transfer')),
  subtotal        NUMERIC(14,0) NOT NULL,
  discount_amount NUMERIC(14,0) DEFAULT 0,
  shipping_fee    NUMERIC(10,0) DEFAULT 0,
  total           NUMERIC(14,0) NOT NULL,
  coupon_code     VARCHAR(50),
  -- Địa chỉ giao hàng (snapshot)
  shipping_name   VARCHAR(255),
  shipping_phone  VARCHAR(20),
  shipping_address TEXT,
  shipping_city   VARCHAR(100),
  notes           TEXT,
  -- VNPay / MoMo response
  payment_ref     VARCHAR(100),
  paid_at         TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

-- ─────────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot tại thời điểm đặt hàng
  product_name VARCHAR(255) NOT NULL,
  product_sku  VARCHAR(100),
  unit_price  NUMERIC(12,0) NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  subtotal    NUMERIC(14,0) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─────────────────────────────────────────────
-- SERVICES (Dịch vụ spa)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  slug         VARCHAR(255) UNIQUE NOT NULL,
  description  TEXT,
  duration_min INTEGER NOT NULL,     -- Thời gian (phút)
  price        NUMERIC(12,0) NOT NULL,
  image_url    TEXT,
  category     VARCHAR(100),
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- BOOKINGS (Đặt lịch spa)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  time_slot    TIME NOT NULL,
  duration_min INTEGER NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending'
               CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  -- Thông tin khách (nếu chưa đăng nhập)
  guest_name   VARCHAR(255),
  guest_phone  VARCHAR(20),
  guest_email  VARCHAR(255),
  notes        TEXT,
  total_price  NUMERIC(12,0),
  staff_note   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_date    ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user    ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);

-- Không cho trùng slot (same service, same time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_slot
  ON bookings(service_id, booking_date, time_slot)
  WHERE status NOT IN ('cancelled','no_show');

-- ─────────────────────────────────────────────
-- BLOG POSTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  title         VARCHAR(500) NOT NULL,
  slug          VARCHAR(500) UNIQUE NOT NULL,
  excerpt       TEXT,
  content       TEXT NOT NULL,
  cover_image   TEXT,
  category      VARCHAR(100),
  tags          TEXT[] DEFAULT '{}',
  status        VARCHAR(20) DEFAULT 'draft'
                CHECK (status IN ('draft','published','archived')),
  is_featured   BOOLEAN DEFAULT false,
  view_count    INTEGER DEFAULT 0,
  read_time_min INTEGER DEFAULT 5,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_status    ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_featured  ON blog_posts(is_featured);
CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(published_at DESC);

-- ─────────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       VARCHAR(255),
  body        TEXT,
  images      TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,  -- đã mua hàng
  is_approved BOOLEAN DEFAULT true,
  helpful_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user    ON reviews(user_id);

-- ─────────────────────────────────────────────
-- COUPONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) UNIQUE NOT NULL,
  type         VARCHAR(20) CHECK (type IN ('percent','fixed')),
  value        NUMERIC(10,2) NOT NULL,
  min_order    NUMERIC(12,0) DEFAULT 0,
  max_discount NUMERIC(12,0),
  used_count   INTEGER DEFAULT 0,
  usage_limit  INTEGER,
  is_active    BOOLEAN DEFAULT true,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- WISHLIST
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- ─────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  EXECUTE 'CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at()' ;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

async function migrate() {
  console.log('🚀 Bắt đầu migration...\n');
  try {
    await pool.query(migrations);
    console.log('✅ Migration thành công! Tất cả bảng đã được tạo.\n');
    console.log('📋 Các bảng: users, categories, products, orders, order_items,');
    console.log('             services, bookings, blog_posts, reviews, coupons, wishlists\n');
  } catch (err) {
    console.error('❌ Migration thất bại:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
