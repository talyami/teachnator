Fast Learning: full app audit
Covers server.js, ai_proxy.js, auth.js, db.js, material_quota.js and all 7,105 lines of index.html, at commit e6b5287 (v1.2.1). Every critical and high item was checked against the code.

5
Critical
16
High
20
Medium
6
Low
47
Total findings
Fix these first: they cost you money today, with or without paying users
Anyone can use your voice API for free, guests can reset their free material indefinitely, and the server forwards any prompt the browser writes to your quiz model. Until these are closed, adding payments would not stop people using the app for free at your expense.
Fix order
Phase 1
1-2 days

Stop the money leaks

Close free voice, guest resets and client-written prompts; fix proxy rate limiting, body size and timeouts.

8 findings

Phase 2
2-3 days

Lock down security

Mask admin keys, pin CDN scripts, enforce Google client ID, add helmet and CORS, remove dev-login and Apple button.

9 findings

Phase 3
2-3 days

Fix learning bugs

Review queue, resume order, short-answer saving, learn mode, grading, crashes, accessibility and English mode.

18 findings

Phase 4
about 1 week

Ready to take payments

Billed AI provider, usage tracking, voice cache, legal pages, upgrade button with Moyasar/Tap, backups and tests.

7 findings

Phase 5
2-3 weeks

Rebuild for growth

Vite build, split index.html into components, migrations, refreshed docs.

5 findings

All findings
Severity

Area

Phase

Showing 47 of 47. The dot colour shows severity: red critical, orange high, blue medium, grey low.

Problem	Recommended fix	Where	Phase
Voice (TTS) is free for anyone on the internet

The voice path catches and ignores the ownership check, so any visitor can send up to 10,000 characters per request to your Gemini/Vertex key without owning a material.

Critical · Cost & abuse

Stop swallowing the error: require an owned material (or completed guest generation), and add a daily voice budget per account.

ai_proxy.js:139-145

1

Guests can create unlimited free materials

A guest is identified only by the X-Guest-Device ID the browser makes up. Clearing storage or sending a new random ID gives a fresh free material, paid by you.

Critical · Cost & abuse

Require sign-in to generate, or tie guests to a server-signed httpOnly cookie plus a per-IP daily cap and Cloudflare Turnstile.

material_quota.js:6-12, index.html:1066-1086

1

The server forwards any prompt the browser writes

Quiz prompts are built in index.html and the server passes them to the brain model with up to 65,535 output tokens. Anyone with one material reservation can use your key as a general-purpose LLM, and uploaded text can inject instructions.

Critical · Cost & abuse

Move the draft and revise prompts to the server. The browser sends only the material and options; the server caps output tokens and question count.

ai_proxy.js:126-160 and 205-231, index.html:1987-2125

1

Admin settings send raw production API keys to the browser

GET /api/admin/ai-settings returns the brain key, Gemini key and Vertex key in full, and the admin page shows them in inputs with a show toggle. Any XSS or stolen admin token leaks every key.

Critical · Security

Return masked values only (last 4 characters) and make key fields write-only: empty means keep the current value.

server.js:564-578, index.html:5289-5438

2

React and Babel load unpinned from unpkg, with tokens in localStorage

react@18, react-dom@18 and @babel/standalone are floating versions with no integrity hash. If the CDN or package is compromised, the attacker runs code on your page and reads every user's JWT, including admins.

Critical · Security

Short term: pin exact versions and add integrity + crossorigin. Long term: build the app and serve all scripts from your own domain.

index.html:73-77, 1083-1086

2

Rate limit is shared by all visitors behind Nginx

Express does not trust the proxy, so every request looks like it comes from 127.0.0.1. The 20 AI requests per minute become a single limit for the whole site.

High · Cost & abuse

Add app.set('trust proxy', 1) and rate-limit per signed-in user as well as per IP.

server.js:148-173

1

No record of what each material costs

Only a call counter (ai_calls_count) is stored. Token usage is never saved, so you can't price credits or spot abusers.

High · Cost & abuse

