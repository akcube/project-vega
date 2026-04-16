import { AgentView } from "@/components/agent-view";
import { ReviewView } from "@/components/review-view";
import { RunView } from "@/components/run-view";
import type { TaskView, TaskWorkspaceViewModel } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

const VIEWS: { id: TaskView; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "review", label: "Review" },
  { id: "run", label: "Run" },
];

function WorkspaceEmptyState() {
  return (
    <div className="relative flex h-full items-end overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1600&q=80"
        alt="Developer workspace"
        className="absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,13,10,0.16)_0%,rgba(9,13,10,0.88)_55%,rgba(9,13,10,1)_100%)]" />
      <div className="relative z-10 max-w-2xl px-10 py-12">
        <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">Vega workspace</div>
        <h2 className="mt-4 text-4xl font-semibold leading-tight text-foreground">
          Pick a task and step straight into the run.
        </h2>
        <p className="mt-4 max-w-xl text-sm text-foreground/72">
          Projects group repos and docs. Tasks hold the worktree. Each workspace keeps the live lane, the review surface, and the run context in one place.
        </p>
      </div>
    </div>
  );
}

export function WorkspaceShell({
  workspace,
}: {
  workspace: TaskWorkspaceViewModel | null;
}) {
  const setView = useTaskStore((state) => state.setView);
  const isStreaming = useTaskStore((state) => state.isStreaming);

  if (!workspace) {
    return <main className="min-h-0 bg-black/8"><WorkspaceEmptyState /></main>;
  }

  return (
    <main className="grid min-h-0 grid-rows-[auto_1fr] bg-black/8">
      <header className="border-b border-border/60 px-7 py-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {workspace.project.name}
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold">{workspace.task.title}</h1>
            <p className="mt-2 truncate text-sm text-muted-foreground">
              {workspace.project.description || "Operational workspace for the selected task."}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-white/[0.03] p-1">
            {VIEWS.map((view) => {
              const active = workspace.task.lastOpenView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => void setView(view.id)}
                  className={`relative rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && <span className="absolute inset-0 rounded-md bg-emerald-300/[0.08]" />}
                  {active && <span className="absolute inset-x-2 bottom-0 h-px bg-emerald-300 shadow-[0_0_20px_rgba(74,222,128,0.55)]" />}
                  <span className="relative">{view.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="min-h-0">
        {workspace.task.lastOpenView === "agent" && (
          <AgentView snapshot={workspace.snapshot} isStreaming={isStreaming} />
        )}
        {workspace.task.lastOpenView === "review" && (
          <ReviewView review={workspace.review} />
        )}
        {workspace.task.lastOpenView === "run" && (
          <RunView task={workspace.task} run={workspace.run} resources={workspace.resources} />
        )}
      </div>
    </main>
  );
}
