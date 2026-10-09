/*
 * runner.js - runs one Processing sketch inside a sandboxed iframe.
 *
 * The parent page builds the iframe like this:
 *
 *   iframe.sandbox = 'allow-scripts';            // NOT allow-same-origin
 *   iframe.srcdoc  = PJRunner.frameHtml(processingJsSource);
 *   iframe.onload  = () => iframe.contentWindow.postMessage(
 *       { pj: 1, type: 'run', code, files, frame: { w, h } }, '*');
 *
 * and listens for messages with `pj: 1` from that iframe (see MESSAGES below).
 *
 * Why an iframe with no allow-same-origin: student code is arbitrary
 * JavaScript once Processing.js has translated it. Without allow-same-origin
 * the frame gets an opaque origin, so it cannot read the parent's cookies,
 * localStorage or Supabase session, and cannot call the parent's code. The
 * only channel in or out is postMessage.
 *
 * MESSAGES  frame -> parent
 *   { type: 'ready' }
 *   { type: 'log',   level: 'info'|'warn'|'error'|'out', text }
 *   { type: 'size',  w, h }                 canvas size changed
 *   { type: 'files', used: [names], missing: [{name, fn}] }
 *   { type: 'started' }
 *   { type: 'exit' }
 *
 * files:  { [name]: { kind: 'image'|'text'|'other', dataUrl?, text? } }
 */
