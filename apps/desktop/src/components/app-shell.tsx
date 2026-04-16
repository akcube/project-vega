import { ContextSidebar } from "@/components/context-sidebar";
import { ProjectRail } from "@/components/project-rail";
import { TaskRail } from "@/components/task-rail";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useTaskStore } from "@/stores/task-store";

export function AppShell() {
  const workspace = useTaskStore((state) => state.workspace);

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(34,49,37,0.18)_0%,rgba(12,14,13,0)_18%,rgba(12,14,13,0.08)_100%)]" />

      <div className="relative grid h-full grid-cols-[88px_280px_minmax(0,1fr)_340px]">
        <ProjectRail />
        <TaskRail />
        <WorkspaceShell workspace={workspace} />
        <ContextSidebar workspace={workspace} />
      </div>
    </div>
  );
}
