'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
test('private job templates are one-shot hardened and do not change schemas or enable schedules', () => {
  for (const job of ['backup', 'monitor', 'maintenance']) {
    const service = read(`fast-learning-${job}.service`);
    assert.match(service, /INACTIVE TEMPLATE/);
    for (const line of ['Type=oneshot', 'User=fast-learning', 'Group=fast-learning', 'UMask=0077', 'NoNewPrivileges=true', 'PrivateTmp=true', 'ProtectSystem=strict', 'ProtectHome=true', 'CapabilityBoundingSet=']) assert.ok(service.split('\n').includes(line), `${job}: ${line}`);
    assert.ok(service.split('\n').includes(`ExecStart=/usr/bin/node /opt/fast-learning/scripts/${job}.js`));
    assert.doesNotMatch(service, /ExecStartPre=|db:migrate|scripts\/migrate|systemctl|npm install|initDb|--force/);
    assert.doesNotMatch(service, /\[Install\]/);
    const timer = read(`fast-learning-${job}.timer`);
    assert.match(timer, /INACTIVE TEMPLATE/); assert.ok(timer.split('\n').includes(`Unit=fast-learning-${job}.service`)); assert.match(timer, /WantedBy=timers.target/);
  }
  assert.match(read('fast-learning-backup.timer'), /OnCalendar=\*-\*-\* 03:15:00 UTC/);
  assert.match(read('fast-learning-maintenance.timer'), /OnCalendar=\*-\*-\* 04:15:00 UTC/);
  assert.match(read('fast-learning-monitor.timer'), /OnUnitActiveSec=2min/);
});
test('example legal/retention/monitor settings are public or explicitly private as appropriate', () => {
  const example = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  const values = Object.fromEntries(example.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  const { getPublicLegalConfig } = require('../legal_pages');
  const { getRetentionPolicy } = require('../retention_policy');
  const { getMonitorConfig } = require('../monitoring');
  assert.equal(values.LEGAL_POLICY_REVIEWED, 'false'); assert.equal(values.MONITOR_WEBHOOK_URL, '');
  assert.equal(Object.hasOwn(values, 'SENTRY_DSN'), false);
  assert.deepEqual(getRetentionPolicy(values), { ttsCacheDays: 7, aiUsageDays: 90, dailyBudgetDays: 7, backupDays: 7 });
  assert.equal(getMonitorConfig(values).maxBackupAgeMs, 36 * 3600000);
  const config = getPublicLegalConfig(values);
  assert.equal(config.support.email, null); assert.equal(config.providers.ai, null);
  assert.doesNotMatch(JSON.stringify(config), /replace_with|var\/lib|MONITOR_WEBHOOK_URL|DB_PASSWORD/);
});
test('only backup writes backup directory; monitoring state stays private', () => {
  assert.doesNotMatch(read('fast-learning.service'), /ReadWritePaths=.*backups/);
  assert.doesNotMatch(read('fast-learning-maintenance.service'), /ReadWritePaths=/);
  assert.match(read('fast-learning-backup.service'), /ReadWritePaths=\/var\/backups\/fast-learning/);
  const monitor = read('fast-learning-monitor.service');
  assert.match(monitor, /StateDirectory=fast-learning-monitor/); assert.match(monitor, /StateDirectoryMode=0700/);
  assert.match(monitor, /ReadWritePaths=\/var\/lib\/fast-learning-monitor/); assert.doesNotMatch(monitor, /ReadWritePaths=.*backups/);
});
