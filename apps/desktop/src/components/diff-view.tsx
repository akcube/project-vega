interface DiffViewProps {
  path: string;
  oldText: string | null;
  newText: string;
}

export function DiffView({ path, oldText, newText }: DiffViewProps) {
  const oldLines = oldText?.split("\n") ?? [];
  const newLines = (newText ?? "").split("\n");

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border/20 bg-muted/20 font-mono text-[11px]">
      <div className="flex items-center gap-2 border-b border-border/20 px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-chart-3" />
        <span className="truncate text-muted-foreground">{path}</span>
      </div>
      <div className="max-h-80 overflow-x-auto overflow-y-auto">
        {oldText !== null &&
          oldLines.map((line, i) => (
            <div key={`old-${i}`} className="whitespace-pre bg-destructive/[0.06] px-3 py-0.5 text-destructive/80">
              <span className="mr-2 select-none text-muted-foreground/30">-</span>
              {line}
            </div>
          ))}
        {newLines.map((line, i) => (
          <div key={`new-${i}`} className="whitespace-pre bg-chart-2/[0.06] px-3 py-0.5 text-chart-2/80">
            <span className="mr-2 select-none text-muted-foreground/30">+</span>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
