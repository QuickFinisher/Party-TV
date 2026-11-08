/* Egg Heist: grab eggs from the middle, bring them to your nest, steal from everyone else's.
 * Dash into a player carrying an egg to knock it loose. Golden eggs are worth 3. */
App.defineGame('heist', function (api) {
    var AW = 1536, AH = 768, R = 22, NEST_R = 62, SPEED = 7, DASH_MULT = 2.6, DASH_MS = 280, DASH_CD = 1800;
    var ROUND_MS = 90000, FPS_MS = 33;
    var NESTS = [[90, 90], [AW - 90, AH - 90], [90, AH - 90], [AW - 90, 90], [AW / 2, 70], [AW / 2, AH - 70], [70, AH / 2], [AW - 70, AH / 2]];
    var el = api.el, canvas, ctx, runners = {}, eggs = [], phase = 'intro', loopH, spawnH, roundStart = 0, lastFrame = 0;

    function layout() {
      el.innerHTML = '<div class="g-head"><div class="g-title">🥚 Egg Heist</div><div class="g-sub" id="htime"></div></div>' +
        '<canvas class="arena" id="hcv" width="' + AW + '" height="' + AH + '"></canvas><div class="scorestrip" id="strip"></div>';
      canvas = document.getElementById('hcv'); ctx = canvas.getContext('2d');
    }

    function nestValue(r) { return r.nest.reduce(function (a, b) { return a + b; }, 0); }

    function strip() {
      var s = document.getElementById('strip'); if (!s) return;
      s.innerHTML = api.activePlayers().map(function (p) {
        var r = runners[p.id];
        return '<div class="s" style="--c:' + p.color + '">' + api.esc(p.name) + '<b>' + (r ? nestValue(r) : 0) + ' 🥚</b></div>';
      }).join('');
    }

    function addRunner(p, i) {
      var n = NESTS[i % NESTS.length];
      runners[p.id] = { p: p, x: n[0], y: n[1], nx: n[0], ny: n[1], jx: 0, jy: 0, carry: 0, nest: [], dashUntil: 0, dashReady: 0, stunUntil: 0 };
      api.setUI(p, 'stick', { color: p.color, button: 'DASH' });
    }

    function spawnEgg() {
      var max = Math.max(4, api.activePlayers().length * 2 + 2);
      if (eggs.length >= max) return;
      var a = Math.random() * Math.PI * 2, d = Math.random() * 220;
      eggs.push({ x: AW / 2 + Math.cos(a) * d * 1.6, y: AH / 2 + Math.sin(a) * d * 0.8, v: Math.random() < 0.12 ? 3 : 1, born: Date.now() });
    }

    function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

    function step() {
      var now = Date.now();
      var dt = Math.min(3, (now - lastFrame) / FPS_MS); lastFrame = now;
      var list = Object.keys(runners).map(function (k) { return runners[k]; }).filter(function (r) { return r.p.connected; });
      list.forEach(function (r) {
        if (now < r.stunUntil) return;
        var sp = SPEED * (r.carry ? 0.8 : 1) * (now < r.dashUntil ? DASH_MULT : 1);
        r.x = Math.max(R, Math.min(AW - R, r.x + r.jx * sp * dt));
        r.y = Math.max(R, Math.min(AH - R, r.y + r.jy * sp * dt));
      });
      list.forEach(function (r) {
        // dash tackles knock eggs loose
        if (now < r.dashUntil) list.forEach(function (o) {
          if (o !== r && o.carry && now >= o.stunUntil && dist(r.x, r.y, o.x, o.y) < R * 2.2) {
            eggs.push({ x: o.x + (Math.random() - .5) * 80, y: o.y + (Math.random() - .5) * 80, v: o.carry, born: now });
            o.carry = 0; o.stunUntil = now + 700;
            api.setUI(o.p, 'stick', { color: o.p.color, button: 'DASH', flash: 'Knocked! 💥' });
          }
        });
        if (!r.carry) {
          // pick up a loose egg
          for (var i = 0; i < eggs.length; i++) {
            if (dist(r.x, r.y, eggs[i].x, eggs[i].y) < R + 16) { r.carry = eggs[i].v; eggs.splice(i, 1); break; }
          }
        }
        if (!r.carry) {
          // steal from someone else's nest
          list.forEach(function (o) {
            if (!r.carry && o !== r && o.nest.length && dist(r.x, r.y, o.nx, o.ny) < NEST_R) {
              r.carry = o.nest.pop();
              api.setUI(o.p, 'stick', { color: o.p.color, button: 'DASH', flash: r.p.name + ' is robbing you! 😱' });
              strip();
            }
          });
        } else if (dist(r.x, r.y, r.nx, r.ny) < NEST_R) {
          r.nest.push(r.carry); r.carry = 0; strip();
        }
      });
      draw(list, now);
      var left = Math.max(0, ROUND_MS - (now - roundStart));
      var t = document.getElementById('htime'); if (t) t.textContent = Math.ceil(left / 1000) + 's left';
      if (left <= 0) finish();
    }

    function egg(x, y, v, scale) {
      ctx.save(); ctx.translate(x, y); ctx.scale(scale || 1, scale || 1);
      ctx.fillStyle = v > 1 ? '#ffd43b' : '#fff8e7';
      ctx.shadowColor = v > 1 ? '#ffd43b' : 'rgba(255,255,255,.5)'; ctx.shadowBlur = v > 1 ? 20 : 6;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function draw(list, now) {
      ctx.fillStyle = '#0b1a12'; ctx.fillRect(0, 0, AW, AH);
      ctx.fillStyle = 'rgba(81,207,102,.07)';
      for (var gx = 0; gx < AW; gx += 64) for (var gy = (gx / 64) % 2 ? 0 : 64; gy < AH; gy += 128) ctx.fillRect(gx, gy, 64, 64);
      // center pile
      ctx.strokeStyle = 'rgba(255,212,59,.25)'; ctx.lineWidth = 4; ctx.setLineDash([12, 12]);
      ctx.beginPath(); ctx.ellipse(AW / 2, AH / 2, 360, 180, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // nests
      list.forEach(function (r) {
        ctx.fillStyle = r.p.color + '33'; ctx.strokeStyle = r.p.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(r.nx, r.ny, NEST_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (var i = 0; i < Math.min(r.nest.length, 9); i++) {
          var a = i / 9 * Math.PI * 2; egg(r.nx + Math.cos(a) * 30, r.ny + Math.sin(a) * 30, r.nest[i], 0.75);
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(nestValue(r), r.nx, r.ny);
      });
      eggs.forEach(function (e) { egg(e.x, e.y, e.v, 1 + 0.08 * Math.sin((now - e.born) / 150)); });
      // runners
      list.forEach(function (r) {
        var stunned = now < r.stunUntil, dashing = now < r.dashUntil;
        ctx.globalAlpha = stunned ? 0.5 : 1;
        ctx.fillStyle = r.p.color; ctx.shadowColor = r.p.color; ctx.shadowBlur = dashing ? 30 : 10;
        ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(r.x - 7, r.y - 4, 4, 0, 7); ctx.arc(r.x + 7, r.y - 4, 4, 0, 7); ctx.fill();
        if (r.carry) egg(r.x, r.y - 34, r.carry, 0.9);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(r.p.name, r.x, r.y + R + 18);
      });
    }

    function finish() {
      if (phase !== 'play') return;
      phase = 'over'; api.cancel(loopH); api.cancel(spawnH);
      Object.keys(runners).forEach(function (k) { var r = runners[k]; api.addScore(r.p, nestValue(r) * 100); });
      el.insertAdjacentHTML('beforeend', '<div class="bigmsg">⏰ TIME!<small>Counting eggs…</small></div>');
      api.setAllUI('wait', { text: 'Time\'s up! Check the TV.' });
      api.after(3000, api.endGame);
    }

    return {
      start: function () {
        layout();
        el.insertAdjacentHTML('beforeend', '<div class="bigmsg" id="hintro">🥚 Egg Heist<small>Grab eggs → bring them home · steal from other nests · DASH into carriers</small></div>');
        api.setAllUI('wait', { text: 'Get ready! Joystick + DASH button incoming.' });
        api.after(4500, function () {
          var i = document.getElementById('hintro'); if (i) i.remove();
          api.activePlayers().forEach(addRunner);
          for (var k = 0; k < 6; k++) spawnEgg();
          strip();
          phase = 'play'; roundStart = Date.now(); lastFrame = Date.now();
          loopH = api.every(FPS_MS, step);
          spawnH = api.every(1400, spawnEgg);
        });
      },
      onInput: function (p, msg) {
        var r = runners[p.id]; if (!r || phase !== 'play') return;
        if (msg.kind === 'joy') {
          var x = +msg.x || 0, y = +msg.y || 0, m = Math.sqrt(x * x + y * y);
          if (m > 1) { x /= m; y /= m; }
          r.jx = x; r.jy = y;
        } else if (msg.kind === 'btn' && msg.value === 'dash') {
          var now = Date.now();
          if (now >= r.dashReady && now >= r.stunUntil) { r.dashUntil = now + DASH_MS; r.dashReady = now + DASH_CD; }
        }
      },
      onJoin: function (p) {
        if (phase === 'play') {
          if (!runners[p.id]) { var used = Object.keys(runners).length; addRunner(p, used); strip(); }
          else api.setUI(p, 'stick', { color: p.color, button: 'DASH' });
        } else api.setUI(p, 'wait', { text: 'Hang tight…' });
      },
      onLeave: function () { strip(); }
    };
});
