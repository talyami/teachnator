# Production VPS deployment

This guide targets Linux, Node.js 22 LTS and MySQL 8.0+. Examples use `/opt/fast-learning` and port **3025**; replace domain/path/user values for your host. Nothing here creates an external monitoring account, activates payments or verifies OAuth/provider access for you.

## 1. Isolate application and credentials

Create a dedicated unprivileged OS user and a MySQL database/user using the MySQL administrator interface. Use a unique generated password and grant access only to this application's database, never global privileges. The deployment/migration identity needs CREATE/ALTER/INDEX plus normal DML; a separate runtime identity may use narrower DML permissions after migration. `DB_AUTO_MIGRATE=false` is required for a runtime account without DDL permissions. Migrations require MySQL named advisory locks (`GET_LOCK`).

Keep the repository outside the public document root. Copy `.env.example` to `.env`; set ownership to the app user and mode `0600`. Configure HTTPS origin, JWT secret, OAuth client IDs and server-only provider credentials. Register the actual HTTPS origin with Google. Do not assume Apple login works merely because a client ID is present: it needs a verified server flow/provider configuration. Use `PORT=3025`, `NODE_ENV=production`, `DB_AUTO_MIGRATE=false`. Do not print `.env` or secrets into logs/tickets.

Payments remain disabled (`PAYMENT_ENABLED=false`, empty provider/keys/catalog). No example prices are an approved catalog. Do not enable billing before server-side provider verification and replay-safe fulfillment have been independently tested.

## 2. Build and test before touching the database

In a staging/release directory (installation and all live operations are operator deployment actions, not tasks run by offline tests):

```bash
npm ci
npm run check
npm run build
```

These commands parse/test/build locally without intentionally connecting to MySQL or calling AI services. Check `npm audit` as part of release review; do not blindly run `npm audit fix --force` or change frontend framework major versions. The source `index.html` remains a development source file. **Deploy and serve `dist/index.html` with its `dist/assets/` directory.** Google identity and Google Fonts remain external; all application JS, Tailwind CSS, Font Awesome, confetti and DOCX processing are local build assets.

The backend serves only `dist/index.html` and `/assets/` (also under `/fast-learning/`), rejects private/source paths, and never falls back to source HTML. CSP excludes script `unsafe-eval`/`unsafe-inline`. HTML uses `Cache-Control: no-store`; generated assets use `public,max-age=31536000,immutable`. JSON `/api/ready` returns `503` if DB readiness is false, and production startup refuses to run without the database or built frontend. Google/AI provider verification still requires staging checks.

## 3. Back up, then migrate explicitly

First inspect the intended DB host/name via your secure administration channel. **The migration command modifies whichever database `.env` selects.** Never test it casually against production.

```bash
npm run backup
npm run db:migrate
```

Before cleanup, approve `TTS_CACHE_RETENTION_DAYS` (default 7, range 1–30), `AI_USAGE_RETENTION_DAYS` (90, 1–365), `AI_DAILY_BUDGET_RETENTION_DAYS` (7, 2–90) and `BACKUP_RETENTION_DAYS` (7, 1–90). The shared module rejects invalid settings and keeps cache validity aligned with cleanup. First run `node scripts/maintenance.js --dry-run` against the **explicitly approved target** to review counts. This is SELECT-only but still connects to MySQL; it is not an offline test. Then approve `node scripts/maintenance.js` or its inactive daily timer template. The dedicated one-connection pool never calls app initialization, migrations or default inserts, closes even on query failures, and only prunes cache/usage/old day counters and expires/releases reservations. It does not erase whole accounts/materials; implement and rehearse the operator's access/deletion process separately. Maintenance is not automatically scheduled.

`backup` requires Linux and the MySQL `mysqldump` client (not an arbitrary MariaDB client). It uses `--single-transaction` for InnoDB, no table locks and no tablespaces. Avoid concurrent schema changes while dumping. The target database must already exist; migrations do not create databases/users. The baseline is compatible with existing tables; conditional column additions upgrade legacy installations. `schema_migrations` records numbered success under a single-connection advisory lock. DDL auto-commits, so interruption can leave partial DDL; retry applies missing steps safely. It is not an automatic destructive rollback mechanism.

