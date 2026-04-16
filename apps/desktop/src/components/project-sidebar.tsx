import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewProjectDialog } from "@/components/new-project-dialog";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export function ProjectSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleteProject,
}: ProjectSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 w-[240px] flex-col border-r border-border/40 bg-card">
      <div className="border-b border-border/40 px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">Projects</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            Create a project to start.
          </div>
        ) : (
          <div className="space-y-0.5">
            {projects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <div key={project.id} className="group">
                  <button
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {/* Project dot indicator */}
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition-colors",
                        active ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{project.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{project.brief}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-md border-border/30 text-[10px] px-1.5 py-0 opacity-0 transition-opacity group-hover:opacity-100",
                        active && "opacity-100",
                      )}
                    >
                      {project.lifecycleState}
                    </Badge>
                  </button>
                  {active && (
                    <div className="slide-in flex justify-end px-2 pb-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteProject(project.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Discord-style "add" button at bottom */}
      <div className="border-t border-border/40 p-2">
        <NewProjectDialog />
      </div>
    </aside>
  );
}
