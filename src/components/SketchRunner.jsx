import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { preprocess } from "@/lib/processing/javaFixes";
import { findMissingSemicolons } from "@/lib/processing/syntaxCheck";
import { assetsToRunnerFiles } from "@/lib/processing/assets";
import { Play, Square, Loader2 } from "lucide-react";

// A Processing sketch running live in the page: the output canvas on top, a
// console for println() / errors / warnings underneath.
//
// How it runs: the student's code goes through javaFixes (so Java's integer
// math and name rules hold), then into a sandboxed iframe that runs
// Processing.js. The iframe has NO allow-same-origin, so its code cannot read
// this page's cookies, localStorage or Supabase session - the only channel in or
// out is postMessage. That matters here because the code is student-written
// JavaScript by the time Processing.js has translated it, and the people running
// it include the teacher, signed in.
//
// Props
//   files   [{ filename, content }]   the sketch's tabs, main first
//   assets  [{ name, kind, dataUrl?, text? }]   its data files (see lib/processing/assets)
//   resetKey  changes when a different sketch is shown: stops the old one
//   autoRun   start as soon as there is code (the teacher's Testing tab)
//   onReport  ({ used: [names], missing: [{ name, fn }] }) as the sketch runs
//   className height etc. - the component fills its parent
// Ref: { run(), stop() } so a parent's own button / shortcut can drive it.

const MAX_LOG_LINES = 300;
const MAX_LOG_CHARS = 2000;
const LOG_LEVELS = new Set(["info", "warn", "error", "out"]);

// Everything coming back from the frame is student-controlled: their code runs
// there and can call parent.postMessage with any shape it likes. The source
// check proves WHICH window sent it, not that the payload is well-formed, so
// each field is validated before it reaches state or React - an object where
// text belongs would otherwise throw during render and blank the teacher's
// whole grading window every time they open that submission.
const MAX_CANVAS_SIDE = 4000;
const cleanName = (n) => (typeof n === "string" ? n.slice(0, 200) : null);
function cleanReport(d) {
  const used = Array.isArray(d.used) ? d.used.map(cleanName).filter(Boolean).slice(0, 200) : [];
  const missing = Array.isArray(d.missing)
    ? d.missing
        .map((m) => (m && cleanName(m.name) ? { name: cleanName(m.name), fn: cleanName(m.fn) || "" } : null))
        .filter(Boolean)
        .slice(0, 200)
    : [];
  return { used, missing };
}

