#!/bin/bash
# ================================================================
#  VERDURE SPA — Fedora Setup Script
#  Chạy: chmod +x setup-fedora.sh && sudo ./setup-fedora.sh
# ================================================================

set -e  # Dừng ngay nếu có lỗi

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
head() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Kiểm tra chạy với sudo
[[ $EUID -ne 0 ]] && err "Cần chạy với sudo: sudo ./setup-fedora.sh"

ACTUAL_USER=${SUDO_USER:-$USER}
HOME_DIR=$(eval echo "~$ACTUAL_USER")

echo -e "${BOLD}"
echo "  🌿 Verdure Spa — Fedora Environment Setup"
echo "  ============================================"
echo -e "${NC}"
echo "  User    : $ACTUAL_USER"
echo "  Home    : $HOME_DIR"
echo "  Fedora  : $(cat /etc/fedora-release 2>/dev/null || echo 'Unknown')"
echo ""

# ================================================================
head "1. Cập nhật hệ thống"
# ================================================================
info "Cập nhật package list..."
dnf update -y -q
log "Hệ thống đã được cập nhật"

# ================================================================
head "2. Cài công cụ cơ bản"
# ================================================================
info "Cài git, curl, wget, unzip, tar, gcc, make..."
dnf install -y -q \
    git \
    curl \
    wget \
    unzip \
    tar \
    gcc \
    gcc-c++ \
    make \
    openssl \
    openssl-devel \
    ca-certificates \
    gnupg2 \
    htop \
    vim \
    nano

log "Công cụ cơ bản đã cài xong"

# ================================================================
head "3. Cài Node.js 20 LTS (qua NodeSource)"
# ================================================================
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    warn "Node.js đã cài: $NODE_VER"
    # Kiểm tra version đủ mới chưa
    NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
    if [[ $NODE_MAJOR -lt 18 ]]; then
        warn "Version quá cũ, sẽ cài lại Node.js 20..."
        dnf remove -y nodejs npm 2>/dev/null || true
    else
        log "Node.js version OK: $NODE_VER"
    fi
fi

