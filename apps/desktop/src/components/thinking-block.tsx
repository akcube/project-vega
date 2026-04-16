import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1.5 rounded-lg border border-chart-4/15 bg-chart-4/[0.04] px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] text-chart-4/70 transition-colors hover:text-chart-4"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform duration-150", open && "rotate-90")}
        />
        <Brain className="h-3 w-3" />
        <span className="font-medium">Thinking</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground ring-1 ring-border/20">
          {text}
        </pre>
      )}
    </div>
  );
}
