interface DiffViewProps {
  path: string;
  oldText: string | null;
  newText: string;
}

export function DiffView({ path, oldText, newText }: DiffViewProps) {
  const oldLines = oldText?.split("\n") ?? [];
  const newLines = (newText ?? "").split("\n");

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border/60 bg-white/[0.02] text-xs font-mono">
      <div className="truncate border-b border-border/60 px-3 py-2 text-muted-foreground">
        {path}
      </div>
      <div className="max-h-80 overflow-x-auto overflow-y-auto">
        {oldText !== null &&
          oldLines.map((line, i) => (
            <div key={`old-${i}`} className="whitespace-pre bg-rose-400/[0.08] px-3 py-1 text-rose-200">
              <span className="mr-2 select-none text-muted-foreground/50">-</span>
              {line}
            </div>
          ))}
        {newLines.map((line, i) => (
          <div key={`new-${i}`} className="whitespace-pre bg-emerald-400/[0.08] px-3 py-1 text-emerald-200">
            <span className="mr-2 select-none text-muted-foreground/50">+</span>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