Apply the full migration list through `005` before serving this release. Migration `004` adds canonical generation banks and AI usage attribution; `005` adds progress revisions. In-flight reservations created before canonical output was stored must be restarted rather than completing with browser-supplied questions. The new progress API requires `expectedRevision` and returns `revision`; rebuild/deploy the matching frontend, and stale-tab saves intentionally fail with `409`.

`DB_AUTO_MIGRATE=false` makes subsequent server startup verify the current migration list without altering schema. App initialization still inserts missing admin defaults, so its runtime user needs normal INSERT/SELECT/UPDATE permissions. Credential environment changes do not overwrite existing `admin_settings` rows.

## 4. Service and HTTPS reverse proxy

Review `config/fast-learning.service`, install it as `/etc/systemd/system/fast-learning.service`, and adjust paths/user/Node executable. The web unit has no backup-directory write grant; backup is a separate private job. The following are **operator-only live service commands**, not prerequisites for tests and not executed automatically by the repository:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fast-learning
sudo systemctl status fast-learning
```

Use `config/nginx-fast-learning.conf` inside your existing HTTPS server block after reviewing it. It redirects `/fast-learning` to `/fast-learning/`, strips that prefix upstream and forwards to loopback `3025`. Preserve a trailing slash: built relative asset URLs otherwise resolve to the wrong directory. If exposing the app at `/` instead, use the same proxy headers/timeouts in the root location. Restrict direct ingress to the Node port with host firewall/service binding. The proxy overwrites forwarding headers; configure Express proxy trust to the actual topology. The app's JSON upload limit and Nginx body limit must agree (example proxy: 30 MiB).

Test configuration before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
npm run healthcheck
```

Verify both HTML and assets over HTTPS, Google sign-in with your registered origin, guest save/resume, account save/resume and rejection of `/.env`, `/schema.sql`, `/db.js`, `/package.json`, `/backups/` (also under `/fast-learning/`). Keep paid AI smoke tests separate and explicitly authorized. Do not expose credentials or stack traces in readiness responses.

## 5. Backup schedule and confidentiality

The backup command is **not** automatically scheduled. `config/fast-learning-backup.service` and `.timer` are inactive templates for 03:15 UTC nightly (with a short random delay and persistent catch-up). Maintenance has a separate daily 04:15 UTC template; monitor has a separate approximately two-minute template. A backup running late is not guaranteed to finish before maintenance: plan capacity or arrange sequencing for your host. None of these files enables itself, installs systemd units or provisions a receiver.

Before installing any private-job unit, review `User`/`Group`, `/usr/bin/node`, `/opt/fast-learning`, the private `EnvironmentFile`, timeouts, exact DB target and read/write permissions. Create `/var/backups/fast-learning` as `0700`, owned by the chosen backup identity, outside the web root. Keep `BACKUP_DIR` and the backup unit's `ReadWritePaths` aligned. The current templates use the existing app identity for simple deployment; a stronger deployment should use separate least-privilege backup/maintenance identities and protected environment files, granting only the SQL/read/write privileges each job requires.

All private services have `UMask=0077`, `NoNewPrivileges`, a private temporary directory and read-only system/home restrictions. Only backup can write the backup directory. Monitor can read backups and writes only `/var/lib/fast-learning-monitor`; systemd's `StateDirectory` creates it as `0700`. Maintenance requires no filesystem write exception. The web service no longer has a backup write exception. Do not add `MemoryDenyWriteExecute` blindly to Node units because V8 uses JIT memory.

You may inspect the reviewed unit files with `systemd-analyze verify` on a compatible staging Linux host, then install/activate the chosen timers through your own reviewed deployment procedure. **This guide intentionally does not enable private timers.** Do not also install cron jobs or overlap manual monitor runs sharing the same state path. Verify actual runs, failure visibility and restore output before treating a schedule as operational.

`BACKUP_RETENTION_DAYS=7` deletes only this tool's expired completed `.sql.gz` files after a successful dump. Incomplete dumps are not promoted. It uses a temporary `0600` defaults-extra-file; passwords are never process arguments and client stderr is not logged. Catchable termination signals clean up; hard kills/host failures can leave private temporary files, so use OS tmp cleanup. A gzip dump is **not encryption**. Store off-site copies encrypted, restrict access and alert on failed runs/missing backups. Dumps contain personal study data, provider credentials in `admin_settings` and account records. Define an approved retention/deletion policy.

