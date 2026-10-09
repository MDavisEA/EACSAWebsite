# Processing Tester

A standalone page for trying out running student Processing (Java) code in the browser.
It is a prototype of what the CSP side of the site would do. Nothing here touches Supabase
or the main app.

## Open it

Double-click `index.html`, or:

```bash
open tools/processing-tester/index.html
```

If your browser is fussy about files opened from disk, serve the folder instead:

```bash
cd tools/processing-tester && python3 -m http.server 8000
# then visit http://localhost:8000
```

## Use it

1. Paste a sketch into the editor (add more tabs with **+** for multi-tab sketches).
2. Drop any images or other files the sketch loads into the **Files** box (5 MB per file, 25 MB total).
3. **Run** (or Ctrl/Cmd + Enter). Click the sketch once so it gets keyboard input.
4. The console shows `println` output, errors, and warnings such as "file not found".
5. **Download for Processing (.zip)** gives a correctly named sketch folder (`Name/Name.pde` + `Name/data/`)
   to open in real Processing - the fallback when something does not run here. Double-click the first
   tab to rename the sketch (the zip uses that name).

Your code and uploaded files are remembered in this browser between visits.

## How it is built (and what the website would reuse)

| File | Job |
|---|---|
| `javaFixes.js` | Rewrites source so Processing.js behaves like Java: integer division, `int *= 1.5`, a method and variable sharing a name, `import` lines. Pure text-to-text; unit tested. |
| `runner.js` | Runs a sketch in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin), serves uploaded files to `loadImage`/`loadStrings`, supplies Processing 3/4 functions Processing.js lacks (`fullScreen`, `pixelDensity`, `settings`), and reports logs / size / missing files back by `postMessage`. |
| `zip.js` | Writes the downloadable sketch folder. Unit tested. |
| `app.js`, `index.html` | The tester UI only. Throwaway. |
| `vendor/` | Processing.js 1.6.6 (MIT). `node build-vendor.js` regenerates `processing-src.js`. |

Tests: `npm test` in this folder (JavaFixes) and `node test/zip.test.js`.

## Known differences from real Processing

- Processing.js is a 2018-era translator, not Processing. Newer features and libraries
  (Sound, Video, `loadTable`, JSON/XML, P3D shapes) are missing or untested.
- `javaFixes.js` only rewrites math when it is certain both sides are ints. If it cannot tell
  (e.g. a field of a custom class), the JavaScript result is left alone.
- JavaScript cannot tell `3` from `3.0`, so `println(someFloat)` prints `3` where Java prints `3.0`.
- `.vlw` fonts are replaced by the browser default font; text metrics differ slightly.
- Boolean `&` / `|` give 0/1 numbers rather than true/false when printed.
- `random()` and `noise()` differ run to run, as in Processing.
