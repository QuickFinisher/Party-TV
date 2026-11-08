/* Light Cycles: everyone leaves a wall of light behind them. Don't crash. Last one riding wins the round. */
App.defineGame('cycles', function (api) {
    var W = 64, H = 32, CELL = 24, TICK = 95, ROUNDS = 3;
    var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    var SPAWNS = [[6, 6, 'right'], [W - 7, H - 7, 'left'], [6, H - 7, 'right'], [W - 7, 6, 'left'],
      [W / 2 - 4, 3, 'down'], [W / 2 + 4, H - 4, 'up'], [3, H / 2, 'right'], [W - 4, H / 2, 'left']];
    var el = api.el, canvas, ctx, grid, bikes = {}, round = 0, phase = 'intro', tickH, ticks = 0, solo = false;

    function layout() {
      el.innerHTML = '<div class="g-head"><div class="g-title">🏍️ Light Cycles</div><div class="g-sub" id="cround"></div></div>' +
        '<canvas class="arena" id="ccv" width="' + W * CELL + '" height="' + H * CELL + '"></canvas>' +
        '<div class="scorestrip" id="strip"></div>';
      canvas = document.getElementById('ccv'); ctx = canvas.getContext('2d');
    }

    function strip() {
      var s = document.getElementById('strip'); if (!s) return;
      s.innerHTML = api.activePlayers().map(function (p) {
        var b = bikes[p.id]; var dead = b && !b.alive && phase === 'ride';
        return '<div class="s" style="--c:' + p.color + ';' + (dead ? 'opacity:.4' : '') + '">' + (dead ? '💥 ' : '') + api.esc(p.name) + '<b>' + p.score + '</b></div>';
      }).join('');
    }

    function drawGrid() {
      ctx.fillStyle = '#07061a'; ctx.fillRect(0, 0, W * CELL, H * CELL);
      ctx.strokeStyle = 'rgba(77,171,255,.08)'; ctx.lineWidth = 1;
      for (var x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H * CELL); ctx.stroke(); }
      for (var y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W * CELL, y * CELL); ctx.stroke(); }
    }

    function cell(x, y, color, head) {
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = head ? 18 : 8;
      ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
      ctx.shadowBlur = 0;
      if (head) { ctx.fillStyle = '#fff'; ctx.fillRect(x * CELL + 9, y * CELL + 9, CELL - 18, CELL - 18); }
    }

    function bigmsg(html, ms) {
      var old = document.getElementById('cmsg'); if (old) old.remove();
      el.insertAdjacentHTML('beforeend', '<div class="bigmsg" id="cmsg">' + html + '</div>');
      if (ms) api.after(ms, function () { var m = document.getElementById('cmsg'); if (m) m.remove(); });
    }

    function startRound() {
      round++;
      if (round > ROUNDS || !api.activePlayers().length) { api.endGame(); return; }
      phase = 'countdown'; ticks = 0;
      grid = new Int16Array(W * H).fill(-1);
      bikes = {};
      var ps = api.activePlayers();
      solo = ps.length === 1;
      document.getElementById('cround').textContent = 'Round ' + round + ' / ' + ROUNDS;
      drawGrid();
      ps.forEach(function (p, i) {
        var s = SPAWNS[i % SPAWNS.length];
        var b = { p: p, x: s[0], y: s[1], dir: s[2], queue: [], alive: true, idx: i };
        bikes[p.id] = b;
        grid[b.y * W + b.x] = i;
        cell(b.x, b.y, p.color, true);
        api.setUI(p, 'dpad', { color: p.color, label: 'Steer! Tap or swipe' });
      });
      strip();
      var n = 3;
      bigmsg(n + '<small>Round ' + round + '</small>');
      var cd = api.every(800, function () {
        n--;
        if (n > 0) bigmsg(n + '<small>Round ' + round + '</small>');
        else { api.cancel(cd); bigmsg('GO!', 600); phase = 'ride'; tickH = api.every(TICK, tick); }
      });
    }

    function tick() {
      ticks++;
      var list = Object.keys(bikes).map(function (k) { return bikes[k]; }).filter(function (b) { return b.alive; });
      // move heads
      list.forEach(function (b) {
        while (b.queue.length) { var d = b.queue.shift(); if (d !== OPP[b.dir] && d !== b.dir) { b.dir = d; break; } }
        cell(b.x, b.y, b.p.color, false);
        b.x += DIRS[b.dir][0]; b.y += DIRS[b.dir][1];
      });
      // collisions: walls, trails, head-on
      list.forEach(function (b) {
        if (b.x < 0 || b.y < 0 || b.x >= W || b.y >= H || grid[b.y * W + b.x] !== -1) b.crash = true;
        list.forEach(function (o) { if (o !== b && o.x === b.x && o.y === b.y) b.crash = true; });
      });
      list.forEach(function (b) {
        if (b.crash) {
          b.alive = false;
          if (b.x >= 0 && b.y >= 0 && b.x < W && b.y < H) { ctx.fillStyle = '#fff'; ctx.fillRect(b.x * CELL, b.y * CELL, CELL, CELL); }
          api.setUI(b.p, 'result', { title: 'CRASHED 💥', text: solo ? 'Survived ' + ticks + ' ticks' : 'Watch the TV…', good: false });
        } else {
          grid[b.y * W + b.x] = b.idx;
          cell(b.x, b.y, b.p.color, true);
        }
      });
      var alive = list.filter(function (b) { return b.alive; });
      if (list.length !== alive.length) strip();
      if ((solo && alive.length === 0) || (!solo && alive.length <= 1)) endRound(alive[0]);
    }

    function endRound(winner) {
      phase = 'over'; api.cancel(tickH);
      if (solo) {
        var b = bikes[Object.keys(bikes)[0]];
        api.addScore(b.p, ticks * 10);
        bigmsg('💥 ' + ticks * 10 + ' pts<small>Round ' + round + ' — survive longer!</small>');
      } else if (winner) {
        api.addScore(winner.p, 1000);
        api.setUI(winner.p, 'result', { title: 'YOU WIN THE ROUND! 🏆', text: '+1000', good: true });
        bigmsg('<span style="color:' + winner.p.color + '">' + api.esc(winner.p.name) + '</span> wins!<small>Round ' + round + ' of ' + ROUNDS + '</small>');
      } else {
        bigmsg('Double KO! 💥<small>Nobody wins round ' + round + '</small>');
      }
      strip();
      api.after(3500, function () { var m = document.getElementById('cmsg'); if (m) m.remove(); startRound(); });
    }

    return {
      start: function () {
        layout(); drawGrid();
        bigmsg('🏍️ Light Cycles<small>' + ROUNDS + ' rounds · last one riding wins</small>');
        api.setAllUI('wait', { text: 'Get ready to ride!' });
        api.after(3000, startRound);
      },
      onInput: function (p, msg) {
        var b = bikes[p.id];
        if (!b || !b.alive || msg.kind !== 'dir' || !DIRS[msg.value]) return;
        if (b.queue.length < 3) b.queue.push(msg.value);
      },
      onJoin: function (p) {
        var b = bikes[p.id];
        if (b && b.alive) api.setUI(p, 'dpad', { color: p.color, label: 'Steer!' });
        else api.setUI(p, 'wait', { text: 'You\'ll ride next round!' });
        strip();
      },
      onLeave: function (p) {
        var b = bikes[p.id]; if (b) b.alive = false;
        strip();
      },
      onKey: function () {}
    };
});
