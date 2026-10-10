const path = require('path');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is missing.');
  process.exit(1);
}
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'talyami@gmail.com,admin@villa.linkflow.page')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// توليد رمز JWT للجلسة
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      has_server_ai_access: user.has_server_ai_access
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// التحقق من صحة توكن جوجل عبر Google TokenInfo API
async function verifyGoogleToken(idToken) {
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google token verification failed with status: ${res.status}`);
    }
    const payload = await res.json();
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (googleClientId && payload.aud !== googleClientId) {
      throw new Error('Google token audience does not match GOOGLE_CLIENT_ID');
    }
    const isEmailVerified = payload.email_verified === 'true' || payload.email_verified === true;
    if (!isEmailVerified) {
      throw new Error('Google email is not verified');
    }
    return {
      email: payload.email,
      name: payload.name || payload.given_name || payload.email.split('@')[0],
      avatar: payload.picture || '',
      providerId: payload.sub,
      emailVerified: true
    };
  } catch (err) {
    console.error('Error verifying Google token:', err.message);
    throw new Error('فشل التحقق من تسجيل دخول جوجل: ' + err.message);
  }
}

// فك تشفير توكن آبل بأمان
function parseAppleToken(idToken) {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) throw new Error('Invalid Apple token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return {
      email: payload.email || '',
      providerId: payload.sub || ''
    };
  } catch (err) {
    console.error('Error parsing Apple token:', err.message);
    throw new Error('فشل معالجة رمز تسجيل دخول Apple: ' + err.message);
  }
}

// جلب أو إنشاء المستخدم في قاعدة البيانات
async function findOrCreateUser({ email, name, avatar, provider, providerId }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail && !providerId) {
    throw new Error('البريد الإلكتروني مطلوب لإنشاء الحساب');
  }

  // فحص هل البريد ضمن قائمة المشرفين
  const isAdmin = ADMIN_EMAILS.includes(normalizedEmail);

  // البحث عن المستخدم
  let users = [];
  if (normalizedEmail) {
    users = await query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
  } else if (providerId) {
    users = await query('SELECT * FROM users WHERE provider_id = ? AND auth_provider = ?', [providerId, provider]);
  }

  let user = null;

  if (users.length > 0) {
    user = users[0];
    const newRole = isAdmin ? 'admin' : user.role;
    const newAiAccess = isAdmin ? 1 : user.has_server_ai_access;
    
    // تحديث بيانات المستخدم وتاريخ آخر تسجيل دخول
    await query(
      `UPDATE users SET 
        name = COALESCE(NULLIF(?, ''), name),
        avatar = COALESCE(NULLIF(?, ''), avatar),
        role = ?,
        has_server_ai_access = ?,
        last_login = NOW()
      WHERE id = ?`,
      [name || '', avatar || '', newRole, newAiAccess, user.id]
    );

    user.role = newRole;
    user.has_server_ai_access = newAiAccess;
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
  } else {
    // إنشاء مستخدم جديد
    const initialRole = isAdmin ? 'admin' : 'user';
    const initialAiAccess = isAdmin ? 1 : (process.env.DEFAULT_AI_ACCESS === 'true' ? 1 : 0);

    const result = await query(
      `INSERT INTO users (email, name, avatar, auth_provider, provider_id, role, has_server_ai_access, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [normalizedEmail, name || normalizedEmail.split('@')[0], avatar || '', provider, providerId || '', initialRole, initialAiAccess]
    );

    const insertedId = result.insertId;
    const newUsers = await query('SELECT * FROM users WHERE id = ?', [insertedId]);
    user = newUsers[0];
  }

  return user;
}

// وسيط (Middleware) للتحقق من هوية المستخدم المسجل
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // جلب أحدث بيانات المستخدم من القاعدة
    const users = await query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (users.length > 0) {
      req.user = users[0];
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }

  next();
}

// وسيط إلزامية تسجيل الدخول
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
  }
  next();
}

// وسيط إلزامية صلاحيات المشرف
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'هذا الإجراء مخصص للمشرف فقط' });
  }
  next();
}

module.exports = {
  generateToken,
  verifyGoogleToken,
  parseAppleToken,
  findOrCreateUser,
  authenticateToken,
  requireAuth,
  requireAdmin,
  ADMIN_EMAILS
};
