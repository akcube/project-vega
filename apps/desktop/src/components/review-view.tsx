import { GitReplayPanel } from "@/components/git-replay-panel";
import type { TaskWorkspaceViewModel } from "@/lib/types";

export function ReviewView({ workspace }: { workspace: TaskWorkspaceViewModel }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <GitReplayPanel workspace={workspace} />
    </div>
  );
}
