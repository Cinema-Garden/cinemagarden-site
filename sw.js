/* Copyright (c) 2026 Cinema Garden. All rights reserved. */
// Cinema Garden web demo loader (build 8209f57c6c14). The app is encrypted in /app.bin; this worker
// decrypts it with the key saved in this browser when the visitor entered the access code.
'use strict';
const BUILD_ID = "8209f57c6c14";
let inner = null;
let loading = null;
self.__cgLoader = { ready(x) { inner = x; } };

function savedKey() {
  return new Promise((resolve) => {
    const r = indexedDB.open('cinema-garden-lock', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onerror = () => resolve(null);
    r.onsuccess = () => {
      const g = r.result.transaction('keys', 'readonly').objectStore('keys').get('k');
      g.onsuccess = () => { r.result.close(); resolve(g.result || null); };
      g.onerror = () => { r.result.close(); resolve(null); };
    };
  });
}
async function load() {
  const raw = await savedKey();
  if (!raw) return null;
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const buf = await (await fetch('/app.bin?v=' + BUILD_ID, { cache: 'no-cache' })).arrayBuffer();
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  } catch (e) {
    return null; // the code changed since this browser unlocked
  }
  (0, eval)(new TextDecoder().decode(plain));
  return inner;
}
function loaded() {
  if (inner) return Promise.resolve(inner);
  if (!loading) loading = load().catch((e) => { console.error(e); return null; }).finally(() => { loading = null; });
  return loading;
}
function locked(request) {
  if (request.mode === 'navigate') {
    return fetch('/index.html', { cache: 'no-cache' }).then((r) => r.text()).then((t) => new Response(t, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  }
  return new Response(JSON.stringify({ error: 'Enter the access code first: reload the page.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}
const STATIC_FILES = new Set(['/sw.js', '/demo-start.js', '/CNAME', '/app.bin', '/robots.txt', '/LICENSE.txt', '/index.html', '/404.html']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || STATIC_FILES.has(url.pathname) || url.pathname.startsWith('/guide/')) return;
  const done = loaded().then((app) => (app ? app.respond(event.request) : locked(event.request)));
  event.respondWith(done);
  event.waitUntil(done.then(() => new Promise((r) => setTimeout(r, 500))).then(() => inner && inner.flush()));
});
