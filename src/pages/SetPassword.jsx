import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, CheckCircle2 } from "lucide-react";

// Where an invite email lands. Supabase puts a session in the URL fragment and
// supabase-js picks it up on load, so by the time this renders the invited
// teacher is already signed in - they just have no password yet. Setting one
// is the whole job of this page.
export default function SetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data?.session);
      setChecking(false);
    })();
  }, []);

  const handleSave = async () => {
    if (password.length < 8) {
      setError("Please use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message || "Could not set that password. Try the link in your email again.");
      return;
    }
    setDone(true);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-5">
            {done ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            ) : (
              <KeyRound className="w-7 h-7 text-slate-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {done ? "You're all set" : "Choose a password"}
          </h1>
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          {done ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your password is saved. You can sign in at the teacher page from now on.
              </p>
              <Button className="w-full" onClick={() => navigate("/teacher")}>
                Go to the teacher dashboard
              </Button>
            </>
          ) : !hasSession ? (
            <p className="text-sm text-muted-foreground">
              This page needs to be opened from the link in your invite email. If that link has
              expired, ask to be invited again.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">New password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Type it again</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save password"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