(function (root) {
  'use strict';

  // Everything inside runnerMain runs in the iframe. It is injected with
  // Function.prototype.toString, so it must not reference anything outside
  // itself except the `Processing` global that processing.js defines.
  function runnerMain() {
    var P = 'pj';
    function send(msg) { msg[P] = 1; parent.postMessage(msg, '*'); }
    function log(level, text) { send({ type: 'log', level: level, text: String(text) }); }

    // Anything Processing.js tries to print goes to the parent's console panel
    // instead of its own grey overlay.
    function fmt(v) {
      if (Array.isArray(v)) return v.map(function (x, i) { return '[' + i + '] ' + fmt(x); }).join('\n');
      if (v === undefined || v === null) return 'null';
      return String(v);
    }
    var printBuf = '';
    function out(args, newline) {
      var s = Array.prototype.map.call(args, fmt).join(' ');
      printBuf += s + (newline ? '\n' : '');
      if (newline) { log('out', printBuf.replace(/\n$/, '')); printBuf = ''; }
    }
    Processing.logger = new Proxy({}, {
      get: function (t, k) {
        return function () {
          if (k === 'print') out(arguments, false);
          else out(arguments, true);
        };
      },
    });

    var seenErrors = {};
    var inst = null;
    function stopLoop() { try { if (inst) inst.noLoop(); } catch (e) { /* ignore */ } }
    window.addEventListener('error', function (ev) {
      var m = (ev && ev.message) || 'Unknown error';
      if (seenErrors[m]) return;
      seenErrors[m] = 1;
      log('error', 'Runtime error: ' + m);
      stopLoop();
    });

    // Block page scrolling from arrow keys / space while the sketch has focus.
    window.addEventListener('keydown', function (e) {
      if ([32, 37, 38, 39, 40].indexOf(e.keyCode) >= 0) e.preventDefault();
    }, true);

    var LOADERS = /\b(loadImage|requestImage|loadFont|loadStrings|loadTable|loadJSONObject|loadJSONArray|loadXML|loadShape|loadBytes|createReader|SoundFile|Movie|Capture)\s*\(\s*(?:this\s*,\s*)?"([^"\n]+)"\s*[,)]/g;

    function stripComments(code) {
      return code.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); })
        .replace(/\/\/[^\n]*/g, '');
    }

    function start(msg) {
      var files = msg.files || {};
      var names = Object.keys(files);
      var lower = {};
      names.forEach(function (n) { lower[n.toLowerCase()] = n; });

      function lookup(name) {
        if (files[name]) return name;
        var bare = String(name).replace(/^\.?\//, '').replace(/^data\//, '');
        if (files[bare]) return bare;
        return lower[bare.toLowerCase()] || null;
      }

      var used = {}; var missing = {};
      var dirty = false;
      function markUsed(n) { if (!used[n]) { used[n] = 1; dirty = true; } }
      function markMissing(n, fn) { if (!missing[n]) { missing[n] = fn; dirty = true; log('warn', fn + '("' + n + '"): file not found - upload it in the Files panel.'); } }
      setInterval(function () {
        if (!dirty) return; dirty = false;
        send({ type: 'files', used: Object.keys(used), missing: Object.keys(missing).map(function (k) { return { name: k, fn: missing[k] }; }) });
      }, 250);

      // static scan: every literal file name the code asks for
      var clean = stripComments(msg.code);
      var m; LOADERS.lastIndex = 0;
      while ((m = LOADERS.exec(clean))) {
        var found = lookup(m[2]);
        if (found) markUsed(found); else markMissing(m[2], m[1]);
        if (/^(SoundFile|Movie|Capture)$/.test(m[1])) log('warn', m[1] + ' is not supported in this preview.');
      }

      // decode every uploaded image up front, so loadImage() in setup() is synchronous
      var pending = names.filter(function (n) { return files[n].kind === 'image'; }).map(function (n) {
        return new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () { resolve([n, img]); };
          img.onerror = function () { log('warn', 'Could not decode image "' + n + '".'); resolve(null); };
          img.src = files[n].dataUrl;
        });
      });

      Promise.all(pending).then(function (loaded) {
        var sk;
        try { sk = Processing.compile(msg.code); }
        catch (e) {
          log('error', 'Could not translate this sketch: ' + (e && e.message ? e.message : e)
            + '. This usually means a syntax Processing.js does not support - the sketch may still run in real Processing.');
          return;
        }
        loaded.forEach(function (pair) { if (pair) sk.imageCache.images[pair[0]] = pair[1]; });

        var frame = msg.frame || { w: 800, h: 600 };
        // Processing.js only prefixes names it knows with `$p.`, so a call it has never
        // heard of (Processing 3/4 additions) is a free variable in the compiled code.
        // Supplying those names as parameters of the wrapping function resolves them.
        var ctx = { p: null };
        var bare = {
          pixelDensity: function () {},
          displayDensity: function () { return 1; },
          fullScreen: function () { ctx.p.size(frame.w, frame.h); },
        };
        var body;
        try {
          body = (new Function('__pj', 'var ' + Object.keys(bare).map(function (k) { return k + '=__pj.' + k; }).join(',')
            + ';return (' + sk.sourceCode + ');'))(bare);
        } catch (e) { log('error', 'Could not prepare this sketch: ' + e.message); return; }

        sk.attachFunction = function (p) {
          ctx.p = p;
          // --- Processing 3/4 things Processing.js lacks ---
          p.smooth = p.smooth || function () {};
          p.noSmooth = p.noSmooth || function () {};
          p.textMode = function () {};       // real Processing ignores non-MODEL/SHAPE values too
          p.loadFont = function (name) {      // .vlw bitmap fonts can't be rendered here
            var n = lookup(name);
            if (n) markUsed(n); else markMissing(name, 'loadFont');
            log('info', 'Font "' + name + '" is a Processing .vlw font - using the browser default instead.');
            return { __vlw: true };
          };
          var origTextFont = p.textFont;
          p.textFont = function (f, s) { if (f && f.__vlw) { if (s) p.textSize(s); return; } return origTextFont.apply(p, arguments); };

          // --- images: serve uploaded files, complain about missing ones ---
          var origLoadImage = p.loadImage;
          function loadImage(file, type, cb) {
            var n = lookup(file);
            if (n && files[n].kind === 'image') { markUsed(n); return origLoadImage.call(p, n, type, cb); }
            if (n) log('warn', '"' + file + '" is not an image file.');
            else markMissing(file, 'loadImage');
            return p.createImage(1, 1, p.ARGB);
          }
          p.loadImage = loadImage; p.requestImage = loadImage;

          p.loadStrings = function (file) {
            var n = lookup(file);
            if (!n) { markMissing(file, 'loadStrings'); return []; }
            markUsed(n);
            var t = files[n].text;
            if (typeof t !== 'string') return [];
            return t.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
          };
          ['loadTable', 'loadJSONObject', 'loadJSONArray', 'loadXML', 'loadShape'].forEach(function (fn) {
            p[fn] = function (file) { log('warn', fn + '("' + file + '") is not supported in this preview.'); return null; };
          });
          p.exit = function () { stopLoop(); send({ type: 'exit' }); };

          body(p);

          // Processing 3+ allows size() inside settings(); Processing.js has no such hook.
          if (typeof p.settings === 'function') { try { p.settings(); } catch (e) { log('error', 'settings(): ' + e.message); } }
        };

        var canvas = document.getElementById('c');
        try { inst = new Processing(canvas, sk); }
        catch (e) { log('error', 'Could not start the sketch: ' + (e && e.message ? e.message : e)); return; }

        var lw = 0; var lh = 0;
        setInterval(function () {
          if (canvas.width !== lw || canvas.height !== lh) {
            lw = canvas.width; lh = canvas.height;
            send({ type: 'size', w: lw, h: lh });
          }
        }, 100);
        canvas.addEventListener('mousedown', function () { canvas.focus(); });
        try { canvas.focus(); } catch (e) { /* ignore */ }
        send({ type: 'started' });
      });
    }

    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.pj !== 1 || ev.source !== parent) return;
      if (d.type === 'run') start(d);
    });
    send({ type: 'ready' });
  }

  function frameHtml(processingSource) {
    var lib = String(processingSource).replace(/<\/script/gi, '<\\/script');
    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:">'
      + '<style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}canvas{display:block;outline:none}</style>'
      + '</head><body><canvas id="c" tabindex="0"></canvas>'
      + '<script>' + lib + '<\/script>'
      + '<script>(' + runnerMain.toString() + ')();<\/script></body></html>';
  }

  root.PJRunner = { frameHtml: frameHtml };
})(typeof self !== 'undefined' ? self : this);
