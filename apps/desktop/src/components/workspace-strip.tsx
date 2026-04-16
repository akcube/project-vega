import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkspaceSummaryViewModel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { stateLabel } from "@/lib/task-ui";

interface WorkspaceStripProps {
  workspaces: WorkspaceSummaryViewModel[];
  selectedWorkspaceTaskId: string | null;
  onSelectWorkspace: (taskId: string) => void;
  onCloseWorkspace: (taskId: string) => void;
}

export function WorkspaceStrip({
  workspaces,
  selectedWorkspaceTaskId,
  onSelectWorkspace,
  onCloseWorkspace,
}: WorkspaceStripProps) {
  return (
    <div className="border-b border-border/60 bg-[#171b21] px-4 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {workspaces.length === 0 ? (
          <div className="px-2 py-1 text-sm text-muted-foreground">
            No workspaces are open yet.
          </div>
        ) : (
          workspaces.map((workspace) => {
            const active = workspace.taskId === selectedWorkspaceTaskId;
            return (
              <div
                key={workspace.taskId}
                className={cn(
                  "flex min-w-[220px] items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                  active
                    ? "border-emerald-400/35 bg-emerald-400/[0.08]"
                    : "border-border/60 bg-white/[0.03] hover:bg-white/[0.05]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectWorkspace(workspace.taskId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{workspace.taskTitle}</div>
                    <div className="truncate text-xs text-muted-foreground">{workspace.projectName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
                      {stateLabel(workspace.workflowState)}
                    </Badge>
                    {workspace.isStreaming ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                    ) : null}
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-1 text-muted-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseWorkspace(workspace.taskId);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
