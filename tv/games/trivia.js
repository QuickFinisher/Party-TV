/* Trivia Blitz: question on the TV, four colored answers on every phone. Faster right answers score more. */
App.defineGame('trivia', function (api) {
    var COLORS = ['#ff4d6d', '#4dabff', '#ffd43b', '#51cf66'];
    var SHAPES = ['▲', '◆', '●', '■'];
    var QTIME = 15000, ROUNDS = 10;
    var qs = api.shuffle(TRIVIA_QUESTIONS.slice()).slice(0, ROUNDS);
    var i = -1, cur = null, answers = {}, qStart = 0, phase = 'intro', endH = null, barH = null;
    var el = api.el;

    function render() {
      el.innerHTML =
        '<div class="g-head"><div class="g-title">⚡ Trivia Blitz</div><div class="g-sub">Question ' + (i + 1) + ' / ' + qs.length + '</div></div>' +
        '<div class="timerbar"><i id="tbar"></i></div>' +
        '<div class="tcount" id="tcount"></div>' +
        '<div class="tq"><div class="cat">' + api.esc(cur.cat) + '</div><div class="q">' + api.esc(cur.q) + '</div></div>' +
        '<div class="tans">' + cur.opts.map(function (o, k) {
          return '<div class="a" id="ta' + k + '" style="--c:' + COLORS[k] + '"><span class="sh">' + SHAPES[k] + '</span>' +
            api.esc(o) + '<div class="who" id="tw' + k + '"></div></div>';
        }).join('') + '</div><div class="scorestrip" id="strip"></div>';
      strip();
    }

    function strip() {
      var s = document.getElementById('strip'); if (!s) return;
      s.innerHTML = api.activePlayers().map(function (p) {
        return '<div class="s' + (answers[p.id] && phase === 'ask' ? ' done' : '') + '" style="--c:' + p.color + '">' + api.esc(p.name) + '<b>' + p.score + '</b></div>';
      }).join('');
      var c = document.getElementById('tcount');
      if (c && phase === 'ask') c.textContent = Object.keys(answers).length + ' / ' + api.activePlayers().length + ' answered';
    }

    function next() {
      i++;
      if (i >= qs.length) { api.endGame(); return; }
      var q = qs[i];
      var opts = q.a.map(function (t, k) { return { t: t, ok: k === 0 }; });
      api.shuffle(opts);
      cur = { q: q.q, cat: q.c, opts: opts.map(function (o) { return o.t; }), correct: opts.map(function (o) { return o.ok; }).indexOf(true) };
      answers = {}; phase = 'ask';
      render();
      api.setAllUI('choices', { prompt: 'Question ' + (i + 1), options: cur.opts, colors: COLORS, shapes: SHAPES });
      qStart = Date.now();
      var bar = document.getElementById('tbar');
      barH = api.every(100, function () {
        var left = Math.max(0, 1 - (Date.now() - qStart) / QTIME);
        if (bar) bar.style.transform = 'scaleX(' + left + ')';
      });
      endH = api.after(QTIME, reveal);
    }

    function reveal() {
      if (phase !== 'ask') return;
      phase = 'reveal';
      api.cancel(endH); api.cancel(barH);
      var gainers = {};
      api.activePlayers().forEach(function (p) {
        var a = answers[p.id];
        var right = a && a.c === cur.correct;
        var pts = right ? 500 + Math.round(500 * Math.max(0, 1 - a.t / QTIME)) : 0;
        if (right) { api.addScore(p, pts); gainers[p.id] = pts; }
        if (a) {
          var w = document.getElementById('tw' + a.c);
          if (w) w.innerHTML += '<span style="background:' + p.color + ';color:#111">' + api.esc(p.name) + '</span>';
        }
        api.setUI(p, 'result', right
          ? { title: 'Correct! ✅', text: '+' + pts + ' points', good: true }
          : { title: a ? 'Nope ❌' : 'Too slow ⏰', text: 'Answer: ' + cur.opts[cur.correct], good: false });
      });
      for (var k = 0; k < 4; k++) {
        var d = document.getElementById('ta' + k);
        if (d) d.classList.add(k === cur.correct ? 'right' : 'dim');
      }
      var c = document.getElementById('tcount'); if (c) c.textContent = '';
      strip();
      api.after(5000, next);
    }

    return {
      start: function () {
        el.innerHTML = '<div class="bigmsg">⚡ Trivia Blitz<small>' + ROUNDS + ' questions · answer fast on your phone</small></div>';
        api.setAllUI('wait', { text: 'Get ready! Answers show up here.' });
        api.after(3500, next);
      },
      onInput: function (p, msg) {
        if (phase !== 'ask' || msg.kind !== 'choice' || answers[p.id]) return;
        var c = msg.value | 0; if (c < 0 || c > 3) return;
        answers[p.id] = { c: c, t: Date.now() - qStart };
        api.setUI(p, 'wait', { text: 'Locked in! ' + SHAPES[c] });
        strip();
        var ps = api.activePlayers();
        if (ps.every(function (x) { return answers[x.id]; })) reveal();
      },
      onJoin: function (p) {
        if (phase === 'ask' && !answers[p.id]) api.setUI(p, 'choices', { prompt: 'Question ' + (i + 1), options: cur.opts, colors: COLORS, shapes: SHAPES });
        else api.setUI(p, 'wait', { text: 'Next question coming up…' });
        strip();
      },
      onLeave: function () {
        strip();
        var ps = api.activePlayers();
        if (phase === 'ask' && ps.length && ps.every(function (x) { return answers[x.id]; })) reveal();
      }
    };
});
