import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, Layers, ChevronRight } from "lucide-react";

// The landing screen: your classes, the way Canvas opens on course cards.
// Clicking one navigates into it rather than switching a filter, so the
// browser's back button means what a teacher expects it to mean.
export default function TeacherHome({ courses, counts, onOpen, onNewCourse }) {
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">My Classes</h1>
        <Button onClick={onNewCourse}>
          <Plus className="w-4 h-4 mr-1.5" /> New Class
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((c) => {
          const n = counts[c.id] || 0;
          return (
            <Card
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
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
        })}
      </div>
    </div>
  );
}
