// Run:  node src/lib/processing/gifDecoder.test.js
// gifDecoder.js is a classic script for the sketch iframe (it sets a global), so it is
// evaluated here rather than imported.
import fs from 'node:fs';

(0, eval)(fs.readFileSync(new URL('./gifDecoder.js', import.meta.url), 'utf8'));
const decode = globalThis.__decodeGif;

let failed = 0;
function eq(got, want, name) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.log('FAIL ', name, '\n  got: ', JSON.stringify(got), '\n  want:', JSON.stringify(want));
  } else console.log('ok   ', name);
}

// ---- a tiny GIF writer, so each feature can be tested on a file built for it ----
// Its LZW stream sends a Clear code before every pixel, which is valid (if wasteful) GIF:
// every code is then a plain colour, so what was written is unambiguous.
function makeGif({ w, h, palette, frames, loops }) {
  const out = [];
  const u16 = (v) => out.push(v & 255, v >> 8);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  u16(w); u16(h);
  out.push(0x80 | 1, 0, 0); // global table of 4 colours
  for (let i = 0; i < 4; i++) out.push(...(palette[i] || [0, 0, 0]));
  if (loops !== undefined) {
    out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, loops & 255, loops >> 8, 0);
  }
  for (const f of frames) {
    const t = f.transparent ?? -1;
    out.push(0x21, 0xf9, 4, ((f.disposal || 0) << 2) | (t >= 0 ? 1 : 0), 0, 0, t >= 0 ? t : 0, 0);
    const d = (f.delay || 0) / 10; out[out.length - 4] = d & 255; out[out.length - 3] = d >> 8;
    out.push(0x2c); u16(f.x || 0); u16(f.y || 0); u16(f.w); u16(f.h);
    out.push(f.interlaced ? 0x40 : 0);
    // min code size 2: Clear = 4, End = 5, codes are 3 bits wide
    let acc = 0, bits = 0; const bytes = [];
    const put = (c) => { acc |= c << bits; bits += 3; while (bits >= 8) { bytes.push(acc & 255); acc >>= 8; bits -= 8; } };
    for (const px of f.pixels) { put(4); put(px); }
    put(5); if (bits) bytes.push(acc & 255);
    out.push(2);
    for (let i = 0; i < bytes.length; i += 255) { const part = bytes.slice(i, i + 255); out.push(part.length, ...part); }
    out.push(0);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}
const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], WHITE = [255, 255, 255];
const palette = [RED, GREEN, BLUE, WHITE];
// A frame's pixels as palette letters (R G B W, '.' = transparent), row by row.
const show = (frame, w) => {
  const s = [];
  for (let i = 0; i < frame.rgba.length; i += 4) {
    const c = frame.rgba.slice(i, i + 4);
    s.push(c[3] === 0 ? '.' : ['R', 'G', 'B', 'W'][palette.findIndex((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2])] || '?');
  }
  const rows = []; for (let i = 0; i < s.length; i += w) rows.push(s.slice(i, i + w).join(''));
  return rows.join('/');
};

// ---- basics ----
{
  const g = decode(makeGif({ w: 2, h: 2, palette, frames: [{ w: 2, h: 2, pixels: [0, 1, 2, 3], delay: 50 }] }));
  eq([g.width, g.height, g.frames.length, g.loops], [2, 2, 1, 1], 'size, one frame, no loop extension = play once');
  eq(show(g.frames[0], 2), 'RG/BW', 'colours land on the right pixels');
  eq(g.frames[0].delay, 50, 'delay in ms');
}
{
  const f = { w: 1, h: 1, pixels: [0] };
  eq(decode(makeGif({ w: 1, h: 1, palette, frames: [f], loops: 0 })).loops, 0, 'NETSCAPE loop 0 = forever');
  eq(decode(makeGif({ w: 1, h: 1, palette, frames: [f], loops: 2 })).loops, 3, 'NETSCAPE loop 2 = three plays');
  eq(decode(makeGif({ w: 1, h: 1, palette, frames: [{ ...f, delay: 0 }, { ...f, delay: 10 }] })).frames.map((x) => x.delay), [100, 100],
    'delays of 0 and 10ms play at 100ms, as browsers do');
}

