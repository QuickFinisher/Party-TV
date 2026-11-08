/* Retro Console: Game Boy / Game Boy Color / Game Boy Advance with phones as controllers.
 * - Games live in the TV's own storage (IndexedDB). Phones send ROM files over the same Wi-Fi link.
 * - In-game saves (SRAM) are backed up to the TV every 20 s and on exit, and can be downloaded to a phone.
 * - Free play: everyone's controller works at once.  Room Plays: everyone votes, the top button gets pressed.
 */
App.defineGame('retro', function (api) {
  var BTN = { b: 0, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8, l: 10, r: 11 };
  var LABEL = { up: '▲', down: '▼', left: '◀', right: '▶', a: 'A', b: 'B', start: 'START', select: 'SELECT', l: 'L', r: 'R' };
  var DIRS = { up: 1, down: 1, left: 1, right: 1 };
  var VOTE_MS = 3000, CHUNK_LIMIT = 40 * 1024 * 1024;
  var SYS = {
    gb: { name: 'Game Boy', short: 'GB', core: 'gambatte', color: '#9bbc0f' },
    gbc: { name: 'Game Boy Color', short: 'GBC', core: 'gambatte', color: '#cc5de8' },
    gba: { name: 'Game Boy Advance', short: 'GBA', core: 'mgba', color: '#4dabff' }
  };
  // Free homebrew bundled with the app (see retro/carts/CREDITS.md)
  var BUILTIN = [
    { id: 'hb-ucity', name: 'µCity', system: 'gbc', file: 'hb-ucity.gbc', url: 'retro/carts/ucity.gbc', size: 131072, builtin: true, note: 'City builder' },
    { id: 'hb-libbet', name: 'Libbet and the Magic Floor', system: 'gb', file: 'hb-libbet.gb', url: 'retro/carts/libbet.gb', size: 32768, builtin: true, note: 'Puzzle' }
  ];
  var el = api.el, stage = document.getElementById('stage');
  var phase = 'library', lib = [], sel = 0, current = null, frame = null, pendingLoad = null;
  var mode = 'free', turbo = false, menuOpen = false, menuSel = 0;
  var held = {}, pressed = {}, votes = {}, voteH = null, voteEnd = 0, lastWin = '';
  var uploads = {}, reqs = {}, reqN = 0, hudT = null;

  /* ---------- storage (IndexedDB) ---------- */
  var DBP = null;
  function db() {
    if (DBP) return DBP;
    DBP = new Promise(function (res, rej) {
      var r = indexedDB.open('partytv-retro', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        ['roms', 'meta', 'saves', 'states'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return DBP;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), out = fn(t.objectStore(store));
        t.oncomplete = function () { res(out && out instanceof IDBRequest ? out.result : out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('storage error')); };
      });
    });
  }
  function dbGet(s, k) { return tx(s, 'readonly', function (st) { return st.get(k); }); }
  function dbPut(s, k, v) { return tx(s, 'readwrite', function (st) { st.put(v, k); }); }
  function dbDel(s, k) { return tx(s, 'readwrite', function (st) { st.delete(k); }); }
  function dbAll(s) { return tx(s, 'readonly', function (st) { return st.getAll(); }); }
  function dbKeys(s) { return tx(s, 'readonly', function (st) { return st.getAllKeys(); }); }

  function fetchBuf(url) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
      x.onload = function () { (x.status === 200 || x.status === 0) && x.response ? res(x.response) : rej(new Error('HTTP ' + x.status)); };
      x.onerror = function () { rej(new Error('network')); };
      x.send();
    });
  }
  function blobToBuf(b) {
    if (b.arrayBuffer) return b.arrayBuffer();
    return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsArrayBuffer(b); });
  }
  function find(id) { for (var i = 0; i < lib.length; i++) if (lib[i].id === id) return lib[i]; return null; }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  /* ---------- library ---------- */
  function refreshLib() {
    return Promise.all([dbAll('meta'), dbKeys('saves')]).then(function (r) {
      var saves = {}; (r[1] || []).forEach(function (k) { saves[k] = 1; });
      var user = (r[0] || []).sort(function (a, b) { return b.added - a.added; });
      lib = user.concat(BUILTIN);
      lib.forEach(function (g) { g.hasSave = !!saves[g.id]; });
      if (sel >= lib.length) sel = Math.max(0, lib.length - 1);
      if (phase === 'library') { renderLib(); libUIAll(); }
    }).catch(function (e) { api.toast('TV storage error: ' + e.message, 5000); });
  }

  function renderLib() {
    el.innerHTML =
      '<div class="g-head"><div class="g-title">🕹️ Retro Console</div><div class="g-sub">Game Boy · Color · Advance</div></div>' +
      '<div class="rlib"><div class="rlist" id="rlist">' + lib.map(function (g, i) {
        var s = SYS[g.system];
        return '<div class="rcard' + (i === sel ? ' sel' : '') + '" style="--c:' + s.color + '">' +
          '<span class="rbadge">' + s.short + '</span><span class="rname">' + api.esc(g.name) +
          '<small>' + (g.builtin ? 'Free homebrew · ' + g.note : mb(g.size)) + (g.hasSave ? ' · 💾 save' : '') + '</small></span></div>';
      }).join('') + '</div>' +
      '<div class="rside">' +
      '<h3>Add your games</h3><ol><li>On your phone, tap <b>➕ Add a game</b></li>' +
      '<li>Pick a <b>.gb .gbc .gba</b> file dumped from a cart you own</li><li>It\'s stored on the TV. Saves are too.</li></ol>' +
      '<h3>Got your old save?</h3><p>Tap a game on your phone → <b>Import save</b> and pick the .sav from your cart dump.</p>' +
      '<h3>Controls</h3><p>Phones are the controllers. Remote: arrows, OK = A, BACK = menu.</p>' +
      '<div class="rmode">Mode: <b>' + (mode === 'vote' ? '🗳 Room Plays (vote)' : '🎮 Free play') + '</b></div>' +
      '<div id="rup" class="rup"></div></div></div>';
    var s = el.querySelector('.rcard.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
    upStatus();
  }

  function libUI(p) {
    api.setUI(p, 'retroLib', {
      games: lib.map(function (g) { return { id: g.id, name: g.name, system: SYS[g.system].short, size: mb(g.size), builtin: !!g.builtin, hasSave: g.hasSave }; }),
      mode: mode, vip: p === api.vip()
    });
  }
  function libUIAll() { api.activePlayers().forEach(libUI); }

  /* ---------- running a game ---------- */
  function play(id) {
    if (phase !== 'library') return;
    var g = find(id); if (!g) return;
    phase = 'loading'; current = g; menuOpen = false; held = {}; pressed = {}; votes = {};
    stage.classList.add('retro-full');
    el.innerHTML = '<iframe id="rframe" class="rframe" src="retro/player.html" allow="autoplay; gamepad" tabindex="-1"></iframe>' +
      '<div class="rload" id="rload"><div class="spin"></div><div>Loading ' + api.esc(g.name) + '…</div><small id="rloadmsg">' + SYS[g.system].name + '</small></div>' +
      '<div class="rhud" id="rhud"></div><div class="rvote" id="rvote"></div><div class="rmenu" id="rmenu"></div>';
    frame = document.getElementById('rframe');
    api.setAllUI('wait', { text: 'Loading ' + g.name + '…' });
    Promise.all([g.builtin ? fetchBuf(g.url) : dbGet('roms', g.id), dbGet('saves', g.id)]).then(function (r) {
      if (!r[0]) throw new Error('game file missing — re-add it');
      pendingLoad = { cmd: 'load', core: SYS[g.system].core, file: g.file, buf: r[0], save: r[1] ? r[1].slice(0) : null };
      trySendLoad();
    }).catch(function (e) { api.toast('Couldn\'t load: ' + e.message, 5000); toLibrary(); });
  }

  var frameBooted = false;
  function trySendLoad() {
    if (!frameBooted || !pendingLoad || !frame) return;
    var m = pendingLoad; pendingLoad = null;
    var tr = [m.buf]; if (m.save) tr.push(m.save);
    frame.contentWindow.postMessage(m, '*', tr);
  }

  function ask(cmd, extra) {
    return new Promise(function (res) {
      if (!frame) return res(null);
      var id = ++reqN, m = extra || {}; m.cmd = cmd; m.req = id; reqs[id] = res;
      frame.contentWindow.postMessage(m, '*');
      setTimeout(function () { if (reqs[id]) { delete reqs[id]; res(null); } }, 4000);
    });
  }

  function onFrameMsg(e) {
    var m = e.data;
    if (!m || m.src !== 'retro' || m.ev === 'key' || !frame || e.source !== frame.contentWindow) return;
    if (m.req && reqs[m.req]) { var r = reqs[m.req]; delete reqs[m.req]; r(m); }
    switch (m.ev) {
      case 'boot': frameBooted = true; trySendLoad(); break;
      case 'started':
        phase = 'playing';
        var l = document.getElementById('rload'); if (l) l.remove();
        try { window.focus(); } catch (err) {}
        if (mode === 'vote') startVote();
        padUIAll(); hud(); api.toast('🎮 ' + current.name + ' — have fun!');
        break;
      case 'sram': if (m.data && current) { dbPut('saves', current.id, m.data); current.hasSave = true; } break;
      case 'status': case 'error':
        var t = document.getElementById('rloadmsg'); if (t) t.textContent = m.msg; break;
    }
  }

  function exitGame() {
    if (phase !== 'playing' && phase !== 'loading') return;
    var g = current, wasPlaying = phase === 'playing';
    phase = 'exiting'; releaseAll(); stopVote(); closeMenu();
    api.setAllUI('wait', { text: 'Saving…' });
    (wasPlaying ? ask('stop') : Promise.resolve(null)).then(function (m) {
      return m && m.data ? dbPut('saves', g.id, m.data) : null;
    }).catch(function () {}).then(function () {
      if (wasPlaying) api.toast('💾 Saved ' + g.name);
      toLibrary();
    });
  }

  function teardown() {
    if (frame) { try { frame.src = 'about:blank'; } catch (e) {} frame.remove(); frame = null; }
    frameBooted = false; pendingLoad = null;
    stage.classList.remove('retro-full');
    menuOpen = false;
  }
  function toLibrary() { teardown(); phase = 'library'; current = null; held = {}; pressed = {}; refreshLib(); }

  /* ---------- input ---------- */
  function emu(b, v) { if (frame && phase === 'playing') frame.contentWindow.postMessage({ cmd: 'input', player: 0, index: BTN[b], value: v }, '*'); }
  function sync(b) {
    var any = false;
    for (var k in held) if (held[k][b]) { any = true; break; }
    if (!!pressed[b] !== any) { pressed[b] = any ? 1 : 0; emu(b, any ? 1 : 0); }
  }
  function setHeld(pid, b, v) {
    if (!BTN.hasOwnProperty(b)) return;
    var h = held[pid] || (held[pid] = {});
    if (v) h[b] = 1; else delete h[b];
    sync(b);
  }
  function releaseAll() { held = {}; Object.keys(pressed).forEach(function (b) { if (pressed[b]) { pressed[b] = 0; emu(b, 0); } }); }
  function tap(b) { emu(b, 1); api.after(DIRS[b] ? 260 : 130, function () { emu(b, 0); }); }

  function setTurbo(on) { turbo = !!on; if (frame) frame.contentWindow.postMessage({ cmd: 'input', player: 0, index: 27, value: turbo ? 1 : 0 }, '*'); padUIAll(); hud(); }
  function setMode(m) {
    mode = m === 'vote' ? 'vote' : 'free';
    releaseAll();
    if (phase === 'playing') { if (mode === 'vote') startVote(); else stopVote(); padUIAll(); hud(); }
    else if (phase === 'library') { renderLib(); libUIAll(); }
    api.toast(mode === 'vote' ? '🗳 Room Plays: everyone votes on each button' : '🎮 Free play: everyone\'s controller works');
  }

  /* ---------- Room Plays (vote) ---------- */
  function startVote() {
    stopVote(); votes = {}; voteEnd = Date.now() + VOTE_MS;
    if (frame) frame.classList.add('voting');
    voteH = api.every(150, function () {
      if (Date.now() >= voteEnd) { resolveVote(); voteEnd = Date.now() + VOTE_MS; }
      renderVote();
    });
    renderVote();
  }
  function stopVote() {
    if (voteH) api.cancel(voteH); voteH = null; votes = {};
    if (frame) frame.classList.remove('voting');
    var v = document.getElementById('rvote'); if (v) v.style.display = 'none';
  }
  function tally() { var t = {}; for (var k in votes) t[votes[k]] = (t[votes[k]] || 0) + 1; return t; }
  function resolveVote() {
    var t = tally(), best = [], max = 0;
    for (var b in t) { if (t[b] > max) { max = t[b]; best = [b]; } else if (t[b] === max) best.push(b); }
    votes = {};
    if (!best.length) { lastWin = ''; return; }
    var w = best[Math.floor(Math.random() * best.length)];
    lastWin = LABEL[w] + ' (' + max + ' vote' + (max === 1 ? '' : 's') + ')';
    tap(w);
  }
  function renderVote() {
    var v = document.getElementById('rvote'); if (!v) return;
    if (mode !== 'vote' || phase !== 'playing') { v.style.display = 'none'; return; }
    v.style.display = 'block';
    var t = tally(), order = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
    if (current && current.system === 'gba') order.push('l', 'r');
    var max = 1; order.forEach(function (b) { if ((t[b] || 0) > max) max = t[b]; });
    var left = Math.max(0, voteEnd - Date.now()) / VOTE_MS;
    v.innerHTML = '<div class="rv-h">🗳 ROOM PLAYS</div><div class="rv-t"><i style="transform:scaleX(' + left.toFixed(3) + ')"></i></div>' +
      order.map(function (b) {
        var n = t[b] || 0;
        return '<div class="rv-row' + (n ? ' on' : '') + '"><span class="rv-b">' + LABEL[b] + '</span><span class="rv-bar"><i style="width:' + (n / max * 100) + '%"></i></span><span class="rv-n">' + n + '</span></div>';
      }).join('') +
      '<div class="rv-last">' + (lastWin ? 'Last: <b>' + lastWin + '</b>' : 'Vote on your phone!') + '</div>';
  }

  /* ---------- HUD + TV menu ---------- */
  function hud() {
    var h = document.getElementById('rhud'); if (!h || !current) return;
    h.innerHTML = '<span class="rpill">' + (mode === 'vote' ? '🗳 Room Plays' : '🎮 Free play') + '</span>' +
      (turbo ? '<span class="rpill turbo">⏩ Turbo</span>' : '') +
      '<span class="rpill dim">' + api.activePlayers().length + ' 📱</span>';
    h.classList.add('show'); clearTimeout(hudT);
    hudT = setTimeout(function () { var x = document.getElementById('rhud'); if (x) x.classList.remove('show'); }, turbo ? 999999 : 4000);
  }
  var MENU = [
    { k: 'resume', t: '▶  Resume' }, { k: 'save', t: '💾  Save state' }, { k: 'load', t: '📂  Load state' },
    { k: 'turbo', t: '⏩  Turbo' }, { k: 'mode', t: '🗳  Mode' }, { k: 'exit', t: '⏏  Save & exit to library' }
  ];
  function renderMenu() {
    var m = document.getElementById('rmenu'); if (!m) return;
    m.className = 'rmenu' + (menuOpen ? ' open' : '');
    if (!menuOpen) return;
    m.innerHTML = '<div class="rm-box"><div class="rm-h">' + api.esc(current.name) + '</div>' + MENU.map(function (it, i) {
      var extra = it.k === 'turbo' ? (turbo ? ': ON' : ': OFF') : it.k === 'mode' ? (mode === 'vote' ? ': Room Plays' : ': Free play') : '';
      return '<div class="rm-i' + (i === menuSel ? ' sel' : '') + '">' + it.t + extra + '</div>';
    }).join('') + '<div class="rm-f">▲▼ choose · OK select · BACK resume</div></div>';
  }
  function openMenu() { menuOpen = true; menuSel = 0; releaseAll(); renderMenu(); }
  function closeMenu() { menuOpen = false; renderMenu(); }
  function menuPick() {
    var k = MENU[menuSel].k;
    if (k === 'resume') closeMenu();
    else if (k === 'save') { closeMenu(); saveState(null); }
    else if (k === 'load') { closeMenu(); loadState(null); }
    else if (k === 'turbo') { setTurbo(!turbo); renderMenu(); }
    else if (k === 'mode') { setMode(mode === 'vote' ? 'free' : 'vote'); renderMenu(); }
    else if (k === 'exit') exitGame();
  }

  function saveState(p) {
    ask('saveState').then(function (m) {
      if (!m || !m.data) { api.toast('Couldn\'t save a state for this game'); return; }
      return dbPut('states', current.id, m.data).then(function () { api.toast('💾 State saved' + (p ? ' by ' + p.name : '')); });
    });
  }
  function loadState(p) {
    if (!current) return;
    dbGet('states', current.id).then(function (d) {
      if (!d) { api.toast('No saved state yet — save one first'); return; }
      return ask('loadState', { data: d }).then(function (m) {
        api.toast(m && m.ok ? '📂 State loaded' + (p ? ' by ' + p.name : '') : 'Couldn\'t load the state');
      });
    });
  }

  /* ---------- phone pads ---------- */
  function padUI(p) {
    api.setUI(p, 'gamepad', { title: current.name, system: current.system, mode: mode, turbo: turbo, vip: p === api.vip() });
  }
  function padUIAll() { api.activePlayers().forEach(padUI); }

  /* ---------- transfers: phone → TV (games, saves) and TV → phone (saves) ---------- */
  function upStatus() {
    var u = document.getElementById('rup'); if (!u) return;
    var ids = Object.keys(uploads);
    u.innerHTML = ids.map(function (id) {
      var x = uploads[id], pct = Math.floor(x.got / Math.max(1, x.n) * 100);
      return '<div class="rup-row">📤 ' + api.esc(x.who) + ' · ' + api.esc(x.name) + '<span class="rup-bar"><i style="width:' + pct + '%"></i></span>' + pct + '%</div>';
    }).join('');
  }
  function upBegin(p, m) {
    var n = m.n | 0, size = +m.size || 0;
    if (size > CHUNK_LIMIT || n < 1 || n > 4096) { api.send(p, { t: 'g', k: 'up_done', uid: m.uid, ok: false, msg: 'That file is too big (40 MB max).' }); return; }
    uploads[p.id] = { uid: m.uid, who: p.name, name: String(m.name || 'game').slice(0, 80), size: size, n: n, target: m.target === 'save' ? 'save' : 'rom', gameId: m.gameId, parts: [], got: 0 };
    api.send(p, { t: 'g', k: 'up_ack', uid: m.uid, got: 0 });
    upStatus();
  }
  function upChunk(p, m) {
    var u = uploads[p.id]; if (!u || u.uid !== m.uid || !m.data) return;
    var i = m.i | 0; if (i < 0 || i >= u.n) return;
    if (!u.parts[i]) { u.parts[i] = m.data; u.got++; }
    api.send(p, { t: 'g', k: 'up_ack', uid: u.uid, got: u.got });
    if (u.got % 8 === 0 || u.got === u.n) upStatus();
    if (u.got === u.n) upFinish(p, u);
  }
  function upFinish(p, u) {
    delete uploads[p.id]; upStatus();
    function done(ok, msg) { api.send(p, { t: 'g', k: 'up_done', uid: u.uid, ok: ok, msg: msg }); if (ok) api.toast(msg); }
    blobToBuf(new Blob(u.parts)).then(function (buf) {
      if (u.target === 'save') {
        var g = find(u.gameId);
        if (!g) return done(false, 'Pick a game first.');
        if (buf.byteLength > 1048576) return done(false, 'That doesn\'t look like a save file (too big).');
        return dbPut('saves', g.id, buf).then(function () {
          refreshLib(); done(true, '💾 Save imported for ' + g.name + '. It loads when you start the game.');
        });
      }
      var ext = (u.name.match(/\.(gba|gbc|gb)$/i) || [])[1];
      if (!ext) return done(false, 'Use a .gb, .gbc or .gba file. (Zip files need unzipping first.)');
      ext = ext.toLowerCase();
      var sys = ext, bytes = new Uint8Array(buf);
      if (sys === 'gb' && bytes.length > 0x143 && (bytes[0x143] === 0x80 || bytes[0x143] === 0xC0)) sys = 'gbc';
      if (sys === 'gba' && !(bytes.length > 0xB2 && bytes[0xB2] === 0x96)) return done(false, 'That .gba file doesn\'t look like a GBA game.');
      var base = u.name.replace(/\.[^.]+$/, ''), slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game';
      var id = 'u-' + slug + '-' + buf.byteLength;
      var meta = { id: id, name: base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60), system: sys, size: buf.byteLength, file: id + '.' + ext, added: Date.now() };
      return dbPut('roms', id, buf).then(function () { return dbPut('meta', id, meta); }).then(function () {
        sel = 0; refreshLib(); done(true, '✅ Added ' + meta.name + ' (' + SYS[sys].short + ')');
      });
    }).catch(function (e) { done(false, 'Couldn\'t store that on the TV: ' + e.message); });
  }
  function sendSave(p, id) {
    var g = find(id); if (!g) return;
    var src = current && current.id === id && phase === 'playing'
      ? ask('getSave').then(function (m) { return m && m.data; })
      : dbGet('saves', id);
    src.then(function (d) {
      if (!d) { api.send(p, { t: 'g', k: 'dl', err: 'No save yet for ' + g.name }); return; }
      var name = (g.builtin ? g.id : g.name).replace(/[^\w\- ]+/g, '').trim() + '.sav';
      api.send(p, { t: 'g', k: 'dl', name: name, data: d });
    });
  }
  function removeGame(id) {
    var g = find(id); if (!g || g.builtin) return;
    Promise.all([dbDel('roms', id), dbDel('meta', id), dbDel('saves', id), dbDel('states', id)]).then(function () {
      api.toast('🗑 Removed ' + g.name); refreshLib();
    });
  }

  /* ---------- game interface ---------- */
  return {
    start: function () {
      window.addEventListener('message', onFrameMsg);
      api.activePlayers().forEach(function (p) { api.setUI(p, 'wait', { text: 'Opening the Retro Console…' }); });
      refreshLib();
    },
    stop: function () {
      window.removeEventListener('message', onFrameMsg);
      stopVote();
      if (frame && phase === 'playing' && current) {
        // best effort: grab the latest save before the frame goes away
        var g = current, f = frame, fn = function (e) {
          var m = e.data; if (!m || m.ev !== 'stopped' || e.source !== f.contentWindow) return;
          window.removeEventListener('message', fn);
          if (m.data) dbPut('saves', g.id, m.data);
        };
        window.addEventListener('message', fn);
        f.contentWindow.postMessage({ cmd: 'stop', req: -1 }, '*');
        frame = null; stage.classList.remove('retro-full');
        setTimeout(function () { window.removeEventListener('message', fn); f.remove(); }, 2000);
      } else teardown();
    },
    onInput: function (p, m) {
      var k = m.kind, vip = p === api.vip();
      if (k === 'up_begin') return upBegin(p, m);
      if (k === 'up_chunk') return upChunk(p, m);
      if (k === 'getSave') return sendSave(p, m.id);
      if (phase === 'library') {
        if (k === 'play') return play(m.id);
        if (k === 'delete') return removeGame(m.id);
        if (k === 'mode') return setMode(m.value);
        if (k === 'lobby' && vip) return api.backToLobby();
        return;
      }
      if (phase !== 'playing' || menuOpen) return;
      if (k === 'pad' && mode === 'free') setHeld(p.id, m.b, m.v ? 1 : 0);
      else if (k === 'vote' && mode === 'vote' && BTN.hasOwnProperty(m.b)) { votes[p.id] = m.b; renderVote(); }
      else if (k === 'turbo') setTurbo(!turbo);
      else if (k === 'saveState') saveState(p);
      else if (k === 'loadState') loadState(p);
      else if (k === 'mode') setMode(m.value);
      else if (k === 'exit' && vip) exitGame();
    },
    onJoin: function (p) {
      if (phase === 'playing') { padUI(p); hud(); }
      else if (phase === 'library') libUI(p);
      else api.setUI(p, 'wait', { text: 'Loading…' });
    },
    onLeave: function (p) {
      if (held[p.id]) { var h = held[p.id]; delete held[p.id]; Object.keys(h).forEach(sync); }
      delete votes[p.id]; delete uploads[p.id]; upStatus();
      if (phase === 'library') libUIAll(); else if (phase === 'playing') { padUIAll(); hud(); }
    },
    onBack: function () {
      if (phase === 'playing') { if (menuOpen) closeMenu(); else openMenu(); return true; }
      if (phase === 'loading') { exitGame(); return true; }
      if (phase === 'exiting') return true;
      api.backToLobby(); return true;
    },
    onKey: function (k, e) {
      var REMOTE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'a', 403: 'b', 404: 'start', 405: 'select', 406: 'start' };
      if (phase === 'library') {
        if (k === 38 || k === 40) { sel = Math.max(0, Math.min(lib.length - 1, sel + (k === 40 ? 1 : -1))); renderLib(); e.preventDefault(); }
        else if (k === 13 && lib[sel]) { e.preventDefault(); play(lib[sel].id); }
        return;
      }
      if (phase !== 'playing') return;
      if (menuOpen) {
        if (k === 38) menuSel = (menuSel + MENU.length - 1) % MENU.length;
        else if (k === 40) menuSel = (menuSel + 1) % MENU.length;
        else if (k === 13) { menuPick(); return; }
        renderMenu(); return;
      }
      var b = REMOTE[k]; if (!b) return;
      e.preventDefault();
      if (mode === 'vote') { votes.remote = b; renderVote(); } else setHeld('remote', b, 1);
    },
    onKeyUp: function (k) {
      var REMOTE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'a', 403: 'b', 404: 'start', 405: 'select', 406: 'start' };
      if (phase === 'playing' && REMOTE[k]) setHeld('remote', REMOTE[k], 0);
    }
  };
});
