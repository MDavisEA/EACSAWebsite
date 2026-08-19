import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, EyeOff, CheckCircle2, Code2, FileText } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { a11yDarkEditorTheme } from "@/lib/codeEditorThemes";

// Defined once at module scope, not inline in JSX - a new array reference on
// every render makes @uiw/react-codemirror tear down and rebuild the editor's
// state. Same extensions CodePracticePage.jsx gives the real editor, so this
// preview is not just "another dark box" but the identical rendering a
// student would actually see - a plain <pre> here previously showed the same
// starter code with no syntax highlighting at all.
const CODE_EXTENSIONS = [java(), ...a11yDarkEditorTheme];

// Shows a teacher what a student is actually served for a problem or an
// assignment. It deliberately re-fetches through the same code path the
// student hits rather than reusing the copy the dashboard already has in
// memory - that full copy still holds expected outputs and answer keys, so
// rendering it would show a reassuring preview that proves nothing. Fetching
// the sanitized payload means anything missing here is genuinely absent for
// students too.
export default function StudentPreviewDialog({ open, onOpenChange, kind, itemId, title }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !itemId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const result =
          kind === "code"
            ? await base44.entities.CodingProblem.previewAsStudent(itemId)
            : (await base44.entities.Assignment.filter({ id: itemId }))[0];
        if (!cancelled) setData(result ?? null);
      } catch (e) {
        if (!cancelled) setError(e.message || "Couldn't load the preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, itemId, kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "code" ? <Code2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            What students see: {title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6">{error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-6">Nothing to preview.</p>
        ) : kind === "code" ? (
          <CodePreview problem={data} />
        ) : (
          <FrqPreview assignment={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CodePreview({ problem }) {
  const allProgram = (problem.methods || []).every((m) => m.harness_type === "program_output");
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-xs">
          {problem.class_name}.{allProgram ? "main()" : "{method}()"}
        </Badge>
        <Badge variant="outline">{problem.points_possible ?? 0} pts</Badge>
        {problem.max_test_runs != null && (
          <Badge variant="outline">{problem.max_test_runs} test runs</Badge>
        )}
      </div>

      {problem.description_html && (
        <div
          className="prose prose-sm max-w-none quill-render"
          dangerouslySetInnerHTML={{ __html: problem.description_html }}
        />
      )}

      {problem.starter_code && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Starter code</p>
          <div className="rounded-lg overflow-hidden border">
            <CodeMirror
              value={problem.starter_code}
              editable={false}
              theme="none"
              extensions={CODE_EXTENSIONS}
              maxHeight="400px"
              basicSetup={{ tabSize: 4 }}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {(problem.methods || []).map((m, i) => (
          <div key={i} className="border rounded-lg p-3">
            <p className="text-sm font-medium mb-2">{m.method_name}</p>
            <div className="space-y-1">
              {(m.visible_checks || []).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />
                  {c.label}
                  <span className="text-xs">({c.points} pt{c.points === 1 ? "" : "s"})</span>
                </div>
              ))}
              {m.hidden_check_count > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <EyeOff className="w-3.5 h-3.5" />
                  {m.hidden_check_count} hidden test{m.hidden_check_count === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground border-t pt-3">
        Expected outputs and hidden-test details are absent above because the server strips them
        before sending — this is the real student payload, not a mock-up.
      </p>
    </div>
  );
}

function FrqPreview({ assignment }) {
  return (
    <div className="space-y-5">
      {assignment.directions && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{assignment.directions}</p>
      )}
      {assignment.time_limit_minutes && (
        <Badge variant="outline">{assignment.time_limit_minutes} minute limit</Badge>
      )}

      {(assignment.questions || []).map((q, i) => (
        <div key={q.id || i} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">{q.title}</p>
            <span className="text-xs text-muted-foreground">{q.max_score ?? 9} pts</span>
          </div>
          {q.prompt_html ? (
            <div
              className="prose prose-sm max-w-none quill-render"
              dangerouslySetInnerHTML={{ __html: q.prompt_html }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{q.prompt}</p>
          )}
          {(q.parts || []).map((p, pi) => (
            <div key={p.id || pi} className="border-l-2 pl-3 ml-1 mt-2">
              <p className="text-sm font-medium">{p.label || `Part ${pi + 1}`}</p>
              {p.prompt_html ? (
                <div
                  className="prose prose-sm max-w-none quill-render"
                  dangerouslySetInnerHTML={{ __html: p.prompt_html }}
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.prompt}</p>
              )}
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-muted-foreground border-t pt-3">
        Answer keys are absent above because the server strips them before sending — this is the
        real student payload, not a mock-up.
      </p>
    </div>
  );
}
