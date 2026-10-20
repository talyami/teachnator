const jwt = require('jsonwebtoken');
const { query } = require('./db');

// Pure validation: startup owns environment loading, logging and process lifetime.
function validateAuthConfiguration(env = process.env) {
  const jwtSecret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  const googleClientId = typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '';
  if (!jwtSecret.trim()) throw Object.assign(new Error('JWT_SECRET environment variable is missing.'), { status: 503 });
  if (!googleClientId) throw Object.assign(new Error('GOOGLE_CLIENT_ID environment variable is missing.'), { status: 503 });
  return { jwtSecret, googleClientId };
}

// Only explicitly configured ADMIN_EMAILS are auto-promoted on verified Google sign-in.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const JWT_ISSUER = process.env.JWT_ISSUER || 'fast-learning';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'fast-learning-web';
const validEmail = email => typeof email === 'string' && email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const authFailure = (status, message) => Object.assign(new Error(message), { status });

function parseCookies(cookieHeader) {
  const out = Object.create(null);
  if (typeof cookieHeader !== 'string' || !cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch (_) { out[k] = v; }
    }
  }
  return out;
}

// Bearer-only sessions: no ambient cookie authentication or hidden login state.
function generateToken(user) {
  if (!Number.isSafeInteger(Number(user.id)) || Number(user.id) < 1 || !validEmail(user.email) ||
      !Number.isSafeInteger(Number(user.session_version)) || Number(user.session_version) < 0) {
    throw authFailure(503, 'Session configuration unavailable.');
  }
  return jwt.sign(
    { id: Number(user.id), email: user.email, sessionVersion: Number(user.session_version) },
    validateAuthConfiguration().jwtSecret,
    { algorithm: 'HS256', expiresIn: '7d', subject: String(user.id), issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
}

// التحقق من صحة توكن جوجل عبر Google TokenInfo API
async function verifyGoogleToken(idToken) {
  const { googleClientId } = validateAuthConfiguration();
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 16384) {
    throw authFailure(400, 'Invalid Google identity token.');
  }
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!res.ok) {
      throw new Error(`Google token verification failed with status: ${res.status}`);
    }
    const payload = await res.json();
    if (payload.aud !== googleClientId) {
      throw new Error('Google token audience does not match GOOGLE_CLIENT_ID');
    }
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
      throw new Error('Invalid Google token issuer');
    }
    const expires = Number(payload.exp);
    if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) ||
        typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub) || !validEmail(payload.email)) {
      throw new Error('Invalid Google identity claims');
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
    throw authFailure(401, 'Google identity verification failed.');
  }
}

// جلب أو إنشاء المستخدم في قاعدة البيانات
async function findOrCreateUser({ email, name, avatar, provider, providerId }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!validEmail(normalizedEmail) || typeof providerId !== 'string' || !providerId || providerId.length > 255) {
    throw new Error('البريد الإلكتروني مطلوب لإنشاء الحساب');
  }

  const isAdmin = Boolean(normalizedEmail && ADMIN_EMAILS.includes(normalizedEmail));

  let users = [];
  if (normalizedEmail) {
    users = await query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
  } else if (providerId) {
    users = await query('SELECT * FROM users WHERE provider_id = ? AND auth_provider = ?', [providerId, provider]);
  }

  let user = null;

  if (users.length > 0) {
    user = users[0];
    if (user.status === 'banned') {
      const err = new Error('تم إيقاف هذا الحساب. يرجى التواصل مع الإدارة.');
      err.status = 403;
      throw err;
    }
    const newRole = isAdmin ? 'admin' : user.role;
    const newAiAccess = isAdmin ? 1 : user.has_server_ai_access;

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
    const initialRole = isAdmin ? 'admin' : 'user';
    const initialAiAccess = isAdmin ? 1 : (process.env.DEFAULT_AI_ACCESS === 'true' ? 1 : 0);

    const result = await query(
      `INSERT INTO users (email, name, avatar, auth_provider, provider_id, role, status, has_server_ai_access, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
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
  req.user = null;
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  if (typeof authHeader !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authHeader)) {
    return res.status(401).json({ success: false, message: 'Invalid authorization header.' });
  }
  let configuration;
  try { configuration = validateAuthConfiguration(); }
  catch (_) { return res.status(503).json({ success: false, message: 'Authentication configuration unavailable.' }); }
  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), configuration.jwtSecret, {
      algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE
    });
    if (!Number.isSafeInteger(decoded.id) || decoded.id < 1 || decoded.sub !== String(decoded.id) ||
        !Number.isSafeInteger(decoded.exp) || !validEmail(decoded.email) ||
        !Number.isSafeInteger(decoded.sessionVersion) || decoded.sessionVersion < 0) throw new Error('Invalid claims');
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Invalid authentication.' });
  }
  try {
    // A fresh database read on every authenticated request makes bans/role changes immediate.
    const [user] = await query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    if (user.status === 'banned') return res.status(403).json({ success: false, message: 'Account suspended.' });
    if (user.status !== 'active' || !Number.isSafeInteger(Number(user.session_version)) ||
        Number(user.session_version) !== decoded.sessionVersion || user.email !== decoded.email) {
      return res.status(401).json({ success: false, message: 'Session revoked. Sign in again.' });
    }
    req.user = user;
  } catch (_) {
    return res.status(503).json({ success: false, message: 'Authentication service unavailable.' });
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
  findOrCreateUser,
  authenticateToken,
  requireAuth,
  requireAdmin,
  parseCookies,
  ADMIN_EMAILS,
  validateAuthConfiguration
};
