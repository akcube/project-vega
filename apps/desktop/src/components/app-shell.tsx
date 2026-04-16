import { Activity, KanbanSquare, Sparkles } from "lucide-react";

import { ActiveWorkspacesScreen } from "@/components/active-workspaces-screen";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectsScreen } from "@/components/projects-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/task-store";

export function AppShell() {
  const mode = useTaskStore((state) => state.mode);
  const setMode = useTaskStore((state) => state.setMode);
  const projects = useTaskStore((state) => state.projects);
  const activeWorkspaces = useTaskStore((state) => state.activeWorkspaces);
  const isBootstrapping = useTaskStore((state) => state.isBootstrapping);

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(97,175,239,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#11161d_0%,#0f1319_100%)]" />

      <div className="relative flex h-full min-h-0 flex-col">
        <header className="border-b border-border/70 bg-[#151a22]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-100">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Vega
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    Agent Monitor
                  </div>
                </div>
              </div>

              <nav className="flex items-center gap-1 rounded-md border border-border/60 bg-white/[0.03] p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "projects" ? "default" : "ghost"}
                  className={cn(
                    "rounded-md",
                    mode === "projects" && "live-pane",
                  )}
                  onClick={() => setMode("projects")}
                >
                  <KanbanSquare className="h-3.5 w-3.5" />
                  Projects
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "workspaces" ? "default" : "ghost"}
                  className={cn(
                    "rounded-md",
                    mode === "workspaces" && "live-pane",
                  )}
                  onClick={() => setMode("workspaces")}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Active Workspaces
                </Button>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-md border-border/60 bg-white/[0.03] px-2.5"
              >
                {projects.length} projects
              </Badge>
              <Badge
                variant="outline"
                className="rounded-md border-border/60 bg-white/[0.03] px-2.5"
              >
                {activeWorkspaces.length} workspaces
              </Badge>
              <NewProjectDialog />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1">
          {isBootstrapping ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-3 rounded-md border border-border/60 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                Loading workspace state
              </div>
            </div>
          ) : mode === "projects" ? (
            <ProjectsScreen />
          ) : (
            <ActiveWorkspacesScreen />
          )}
        </main>
      </div>
    </div>
  );
}
