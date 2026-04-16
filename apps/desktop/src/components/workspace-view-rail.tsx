import type { ReactNode } from "react";
import { Bot, TerminalSquare, DraftingCompass } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkspaceView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WORKSPACE_VIEWS } from "@/lib/task-ui";

const viewIcons: Record<WorkspaceView, ReactNode> = {
  agent: <Bot className="h-4 w-4" />,
  terminal: <TerminalSquare className="h-4 w-4" />,
  review: <DraftingCompass className="h-4 w-4" />,
};

interface WorkspaceViewRailProps {
  value: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}

export function WorkspaceViewRail({ value, onChange }: WorkspaceViewRailProps) {
  return (
    <div className="flex h-full w-11 flex-col items-center gap-1 border-r border-border/40 bg-card py-2">
      {WORKSPACE_VIEWS.map((view) => {
        const active = view.id === value;
        return (
          <Tooltip key={view.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(view.id)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150",
                  active
                    ? "bg-primary/15 text-primary glow-ring-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {viewIcons[view.id]}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {view.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
