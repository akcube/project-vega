import { AddResourceDialog } from "@/components/add-resource-dialog";
import { Badge } from "@/components/ui/badge";
import type { TaskWorkspaceViewModel } from "@/lib/types";

export function ContextSidebar({
  workspace,
}: {
  workspace: TaskWorkspaceViewModel | null;
}) {
  if (!workspace) {
    return (
      <aside className="hidden h-full flex-col border-l border-border/60 bg-black/16 px-5 py-5 xl:flex">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Context</div>
        <div className="mt-4 text-sm text-muted-foreground">
          Select a task to see its worktree, project resources, and run state.
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden h-full flex-col border-l border-border/60 bg-black/16 xl:flex">
      <div className="border-b border-border/60 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Context</div>
            <h2 className="mt-2 text-lg font-semibold">Task details</h2>
          </div>
          <AddResourceDialog />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section className="border-b border-border/50 pb-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Current task</div>
          <div className="mt-3 text-base font-medium">{workspace.task.title}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
              {workspace.task.provider}
            </Badge>
            <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
              {workspace.task.model}
            </Badge>
            <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
              {workspace.task.status}
            </Badge>
          </div>
        </section>

        <section className="border-b border-border/50 py-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Worktree</div>
          <div className="mt-3 break-all text-sm text-foreground">{workspace.task.worktreePath}</div>
        </section>

        <section className="py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Project resources</div>
            <span className="text-xs text-muted-foreground">{workspace.resources.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {workspace.resources.length === 0 ? (
              <div className="text-sm text-muted-foreground">No resources attached yet.</div>
            ) : (
              workspace.resources.map((resource) => (
                <div key={resource.id} className="rounded-md border border-border/60 bg-white/[0.025] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{resource.label}</span>
                    <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                      {resource.kind}
                    </Badge>
                  </div>
                  <div className="mt-2 break-all text-xs text-muted-foreground">{resource.locator}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
