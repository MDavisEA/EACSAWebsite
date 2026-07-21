import React, { useState, useEffect, useCallback, useRef } from "react";
import ResizableDivider from "@/components/exam/ResizableDivider";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ExamHeader from "@/components/exam/ExamHeader";
import ExamFooter from "@/components/exam/ExamFooter";
import QuestionPanel from "@/components/exam/QuestionPanel";
import ResponsePanel from "@/components/exam/ResponsePanel";
import QuestionNavigator from "@/components/exam/QuestionNavigator";
import ReferenceSheet from "@/components/exam/ReferenceSheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ExamPage() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const assignmentId = urlParams.get("id");
  const studentName = assignmentId
    ? (sessionStorage.getItem(`student_name_${assignmentId}`) || "")
    : "";

  const localStorageKey = assignmentId && studentName
    ? `exam_responses_${assignmentId}_${studentName}`
    : null;

  // Read localStorage immediately (synchronously) so initial state is never empty
  const getLocalDraft = () => {
    if (!localStorageKey) return {};
    try { return JSON.parse(localStorage.getItem(localStorageKey) || "{}"); } catch { return {}; }
  };

  const [assignment, setAssignment] = useState(null);
  const [responses, setResponses] = useState(getLocalDraft);
  const [submissionId, setSubmissionId] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [currentPartId, setCurrentPartId] = useState(null);
  const [showDirections, setShowDirections] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showBlankWarning, setShowBlankWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [splitPercent, setSplitPercent] = useState(50);
  const [recoveredDraft, setRecoveredDraft] = useState(false);

  // Refs so callbacks always have fresh data without stale closures
  const responsesRef = useRef(responses);
  const submissionIdRef = useRef(null);
  const isDirtyRef = useRef(false); // tracks unsaved-to-DB changes

  // Persist to localStorage immediately on every change
  const persistLocal = (data) => {
    if (localStorageKey) {
      localStorage.setItem(localStorageKey, JSON.stringify(data));
    }
  };

  // Save to DB
  const saveToDb = useCallback(async () => {
    if (!submissionIdRef.current || !isDirtyRef.current) return;
    try {
      await base44.entities.Submission.update(submissionIdRef.current, {
        responses: responsesRef.current,
      });
      isDirtyRef.current = false;
    } catch {
      // silent - localStorage is the safety net
    }
  }, []);

  useEffect(() => {
    if (!assignmentId || !studentName) {
      navigate("/");
      return;
    }
    loadAssignment();
  }, []);

  const loadAssignment = async () => {
    const results = await base44.entities.Assignment.filter({ id: assignmentId });
    if (results.length === 0) { navigate("/"); return; }
    const a = results[0];
    setAssignment(a);

    if (a.time_limit_minutes) {
      setTimeRemaining(a.time_limit_minutes * 60);
    }

    if (a.questions[0]?.parts?.length > 0) {
      setCurrentPartId(a.questions[0].parts[0].id);
    }

    // What's in localStorage right now (already loaded as initial state)
    const localDraft = getLocalDraft();
    const hasLocalDraft = Object.keys(localDraft).length > 0;

    // Check for existing unsubmitted DB submission
    const existing = await base44.entities.Submission.filter({
      assignment_id: assignmentId,
      student_name: studentName,
      submitted: false,
    });

    let sub;
    if (existing.length > 0) {
      sub = existing[0];
      // Merge DB + localStorage; localStorage wins (most recent edits)
      const dbResponses = sub.responses || {};
      const merged = { ...dbResponses, ...localDraft };
      responsesRef.current = merged;
      setResponses(merged);
      persistLocal(merged);
      if (Object.keys(merged).some((k) => merged[k]?.trim())) {
        setRecoveredDraft(true);
      }
    } else {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      sub = await base44.entities.Submission.create({
        assignment_id: assignmentId,
        student_name: studentName,
        responses: localDraft,
        submitted: false,
        access_code: code,
      });
      responsesRef.current = localDraft;
      setResponses(localDraft);
      if (hasLocalDraft && Object.keys(localDraft).some((k) => localDraft[k]?.trim())) {
        setRecoveredDraft(true);
      }
    }

    submissionIdRef.current = sub.id;
    setSubmissionId(sub.id);
    isDirtyRef.current = false;
    setLoading(false);
  };

  // Autosave to DB every 5 seconds (uses refs so no stale closure)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!submissionIdRef.current || !isDirtyRef.current) return;
      try {
        await base44.entities.Submission.update(submissionIdRef.current, {
          responses: responsesRef.current,
        });
        isDirtyRef.current = false;
      } catch {
        // localStorage is the fallback
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save on tab/window blur (switching away or closing)
  useEffect(() => {
    const handleBlur = () => saveToDb();
    const handleBeforeUnload = (e) => {
      // Always try to save synchronously via beacon
      if (submissionIdRef.current) {
        persistLocal(responsesRef.current);
      }
      // Warn only if dirty
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveToDb]);

  // Save when navigating between questions
  const goToStep = useCallback((stepIdx) => {
    saveToDb();
    const steps = getStepsFromAssignment(assignment);
    if (stepIdx >= 0 && stepIdx < steps.length) {
      setCurrentQuestionIdx(steps[stepIdx].questionIdx);
      setCurrentPartId(steps[stepIdx].partId ?? null);
    }
  }, [assignment, saveToDb]);

  // Timer
  useEffect(() => {
    if (timeRemaining == null) return;
    if (timeRemaining <= 0) {
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeRemaining((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeRemaining]);

  const getStepsFromAssignment = (a) => {
    if (!a) return [];
    const steps = [];
    a.questions.forEach((q, qi) => {
      const qLabel = q.title || `Question ${qi + 1}`;
      if (q.parts && q.parts.length > 0) {
        q.parts.forEach((p) => {
          steps.push({ questionIdx: qi, partId: p.id, label: `${qLabel}${p.label}` });
        });
      } else {
        steps.push({ questionIdx: qi, partId: null, label: qLabel });
      }
    });
    return steps;
  };

  const getSteps = useCallback(() => getStepsFromAssignment(assignment), [assignment]);

  const getCurrentStepIndex = () => {
    const steps = getSteps();
    const idx = steps.findIndex(
      (s) => s.questionIdx === currentQuestionIdx && s.partId === currentPartId
    );
    if (idx === -1) return steps.findIndex((s) => s.questionIdx === currentQuestionIdx);
    return idx;
  };

  const getResponseKey = () => {
    const q = assignment.questions[currentQuestionIdx];
    return currentPartId ? `${q.id}_${currentPartId}` : q.id;
  };

  const handleResponseChange = (value) => {
    const key = getResponseKey();
    setResponses((prev) => {
      const updated = { ...prev, [key]: value };
      responsesRef.current = updated;
      isDirtyRef.current = true;
      persistLocal(updated);
      return updated;
    });
  };

  const handleSubmitClick = () => {
    const hasAnyContent = Object.values(responses).some((v) => v?.trim());
    if (!hasAnyContent) {
      setShowBlankWarning(true);
    } else {
      setShowSubmitConfirm(true);
    }
  };

  const handleSubmit = async () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    await base44.entities.Submission.update(submissionIdRef.current, {
      responses: responsesRef.current,
      submitted: true,
      submitted_at: new Date().toISOString(),
      time_spent_seconds: elapsed,
    });
    if (localStorageKey) localStorage.removeItem(localStorageKey);
    isDirtyRef.current = false;
    navigate("/submitted");
  };

  if (loading || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const question = assignment.questions[currentQuestionIdx];
  const currentPart = currentPartId ? question.parts?.find((p) => p.id === currentPartId) : null;
  const stepIndex = getCurrentStepIndex();
  const steps = getSteps();

  return (
    <div className="h-screen flex flex-col bg-[hsl(225,20%,97%)] overflow-hidden">
      <ExamHeader
        title={assignment.title}
        directions={assignment.directions}
        timeRemaining={timeRemaining}
        showDirections={showDirections}
        onToggleDirections={() => setShowDirections(!showDirections)}
        hasTimer={!!assignment.time_limit_minutes}
        onOpenReference={() => setShowReference(true)}
      />

      {/* Draft recovered banner */}
      {recoveredDraft && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-green-700 font-medium">✓ Recovered your saved work.</span>
          <button
            onClick={() => setRecoveredDraft(false)}
            className="text-green-500 hover:text-green-700 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <div id="exam-split-container" className="flex-1 flex overflow-hidden">
        {/* Left: Question prompt */}
        <div style={{ width: `${splitPercent}%` }} className="border-r border-slate-200 flex flex-col overflow-hidden min-w-0">
          <QuestionPanel question={question} currentPartId={currentPartId} submissionId={submissionId} />
        </div>

        <ResizableDivider leftPercent={splitPercent} onResize={setSplitPercent} />

        {/* Right: Response area */}
        <div style={{ width: `${100 - splitPercent}%`, height: "100%" }} className="flex flex-col overflow-hidden min-w-0">
          <ResponsePanel
            questionNumber={question.title || (currentQuestionIdx + 1)}
            partLabel={currentPart?.label}
            partPrompt={currentPart?.prompt_html || currentPart?.prompt}
            partPromptIsHtml={!!currentPart?.prompt_html}
            value={responses[getResponseKey()]}
            onChange={handleResponseChange}
            onBlur={saveToDb}
          />
        </div>
      </div>

      <ExamFooter
        studentName={studentName}
        steps={steps}
        currentStepIndex={stepIndex}
        onGoToStep={goToStep}
        onSubmit={handleSubmitClick}
      />

      {showReference && (
        <ReferenceSheet
          url={assignment.reference_sheet_url || null}
          onClose={() => setShowReference(false)}
        />
      )}

      <QuestionNavigator
        open={showNavigator}
        onClose={() => setShowNavigator(false)}
        questions={assignment.questions}
        responses={responses}
        currentIndex={stepIndex}
        onSelect={(qi, pid) => { saveToDb(); setCurrentQuestionIdx(qi); setCurrentPartId(pid); }}
        onSubmit={handleSubmitClick}
      />

      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Once submitted, you cannot edit your responses. Are you sure you want to submit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Working</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmit()}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBlankWarning} onOpenChange={setShowBlankWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>All responses are blank</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't written anything yet. Are you sure you want to submit a blank assignment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmit()}>Submit Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}