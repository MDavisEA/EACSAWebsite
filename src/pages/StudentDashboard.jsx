import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession, ALLOWED_STUDENT_DOMAIN } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SubmissionDetail from "@/components/SubmissionDetail";
import { format, isPast } from "date-fns";
import {
  BookOpen, LogIn, LogOut, ChevronRight, Loader2, RotateCcw, CheckCheck, ChevronDown, ChevronUp,
  MessageSquare, FileCode, Sparkles, ExternalLink,
} from "lucide-react";

// Requested by students, so it's the first thing on the page - deliberately
// bigger/bolder than everything else here, per that same ask.
const GEMINI_ASSISTANT_URL = "https://gemini.google.com/gem/1yvKDzNaQh3sSPDROcxL7CO37BI-kMbi-?usp=sharing";
import { WORK_KIND_META, STATUS, groupWorkByUnit } from "@/lib/workStatus";
import { highlightNoteCode } from "@/lib/highlightNoteCode";

// Per-kind presentation, plus where clicking a row navigates to - only the
// student page needs a route (the teacher's roster detail opens a grading
// tool instead), so `route` is added here rather than living in the shared
// WORK_KIND_META both pages use for the icon/color choices.
const KINDS = {
  frq: { ...WORK_KIND_META.frq, route: (id) => `/student?id=${id}` },
  code: { ...WORK_KIND_META.code, route: (id) => `/code?id=${id}` },
  project: { ...WORK_KIND_META.project, route: (id) => `/project?id=${id}` },
  loop: { ...WORK_KIND_META.loop, route: (id) => `/loop-practice-run?id=${id}` },
};

