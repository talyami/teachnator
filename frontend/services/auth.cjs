'use strict';
async function revokeThenClear({ token, revoke, isCurrent, clear }) {
  if (!token) return true;
  await revoke(token);
  // A login/storage event may have established another account while awaiting revocation.
  if (!isCurrent(token)) return false;
  clear();
  return true;
}
module.exports = { revokeThenClear };
