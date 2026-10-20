'use strict';
// Shared by the compiled frontend and server. Change together for each release.
const version = '1.3.0';
const build = '20261020-teachnator-fix2';
const releaseKey = release => `${release.version || ''}:${release.build || ''}`;
function hasUpdate(release) {
  return Boolean(release?.version && (release.version !== version || (release.build && release.build !== build)));
}
function shouldReload(release, storage) {
  if (!hasUpdate(release) || !release.forceReload) return false;
  const key = `teachnator:reload:${releaseKey(release)}`;
  // Without session storage we cannot guarantee a forced reload will not loop.
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
    return true;
  } catch { return false; }
}
module.exports = { version, build, hasUpdate, shouldReload, releaseKey };
