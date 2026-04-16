import { GitReplayPanel } from "@/components/git-replay-panel";
import { ToolCallBlock } from "@/components/tool-call-block";
import type { TaskWorkspaceViewModel } from "@/lib/types";

export function ReviewView({ workspace }: { workspace: TaskWorkspaceViewModel }) {
  const review = workspace.review;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(280px,0.45fr)] divide-x divide-border/60">
      <section className="min-h-0 overflow-hidden">
        <GitReplayPanel workspace={workspace} />
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
