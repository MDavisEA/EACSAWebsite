import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function TeachersPanel() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setTeachers(await base44.entities.Teacher.list());
    } catch (e) {
      setError(e.message || "Couldn't load the teacher list.");
    } finally {
      setLoading(false);
    }
  };

  const invite = async () => {
    setSending(true);
    setError("");
    setSent(null);
    try {
      // The invite link has to come back to this same site, so the redirect is
      // built from wherever the dashboard is actually being used.
      const result = await base44.entities.Teacher.invite({
        email: email.trim(),
        display_name: name.trim(),
        redirect_to: `${window.location.origin}/set-password`,
      });
      setSent(result);
      setEmail("");
      setName("");
      load();
    } catch (e) {
      setError(e.message || "Couldn't send that invite.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Invite a teacher</h3>
            <p className="text-sm text-muted-foreground">
              They get an email and choose their own password — you never see it. Their courses,
              assignments and students stay entirely separate from yours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">School email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="colleague@episcopalacademy.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Name (optional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How their name should show up here"
                onKeyDown={(e) => e.key === "Enter" && email.trim() && invite()}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {sent && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {sent.note
                  ? sent.note
                  : `Invite sent to ${sent.email}. They can sign in once they follow the link and set a password.`}
              </span>
            </div>
          )}

          <Button onClick={invite} disabled={sending || !email.trim()}>
            {sending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending...</>
            ) : (
              <><UserPlus className="w-4 h-4 mr-1.5" /> Send invite</>
            )}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Teachers on this site</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            {teachers.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-white border rounded-xl p-4">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.display_name || t.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                </div>
                {t.is_you && <Badge variant="outline">You</Badge>}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Removing a teacher is deliberately not here — their courses and their students&rsquo; work
          would be left without an owner. Ask me if you ever need someone taken off.
        </p>
      </div>
    </div>
  );
}
