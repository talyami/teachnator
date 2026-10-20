'use strict';
const GUEST_WORKSPACE_KEY = 'smartExamGuestWorkspace.v2';
function deactivateGuestWorkspace(storage) { storage.setItem(GUEST_WORKSPACE_KEY, JSON.stringify({ active: false })); }
function activateGuestWorkspace(storage, materialKey) { storage.setItem(GUEST_WORKSPACE_KEY, JSON.stringify({ active: true, materialKey: String(materialKey) })); }
function guestWorkspaceActive(storage, archive) {
  try { const pointer = JSON.parse(storage.getItem(GUEST_WORKSPACE_KEY) || 'null'); return pointer ? pointer.active === true && pointer.materialKey === String(archive?.generationId) : true; } catch (_) { return false; }
}
module.exports = { GUEST_WORKSPACE_KEY, deactivateGuestWorkspace, activateGuestWorkspace, guestWorkspaceActive };
