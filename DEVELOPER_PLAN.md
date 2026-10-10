# Fast Learning: Developer Plan for the Accounts Rebuild

This plan rebuilds the accounts, admin and free-user parts of Fast Learning from scratch. It keeps the current hosting (Node, MySQL and Nginx on the VPS, served under `/fast-learning`) and starts the interface again from `index-before-accounts.html`, the version before accounts were added.

Decisions already made:

- **Language:** TypeScript for the frontend and the server.
- **Guests:** can use the app with their own Gemini key, with limits (section 9).
- **Sign-in:** Google and Apple, both in the first release.
- **Existing data:** start fresh. Old accounts and saved materials are not migrated.

---

## 1. Goals

1. **Real sign-in.** Google and Apple, with every token verified on the server and no fallbacks.
2. **Admins decided only on the server.** No admin button in the interface, no way to choose your own role.
3. **Free users with a real limit.** Signed-in users get a daily AI allowance on the server key. The server enforces it, so the browser can't get around it.
4. **Users' own keys.** A user with their own Gemini key uses it from the browser. It is never sent to or stored on the server.
5. **Saving and resuming that work.** Every quiz attempt saves its full state, and resume puts the user back exactly where they were, on any device.
6. **Dedicated or shared server keys.** The admin can assign a dedicated key to a specific user or group, or let them use the default shared pool, isolating rate limits.
7. **Maintainable code.** The single 6,000-line HTML file becomes a proper frontend project with a build step, and the server gets a clear folder structure.

---

## 2. Phase 0: emergency fixes on the live server

The live version lets anyone sign in as admin and use the server's Gemini key. These fixes go into the current code before the rebuild starts:

- [ ] `server.js`: only register `/api/auth/dev-login` when `NODE_ENV === 'development'`. In production it must return 404.
- [ ] `/api/auth/google`: remove the `clientUser` fallback. If Google's verification fails, refuse the login. Also refuse it if `email_verified` is false or the token's `aud` isn't `GOOGLE_CLIENT_ID`.
- [ ] `/api/auth/apple`: refuse every login until Apple sign-in is implemented properly (Phase 2).
- [ ] `auth.js`: stop the server from starting if `JWT_SECRET` is missing. Set a new random secret in `.env`, which also logs everyone out.
- [ ] `index.html`: remove the two dev-login buttons ("دخول كمشرف" and "دخول كطالب") and the `prompt()` email fallbacks on the Google and Apple buttons.
- [ ] `server.js`: replace `express.static(__dirname)` with a dedicated `public/` folder. The current setting hands out `server.js`, `auth.js`, `schema.sql`, the deploy guide and `node_modules` to anyone who asks.
- [ ] MySQL: run `SELECT id, email, role, has_server_ai_access FROM users;` and remove admin or AI access from anyone who shouldn't have it.

---

## 3. Architecture

```
Browser (React app, built with Vite)
   │  same origin: https://villa.linkflow.page/fast-learning/
   ▼
Nginx ── /fast-learning/      → static files (web/dist)
      └─ /fast-learning/api/  → Node server (Express), run by pm2
                                   ├─ auth (Google + Apple token verification, sessions)
                                   ├─ AI gateway (allowance check → Gemini / Vertex)
                                   ├─ library (materials, quiz attempts)
                                   └─ admin
                                   ▼
                                MySQL (new database: fast_learning_v2)
```

Key decisions:

- **Sessions use an httpOnly cookie, not a token in `localStorage`.** The session ID lives in a `sessions` table and the cookie is `HttpOnly; Secure; SameSite=Lax; Path=/fast-learning`. Page scripts can't read it, and an admin can revoke a session or ban a user immediately. With the current 30-day JWTs, a banned user stays logged in until the token expires.
- **The server writes the AI prompts.** Today `/api/ai/generate` forwards any request to Google using the server key, so a free user can send anything. The new server has one endpoint per task (generate quiz, evaluate answer, voice), builds the prompt itself, and enforces the model, output length and input size.
- **Users' own keys never touch the server.** They stay in the browser and calls go straight to Google, as in the pre-accounts version. There's nothing on the server to encrypt or leak.
- **Server keys support both shared pools and dedicated assignments.** The default key can come from `.env` or an encrypted key pool in the database. The admin can assign a specific dedicated key to a heavy user or study group so their requests never interfere with or block other users' quotas. All server keys stored in the database are AES-256 encrypted at rest.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | The app already uses React and Tailwind; this adds a build step and types |
| Server data in the UI | TanStack Query | Handles loading, caching and refetching for the library and admin pages |
| Server | Node + Express 5 + TypeScript | Same as now, with types |
| Shared types | `shared/` folder used by both sides | A renamed field becomes a compile error instead of a silent bug |
| Validation | `zod` | Checks request bodies and environment variables |
| Google auth | `google-auth-library` (`verifyIdToken`) | Google's official token verification |
| Apple auth | `jose` with Apple's public keys | Real signature checks |
| Database | MySQL with numbered migration files | Same database server, safe schema changes |
| Security middleware | `helmet`, `express-rate-limit` | Security headers and rate limits |
| Tests | Vitest + Supertest; Playwright for end-to-end flows | |
| Process manager | pm2 with an ecosystem file | Same as now |

