import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { loadAssets } from "@/lib/processing/assets";

// A student's uploaded files for one submission, downloaded and ready to run.
// For the teacher's views (the student's own workspace manages its own list).
//
// Cached briefly per submission: paging back and forth through a pile of
// students, or flipping between Feedback and Testing, should not re-download a
// dozen images each time. But only briefly - a student can keep adding files
// after turning in, and a teacher coming back to a submission a few minutes
// later must see what is there now, not what was there when they last looked.
const cache = new Map(); // submissionId -> { assets, at }
const MAX_CACHED = 12;
const FRESH_MS = 2 * 60 * 1000;

const freshEntry = (id) => {
  const hit = id ? cache.get(id) : null;
  return hit && Date.now() - hit.at < FRESH_MS ? hit : null;
};

export function useSketchAssets(submissionId, enabled = true) {
  const [state, setState] = useState(() => ({
    status: freshEntry(submissionId) ? "ready" : "idle",
    assets: freshEntry(submissionId)?.assets || [],
    error: "",
  }));

  useEffect(() => {
    if (!enabled || !submissionId) return undefined;
    const hit = freshEntry(submissionId);
    if (hit) {
      setState({ status: "ready", assets: hit.assets, error: "" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading", assets: [], error: "" });
    (async () => {
      try {
        const rows = await base44.entities.SketchAsset.list(submissionId);
        const assets = await loadAssets(rows);
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
        cache.set(submissionId, { assets, at: Date.now() });
        if (!cancelled) setState({ status: "ready", assets, error: "" });
      } catch (e) {
        if (!cancelled) setState({ status: "error", assets: [], error: e.message || "Couldn't load their files." });
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, enabled]);

  return state;
}
