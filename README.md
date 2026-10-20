# Fast Learning / المولد الذكي للاختبارات

Arabic/English study application with server-managed AI generation, document input, study/quiz modes, account materials, progress and material allowances. AI output can be wrong: generated questions and grading are not a guarantee of academic accuracy. Speech availability depends on the configured provider; the browser voice policy intentionally blocks robotic synthesis.

## Requirements and local workflow

- Node.js 22 LTS (tested with 22.23.1), npm 10+, MySQL 8.0+.
- This is an Express/MySQL application, **not** a static-only site. Opening source `index.html` directly is not a supported production deployment.
- Install, copy `.env.example` to `.env`, and configure your own database, OAuth origin/client ID and strong JWT secret. Do not use the database root account.

```bash
npm ci
npm run check
npm run build
# Explicit database-changing command: only after reviewing target credentials/backups.
npm run db:migrate
npm start
```

Default port: `3025`. The deployment must serve **`dist/index.html` and `dist/assets/`**, never source HTML or the repository root. See [VPS guide](DEPLOY_VPS_GUIDE.md) and the integration contract below. `npm start` does not silently rebuild assets or install packages. Build tools must be installed during CI/build; after building, a runtime-only installation may use `npm ci --omit=dev` while retaining `dist/`.

## Production build

`index.html` is a small HTML shell; the application entry is `frontend/main.jsx`. `frontend/App.jsx` orchestrates module-scope views in `frontend/views/`, with study/question/timer logic in `frontend/domain/`, API/progress/audio/resource helpers in `frontend/services/`, and translations in `frontend/i18n/`. `npm run build` bundles that import graph into a minified local React 18 application using esbuild, compiles Tailwind 3 against the shell and frontend modules, includes `frontend/styles.css`, bundles confetti/Mammoth and copies Font Awesome plus font files locally. It does not extract an inline application or modify source files. There is no browser Babel, Tailwind CDN, React CDN or executable inline script in the generated HTML. Diagnostics and the early voice policy load as external, blocking scripts before the application. `window.mammoth` remains available to existing document extraction code.

Google Identity Services remains an external identity dependency; Cairo remains on Google Fonts. Unsupported Apple and development sign-in buttons/SDK are removed. A restrictive production CSP should permit only the actual identity/font endpoints, **not** `unsafe-eval` or `unsafe-inline` in `script-src`. React inline style properties currently require the corresponding style policy; removing executable inline scripts does not mean all inline styling is gone. Apple sign-in remains disabled on the backend until a verified implementation exists.

Hashed application/policy assets use relative `./assets/` URLs, so both `/` and `/fast-learning/` work. Redirect `/fast-learning` to `/fast-learning/` before serving HTML. Rebuild after every frontend change. Existing hashed assets are retained for active clients; deploy whole release directories and garbage-collect old releases rather than deleting assets while clients are loading.

## Database upgrades

`db.js` uses `scripts/migrations.js` with a connection-scoped MySQL advisory lock and numbered `schema_migrations` records:

- `001`: `CREATE TABLE IF NOT EXISTS` baseline and one-time quota account backfill. Existing tables/data are preserved.
- `002`: missing `users.status`, `users.session_version` and nullable `material_generations.source_hash` columns.
- `003`: atomic `ai_daily_budgets` keyed by owner/task/day.
- `004`: canonical server-owned generation banks and material/generation attribution on AI usage, with lookup indexes.
- `005`: monotonic `user_progress.save_revision` for ordered checkpoints and stale-tab conflict detection.

The progress HTTP contract uses `expectedRevision` in POST bodies and returns `revision` on GET/POST. The server validates it through the internal `saveRevision` field and increments the saved revision under a material-row lock; mismatched saves return `409` rather than replacing a newer checkpoint. Learn and quiz checkpoints are independent. Reset retains a revision tombstone instead of deleting ordering history. Pending legacy generations without a canonical bank must be restarted; client-submitted questions cannot reconstruct trusted output.

MySQL DDL implicitly commits: migrations are retry-safe, not transactionally rolled back. Deployments must back up first and apply migrations before serving the new release. Future schema changes belong in a **new numbered migration**; do not rewrite already-applied migrations or treat `schema.sql` as an upgrade tool. `.env.example` sets `DB_AUTO_MIGRATE=false`, which makes startup verify all migration versions; legacy configurations that omit it still auto-migrate under the advisory lock. A failed initialization leaves DB-backed services unavailable, not partially marked ready.

Environment AI/version defaults only fill missing `admin_settings` rows. Changing environment variables does not overwrite saved administrator settings. Database backups include those secrets and must be protected accordingly.

## Tests and operations

