/* Party TV phone controller. The TV tells us which "mode" to show; we send inputs back. */
(function () {
  var params = new URLSearchParams(location.search);
  var LOCAL = params.get('local') === '1';
  var $ = function (s) { return document.querySelector(s); };
  var play = $('#play'), conn = null, session = null, room = null, lastPong = 0, hbTimer = null, cleanup = null;

  // Local test mode uses per-tab storage so several "phones" can run as tabs on one computer.
  function store(k, v) {
    try {
      var s = LOCAL ? sessionStorage : localStorage;
      if (v === undefined) return s.getItem(k); s.setItem(k, v);
    } catch (e) { return null; }
  }
  // iOS Safari ignores user-scalable=no, so block pinch-zoom and double-tap zoom ourselves.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now(), t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (!typing && now - lastTouchEnd < 350) {
      e.preventDefault();               // second tap of a double-tap: stop the zoom…
      if (t && t.click && t.closest && t.closest('button, [data-btn], [data-chip], [data-i], [data-act], [data-g]')) t.click(); // …but still press the button
    }
    lastTouchEnd = now;
  }, { passive: false });

  var clientId = store('ptv-client') || ('c' + Math.random().toString(36).slice(2, 12));
  store('ptv-client', clientId);

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms || 15); } catch (e) {} }
  function send(o) { if (conn) conn.send(o); }
  function input(o) { o.t = 'input'; send(o); }

  /* ---------- join ---------- */
  $('#code').value = (params.get('room') || '').toUpperCase().slice(0, 4);
  $('#name').value = store('ptv-name') || '';
  if ($('#code').value && !$('#name').value) $('#name').focus();
  $('#joinBtn').onclick = doJoin;
  $('#name').addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });

  function joinMsg(t, err) { var m = $('#joinMsg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }

  function doJoin() {
    var code = $('#code').value.toUpperCase().replace(/[^A-Z]/g, '');
    var name = $('#name').value.trim();
    if (code.length !== 4) return joinMsg('Enter the 4-letter code on the TV', true);
    if (!name) return joinMsg('Enter a name', true);
    store('ptv-name', name); room = code;
    $('#joinBtn').disabled = true; joinMsg('Connecting…');
    if (session) session.destroy();
    session = Net.join(code, {
      local: LOCAL,
      onOpen: function (c) {
        conn = c;
        conn.onData(onMsg);
        conn.onClose(onLost);
        send({ t: 'join', name: name, clientId: clientId });
        lastPong = Date.now();
        clearInterval(hbTimer);
        hbTimer = setInterval(function () {
          send({ t: 'ping' });
          if (Date.now() - lastPong > 10000) onLost();
        }, 3000);
        try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
      },
      onError: function (e) {
        $('#joinBtn').disabled = false;
        var t = e && e.type;
        if (t === 'peer-unavailable') joinMsg('No TV found with code ' + code + '. Check the TV screen.', true);
        else joinMsg('Connection problem (' + (t || 'unknown') + '). Try again.', true);
      }
    });
  }

  function onLost() {
    if (!conn) return;
    conn = null; clearInterval(hbTimer);
    show('lost');
    render('center', { icon: '📡', title: 'Disconnected', text: 'Tap to rejoin', bad: true, tap: function () { show('join'); $('#joinBtn').disabled = false; doJoin(); } });
  }

  function show(which) {
    $('#join').classList.toggle('hidden', which !== 'join');
    play.classList.toggle('hidden', which === 'join');
  }

  /* ---------- messages from TV ---------- */
  function onMsg(m) {
    if (!m) return;
    if (m.t === 'pong') { lastPong = Date.now(); return; }
    lastPong = Date.now();
    if (m.t === 'welcome') {
      show('play');
      document.documentElement.style.setProperty('--me', m.color);
      $('#meName').textContent = m.name; $('#me').classList.remove('hidden');
      buzz(40);
    } else if (m.t === 'full') {
      show('join'); $('#joinBtn').disabled = false; joinMsg('That game is full (8 players).', true);
    } else if (m.t === 'ui') {
      bar(m.g, m.v);
      render(m.mode, m.data || {});
    } else if (m.t === 'bar') {
      bar(m.g, m.v);
    } else if (m.t === 'left') {
      leftGame();
    } else if (m.t === 'g') {
      onGame(m);
    }
  }

  /* ---------- Retro Console controller layouts (button id = libretro name, label = what's printed) ---------- */
  var RMODE = { free: '🎮 Free play', vote: '🗳 Room Plays', players: '👥 Players' };
  var SS = [['select', 'SELECT'], ['start', 'START']];
  var PADS = {
    gb:   { face: [['b', 'B'], ['a', 'A']], meta: SS },
    gba:  { face: [['b', 'B'], ['a', 'A']], sh: [['l', 'L'], ['r', 'R']], meta: SS },
    nes:  { face: [['b', 'B'], ['a', 'A']], meta: SS },
    snes: { face: [['y', 'Y'], ['x', 'X'], ['b', 'B'], ['a', 'A']], diamond: true, sh: [['l', 'L'], ['r', 'R']], meta: SS },
    md:   { face: [['y', 'A'], ['b', 'B'], ['a', 'C']], meta: [['start', 'START']] },
    sms:  { face: [['b', '1'], ['a', '2']], meta: [['start', 'START']] }
  };

  /* ---------- End game (VIP) / Leave (everyone) ---------- */
  var barState = { g: 0, v: 0 };
  function bar(g, v) {
    barState = { g: g ? 1 : 0, v: v ? 1 : 0 };
    var b = $('#exitBtn'); if (!b) return;
    b.classList.toggle('hidden', !barState.g);
    b.textContent = barState.v ? '⏹ End game' : '🚪 Leave';
  }
  $('#exitBtn').onclick = function () {
    if (!conn) return;
    if (barState.v) { if (confirm('End this game for everyone and go back to the lobby?')) send({ t: 'endGame' }); }
    else if (confirm('Leave this game? You can rejoin any time.')) send({ t: 'leave' });
  };
  function leftGame() {
    var c = conn; conn = null; clearInterval(hbTimer);
    try { session && session.destroy(); } catch (e) {}
    bar(0, 0);
    render('center', { icon: '👋', title: 'You left the game', text: 'Tap here to rejoin', tap: function () { show('join'); $('#joinBtn').disabled = false; doJoin(); } });
  }

  /* ---------- views ---------- */
  // Per-phone language. A screen that sets `lang: 1` gets a 🌐 toggle; its `es` object replaces fields when in Spanish.
  var lang = store('ptv-lang') === 'es' ? 'es' : 'en', lastView = null;
  function render(mode, d) {
    if (cleanup) { cleanup(); cleanup = null; }
    lastView = [mode, d];
    // fresh container each time so listeners from the previous screen never stack up
    var fresh = play.cloneNode(false); play.parentNode.replaceChild(fresh, play); play = fresh;
    var emotes = mode === 'lobby' || mode === 'wait' || mode === 'result' || mode === 'center' || !!(d && d.emotes);
    $('#emotes').classList.toggle('hidden', !emotes);
    var dd = d;
    if (d && d.es && lang === 'es') { dd = {}; for (var k in d) dd[k] = d[k]; for (var e in d.es) dd[e] = d.es[e]; }
    (VIEWS[mode] || VIEWS.wait)(dd);
    if (d && d.lang) {
      var b = document.createElement('button');
      b.className = 'langbtn';
      b.textContent = lang === 'es' ? '🌐 English' : '🌐 Español';
      b.onclick = function (ev) {
        ev.stopPropagation(); buzz(10);
        lang = lang === 'es' ? 'en' : 'es'; store('ptv-lang', lang);
        if (lastView) render(lastView[0], lastView[1]);
      };
      play.insertBefore(b, play.firstChild);
    }
  }


  /* ---------- bottom sheet (survives screen changes: uploads, downloads) ---------- */
  function sheet(html, cls) {
    var s = $('#sheet');
    if (!s) { s = document.createElement('div'); s.id = 'sheet'; document.body.appendChild(s); }
    if (!html) { s.className = ''; s.innerHTML = ''; return s; }
    s.className = 'open ' + (cls || '');
    s.innerHTML = '<button class="sheet-x" aria-label="Close">✕</button>' + html;
    s.querySelector('.sheet-x').onclick = function () { if (!up) sheet(null); };
    return s;
  }

  /* ---------- sending files to the TV (games and saves) ---------- */
  var CH = 64 * 1024, WINDOW = 8, up = null;
  function startUpload(file, target, gameId) {
    if (!file) return;
    if (up) { sheet('<p>Already sending a file — hang on.</p>'); return; }
    if (target === 'rom' && !/\.(gb|gbc|gba|nes|sfc|smc|md|gen|smd|bin|sms|gg)$/i.test(file.name)) {
      sheet('<p class="bad">Pick a game file: <b>.gb .gbc .gba .nes .sfc .smc .md .gen .bin .sms .gg</b>.' + (/\.zip$/i.test(file.name) ? ' Unzip it first (Files app → tap the zip).' : '') + '</p>', 'err'); return;
    }
    if (file.size > 40 * 1024 * 1024) { sheet('<p class="bad">That file is too big (40 MB max).</p>', 'err'); return; }
    sheet('<p>Reading ' + esc(file.name) + '…</p>');
    var reader = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsArrayBuffer(file); });
    reader.then(function (buf) {
      up = { uid: 'u' + Date.now(), name: file.name, buf: buf, n: Math.max(1, Math.ceil(buf.byteLength / CH)), sent: 0, acked: 0, target: target };
      input({ kind: 'up_begin', uid: up.uid, name: file.name, size: buf.byteLength, n: up.n, target: target, gameId: gameId });
      upView();
    });
  }
  function pump() {
    while (up && up.sent < up.n && up.sent - up.acked < WINDOW) {
      var i = up.sent++;
      input({ kind: 'up_chunk', uid: up.uid, i: i, data: up.buf.slice(i * CH, (i + 1) * CH) });
    }
  }
  function upView() {
    if (!up) return;
    var pct = Math.floor(up.acked / up.n * 100);
    var s = $('#sheet');
    if (s && s.querySelector('.upbar')) { s.querySelector('.upbar i').style.width = pct + '%'; s.querySelector('.uppct').textContent = pct + '%'; return; }
    sheet('<p>📤 Sending <b>' + esc(up.name) + '</b> to the TV</p><div class="upbar"><i style="width:' + pct + '%"></i></div><p class="uppct">' + pct + '%</p><p class="hint">Keep this screen open.</p>');
  }
  function onGame(m) {
    if (m.k === 'up_ack' && up && m.uid === up.uid) { up.acked = m.got; pump(); upView(); }
    else if (m.k === 'up_done' && up && m.uid === up.uid) {
      up = null; buzz(m.ok ? [30, 50, 30] : 150);
      sheet('<p class="' + (m.ok ? 'good' : 'bad') + '">' + esc(m.msg) + '</p>', m.ok ? 'ok' : 'err');
      if (m.ok) setTimeout(function () { var s = $('#sheet'); if (s && s.classList.contains('ok') && !up) sheet(null); }, 3500);
    }
    else if (m.k === 'dl') {
      if (m.err) { sheet('<p class="bad">' + esc(m.err) + '</p>', 'err'); return; }
      var url = URL.createObjectURL(new Blob([m.data], { type: 'application/octet-stream' }));
      sheet('<p>💾 Save file ready</p><a class="big dl" href="' + url + '" download="' + esc(m.name) + '">Save "' + esc(m.name) + '" to this phone</a>' +
        '<p class="hint">Keep it somewhere safe. You can import it back any time.</p>', 'ok');
    }
  }

  var VIEWS = {
    center: function (d) {
      play.innerHTML = '<div class="center ' + (d.good ? 'good' : d.bad ? 'bad' : '') + '"><div class="icon">' + (d.icon || '') + '</div>' +
        '<div class="title">' + esc(d.title || '') + '</div><div class="text">' + esc(d.text || '') + '</div></div>';
      if (d.tap) play.firstChild.onclick = d.tap;
    },

    wait: function (d) { VIEWS.center({ icon: '⏳', title: d.text || 'Waiting…', text: 'Watch the TV' }); },

    result: function (d) {
      VIEWS.center({ icon: d.good ? '🎉' : '😬', title: d.title, text: d.text, good: d.good, bad: !d.good });
      buzz(d.good ? [40, 60, 40] : 120);
    },

    lobby: function (d) {
      if (!d.vip) {
        VIEWS.center({ icon: '🎮', title: 'You\'re in!', text: 'Waiting for the 👑 player or the TV remote to pick a game. ' + d.players + ' player' + (d.players === 1 ? '' : 's') + ' here.' });
        return;
      }
      var lastCat = null;
      play.innerHTML = '<h2>👑 You pick the game</h2><p class="msg">' + d.players + ' player' + (d.players === 1 ? '' : 's') + ' connected</p><div class="games">' + d.games.map(function (g) {
        var locked = d.players < g.min;
        var head = g.cat && g.cat !== lastCat ? '<div class="gcat">' + esc(g.cat) + '</div>' : '';
        lastCat = g.cat;
        return head + '<button data-g="' + g.id + '"' + (locked ? ' disabled' : '') + '><span class="gi">' + g.icon + '</span><span>' + esc(g.name) +
          '<small>' + (locked ? 'Needs ' + g.min + '+ players' : (g.min === g.max ? g.min : g.min + '–' + (g.max || 8)) + ' players') + '</small></span></button>';
      }).join('') + '</div>';
      play.querySelectorAll('[data-g]').forEach(function (b) {
        b.onclick = function () { buzz(); send({ t: 'pick', game: b.getAttribute('data-g') }); };
      });
    },

    choices: function (d) {
      play.innerHTML = '<div class="prompt">' + esc(d.prompt || '') + '</div>' + (d.q ? '<div class="qtext">' + esc(d.q) + '</div>' : '') + '<div class="choices">' + d.options.map(function (o, i) {
        return '<button data-i="' + i + '" style="background:' + d.colors[i] + '"><span class="sh">' + (d.shapes ? d.shapes[i] : '') + '</span>' + esc(o) + '</button>';
      }).join('') + '</div>';
      play.querySelectorAll('[data-i]').forEach(function (b) {
        b.onclick = function () { buzz(30); input({ kind: 'choice', value: +b.getAttribute('data-i') }); };
      });
    },

    text: function (d) {
      play.innerHTML = '<div class="prompt">' + esc(d.prompt || '') + '</div>' +
        '<form class="guess"><input id="gin" maxlength="30" autocomplete="off" autocorrect="off" placeholder="' + esc(d.placeholder || '') + '"><button class="big">Send</button></form>' +
        '<div class="sent" id="sent"></div>';
      var inp = $('#gin');
      setTimeout(function () { inp.focus(); }, 50);
      play.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var v = inp.value.trim(); if (!v) return;
        input({ kind: 'text', value: v }); buzz();
        var s = document.createElement('div'); s.textContent = v; $('#sent').prepend(s);
        inp.value = ''; inp.focus();
      };
    },

    number: function (d) {
      play.innerHTML = '<div class="prompt">' + esc(d.prompt || '') + '</div>' +
        '<form class="bid" novalidate><div class="bidrow"><span>$</span><input id="bin" inputmode="numeric" maxlength="11" autocomplete="off" placeholder="0"></div>' +
        '<button class="big">Lock in bid</button></form><p class="msg">' + esc(d.hint || '') + '</p>';
      var inp = $('#bin');
      setTimeout(function () { inp.focus(); }, 50);
      inp.addEventListener('input', function () {
        var digits = inp.value.replace(/[^0-9]/g, '').slice(0, 8);
        inp.value = digits ? (+digits).toLocaleString() : '';
      });
      play.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var v = +inp.value.replace(/[^0-9]/g, '');
        if (!inp.value) return;
        buzz(30); input({ kind: 'number', value: v });
      };
    },

    retroLib: function (d) {
      play.innerHTML = '<h2>🕹️ Retro Console</h2><div class="rl-list">' + d.games.map(function (g) {
        return '<div class="rl-row" data-id="' + esc(g.id) + '"><div class="rl-main"><span class="rl-sys rl-' + g.system.toLowerCase() + '">' + g.system + '</span>' +
          '<span class="rl-name">' + esc(g.name) + '<small>' + (g.builtin ? 'Free homebrew' : esc(g.size)) + (g.hasSave ? ' · 💾 saved' : '') + '</small></span></div>' +
          '<div class="rl-acts"><button class="big" data-act="play">▶ Play</button>' +
          '<button data-act="importSave">⬆ Import save</button>' + (g.hasSave ? '<button data-act="getSave">⬇ Download save</button>' : '') +
          (g.builtin ? '' : '<button data-act="delete" class="danger">🗑 Remove</button>') + '</div></div>';
      }).join('') + '</div>' +
        '<label class="big addgame">➕ Add a game from this phone<input type="file" id="romIn" hidden></label>' +
        '<p class="msg">Game Boy · GBA · NES · SNES · Genesis · Master System · Game Gear — from carts you own</p>' +
        '<div class="rl-vip">' + (d.vip
          ? '<button data-act="mode">' + RMODE[d.mode || 'free'] + ' (tap to change)</button><button data-act="lobby">🏠 Back to party games</button>'
          : '<p class="msg">Mode: ' + RMODE[d.mode || 'free'] + '</p>') + '</div>' +
        '<input type="file" id="saveIn" hidden>';
      var target = null;
      play.querySelector('.rl-list').addEventListener('click', function (e) {
        var row = e.target.closest('.rl-row'); if (!row) return;
        var id = row.getAttribute('data-id'), btn = e.target.closest('[data-act]');
        if (!btn) { play.querySelectorAll('.rl-row').forEach(function (r) { r.classList.toggle('open', r === row && !r.classList.contains('open')); }); buzz(8); return; }
        var act = btn.getAttribute('data-act'); buzz(15);
        if (act === 'play') input({ kind: 'play', id: id });
        else if (act === 'getSave') input({ kind: 'getSave', id: id });
        else if (act === 'importSave') { target = id; $('#saveIn').click(); }
        else if (act === 'delete' && confirm('Remove this game and its save from the TV?')) input({ kind: 'delete', id: id });
      });
      $('#romIn').onchange = function () { startUpload(this.files[0], 'rom'); this.value = ''; };
      $('#saveIn').onchange = function () { startUpload(this.files[0], 'save', target); this.value = ''; };
      var vipBox = play.querySelector('.rl-vip');
      vipBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]'); if (!b) return; buzz(15);
        if (b.dataset.act === 'mode') input({ kind: 'mode', value: 'next' });
        else if (b.dataset.act === 'lobby') input({ kind: 'lobby' });
      });
    },

    gamepad: function (d) {
      var layout = PADS[d.pad] || PADS[d.system === 'gba' ? 'gba' : 'gb'];
      var vote = d.mode === 'vote', slot = d.slot || 0;
      var face = layout.face, nf = face.length;
      var labels = { up: '▲', down: '▼', left: '◀', right: '▶' };
      face.concat(layout.sh || [], layout.meta).forEach(function (f) { labels[f[0]] = f[1]; });
      var modeTag = vote ? '🗳 Vote' : slot ? 'P' + slot : '🎮 Free';
      play.innerHTML = '<div class="gp gp-' + (d.pad || 'gb') + (vote ? ' voting' : '') + '">' +
        '<div class="gp-top"><span class="gp-title">' + esc(d.title) + '</span><span class="gp-mode' + (slot ? ' slot' : '') + '">' + modeTag + (d.turbo ? ' · ⏩' : '') + '</span></div>' +
        (slot ? '<div class="gp-slot">You\'re <b>Player ' + slot + '</b></div>' : '') +
        (vote ? '<div class="gp-vote" id="gpv">Tap a button to vote for the next press</div>' : '') +
        (layout.sh ? '<div class="gp-sh">' + layout.sh.map(function (f) { return '<button data-b="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' : '') +
        '<div class="gp-main"><div class="gp-dpad" id="dpad"><span class="u">▲</span><span class="l">◀</span><span class="r">▶</span><span class="d">▼</span></div>' +
        '<div class="gp-ab n' + nf + (layout.diamond ? ' diamond' : '') + '">' + face.map(function (f, i) {
          return '<button data-b="' + f[0] + '" class="f' + i + '">' + f[1] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="gp-ss">' + layout.meta.map(function (f) { return '<button data-b="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        '<div class="gp-tools"><button data-t="turbo"' + (d.turbo ? ' class="on"' : '') + '>⏩ Turbo</button><button data-t="saveState">💾 Save</button><button data-t="loadState">📂 Load</button>' +
        (d.vip ? '<button data-t="mode">🔁 Mode</button><button data-t="exit">⏏ Exit</button>' : '') + '</div></div>';
      var down = {}, ptr = {};
      function press(b) {
        if (vote) { input({ kind: 'vote', b: b }); buzz(12); var v = $('#gpv'); if (v) v.innerHTML = 'Your vote: <b>' + esc(labels[b] || b.toUpperCase()) + '</b>'; return; }
        if (down[b]) return; down[b] = 1; input({ kind: 'pad', b: b, v: 1 }); buzz(8);
        var el = play.querySelector('[data-b="' + b + '"]'); if (el) el.classList.add('hit');
      }
      function release(b) {
        if (!down[b]) return; delete down[b]; input({ kind: 'pad', b: b, v: 0 });
        var el = play.querySelector('[data-b="' + b + '"]'); if (el) el.classList.remove('hit');
      }
      // face + shoulder buttons: multi-touch, hold to keep pressed
      play.querySelectorAll('[data-b]').forEach(function (el) {
        var b = el.getAttribute('data-b');
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} press(b); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { el.addEventListener(t, function () { release(b); }); });
      });
      // d-pad: one surface, slide your thumb between directions (diagonals work)
      var pad = $('#dpad'), padDirs = {};
      function padSet(e) {
        var r = pad.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5, want = {};
        if (Math.sqrt(x * x + y * y) > 0.12) {
          if (y < -0.17) want.up = 1; if (y > 0.17) want.down = 1;
          if (x < -0.17) want.left = 1; if (x > 0.17) want.right = 1;
        }
        if (vote) { var k = Object.keys(want); if (k.length === 1 && !padDirs[k[0]]) press(k[0]); padDirs = want; return; }
        Object.keys(padDirs).forEach(function (dname) { if (!want[dname]) release(dname); });
        Object.keys(want).forEach(function (dname) { if (!padDirs[dname]) press(dname); });
        padDirs = want;
        pad.className = 'gp-dpad ' + Object.keys(want).join(' ');
      }
      function padEnd() { Object.keys(padDirs).forEach(release); padDirs = {}; pad.className = 'gp-dpad'; }
      pad.addEventListener('pointerdown', function (e) { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (x) {} padSet(e); });
      pad.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType !== 'mouse') padSet(e); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { pad.addEventListener(t, padEnd); });
      play.querySelector('.gp-tools').addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]'); if (!b) return; buzz(15);
        var t = b.dataset.t;
        if (t === 'mode') input({ kind: 'mode', value: 'next' });
        else if (t === 'exit') { if (confirm('Save and exit to the game library?')) input({ kind: 'exit' }); }
        else input({ kind: t });
      });
      play.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      // keyboard (for testing on a laptop): arrows, X = A, Z = B, Enter = Start, Shift = Select, A/S = L/R
      var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', x: 'a', z: 'b', w: 'x', q: 'y', Enter: 'start', Shift: 'select', a: 'l', s: 'r' };
      function kd(e) { var b = KEYS[e.key]; if (!b) return; e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) press(b); } else release(b); }
      document.addEventListener('keydown', kd); document.addEventListener('keyup', kd);
      cleanup = function () {
        document.removeEventListener('keydown', kd); document.removeEventListener('keyup', kd);
        Object.keys(down).forEach(release);
      };
    },

    /* Generic screens any game can use. See tv/games/README-GAMES.md for the full list. */

    // buttons: { title, text, lines:[str], buttons:[{id,label,sub,color,fg,on,dis,wide}], cols, chips:[{id,label,on,color}], emotes }
    //   → {kind:'btn', value:id}, chips → {kind:'chip', value:id}
    buttons: function (d) {
      var cols = d.cols || 2;
      play.innerHTML = (d.title ? '<h2 class="v-title">' + esc(d.title) + '</h2>' : '') +
        (d.text ? '<p class="v-text">' + esc(d.text) + '</p>' : '') +
        (d.lines ? '<div class="v-lines">' + d.lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' : '') +
        (d.chips ? '<div class="v-chips">' + d.chips.map(function (c) {
          return '<button class="v-chip' + (c.on ? ' on' : '') + '" data-chip="' + esc(c.id) + '"' + (c.color ? ' style="--cc:' + c.color + '"' : '') + (c.dis ? ' disabled' : '') + '>' + esc(c.label) + '</button>';
        }).join('') + '</div>' : '') +
        '<div class="v-btns" style="grid-template-columns:repeat(' + cols + ',1fr)">' + (d.buttons || []).map(function (b) {
          return '<button class="v-btn' + (b.on ? ' on' : '') + (b.wide ? ' wide' : '') + '" data-btn="' + esc(b.id) + '"' + (b.dis ? ' disabled' : '') +
            ' style="' + (b.color ? 'background:' + b.color + ';' : '') + (b.fg ? 'color:' + b.fg + ';' : '') + '">' + esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '') + '</button>';
        }).join('') + '</div>';
      play.addEventListener('click', function (e) {
        var c = e.target.closest('[data-chip]'); if (c && !c.disabled) { buzz(10); input({ kind: 'chip', value: c.dataset.chip }); return; }
        var b = e.target.closest('[data-btn]'); if (b && !b.disabled) { buzz(15); input({ kind: 'btn', value: b.dataset.btn }); }
      });
    },

    // grid: { title, text, rows, cols, cells:[{t,bg,fg,ring,dis,sm}] (row-major), square(default true), buttons:[...as above], emotes }
    //   tap → {kind:'cell', i, r, c};  buttons → {kind:'btn', value}
    grid: function (d) {
      var rows = d.rows, cols = d.cols, cells = d.cells || [];
      play.innerHTML = (d.title ? '<h2 class="v-title">' + esc(d.title) + '</h2>' : '') +
        (d.text ? '<p class="v-text">' + esc(d.text) + '</p>' : '') +
        '<div class="v-grid' + (d.square === false ? '' : ' sq') + '" style="grid-template-columns:repeat(' + cols + ',1fr);--cols:' + cols + ';--rows:' + rows + '">' +
        cells.map(function (c, i) {
          c = c || {};
          return '<button class="v-cell' + (c.sm ? ' sm' : '') + '" data-i="' + i + '"' + (c.dis ? ' disabled' : '') + ' style="' +
            (c.bg ? 'background:' + c.bg + ';' : '') + (c.fg ? 'color:' + c.fg + ';' : '') + (c.ring ? 'box-shadow:inset 0 0 0 3px ' + c.ring + ';' : '') + '">' + esc(c.t || '') + '</button>';
        }).join('') + '</div>' +
        (d.buttons && d.buttons.length ? '<div class="v-btns" style="grid-template-columns:repeat(' + Math.min(d.buttons.length, d.bcols || 3) + ',1fr)">' + d.buttons.map(function (b) {
          return '<button class="v-btn' + (b.on ? ' on' : '') + '" data-btn="' + esc(b.id) + '"' + (b.dis ? ' disabled' : '') + (b.color ? ' style="background:' + b.color + '"' : '') + '>' + esc(b.label) + '</button>';
        }).join('') + '</div>' : '');
      play.addEventListener('click', function (e) {
        var c = e.target.closest('[data-i]');
        if (c && !c.disabled) { var i = +c.dataset.i; buzz(10); input({ kind: 'cell', i: i, r: Math.floor(i / cols), c: i % cols }); return; }
        var b = e.target.closest('[data-btn]'); if (b && !b.disabled) { buzz(15); input({ kind: 'btn', value: b.dataset.btn }); }
      });
    },

    // pad: a touch area that reports where your finger is. { title, text, color, aspect (w/h, default 1), buttons }
    //   → {kind:'pos', x:0..1, y:0..1, down:1} while touching (about 30/s), {kind:'pos', down:0, x, y} on release
    pad: function (d) {
      play.innerHTML = (d.title ? '<h2 class="v-title">' + esc(d.title) + '</h2>' : '') + (d.text ? '<p class="v-text">' + esc(d.text) + '</p>' : '') +
        '<div class="v-pad" id="vpad" style="aspect-ratio:' + (d.aspect || 1) + ';' + (d.color ? '--pc:' + d.color : '') + '"><i id="vdot"></i></div>' +
        (d.buttons && d.buttons.length ? '<div class="v-btns" style="grid-template-columns:repeat(' + d.buttons.length + ',1fr)">' + d.buttons.map(function (b) {
          return '<button class="v-btn" data-btn="' + esc(b.id) + '">' + esc(b.label) + '</button>'; }).join('') + '</div>' : '');
      var pad = $('#vpad'), dot = $('#vdot'), active = null, last = 0, cur = null;
      function at(e) { var r = pad.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
      function show(p) { dot.style.left = (p[0] * 100) + '%'; dot.style.top = (p[1] * 100) + '%'; dot.style.opacity = 1; }
      function sendPos(down) { if (cur) input({ kind: 'pos', x: +cur[0].toFixed(3), y: +cur[1].toFixed(3), down: down ? 1 : 0 }); }
      pad.addEventListener('pointerdown', function (e) { e.preventDefault(); active = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (x) {} cur = at(e); show(cur); sendPos(1); last = Date.now(); buzz(8); });
      pad.addEventListener('pointermove', function (e) { if (e.pointerId !== active) return; cur = at(e); show(cur); if (Date.now() - last > 33) { last = Date.now(); sendPos(1); } });
      function end(e) { if (e.pointerId !== active) return; active = null; sendPos(0); dot.style.opacity = .35; }
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { pad.addEventListener(t, end); });
      var tick = setInterval(function () { if (active !== null && Date.now() - last > 120) { last = Date.now(); sendPos(1); } }, 60);
      play.addEventListener('click', function (e) { var b = e.target.closest('[data-btn]'); if (b) { buzz(15); input({ kind: 'btn', value: b.dataset.btn }); } });
      cleanup = function () { clearInterval(tick); if (active !== null) sendPos(0); };
    },

    // fling: drag and release. { title, text, mode:'slingshot'|'swipe', color, buttons }
    //   while dragging → {kind:'aim', dx, dy} (−1..1, relative to the pad size, from where you touched; about 15/s)
    //   on release → {kind:'fling', dx, dy, ms}   (slingshot: the TV launches opposite to dx/dy; swipe: in the dx/dy direction)
    fling: function (d) {
      play.innerHTML = (d.title ? '<h2 class="v-title">' + esc(d.title) + '</h2>' : '') + (d.text ? '<p class="v-text">' + esc(d.text) + '</p>' : '') +
        '<div class="v-pad fling" id="vfl"' + (d.color ? ' style="--pc:' + d.color + '"' : '') + '><canvas id="vflc"></canvas><span class="v-hint">' +
        (d.mode === 'swipe' ? 'Swipe up to throw ↑' : 'Pull back and let go') + '</span></div>' +
        (d.buttons && d.buttons.length ? '<div class="v-btns" style="grid-template-columns:repeat(' + d.buttons.length + ',1fr)">' + d.buttons.map(function (b) {
          return '<button class="v-btn" data-btn="' + esc(b.id) + '">' + esc(b.label) + '</button>'; }).join('') + '</div>' : '');
      var pad = $('#vfl'), cv = $('#vflc'), g = cv.getContext('2d'), start = null, t0 = 0, last = 0, cur = null;
      function size() { var r = pad.getBoundingClientRect(); cv.width = r.width; cv.height = r.height; }
      size();
      function vec(e) { var r = pad.getBoundingClientRect(), s = Math.max(r.width, r.height) / 2; return [(e.clientX - start[0]) / s, (e.clientY - start[1]) / s]; }
      function drawAim() {
        g.clearRect(0, 0, cv.width, cv.height); if (!start || !cur) return;
        var r = pad.getBoundingClientRect(), sx = start[0] - r.left, sy = start[1] - r.top, s = Math.max(r.width, r.height) / 2;
        g.strokeStyle = getComputedStyle(pad).getPropertyValue('--pc') || '#ffd43b'; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + cur[0] * s, sy + cur[1] * s); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 10, 0, 7); g.fill();
      }
      pad.addEventListener('pointerdown', function (e) { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (x) {} start = [e.clientX, e.clientY]; cur = [0, 0]; t0 = Date.now(); buzz(8); });
      pad.addEventListener('pointermove', function (e) {
        if (!start) return; cur = vec(e); drawAim();
        if (Date.now() - last > 66) { last = Date.now(); input({ kind: 'aim', dx: +cur[0].toFixed(3), dy: +cur[1].toFixed(3) }); }
      });
      function end() {
        if (!start) return;
        var v = cur || [0, 0]; start = null; drawAim();
        if (Math.abs(v[0]) + Math.abs(v[1]) < 0.06) { input({ kind: 'aim', dx: 0, dy: 0 }); return; }
        buzz(30); input({ kind: 'fling', dx: +v[0].toFixed(3), dy: +v[1].toFixed(3), ms: Date.now() - t0 });
      }
      ['pointerup', 'pointercancel'].forEach(function (t) { pad.addEventListener(t, end); });
      play.addEventListener('click', function (e) { var b = e.target.closest('[data-btn]'); if (b) { buzz(15); input({ kind: 'btn', value: b.dataset.btn }); } });
    },

    draw: function (d) {
      var COLORS = ['#111111', '#ff4d6d', '#4dabff', '#51cf66', '#ffd43b', '#ff922b', '#cc5de8', '#8d5524'];
      play.innerHTML = '<div class="wordbox"><small>' + esc(d.title || 'DRAW THIS (don\'t write it!)') + '</small><b>' + esc(d.word || '') + '</b></div>' +
        '<canvas class="pad" id="pad"></canvas><div class="tools" id="tools">' +
        COLORS.map(function (c, i) { return '<button class="sw' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') +
        '<button class="tb" data-w="4">Thin</button><button class="tb on" data-w="9">Med</button><button class="tb" data-w="22">Fat</button>' +
        '<button class="tb" data-c="erase">Eraser</button><button class="tb" id="clr">Clear</button></div>' +
        (d.done ? '<button class="big" id="drawDone">' + esc(d.done) + '</button>' : '');
      if (d.done) $('#drawDone').onclick = function () { buzz(20); input({ kind: 'btn', value: 'done' }); this.disabled = true; this.textContent = 'Sent ✓'; };
      var cv = $('#pad'), g = cv.getContext('2d');
      var color = COLORS[0], width = 9, strokeId = 0, drawing = false, pending = [], last = null;
      function size() {
        var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        cv.width = r.width * dpr; cv.height = r.height * dpr;
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.lineCap = g.lineJoin = 'round';
      }
      size();
      function pt(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
      function local(a, b) {
        g.strokeStyle = color === 'erase' ? '#fff' : color; g.lineWidth = width * cv.width / 400;
        g.beginPath(); g.moveTo(a[0] * cv.width, a[1] * cv.height); g.lineTo(b[0] * cv.width + 0.1, b[1] * cv.height); g.stroke();
      }
      function flush() { if (pending.length) { input({ kind: 'stroke', id: strokeId, pts: pending, c: color, w: width }); pending = []; } }
      var flushT = setInterval(flush, 45);
      cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drawing = true; strokeId++; last = pt(e); pending.push(last); local(last, last); });
      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return; var p = pt(e);
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.004) return;
        local(last, p); last = p; pending.push([+p[0].toFixed(4), +p[1].toFixed(4)]);
      });
      function up() { drawing = false; flush(); }
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      $('#tools').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; buzz(10);
        if (b.id === 'clr') { size(); input({ kind: 'clear' }); return; }
        if (b.dataset.c) { color = b.dataset.c; $('#tools').querySelectorAll('[data-c]').forEach(function (x) { x.classList.toggle('on', x === b); }); }
        if (b.dataset.w) { width = +b.dataset.w; $('#tools').querySelectorAll('[data-w]').forEach(function (x) { x.classList.toggle('on', x === b); }); }
      });
      cleanup = function () { clearInterval(flushT); };
    },

    dpad: function (d) {
      play.innerHTML = '<div class="prompt">' + esc(d.label || 'Steer!') + '</div><div class="dpad" id="dp">' +
        '<button class="up" data-d="up">▲</button><button class="left" data-d="left">◀</button>' +
        '<div class="mid">tap or<br>swipe</div>' +
        '<button class="right" data-d="right">▶</button><button class="down" data-d="down">▼</button></div>';
      var dp = $('#dp'), sx = 0, sy = 0, swiped = false;
      function go(dir, btn) {
        input({ kind: 'dir', value: dir }); buzz(12);
        var b = btn || dp.querySelector('[data-d="' + dir + '"]');
        if (b) { b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); }, 120); }
      }
      dp.addEventListener('pointerdown', function (e) {
        sx = e.clientX; sy = e.clientY; swiped = false;
        var b = e.target.closest('[data-d]'); if (b) { e.preventDefault(); go(b.dataset.d, b); swiped = true; }
      });
      dp.addEventListener('pointermove', function (e) {
        if (swiped || !e.buttons && e.pointerType === 'mouse') return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) { swiped = true; go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); }
      });
      dp.addEventListener('pointerup', function () { swiped = false; });
      // keyboard arrows also work (handy for testing on a laptop)
      function key(e) { var m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (m) { e.preventDefault(); go(m); } }
      document.addEventListener('keydown', key);
      cleanup = function () { document.removeEventListener('keydown', key); };
    },

    stick: function (d) {
      play.innerHTML = '<div class="stickwrap"' + (d.color ? ' style="--me:' + esc(d.color) + '"' : '') + '><div class="flash" id="flash">' + esc(d.flash || '') + '</div>' +
        '<div class="stick" id="st"><div class="tip">drag anywhere to move</div><div class="base" id="sb" style="display:none"></div><div class="knob" id="sk" style="display:none"></div></div>' +
        '<div class="sbtns">' + (d.button2 ? '<button class="dash alt" data-v="' + esc(d.value2 || 'b2') + '">' + esc(d.button2) + '</button>' : '') +
        '<button class="dash" id="dash" data-v="' + esc(d.value || 'dash') + '">' + esc(d.button || 'DASH') + '</button></div></div>';
      if (d.flash) buzz([80, 40, 80]);
      var st = $('#st'), sb = $('#sb'), sk = $('#sk'), ox = 0, oy = 0, active = null, jx = 0, jy = 0, sentX = 9, sentY = 9;
      var RAD = 65;
      function rel(e) { var r = st.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
      st.addEventListener('pointerdown', function (e) {
        active = e.pointerId; st.setPointerCapture(e.pointerId); st.querySelector('.tip').style.display = 'none';
        var p = rel(e); ox = p[0]; oy = p[1];
        sb.style.display = sk.style.display = 'block';
        sb.style.left = sk.style.left = ox + 'px'; sb.style.top = sk.style.top = oy + 'px';
        jx = jy = 0;
      });
      st.addEventListener('pointermove', function (e) {
        if (e.pointerId !== active) return;
        var p = rel(e), dx = p[0] - ox, dy = p[1] - oy, m = Math.sqrt(dx * dx + dy * dy);
        if (m > RAD) { dx = dx / m * RAD; dy = dy / m * RAD; }
        sk.style.left = (ox + dx) + 'px'; sk.style.top = (oy + dy) + 'px';
        jx = dx / RAD; jy = dy / RAD;
      });
      function end(e) { if (e.pointerId !== active) return; active = null; jx = jy = 0; sb.style.display = sk.style.display = 'none'; }
      st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
      var keys = {};
      function kd(e) { keys[e.key] = e.type === 'keydown'; if (e.key === ' ' && e.type === 'keydown') dash(); }
      document.addEventListener('keydown', kd); document.addEventListener('keyup', kd);
      var t = setInterval(function () {
        var x = jx, y = jy;
        if (active === null) { x = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); y = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0); }
        x = Math.round(x * 20) / 20; y = Math.round(y * 20) / 20;
        if (x !== sentX || y !== sentY) { sentX = x; sentY = y; input({ kind: 'joy', x: x, y: y }); }
      }, 50);
      function dash() { var b = $('#dash'); input({ kind: 'btn', value: b.dataset.v, v: 1 }); buzz(25); b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); if (d.hold) input({ kind: 'btn', value: b.dataset.v, v: 0 }); }, 150); }
      play.querySelectorAll('.dash').forEach(function (b) {
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} input({ kind: 'btn', value: b.dataset.v, v: 1 }); buzz(25); b.classList.add('hit'); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
          b.addEventListener(t, function () { if (!b.classList.contains('hit')) return; b.classList.remove('hit'); if (d.hold) input({ kind: 'btn', value: b.dataset.v, v: 0 }); });
        });
      });
      cleanup = function () { clearInterval(t); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', kd); input({ kind: 'joy', x: 0, y: 0 }); };
    }
  };

  /* ---------- emotes ---------- */
  $('#emotes').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    buzz(10); send({ t: 'emote', e: b.textContent });
  });

  // auto-join if we have both code and saved name
  if ($('#code').value.length === 4 && $('#name').value) doJoin();
})();
