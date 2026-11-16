/* eslint-disable */
// A small GIF decoder for the sketch runner's stand-in for the gifAnimation
// library (`new Gif(this, "walk.gif")` - see frameRunner.js). Browsers only show
// an animated GIF's frames inside an <img>; a canvas drawImage() of one gets a
// single frame, so the frames have to be decoded by hand to animate them.
//
// Like frameRunner.js this is loaded as raw text into the sandboxed iframe, so it
// must stay a plain classic script with no imports. It defines one global,
// __decodeGif(bytes: Uint8Array) ->
//   { width, height, loops, frames: [{ delay, rgba }] }
// (optional second argument: maxBytes, see below)
// where every frame's `rgba` is the WHOLE picture as it should look at that point
// (width*height*4 bytes, disposal methods already applied), `delay` is in ms, and
// `loops` is the file's own repeat count (0 = forever, 1 = play once). It throws on
// a file that isn't a GIF. A file that is cut short keeps the frames it had.
// Every frame is stored whole, so a big, long GIF can need far more memory than its
// file size (800x600 x 300 frames is over half a gigabyte). Frames past `maxBytes`
// (default 300 MB) are dropped and the result says `cut: true`, rather than freeze
// the browser tab.
// Unit tests: node src/lib/processing/gifDecoder.test.js
(function (root) {
  function decodeGif(bytes, maxBytes) {
    if (!maxBytes) maxBytes = 300 * 1024 * 1024;
    var pos = 0;
    function u8() { if (pos >= bytes.length) throw new Error('truncated'); return bytes[pos++]; }
    function u16() { var v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v; }
    function colorTable(n) {
      var t = bytes.subarray(pos, pos + 3 * n); pos += 3 * n;
      if (t.length < 3 * n) throw new Error('truncated');
      return t;
    }
    // The data of an image or extension: blocks of up to 255 bytes, each led by
    // its length, ending at a zero length.
    function subBlocks() {
      var parts = []; var total = 0; var n;
      while ((n = u8()) !== 0) {
        parts.push(bytes.subarray(pos, pos + n)); total += n; pos += n;
      }
      var out = new Uint8Array(total); var o = 0;
      for (var i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
      return out;
    }

    var sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('not a GIF file');
    pos = 6;
    var width = u16(); var height = u16();
    var flags = u8(); u8(); /* background index */ u8(); /* aspect ratio */
    if (!width || !height) throw new Error('GIF has no size');
    var globalTable = (flags & 0x80) ? colorTable(1 << ((flags & 7) + 1)) : null;

    var canvas = new Uint8ClampedArray(width * height * 4); // starts fully transparent
    var frames = [];
    var loops = 1;
    var gce = null; // the Graphic Control Extension that applies to the next image
    var cut = false;

    try {
      for (;;) {
        var block = u8();
        if (block === 0x3b) break; // trailer
        if (block === 0x21) {
          var label = u8();
          if (label === 0xf9) {
            var d = subBlocks();
            gce = {
              disposal: (d[0] >> 2) & 7,
              transparent: (d[0] & 1) ? d[3] : -1,
              delay: (d[1] | (d[2] << 8)) * 10,
            };
          } else if (label === 0xff) {
            var appLen = u8();
            var app = String.fromCharCode.apply(null, bytes.subarray(pos, pos + appLen)); pos += appLen;
            var data = subBlocks();
            if ((app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0') && data[0] === 1) {
              var count = data[1] | (data[2] << 8);
              loops = count === 0 ? 0 : count + 1; // the count is extra plays after the first
            }
          } else subBlocks();
          continue;
        }
        if (block !== 0x2c) break; // junk after the last frame: keep what we have
        if (frames.length && (frames.length + 1) * width * height * 4 > maxBytes) { cut = true; break; }

        var fx = u16(); var fy = u16(); var fw = u16(); var fh = u16();
        var fflags = u8();
        var table = (fflags & 0x80) ? colorTable(1 << ((fflags & 7) + 1)) : globalTable;
        var interlaced = !!(fflags & 0x40);
        var minCode = u8();
        var indices = lzw(minCode, subBlocks(), fw * fh);
        var g = gce || { disposal: 0, transparent: -1, delay: 0 };
        gce = null;

        var saved = g.disposal === 3 ? canvas.slice() : null;
        if (table) paint(canvas, width, height, indices, table, g.transparent, fx, fy, fw, fh, interlaced);
        frames.push({
          // Browsers (and so what the student saw in a preview) treat 0 and 10ms as 100ms.
          delay: g.delay <= 10 ? 100 : g.delay,
          rgba: canvas.slice(),
        });
        if (g.disposal === 2) clearRect(canvas, width, height, fx, fy, fw, fh);
        else if (g.disposal === 3) canvas = saved;
      }
    } catch (e) {
      if (!frames.length) throw e;
    }
    if (!frames.length) throw new Error('GIF has no frames');
    return { width: width, height: height, loops: loops, frames: frames, cut: cut };
  }

  // Draws one frame's colour indices onto the picture, leaving transparent pixels alone.
  function paint(canvas, width, height, indices, table, transparent, fx, fy, fw, fh, interlaced) {
    var rows = rowOrder(fh, interlaced);
    var colors = table.length / 3;
    for (var r = 0; r < fh; r++) {
      var y = fy + rows[r];
      if (y >= height) continue;
      var src = r * fw;
      for (var c = 0; c < fw; c++) {
        var x = fx + c;
        if (x >= width) break;
        var ci = indices[src + c];
        if (ci === transparent || ci >= colors) continue;
        var o = (y * width + x) * 4;
        canvas[o] = table[ci * 3]; canvas[o + 1] = table[ci * 3 + 1]; canvas[o + 2] = table[ci * 3 + 2]; canvas[o + 3] = 255;
      }
    }
  }

  // rows[r] = the picture row that the r-th row of data belongs on
  function rowOrder(h, interlaced) {
    var rows = new Array(h); var i = 0;
    if (!interlaced) { for (; i < h; i++) rows[i] = i; return rows; }
    var passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
    for (var p = 0; p < 4; p++) for (var y = passes[p][0]; y < h; y += passes[p][1]) rows[i++] = y;
    return rows;
  }

  function clearRect(canvas, width, height, fx, fy, fw, fh) {
    for (var y = fy; y < Math.min(height, fy + fh); y++) {
      for (var x = fx; x < Math.min(width, fx + fw); x++) {
        var o = (y * width + x) * 4;
        canvas[o] = canvas[o + 1] = canvas[o + 2] = canvas[o + 3] = 0;
      }
    }
  }

  // GIF's variable-width LZW. Returns exactly `count` colour indices (missing ones are 0).
  function lzw(minCode, data, count) {
    var out = new Uint8Array(count);
    if (minCode < 1 || minCode > 11) return out;
    var clear = 1 << minCode; var eoi = clear + 1;
    var prefix = new Int16Array(4096); var suffix = new Uint8Array(4096); var first = new Uint8Array(4096);
    var stack = new Uint8Array(4097);
    for (var i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; }
    var size = minCode + 1; var mask = (1 << size) - 1; var next = eoi + 1;
    var prev = -1; var bits = 0; var acc = 0; var o = 0; var p = 0;
    while (o < count) {
      while (bits < size) {
        if (p >= data.length) return out;
        acc |= data[p++] << bits; bits += 8;
      }
      var code = acc & mask; acc >>>= size; bits -= size;
      if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; next = eoi + 1; prev = -1; continue; }
      if (code === eoi) break;
      if (prev === -1) {
        if (code >= clear) return out; // corrupt: must start with a plain colour
        out[o++] = code; prev = code; continue;
      }
      var cur = code; var sp = 0;
      if (code >= next) { // the code being defined right now (KwKwK)
        if (code > next) return out;
        stack[sp++] = first[prev]; cur = prev;
      }
      while (cur >= clear) { stack[sp++] = suffix[cur]; cur = prefix[cur]; }
      stack[sp++] = cur;
      if (next < 4096) {
        prefix[next] = prev; suffix[next] = cur; first[next] = first[prev];
        next++;
        if (next > mask && size < 12) { size++; mask = (1 << size) - 1; }
      }
      while (sp > 0 && o < count) out[o++] = stack[--sp];
      prev = code;
    }
    return out;
  }

  root.__decodeGif = decodeGif;
})(typeof window !== 'undefined' ? window : globalThis);
