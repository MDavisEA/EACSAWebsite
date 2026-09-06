import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, Layers, ChevronRight, Archive, ChevronDown, ChevronUp } from "lucide-react";

function CourseTile({ c, n, onOpen, archived }) {
  return (
    <Card
      onClick={() => onOpen(c.id)}
      className={`cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group ${
        archived ? "opacity-60" : ""
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
              {c.name}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                {(c.units || []).length} unit{(c.units || []).length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {c.student_count ?? 0} student{(c.student_count ?? 0) !== 1 ? "s" : ""}
              </span>
              <span>
                {n} item{n !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// The landing screen: your classes, the way Canvas opens on course cards.
// Clicking one navigates into it rather than switching a filter, so the
// browser's back button means what a teacher expects it to mean.
//
// Archived classes are split into their own collapsed section rather than
// filtered out entirely - archiving hides a finished class from the list
// that matters day to day without pretending it does not exist. Same
// collapse-with-a-count pattern as "Reviewed" on the student dashboard.
export default function TeacherHome({ courses, counts, onOpen, onNewCourse }) {
  const [showArchived, setShowArchived] = useState(false);
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);

  if (courses.length === 0) {
    return (
      <div className="text-center py-20">
        <Layers className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">No classes yet</h2>
        <p className="text-muted-foreground mb-6">
          Everything lives inside a class — start by making one.
        </p>
        <Button onClick={onNewCourse}>
          <Plus className="w-4 h-4 mr-1.5" /> New Class
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">My Classes</h1>
          <Button onClick={onNewCourse}>
            <Plus className="w-4 h-4 mr-1.5" /> New Class
          </Button>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Every class is archived right now — open one below to bring it back.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((c) => (
              <CourseTile key={c.id} c={c} n={counts[c.id] || 0} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="w-full flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors border-t pt-4"
          >
            <Archive className="w-4 h-4" />
            <span className="font-semibold uppercase tracking-wide text-xs">Archived</span>
            <span className="text-xs border rounded-full px-1.5">{archived.length}</span>
            <span className="ml-auto">
              {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              {archived.map((c) => (
                <CourseTile key={c.id} c={c} n={counts[c.id] || 0} onOpen={onOpen} archived />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
