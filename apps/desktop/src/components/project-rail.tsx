import { FolderCode, Sparkles } from "lucide-react";

import { NewProjectDialog } from "@/components/new-project-dialog";
import { useTaskStore } from "@/stores/task-store";

function projectMonogram(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProjectRail() {
  const { projects, selectedProjectId, selectProject } = useTaskStore();

  return (
    <aside className="flex h-full flex-col items-center gap-4 border-r border-border/60 bg-black/16 px-4 py-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/8 text-emerald-200 shadow-[0_0_24px_rgba(74,222,128,0.14)]">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vega</div>
        <div className="mt-1 text-xs text-foreground/70">Projects</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {projects.map((project) => {
          const active = project.id === selectedProjectId;
          return (
            <button
              key={project.id}
              onClick={() => void selectProject(project.id)}
              className={`group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border text-sm font-semibold transition-all ${
                active
                  ? "border-emerald-300/45 bg-emerald-300/10 text-emerald-50 shadow-[0_0_32px_rgba(74,222,128,0.18)]"
                  : "border-border/60 bg-white/[0.02] text-foreground/75 hover:border-foreground/18 hover:bg-white/[0.05]"
              }`}
              title={project.name}
            >
              {active && <span className="absolute inset-0 shimmer-overlay opacity-80" />}
              <span className="relative">{projectMonogram(project.name || "P") || <FolderCode className="h-4 w-4" />}</span>
            </button>
          );
        })}
      </div>

      <NewProjectDialog />
    </aside>
  );
}
