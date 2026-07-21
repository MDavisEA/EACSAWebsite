import React from "react";

export default function ExamFooter({
  studentName,
  steps,
  currentStepIndex,
  onGoToStep,
  onSubmit
}) {
  return (
    <div className="bg-white border-t border-slate-200 flex-shrink-0 relative z-10">
      <div className="flex items-center justify-center px-4 h-12 gap-4">
        <div className="text-sm text-slate-600 font-medium whitespace-nowrap">
          {studentName}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {steps.map((step, i) => (
            <button
              key={i}
              onClick={() => onGoToStep(i)}
              className={`text-xs font-medium px-3 py-1.5 rounded focus:outline-none transition-colors ${
                i === currentStepIndex
                  ? "bg-primary text-white"
                  : "border border-slate-300 text-slate-600 hover:border-primary hover:text-primary"
              }`}
            >
              {step.label}
            </button>
          ))}
          <button
            onClick={onSubmit}
            className="text-xs font-medium text-white bg-green-600 rounded px-3 py-1.5 hover:bg-green-700 focus:outline-none whitespace-nowrap"
          >
            Submit All
          </button>
        </div>
      </div>
    </div>
  );
}