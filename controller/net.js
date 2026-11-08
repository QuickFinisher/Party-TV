/* Party TV networking layer.
 * Two transports with the same interface:
 *  - PeerJS/WebRTC (real use: TV <-> phones over your Wi-Fi, free public matchmaking)
 *  - BroadcastChannel (?local=1: test everything in browser tabs on one computer)
 * A "conn" is { id, send(obj), onData(fn), onClose(fn), close() }.
 */
var Net = (function () {
  var PREFIX = 'partytv-v1-';

  function makeConn(id, sendFn, closeFn) {
    var dataFns = [], closeFns = [], closed = false;
    return {
      id: id,
      send: function (o) { if (!closed) { try { sendFn(o); } catch (e) {} } },
      onData: function (f) { dataFns.push(f); },
      onClose: function (f) { closeFns.push(f); },
      close: function () { if (closeFn) try { closeFn(); } catch (e) {} this._close(); },
      _emit: function (d) { for (var i = 0; i < dataFns.length; i++) dataFns[i](d); },
      _close: function () { if (closed) return; closed = true; for (var i = 0; i < closeFns.length; i++) closeFns[i](); }
    };
  }

  function wrapPeer(c) {
    var conn = makeConn(c.peer, function (o) { c.send(o); }, function () { c.close(); });
    c.on('data', function (d) { conn._emit(d); });
    c.on('close', function () { conn._close(); });
    c.on('error', function () { conn._close(); });
    return conn;
  }

  /* ---------- PeerJS ---------- */
  function peerHost(code, h) {
    var peer = new Peer(PREFIX + code, { debug: 1 });
    peer.on('open', function () { h.onReady && h.onReady(); });
    peer.on('connection', function (c) {
      c.on('open', function () { h.onConnect(wrapPeer(c)); });
    });
    peer.on('error', function (e) { h.onError && h.onError(e); });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) {} });
    return { destroy: function () { try { peer.destroy(); } catch (e) {} } };
  }

  function peerJoin(code, h) {
    var peer = new Peer({ debug: 1 });
    peer.on('open', function () {
      var c = peer.connect(PREFIX + code, { reliable: true });
      c.on('open', function () { h.onOpen(wrapPeer(c)); });
    });
    peer.on('error', function (e) { h.onError && h.onError(e); });
    return { destroy: function () { try { peer.destroy(); } catch (e) {} } };
  }

  /* ---------- BroadcastChannel (local testing) ---------- */
  function localHost(code, h) {
    var ch = new BroadcastChannel('partytv-local-' + code);
    var conns = {};
    ch.onmessage = function (ev) {
      var m = ev.data; if (!m || m.to !== 'host') return;
      if (m.type === 'hello') {
        if (conns[m.from]) conns[m.from]._close();
        var id = m.from;
        var conn = makeConn(id, function (o) { ch.postMessage({ to: id, from: 'host', type: 'data', payload: o }); },
          function () { ch.postMessage({ to: id, from: 'host', type: 'bye' }); });
        conns[id] = conn;
        ch.postMessage({ to: id, from: 'host', type: 'welcome' });
        h.onConnect(conn);
      } else if (m.type === 'data' && conns[m.from]) conns[m.from]._emit(m.payload);
      else if (m.type === 'bye' && conns[m.from]) { conns[m.from]._close(); delete conns[m.from]; }
    };
    setTimeout(function () { h.onReady && h.onReady(); }, 50);
    return { destroy: function () { ch.close(); } };
  }

  function localJoin(code, h) {
    var ch = new BroadcastChannel('partytv-local-' + code);
    var me = 'p' + Math.random().toString(36).slice(2, 10);
    var conn = null;
    ch.onmessage = function (ev) {
      var m = ev.data; if (!m || m.to !== me) return;
      if (m.type === 'welcome') {
        conn = makeConn('host', function (o) { ch.postMessage({ to: 'host', from: me, type: 'data', payload: o }); },
          function () { ch.postMessage({ to: 'host', from: me, type: 'bye' }); });
        h.onOpen(conn);
      } else if (m.type === 'data' && conn) conn._emit(m.payload);
      else if (m.type === 'bye' && conn) conn._close();
    };
    window.addEventListener('beforeunload', function () { ch.postMessage({ to: 'host', from: me, type: 'bye' }); });
    ch.postMessage({ to: 'host', from: me, type: 'hello' });
    var t = setTimeout(function () { if (!conn) h.onError && h.onError({ type: 'peer-unavailable' }); }, 3000);
    return { destroy: function () { clearTimeout(t); ch.close(); } };
  }

  return {
    host: function (code, h) { return h.local ? localHost(code, h) : peerHost(code, h); },
    join: function (code, h) { return h.local ? localJoin(code, h) : peerJoin(code, h); }
  };
})();
