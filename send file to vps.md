# Fast Learning Rebuild (v2) - Deployment Guide

## 1. Local Build
Build both frontend (`web/dist`) and backend (`server/dist`):
```bash
npm run build
```

## 2. Sync Files to VPS
Upload files to the VPS directory:
```bash
# Upload web build (static assets)
scp -r web/dist/* samantha@31.97.182.123:/home/villa.linkflow.page/public_html/fast-learning/

# Upload server build & configurations
scp -r server/dist package.json ecosystem.config.cjs samantha@31.97.182.123:/home/villa.linkflow.page/fast-learning/
```

## 3. On the VPS (SSH)
```bash
cd /home/villa.linkflow.page/fast-learning
npm install --omit=dev
npm run migrate
pm2 reload ecosystem.config.cjs || pm2 start ecosystem.config.cjs
```
