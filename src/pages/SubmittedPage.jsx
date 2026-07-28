import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGoogleSession } from "@/lib/useGoogleSession";
import { CheckCircle } from "lucide-react";

export default function SubmittedPage() {
  const navigate = useNavigate();
  const { user } = useGoogleSession();
  const studentName = user?.user_metadata?.full_name || user?.email || "Student";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Assignment Submitted
        </h1>
        <p className="text-muted-foreground text-lg mb-2">
          Great work, {studentName}!
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Your responses have been recorded. You may close this window.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Return to Home
        </Button>
      </div>
    </div>
  );
}