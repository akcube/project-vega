import { X } from "lucide-react";

import type { WorkspaceSummaryViewModel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface WorkspaceStripProps {
  workspaces: WorkspaceSummaryViewModel[];
  selectedWorkspaceTaskId: string | null;
  onSelectWorkspace: (taskId: string) => void;
  onCloseWorkspace: (taskId: string) => void;
}

const stateColor: Record<string, string> = {
  todo: "bg-[#5c6370]",
  in_progress: "bg-[#98c379]",
  blocked: "bg-[#e5c07b]",
  completed: "bg-[#56b6c2]",
};

export function WorkspaceStrip({
  workspaces,
  selectedWorkspaceTaskId,
  onSelectWorkspace,
  onCloseWorkspace,
}: WorkspaceStripProps) {
  if (workspaces.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-border/40 bg-card px-3">
        <span className="text-[11px] text-muted-foreground">No open workspaces</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center justify-center gap-0.5 border-b border-border/40 bg-card px-2 overflow-x-auto">
      {workspaces.map((workspace) => {
        const active = workspace.taskId === selectedWorkspaceTaskId;
        return (
          <Tooltip key={workspace.taskId}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelectWorkspace(workspace.taskId)}
                className={cn(
                  "group relative flex items-center gap-2 rounded-md px-2.5 py-1 text-xs transition-all duration-150",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground/80",
                )}
              >
                {/* State dot */}
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0 transition-all",
                    stateColor[workspace.workflowState] ?? "bg-[#5c6370]",
                    workspace.isStreaming && "dot-pulse shadow-[0_0_6px_rgba(152,195,121,0.5)]",
                  )}
                />
                <span className="max-w-[140px] truncate font-medium">{workspace.taskTitle}</span>
                {/* Close button */}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseWorkspace(workspace.taskId);
                  }}
                  className={cn(
                    "ml-0.5 flex h-4 w-4 items-center justify-center rounded-sm transition-colors",
                    active
                      ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="font-medium">{workspace.taskTitle}</div>
              <div className="text-muted-foreground">{workspace.projectName}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