---

## 5. Project structure

```
fast-learning/
├─ shared/
│  └─ types.ts                  # request/response types used by web and server
├─ web/                         # frontend
│  ├─ index.html
│  ├─ vite.config.ts            # base: '/fast-learning/'
│  └─ src/
│     ├─ main.tsx, App.tsx
│     ├─ config/limits.ts       # guest and plan limits in one place
│     ├─ api/client.ts          # fetch wrapper, error codes
│     ├─ auth/                  # AuthProvider, useAuth, GoogleSignInButton, AppleSignInButton
│     ├─ ai/                    # aiClient: server allowance vs own key
│     ├─ guest/                 # guest usage counter, local library
│     ├─ audio/                 # binaural beats, pink noise, voice playback
│     ├─ features/
│     │  ├─ create/             # setup, upload, generating
│     │  ├─ study/              # intro, learn, quiz, result
│     │  ├─ library/            # my materials, resume
│     │  ├─ settings/           # own key, voice, audio, linked accounts
│     │  └─ admin/              # stats, users, user detail, audit log
│     └─ i18n/ar.ts             # all Arabic text in one place, RTL
├─ server/
│  └─ src/
│     ├─ index.ts
│     ├─ config.ts              # validated env vars; refuses to start if any are missing
│     ├─ db/ (pool.ts, migrate.ts, seed.ts, migrations/001_init.sql …)
│     ├─ auth/ (google.ts, apple.ts, nonce.ts, sessions.ts, linking.ts, middleware.ts)
│     ├─ ai/ (gemini.ts, prompts/, tasks/generateQuiz.ts, evaluateAnswer.ts, tts.ts)
│     ├─ quota/ (plans.ts, usage.ts)
│     ├─ routes/ (auth, me, materials, attempts, ai, admin)
│     └─ lib/ (errors.ts, validate.ts, audit.ts)
├─ ecosystem.config.cjs
└─ .env.example
```

---

## 6. Data model

