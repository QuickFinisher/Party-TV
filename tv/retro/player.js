/* Runs inside an iframe in the TV app. Hosts EmulatorJS and takes commands from the parent via postMessage.
 * Keeping the emulator in its own frame means closing a game frees all of its memory. */
(function () {
  var parentWin = window.parent;
  var started = false, pendingSave = null, flushTimer = null;

  function post(o, transfer) { o.src = 'retro'; parentWin.postMessage(o, '*', transfer || []); }
  function gm() { return window.EJS_emulator && window.EJS_emulator.gameManager; }

  // Track audio contexts so we can nudge them awake (TVs sometimes start them suspended).
  ['AudioContext', 'webkitAudioContext'].forEach(function (n) {
    var C = window[n]; if (!C) return;
    var W = function (opts) { var c = new C(opts); W.all.push(c); return c; };
    W.all = []; W.prototype = C.prototype;
    window[n] = W;
  });
  function resumeAudio() {
    var W = window.AudioContext; if (!W || !W.all) return;
    W.all.forEach(function (c) { if (c.state === 'suspended') { try { c.resume(); } catch (e) {} } });
  }

  // Remote keys that land in this frame go back to the TV app instead of EmulatorJS.
  ['keydown', 'keyup'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (type === 'keydown' && e.repeat) return;
      post({ ev: 'key', type: type, keyCode: e.keyCode });
    }, true);
  });

  function copy(u8) { return u8 ? new Uint8Array(u8).buffer : null; }

  function writeSave(bytes) {
    var g = gm(); if (!g) return false;
    try {
      var path = g.getSaveFilePath(), parts = path.split('/'), cur = '';
      for (var i = 0; i < parts.length - 1; i++) {
        if (!parts[i]) continue; cur += '/' + parts[i];
        if (!g.FS.analyzePath(cur).exists) g.FS.mkdir(cur);
      }
      if (g.FS.analyzePath(path).exists) g.FS.unlink(path);
      g.FS.writeFile(path, new Uint8Array(bytes));
      g.loadSaveFiles();
      g.restart();
      return true;
    } catch (e) { console.error('writeSave', e); return false; }
  }

  function readSave() {
    var g = gm(); if (!g || !started) return null;
    try { g.saveSaveFiles(); return copy(g.getSaveFile(false)); } catch (e) { return null; }
  }

  function load(m) {
    window.EJS_player = '#game';
    window.EJS_core = m.core;                         // 'mgba' (GBA) or 'gambatte' (GB/GBC)
    window.EJS_pathtodata = 'ejs/';
    window.EJS_gameUrl = new File([m.buf], m.file);   // stable file name = stable save name
    window.EJS_gameName = m.file.replace(/\.[^.]+$/, '');
    window.EJS_startOnLoaded = true;
    window.EJS_threads = false;
    window.EJS_CacheLimit = 0;                        // the TV app already stores the ROM
    window.EJS_disableAutoLang = false;
    window.EJS_noAutoFocus = true;
    window.EJS_color = '#ffd43b';
    window.EJS_backgroundColor = '#000000';
    window.EJS_volume = 0.8;
    window.EJS_Buttons = { playPause: false, restart: false, mute: false, settings: false, fullscreen: false,
      saveState: false, loadState: false, screenRecord: false, gamepad: false, cheat: false, volume: false,
      saveSavFiles: false, loadSavFiles: false, quickSave: false, quickLoad: false, screenshot: false,
      cacheManager: false, exitEmulation: false, netplay: false, diskButton: false, contextMenu: false };
    pendingSave = m.save || null;
    window.EJS_onGameStart = function () {
      started = true;
      if (pendingSave) { writeSave(pendingSave); pendingSave = null; }
      resumeAudio();
      // flush in-game saves (SRAM) to the TV every 20 seconds
      flushTimer = setInterval(function () {
        var d = readSave(); if (d) post({ ev: 'sram', data: d }, [d]);
      }, 20000);
      post({ ev: 'started' });
    };
    var s = document.createElement('script');
    s.src = 'ejs/loader.js';
    s.onerror = function () { post({ ev: 'error', msg: 'emulator files missing' }); };
    document.body.appendChild(s);
    // surface start-up errors (EmulatorJS shows them as text in its own UI)
    setTimeout(function () {
      if (started) return;
      var t = document.querySelector('.ejs_error_text, .ejs_loading_text');
      post({ ev: 'status', msg: t ? t.textContent : 'still loading…' });
    }, 15000);
  }

  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || !m.cmd) return;
    var g = gm();
    switch (m.cmd) {
      case 'load': load(m); break;
      case 'input':
        if (started && g) { g.simulateInput(m.player || 0, m.index, m.value); resumeAudio(); }
        break;
      case 'saveState':
        if (!started || !g) return post({ ev: 'state', req: m.req, data: null });
        try { var st = copy(g.getState()); post({ ev: 'state', req: m.req, data: st }, st ? [st] : []); }
        catch (err) { post({ ev: 'state', req: m.req, data: null }); }
        break;
      case 'loadState':
        if (started && g && m.data) { try { g.loadState(new Uint8Array(m.data)); post({ ev: 'loaded', req: m.req, ok: true }); } catch (err) { post({ ev: 'loaded', req: m.req, ok: false }); } }
        break;
      case 'getSave':
        var d = readSave(); post({ ev: 'save', req: m.req, data: d }, d ? [d] : []);
        break;
      case 'putSave':
        post({ ev: 'putSave', req: m.req, ok: writeSave(m.data) });
        break;
      case 'stop':
        clearInterval(flushTimer);
        var last = readSave(); post({ ev: 'stopped', req: m.req, data: last }, last ? [last] : []);
        break;
    }
  });

  post({ ev: 'boot' });
})();
