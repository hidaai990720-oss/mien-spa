# 🌿 Verdure Spa — Backend API

Node.js + Express + PostgreSQL backend cho hệ thống website spa & beauty.

## 📦 Tech Stack

| Layer       | Công nghệ                              |
|-------------|----------------------------------------|
| Runtime     | Node.js 18+                            |
| Framework   | Express.js 4                           |
| Database    | **PostgreSQL** (khuyến nghị Supabase)  |
| Auth        | JWT (access + refresh token)           |
| Validation  | express-validator                      |
| Security    | helmet, cors, express-rate-limit       |
| Images      | Cloudinary (free 25GB)                 |
| Payments    | VNPay / MoMo sandbox                   |
| Logging     | morgan                                 |

## 🗄️ Tại sao PostgreSQL?

- ✅ Data có **quan hệ rõ ràng**: user → order → items → products
- ✅ **ACID transactions**: cần thiết cho đặt hàng và đặt lịch
- ✅ **JSONB** cho lưu images linh hoạt
- ✅ **Array types** cho tags
- ✅ **Supabase** — free tier 500MB, có sẵn REST API và realtime
- ✅ **Railway** — deploy dễ, free 5GB

## 🚀 Cài đặt & Chạy

### 1. Clone và cài dependencies

```bash
cd verdure-backend
npm install
```

### 2. Tạo file .env

```bash
cp .env.example .env
# Điền các giá trị trong .env
```

### 3. Tạo database

**Option A — Supabase (khuyến nghị, free):**
1. Tạo project tại supabase.com
2. Vào Settings → Database → lấy Connection String
3. Dán vào `.env` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)

**Option B — Local PostgreSQL:**
```bash
psql -U postgres -c "CREATE DATABASE verdure_spa;"
```

### 4. Migration (tạo bảng)

```bash
npm run migrate
```

### 5. Seed data mẫu (tùy chọn)

```bash
npm run seed
```

### 6. Chạy dev server

```bash
npm run dev
# → http://localhost:3000
```

## 📡 API Endpoints

### 🔐 Auth
```
POST   /api/auth/register          Đăng ký
POST   /api/auth/login             Đăng nhập
POST   /api/auth/refresh-token     Làm mới token
POST   /api/auth/logout            Đăng xuất
GET    /api/auth/me                Thông tin user hiện tại
PATCH  /api/auth/change-password   Đổi mật khẩu
```

### 🛍️ Products
```
GET    /api/products               Danh sách (filter, sort, paginate)
GET    /api/products/:slug         Chi tiết sản phẩm + related
POST   /api/products               Tạo [admin]
PUT    /api/products/:id           Cập nhật [admin]
DELETE /api/products/:id           Ẩn sản phẩm [admin]
```

**Query params cho GET /api/products:**
```
?page=1&limit=12
&category=duong-da     (slug của category)
&search=serum          (tìm kiếm)
&minPrice=100000&maxPrice=500000
&sortBy=price&sortDir=ASC  (price|name|created_at|rating|sold)
&featured=true
&tags=organic,vegan
```

### 📦 Orders
```
POST   /api/orders                 Tạo đơn hàng
GET    /api/orders/my              Lịch sử đơn hàng
GET    /api/orders/:id             Chi tiết đơn
PATCH  /api/orders/:id/cancel      Hủy đơn
PATCH  /api/orders/:id/status      Cập nhật status [admin/staff]
```

### 📅 Bookings (Đặt lịch spa)
```
GET    /api/bookings/slots         Slot còn trống theo ngày & service
POST   /api/bookings               Đặt lịch (không cần đăng nhập)
GET    /api/bookings/my            Lịch hẹn của tôi
PATCH  /api/bookings/:id/cancel    Hủy lịch
```

### 📝 Blog
```
GET    /api/blog                   Danh sách bài viết
GET    /api/blog/:slug             Chi tiết bài viết
POST   /api/blog                   Tạo bài [admin/staff]
```

### ⭐ Reviews
```
GET    /api/reviews/product/:id    Đánh giá của sản phẩm
POST   /api/reviews                Đăng đánh giá [auth]
```

### 👤 Users
```
PATCH  /api/users/profile          Cập nhật profile
GET    /api/users/wishlist         Danh sách yêu thích
POST   /api/users/wishlist/:id     Thêm vào yêu thích
DELETE /api/users/wishlist/:id     Xóa khỏi yêu thích
GET    /api/users                  Danh sách users [admin]
```

## 🏗️ Cấu trúc project

```
verdure-backend/
├── src/
│   ├── server.js              ← Entry point
│   ├── config/
│   │   ├── db.js              ← PostgreSQL pool
│   │   ├── migrate.js         ← Tạo bảng
│   │   └── seed.js            ← Data mẫu
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── product.routes.js
│   │   ├── order.routes.js
│   │   ├── booking.routes.js
│   │   ├── blog.routes.js
│   │   ├── category.routes.js
│   │   ├── user.routes.js
│   │   └── review.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── product.controller.js
│   │   ├── order.controller.js
│   │   └── booking.controller.js
│   └── middleware/
│       ├── auth.middleware.js  ← JWT, requireRole
│       └── validate.middleware.js
├── .env.example
├── package.json
└── README.md
```

## 🗃️ Database Schema

```
users           → Tài khoản (customer, staff, admin)
categories      → Danh mục sản phẩm (có thể lồng nhau)
products        → Sản phẩm (JSONB images, text[] tags)
orders          → Đơn hàng
order_items     → Chi tiết đơn (snapshot giá)
services        → Dịch vụ spa
bookings        → Lịch hẹn (unique slot constraint)
blog_posts      → Bài viết
reviews         → Đánh giá sản phẩm
coupons         → Mã giảm giá
wishlists       → Yêu thích
```

## 🔒 Security

- Helmet (HTTP headers bảo mật)
- CORS whitelist
- Rate limiting (100 req/15min, 10 login/hour)
- JWT với refresh token rotation
- Bcrypt cost factor 12
- SQL parameterized queries (không có SQL injection)
- Input validation với express-validator

## 🚀 Deploy lên Production

### Supabase (database) + Railway (server)

```bash
# 1. Push code lên GitHub
# 2. Tạo project Railway → Connect GitHub → Deploy
# 3. Thêm env variables trong Railway dashboard
# 4. Chạy migration
railway run npm run migrate
```

### Environment Production cần thêm:
```
NODE_ENV=production
PORT=3000
DB_SSL=true
```

## 📝 Bước tiếp theo

- [ ] Tích hợp VNPay/MoMo webhook
- [ ] Email xác nhận đơn hàng (Nodemailer)
- [ ] Upload ảnh Cloudinary
- [ ] Admin dashboard (React hoặc Next.js)
- [ ] Redis cache cho product listings
- [ ] Elasticsearch cho tìm kiếm nâng cao
