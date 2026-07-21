import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GraduationCap, BookOpen, Lock, Star } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

// The old version of this page checked a plaintext passcode ("apcsa2024")
// that lived directly in the shipped JavaScript - anyone could read it from
// the browser's dev tools or the built bundle. This now does a real login
// against Supabase Auth, so there's nothing secret sitting in the client.

export default function Landing() {
  const navigate = useNavigate();
  const [showPasscode, setShowPasscode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleTeacherAccess = async () => {
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("Incorrect email or password. Please try again.");
      return;
    }
    navigate("/teacher");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
            AP CSA Practice
          </h1>
          <p className="text-muted-foreground text-lg">
            Free Response Question Practice Environment
          </p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => navigate("/student")}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:shadow-lg hover:border-primary/30"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">I'm a Student</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Enter an assignment code to start practicing
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowPasscode(true)}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:shadow-lg hover:border-primary/30"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                <Lock className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">I'm a Teacher</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Create and manage FRQ assignments
                </p>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={() => navigate("/my-score")}
          className="w-full mt-3 group relative overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:shadow-lg hover:border-amber-300"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <Star className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Check My Score</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Enter your access code to view your graded score
              </p>
            </div>
          </div>
        </button>

        <p className="text-center text-xs text-muted-foreground mt-8">
          AP® Computer Science A — Free Response Practice
        </p>
      </div>

      <Dialog open={showPasscode} onOpenChange={setShowPasscode}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Teacher Access</DialogTitle>
            <DialogDescription>Log in with your teacher account to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              autoFocus
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherAccess()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleTeacherAccess} className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}