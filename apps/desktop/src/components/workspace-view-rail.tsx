import type { ReactNode } from "react";
import { Bot, TerminalSquare, DraftingCompass } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <div className="flex h-full w-[92px] flex-col gap-2 border-r border-border/60 bg-[#171b21] p-3">
      {WORKSPACE_VIEWS.map((view) => {
        const active = view.id === value;
        return (
          <Button
            key={view.id}
            type="button"
            variant={active ? "default" : "ghost"}
            className={cn(
              "h-auto flex-col items-center gap-1 rounded-md px-2 py-3 text-xs",
              active && "live-pane",
            )}
            onClick={() => onChange(view.id)}
          >
            {viewIcons[view.id]}
            <span>{view.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
