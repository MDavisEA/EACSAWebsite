import React from "react";
import { ChevronDown, BookOpen } from "lucide-react";

export default function ExamHeader({
  title,
  directions,
  timeRemaining,
  showDirections,
  onToggleDirections,
  hasTimer,
  onOpenReference,
  hasReference,
}) {
  const formatTime = (seconds) => {
    if (seconds == null) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isLowTime = timeRemaining != null && timeRemaining < 300;

  return (
    <div className="bg-white border-b border-slate-200 flex-shrink-0">
      <div className="flex items-center justify-between px-4 h-12">
        {/* Left */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-800">Section II</span>
          {directions && (
            <button
              onClick={onToggleDirections}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Directions <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Center — timer */}
        {hasTimer && (
          <div className={`font-mono text-sm font-medium tabular-nums ${isLowTime ? "text-red-600" : "text-slate-700"}`}>
            {formatTime(timeRemaining)}
          </div>
        )}

        {/* Right */}
        <div className="flex items-center gap-2">
          {directions && (
            <button
              onClick={onToggleDirections}
              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded-full px-3 py-1"
            >
              {showDirections ? "Hide" : "Show"}
            </button>
          )}
          <button
            onClick={onOpenReference}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-primary border border-slate-300 hover:border-primary rounded-full px-3 py-1 transition-colors"
          >
            <BookOpen className="w-3 h-3" />
            Reference
          </button>
        </div>
      </div>

      {showDirections && directions && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-slate-700">
          {directions}
        </div>
      )}
    </div>
  );
}