// ---- frames that cover part of the picture, transparency and disposal ----
{
  const g = decode(makeGif({
    w: 3, h: 2, palette, frames: [
      { w: 3, h: 2, pixels: [0, 0, 0, 0, 0, 0] },                                  // all red
      { x: 1, y: 0, w: 2, h: 1, pixels: [1, 3], transparent: 3, disposal: 2 },      // green at (1,0); W is see-through
      { x: 0, y: 1, w: 1, h: 1, pixels: [2], disposal: 3 },                         // blue at (0,1), then put back
      { x: 2, y: 1, w: 1, h: 1, pixels: [3] },
    ],
  }));
  eq(g.frames.map((f) => show(f, 3)), ['RRR/RRR', 'RGR/RRR', 'R../BRR', 'R../RRW'],
    'transparent pixels keep what is under them; disposal 2 clears the whole frame box to transparent; disposal 3 restores');
}
{
  // Interlaced rows arrive in the order 0, 4 / 2 / 1, 3, 5 (passes of every 8th from 0, every 8th from 4, every 4th from 2, every 2nd from 1)
  const g = decode(makeGif({ w: 1, h: 6, palette, frames: [{ w: 1, h: 6, interlaced: true, pixels: [0, 1, 2, 3, 3, 3] }] }));
  eq(show(g.frames[0], 1), 'R/W/B/W/G/W', 'interlaced rows are put back in order');
}

// ---- bad input ----
{
  let msg = null;
  try { decode(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])); } catch (e) { msg = e.message; }
  eq(msg, 'not a GIF file', 'a PNG is refused');
  const whole = makeGif({ w: 1, h: 1, palette, frames: [{ w: 1, h: 1, pixels: [0] }, { w: 1, h: 1, pixels: [1] }] });
  eq(decode(whole.slice(0, whole.length - 12)).frames.length, 1, 'a file cut short keeps the frames it had');
}

// ---- a real GIF from ffmpeg (proper LZW compression, a palette with transparency,
// frames that only redraw what changed). The checksums were taken from ffmpeg's own
// decoding of this file. ----
{
  const b64 =
  'R0lGODlhGAAQAPf/MQGBFgRnABO+ABU+ABWNAx2GbDMdADjoAEWHGUuGqVALAGKO42r7AHeLHYCXRoIBAJGE1pyHFKT5ALIMAMOC' +
  '7c2IMs6xiNTiDNYjAOAtAO2C/fOE6/OFbPO4BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuG' +
  'BfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBfuGBQD/ACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFCgAfACwAAAAAGAAQAIQBgRYEZwAT' +
  'vgAVPgAVjQMdhmwzHQA46ABFhxlLhqlQCwBijuNq+wB3ix2Al0aCAQCRhNachxSk+QCyDADDgu3NiDLOsYjU4gzWIwDgLQDtgv3z' +
  'hOvzhWzzuAX7hgUA/wAI/wA3CNygoaBBChQgQEhQAECFBBA4IIAo0OBBhAsTACiAYEEHCQ42FiBoUQPGhRw5VNiQ4MGABBIJlEyY' +
  'kSGACBYWGBigwICBBwk6WEzIsEBDAB0XDAigoKcBBS4NKkyAoAGABggQcFAAYKfPng8eTDBJ9KqDBQtgKh3A1ufTsBOI2qzgoAMD' +
  'BhYsECAAIMAAn3AnJLBJIMKCChcYHBDwYG9fv08xSAawIUKFww88eLggYC9fAI8DPMigGYDEBhwaSNA8YWkA0KD3CpDQoYMHlAAI' +
  'VKCgAMODnRICBJAt4AADCRcu0GRYuECHng0uCJd9wPjxC2RRNliwwQMHDhAICCMYX9368YMLc6tHUEEAgMXlD0g4XxDjYKMNtSYg' +
  'r9i4BAABAQAh+QQFCgD/ACwDAAAAFQABAAAIDgA1bPhHsKDBggseIAwIACH5BAUKAP8ALAQAAAAUAAEAAAgRADX8G0iw4EAOCRRs' +
  'APAvQUAAIfkEBQoA/wAsEQAAAAUAAQAACAgANyCYAIFAQAA7' +
    '';
  const g = decode(new Uint8Array(Buffer.from(b64, 'base64')));
  const sum = (f) => { let h = 0; for (let k = 0; k < f.rgba.length; k++) { const v = f.rgba[k - (k % 4) + 3] === 0 ? 0 : f.rgba[k]; h = (Math.imul(h, 31) + v) >>> 0; } return h; };
  eq([g.width, g.height, g.loops, g.frames.length], [24, 16, 0, 4], 'ffmpeg GIF: size, loop forever, 4 frames');
  eq(g.frames.map(sum), [1047569022, 3486247939, 2783920161, 3239227961], 'ffmpeg GIF: every frame matches ffmpeg pixel for pixel');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exitCode = failed ? 1 : 0;