`npm run check` recursively syntax-checks project JavaScript, parses the current inline JSX with esbuild, and runs **all** `*.test.js` files (excluding dependencies/build/private dot directories). Build tests generate a temporary production bundle and assert local assets, absence of runtime compilers/CDNs/inline execution, voice-policy preservation and subpath URLs. Database tests use a mock connection; no live database or paid AI call is used by these checks.

Linux-only `npm run backup` invokes `mysqldump` with a temporary `0600` option file in a private `0700` directory. Passwords are absent from command-line arguments, output and the child environment. Dumps are gzip-compressed, private and retained for seven days by default; only completed application-owned dump names are pruned after a successful backup. It does **not** run automatically during startup/check/build. Backups are not encrypted at rest: encrypt/off-site them and test restores. This command backs up MySQL, not the complete filesystem; configuration/release backup and restore instructions are in the VPS guide.

`npm run healthcheck` is a read-only JSON readiness probe for `/api/ready`. `node scripts/monitor.js` checks readiness, latency, completed backup age and optional available disk space, persists private failure/recovery state, and can post sanitized alerts to an operator-owned HTTPS JSON receiver. No Sentry integration, external monitoring account, or enabled schedule is provided. Payments must stay disabled until a verified provider flow and a real approved catalog exist; example environment settings contain no active packs/prices.

Operational commands are **deployment-only**: the CLIs load the selected `.env`; backup/maintenance connect to that database and monitor/healthcheck contact configured endpoints. Importing their modules and running mocked tests does neither. For focused offline coverage (with dependencies already installed):

```bash
node --test legal_pages.test.js retention_policy.test.js error_tracking.test.js monitoring.test.js scripts/monitor.test.js scripts/backup.test.js scripts/healthcheck.test.js scripts/maintenance.test.js config/ops_config.test.js
```

### Public policies and operator review

`/privacy`, `/terms` and `/contact` are public, server-rendered Arabic/English pages, including under `/fast-learning/`. They work without signing in or executing browser JavaScript. Public config exposes validated support/legal data and relative policy paths; secrets/provider URLs are not derived into these disclosures. Configure `LEGAL_OPERATOR_*`, `SUPPORT_EMAIL`, optional international `SUPPORT_WHATSAPP`, and an optional HTTPS `PUBLIC_SUPPORT_URL` without credentials/query/fragment. Missing facts stay visibly unconfigured: no company, registration, jurisdiction, support SLA or compliance claim is fabricated.

Populate `LEGAL_IDENTITY_PROVIDER`, `LEGAL_AI_PROVIDER`, `LEGAL_SPEECH_PROVIDER`, `LEGAL_HOSTING_PROVIDER`, `LEGAL_FONT_PROVIDER`, `LEGAL_MONITORING_PROVIDER` and `LEGAL_PROCESSING_LOCATIONS` with the actual deployment's providers/intermediaries and reviewed regions. They are public operator-entered disclosures, **not runtime provider selection or verification**. Review actual administrator settings as well as environment values. `LEGAL_POLICY_REVIEWED=true`, `LEGAL_REVIEWED_AT=YYYY-MM-DD` and `LEGAL_POLICY_VERSION` record owner review only, never legal certification. An operator must resolve these launch facts and provide a workable privacy-request process; there is no complete automatic account-erasure workflow or guaranteed response time here.

### Retention and inactive schedules

The shared policy defaults to audio cache **7 days**, AI usage **90 days**, daily budgets **7 days**, and completed local backups **7 days**. Bounds are respectively 1–30, 1–365, 2–90, and 1–90 days, configured with `TTS_CACHE_RETENTION_DAYS`, `AI_USAGE_RETENTION_DAYS`, `AI_DAILY_BUDGET_RETENTION_DAYS`, and `BACKUP_RETENTION_DAYS`. Invalid values fail instead of silently widening retention. Cache validity and maintenance use the same window; deletion requires running approved maintenance. Saved account/material data, proxy logs and off-host copies have separate operator-defined policies.

`node scripts/maintenance.js --dry-run` counts eligible rows without deleting/updating them, **but still connects to the selected database**. The real cleanup only prunes the approved tables and releases expired reservation references; it uses a dedicated pool without app initialization, migrations or administrator-default inserts and closes the pool on failures. Review counts and backups before `node scripts/maintenance.js`.

`config/fast-learning-{backup,monitor,maintenance}.{service,timer}` are inactive hardened Linux systemd templates: backup nightly at 03:15 UTC, maintenance daily at 04:15 UTC, monitor approximately every two minutes. All private jobs set `UMask=0077`. Only backup has write access to the backup directory; the web service does not. Monitor requires a POSIX-private state directory (systemd creates `/var/lib/fast-learning-monitor` with `0700`, state files `0600`). No installation or timer activation occurs in tests/build/startup. Review paths, identities, permissions, retention, delivery and the restore drill before opting into schedules; do not also enable duplicate cron jobs.

