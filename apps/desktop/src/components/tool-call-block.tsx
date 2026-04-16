import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText, Pencil, Search, Terminal, Trash2, Move, Brain, Globe, Wrench } from "lucide-react";
import { DiffView } from "./diff-view";
import { cn } from "@/lib/utils";
import type { ToolCallState } from "@/lib/types";

const kindIcons: Record<string, ReactNode> = {
  read: <FileText className="h-3 w-3" />,
  edit: <Pencil className="h-3 w-3" />,
  search: <Search className="h-3 w-3" />,
  execute: <Terminal className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
  move: <Move className="h-3 w-3" />,
  think: <Brain className="h-3 w-3" />,
  fetch: <Globe className="h-3 w-3" />,
};

const statusColors: Record<string, string> = {
  pending: "text-muted-foreground bg-muted/40 ring-border/20",
  in_progress: "text-chart-3 bg-chart-3/10 ring-chart-3/20",
  completed: "text-chart-2 bg-chart-2/10 ring-chart-2/20",
  failed: "text-destructive bg-destructive/10 ring-destructive/20",
};

export function ToolCallBlock({ toolCall }: { toolCall: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const icon = kindIcons[toolCall.kind] ?? <Wrench className="h-3 w-3" />;
  const hasContent = toolCall.content.length > 0;
  const active = toolCall.status === "in_progress";

  const statusPill = (
    <span className={cn(
      "rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1",
      statusColors[toolCall.status] ?? statusColors.pending,
    )}>
      {toolCall.status === "in_progress" ? "running" : toolCall.status}
    </span>
  );

  if (!hasContent) {
    return (
      <div className={cn(
        "my-1.5 flex items-center gap-2 rounded-lg border border-border/20 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground",
        active && "live-pane border-chart-3/15",
      )}>
        {icon}
        <span className="truncate flex-1 font-medium">{toolCall.title || toolCall.kind}</span>
        {statusPill}
      </div>
    );
  }

  return (
    <div className={cn(
      "my-1.5 rounded-lg border border-border/20 bg-muted/20",
      active && "live-pane border-chart-3/15",
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform duration-150", open && "rotate-90")}
        />
        {icon}
        <span className="truncate flex-1 font-medium">{toolCall.title || toolCall.kind}</span>
        {statusPill}
      </button>
      {open && (
        <div className="border-t border-border/15 px-3 py-2 pl-8">
          {toolCall.content.map((item, i) => {
            if (item.type === "diff") {
              return (
                <DiffView
                  key={i}
                  path={item.path}
                  oldText={item.oldText}
                  newText={item.newText}
                />
              );
            }
            return (
              <div
                key={i}
                className="my-1 max-h-60 overflow-y-auto rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground ring-1 ring-border/15 prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.text}
                </ReactMarkdown>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
