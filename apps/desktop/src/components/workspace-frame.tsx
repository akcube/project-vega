import { AgentView } from "@/components/agent-view";
import { ReviewView } from "@/components/review-view";
import { TerminalPane } from "@/components/terminal-pane";
import { WorkspaceViewRail } from "@/components/workspace-view-rail";
import type { TaskWorkspaceViewModel, WorkspaceView } from "@/lib/types";

interface WorkspaceFrameProps {
  workspace: TaskWorkspaceViewModel;
  onViewChange: (taskId: string, view: WorkspaceView) => void;
}

export function WorkspaceFrame({ workspace, onViewChange }: WorkspaceFrameProps) {
  return (
    <section className="flex h-full min-h-0 flex-1 bg-background">
      <WorkspaceViewRail
        value={workspace.workspace.selectedView}
        onChange={(view) => onViewChange(workspace.task.id, view)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {workspace.workspace.selectedView === "agent" ? (
            <AgentView snapshot={workspace.snapshot} isStreaming={workspace.live.isStreaming} />
          ) : null}
          {workspace.workspace.selectedView === "terminal" ? (
            <TerminalPane key={workspace.task.id} workspace={workspace} />
          ) : null}
          {workspace.workspace.selectedView === "review" ? (
            <ReviewView workspace={workspace} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