if ! command -v node &>/dev/null || [[ $(node --version | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    info "Cài NodeSource repo cho Node.js 20 LTS..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
    log "Node.js $(node --version) đã cài"
    log "npm $(npm --version) đã cài"
fi

# ================================================================
head "4. Cài PM2 (Process Manager)"
# ================================================================
if ! command -v pm2 &>/dev/null; then
    info "Cài PM2 globally..."
    npm install -g pm2
    # PM2 tự khởi động khi reboot
    pm2 startup systemd -u $ACTUAL_USER --hp $HOME_DIR 2>/dev/null | tail -1 | bash 2>/dev/null || true
    log "PM2 $(pm2 --version) đã cài"
else
    log "PM2 đã cài: $(pm2 --version)"
fi

# ================================================================
head "5. Cài PostgreSQL 16"
# ================================================================
if command -v psql &>/dev/null; then
    log "PostgreSQL đã cài: $(psql --version)"
else
    info "Thêm PostgreSQL repo..."
    dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/F-$(rpm -E %fedora)-x86_64/pgdg-fedora-repo-latest.noarch.rpm -q 2>/dev/null || \
    dnf install -y postgresql-server postgresql -q

    info "Khởi tạo PostgreSQL database..."
    if [[ -f /usr/bin/postgresql-setup ]]; then
        postgresql-setup --initdb 2>/dev/null || true
    elif [[ -f /usr/pgsql-16/bin/postgresql-16-setup ]]; then
        /usr/pgsql-16/bin/postgresql-16-setup initdb
    fi

    systemctl enable postgresql --now 2>/dev/null || \
    systemctl enable postgresql-16 --now 2>/dev/null || true

    log "PostgreSQL đã cài và đang chạy"
fi

# ================================================================
head "6. Tạo PostgreSQL database và user"
# ================================================================
DB_NAME="verdure_spa"
DB_USER="verdure"
DB_PASS="VerdureSpa@2025!"

info "Tạo user '$DB_USER' và database '$DB_NAME'..."
sudo -u postgres psql 2>/dev/null <<EOSQL || warn "DB có thể đã tồn tại, bỏ qua..."
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
  END IF;
END \$\$;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOSQL

log "Database '$DB_NAME' sẵn sàng"

# ================================================================
head "7. Cài Nginx (Reverse Proxy)"
# ================================================================
if ! command -v nginx &>/dev/null; then
    info "Cài Nginx..."
    dnf install -y nginx -q
    systemctl enable nginx --now
    log "Nginx đã cài và đang chạy"
else
    log "Nginx đã cài: $(nginx -v 2>&1)"
fi

# ================================================================
head "8. Cấu hình Nginx cho Verdure Spa"
# ================================================================
cat > /etc/nginx/conf.d/verdure-spa.conf <<'NGINX'
# ── Backend API ───────────────────────────────────────────────
server {
    listen 80;
    server_name api.verdurespa.vn localhost;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;

        # Upload files
        client_max_body_size 10M;
    }
}

# ── Frontend ──────────────────────────────────────────────────
server {
    listen 80;
    server_name verdurespa.vn www.verdurespa.vn;
    root /var/www/verdure-frontend;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

# Tạo thư mục frontend
mkdir -p /var/www/verdure-frontend
chown -R $ACTUAL_USER:$ACTUAL_USER /var/www/verdure-frontend

# Test config Nginx
nginx -t && systemctl reload nginx
log "Nginx đã cấu hình xong"

# ================================================================
head "9. Cài Certbot (SSL Let's Encrypt)"
# ================================================================
if ! command -v certbot &>/dev/null; then
    info "Cài Certbot..."
    dnf install -y certbot python3-certbot-nginx -q
    log "Certbot đã cài: $(certbot --version 2>&1)"
else
    log "Certbot đã cài"
fi

# ================================================================
head "10. Firewall (firewalld)"
# ================================================================
if systemctl is-active --quiet firewalld; then
    info "Mở port 80 (HTTP) và 443 (HTTPS)..."
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    log "Firewall đã mở port 80 và 443"
else
    warn "firewalld không chạy — bỏ qua cấu hình firewall"
fi

# ================================================================
head "11. Tạo file .env cho backend"
# ================================================================
BACKEND_DIR="$HOME_DIR/verdure-spa/backend"
mkdir -p $BACKEND_DIR

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    JWT_SECRET=$(openssl rand -hex 64)
    JWT_REFRESH=$(openssl rand -hex 64)

    cat > $BACKEND_DIR/.env <<ENVFILE
# =============================================
# VERDURE SPA — Production Environment
# Tạo tự động bởi setup-fedora.sh
# =============================================
NODE_ENV=production
PORT=3000

# Database (local PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS

# JWT (đã generate ngẫu nhiên — KHÔNG THAY ĐỔI sau khi deploy)
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=$JWT_REFRESH
JWT_REFRESH_EXPIRES_IN=30d

# Client
CLIENT_URL=http://localhost

# Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# TODO: Điền sau
# CLOUDINARY_CLOUD_NAME=
# CLOUDINARY_API_KEY=
# CLOUDINARY_API_SECRET=
# EMAIL_USER=
# EMAIL_PASS=
ENVFILE

    chown $ACTUAL_USER:$ACTUAL_USER $BACKEND_DIR/.env
    chmod 600 $BACKEND_DIR/.env
    log ".env đã tạo tại $BACKEND_DIR/.env"
    warn "JWT secrets đã được generate ngẫu nhiên — lưu lại file này!"
else
    log ".env đã tồn tại — bỏ qua"
fi

# ================================================================
head "12. Cài Railway CLI & Vercel CLI"
# ================================================================
info "Cài Railway CLI..."
npm install -g @railway/cli 2>/dev/null && log "Railway CLI đã cài" || warn "Railway CLI cài thất bại (cần Node.js)"

info "Cài Vercel CLI..."
npm install -g vercel 2>/dev/null && log "Vercel CLI đã cài" || warn "Vercel CLI cài thất bại"

# ================================================================
head "✅ Hoàn tất!"
# ================================================================
echo ""
echo -e "${BOLD}Phần mềm đã cài:${NC}"
echo -e "  ${GREEN}●${NC} Node.js    $(node --version 2>/dev/null)"
echo -e "  ${GREEN}●${NC} npm        $(npm --version 2>/dev/null)"
echo -e "  ${GREEN}●${NC} PM2        $(pm2 --version 2>/dev/null)"
echo -e "  ${GREEN}●${NC} PostgreSQL $(psql --version 2>/dev/null | head -1)"
echo -e "  ${GREEN}●${NC} Nginx      $(nginx -v 2>&1)"
echo -e "  ${GREEN}●${NC} Certbot    $(certbot --version 2>&1)"
echo -e "  ${GREEN}●${NC} Git        $(git --version)"
echo ""
echo -e "${BOLD}Database:${NC}"
echo -e "  DB Name   : ${CYAN}$DB_NAME${NC}"
echo -e "  DB User   : ${CYAN}$DB_USER${NC}"
echo -e "  DB Pass   : ${YELLOW}$DB_PASS${NC}  ← đổi ngay!"
echo ""
echo -e "${BOLD}Bước tiếp theo:${NC}"
echo -e "  ${BLUE}1.${NC} cd $HOME_DIR && git clone https://github.com/YOU/verdure-spa.git"
echo -e "  ${BLUE}2.${NC} cd verdure-spa/backend && npm install"
echo -e "  ${BLUE}3.${NC} npm run migrate"
echo -e "  ${BLUE}4.${NC} pm2 start src/server.js --name verdure-api"
echo -e "  ${BLUE}5.${NC} pm2 save"
echo -e "  ${BLUE}6.${NC} certbot --nginx -d verdurespa.vn -d api.verdurespa.vn"
echo ""
echo -e "  📄 Chi tiết: xem file ${CYAN}DEPLOY-LOCAL.md${NC}"
echo ""
