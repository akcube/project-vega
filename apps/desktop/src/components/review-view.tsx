import { DiffView } from "@/components/diff-view";
import { ToolCallBlock } from "@/components/tool-call-block";
import type { ReviewSummary } from "@/lib/types";

export function ReviewView({ review }: { review: ReviewSummary }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] divide-x divide-border/30">
      <section className="min-h-0 overflow-y-auto px-5 py-4">
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-foreground">File changes</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Diffs from the current run</p>
        </div>

        {review.diffs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No file diffs yet.</p>
        ) : (
          <div className="space-y-3">
            {review.diffs.map((diff, index) => (
              <DiffView
                key={`${diff.path}-${index}`}
                path={diff.path}
                oldText={diff.oldText}
                newText={diff.newText}
              />
            ))}
          </div>
        )}
      </section>

      <section className="min-h-0 overflow-y-auto px-4 py-4">
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-foreground">Tool trace</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Activity log</p>
        </div>

        {review.toolCalls.length === 0 ? (
          <p className="text-xs text-muted-foreground">Tool output will appear here.</p>
        ) : (
          <div className="space-y-2">
            {review.toolCalls.map((toolCall) => (
              <ToolCallBlock key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
