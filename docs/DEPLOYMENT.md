# Pixora QR Platform — Production Deployment Guide

This document details how to host and deploy the PixoraQR platform to public staging or production clusters.

---

## 🌎 Client-Side Frontend (React + Vite)
The client Workspace can be deployed directly to static hosting platforms such as **Vercel**, **Netlify**, or **Cloudflare Pages**.

### Steps for Vercel / Netlify:
1. Link your GitHub repository to Vercel/Netlify.
2. Configure build settings:
   - **Build Command:** `npm run build -w client` (or `cd client && npm run build`)
   - **Publish Directory:** `client/dist`
3. Configure Environment Variables:
   - `VITE_API_BASE_URL`: URL to your deployed Express API (e.g. `https://api.yourdomain.com/api/v1`)
4. **Important SPA Routing Note:**
   Ensure your static host has redirection configured for Single Page Applications (SPA) so all deep routing falls back to `index.html`.
   - On Netlify: Create a `client/public/_redirects` file containing: `/* /index.html 200`.
   - On Vercel: Already supplied in `netlify.toml` / static configs.

---

## ⚙️ Backend Server (Express + Node.js)
The server Workspace can be hosted on containerized Node.js platforms such as **Render**, **Railway**, or **Fly.io**.

### Configs:
- **Build Command:** `npm run build -w server` (or `cd server && npm run build`)
- **Start Command:** `node server/dist/index.js` (or `npm start -w server`)

### Required Production Environment Variables:
```env
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pixora?retryWrites=true&w=majority

# Security Secrets (Must be at least 32 cryptographically secure characters)
JWT_ACCESS_SECRET=your_super_secure_access_secret_key_here
JWT_REFRESH_SECRET=your_super_secure_refresh_secret_key_here

# Cloudinary signed uploads
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Emails (Resend)
EMAIL_ENABLED=true
EMAIL_FROM=onboarding@resend.dev
RESEND_API_KEY=re_your_resend_api_key_here

# CORS Origins (Tight security)
CLIENT_URL=https://yourdomain.com
SOCKET_CORS_ORIGIN=https://yourdomain.com
```

---

## 🗄️ Database (MongoDB Atlas)
Set up a managed MongoDB Cluster on **MongoDB Atlas** (Shared Free-tier M0 is sufficient for launch):
1. Create a free Atlas database cluster.
2. In Network Access, allow access from `0.0.0.0/0` (or add your hosting provider's IP range).
3. Under Database Access, create a database user with read/write permissions.
4. Copy the connection string (`MONGODB_URI`) and populate it in your server's production settings.
