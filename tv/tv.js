/* Party TV - TV host app core: lobby, players, game runner, scoreboard. */
var App = (function () {
  var COLORS = ['#ff4d6d', '#4dabff', '#ffd43b', '#51cf66', '#cc5de8', '#ff922b', '#22d3ee', '#f783ac'];
  var MAX_PLAYERS = 8;
  var state = {
    code: null, host: null, local: false,
    players: {}, order: [],        // order = player ids in join order
    games: [], menuIndex: 0,
    current: null, currentDef: null,
    timers: [], screen: 'lobby'
  };
  var stage, lobbyEl, gameEl, toastEl;

  function $(s) { return document.querySelector(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- layout ---------- */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }

  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3000);
  }

  /* ---------- room + matchmaking ---------- */
  function genCode() {
    var L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', c = '';
    for (var i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)];
    return c;
  }

  function controllerBase() {
    var cfg = window.PARTYTV_CONFIG || {};
    if (cfg.controllerUrl) return cfg.controllerUrl.replace(/\/?$/, '/');
    var m = location.href.match(/cdn\.jsdelivr\.net\/gh\/([^\/]+)\/([^\/@]+)/);
    if (m) return 'https://' + m[1].toLowerCase() + '.github.io/' + m[2] + '/controller/';
    if (/^https?:/.test(location.protocol)) return location.origin + location.pathname.replace(/tv\/[^\/]*$/, 'controller/');
    return null;
  }

  function joinUrl() {
    var base = controllerBase();
    if (!base) return null;
    return base + '?room=' + state.code + (state.local ? '&local=1' : '');
  }

  function openRoom() {
    state.code = genCode();
    setStatus('Connecting to matchmaking…', 'busy');
    if (state.host) state.host.destroy();
    state.host = Net.host(state.code, {
      local: state.local,
      onReady: function () { setStatus(state.local ? 'Local test mode' : 'Ready for players', 'ok'); renderJoin(); },
      onConnect: onConnection,
      onError: function (e) {
        var type = e && e.type;
        if (type === 'unavailable-id') { openRoom(); return; }
        if (type === 'peer-unavailable') return; // a phone left mid-handshake
        setStatus('Network error: ' + (type || e) + ' — retrying', 'err');
        setTimeout(openRoom, 5000);
      }
    });
    renderJoin();
  }

  function setStatus(text, kind) {
    var el = $('#netStatus'); if (!el) return;
    el.textContent = text; el.className = 'net-status ' + (kind || '');
  }

  /* ---------- players ---------- */
  function activePlayers() {
    var out = [];
    for (var i = 0; i < state.order.length; i++) { var p = state.players[state.order[i]]; if (p && p.connected) out.push(p); }
    return out;
  }
  function allPlayers() { return state.order.map(function (id) { return state.players[id]; }); }

  function vip() { var a = activePlayers(); return a.length ? a[0] : null; }

  function nextColor() {
    var used = {}; allPlayers().forEach(function (p) { used[p.color] = 1; });
    for (var i = 0; i < COLORS.length; i++) if (!used[COLORS[i]]) return COLORS[i];
    return COLORS[state.order.length % COLORS.length];
  }

  function onConnection(conn) {
    var player = null;
    conn.onData(function (msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { conn.send({ t: 'pong' }); if (player) player.lastSeen = Date.now(); return; }
      if (msg.t === 'join') { player = handleJoin(conn, msg); return; }
      if (!player || player.conn !== conn) return;
      player.lastSeen = Date.now();
      if (msg.t === 'input' && state.current && state.current.onInput) {
        try { state.current.onInput(player, msg); } catch (e) { console.error(e); }
      } else if (msg.t === 'pick' && !state.current && player === vip()) {
        var idx = indexOfGame(msg.game); if (idx >= 0) { state.menuIndex = idx; renderMenu(); startGame(idx); }
      } else if (msg.t === 'emote') {
        emote(player, String(msg.e || '').slice(0, 4));
      }
    });
    conn.onClose(function () { if (player && player.conn === conn) dropPlayer(player); });
  }

  function handleJoin(conn, msg) {
    var cid = String(msg.clientId || conn.id).slice(0, 40);
    var name = String(msg.name || '').replace(/[^\w \-'.!?]/g, '').trim().slice(0, 12) || 'Player';
    var p = state.players[cid];
    if (!p) {
      if (activePlayers().length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return null; }
      p = { id: cid, name: name, color: nextColor(), score: 0, connected: true };
      state.players[cid] = p; state.order.push(cid);
      toast(name + ' joined!');
    } else {
      if (p.conn && p.conn !== conn) { try { p.conn.close(); } catch (e) {} }
      p.name = name;
      if (!p.connected) toast(name + ' is back!');
    }
    p.conn = conn; p.connected = true; p.lastSeen = Date.now();
    conn.send({ t: 'welcome', name: p.name, color: p.color, room: state.code });
    renderPlayers();
    if (state.current) {
      if (state.current.onJoin) state.current.onJoin(p);
      else if (p.ui) conn.send(p.ui);
      else setUI(p, 'wait', { text: 'Game in progress — you\'re in next round!' });
    } else {
      lobbyUIAll();
    }
    return p;
  }

  function dropPlayer(p) {
    if (!p.connected) return;
    p.connected = false; p.conn = null;
    toast(p.name + ' disconnected');
    if (state.current && state.current.onLeave) { try { state.current.onLeave(p); } catch (e) { console.error(e); } }
    if (!state.current) {
      // forget players who leave while in the lobby
      delete state.players[p.id];
      state.order = state.order.filter(function (id) { return id !== p.id; });
      lobbyUIAll();
    }
    renderPlayers();
  }

  // heartbeat: phones ping every 3s; drop anyone silent for 12s
  setInterval(function () {
    var now = Date.now();
    activePlayers().forEach(function (p) { if (now - (p.lastSeen || 0) > 12000) dropPlayer(p); });
  }, 3000);

  /* ---------- phone UI ---------- */
  function setUI(p, mode, data) {
    p.ui = { t: 'ui', mode: mode, data: data || {} };
    if (p.conn) p.conn.send(p.ui);
  }
  function setAllUI(mode, data, filter) {
    activePlayers().forEach(function (p) { if (!filter || filter(p)) setUI(p, mode, data); });
  }
  function lobbyUIAll() {
    var v = vip();
    activePlayers().forEach(function (p) {
      setUI(p, 'lobby', {
        vip: p === v,
        players: activePlayers().length,
        games: p === v ? state.games.map(function (g) { return { id: g.id, name: g.name, icon: g.icon, min: g.minPlayers || 1 }; }) : null
      });
    });
  }

  /* ---------- emotes (reactions float up the screen) ---------- */
  function emote(p, e) {
    var allowed = ['😂', '🔥', '😱', '👏', '💩', '❤️', '🤯', '😎'];
    if (allowed.indexOf(e) < 0) return;
    var el = document.createElement('div');
    el.className = 'emote';
    el.innerHTML = esc(e) + '<span style="color:' + p.color + '">' + esc(p.name) + '</span>';
    el.style.left = (100 + Math.random() * 1700) + 'px';
    stage.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /* ---------- lobby rendering ---------- */
  function renderJoin() {
    var url = joinUrl();
    $('#roomCode').textContent = state.code || '----';
    var qrEl = $('#qr');
    if (!url) {
      qrEl.innerHTML = '<div class="qr-missing">Set controllerUrl in tv/config.js</div>';
      $('#joinUrl').textContent = 'Controller URL not configured';
      return;
    }
    try {
      var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    } catch (e) { qrEl.textContent = 'QR error'; }
    $('#joinUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '') + '  ·  code ' + state.code;
  }

  function renderPlayers() {
    var list = $('#playerList');
    var ps = activePlayers();
    if (!ps.length) { list.innerHTML = '<div class="empty">Scan the code with your phone to join (up to 8 players)</div>'; }
    else {
      var v = vip();
      list.innerHTML = ps.map(function (p) {
        return '<div class="pchip" style="--c:' + p.color + '"><span class="dot"></span>' + esc(p.name) + (p === v ? ' <b title="Picks the game">👑</b>' : '') + '</div>';
      }).join('');
    }
    $('#playerCount').textContent = ps.length + ' / ' + MAX_PLAYERS;
    renderMenu();
  }

  function renderMenu() {
    var n = activePlayers().length;
    $('#gameMenu').innerHTML = state.games.map(function (g, i) {
      var locked = n < (g.minPlayers || 1);
      return '<div class="gcard' + (i === state.menuIndex ? ' sel' : '') + (locked ? ' locked' : '') + '" style="--c:' + g.color + '">' +
        '<div class="gicon">' + g.icon + '</div><div class="gname">' + esc(g.name) + '</div>' +
        '<div class="gtag">' + esc(g.tagline) + '</div>' +
        '<div class="gmin">' + (locked ? 'Needs ' + g.minPlayers + '+ players' : (g.minPlayers || 1) + '–8 players') + '</div></div>';
    }).join('');
  }

  /* ---------- game runner ---------- */
  function registerGame(def) { state.games.push(def); }
  function indexOfGame(id) { for (var i = 0; i < state.games.length; i++) if (state.games[i].id === id) return i; return -1; }

  function defineGame(id, create) {
    var i = indexOfGame(id); if (i >= 0) state.games[i].create = create;
  }

  // load a game's scripts the first time it's picked
  function loadGame(def, done) {
    if (def.create) return done(null);
    if (def.loading) return;
    def.loading = true;
    toast('Loading ' + def.name + '…', 1500);
    var files = (def.files || []).slice();
    (function nextFile() {
      if (!files.length) { def.loading = false; return done(def.create ? null : new Error('game did not define itself')); }
      var sc = document.createElement('script');
      sc.src = files.shift();
      sc.onload = nextFile;
      sc.onerror = function () { def.loading = false; done(new Error('could not load ' + sc.src)); };
      document.body.appendChild(sc);
    })();
  }

  function startGame(idx) {
    var def = state.games[idx];
    var n = activePlayers().length;
    if (n < (def.minPlayers || 1)) { toast(def.name + ' needs at least ' + def.minPlayers + ' players'); return; }
    if (!def.create) {
      loadGame(def, function (err) {
        if (err) toast('Couldn\'t load ' + def.name + ': ' + err.message, 5000);
        else if (!state.current) startGame(idx);
      });
      return;
    }
    clearTimers();
    // forget disconnected players and reset scores
    state.order = state.order.filter(function (id) { return state.players[id].connected; });
    Object.keys(state.players).forEach(function (id) { if (state.order.indexOf(id) < 0) delete state.players[id]; });
    activePlayers().forEach(function (p) { p.score = 0; });
    state.currentDef = def;
    gameEl.innerHTML = '';
    gameEl.className = 'screen game-' + def.id;
    showScreen('game');
    state.current = def.create(api);
    try { state.current.start(); } catch (e) { console.error(e); toast('Game error: ' + e.message); backToLobby(); }
  }

  function endGame() {
    var def = state.currentDef;
    if (state.current && state.current.stop) { try { state.current.stop(); } catch (e) {} }
    state.current = null;
    clearTimers();
    var ranked = activePlayers().slice().sort(function (a, b) { return b.score - a.score; });
    var medals = ['🥇', '🥈', '🥉'];
    gameEl.className = 'screen game-results';
    gameEl.innerHTML = '<div class="results"><h1>' + esc(def ? def.name : '') + ' — Final Scores</h1>' +
      '<div class="podium">' + ranked.map(function (p, i) {
        return '<div class="prow" style="--c:' + p.color + ';animation-delay:' + (i * 0.25) + 's">' +
          '<span class="rank">' + (medals[i] || (i + 1)) + '</span><span class="pname">' + esc(p.name) + '</span>' +
          '<span class="pscore">' + p.score.toLocaleString() + '</span></div>';
      }).join('') + '</div><p class="hint">Back to the lobby in a few seconds…</p></div>';
    ranked.forEach(function (p, i) {
      setUI(p, 'result', { title: i === 0 ? 'WINNER! 🏆' : 'You placed #' + (i + 1), text: p.score.toLocaleString() + ' points', good: i === 0 });
    });
    after(9000, backToLobby);
  }

  function backToLobby() {
    if (state.current && state.current.stop) { try { state.current.stop(); } catch (e) {} }
    state.current = null; state.currentDef = null;
    clearTimers();
    // drop anyone who left during the game
    state.order = state.order.filter(function (id) { return state.players[id].connected; });
    Object.keys(state.players).forEach(function (id) { if (state.order.indexOf(id) < 0) delete state.players[id]; });
    showScreen('lobby');
    renderPlayers();
    lobbyUIAll();
  }

  function showScreen(name) {
    state.screen = name;
    lobbyEl.classList.toggle('hidden', name !== 'lobby');
    gameEl.classList.toggle('hidden', name !== 'game');
  }

  /* ---------- timers owned by the current game ---------- */
  function after(ms, fn) { var h = setTimeout(fn, ms); state.timers.push({ k: 't', h: h }); return h; }
  function every(ms, fn) { var h = setInterval(fn, ms); state.timers.push({ k: 'i', h: h }); return h; }
  function cancel(h) { clearTimeout(h); clearInterval(h); }
  function clearTimers() { state.timers.forEach(function (t) { cancel(t.h); }); state.timers = []; }

  /* ---------- remote control ---------- */
  function onKey(e) {
    var k = e.keyCode;
    if (state.screen === 'lobby' && !state.current) {
      var G = state.games.length;
      if (k === 37) { state.menuIndex = (state.menuIndex + G - 1) % G; renderMenu(); }
      else if (k === 39) { state.menuIndex = (state.menuIndex + 1) % G; renderMenu(); }
      else if (k === 38) { state.menuIndex = Math.max(0, state.menuIndex - 3); renderMenu(); }
      else if (k === 40) { state.menuIndex = Math.min(G - 1, state.menuIndex + 3); renderMenu(); }
      else if (k === 13) startGame(state.menuIndex);
      else if (k === 10009 || k === 27) {
        try { tizen.application.getCurrentApplication().exit(); } catch (err) {}
      }
      else return;
      e.preventDefault();
    } else if (k === 10009 || k === 27 || k === 8) {
      e.preventDefault();
      if (state.current && state.current.onBack && state.current.onBack()) return;
      if (state.current) { toast('Game cancelled'); backToLobby(); }
    } else if (state.current && state.current.onKey) {
      state.current.onKey(k, e);
    }
  }

  /* ---------- the API games receive ---------- */
  var api = {
    el: null, activePlayers: activePlayers, setUI: setUI, setAllUI: setAllUI,
    addScore: function (p, n) { p.score += n; },
    endGame: endGame, backToLobby: backToLobby, toast: toast,
    vip: vip, send: function (p, o) { if (p && p.conn) p.conn.send(o); },
    after: after, every: every, cancel: cancel,
    esc: esc, shuffle: shuffle
  };

  function registerKeys() {
    try {
      ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'MediaPlayPause'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    } catch (e) {}
  }

  function boot() {
    registerKeys();
    stage = $('#stage'); lobbyEl = $('#screen-lobby'); gameEl = $('#screen-game'); toastEl = $('#toast');
    api.el = gameEl;
    state.local = /[?&]local=1/.test(location.search);
    fit(); window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', function (e) {
      if (state.current && state.current.onKeyUp) state.current.onKeyUp(e.keyCode, e);
    });
    // lets a game (the retro console) forward remote keys that land inside its iframe
    window.addEventListener('message', function (e) {
      var m = e.data; if (!m || m.src !== 'retro' || m.ev !== 'key') return;
      var ev = { keyCode: m.keyCode, preventDefault: function () {} };
      if (m.type === 'keydown') onKey(ev);
      else if (state.current && state.current.onKeyUp) state.current.onKeyUp(m.keyCode, ev);
    });
    if (state.local) document.body.classList.add('local');
    renderPlayers();
    openRoom();
  }

  return { boot: boot, registerGame: registerGame, defineGame: defineGame };
})();