Add an ai_usage table with user, task, model, input/output tokens and status, filled from the provider's usage data.

ai_proxy.js:171-178

4

Quiz generation runs on a personal OmniRoute server over Tailscale

The brain URL defaults to srv875806.tail759794.ts.net and is also printed in the public HTML. If it pools personal or free-tier accounts, reselling it likely breaks provider terms, and one home server is a single point of failure.

High · Cost & abuse

Use a billed Gemini API or Vertex project for paying users, and remove the hostname from index.html and code defaults.

db.js:137, ai_proxy.js:65, index.html:2292 and 5296

4

Google sign-in accepts tokens from any app if GOOGLE_CLIENT_ID is missing

The audience check only runs when the env var is set, so a misconfigured server would accept a Google token issued to someone else's app.

High · Security

Refuse to start without GOOGLE_CLIENT_ID, and also check the issuer is accounts.google.com.

auth.js:38-41

2

Admin emails have a hardcoded fallback

If ADMIN_EMAILS is missing, two built-in addresses become admins automatically on sign-in.

High · Security

Remove the fallback list; with no ADMIN_EMAILS, nobody is auto-promoted.

auth.js:11-14

2

No security headers and CORS open to every origin

There is no Content-Security-Policy, HSTS or frame protection, and cors() allows any site to call the API.

High · Security

Add helmet with a CSP listing only your CDNs plus Google/Apple, and restrict CORS to https://villa.linkflow.page.

server.js:35

2

Uploaded material can override the AI's instructions

The material is appended to the same message as the instructions with no rule to treat it as data, so a document can say 'ignore the above' and steer the output.

High · Security

Once prompts move to the server, put the material in a clearly fenced data block and tell the model never to follow instructions inside it.

index.html:1148-1174, 1987-2122

1

A wrong answer on the last question skips its review

The review copy is inserted into the list, but the advance step still uses the old length, so the quiz ends and the student never sees the question again.

High · Learning bugs

Decide whether to finish using the updated list (functional state or a ref), not the length captured before the insert.

index.html:4052-4095

3

Resume reshuffles the questions

The saved question order is ignored; a fresh shuffle is created and the old index and score are applied to it, so the student lands on a different question.

High · Learning bugs

Restore progress.state.shuffledQuestions when it exists, and shuffle only for a fresh start.

index.html:2576-2599

3

Short-answer questions never save progress

Moving to the next question after a short answer does not call saveProgressToDb, unlike multiple-choice and fill-in-the-blank.

High · Learning bugs

Save the index and score on next and on finish, using one shared advance helper.

index.html:4286-4301

3

Learn mode saves its progress as 'intro'

Several learn-mode navigations save progress with the wrong mode, which breaks the resume information in the library.

High · Learning bugs

Save with 'learn' consistently.

index.html:4225, 6520-6522, 6556-6558

3

Offline grading accepts a fragment of the answer as fully correct

When AI grading fails, the local fallback marks the answer 100% correct if either text contains the other, so one matching word passes.

High · Learning bugs

Use word-overlap scoring with a threshold instead of substring matching.

index.html:1880

3

No privacy policy, terms, refund policy or contact

Google's OAuth consent screen and every payment provider require these, and users upload study documents, possibly as minors (Saudi PDPL).

High · Product & legal

Add privacy, terms, refund and contact pages, and link them from the footer and the sign-in dialog.

index.html:7083-7097

4

No way to pay when the allowance runs out

The 'allowance exhausted' screen only offers sign-in, saved materials or the demo. There is no upgrade or buy-more path.

High · Product & legal

Add a 'Buy more materials' button that opens checkout (Moyasar or Tap); a payment webhook raises material_limit.

index.html:6133-6156

4

Apple sign-in button is shown but cannot work

The server always returns 501 for Apple sign-in, so the button is a dead end.

High · Product & legal

Hide the button until Apple token verification is implemented.

index.html:4903-4915, server.js:83-88

2

The browser compiles a 436 KB app on every visit

