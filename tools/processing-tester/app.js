/* Processing Tester - page logic. Everything runs locally in the browser. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var LS_KEY = 'processingTester.v1';
  var MAX_FILE = 5 * 1024 * 1024;     // per file
  var MAX_TOTAL = 25 * 1024 * 1024;   // per sketch
  var IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;
  var TEXT_EXT = /\.(txt|csv|tsv|json|xml|html?)$/i;

  var state = {
    name: 'MySketch',
    tabs: [{ name: 'MySketch', code: '' }],
    active: 0,
    files: {},          // name -> { name, size, kind, dataUrl, text? }
    used: {},           // name -> true after a run
    missing: {},        // name -> function that asked for it
    ran: false,
    frame: null,        // current iframe
    size: null,
  };

  // ------------------------------------------------------------------ persistence
  function loadSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (s && s.tabs && s.tabs.length) {
        state.name = s.name || 'MySketch'; state.tabs = s.tabs; state.active = Math.min(s.active || 0, s.tabs.length - 1);
      }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ name: state.name, tabs: state.tabs, active: state.active })); } catch (e) { /* ignore */ }
    }, 300);
  }

  // Uploaded files go in IndexedDB so they survive a reload (a few MB doesn't fit localStorage).
  var dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve) {
        try {
          var req = indexedDB.open('processingTester', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('files', { keyPath: 'name' }); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }
    return dbPromise;
  }
  function dbDo(mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction('files', mode); var st = tx.objectStore('files');
          var r = fn(st);
          tx.oncomplete = function () { resolve(r && r.result !== undefined ? r.result : null); };
          tx.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  // ------------------------------------------------------------------ console
  var consoleLines = 0; var counts = { error: 0, warn: 0 };
  function log(level, text) {
    var el = $('#console');
    var div = document.createElement('div');
    div.className = 'l-' + level;
    div.textContent = text;
    el.appendChild(div);
    if (++consoleLines > 500) { el.removeChild(el.firstChild); consoleLines--; }
    el.scrollTop = el.scrollHeight;
    if (level === 'error' || level === 'warn') { counts[level]++; renderCounts(); }
    if (level === 'error') setStatus('Error', 'err');
  }
  function renderCounts() {
    var parts = [];
    if (counts.error) parts.push(counts.error + ' error' + (counts.error > 1 ? 's' : ''));
    if (counts.warn) parts.push(counts.warn + ' warning' + (counts.warn > 1 ? 's' : ''));
    $('#counts').textContent = parts.join(', ');
  }
  function clearConsole() { $('#console').textContent = ''; consoleLines = 0; counts = { error: 0, warn: 0 }; renderCounts(); }
  function setStatus(text, cls) { var s = $('#status'); s.textContent = text; s.className = 'pill' + (cls ? ' ' + cls : ''); }

  // ------------------------------------------------------------------ tabs
  function safeName(s) {
    s = String(s || '').replace(/\.pde$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z_]/.test(s)) s = '_' + s;
    return s || 'MySketch';
  }
  function renderTabs() {
    var host = $('#tabs'); host.textContent = '';
    state.tabs.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tab' + (i === state.active ? ' active' : '');
      var label = document.createElement('span'); label.textContent = t.name + '.pde';
      el.appendChild(label);
      if (i > 0) {
        var x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.title = 'Delete tab';
        x.onclick = function (ev) {
          ev.stopPropagation();
          state.tabs.splice(i, 1); state.active = Math.min(state.active, state.tabs.length - 1);
          renderTabs(); loadCode(); saveSoon();
        };
        el.appendChild(x);
      }
      el.onclick = function () { saveCode(); state.active = i; renderTabs(); loadCode(); };
      el.ondblclick = function () {
        var inp = document.createElement('input'); inp.type = 'text'; inp.value = t.name;
        label.replaceWith(inp); inp.focus(); inp.select();
        var done = function () { t.name = safeName(inp.value) || t.name; if (i === 0) state.name = t.name; renderTabs(); saveSoon(); };
        inp.onblur = done; inp.onkeydown = function (e) { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = t.name; inp.blur(); } };
        inp.onclick = function (e) { e.stopPropagation(); };
      };
      host.appendChild(el);
    });
    var add = document.createElement('button'); add.className = 'add'; add.textContent = '+'; add.title = 'Add a tab';
    add.onclick = function () { addTab('Tab' + (state.tabs.length + 1), ''); };
    host.appendChild(add);
  }
  function addTab(name, code) {
    saveCode();
    var base = safeName(name); var n = base; var k = 2;
    while (state.tabs.some(function (t) { return t.name === n; })) n = base + k++;
    state.tabs.push({ name: n, code: code || '' });
    state.active = state.tabs.length - 1;
    renderTabs(); loadCode(); saveSoon();
  }
  function saveCode() { state.tabs[state.active].code = $('#code').value; }
  function loadCode() { $('#code').value = state.tabs[state.active].code; }

  // ------------------------------------------------------------------ files
  function kindOf(name) { return IMAGE_EXT.test(name) ? 'image' : TEXT_EXT.test(name) ? 'text' : 'other'; }
  function totalBytes() { return Object.keys(state.files).reduce(function (a, k) { return a + state.files[k].size; }, 0); }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  function readFile(f) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { resolve(null); };
      r.readAsDataURL(f);
    });
  }
  function dataUrlToText(u) {
    try { var b = atob(u.split(',')[1]); return new TextDecoder('utf-8').decode(Uint8Array.from(b, function (c) { return c.charCodeAt(0); })); } catch (e) { return ''; }
  }
  function addFiles(list) {
    var chain = Promise.resolve();
    Array.prototype.forEach.call(list, function (f) {
      chain = chain.then(function () {
        if (f.size > MAX_FILE) { log('error', f.name + ' is ' + fmtSize(f.size) + ' - the limit is ' + fmtSize(MAX_FILE) + ' per file. Not added.'); return; }
        var existing = state.files[f.name] ? state.files[f.name].size : 0;
        if (totalBytes() - existing + f.size > MAX_TOTAL) { log('error', 'Adding ' + f.name + ' would go over the ' + fmtSize(MAX_TOTAL) + ' total. Not added.'); return; }
        return readFile(f).then(function (url) {
          if (!url) { log('error', 'Could not read ' + f.name); return; }
          var rec = { name: f.name, size: f.size, kind: kindOf(f.name), dataUrl: url };
          if (rec.kind === 'text') rec.text = dataUrlToText(url);
          state.files[f.name] = rec;
          delete state.missing[f.name];
          dbDo('readwrite', function (st) { return st.put(rec); });
        });
      });
    });
    chain.then(renderFiles);
  }
  function removeFile(name) {
    delete state.files[name]; delete state.used[name];
    dbDo('readwrite', function (st) { return st.delete(name); });
    renderFiles();
  }
  function renderFiles() {
    var names = Object.keys(state.files).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    var ul = $('#fileList'); ul.textContent = '';
    names.forEach(function (n) {
      var f = state.files[n]; var li = document.createElement('li');
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = n; nm.title = n;
      var sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = fmtSize(f.size);
      li.appendChild(nm); li.appendChild(sz);
      if (state.ran) {
        var st = document.createElement('span');
        var isUsed = !!state.used[n]; st.className = 'st ' + (isUsed ? 'used' : 'unused'); st.textContent = isUsed ? 'used' : 'not used';
        li.appendChild(st);
      }
      var rm = document.createElement('button'); rm.textContent = '×'; rm.title = 'Remove'; rm.onclick = function () { removeFile(n); };
      li.appendChild(rm);
      ul.appendChild(li);
    });
    $('#fileTotals').textContent = names.length ? '(' + names.length + ' file' + (names.length > 1 ? 's' : '') + ', ' + fmtSize(totalBytes()) + ' of ' + fmtSize(MAX_TOTAL) + ')' : '';
    var needs = $('#needs'); needs.textContent = '';
    Object.keys(state.missing).forEach(function (n) {
      var d = document.createElement('span'); d.className = 'need'; d.textContent = 'missing: ' + n + '  (' + state.missing[n] + ')';
      needs.appendChild(d);
    });
  }

  // ------------------------------------------------------------------ running
  function combinedCode() {
    saveCode();
    return state.tabs.map(function (t) { return t.code; }).join('\n');
  }
  function stop(silent) {
    if (state.frame) { state.frame.remove(); state.frame = null; }
    $('#frameBox').style.display = 'none';
    $('#stop').disabled = true;
    if (!silent) setStatus('Stopped');
  }
  function run() {
    stop(true);
    clearConsole();
    state.used = {}; state.missing = {}; state.ran = true;
    if (typeof self.PJS_SRC !== 'string') { log('error', 'vendor/processing-src.js did not load.'); return; }
    var pre;
    try { pre = JavaFixes.preprocess(combinedCode()); }
    catch (e) { log('warn', 'Java-math adjustments were skipped (' + e.message + ').'); pre = { code: combinedCode(), notes: [] }; }
    pre.notes.forEach(function (n) { log('info', n); });

    var box = $('#frameBox'); box.textContent = '';
    var iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');           // deliberately NOT allow-same-origin
    iframe.title = 'Sketch output';
    iframe.srcdoc = PJRunner.frameHtml(self.PJS_SRC);
    var wrap = $('#stageWrap');
    var frameSize = { w: Math.max(200, wrap.clientWidth - 24), h: Math.max(200, wrap.clientHeight - 24) };
    var files = {};
    Object.keys(state.files).forEach(function (n) {
      var f = state.files[n]; files[n] = { kind: f.kind, dataUrl: f.kind === 'image' ? f.dataUrl : undefined, text: f.text };
    });
    iframe.onload = function () {
      iframe.contentWindow.postMessage({ pj: 1, type: 'run', code: pre.code, files: files, frame: frameSize }, '*');
    };
    state.frame = iframe; state.size = null;
    iframe.style.width = '100px'; iframe.style.height = '100px';
    box.appendChild(iframe); box.style.display = 'block';
    $('#empty').style.display = 'none';
    $('#stop').disabled = false;
    setStatus('Starting\u2026', 'run');
    renderFiles();
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.pj !== 1 || !state.frame || ev.source !== state.frame.contentWindow) return;
    if (d.type === 'log') log(d.level, d.text);
    else if (d.type === 'size') { state.size = { w: d.w, h: d.h }; layoutFrame(); if ($('#status').textContent.indexOf('Starting') === 0) setStatus('Running', 'run'); }
    else if (d.type === 'files') {
      d.used.forEach(function (n) { state.used[n] = true; });
      d.missing.forEach(function (m) { state.missing[m.name] = m.fn; });
      renderFiles();
    } else if (d.type === 'exit') setStatus('Exited');
  });

  function layoutFrame() {
    var box = $('#frameBox'); var f = state.frame;
    if (!f || !state.size) return;
    var w = state.size.w; var h = state.size.h; var wrap = $('#stageWrap');
    var s = 1;
    if ($('#fit').checked) s = Math.min(1, (wrap.clientWidth - 24) / w, (wrap.clientHeight - 24) / h);
    f.style.width = w + 'px'; f.style.height = h + 'px';
    f.style.transform = s < 1 ? 'scale(' + s + ')' : 'none';
    box.style.width = Math.round(w * s) + 'px'; box.style.height = Math.round(h * s) + 'px';
  }

  // ------------------------------------------------------------------ zip export (see zip.js)
  function dataUrlBytes(u) { var b = atob(u.split(',')[1]); var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function downloadZip() {
    saveCode();
    var enc = new TextEncoder(); var root = safeName(state.name); var entries = [];
    state.tabs.forEach(function (t, i) { entries.push({ path: root + '/' + (i === 0 ? root : t.name) + '.pde', data: enc.encode(t.code) }); });
    Object.keys(state.files).forEach(function (n) { entries.push({ path: root + '/data/' + n, data: dataUrlBytes(state.files[n].dataUrl) }); });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([PJZip.buildZip(entries)], { type: 'application/zip' })); a.download = root + '.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    log('info', 'Downloaded ' + root + '.zip - unzip it and open ' + root + '/' + root + '.pde in Processing.');
  }

  // ------------------------------------------------------------------ wiring
  function init() {
    loadSaved();
    state.tabs[0].name = state.name;
    renderTabs(); loadCode();

    $('#run').onclick = run;
    $('#stop').onclick = function () { stop(false); };
    $('#clearConsole').onclick = clearConsole;
    $('#zip').onclick = downloadZip;
    $('#fit').onchange = layoutFrame;
    window.addEventListener('resize', layoutFrame);
    if (window.ResizeObserver) new ResizeObserver(layoutFrame).observe($('#stageWrap'));

    var code = $('#code');
    code.addEventListener('input', function () { state.tabs[state.active].code = code.value; saveSoon(); });
    code.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        var s = code.selectionStart; code.setRangeText('  ', s, code.selectionEnd, 'end');
        state.tabs[state.active].code = code.value; saveSoon();
      }
    });
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });

    // files: drop zone + picker, and dropping anywhere on the left column
    var drop = $('#drop'); var picker = $('#picker');
    $('#pick').onclick = function () { picker.click(); };
    picker.onchange = function () { addFiles(picker.files); picker.value = ''; };
    ['dragenter', 'dragover'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); if (t === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }); });
    document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    // draggable divider
    var div = $('#divider'); var left = $('#left'); var dragging = false;
    div.addEventListener('mousedown', function (e) { dragging = true; document.body.style.userSelect = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', function (e) { if (dragging) left.style.width = Math.max(320, Math.min(window.innerWidth - 340, e.clientX)) + 'px'; });
    window.addEventListener('mouseup', function () { if (dragging) { dragging = false; document.body.style.userSelect = ''; layoutFrame(); } });

    // restore uploaded files from the previous visit
    dbDo('readonly', function (st) { return st.getAll(); }).then(function (all) {
      (all || []).forEach(function (r) { state.files[r.name] = r; });
      renderFiles();
    });
    renderFiles();
  }

  init();
})();
