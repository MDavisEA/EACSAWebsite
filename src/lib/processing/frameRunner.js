/* eslint-disable */
/* global Processing */
// Runs INSIDE the sandboxed iframe that executes a student's Processing sketch
// (see frameHtml.js). Loaded as raw text and written into the iframe's srcdoc,
// so it must stay a plain classic script that touches only browser globals and
// the `Processing` global from processing.min.js - never import anything here.
//
// Protocol (postMessage; the iframe has no same-origin access to the app):
//   parent -> frame  { pj: 1, type: 'run', code, files, frame: { w, h } }
//   frame -> parent  { pj: 1, type: 'ready' | 'started' | 'exit' }
//                    { pj: 1, type: 'log', level: 'info'|'warn'|'error'|'out', text }
//                    { pj: 1, type: 'error', name, message, stack, generated }   (a runtime error)
//                    { pj: 1, type: 'size', w, h }
//                    { pj: 1, type: 'files', used: [name], missing: [{ name, fn }] }
//   files: { [name]: { kind: 'image'|'text'|'other', dataUrl?, text? } }
(function () {
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
  // Processing.js's JavaScript for the sketch, kept so an error can be traced back to a
  // line of the student's own code (the parent does that - see errorLocation.js).
  var generatedCode = '';
  function stopLoop() { try { if (inst) inst.noLoop(); } catch (e) { /* ignore */ } }
  window.addEventListener('error', function (ev) {
    var m = (ev && ev.message) || 'Unknown error';
    if (seenErrors[m]) return;
    seenErrors[m] = 1;
    var err = ev && ev.error;
    send({
      type: 'error',
      name: String((err && err.name) || 'Error'),
      message: m,
      stack: String((err && err.stack) || '').slice(0, 8000),
      generated: generatedCode,
    });
    stopLoop();
  });

  // Block page scrolling from arrow keys / space while the sketch has focus. Space is stopped on
  // keypress, NOT keydown: Processing.js only fires keyPressed() for ordinary keys (space, letters)
  // from the keypress event, and cancelling keydown suppresses it, so `key == ' '` never matched.
  // The arrows are "coded" keys it handles on keydown itself, so those are safe to cancel here.
  window.addEventListener('keydown', function (e) {
    if ([37, 38, 39, 40].indexOf(e.keyCode) >= 0) e.preventDefault();
  }, true);
  window.addEventListener('keypress', function (e) {
    if (e.keyCode === 32 || e.which === 32) e.preventDefault();
  }, true);

  var LOADERS = /\b(loadImage|requestImage|loadFont|loadStrings|loadTable|loadJSONObject|loadJSONArray|loadXML|loadShape|loadBytes|createReader|SoundFile|Movie|Capture|Gif|getPImages)\s*\(\s*(?:this\s*,\s*)?"([^"\n]+)"\s*[,)]/g;
  var LOADER_LABEL = { Gif: 'new Gif', getPImages: 'Gif.getPImages' };

  // A data: URL's bytes (uploaded files reach the frame as data: URLs - see assets.js).
  function dataUrlBytes(url) {
    var bin = atob(String(url).slice(String(url).indexOf(',') + 1));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

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
      if (found) markUsed(found); else markMissing(m[2], LOADER_LABEL[m[1]] || m[1]);
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
      try { sk = Processing.compile(msg.code); generatedCode = sk.sourceCode; }
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
        Gif: makeGifClass(),
      };

      // --- the gifAnimation library (`import gifAnimation.*;`) ---
      // Students who want a moving character use it: `Gif walk = new Gif(this, "walk.gif");`,
      // `walk.loop();`, then `image(walk, x, y)` like any picture. Processing.js can't load
      // libraries, so `Gif` was an unknown name and the sketch died in setup(). This stands in
      // for it: a Gif is a real PImage (so image(), background(), tint() etc. take it) whose
      // pixels are whichever frame is due right now, worked out from the clock whenever
      // Processing.js reads them - the same thing the library's own timer thread does.
      function makeGifClass() {
        var decoded = {};
        function decode(n) {
          if (!(n in decoded)) {
            decoded[n] = null;
            try {
              var g = window.__decodeGif(dataUrlBytes(files[n].dataUrl));
              // Each frame is kept once, as a canvas (the decoder's copy is let go).
              g.frames.forEach(function (f) {
                var c = document.createElement('canvas');
                c.width = g.width; c.height = g.height;
                c.getContext('2d').putImageData(new ImageData(f.rgba, g.width, g.height), 0, 0);
                f.canvas = c; f.rgba = null;
              });
              if (g.cut) log('warn', '"' + n + '" has too many frames at this size to hold in memory - only the first ' + g.frames.length + ' will play. A smaller or shorter GIF fixes this.');
              decoded[n] = g;
            } catch (e) { log('warn', 'Could not read the frames of "' + n + '" (' + e.message + ') - showing it as a still picture.'); }
          }
          return decoded[n];
        }
        // An image for `file` that isn't an animation (missing, not a GIF, unreadable): what
        // loadImage gives, plus the Gif methods as no-ops so the rest of the sketch still runs.
        function still(file) {
          var img = ctx.p.loadImage(file);
          ['play', 'pause', 'stop', 'loop', 'noLoop', 'jump', 'ignoreRepeat', 'dispose'].forEach(function (k) { img[k] = function () {}; });
          img.isPlaying = img.isLooping = img.isIgnoringRepeat = function () { return false; };
          img.currentFrame = function () { return 0; };
          img.getPImages = function () { return [img]; };
          return img;
        }
        function find(file, fn) {
          var n = lookup(file);
          if (!n) { markMissing(file, fn); return null; }
          return /\.gif$/i.test(n) && files[n].kind === 'image' ? n : null;
        }

        function Gif(parent, file) {
          var p = ctx.p;
          if (typeof parent === 'string') file = parent;
          var n = find(file, 'new Gif');
          var g = n && decode(n);
          if (!g) return still(file);
          markUsed(n);
          var frames = g.frames; var last = frames.length - 1;
          var img = new p.PImage(g.width, g.height, p.ARGB);
          var cur = 0; var playing = false; var looping = false; var ignoreRepeat = false;
          var playsLeft = 0; var since = 0; // when `cur` went up

          function now() { return (window.performance && performance.now()) || Date.now(); }
          // Moves `cur` on by however many frames' delays have passed since it last changed.
          function advance() {
            if (!playing) return cur;
            var t = now();
            // After a long stall (a hidden tab) just carry on from here, don't fast-forward.
            if (t - since > 10000) since = t - (t - since) % 10000;
            while (playing && t - since >= frames[cur].delay) {
              since += frames[cur].delay;
              if (cur < last) { cur++; continue; }
              if (looping) cur = 0;
              else if (!ignoreRepeat && (g.loops === 0 || --playsLeft > 0)) cur = 0;
              else playing = false;
            }
            return cur;
          }
          function start(loopForever) {
            if (!playing) { since = now(); playsLeft = g.loops; }
            playing = true; looping = loopForever;
          }

          Object.defineProperty(img, 'sourceImg', { configurable: true, get: function () { return frames[advance()].canvas; }, set: function () {} });
          // A fresh copy each time: Processing.js tints an image by changing the pixels it hands
          // back, which would otherwise tint the stored frame for good.
          Object.defineProperty(img, 'imageData', {
            configurable: true,
            get: function () { return frames[advance()].canvas.getContext('2d').getImageData(0, 0, g.width, g.height); },
            set: function () {},
          });
          Object.defineProperty(img, '__isDirty', { configurable: true, get: function () { return false; }, set: function () {} });

          img.play = function () { start(looping); };
          img.loop = function () { start(true); };
          img.noLoop = function () { looping = false; };
          img.pause = function () { advance(); playing = false; };
          img.stop = function () { playing = false; cur = 0; };
          img.jump = function (i) { cur = Math.max(0, Math.min(last, i | 0)); since = now(); };
          img.ignoreRepeat = function () { ignoreRepeat = true; };
          img.isPlaying = function () { advance(); return playing; };
          img.isLooping = function () { return looping; };
          img.isIgnoringRepeat = function () { return ignoreRepeat; };
          img.currentFrame = function () { return advance(); };
          img.getPImages = function () { return framesAsImages(g); };
          img.dispose = function () {};
          return img;
        }
        // Every frame as its own PImage, for sketches that animate by hand.
        function framesAsImages(g) {
          return g.frames.map(function (f) {
            var im = ctx.p.createImage(g.width, g.height, ctx.p.ARGB);
            im.imageData.data.set(f.canvas.getContext('2d').getImageData(0, 0, g.width, g.height).data);
            im.__isDirty = true; im.updatePixels();
            return im;
          });
        }
        Gif.getPImages = function (parent, file) {
          if (typeof parent === 'string') file = parent;
          var n = find(file, 'Gif.getPImages');
          var g = n && decode(n);
          if (!g) return [ctx.p.loadImage(file)];
          markUsed(n);
          return framesAsImages(g);
        };
        return Gif;
      }
      // Strict mode, so assigning to a name that was never declared (`scor = 5;`, a typo or a
      // forgotten `int`) is an error, as it is in Java. Without it JavaScript quietly creates a
      // new global and the mistake never shows. The directive shares line 1 with the generated
      // code's first line, so error line numbers are unchanged. If strict mode rejects the
      // translated code outright (it forbids a few old JavaScript forms Java allows, such as
      // 010 for octal), fall back to ordinary mode rather than stop a valid sketch.
      var body;
      var prelude = 'var ' + Object.keys(bare).map(function (k) { return k + '=__pj.' + k; }).join(',') + ';return (';
      function build(strict) {
        return (new Function('__pj', (strict ? "'use strict';" : '') + prelude + sk.sourceCode + ');'))(bare);
      }
      try {
        try { body = build(!msg.sloppy); }
        catch (e) { if (e instanceof SyntaxError && !msg.sloppy) body = build(false); else throw e; }
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

        // --- background(image) ignores imageMode in real Processing ---
        // Processing.js draws the picture with image(img, 0, 0), which obeys the current
        // imageMode, so after the very common imageMode(CENTER) only the bottom-right quarter of
        // the picture lands in the top-left corner and the rest of the window is never painted
        // (old frames then smear across it). Real Processing always puts it at the corner.
        // size() makes Processing.js install its drawing functions afresh (replacing anything
        // set before it), so the wrapper is put back after every size() call.
        var imgMode = p.CORNER;
        var origImageMode = p.imageMode;
        p.imageMode = function (m) { imgMode = m; return origImageMode.call(p, m); };
        var wrappedBackground = null;
        function patchBackground() {
          if (p.background === wrappedBackground) return;
          var origBackground = p.background;
          wrappedBackground = function (a) {
            if (a && (a.__isPImage || (p.PImage && a instanceof p.PImage))) {
              origImageMode.call(p, p.CORNER);
              try { return origBackground.apply(p, arguments); } finally { origImageMode.call(p, imgMode); }
            }
            return origBackground.apply(p, arguments);
          };
          p.background = wrappedBackground;
        }
        patchBackground();
        var origSize = p.size;
        p.size = function () { var r = origSize.apply(p, arguments); patchBackground(); return r; };

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

      // An element's id becomes a global variable in its page, so this canvas must not be
      // called something a student might also name a variable (it used to be `c`, which made a
      // forgotten `int c` run silently instead of failing).
      var canvas = document.getElementById('__pj_canvas');
      try { inst = new Processing(canvas, sk); }
      catch (e) {
        // setup() runs while the sketch is being created, so a mistake in it lands here rather
        // than in the window's error handler. Same report, so it gets the same line number.
        send({
          type: 'error',
          name: String((e && e.name) || 'Error'),
          message: String((e && e.message) || e),
          stack: String((e && e.stack) || '').slice(0, 8000),
          generated: generatedCode,
        });
        return;
      }

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
})();
