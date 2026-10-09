// The srcdoc of the sandboxed iframe a sketch runs in: Processing.js, then the
// small runner script that talks to the page over postMessage (frameRunner.js).
//
// Both are imported as raw text on purpose, so the bundler never rewrites them
// and the iframe gets exactly the bytes in the repo. This module is large (it
// carries Processing.js, ~230 KB) and is only imported dynamically, the first
// time somebody actually opens a sketch - see SketchRunner.
import processingSource from "@/vendor/processing.min.js?raw";
import frameRunnerSource from "./frameRunner.js?raw";

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
].join("; ");

// "</script" inside an inline script would end it early.
const safe = (code) => code.replace(/<\/script/gi, "<\\/script");

export function buildFrameHtml() {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    // The sketch is student-written JavaScript running in the signed-in
    // teacher's browser. The sandbox already walls it off from this page; this
    // additionally stops it making requests of its own (beacons, loading a
    // remote image, probing the teacher's network). Everything a sketch
    // legitimately needs arrives inline: its code, and its images as data: URLs.
    // Processing.js itself needs eval and a data: font.
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    "<style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}canvas{display:block;outline:none}</style>" +
    '</head><body><canvas id="c" tabindex="0"></canvas>' +
    `<script>${safe(processingSource)}</script>` +
    `<script>${safe(frameRunnerSource)}</script></body></html>`
  );
}
