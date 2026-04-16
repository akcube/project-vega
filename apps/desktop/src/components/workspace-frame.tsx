import { AgentView } from "@/components/agent-view";
import { ReviewView } from "@/components/review-view";
import { TerminalPane } from "@/components/terminal-pane";
import { WorkspaceViewRail } from "@/components/workspace-view-rail";
import { Badge } from "@/components/ui/badge";
import type { TaskWorkspaceViewModel, WorkspaceView } from "@/lib/types";
import { WORKSPACE_VIEWS } from "@/lib/task-ui";
import { cn } from "@/lib/utils";

interface WorkspaceFrameProps {
  workspace: TaskWorkspaceViewModel;
  onViewChange: (taskId: string, view: WorkspaceView) => void;
}

export function WorkspaceFrame({ workspace, onViewChange }: WorkspaceFrameProps) {
  return (
    <section className="flex h-full min-h-0 flex-1 bg-[#13171c]">
      <WorkspaceViewRail
        value={workspace.workspace.selectedView}
        onChange={(view) => onViewChange(workspace.task.id, view)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workspace</div>
              <div className="mt-2 truncate text-lg font-semibold text-foreground">{workspace.task.title}</div>
            </div>
            <div className="flex items-center gap-2">
              {WORKSPACE_VIEWS.map((view) => (
                <Badge
                  key={view.id}
                  variant="outline"
                  className={cn(
                    "rounded-md border-border/60 bg-white/[0.03]",
                    workspace.workspace.selectedView === view.id &&
                      "border-emerald-400/30 bg-emerald-400/[0.08] text-foreground",
                  )}
                >
                  {view.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {workspace.workspace.selectedView === "agent" ? (
            <AgentView snapshot={workspace.snapshot} isStreaming={workspace.live.isStreaming} />
          ) : null}
          {workspace.workspace.selectedView === "terminal" ? (
            <TerminalPane key={workspace.task.id} workspace={workspace} />
          ) : null}
          {workspace.workspace.selectedView === "review" ? (
            <ReviewView review={workspace.review} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
