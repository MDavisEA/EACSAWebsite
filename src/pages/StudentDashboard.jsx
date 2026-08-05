import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession, ALLOWED_STUDENT_DOMAIN } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, isPast } from "date-fns";
import {
  BookOpen, Code2, FolderGit2, LogIn, LogOut, ChevronRight,
  CheckCircle2, Clock, CircleDashed, Star,
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

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) { setLoading(false); return; }
    load();
  }, [sessionLoading, session]);

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
                          onClick={() => navigate(route(item.id))}
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
    </div>
  );
}
