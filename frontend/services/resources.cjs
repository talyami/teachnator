'use strict';
const MAX_AUDIO_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_CACHE_BYTES = 24 * 1024 * 1024;
function audioEntryBytes(value) { return (value?.data?.length || 0) * 2 + (value?.buffer ? value.buffer.length * value.buffer.numberOfChannels * 4 : 0); }
function createByteCache(maxBytes = MAX_AUDIO_CACHE_BYTES, maxItems = 24) {
  const entries = new Map(); let size = 0;
  return { get: key => entries.get(key)?.value,
    set(key, value) { const bytes = audioEntryBytes(value); if (entries.has(key)) { size -= entries.get(key).bytes; entries.delete(key); }
      if (bytes > maxBytes) return false;
      while (entries.size && (size + bytes > maxBytes || entries.size >= maxItems)) { const oldest = entries.keys().next().value; size -= entries.get(oldest).bytes; entries.delete(oldest); }
      entries.set(key, { value, bytes }); size += bytes; return true; },
    clear() { entries.clear(); size = 0; }, get bytes() { return size; }, get size() { return entries.size; } };
}
async function readBoundedJson(response, maxBytes) {
  const tooLarge = () => Object.assign(new Error('Audio response exceeds the client byte limit.'), { code: 'AUDIO_RESPONSE_TOO_LARGE' });
  if (Number(response.headers?.get('content-length')) > maxBytes) { try { await response.body?.cancel(); } catch (_) {} throw tooLarge(); }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge();
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { try { await reader.cancel(); } catch (_) {} throw tooLarge(); }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join(''));
  } finally { reader.releaseLock(); }
}
async function withBitmap(file, create, use) { const bitmap = await create(file); try { return await use(bitmap); } finally { bitmap.close(); } }
async function playHtmlAudio({ audio, url, revoke, isCurrent = () => true }) {
  let released = false;
  const release = () => { if (!released) { released = true; revoke(url); } };
  audio.onended = release; audio.onerror = release;
  try { if (!isCurrent()) return false; await audio.play(); if (!isCurrent()) { audio.pause(); release(); return false; } return true; }
  catch (_) { release(); return false; }
  finally { if (!isCurrent()) release(); }
}
function installOneTimeUnlock(target, unlock, events = ['pointerdown', 'keydown']) {
  const cleanup = () => events.forEach(type => target.removeEventListener(type, handler, true));
  const handler = () => { if (unlock() !== false) cleanup(); };
  events.forEach(type => target.addEventListener(type, handler, { passive: true, capture: true }));
  return cleanup;
}
module.exports = { MAX_AUDIO_RESPONSE_BYTES, MAX_AUDIO_CACHE_BYTES, audioEntryBytes, createByteCache, readBoundedJson, withBitmap, playHtmlAudio, installOneTimeUnlock };