```sql
CREATE TABLE api_keys (                       -- pool of server keys (shared or dedicated)
  id          INT AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,          -- e.g. 'Main Shared Pool', 'Salem Dedicated', 'Class B'
  key_value   TEXT NOT NULL,                  -- AES-256 encrypted at rest
  provider    ENUM('gemini','vertex') NOT NULL DEFAULT 'gemini',
  is_default  TINYINT(1) NOT NULL DEFAULT 0,  -- fallback for users without a specific key
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  name           VARCHAR(255) NOT NULL DEFAULT '',
  avatar_url     TEXT,
  role           ENUM('user','admin') NOT NULL DEFAULT 'user',
  plan           ENUM('free','unlimited') NOT NULL DEFAULT 'free',
  daily_ai_limit_override INT NULL,           -- NULL = use the plan's default
  assigned_key_id INT NULL,                   -- NULL = uses default shared key pool; INT = dedicated key
  status         ENUM('active','banned') NOT NULL DEFAULT 'active',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME NULL,
  UNIQUE KEY uq_email (email),
  FOREIGN KEY (assigned_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

CREATE TABLE auth_identities (                -- one user can have Google and Apple linked
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  provider         ENUM('google','apple') NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,     -- the provider's "sub" claim
  provider_email   VARCHAR(255),
  is_private_email TINYINT(1) NOT NULL DEFAULT 0,   -- Apple hidden-email relay
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_subject (provider, provider_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE auth_nonces (                    -- one-time values that stop token replay
  nonce_hash CHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL
);

CREATE TABLE sessions (
  id_hash      CHAR(64) PRIMARY KEY,          -- SHA-256 of the cookie value
  user_id      INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  last_seen_at DATETIME NULL,
  ip           VARCHAR(45),
  user_agent   VARCHAR(255),
  revoked_at   DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE materials (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  source_type     ENUM('text','file','image','mixed') NOT NULL,
  source_name     VARCHAR(255) NOT NULL DEFAULT '',
  content_preview TEXT,
  questions       JSON NOT NULL,
  question_count  INT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  INDEX idx_user (user_id, deleted_at, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE quiz_attempts (                  -- keeps history; replaces user_progress
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  material_id    INT NOT NULL,
  mode           ENUM('learn','quiz') NOT NULL,
  status         ENUM('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
  question_order JSON NOT NULL,               -- the exact shuffled order
  answers        JSON NOT NULL,               -- per question: chosen, correct, time taken
  current_index  INT NOT NULL DEFAULT 0,
  score          INT NOT NULL DEFAULT 0,
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at   DATETIME NULL,
  INDEX idx_resume (user_id, material_id, mode, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE ai_usage (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  task          ENUM('generate_quiz','evaluate_answer','tts','other') NOT NULL,
  units         INT NOT NULL,                 -- what counts against the daily allowance
  model         VARCHAR(100),
  input_tokens  INT,
  output_tokens INT,
  status        ENUM('reserved','ok','error') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_day (user_id, created_at)
);

CREATE TABLE tts_cache (                      -- same text + voice + model = reuse the audio
  hash       CHAR(64) PRIMARY KEY,
  voice      VARCHAR(50),
  model      VARCHAR(100),
  mime_type  VARCHAR(50),
  audio      LONGBLOB,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_audit_log (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id       INT NOT NULL,
  action         VARCHAR(50) NOT NULL,        -- 'set_plan', 'set_limit', 'set_role', 'ban', 'revoke_sessions' …
  target_user_id INT NULL,
  details        JSON,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Sign-in

### Google

1. The page loads Google Identity Services and draws Google's real button with `google.accounts.id.renderButton`. The pop-up prompt the current code uses gets blocked by browsers after it's dismissed a few times.
2. Before showing the button, the browser asks the server for a one-time nonce (`GET /api/auth/nonce`) and passes it to Google.
3. Google gives the browser an ID token, which it sends to `POST /api/auth/google`.
4. The server calls `verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`. It rejects the token unless `email_verified` is true and the nonce matches an unused one, which it then marks as used.
5. The server finds the user through `auth_identities` (`provider='google'`, `provider_subject=sub`), or links or creates one (section 7.3).
6. The server creates a session row and sets the cookie. The response contains the user's profile and nothing secret.

### Apple

What's needed in the Apple developer account first:

1. Membership in the Apple Developer Program ($99 a year).
2. An App ID with "Sign in with Apple" enabled, then a Services ID (for example `page.linkflow.villa.fastlearning`). The Services ID becomes `APPLE_CLIENT_ID`.
3. The domain `villa.linkflow.page` and the return URL `https://villa.linkflow.page/fast-learning/` added to the Services ID.

Flow:

1. The browser gets a nonce from the server, then calls `AppleID.auth.init({ clientId, scope: 'name email', redirectURI, usePopup: true, nonce })` and `AppleID.auth.signIn()`.
2. Apple returns an ID token, plus the user's name on the first sign-in only. The browser sends both to `POST /api/auth/apple`.
3. The server checks the token's signature against Apple's public keys (`https://appleid.apple.com/auth/keys`) with `jose`, plus:
   - the issuer (`iss`) is `https://appleid.apple.com`;
   - the audience (`aud`) is `APPLE_CLIENT_ID`;
   - the token hasn't expired;
   - the nonce matches an unused one.
4. **Apple only sends the name on the first sign-in.** The server saves it straight away, because Apple never sends it again.
5. **Hidden emails.** Users can hide their email, in which case Apple gives a relay address (`…@privaterelay.appleid.com`). The account is matched by Apple's `sub`, not by email, and `is_private_email` is stored.

### Account linking

- If a new sign-in's verified email matches an existing user, it links to that user. Google's email must have `email_verified`; Apple's emails are verified by Apple.
- A hidden-email Apple sign-in creates a separate account.
- Settings has "link Google" and "link Apple" options. A signed-in user can link the other provider, so they can merge their own accounts safely.
- A user can't remove their last remaining sign-in method.

### Admin bootstrap

