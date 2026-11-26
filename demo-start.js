// Copyright (c) 2026 Cinema Garden. All rights reserved.
// Installs the demo's service worker, then reloads so it can serve the app. A locked build asks for
// the access code first and saves the key it makes in this browser.
(function () {
  var LOCKED = true;
  var KDF = {"salt":"cinemagarden.lynnandalfred.com demo v1","iterations":250000};
  var BUILD_ID = "8209f57c6c14";
  var msg = document.getElementById('msg');
  var dot = document.getElementById('dot');
  function fail(text) { msg.textContent = text; dot.style.display = 'none'; }
  // Service workers need https (localhost is allowed for testing).
  if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { location.replace('https://' + location.host + location.pathname + location.search + location.hash); return; }
  if (!('serviceWorker' in navigator) || !window.crypto || !crypto.subtle) return fail('This browser can\'t run the demo. Open it in an up-to-date Chrome, Safari, Edge or Firefox, not a private window.');

  function start() {
    var tries = 0;
    function go() {
      if (navigator.serviceWorker.controller) {
        // Guard against a reload loop if the worker still can't open the app.
        var n = Number(sessionStorage.getItem('cg_boot') || 0);
        if (n > 2) { sessionStorage.removeItem('cg_boot'); return fail('The demo didn\'t open. Reload the page to try again.'); }
        sessionStorage.setItem('cg_boot', String(n + 1));
        location.reload();
        return;
      }
      if (++tries > 100) return fail('The demo is taking a while to start. Reload the page to try again.');
      setTimeout(go, 100);
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(go).catch(function (e) { fail('The demo couldn\'t start: ' + e.message); });
  }
  if (!LOCKED) return start();

  // ── Access code
  function db() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open('cinema-garden-lock', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('keys'); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function keyStore(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('keys', mode);
        var out = fn(tx.objectStore('keys'));
        tx.oncomplete = function () { d.close(); resolve(out && out.result); };
        tx.onerror = function () { d.close(); reject(tx.error); };
      });
    });
  }
  var bin = null;
  function appBin() {
    bin = bin || fetch('/app.bin?v=' + BUILD_ID, { cache: 'no-cache' }).then(function (r) { return r.arrayBuffer(); });
    return bin;
  }
  function opens(raw) {
    return Promise.all([crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']), appBin()]).then(function (a) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: a[1].slice(0, 12) }, a[0], a[1].slice(12)).then(function () { return true; }, function () { return false; });
    });
  }
  function keyFor(code) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(code.trim().toLowerCase().replace(/\s+/g, ' ')), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(KDF.salt), iterations: KDF.iterations }, base, 256);
    });
  }
  function ask() {
    sessionStorage.removeItem('cg_boot');
    dot.style.display = 'none';
    msg.textContent = 'This demo is private. Enter the access code you were given.';
    var form = document.getElementById('unlock');
    var input = document.getElementById('code');
    var btn = document.getElementById('go');
    var err = document.getElementById('err');
    form.style.display = 'flex';
    input.focus();
    // Show or hide what's typed in the code box.
    var peek = document.getElementById('peek');
    peek.onclick = function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      peek.setAttribute('aria-pressed', String(show));
      peek.setAttribute('aria-label', show ? 'Hide the code' : 'Show the code');
      document.getElementById('peekText').textContent = show ? 'Hide' : 'Show';
      document.getElementById('peekSlash').style.display = show ? '' : 'none';
      input.focus();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      btn.disabled = true; err.textContent = ''; btn.textContent = 'Checking…';
      keyFor(input.value).then(function (raw) {
        return opens(raw).then(function (ok) {
          if (!ok) throw new Error('bad');
          return keyStore('readwrite', function (s) { s.put(raw, 'k'); });
        });
      }).then(function () {
        form.style.display = 'none'; dot.style.display = ''; msg.textContent = 'Opening the demo…';
        start();
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Open the demo';
        err.textContent = 'That code isn\'t right. Check it and try again.';
      });
    };
  }
  keyStore('readonly', function (s) { return s.get('k'); }).then(function (raw) {
    if (!raw) return ask();
    return opens(raw).then(function (ok) {
      if (ok) return start();
      return keyStore('readwrite', function (s) { s.delete('k'); }).then(ask);
    });
  }).catch(ask);
})();