The script backs up MySQL only. For disaster recovery, separately archive the exact deployed code/dist/config plus secret files using a trusted backup tool or a root/app-owned private directory (`umask 077`). Exclude `node_modules`, `.git`, caches and recursive backup output. Encrypt the archive immediately; keep encryption keys outside the archive and outside the server. Never place plaintext `.env` archives under a web root. Record the lockfile, release identifier, Node version and database backup timestamp so they can be restored together. This repository does not pretend to provide tested automatic filesystem snapshots.

## 6. Restore and rollback rehearsal

Perform a restore drill on an **isolated MySQL instance**, never a database used by live users. Verify gzip integrity first:

```bash
gzip -t /secure/path/fast-learning-TIMESTAMP.sql.gz
```

Provision the recovery instance/account, stop the affected app for an actual recovery, and use the MySQL client with an interactively prompted password or a reviewed private `0600` option file. Example (replace the recovery host; the dump includes CREATE DATABASE/USE):

```bash
set -o pipefail
gzip -dc /secure/path/fast-learning-TIMESTAMP.sql.gz | mysql --host=RECOVERY_HOST --user=RECOVERY_ADMIN --password
```

The `--password` flag without a value prompts rather than exposing the password in process arguments. Full-database dumps contain `USE` for the original database name: specifying another DB name on the client does **not** safely rename/retarget a restore. Use an isolated instance for rehearsal. Restore provider/JWT secrets via the secure secret store, restore the matching application release/dist, and verify migration records, account/material counts and sign-in before reopening traffic.

For ordinary application rollback, stop traffic, switch back to the last complete release (keep old hashed assets available for existing clients), then restart and probe. These migrations are additive; there is no automated down-migration. If an incompatible data/schema change requires restore, recovery loses writes since the backup: agree on maintenance window/RPO first.

## 7. Monitoring and release gate

- Run `npm run healthcheck` internally and externally using `HEALTHCHECK_URL=https://YOUR_HOST/fast-learning/api/ready`; it expects JSON, not a misleading HTML 200 fallback. Alert on HTTP failures, dependency `503`, excessive latency and stale probes.
- Review service logs with `journalctl -u fast-learning`; monitor restart rate, 5xx/429 rate, disk space, MySQL connection pressure and backup age. Rotate/limit logs and avoid logging prompts, user source documents, keys or authentication tokens.
- `node scripts/monitor.js` is the implemented one-shot monitor. It checks JSON readiness, response duration, newest completed nonempty dump age and optional `statfs` disk availability. Missing/unreadable/stale backups fail closed. Dump timestamps come from validated owned filenames, not mutable mtime; partials, invalid/future names and symlinks do not count. This checks freshness, not gzip integrity or restorability. Defaults: latency 2,000 ms, backup age 36 hours, disk minimum 10% available when `MONITOR_DISK_PATH` is set.
- `MONITOR_STATE_PATH` defaults to `/var/lib/fast-learning-monitor/state.json`. The CLI requires POSIX `0700` owner-only parent and `0600` owner-only atomic state, refuses Windows rather than assuming POSIX modes work, and saves only allowlisted check names/delivery state. Keep one active job per state path; a crash after sending but before saving can duplicate a notification. If running manually, provision the dedicated private directory first; do not use a shared writable directory.
- `MONITOR_WEBHOOK_URL` optionally selects an operator-managed **generic HTTPS JSON POST receiver**. The full URL may contain a delivery token and is server-only; never publish it in legal config, browser code, alerts or logs. Redirects are rejected, timeout defaults to 3 seconds (range 250–10,000 ms), response bodies/errors are not logged, and only small allowlisted payloads are sent. No Sentry adapter/SDK/account is installed; `SENTRY_DSN` is unsupported and has been removed from the example.
- The remote contract is `{type: "monitor_transition", state: "failure"|"recovery", failedChecks: ["readiness"|"latency"|"backup"|"disk"], release: "server-build"}`, or an `application_error` with allowlisted code/source/release and optional route template/status. It contains no configured URL, host path, raw error, request/user data, token or timestamp supplied by a browser. Provision a receiver that accepts this contract; Slack/Discord/Sentry endpoint formats are not supported automatically. No webhook means local monitoring/logs only, not successful remote delivery.
- Failure transitions, changed failed-check categories and repeated failures after `MONITOR_ALERT_COOLDOWN_SECONDS` (default 1,800) can alert. Recovery follows a previously delivered failure. Delivery is recorded only after successful 2xx; a failed failure/recovery notification remains retryable next run, with generic local failure reason. Exit is nonzero for unhealthy checks or failed delivery. The timer does not retry endlessly in one execution. Test failure, deduplication, a delivery outage and recovery with the approved receiver on staging; do not infer live delivery from mocked tests.
- Application error logs retain only allowlisted codes, server-owned release, route templates/status and approved asset line/column, never raw messages/stacks/documents/headers/cookies/tokens/IP/email. Client reports must stay strict-origin, unauthenticated and at most 8 KiB. Ingestion has bounded per-key/global limits; notification attempts are deduplicated for five minutes and capped at five per minute per process, including failed attempts. These are process-local protections, not a distributed incident queue. Rotate/limit journals and proxy logs separately; audit proxy access-log paths/query/IP collection.
- An independent external monitor still needs to detect stopped/stale probes, failed timers and whole-host/network outages; the in-host monitor cannot alert if it is not running. Set up and verify that external observer separately.
- Offline operational coverage: `node --test legal_pages.test.js retention_policy.test.js error_tracking.test.js monitoring.test.js scripts/monitor.test.js scripts/backup.test.js scripts/healthcheck.test.js scripts/maintenance.test.js config/ops_config.test.js`. These tests inject/mock DB/network/process adapters and use only temporary fixtures, never production credentials/providers. `healthcheck`, `monitor`, `backup`, maintenance (including `--dry-run`), migrations and server startup are **live deployment commands**, not offline validation commands.
- Release gate: exact lockfile install, all offline tests, production build, reviewed dependency audit, verified backup/restore plan, migration success, static-source denial, tight CSP, readiness, OAuth/provider checks, actual alert delivery/schedule verification and reviewed public operator/policy facts. Browser/manual/provider/database/host verification remains separate from offline tests.