- Only a verified **Google** email listed in `ADMIN_EMAILS` is promoted to admin automatically, on sign-in, and the promotion is logged.
- Otherwise, a user becomes admin only when an existing admin promotes them from the admin page.
- An admin can't demote or ban themselves.

### Sessions

- Every request: the middleware reads the cookie, looks up the session, and rejects it if it's revoked, expired or the user is banned. Then it attaches the user to the request.
- Sessions last 30 days, renewed while the user is active.
- `POST /api/auth/logout` revokes the current session. An admin can revoke all of a user's sessions.
- Protection against cross-site form attacks: the cookie is `SameSite=Lax`, and every POST, PATCH or DELETE must come from your own site (checked through the `Origin` header).

### Local development

`npm run seed` creates a test admin and a test student and prints a sign-in link for each. It only works when `NODE_ENV=development`. No dev-login route exists in production code.

---

## 8. Signed-in users and the server key

| Who | AI used | Allowance | Cloud save |
|---|---|---|---|
| Signed in, `free` plan | Server key | 20 units per day (adjustable) | Yes |
| Signed in, using own key | Their key, from the browser | Unlimited, on their key | Yes |
| Signed in, `unlimited` plan | Server key | No limit, or a per-user override | Yes |
| Admin | Server key | No limit | Yes, plus the admin page |

### How the allowance works

- Each task costs units:
  - generating a quiz costs 5;
  - evaluating a short answer costs 1;
  - voice costs 1 per 500 characters, and nothing when the audio is already cached.
- Before a call, the server checks the user's units for today (from midnight, Riyadh time) against their limit: the override if set, otherwise the plan's default. It reserves the units in a database transaction, so two requests at the same moment can't both slip past the limit. A failed call gets its units back.
- Errors are structured, for example `{ "error": { "code": "QUOTA_EXCEEDED", "message": "…", "resetsAt": "…" } }`. The interface decides what to show from the `code`, never by searching the message text.
- `GET /api/me` returns `{ plan, dailyLimit, usedToday, resetsAt }` so the interface can show "12 of 20 left today".
- Voice caching matters: the same question is read aloud many times, and with the cache most of those requests cost nothing.

### AI endpoint limits

Every server AI endpoint:

- only allows models from a fixed list;
- caps the output length;
- caps input size (15 MB for quiz generation);
- caps questions per quiz at 50.

### Dedicated vs Shared Key Resolution Hierarchy

When a signed-in user triggers an AI request through the server:

1. **Check dedicated assignment:** Does `users.assigned_key_id` point to an active key in `api_keys`?
   - If **yes**, decrypt and use that specific key. That user's quota and Google rate limits (`RPM/TPM`) are 100% isolated from everyone else.
2. **Fallback to shared pool:** If `assigned_key_id` is `NULL`, use the key marked `is_default = 1` in `api_keys` (or the fallback in `.env`). All standard users share this key safely within their daily allowance.
3. **Group assignment:** The admin can link multiple users (e.g., an entire class or study group) to the same dedicated key in `api_keys`, creating an isolated pool for that group without affecting other users.

### Choosing the AI route in the browser (`web/src/ai/aiClient.ts`)

1. If "use my own key" is on and a key is saved, call Google directly from the browser.
2. Otherwise, if signed in, call the server's task endpoint.
3. Otherwise, show "sign in for free daily use, or add your own key".

---

## 9. Guests (not signed in)

Guests use their own Gemini key from the browser, with these limits:

| | Guest | Signed in |
|---|---|---|
| Quizzes generated per day | 3 | Allowance-based, or unlimited with own key |
| Questions per quiz | Up to 20 | Up to 50 |
| Upload per quiz | 1 file, 10 MB | Several files, 15 MB total |
| AI grading of short answers | Included in the 3 quizzes | Normal |
| Voice narration | First 10 questions of each quiz | Whole quiz |
| Saved materials | Last 5, in this browser only | Unlimited, in the cloud |
| Resume | Same browser, latest quiz only | Any device, full history |

- These limits are enforced in the browser, on purpose. A guest's calls go straight from their browser to Google on their own key, so the limits don't protect anything on the server. They exist to encourage signing in. Clearing browser data resets them, which is acceptable because it costs the server nothing. Making them unbreakable would mean sending guests' keys through the server, which breaks the rule that personal keys never reach it.
- The counter lives in `localStorage` (`guest_usage: { date, quizzes }`).
- A small banner shows "2 of 3 free quizzes left today. Sign in to remove the limit."
- When the limit is reached, the guest sees the sign-in dialog instead of an error.
- All values live in `web/src/config/limits.ts`, so changing them is a one-line edit.