### Privacy-preserving diagnostics and alert limits

`error_tracking.js` logs structured JSON limited to code/source, server-owned build release, allowlisted route templates/status, and optional allowlisted built-asset positions. It drops raw messages/stacks, request objects, documents, headers, cookies, tokens, IP addresses and email addresses. Client ingestion is rate limited; the public endpoint must remain strict-origin and limited to 8 KiB. Remote application-error attempts are deduplicated by category/route/release for five minutes and globally capped at five per minute **per process** (including failed attempts); this is not a durable/distributed alert queue.

`MONITOR_WEBHOOK_URL` is an optional **server-only secret** for a generic JSON POST contract, not a Slack/Discord/Sentry adapter. Only sanitized error categories or failure/recovery check names and release are sent; no configured URL, raw error, host path or response body is sent/logged. HTTPS is required, redirects refused, and timeout defaults to three seconds (250–10,000 ms). Monitor reminders default to 30 minutes; failed delivery never records success and is retried on the next due run. `MONITOR_MAX_LATENCY_MS=2000`, `MONITOR_MAX_BACKUP_AGE_HOURS=36`, and optional `MONITOR_DISK_PATH`/`MONITOR_DISK_MIN_FREE_PERCENT=10` control checks. Missing/unreadable backups fail closed; age is based on valid completed dump filenames, not touched mtimes. A present dump is not proof of a restorable backup. Monitor exit status is nonzero for unhealthy checks, failed alert delivery or state failure; no webhook means local checks/logs only.

Monitor state provides single-job, at-least-once transition tracking, not exactly-once delivery. Keep one instance per state path (the supplied one-shot timer does this), do not run it concurrently by cron/manual command, and protect its owner-only state. A crash between delivery and state persistence can duplicate an alert. An independent external observer must detect host outages or a stopped/stale monitor; an in-host timer cannot alert when its own host is down.

### Dependency audit caveat

The latest compatible exact versions were audited during implementation. The registry currently reports **8 advisories**: five high-severity build-only dependency findings in the Tailwind 3 glob/brace chain (no patched compatible `braces` release available), plus three moderate findings in Mammoth's Node CLI `argparse`/`sprintf-js` dependency chain. The browser imports the prebuilt Mammoth browser module, not that CLI; the audit metadata still flags the installed package. A patched PostCSS selector parser override removes two additional advisories. These are disclosed, not silently suppressed or “fixed” by an incompatible downgrade; review upstream patches before release and build only trusted source. `npm audit --omit=dev` reports three moderate, zero high findings as of this implementation.

## AI controls and launch limits

Provider-funded generation, grading and narration require sign-in; sample study and legacy saved guest materials remain available locally. The server owns generation instructions and configuration and binds draft/revision to one source hash per reservation. Generation output and grading response shapes are validated. Daily request counters reserve atomically before provider calls, including failures: per account 20 generation operations, 250 evaluations and 400 narration requests. Global daily defaults are 200 generation operations and 2,000 requests each for grading/narration, configurable with `AI_GLOBAL_DAILY_*_LIMIT`. These are circuit breakers, **not currency-denominated spending guarantees**. Token telemetry records input/output counts, not an authoritative provider invoice; TTS cache hits consume a request allowance but not a paid provider call. There are no hidden TTS model/key/provider retries. Schedule approved private retention maintenance separately using `node scripts/maintenance.js`.

Payments are disabled by default (`PAYMENT_ENABLED=false`, `CREDIT_PACKS_JSON=[]`). Backend scaffolding verifies paid events against the provider and grants credits atomically/idempotently, but checkout UI/live provider onboarding and legal/operator approval are not complete. Do not enable live payments based on passing mocked tests alone.

## Server integration contract

The backend serves `dist/` only, denies directory/source fallback, refuses startup if the build is absent, and sets `Cache-Control: no-store` for HTML versus long-lived immutable caching for generated assets. Serve both root and `/fast-learning/` consistently, or let the supplied Nginx prefix-stripping proxy handle the subpath. Never expose `.env`, SQL, source maps, backups, project source or package files through a repository-wide `express.static` mount. CSP excludes browser compiler/CDN execution. A non-sensitive readiness endpoint returns JSON with `503` when the database is unavailable; production refuses startup on a failed DB initialization. See [VPS guide](DEPLOY_VPS_GUIDE.md) for deployment, backup and rollback details.
