import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useGoogleSession, ALLOWED_STUDENT_DOMAIN } from "@/lib/useGoogleSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import { googleDocEmbedUrl } from "@/lib/googleDoc";
import SampleOutputs from "@/components/SampleOutputs";
import { FolderGit2, AlertCircle, ChevronRight, LogIn, CheckCircle2, FileCode2, ExternalLink, ArrowLeft } from "lucide-react";

export default function ProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("id");
  const { session, user, loading: sessionLoading, domainRejected } = useGoogleSession();

  const [project, setProject] = useState(null);
  const [activeProjects, setActiveProjects] = useState([]);
  const [mySubmission, setMySubmission] = useState(null);
  const [gistUrl, setGistUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    setProject(null);
    if (projectId) {
      loadProject();
    } else {
      loadActive();
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || sessionLoading || !session) return;
    loadMySubmission();
  }, [projectId, sessionLoading, session]);

  const loadProject = async () => {
    try {
      const results = await base44.entities.Project.filter({ id: projectId });
      if (results.length === 0) {
        setLoadError("Project not found or no longer active.");
      } else {
        setProject(results[0]);
        setGistUrl(results[0].gist_url || "");
      }
    } catch (e) {
      setLoadError(e.message || "Couldn't load this project. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadActive = async () => {
    try {
      setActiveProjects(await base44.entities.Project.filter({ is_active: true }));
    } catch (e) {
      setLoadError(e.message || "Couldn't load projects. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // A failure here is non-fatal - the page still works for submitting, the
  // student just does not see their previous submission, so it stays quiet
  // rather than blocking the whole page behind an error.
  const loadMySubmission = async () => {
    try {
      const sub = await base44.entities.Submission.getMyProjectSubmission(projectId);
      setMySubmission(sub);
      if (sub?.gist_url) setGistUrl(sub.gist_url);
    } catch {
      // ignored on purpose
    }
  };

  const handleSubmit = async () => {
    if (!gistUrl.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const sub = await base44.entities.Submission.submitGist(projectId, gistUrl.trim());
      setMySubmission(sub);
    } catch (e) {
      setError(e.message || "Something went wrong submitting your gist. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (projectId && !project && !loadError)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 mb-5">
              <FolderGit2 className="w-7 h-7 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select a Project</h1>
            <p className="text-sm text-muted-foreground">Choose a project to turn in</p>
          </div>

          {activeProjects.length === 0 ? (
            <div className="text-center text-muted-foreground bg-card border border-border rounded-xl p-8">
              <p className="text-sm">No projects are available right now.</p>
              <p className="text-xs mt-1">Check back later or ask your teacher for a link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/project?id=${p.id}`)}
                  className="w-full text-left bg-card border border-border rounded-xl p-5 hover:border-violet-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-foreground group-hover:text-violet-600 transition-colors">
                      {p.title}
                    </h2>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-violet-600 transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Unable to Load Project</h1>
          <p className="text-muted-foreground">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* The only way back used to be the browser's own Back button - easy
            to lose track of once a student has clicked into a Gist link or
            scrolled through directions. */}
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Work
        </button>

        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 mb-4">
            <FolderGit2 className="w-7 h-7 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
          {project.due_date && (
            <p className={`text-sm mt-2 ${new Date(project.due_date) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
              Due {new Date(project.due_date).toLocaleString(undefined, {
                weekday: "short", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
              {new Date(project.due_date) < new Date() && " — past due, submissions are marked late"}
            </p>
          )}
        </div>

        {project.description_html && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Assignment
            </h2>
            <div
              className="prose prose-sm max-w-none quill-render"
              dangerouslySetInnerHTML={{ __html: project.description_html }}
            />
          </div>
        )}

        {project.google_doc_url && (
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Assignment (Google Doc)
              </h2>
              <a
                href={project.google_doc_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                Open in new tab <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <iframe
              src={googleDocEmbedUrl(project.google_doc_url)}
              title="Assignment directions"
              className="w-full rounded-lg border"
              style={{ height: 600 }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              If this does not load, ask your teacher to check the sharing settings.
            </p>
          </div>
        )}

        {/* What it should look like when it runs. Sits right after the
            directions, since that is the question these answer. */}
        {(project.sample_outputs || []).length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sample Output
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              What your finished program should look like when it runs. Yours does not have to match
              word for word.
            </p>
            <SampleOutputs items={project.sample_outputs} />
          </div>
        )}

        {project.rubric_md && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Rubric
            </h2>
            <div className="text-sm markdown-render">
              <ReactMarkdown>{project.rubric_md}</ReactMarkdown>
            </div>
          </div>
        )}

        {project.starter_files?.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Starter Code
            </h2>
            {project.starter_files.map((f) => (
              <div key={f.filename}>
                <p className="text-xs font-mono font-semibold text-slate-500 mb-1">{f.filename}</p>
                <pre className="bg-slate-50 border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                  {f.content}
                </pre>
              </div>
            ))}
          </div>
        )}

        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          {domainRejected && (
            <p className="text-sm text-destructive text-center">
              Please sign in with your school Google account (@{ALLOWED_STUDENT_DOMAIN}).
            </p>
          )}

          {!session ? (
            <Button
              onClick={() => base44.auth.signInWithGoogle(window.location.href)}
              className="w-full"
              size="lg"
            >
              <LogIn className="w-4 h-4 mr-2" /> Sign in with Google
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{user.user_metadata?.full_name || user.email}</span>
              </p>

              {mySubmission && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Submitted
                  </div>
                  <div className="space-y-1">
                    {(mySubmission.files || []).map((f) => (
                      <div key={f.filename} className="flex items-center gap-1.5 text-xs text-emerald-800">
                        <FileCode2 className="w-3 h-3" /> {f.filename}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-600">
                    Captured {new Date(mySubmission.gist_captured_at).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium block">
                  {mySubmission ? "Resubmit with a different gist URL" : "Your Gist URL"}
                </label>
                <Input
                  placeholder="https://gist.github.com/yourname/abc123..."
                  value={gistUrl}
                  onChange={(e) => setGistUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={handleSubmit} disabled={submitting || !gistUrl.trim()} className="w-full" size="lg">
                {submitting ? "Submitting..." : mySubmission ? "Resubmit" : "Submit"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Use a secret (not public) gist. Resubmitting overwrites your previous submission.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
