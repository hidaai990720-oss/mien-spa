# 🌿 Verdure Spa — Deploy trên Fedora (Local/VPS)

## Tóm tắt những gì cần cài

```
Fedora (fresh) → Git → Node.js 20 → PM2 → PostgreSQL → Nginx → Certbot
```

---

## Chạy script tự động (khuyến nghị)

```bash
# 1. Copy script lên máy
scp setup-fedora.sh user@your-server:~/

# 2. Cấp quyền và chạy
chmod +x setup-fedora.sh
sudo ./setup-fedora.sh
```

Script sẽ cài tất cả trong ~5 phút.

---

## Hoặc cài thủ công từng bước

### Bước 1 — Update hệ thống

```bash
sudo dnf update -y
sudo dnf install -y git curl wget openssl gcc make
```

### Bước 2 — Node.js 20 LTS

```bash
# Thêm NodeSource repo (chính thức, không dùng dnf mặc định vì version cũ)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Kiểm tra
node --version   # → v20.x.x
npm --version    # → 10.x.x
```

> ⚠️ **Không dùng** `sudo dnf install nodejs` trực tiếp — Fedora repo thường có Node.js 16/18 cũ.

### Bước 3 — PM2 (giữ Node.js chạy nền)

```bash
sudo npm install -g pm2

# Tự khởi động khi reboot
pm2 startup systemd
# Copy lệnh mà PM2 in ra, paste và chạy (có sudo)
```

### Bước 4 — PostgreSQL 16

```bash
# Cài PostgreSQL
sudo dnf install -y postgresql-server postgresql-contrib

# Khởi tạo lần đầu (bắt buộc)
sudo postgresql-setup --initdb

# Bật và khởi động
sudo systemctl enable postgresql --now

# Tạo user và DB
sudo -u postgres psql <<SQL
CREATE USER verdure WITH PASSWORD 'VerdureSpa@2025!';
CREATE DATABASE verdure_spa OWNER verdure;
GRANT ALL ON DATABASE verdure_spa TO verdure;
SQL
```

### Bước 5 — Nginx

```bash
sudo dnf install -y nginx
sudo systemctl enable nginx --now
```

Tạo file `/etc/nginx/conf.d/verdure-spa.conf`:

```nginx
server {
    listen 80;
    server_name api.verdurespa.vn;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 10M;
    }
}

server {
    listen 80;
    server_name verdurespa.vn www.verdurespa.vn;
    root /var/www/verdure-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo nginx -t        # Kiểm tra config
sudo systemctl reload nginx
```

### Bước 6 — SSL với Let's Encrypt

```bash
sudo dnf install -y certbot python3-certbot-nginx

# Lấy cert (cần domain đã trỏ DNS về máy này trước)
sudo certbot --nginx -d verdurespa.vn -d www.verdurespa.vn -d api.verdurespa.vn

# Tự gia hạn (certbot tự thêm cron, kiểm tra lại)
sudo systemctl status certbot-renew.timer
```

### Bước 7 — Mở firewall

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## Deploy code lên server

```bash
# Clone repo
cd ~
git clone https://github.com/YOU/verdure-spa.git
cd verdure-spa/backend

# Cài dependencies
npm install --production

# Tạo .env (copy từ .env.example rồi điền)
cp .env.example .env
nano .env   # Điền DB_PASSWORD, JWT_SECRET, ...

# Chạy migration
npm run migrate

# Khởi động với PM2
pm2 start src/server.js --name verdure-api --env production
pm2 save   # Lưu để tự restore khi reboot
```

### Deploy frontend

```bash
# Copy file HTML vào thư mục nginx
sudo mkdir -p /var/www/verdure-frontend
sudo cp -r verdure-spa/frontend/* /var/www/verdure-frontend/
sudo chown -R nginx:nginx /var/www/verdure-frontend
```

---

## Kiểm tra sau deploy

```bash
# Backend health
curl http://localhost:3000/health
# → {"status":"ok","db":"connected"}

# PM2 status
pm2 status
pm2 logs verdure-api --lines 50

# Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# PostgreSQL
sudo systemctl status postgresql
```

---

## Update code khi có thay đổi

```bash
cd ~/verdure-spa
git pull origin main

cd backend
npm install --production
pm2 restart verdure-api

# Nếu có migration mới
npm run migrate

# Frontend
sudo cp -r ../frontend/* /var/www/verdure-frontend/
```

---

## Cheat sheet lệnh thường dùng

| Lệnh | Dùng để |
|------|---------|
| `pm2 status` | Xem trạng thái app |
| `pm2 logs verdure-api` | Xem logs realtime |
| `pm2 restart verdure-api` | Restart app |
| `pm2 monit` | Dashboard realtime |
| `sudo systemctl restart nginx` | Restart Nginx |
| `sudo -u postgres psql verdure_spa` | Vào PostgreSQL |
| `sudo certbot renew --dry-run` | Test gia hạn SSL |
| `sudo journalctl -u nginx -f` | Nginx system logs |
