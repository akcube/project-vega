import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <aside className="flex h-full min-h-0 w-[300px] flex-col border-r border-border/60 bg-[#171b21]">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Projects</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Active projects and their plans.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {projects.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            Create a project to start organizing tasks.
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <div
                  key={project.id}
                  className={cn(
                    "group rounded-md border px-3 py-3 transition-colors",
                    active
                      ? "border-emerald-400/30 bg-emerald-400/[0.08]"
                      : "border-border/60 bg-white/[0.03] hover:bg-white/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className="flex w-full flex-col items-start gap-2 text-left"
                  >
                    <div className="flex w-full items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{project.brief}</div>
                      </div>
                      <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
                        {project.lifecycleState}
                      </Badge>
                    </div>
                    <div className="w-full text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {active ? "Selected" : "Open project"}
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onDeleteProject(project.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
