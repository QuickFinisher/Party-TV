/* Guess the Cost: an item shows on the TV, everyone bids on their phone.
 * Closest WITHOUT going over wins. Within 1% = Perfect Bid bonus. */
App.defineGame('price', function (api) {
  var ROUNDS = 8, TIME = 25000;
  var items = api.shuffle(PRICE_ITEMS.filter(function (it) { return it.p > 0; }).slice()).slice(0, ROUNDS);
  var el = api.el, i = -1, cur = null, bids = {}, phase = 'intro', endH, barH, start = 0;

  function money(n) { return '$' + Math.round(n).toLocaleString(); }

  function strip() {
    var s = document.getElementById('strip'); if (!s) return;
    s.innerHTML = api.activePlayers().map(function (p) {
      return '<div class="s' + (bids[p.id] != null && phase === 'ask' ? ' done' : '') + '" style="--c:' + p.color + '">' + api.esc(p.name) + '<b>' + p.score + '</b></div>';
    }).join('');
  }

  function next() {
    i++;
    if (i >= items.length) { api.endGame(); return; }
    cur = items[i]; bids = {}; phase = 'ask';
    el.innerHTML =
      '<div class="g-head"><div class="g-title">💸 Guess the Cost</div><div class="g-sub">Item ' + (i + 1) + ' / ' + items.length + '</div></div>' +
      '<div class="timerbar"><i id="pbar"></i></div>' +
      '<div class="pitem"><div class="pemoji">' + cur.e + '</div><div class="pcat">' + api.esc(cur.c) + '</div>' +
      '<div class="pname">' + api.esc(cur.n) + '</div><div class="phow">Closest without going over wins</div></div>' +
      '<div class="pbids" id="pbids"></div><div class="scorestrip" id="strip"></div>';
    strip();
    api.setAllUI('number', { prompt: cur.n, hint: 'Closest without going over!' });
    start = Date.now();
    var bar = document.getElementById('pbar');
    barH = api.every(100, function () { if (bar) bar.style.transform = 'scaleX(' + Math.max(0, 1 - (Date.now() - start) / TIME) + ')'; });
    endH = api.after(TIME, reveal);
  }

  function reveal() {
    if (phase !== 'ask') return;
    phase = 'reveal'; api.cancel(endH); api.cancel(barH);
    var price = cur.p, ps = api.activePlayers();
    var list = ps.filter(function (p) { return bids[p.id] != null; }).map(function (p) { return { p: p, b: bids[p.id] }; });
    var under = list.filter(function (x) { return x.b <= price; });
    var best = under.length ? Math.max.apply(null, under.map(function (x) { return x.b; })) : null;
    list.sort(function (a, b) { return a.b - b.b; });

    var html = '<div class="preveal">Actual price: <b>' + money(price) + '</b>' + (cur.note ? '<small>' + api.esc(cur.note) + '</small>' : '') + '</div>';
    if (!list.length) html += '<div class="pnone">Nobody bid 😴</div>';
    else if (best === null) html += '<div class="pnone">Everyone overbid! 😬</div>';
    html += '<div class="prows">' + list.map(function (x, k) {
      var over = x.b > price, win = !over && x.b === best, perfect = win && (price - x.b) <= price * 0.01;
      var tag = over ? '<span class="ptag over">OVER</span>' : win ? '<span class="ptag win">' + (perfect ? 'PERFECT BID! 🎯' : 'WINNER') + '</span>'
        : '<span class="ptag">' + money(price - x.b) + ' under</span>';
      return '<div class="prow2' + (over ? ' over' : '') + (win ? ' win' : '') + '" style="--c:' + x.p.color + ';animation-delay:' + (k * 0.12) + 's">' +
        '<span class="pn">' + api.esc(x.p.name) + '</span><span class="pb">' + money(x.b) + '</span>' + tag + '</div>';
    }).join('') + '</div>';
    document.getElementById('pbids').innerHTML = html;
    document.querySelector('.phow').textContent = '';

    ps.forEach(function (p) {
      var b = bids[p.id];
      if (b == null) { api.setUI(p, 'result', { title: 'No bid ⏰', text: 'It was ' + money(price), good: false }); return; }
      if (b > price) { api.setUI(p, 'result', { title: 'OVER! 😬', text: 'You bid ' + money(b) + ' · it was ' + money(price), good: false }); return; }
      if (b === best) {
        var perfect = (price - b) <= price * 0.01;
        api.addScore(p, perfect ? 1500 : 1000);
        api.setUI(p, 'result', { title: perfect ? 'PERFECT BID! 🎯' : 'You win this one! 💰', text: '+' + (perfect ? 1500 : 1000) + ' · it was ' + money(price), good: true });
        return;
      }
      var close = (price - b) <= price * 0.1;
      if (close) api.addScore(p, 250);
      api.setUI(p, 'result', { title: close ? 'Close! +250' : 'Under, but not closest', text: 'You bid ' + money(b) + ' · it was ' + money(price), good: close });
    });
    strip();
    api.after(7000, next);
  }

  return {
    start: function () {
      el.innerHTML = '<div class="bigmsg">💸 Guess the Cost<small>AV gear edition · closest without going over</small></div>';
      api.setAllUI('wait', { text: 'Get your wallet ready…' });
      api.after(3500, next);
    },
    onInput: function (p, msg) {
      if (phase !== 'ask' || msg.kind !== 'number' || bids[p.id] != null) return;
      var v = Math.round(+msg.value);
      if (!isFinite(v) || v < 0) return;
      bids[p.id] = Math.min(v, 99999999);
      api.setUI(p, 'wait', { text: 'Locked in at ' + money(bids[p.id]) });
      strip();
      if (api.activePlayers().every(function (x) { return bids[x.id] != null; })) reveal();
    },
    onJoin: function (p) {
      if (phase === 'ask' && bids[p.id] == null) api.setUI(p, 'number', { prompt: cur.n, hint: 'Closest without going over!' });
      else api.setUI(p, 'wait', { text: 'Next item coming up…' });
      strip();
    },
    onLeave: function () {
      strip();
      var ps = api.activePlayers();
      if (phase === 'ask' && ps.length && ps.every(function (x) { return bids[x.id] != null; })) reveal();
    }
  };
});
