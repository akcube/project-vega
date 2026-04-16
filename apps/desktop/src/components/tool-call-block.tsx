import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText, Pencil, Search, Terminal, Trash2, Move, Brain, Globe, Wrench } from "lucide-react";
import { DiffView } from "./diff-view";
import type { ToolCallState } from "@/lib/types";

const kindIcons: Record<string, ReactNode> = {
  read: <FileText className="h-3.5 w-3.5" />,
  edit: <Pencil className="h-3.5 w-3.5" />,
  search: <Search className="h-3.5 w-3.5" />,
  execute: <Terminal className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  move: <Move className="h-3.5 w-3.5" />,
  think: <Brain className="h-3.5 w-3.5" />,
  fetch: <Globe className="h-3.5 w-3.5" />,
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "secondary",
  completed: "default",
  failed: "destructive",
};

export function ToolCallBlock({ toolCall }: { toolCall: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const icon = kindIcons[toolCall.kind] ?? <Wrench className="h-3.5 w-3.5" />;
  const hasContent = toolCall.content.length > 0;
  const active = toolCall.status === "in_progress";

  if (!hasContent) {
    return (
      <div className={`my-2 flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground ${active ? "live-pane" : "bg-white/[0.02]"}`}>
        {icon}
        <span className="truncate flex-1">{toolCall.title || toolCall.kind}</span>
        <Badge variant={statusVariant[toolCall.status] ?? "outline"} className="rounded-md text-[10px] px-1.5 py-0">
          {toolCall.status}
        </Badge>
      </div>
    );
  }

  return (
    <div className={`my-2 rounded-md border border-border/60 bg-white/[0.02] px-3 py-2 ${active ? "live-pane" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {icon}
        <span className="truncate flex-1">{toolCall.title || toolCall.kind}</span>
        <Badge variant={statusVariant[toolCall.status] ?? "outline"} className="rounded-md text-[10px] px-1.5 py-0">
          {toolCall.status}
        </Badge>
      </button>
      {open && (
        <div className="mt-2 pl-6">
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
                className="my-1 max-h-60 overflow-y-auto rounded-md border border-border/60 bg-black/20 p-2 text-xs text-muted-foreground prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
