import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-2 rounded-md border border-border/60 bg-white/[0.025] px-3 py-2 live-pane">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Brain className="h-3 w-3" />
        <span>Thinking</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-black/20 p-3 font-mono text-xs text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}
