import { Badge } from "@/components/ui/badge";
import type { ProjectResource, RunViewModel, Task } from "@/lib/types";

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="border-b border-border/50 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm text-foreground">{value || "Not captured yet"}</div>
    </div>
  );
}

export function RunView({
  task,
  run,
  resources,
}: {
  task: Task;
  run: RunViewModel | null;
  resources: ProjectResource[];
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)] divide-x divide-border/60">
      <section className="px-7 py-6">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Task runtime</div>
        <h2 className="mt-2 text-lg font-semibold">{task.title}</h2>

        <div className="mt-6 space-y-1">
          <MetaRow label="Worktree" value={task.worktreePath} />
          <MetaRow label="Provider" value={`${task.provider} • ${task.model}`} />
          <MetaRow label="Permission policy" value={task.permissionPolicy} />
          <MetaRow label="Run status" value={run?.run.status ?? task.status} />
          <MetaRow label="Session reference" value={run?.sessionReference} />
          <MetaRow label="Provider logs" value={run?.logReference} />
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto px-7 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Project resources</div>
            <h2 className="mt-2 text-lg font-semibold">Attached context</h2>
          </div>
          <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
            {resources.length} attached
          </Badge>
        </div>

        {resources.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Add repo or doc resources from the sidebar to give this task more project context.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {resources.map((resource) => (
              <div key={resource.id} className="rounded-md border border-border/60 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium">{resource.label}</div>
                  <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                    {resource.kind}
                  </Badge>
                </div>
                <div className="mt-2 break-all text-xs text-muted-foreground">{resource.locator}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
