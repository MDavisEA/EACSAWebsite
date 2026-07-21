import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Circle } from "lucide-react";

export default function QuestionNavigator({
  open,
  onClose,
  questions,
  responses,
  currentIndex,
  onSelect,
  onSubmit
}) {
  const getSteps = () => {
    const steps = [];
    questions.forEach((q, qi) => {
      if (q.parts && q.parts.length > 0) {
        q.parts.forEach((p) => {
          const key = `${q.id}_${p.id}`;
          steps.push({
            label: `Q${qi + 1}${p.label}`,
            key,
            hasResponse: !!responses[key]?.trim(),
            questionIndex: qi,
            partId: p.id
          });
        });
      } else {
        steps.push({
          label: `Q${qi + 1}`,
          key: q.id,
          hasResponse: !!responses[q.id]?.trim(),
          questionIndex: qi,
          partId: null
        });
      }
    });
    return steps;
  };

  const steps = getSteps();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Question Navigator</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2 my-4">
          {steps.map((step, i) => (
            <button
              key={step.key}
              onClick={() => {
                onSelect(step.questionIndex, step.partId);
                onClose();
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                i === currentIndex
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {step.hasResponse ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300" />
              )}
              {step.label}
            </button>
          ))}
        </div>
        <Button onClick={onSubmit} className="w-full" variant="destructive">
          Submit Assignment
        </Button>
      </DialogContent>
    </Dialog>
  );
}