---

## 10. API

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/config` | public | Google and Apple client IDs |
| GET | `/api/auth/nonce` | public | One-time nonce for sign-in |
| POST | `/api/auth/google` | public | Exchange a Google ID token for a session |
| POST | `/api/auth/apple` | public | Exchange an Apple ID token for a session |
| POST | `/api/auth/link/google` | user | Link Google to the current account |
| POST | `/api/auth/link/apple` | user | Link Apple to the current account |
| POST | `/api/auth/logout` | user | Revoke the current session |
| GET | `/api/me` | user | Profile, linked providers, plan, today's usage |
| PATCH | `/api/me` | user | Display name, preferences |
| GET | `/api/materials` | user | Own materials, each with its latest attempt |
| POST | `/api/materials` | user | Save a generated material |
| GET | `/api/materials/:id` | owner | Material with its questions |
| DELETE | `/api/materials/:id` | owner | Soft delete |
| POST | `/api/attempts` | owner | Start an attempt (saves the question order) |
| PATCH | `/api/attempts/:id` | owner | Save an answer and the position |
| GET | `/api/attempts/resume?materialId=&mode=` | owner | Latest unfinished attempt |
| POST | `/api/ai/generate-quiz` | user + allowance | Server builds the prompt and returns questions |
| POST | `/api/ai/evaluate-answer` | user + allowance | Grade a short answer |
| POST | `/api/ai/tts` | user + allowance | Voice audio, cached |
| GET | `/api/admin/stats` | admin | Totals, today's usage, top users |
| GET | `/api/admin/users?search=&page=` | admin | Paged user list |
| GET | `/api/admin/users/:id` | admin | Usage history, sessions, linked providers, material count |
| PATCH | `/api/admin/users/:id` | admin | Set plan, limit override, role, status (all logged) |
| POST | `/api/admin/users/:id/revoke-sessions` | admin | Sign the user out everywhere |
| GET | `/api/admin/audit-log` | admin | Who changed what, and when |
| GET | `/api/admin/keys` | admin | List keys in pool (masked values, user counts) |
| POST | `/api/admin/keys` | admin | Add new server key (label, provider, is_default) |
| DELETE | `/api/admin/keys/:id` | admin | Delete key from pool (reverts users to default) |
| PATCH | `/api/admin/users/:id/key` | admin | Assign dedicated key or revert user to shared pool |
| POST | `/api/admin/test-ai` | admin | Check that the server key works |

Rules for every route:

- Ownership is checked on the server, so changing an ID in a request can't open another user's material or attempt.
- Every request body is validated with `zod`.
- Upload size limits are set per route, not 50 MB everywhere.

---

## 11. Interface

- **Header:** a sign-in button when signed out. When signed in: avatar, a small "12/20 today" indicator, and a menu with My library, Settings and Sign out. The admin link appears only for admins.
- **Sign-in dialog:** Google's and Apple's official buttons and one line explaining the benefits ("save your quizzes and get free daily AI"). No dev buttons and no typing an email.
- **Guest banner:** remaining free quizzes today and a sign-in link.
- **Library:** the user's materials, each with "continue (question 14 of 40)" or "start again", plus past attempts.
- **Settings:**
  - "Own Gemini key", which clearly says the key stays in this browser;
  - linked accounts (Google and Apple);
  - the voice and audio settings from the current version.
- **Admin page:**
  - stats cards;
  - a searchable, paged user table with plan, usage today, last login, linked providers, assigned key, and status;
  - a user detail page to change plan, limit, assigned key (dedicated or shared), role and ban status, and to revoke sessions;
  - **Key Pool tab:** list all server keys with labels, usage indicators, dedicated user counts, and add/test/delete controls;
  - the audit log;
  - the server-key status and a test button.
- **When the allowance runs out:** a clear message with the reset time and an "add your own key" option, not a raw error.

---

## 12. Starting fresh

- Old accounts, saved materials and progress are not migrated.
- At go-live:
  1. take a full `mysqldump` backup of `fast_learning_db`;
  2. create the new schema in a new database, `fast_learning_v2`, and point the server at it;
  3. after a month without problems, delete the old database.
- Everyone signs in again. The admin account is created automatically from `ADMIN_EMAILS` on the first Google sign-in.

---

## 13. Security checklist

- [ ] No dev-login routes in production (a test checks they return 404)
- [ ] Google tokens verified for audience, issuer, expiry, `email_verified` and nonce; no fallback
- [ ] Apple tokens verified by signature against Apple's public keys, plus issuer, audience, expiry and nonce
- [ ] Each nonce can be used only once and expires after 10 minutes
- [ ] Server refuses to start if `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` or the database settings are missing
- [ ] Session cookie is httpOnly, Secure and SameSite=Lax; `Origin` checked on every change
- [ ] Ownership checked on every material and attempt route
- [ ] Admin routes check the role from the database on every request
- [ ] Rate limits on sign-in and AI routes
- [ ] AI endpoints allow only listed models, cap output length and input size
- [ ] Only `web/dist` is served as static files
- [ ] `helmet` security headers, with a content security policy that allows Google and Apple sign-in
- [ ] Every admin action written to the audit log
- [ ] `.env` never committed; `.env.example` kept up to date

---

## 14. Testing

### API tests (Vitest + Supertest)

Google and Apple verification are replaced by fakes that accept test tokens.

- A forged, expired or wrong-audience Google or Apple token is rejected.
- An unverified Google email is rejected.
- A reused nonce is rejected.
- An Apple sign-in with a matching real email links to the existing Google user; a hidden-email one creates a new user.
- Only a Google sign-in can trigger the automatic admin promotion.
- Non-admins get 403 on every admin route.
- User A can't read, change or delete user B's material or attempt.
- The allowance blocks the call that goes over the limit, including when 10 requests arrive at once.
- A failed AI call refunds its units.
- A banned user's session stops working immediately.
- Dev routes return 404 when `NODE_ENV=production`.

### End-to-end tests (Playwright)

- **Signed-in resume:** sign in with the seeded test user, generate a quiz (with a fake AI), answer 3 questions, reload, and resume at question 4 with the same order and score.
- **Admin limit:** an admin lowers a user's limit, and that user sees the "limit reached" message.
- **Guest limit:** a guest generates 3 quizzes, and the 4th attempt shows the sign-in dialog.

---

## 15. Deployment

1. `npm run build` builds `web/dist` and compiles the server.
2. Upload with `rsync`, or `git pull` on the server. This replaces copying `index.html` with `scp`.
3. On the server: `npm ci --omit=dev`, then `npm run migrate`, then `pm2 reload ecosystem.config.cjs`.
4. Nginx: `/fast-learning/api/` goes to the Node server and `/fast-learning/` serves `web/dist`. The session cookie path is `/fast-learning`.
5. Google Cloud Console: add `https://villa.linkflow.page` as an authorized JavaScript origin for the client ID.
6. Apple Developer: confirm the domain and return URL on the Services ID (section 7).
7. Back up nightly with `mysqldump` (cron) and keep 7 days.

