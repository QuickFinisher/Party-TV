/* Doodle Dash: one player draws on their phone, it appears live on the TV, everyone else types guesses. */
App.defineGame('doodle', function (api) {
    var WORDS = ['pizza', 'rocket', 'cat', 'house', 'tree', 'guitar', 'snowman', 'banana', 'spider', 'castle', 'robot',
      'shark', 'rainbow', 'bicycle', 'cactus', 'dragon', 'volcano', 'airplane', 'ghost', 'hamburger', 'umbrella',
      'penguin', 'crown', 'skateboard', 'octopus', 'tent', 'ladder', 'lightbulb', 'sunglasses', 'donut', 'egg',
      'bridge', 'candle', 'whale', 'turtle', 'mushroom', 'anchor', 'balloon', 'camera', 'clock', 'cookie', 'drum',
      'fire', 'flower', 'glasses', 'hammer', 'helicopter', 'igloo', 'island', 'kite', 'lighthouse', 'moon', 'mountain',
      'phone', 'pirate', 'remote', 'sandwich', 'snail', 'speaker', 'star', 'sword', 'television', 'tornado', 'train',
      'unicorn', 'waterfall', 'wifi', 'zebra', 'popcorn', 'roller coaster', 'dinosaur', 'treasure', 'football', 'beach'];
    var TURN = 75000, DRAWER_BONUS = 60;
    var el = api.el, ctx, canvas, SIZE = 820;
    var drawers = [], turn = -1, drawer = null, word = '', guessed = {}, turnStart = 0, phase = 'intro';
    var endH, tickH, hintIdx = [], lastPt = {};
    var used = {};

    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

    function layout() {
      el.innerHTML =
        '<div class="g-head"><div class="g-title">🎨 Doodle Dash</div><div class="g-sub" id="dturn"></div></div>' +
        '<div class="timerbar"><i id="dbar"></i></div>' +
        '<div class="dwrap"><canvas class="dcanvas" id="dcv" width="' + SIZE + '" height="' + SIZE + '"></canvas>' +
        '<div class="dside"><div class="dword" id="dword"></div><div class="dwho" id="dwho"></div><div class="dfeed" id="dfeed"></div></div></div>' +
        '<div class="scorestrip" id="strip"></div>';
      canvas = document.getElementById('dcv'); ctx = canvas.getContext('2d');
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }

    function strip() {
      var s = document.getElementById('strip'); if (!s) return;
      s.innerHTML = api.activePlayers().map(function (p) {
        var tag = p === drawer ? ' ✏️' : '';
        return '<div class="s' + (guessed[p.id] ? ' done' : '') + '" style="--c:' + p.color + '">' + api.esc(p.name) + tag + '<b>' + p.score + '</b></div>';
      }).join('');
    }

    function feed(html, good) {
      var f = document.getElementById('dfeed'); if (!f) return;
      var d = document.createElement('div'); if (good) d.className = 'good';
      d.innerHTML = html; f.appendChild(d);
      while (f.children.length > 9) f.removeChild(f.firstChild);
    }

    function blanks(reveal) {
      return word.split('').map(function (ch, i) {
        if (ch === ' ') return '&nbsp;';
        return reveal || hintIdx.indexOf(i) >= 0 ? ch.toUpperCase() : '_';
      }).join(' ');
    }

    function pickWord() {
      var pool = WORDS.filter(function (w) { return !used[w]; });
      if (!pool.length) { used = {}; pool = WORDS; }
      var w = pool[Math.floor(Math.random() * pool.length)]; used[w] = 1; return w;
    }

    function nextTurn() {
      turn++;
      while (turn < drawers.length && !drawers[turn].connected) turn++;
      if (turn >= drawers.length || api.activePlayers().length < 2) { api.endGame(); return; }
      drawer = drawers[turn]; word = pickWord(); guessed = {}; hintIdx = []; lastPt = {};
      phase = 'draw';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE);
      document.getElementById('dfeed').innerHTML = '';
      document.getElementById('dturn').textContent = 'Turn ' + (turn + 1) + ' / ' + drawers.length;
      document.getElementById('dword').innerHTML = blanks(false);
      document.getElementById('dwho').innerHTML = '<span style="color:' + drawer.color + '">' + api.esc(drawer.name) + '</span> is drawing…';
      strip();
      api.setUI(drawer, 'draw', { word: word.toUpperCase(), seconds: TURN / 1000 });
      api.setAllUI('text', { prompt: drawer.name + ' is drawing. Guess it!', placeholder: 'Your guess…' }, function (p) { return p !== drawer; });
      turnStart = Date.now();
      var bar = document.getElementById('dbar');
      tickH = api.every(250, function () {
        var el2 = Date.now() - turnStart;
        if (bar) bar.style.transform = 'scaleX(' + Math.max(0, 1 - el2 / TURN) + ')';
        // reveal hint letters at 40% and 70% of the time
        var want = el2 > TURN * 0.7 ? 2 : el2 > TURN * 0.4 ? 1 : 0;
        while (hintIdx.length < want && hintIdx.length < word.replace(/ /g, '').length - 1) {
          var idx = Math.floor(Math.random() * word.length);
          if (word[idx] !== ' ' && hintIdx.indexOf(idx) < 0) { hintIdx.push(idx); document.getElementById('dword').innerHTML = blanks(false); }
        }
      });
      endH = api.after(TURN, endTurn);
    }

    function endTurn() {
      if (phase !== 'draw') return;
      phase = 'reveal';
      api.cancel(endH); api.cancel(tickH);
      document.getElementById('dword').innerHTML = blanks(true);
      var n = Object.keys(guessed).length;
      feed('The word was <b>' + api.esc(word.toUpperCase()) + '</b> — ' + n + ' got it', n > 0);
      strip();
      api.activePlayers().forEach(function (p) {
        if (p === drawer) api.setUI(p, 'result', { title: n ? 'Nice drawing! 🎨' : 'Nobody got it 😅', text: n + ' player' + (n === 1 ? '' : 's') + ' guessed it', good: n > 0 });
        else if (!guessed[p.id]) api.setUI(p, 'result', { title: 'Time\'s up!', text: 'It was: ' + word.toUpperCase(), good: false });
      });
      api.after(5000, nextTurn);
    }

    function drawStroke(msg) {
      var pts = msg.pts; if (!pts || !pts.length) return;
      var id = msg.id;
      ctx.strokeStyle = msg.c === 'erase' ? '#fff' : String(msg.c || '#111');
      ctx.lineWidth = Math.max(2, Math.min(60, +msg.w || 8)) * (SIZE / 400);
      ctx.beginPath();
      var start = lastPt[id] || pts[0];
      ctx.moveTo(start[0] * SIZE, start[1] * SIZE);
      for (var i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0] * SIZE, pts[i][1] * SIZE);
      if (pts.length === 1 && !lastPt[id]) ctx.lineTo(pts[0][0] * SIZE + 0.1, pts[0][1] * SIZE);
      ctx.stroke();
      lastPt[id] = pts[pts.length - 1];
    }

    return {
      start: function () {
        layout();
        drawers = api.shuffle(api.activePlayers().slice());
        el.insertAdjacentHTML('beforeend', '<div class="bigmsg" id="dintro">🎨 Doodle Dash<small>Everyone draws once · guess fast for more points</small></div>');
        api.setAllUI('wait', { text: 'Get ready to draw and guess!' });
        api.after(3500, function () { var i = document.getElementById('dintro'); if (i) i.remove(); nextTurn(); });
      },
      onInput: function (p, msg) {
        if (phase !== 'draw') return;
        if (p === drawer) {
          if (msg.kind === 'stroke') drawStroke(msg);
          else if (msg.kind === 'clear') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); lastPt = {}; }
          return;
        }
        if (msg.kind !== 'text' || guessed[p.id]) return;
        var g = String(msg.value || '').slice(0, 30);
        if (!g.trim()) return;
        if (norm(g) === norm(word)) {
          var left = Math.max(0, 1 - (Date.now() - turnStart) / TURN);
          var pts = 100 + Math.round(400 * left);
          guessed[p.id] = true;
          api.addScore(p, pts); api.addScore(drawer, DRAWER_BONUS);
          feed('<span style="color:' + p.color + '">' + api.esc(p.name) + '</span> guessed it! +' + pts, true);
          api.setUI(p, 'result', { title: 'You got it! ✅', text: '+' + pts + ' points', good: true });
          strip();
          var guessers = api.activePlayers().filter(function (x) { return x !== drawer; });
          if (guessers.every(function (x) { return guessed[x.id]; })) endTurn();
        } else {
          var close = norm(g).length > 2 && (norm(word).indexOf(norm(g)) >= 0 || norm(g).indexOf(norm(word)) >= 0);
          feed('<span style="color:' + p.color + '">' + api.esc(p.name) + ':</span> ' + api.esc(g) + (close ? ' 🔥' : ''));
          if (close) api.setUI(p, 'text', { prompt: 'So close! 🔥 Keep guessing', placeholder: 'Your guess…' });
        }
      },
      onJoin: function (p) {
        if (phase === 'draw' && p === drawer) api.setUI(p, 'draw', { word: word.toUpperCase() });
        else if (phase === 'draw' && !guessed[p.id]) api.setUI(p, 'text', { prompt: drawer.name + ' is drawing. Guess it!', placeholder: 'Your guess…' });
        else api.setUI(p, 'wait', { text: 'Next turn coming up…' });
        strip();
      },
      onLeave: function (p) {
        strip();
        if (phase === 'draw' && p === drawer) { feed(api.esc(p.name) + ' left — skipping turn'); endTurn(); }
        else if (api.activePlayers().length < 2 && phase === 'draw') endTurn();
      }
    };
});
