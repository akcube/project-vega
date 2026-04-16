import { DiffView } from "@/components/diff-view";
import { ToolCallBlock } from "@/components/tool-call-block";
import type { ReviewSummary } from "@/lib/types";

export function ReviewView({ review }: { review: ReviewSummary }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] divide-x divide-border/60">
      <section className="min-h-0 overflow-y-auto px-7 py-6">
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Diff focus</div>
          <h2 className="mt-2 text-lg font-semibold">Recent file changes</h2>
        </div>

        {review.diffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No file diffs have been emitted yet.</p>
        ) : (
          <div className="space-y-4">
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

      <section className="min-h-0 overflow-y-auto px-6 py-6">
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Activity</div>
          <h2 className="mt-2 text-lg font-semibold">Tool trace</h2>
        </div>

        {review.toolCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tool output will collect here as the run progresses.</p>
        ) : (
          <div className="space-y-3">
            {review.toolCalls.map((toolCall) => (
              <ToolCallBlock key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