---

## 16. Phases

Each phase ends with something that can be run and checked.

| Phase | Work |
|---|---|
| 0 | Emergency fixes on the live server (section 2) |
| 1 | Foundations: folder structure, `shared/` types, Vite app, server skeleton, env checks, migrations, linting, tests running |
| 2 | Sign-in: Google and Apple verification, nonces, sessions, account linking, `/me`, logout, admin bootstrap, seed script |
| 3 | Move the app's features from `index-before-accounts.html` into components (create, learn, quiz, result, audio, settings, own key), plus guest limits |
| 4 | AI task endpoints with server-side prompts, the signed-in allowance, key pool & dedicated resolution, voice cache |
| 5 | Library, quiz attempts, exact resume |
| 6 | Admin page: stats, users, key pool management, user key assignment, audit log, key test |
| 7 | Security checklist, tests, deployment scripts, fresh go-live |

Phase 3 is the largest, because it carries over everything people actually use: the study modes, binaural beats and pink noise, voice narration, and model choice.

---

## 17. Done when

- No one can become admin except through `ADMIN_EMAILS` with a verified Google account, or by another admin promoting them.
- A free user can't use more than their daily allowance, even with tools that bypass the browser.
- Users' own keys never reach the server.
- Closing the browser in the middle of a quiz and opening it on another device resumes at the same question, with the same score and question order.
- Google and Apple sign-in both work, and a user can link both to one account.
- Guests can use the app with their own key within the guest limits.
- All tests in section 14 pass and every item in the security checklist is done.
