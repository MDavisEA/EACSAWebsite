/*
 * zip.js - minimal ZIP writer (stored, no compression). Used to hand a student's
 * sketch back as a folder real Processing can open.
 *   buildZip([{ path: 'Sketch/Sketch.pde', data: Uint8Array }, ...]) -> Uint8Array
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PJZip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var table = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function buildZip(entries) {
    var enc = new TextEncoder(); var parts = []; var central = []; var offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.path); var crc = crc32(e.data); var size = e.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true);
      lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, e.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (a, p) { return a + p.length; }, 0);
    var out = new Uint8Array(total); var pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }
  return { buildZip: buildZip, crc32: crc32 };
});
