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
  BookOpen, Code2, FolderGit2, LogIn, LogOut, ChevronRight,
  CheckCircle2, Clock, CircleDashed, Star, Loader2, RotateCcw,
} from "lucide-react";

// The three kinds of work, in the order a student sees them. `route` is where
// clicking a row takes them; the destination pages fetch the full item
// themselves through their existing (answer-key-stripping) endpoints.
const GROUPS = [
  { kind: "frq", label: "FRQ Practice", icon: BookOpen, route: (id) => `/student?id=${id}`,
    accent: "text-primary", chip: "bg-blue-50" },
  { kind: "code", label: "Code Practice", icon: Code2, route: (id) => `/code?id=${id}`,
    accent: "text-emerald-600", chip: "bg-emerald-50" },
  { kind: "project", label: "Projects", icon: FolderGit2, route: (id) => `/project?id=${id}`,
    accent: "text-violet-600", chip: "bg-violet-50" },
];

const STATUS = {
  not_started: { label: "Not started", icon: CircleDashed, className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In progress", icon: Clock, className: "bg-amber-100 text-amber-800" },
  submitted: { label: "Turned in", icon: CheckCircle2, className: "bg-blue-100 text-blue-800" },
  graded: { label: "Graded", icon: Star, className: "bg-emerald-100 text-emerald-800" },
};

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
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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

  // Clicking work you have finished should show you what you handed in, not
  // silently start it over - which is what navigating to the work route did.
  const openItem = async (item, route) => {
    if (item.status !== "submitted" && item.status !== "graded") {
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
      const route = GROUPS.find((g) => g.kind === detail.item.kind)?.route;
      setDetail(null);
      if (route) navigate(route(detail.item.id));
    } catch (e) {
      setDetailError(e.message || "Couldn't reopen that.");
    } finally {
      setReopening(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { items: fetched, studentName: name } = await base44.entities.StudentWork.myAssignedWork();
      setItems(fetched);
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

  const todo = items.filter((i) => i.status === "not_started" || i.status === "in_progress").length;

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
        {loadError ? (
          <div className="text-center bg-white border rounded-xl p-8 space-y-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground bg-white border rounded-xl p-10">
            <p className="text-sm">Nothing assigned right now.</p>
            <p className="text-xs mt-1">Check back later, or ask your teacher for a link.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {todo === 0
                ? "You're all caught up."
                : `${todo} thing${todo === 1 ? "" : "s"} still to do.`}
            </p>

            {GROUPS.map(({ kind, label, icon: Icon, route, accent, chip }) => {
              const group = items.filter((i) => i.kind === kind);
              if (group.length === 0) return null;

              // Soonest deadline first; undated work sinks to the bottom.
              const sorted = [...group].sort((a, b) => {
                if (!a.due_date && !b.due_date) return a.title.localeCompare(b.title);
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
              });

              return (
                <section key={kind}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-4 h-4 ${accent}`} />
                    <h2 className="text-sm font-semibold uppercase tracking-wide">{label}</h2>
                    <Badge variant="outline" className="text-xs">{group.length}</Badge>
                  </div>

                  <div className="space-y-2">
                    {sorted.map((item) => {
                      const overdue =
                        item.due_date &&
                        isPast(new Date(item.due_date)) &&
                        (item.status === "not_started" || item.status === "in_progress");
                      return (
                        <button
                          key={`${item.kind}-${item.id}`}
                          onClick={() => openItem(item, route)}
                          className="w-full text-left bg-white border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all group flex items-center gap-4"
                        >
                          <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${chip} flex items-center justify-center`}>
                            <Icon className={`w-4 h-4 ${accent}`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate group-hover:text-primary transition-colors">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <StatusBadge status={item.status} />
                              {item.due_date && (
                                <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                  {overdue ? "Was due " : "Due "}
                                  {format(new Date(item.due_date), "MMM d")}
                                </span>
                              )}
                              {item.is_late && (
                                <span className="text-xs text-amber-700">Turned in late</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.status === "graded" && (
                              <span className="text-sm font-semibold">
                                {item.score}
                                {item.points_possible ? `/${item.points_possible}` : ""}
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Have an access code from an older assignment?{" "}
          <button onClick={() => navigate("/my-score")} className="underline hover:text-foreground">
            Look it up here
          </button>
        </p>
      </main>

      {/* What you turned in, and a way to turn it in again. */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
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

              {/* Only offered while nothing has been graded - see reopenMine on
                  the server, which is what actually enforces it. */}
              {detail.item.kind !== "project" && detail.item.status === "submitted" && (
                <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
                  <Button variant="outline" onClick={resubmit} disabled={reopening}>
                    {reopening ? (
                      <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reopening...</>
                    ) : (
                      <><RotateCcw className="w-4 h-4 mr-1.5" /> Turn it in again</>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Reopens this with your work still in it. Once your teacher has graded it you
                    will need to ask them.
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