const SketchRunner = forwardRef(function SketchRunner(
  { files, assets, resetKey, autoRun = false, onReport, className = "" },
  ref
) {
  const [run, setRun] = useState(null); // { id, html, code, filesPayload, frame }
  const [status, setStatus] = useState("idle"); // idle | starting | running | error | stopped
  const [size, setSize] = useState(null);
  const [fit, setFit] = useState(true);
  const [logs, setLogs] = useState([]);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });

  const iframeRef = useRef(null);
  const stageRef = useRef(null);
  const consoleRef = useRef(null);
  const htmlRef = useRef(null);
  const runCounter = useRef(0);
  const latest = useRef({ files, assets });
  latest.current = { files, assets };
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;

  const log = useCallback((level, text) => {
    setLogs((prev) => [...prev.slice(-(MAX_LOG_LINES - 1)), { level, text, key: `${Date.now()}-${Math.random()}` }]);
    if (level === "error") setStatus("error");
  }, []);

  const stop = useCallback(() => {
    setRun(null);
    setSize(null);
    setStatus("stopped");
  }, []);

  const start = useCallback(async () => {
    const { files: tabs, assets: data } = latest.current;
    setLogs([]);
    setSize(null);
    setStatus("starting");
    setRun(null);
    const source = (tabs || []).map((f) => f.content).join("\n");
    if (!source.trim()) {
      setStatus("idle");
      log("warn", "There is no code to run.");
      return;
    }
    // Real Processing (Java) refuses to run code with a statement missing its
    // semicolon, but Processing.js, being JavaScript underneath, quietly accepts
    // it. Stop here instead, where Processing would, and say which line.
    const missing = [];
    for (const f of tabs || []) for (const m of findMissingSemicolons(f.content)) missing.push({ file: f.filename, ...m });
    if (missing.length > 0) {
      const several = (tabs || []).length > 1;
      log("error", missing.length === 1
        ? "Processing would stop here - a statement is missing its semicolon."
        : `Processing would stop here - ${missing.length} statements are missing their semicolons.`);
      missing.slice(0, 5).forEach((m) =>
        log("error", `${several ? `${m.file}, ` : ""}line ${m.line} needs a semicolon (;) at the end:\n    ${m.text}`)
      );
      if (missing.length > 5) log("error", `...and ${missing.length - 5} more.`);
      return;
    }
    try {
      // Processing.js is large - only fetched the first time anyone presses Run.
      if (!htmlRef.current) htmlRef.current = (await import("@/lib/processing/frameHtml")).buildFrameHtml();
    } catch {
      setStatus("error");
      log("error", "Couldn't load the sketch runner. Check your connection and try again.");
      return;
    }
    let code = source;
    try {
      const pre = preprocess(source);
      code = pre.code;
      pre.notes.forEach((n) => log("info", n));
    } catch (e) {
      log("warn", `Java-math adjustments were skipped (${e.message}).`);
    }
    const stage = stageRef.current;
    const frame = {
      w: Math.max(200, (stage?.clientWidth || 800) - 24),
      h: Math.max(200, (stage?.clientHeight || 600) - 24),
    };
    runCounter.current += 1;
    setRun({
      id: runCounter.current,
      html: htmlRef.current,
      code,
      filesPayload: assetsToRunnerFiles(data),
      frame,
    });
  }, [log]);

  useImperativeHandle(ref, () => ({ run: start, stop }), [start, stop]);

  // A different student / sketch: drop whatever was running.
  useEffect(() => {
    setRun(null);
    setSize(null);
    setLogs([]);
    setStatus("idle");
  }, [resetKey]);

  const hasCode = (files || []).some((f) => (f.content || "").trim());
  useEffect(() => {
    if (autoRun && hasCode) start();
    // Only when the sketch being shown changes - not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, resetKey, hasCode]);

  // Messages from the sandboxed frame.
  useEffect(() => {
    const onMessage = (ev) => {
      const d = ev.data;
      if (!d || d.pj !== 1 || !iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      if (d.type === "log") {
        if (typeof d.text !== "string" || !LOG_LEVELS.has(d.level)) return;
        log(d.level, d.text.slice(0, MAX_LOG_CHARS));
      } else if (d.type === "size") {
        const w = Math.round(Number(d.w));
        const h = Math.round(Number(d.h));
        if (!(w >= 1 && h >= 1)) return;
        setSize({ w: Math.min(w, MAX_CANVAS_SIDE), h: Math.min(h, MAX_CANVAS_SIDE) });
        setStatus((s) => (s === "starting" ? "running" : s));
      } else if (d.type === "files") onReportRef.current?.(cleanReport(d));
      else if (d.type === "exit") setStatus("stopped");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [log]);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // Track the stage's size so "scale to fit" can follow the window / divider.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setStageBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onFrameLoad = () => {
    if (!run) return;
    iframeRef.current?.contentWindow?.postMessage(
      { pj: 1, type: "run", code: run.code, files: run.filesPayload, frame: run.frame },
      "*"
    );
  };

  let scale = 1;
  if (size && fit && stageBox.w) {
    scale = Math.min(1, (stageBox.w - 24) / size.w, (stageBox.h - 24) / size.h);
    if (!(scale > 0)) scale = 1;
  }

  const running = status === "starting" || status === "running";
  const counts = logs.reduce((acc, l) => ({ ...acc, [l.level]: (acc[l.level] || 0) + 1 }), {});

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-white flex-wrap">
        <Button size="sm" onClick={start} disabled={!hasCode || status === "starting"}>
          {status === "starting" ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Starting...</>
          ) : (
            <><Play className="w-4 h-4 mr-1.5" /> {run ? "Run again" : "Run"}</>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={stop} disabled={!running}>
          <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
        </Button>
        <span
          className={`text-xs rounded-full px-2 py-0.5 ${
            status === "running" ? "bg-emerald-50 text-emerald-700"
              : status === "error" ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {{ idle: "Ready", starting: "Starting", running: "Running", error: "Error", stopped: "Stopped" }[status]}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Scale to fit
        </label>
      </div>

      {/* A flex container with margin:auto children centres the sketch both ways, and
          - unlike justify-center - falls back to the top-left (still scrollable)
          when a sketch is bigger than the pane. */}
      <div ref={stageRef} className="relative flex-1 min-h-[140px] overflow-auto bg-slate-100 p-3 flex">
        {!run && (
          <p className="m-auto text-sm text-muted-foreground text-center">
            {hasCode ? (
              <>Press <span className="font-semibold">Run</span> to see the sketch here.</>
            ) : (
              "There is no code to run yet."
            )}
          </p>
        )}
        {run && (
          <div
            className="relative bg-white shadow-md m-auto flex-shrink-0"
            style={size ? { width: Math.round(size.w * scale), height: Math.round(size.h * scale) } : { width: 1, height: 1, opacity: 0 }}
          >
            <iframe
              key={run.id}
              ref={iframeRef}
              title="Sketch output"
              // No allow-same-origin: see the header comment.
              sandbox="allow-scripts"
              srcDoc={run.html}
              onLoad={onFrameLoad}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                border: 0,
                width: size ? size.w : 1,
                height: size ? size.h : 1,
                transformOrigin: "0 0",
                transform: scale < 1 ? `scale(${scale})` : "none",
                background: "#fff",
              }}
            />
          </div>
        )}
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center gap-2 text-sm text-slate-500 bg-white/90 rounded-full px-3 py-1.5 shadow">
              <Loader2 className="w-4 h-4 animate-spin" /> Starting your sketch...
            </span>
          </div>
        )}
        {running && (
          <p className="absolute right-3 bottom-1.5 text-[11px] text-slate-400 pointer-events-none">
            Click the sketch first so it receives keyboard input
          </p>
        )}
      </div>

      <div className="border-t bg-white px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-slate-700">Console</span>
        {counts.error > 0 && <span className="text-red-600">{counts.error} error{counts.error > 1 ? "s" : ""}</span>}
        {counts.warn > 0 && <span className="text-amber-600">{counts.warn} warning{counts.warn > 1 ? "s" : ""}</span>}
        {logs.length > 0 && (
          <button className="ml-auto hover:text-foreground" onClick={() => setLogs([])}>Clear</button>
        )}
      </div>
      <div
        ref={consoleRef}
        role="log"
        className="h-32 overflow-auto bg-slate-900 text-slate-200 px-3 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
      >
        {logs.map((l) => (
          <div
            key={l.key}
            className={
              l.level === "error" ? "text-red-300"
                : l.level === "warn" ? "text-amber-300"
                : l.level === "info" ? "text-sky-300/80"
                : ""
            }
          >
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
});

export default SketchRunner;
