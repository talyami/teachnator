# Teachnator - Deployment & Website Push Guide

This guide details how to host and deploy **Teachnator** in its dedicated website folder and URL route (`/teachnator/`).

---

## 1. Architecture & URL Routing

Teachnator is served with canonical subpath prefix `/teachnator/`:
- **Web URL**: `https://villa.linkflow.page/teachnator/` (or your domain root/subpath).
- **Backend Node Port**: Default loopback `3025`.
- **Public Website Directory on VPS**: `/home/villa.linkflow.page/public_html/teachnator/`
- **Application Directory on VPS**: `/home/villa.linkflow.page/teachnator/` (or `/opt/teachnator/`)

---

## 2. Nginx Reverse Proxy Configuration

Add the following to your Nginx HTTPS server block (see `config/nginx-teachnator.conf`):

```nginx
# Canonical /teachnator/ path routing
location = /teachnator { return 308 /teachnator/; }
location /teachnator/ {
    proxy_pass http://127.0.0.1:3025/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 30m;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
    proxy_buffering off;
}

# Optional backward compatibility (redirects /fast-learning to /teachnator)
location = /fast-learning { return 308 /teachnator/; }
location /fast-learning/ { return 308 /teachnator/; }
```

Reload Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Local Build & Push to Website Folder via SSH / SCP

From your local machine:

### Step 3.1: Build frontend bundle
```bash
npm run check
npm run build
```

### Step 3.2: Create remote folders on the server
```bash
ssh samantha@31.97.182.123 "mkdir -p /home/villa.linkflow.page/public_html/teachnator /home/villa.linkflow.page/teachnator"
```

### Step 3.3: Sync compiled web assets to the website folder
```bash
# Upload web build (dist contains index.html and assets/)
scp -r dist/* samantha@31.97.182.123:/home/villa.linkflow.page/public_html/teachnator/
```

### Step 3.4: Sync backend application files
```bash
# Upload application source, scripts, and PM2 ecosystem
scp -r dist frontend server.js auth.js db.js ai_proxy.js legal_pages.js error_tracking.js quiz_generation.js material_quota.js progress_validation.js retention_policy.js monitoring.js payment_service.js package.json package-lock.json ecosystem.config.cjs scripts config samantha@31.97.182.123:/home/villa.linkflow.page/teachnator/
```

---

## 4. On the Server (PM2 / Systemd)

SSH into your server:
```bash
ssh samantha@31.97.182.123
cd /home/villa.linkflow.page/teachnator
npm ci --omit=dev
npm run db:migrate
pm2 reload ecosystem.config.cjs || pm2 start ecosystem.config.cjs
```