Babel standalone transpiles all the JSX at load, and the Tailwind CDN generates CSS at runtime. This is slow on phones and Tailwind says not to use its CDN in production.

High · Performance

Add a Vite build: precompiled JS, purged CSS and self-hosted assets. Splitting the file into components can happen at the same time.

index.html:37-77, 206

5

Answer grading is unlimited per material

Once a user owns a material, evaluate calls are limited only by the per-minute rate limit.

Medium · Cost & abuse

Add a daily evaluation budget per account.

ai_proxy.js:146-147

1

Voice audio is not cached on the server

Replaying the same question generates and pays for the same audio again.

Medium · Cost & abuse

Cache audio by hash(text + voice + model) in MySQL or on disk and serve repeats from the cache.

ai_proxy.js:257-334

4

50 MB request bodies are accepted on every route

Any endpoint can be sent huge JSON, which uses server memory.

Medium · Security

Use 15 MB only on the generate route and about 100 KB everywhere else.

server.js:42-43

1

30-day tokens can't be revoked and users can't be banned

A stolen JWT works for a month and there is no account status to block someone, only deleting the account.

Medium · Security

Add a status column checked in authenticateToken, and either shorter tokens with refresh or a sessions table.

auth.js:16-27, 135-161

2

Dev-login leftovers

index.html still has a helper that posts an arbitrary role, including admin, to /api/auth/dev-login. .env.example ships ALLOW_DEV_LOGIN=true and /api/config reports it.

Medium · Security

Delete the client helper, the env flag and the config field; keep the route development-only.

index.html:2961-2986, server.js:694, .env.example

2

The JWT is copied into the saved session key

The session owner key is account:<token>, so the token also ends up in sessionStorage keys.

Medium · Security

Use the user id (or a hash of it) as the owner key.

index.html:3331-3335

2

AI calls to the provider have no timeout

The route disables socket timeouts for heartbeats, and the upstream fetch has no timeout either, so a hung provider holds the connection forever.

Medium · Performance

Use AbortSignal.timeout (for example 180 seconds) on upstream fetches.

server.js:176-178, ai_proxy.js:20-38

1

Timer rewrites the whole question bank to storage every second

The session-save effect depends on timeLeft, and the timer interval is torn down and recreated on every tick.

Medium · Performance

Debounce saving, leave timeLeft out of that effect, and keep one stable interval.

index.html:3325-3355

3

Audio memory leaks

Blob URLs are never revoked, the voice cache has no size limit, prefetch requests can't be cancelled, and photo bitmaps are never closed.

Medium · Performance

Revoke URLs on stop/end, cap the cache, pass an AbortController to prefetch, and call bitmap.close().

index.html:1178, 1509-1527, 1608-1620, 3640-3657

3

Resume resets the timer, and starting new material can bring the old one back

Resume always sets 15 minutes. Reset-to-upload clears memory but not the saved session, so a refresh restores the old material.

Medium · Learning bugs

Restore the saved remaining time, and clear the matching storage key on reset.

index.html:2594, 3450-3471

3

Malformed AI output crashes the study screens

options.map assumes every question has options, and JSON parsing fails on any extra text around the JSON.

Medium · Learning bugs

Validate each question's shape after parsing and drop or repair broken items before showing them.

index.html:1963, 2089, 2139, 6360, 6669, 6701

3

Avatar and sign-in provider never display

The UI reads avatar_url and provider, but the API returns avatar and auth_provider.

Medium · Learning bugs

Use the API's field names.

index.html:4929-4940, 5218

3

Pinch-zoom is disabled and keyboard focus is hidden

The viewport blocks zoom, and quiz options remove the focus outline.

Medium · UX & accessibility

Allow zoom and add a visible :focus-visible style.

index.html:5, 129-133

3

Some controls can't be used with a keyboard or are invalid HTML

The upload drop zone and 'reveal answer' are clickable divs, and each quiz option button contains another button.

Medium · UX & accessibility

Use real buttons/labels, and move the speaker button outside the option.

index.html:6000-6015, 6325-6345, 6721-6746

3