## 8. Public legal/support launch facts

Publish and verify `/privacy`, `/terms`, `/contact` and prefixed equivalents without authentication. These are bilingual server-rendered HTML, not a React-only route or a database-dependent page. Check that support and policy links from `/api/config` match the chosen public prefix. Missing facts must remain honestly marked unconfigured; passing tests is not a launch approval.

Fill public `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_COUNTRY`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_OPERATOR_REGISTRATION` only with real applicable facts. Set a working `SUPPORT_EMAIL`, optionally an international `SUPPORT_WHATSAPP` (8–15 digits, optional `+`), and/or `PUBLIC_SUPPORT_URL` (HTTPS, no credentials/query/fragment). All operator strings are escaped in server HTML; invalid links/emails are omitted. These fields are intentionally public: never put private infrastructure links or credentials in them.

After reviewing actual administrator settings, deployment and service contracts, publish `LEGAL_IDENTITY_PROVIDER`, `LEGAL_AI_PROVIDER` (including any gateway and downstream provider), `LEGAL_SPEECH_PROVIDER`, `LEGAL_HOSTING_PROVIDER`, `LEGAL_FONT_PROVIDER`, `LEGAL_MONITORING_PROVIDER` (or an explicit reviewed statement that none is used), and `LEGAL_PROCESSING_LOCATIONS`. Blank entries display as **not disclosed**. These settings describe the operator's facts; they do not select providers, verify regions or certify third-party retention. Review data processing, cross-border transfers, local obligations and age/consent requirements with qualified advice as applicable. Do not invent a registered company, residency/compliance assurance, governing law or uptime/support commitment.

Set `LEGAL_POLICY_VERSION`, `LEGAL_REVIEWED_AT=YYYY-MM-DD` and `LEGAL_POLICY_REVIEWED=true` only after owner review. The flag records owner review **only**, not legal certification or regulatory compliance. Establish a privacy access/correction/account-deletion workflow and identity checks outside public error reports; no guaranteed response time or complete automated account-erasure route is claimed. Align actual retention schedules, proxy/journal retention and encrypted off-host backups with the published policy. Saved account/material data does not automatically expire just because transient/cache retention is configured. Re-review pages after provider/region/retention changes.
