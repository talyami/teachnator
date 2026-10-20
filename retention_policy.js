'use strict';

const DAY_MS = 86400000;
const SETTINGS = Object.freeze({
  ttsCacheDays: ['TTS_CACHE_RETENTION_DAYS', 7, 1, 30],
  aiUsageDays: ['AI_USAGE_RETENTION_DAYS', 90, 1, 365],
  dailyBudgetDays: ['AI_DAILY_BUDGET_RETENTION_DAYS', 7, 2, 90],
  backupDays: ['BACKUP_RETENTION_DAYS', 7, 1, 90]
});

function boundedInteger(value, fallback, min, max, name) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid ${name}: expected an integer from ${min} to ${max}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}: expected an integer from ${min} to ${max}.`);
  return number;
}
function getRetentionPolicy(env = process.env) {
  return Object.freeze(Object.fromEntries(Object.entries(SETTINGS).map(([key, [name, fallback, min, max]]) =>
    [key, boundedInteger(env[name], fallback, min, max, name)])));
}
// Keep cache reads and private cleanup on exactly the same approved window.
function getTtsCacheFilter(env = process.env) {
  return { sql: 'created_at >= (UTC_TIMESTAMP() - INTERVAL ? DAY)', params: [getRetentionPolicy(env).ttsCacheDays] };
}
module.exports = { DAY_MS, boundedInteger, getRetentionPolicy, getTtsCacheFilter };