Blocking alert() and confirm() pop-ups

Errors and destructive actions use browser pop-ups in about 15 places, which look broken on mobile.

Medium · UX & accessibility

Use the app's existing in-page dialogs and error banner.

index.html:2548-2984, 4426, 4908

3

English mode is incomplete

Many error messages, voice options and placeholders are hardcoded in Arabic, and next/back arrows assume right-to-left.

Medium · UX & accessibility

Route all strings through t() and flip arrow icons by language direction.

index.html:3529-4236, 5362-5554, 5934, 6151

3

Settings 'Cancel' doesn't undo changes

Both buttons just close the dialog, but changes are already applied live.

Medium · UX & accessibility

Snapshot settings on open and restore them on Cancel, or keep a single Close button.

index.html:4857-4868

3

No database migrations, and schema.sql is out of date

Tables are created with CREATE IF NOT EXISTS at startup, so column changes never apply. schema.sql lacks the quota tables and legacy columns linger.

Medium · Maintainability

Add numbered migration files run by a migrate script, and generate schema.sql from them.

db.js:34-167, schema.sql

5

No backups, monitoring or error tracking

Nothing in the repo backs up MySQL or reports server or browser errors.

Medium · Maintainability

Add a nightly mysqldump cron kept for 7 days, uptime monitoring, and error tracking such as Sentry.

DEPLOY_VPS_GUIDE.md

4

One 7,100-line file with one giant component

Upload, study, quiz, admin and settings share one component, and answer handling is duplicated per question type, which is how the short-answer bugs slipped in.

Medium · Maintainability

Split into views (Upload, Learn, Quiz, Result, Admin, Settings) and one shared answer/advance helper.

index.html:206-7100

5

Dead code

fetchWithRetry, cleanAudioBuffer, speakWithWebSpeech, the always-empty revisionWarning and the 410 toggle-ai route are unused.

Low · Maintainability

Delete them.

index.html:1046-1062, 1335, 1545, 3536; server.js:523-525

5

README and deploy guide are out of date

The README says there is no backend and users enter their own key. The deploy guide uses port 3000 instead of 3025, mentions dev login and a removed AI toggle.

Low · Maintainability

Rewrite both to match the current server-keys, accounts and quota setup.

README.md, DEPLOY_VPS_GUIDE.md

5

Only 3 automated tests

Auth, quota limits, ownership checks and admin routes have no tests.

Low · Maintainability

Add route tests for quota exhaustion, ownership and admin-only access before adding payments.

package.json check script

4

Small logic slips

Wrong answers are de-duplicated by question text only, cloze blanks replace only the first occurrence, and email.split crashes if email is missing.

Low · Learning bugs

Use a stable question id, replace a specific occurrence, and guard the email.

index.html:1747, 4046, 5785

3

Icon buttons without labels

Many close and icon buttons lack aria-label or type="button".

Low · UX & accessibility

Add both everywhere.

index.html:4857-6241

3

Audio unlock runs on every tap forever

Global touch, click and key listeners create a silent buffer each time and are never removed.

Low · Performance

Remove the listeners after the first successful unlock.

index.html:746-767

3

What is already done well
AI keys live only on the server; the browser never calls Google directly.

The material allowance is enforced on the server with a reservation and a database transaction, so two parallel requests can't both slip past the limit.

API errors always come back as JSON, and long AI calls stay alive through Nginx with heartbeats.

In-flight AI calls are cancelled when the account changes, and late results from a quiz the student left are ignored.

Dialogs trap focus and close on Escape, and study content uses dir="auto" so Arabic and English mix correctly.

Architecture advice
Keep the current stack (Express, MySQL, React). It fits the app; a rewrite isn't needed to monetize.

The server should own every prompt. The browser sends material and options, never instructions.

Add a build step before growing. It fixes load speed, CDN risk and the single-file problem together.

The TypeScript v2 code removed in the cleanup (still in git history and not yet committed as deleted) already had server-side prompts, helmet, httpOnly cookie sessions and migrations, so you can reuse parts of it.