// One row of work. Shared so the main unit lists and the Reviewed section at
// the bottom cannot drift into two slightly different renderings.
function WorkRow({ item, onOpen }) {
  const kind = KINDS[item.kind];
  const Icon = kind.icon;
  const overdue =
    item.due_date &&
    isPast(new Date(item.due_date)) &&
    (item.status === "not_started" || item.status === "in_progress");
  return (
    <button
      onClick={() => onOpen(item, kind.route)}
      className="w-full text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all group flex items-center gap-4"
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${kind.chip} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${kind.accent}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate group-hover:text-primary transition-colors">{item.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <StatusBadge status={item.status} />
          {item.due_date && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {overdue ? "Was due " : "Due "}
              {format(new Date(item.due_date), "MMM d")}
            </span>
          )}
          {item.is_late && <span className="text-xs text-amber-700">Turned in late</span>}
          {/* Tells them, before they click in, whether feedback is worth
              digging into - a specific comment on their code is the
              strongest signal, so it wins over a general one when both
              exist rather than showing both badges. */}
          {item.has_line_comments ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
              <FileCode className="w-3 h-3" /> Comments on your code
            </span>
          ) : item.has_comment ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
              <MessageSquare className="w-3 h-3" /> Feedback
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {(item.status === "graded" || item.status === "reviewed" || item.status === "complete") && item.score != null && (
          <span className={`text-sm font-semibold ${item.status === "reviewed" ? "text-muted-foreground" : ""}`}>
            {item.score}
            {item.points_possible ? `/${item.points_possible}` : ""}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS[status] || STATUS.not_started;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { session, user, loading: sessionLoading, domainRejected } = useGoogleSession();

  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [openNote, setOpenNote] = useState(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Which class to show, for a student on more than one roster - "" means
  // all of them together. Remembered per-student so switching classes to
  // organize their work sticks across visits instead of resetting every time.
  const [courseFilter, setCourseFilter] = useState("");

  // Looking at something already turned in. Fetched on demand rather than with
  // the dashboard: these rows carry the full code and every response, which is
  // a lot to pull for a list that only needs titles and statuses.
  const [detail, setDetail] = useState(null); // { item, submission, codingProblem }
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reopening, setReopening] = useState(false);

  const FIELD_FOR = { frq: "assignment_id", code: "coding_problem_id", project: "project_id" };

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) { setLoading(false); return; }
    load();
  }, [sessionLoading, session]);

  // Remember which class they were looking at, per student, so it sticks
  // across visits. Read once the courses list is in, so a stale id from a
  // class they are no longer on (or that hasn't loaded yet) cannot leave the
  // dashboard stuck showing nothing.
  useEffect(() => {
    if (!user || courses.length === 0) return;
    const saved = localStorage.getItem(`dashboard_course_${user.id}`);
    if (saved && courses.some((c) => c.id === saved)) setCourseFilter(saved);
  }, [user, courses]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`dashboard_course_${user.id}`, courseFilter);
  }, [user, courseFilter]);

  // Clicking work you have finished should show you what you handed in, not
  // silently start it over - which is what navigating to the work route did.
  const openItem = async (item, route) => {
    // Loop practice has no separate "view feedback" detail screen - the
    // runner itself already shows a completion screen for a finished set and
    // resumes an in-progress one, so it's always just a navigate, regardless
    // of status.
    if (item.kind === "loop" || (item.status !== "submitted" && item.status !== "graded" && item.status !== "reviewed")) {
      navigate(route(item.id));
      return;
    }
    setDetail({ item, submission: null });
    setDetailLoading(true);
    setDetailError("");
    try {
      const rows = await base44.entities.Submission.filter({ mine: true, submitted: true });
      const field = FIELD_FOR[item.kind];
      const mine = rows
        .filter((r) => r[field] === item.id)
        .sort((a, b) => new Date(b.submitted_at ?? 0) - new Date(a.submitted_at ?? 0))[0];
      if (!mine) {
        setDetailError("Couldn't find that submission.");
      } else {
        // Fetch the problem itself for a coding item rather than synthesising a
        // stand-in: it carries the real points_possible, and the answer key
        // when the teacher has released it. The key is stripped server-side
        // until then (sanitizeForStudent), and this is only ever reached from a
        // submission they have already turned in - so seeing it here cannot
        // help anyone still writing their own.
        let codingProblem;
        if (item.kind === "code") {
          try {
            // Not filter({id}) - that requires the problem still be active,
            // which would hide a released answer key the moment the teacher
            // deactivates a finished problem (the normal end-of-unit move).
            codingProblem = await base44.entities.CodingProblem.getForReview(item.id);
          } catch {
            // A missing problem should not block them seeing their own work.
          }
        }
        setDetail({ item, submission: mine, codingProblem });
      }
    } catch (e) {
      setDetailError(e.message || "Couldn't load your submission.");
    } finally {
      setDetailLoading(false);
    }
  };

  // Reopens the same row and drops straight back into the editor with their
  // code still in it. The server refuses once a grade or any feedback exists,
  // so this cannot quietly replace work a teacher has already commented on.
  const resubmit = async () => {
    if (!detail?.submission) return;
    setReopening(true);
    setDetailError("");
    try {
      await base44.entities.Submission.reopenMine(detail.submission.id);
      const route = KINDS[detail.item.kind]?.route;
      setDetail(null);
      if (route) navigate(route(detail.item.id));
    } catch (e) {
      setDetailError(e.message || "Couldn't reopen that.");
    } finally {
      setReopening(false);
    }
  };

  // "I have read this feedback" - moves the item down into Reviewed. Reversible
  // from the same button, so a mis-tap is not a one-way door.
  const toggleReviewed = async (nextReviewed) => {
    if (!detail?.submission) return;
    setMarkingReviewed(true);
    setDetailError("");
    try {
      await base44.entities.Submission.markFeedbackReviewed(detail.submission.id, nextReviewed);
      setDetail(null);
      await load();
    } catch (e) {
      setDetailError(e.message || "Couldn't save that.");
    } finally {
      setMarkingReviewed(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { items: fetched, studentName: name, units: u, courses: c, notes: n } =
        await base44.entities.StudentWork.myAssignedWork();
      setItems(fetched);
      setUnits(u || []);
      setCourses(c || []);
      setNotes(n || []);
      setStudentName(name || "");
    } catch (e) {
      setLoadError(e.message || "Couldn't load your work. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Signed-out state doubles as the site's front door.
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">AP CSA Practice</h1>
          <p className="text-muted-foreground mb-8">
            Sign in with your school Google account to see your work.
          </p>
          {domainRejected && (
            <p className="text-sm text-destructive mb-4">
              Please use your school Google account (@{ALLOWED_STUDENT_DOMAIN}).
            </p>
          )}
          <Button size="lg" onClick={() => base44.auth.signInWithGoogle(window.location.href)}>
            <LogIn className="w-4 h-4 mr-2" /> Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  // Scoped to the selected class before anything else is computed, so the
  // counts at the top and the "all caught up" line match what is actually
  // shown below rather than counting work from a class that is toggled off.
  const visible = courseFilter ? items.filter((i) => i.course_id === courseFilter) : items;
  const visibleNotes = courseFilter ? notes.filter((n) => n.course_id === courseFilter) : notes;

  const todo = visible.filter((i) => i.status === "not_started" || i.status === "in_progress").length;
  const needsLook = visible.filter((i) => i.status === "graded").length;

  // Reviewed work leaves the unit lists entirely - by June there will be a lot
  // of it, and the point of the section is that finished work stops competing
  // for attention with work that still needs something.
  const active = visible.filter((i) => i.status !== "reviewed");
  const reviewed = visible.filter((i) => i.status === "reviewed");

  // A teacher-required acknowledgment is not just "not reviewed yet" the way
  // the rest of active is - it needs to be impossible to miss, so it gets
  // pulled out into its own section above everything else rather than
  // competing for attention inside a unit's normal list.
  const outstandingAck = active.filter((i) => i.needs_ack);
  const activeRest = active.filter((i) => !i.needs_ack);

  // Once a single class is picked, its name on every unit heading is just
  // noise - it was only there to tell units from different classes apart.
  const showCourse = courses.length > 1 && !courseFilter;
  const groups = groupWorkByUnit(activeRest, units, courses);
  const reviewedGroups = groupWorkByUnit(reviewed, units, courses);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-semibold">My Work</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {studentName || user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => base44.auth.logout("/")} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <a
          href={GEMINI_ASSISTANT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-gradient-to-r from-blue-50 to-violet-50 border-2 border-blue-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-blue-900 group-hover:text-blue-700 transition-colors">
              Davis Gemini Assistant
            </p>
            <p className="text-sm text-blue-700/80">Your AI helper for this class - opens in a new tab</p>
          </div>
          <ExternalLink className="w-5 h-5 text-blue-500 flex-shrink-0" />
        </a>

        {/* A teacher-required acknowledgment, not just a bare grade - shown
            first, before anything else on the page, so it cannot be missed
            the way an item sitting in its normal unit spot could be. Clicking
            through opens the same detail dialog every other row does; the
            "I've read this feedback" button already there is what actually
            clears it. */}
        {outstandingAck.length > 0 && (
          <section className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
                Outstanding Feedback
              </h2>
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-xs">
                {outstandingAck.length}
              </Badge>
            </div>
            <p className="text-xs text-amber-800 mb-3">
              Your teacher asked you to confirm you&rsquo;ve read the feedback on{" "}
              {outstandingAck.length === 1 ? "this" : "these"}.
            </p>
            <div className="space-y-2">
              {outstandingAck.map((item) => (
                <WorkRow key={`${item.kind}-${item.id}`} item={item} onOpen={openItem} />
              ))}
            </div>
          </section>
        )}

        {/* Only worth showing once there is more than one class to pick
            between - a student on a single roster never sees this. */}
        {courses.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCourseFilter("")}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                courseFilter === ""
                  ? "bg-slate-900 text-white border-slate-900"
                  : "hover:bg-slate-50 text-slate-600"
              }`}
            >
              All classes
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setCourseFilter(c.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  courseFilter === c.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {visibleNotes.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Class Notes</h2>
              <Badge variant="outline" className="text-xs">{visibleNotes.length}</Badge>
            </div>
            <div className="space-y-2">
              {visibleNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setOpenNote(note)}
                  className="w-full text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all flex items-center justify-between gap-4"
                >
                  <span className="font-medium">{note.title}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {loadError ? (
          <div className="text-center bg-white border rounded-xl p-8 space-y-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-10">
            <p className="text-sm">
              {courseFilter ? "Nothing assigned in this class right now." : "Nothing assigned right now."}
            </p>
            <p className="text-xs mt-1">Check back later, or ask your teacher for a link.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {todo === 0 && needsLook === 0
                ? "You're all caught up."
                : [
                    todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} still to do` : null,
                    needsLook > 0 ? `${needsLook} with new feedback` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") + "."}
            </p>

            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{g.label}</h2>
                  {showCourse && g.course && (
                    <span className="text-xs text-muted-foreground">{g.course}</span>
                  )}
                  <Badge variant="outline" className="text-xs">{g.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {g.items.map((item) => (
                    <WorkRow key={`${item.kind}-${item.id}`} item={item} onOpen={openItem} />
                  ))}
                </div>
              </section>
            ))}

            {reviewed.length > 0 && (
              <section className="pt-2 border-t">
                <button
                  onClick={() => setShowReviewed((v) => !v)}
                  className="w-full flex items-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span className="font-semibold uppercase tracking-wide">Reviewed</span>
                  <Badge variant="outline" className="text-xs">{reviewed.length}</Badge>
                  <span className="ml-auto">
                    {showReviewed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>
                {showReviewed ? (
                  <div className="space-y-6">
                    {reviewedGroups.map((g) => (
                      <div key={g.key}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {g.label}
                          </h3>
                          {showCourse && g.course && (
                            <span className="text-xs text-muted-foreground">{g.course}</span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {g.items.map((item) => (
                            <WorkRow key={`${item.kind}-${item.id}`} item={item} onOpen={openItem} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pb-3">
                    Work you have marked as read. Tap to look at any of it again.
                  </p>
                )}
              </section>
            )}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Have an access code from an older assignment?{" "}
          <button onClick={() => navigate("/my-score")} className="underline hover:text-foreground">
            Look it up here
          </button>
        </p>
      </main>

      <Dialog open={!!openNote} onOpenChange={(v) => { if (!v) setOpenNote(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openNote?.title}</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none quill-render quill-dark p-4 rounded-lg bg-[#1e1e1e] text-slate-100"
            dangerouslySetInnerHTML={{ __html: highlightNoteCode(openNote?.content_html || "") }}
          />
        </DialogContent>
      </Dialog>

      {/* What you turned in, and a way to turn it in again. */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.item?.title}</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailError ? (
            <p className="text-sm text-destructive py-4">{detailError}</p>
          ) : detail?.submission ? (
            <div className="space-y-4">
              <SubmissionDetail
                result={detail.submission}
                codingProblem={
                  detail.item.kind === "code"
                    ? detail.codingProblem ?? {
                        title: detail.item.title,
                        points_possible: detail.item.points_possible,
                      }
                    : undefined
                }
              />

              {detail.item.kind === "frq" && (
                <p className="text-xs text-muted-foreground border-t pt-3">
                  Want the question-by-question breakdown?{" "}
                  <button
                    onClick={() => { setDetail(null); navigate("/my-score"); }}
                    className="underline hover:text-foreground"
                  >
                    Look it up with your access code
                  </button>
                  .
                </p>
              )}

              {/* Before grading, any FRQ or Coding Assignment can be reopened
                  - see reopenMine on the server, which is what actually
                  enforces it. After grading, only a hand-graded Coding
                  Assignment can still be turned in again; the old grade and
                  feedback are not lost, just archived, and the score you see
                  here goes back to unscored until it is regraded. */}
              {(() => {
                const isReviewCoding = detail.item.kind === "code" && detail.codingProblem?.grading_kind === "review";
                const canResubmit =
                  detail.item.kind !== "project" &&
                  (detail.item.status === "submitted" ||
                    (isReviewCoding && (detail.item.status === "graded" || detail.item.status === "reviewed")));
                if (!canResubmit) return null;
                const alreadyGraded = detail.item.status !== "submitted";
                return (
                  <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
                    <Button variant="outline" onClick={resubmit} disabled={reopening}>
                      {reopening ? (
                        <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reopening...</>
                      ) : (
                        <><RotateCcw className="w-4 h-4 mr-1.5" /> Turn it in again</>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {alreadyGraded
                        ? "Reopens this with your work still in it. Your current grade and feedback go back to waiting on a grade until your teacher looks at it again."
                        : "Reopens this with your work still in it. Once your teacher has graded it you will need to ask them."}
                    </span>
                  </div>
                );
              })()}

              {/* The point of the whole Reviewed section: once they have
                  actually read the feedback they say so, and it moves out of
                  the way. Offered only on graded work, since there is nothing
                  to have read otherwise. */}
              {(detail.item.status === "graded" || detail.item.status === "reviewed") && (
                <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
                  {detail.item.status === "reviewed" ? (
                    <>
                      <Button variant="outline" onClick={() => toggleReviewed(false)} disabled={markingReviewed}>
                        {markingReviewed ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                        ) : (
                          "Move back to my list"
                        )}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        You marked this as read, so it sits under Reviewed.
                      </span>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => toggleReviewed(true)}
                        disabled={markingReviewed}
                        className={detail.item.needs_ack ? "bg-amber-600 hover:bg-amber-700" : ""}
                      >
                        {markingReviewed ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
                        ) : detail.item.needs_ack ? (
                          <><CheckCheck className="w-4 h-4 mr-1.5" /> Confirm I&rsquo;ve read this</>
                        ) : (
                          <><CheckCheck className="w-4 h-4 mr-1.5" /> I&rsquo;ve read this feedback</>
                        )}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {detail.item.needs_ack
                          ? "Your teacher asked you to confirm you've read this before it leaves Outstanding Feedback."
                          : "Moves this into Reviewed at the bottom. You can always open it again."}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
