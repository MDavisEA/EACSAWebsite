import React, { useEffect, useRef, useState } from "react";

/**
 * Renders a PDF page as a canvas (for visual fidelity) with
 * an absolutely-positioned transparent text layer on top for selection/highlighting.
 * Uses pdfjs-dist loaded from a CDN script tag.
 */
export default function PdfPageViewer({ pdfUrl, pageNumber = 1, scale = 1.5 }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    async function render() {
      setStatus("loading");
      try {
        // Dynamically import pdfjs from CDN (avoids worker issues in browser)
        const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

        const pdf = await pdfjs.getDocument(pdfUrl).promise;
        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setDims({ width: viewport.width, height: viewport.height });

        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        // Build text layer
        const textContent = await page.getTextContent({ includeMarkedContent: false });
        if (cancelled) return;

        const textLayerEl = textLayerRef.current;
        if (!textLayerEl) return;
        textLayerEl.innerHTML = "";

        for (const item of textContent.items) {
          if (!item.str) continue;
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const x = tx[4];
          const y = tx[5];
          const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]);

          const span = document.createElement("span");
          span.textContent = item.str;
          span.style.cssText = [
            "position:absolute",
            `left:${x}px`,
            `top:${y - fontSize}px`,
            `font-size:${fontSize}px`,
            "line-height:1",
            "white-space:pre",
            "color:transparent",
            "cursor:text",
            "user-select:text",
            "transform-origin:left top",
          ].join(";");

          textLayerEl.appendChild(span);
        }

        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("PdfPageViewer error:", err);
          setStatus("error");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, scale]);

  return (
    <div
      className="relative bg-white shadow-md"
      style={{ width: dims.width || "100%", maxWidth: "100%" }}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 min-h-[400px]">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Rendering page {pageNumber}…</span>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="min-h-[200px] flex items-center justify-center text-red-500 text-sm">
          Failed to render PDF page.
        </div>
      )}

      {/* Canvas — visual rendering */}
      <canvas ref={canvasRef} className="block w-full h-auto" />

      {/* Text layer — transparent, on top, selectable */}
      <div
        ref={textLayerRef}
        className="absolute inset-0 overflow-hidden select-text"
        style={{ pointerEvents: "auto" }}
      />
    </div>
  );
}