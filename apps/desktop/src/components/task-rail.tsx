import { Badge } from "@/components/ui/badge";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { useTaskStore } from "@/stores/task-store";

export function TaskRail() {
  const {
    projects,
    selectedProjectId,
    tasks,
    selectedTaskId,
    selectTask,
  } = useTaskStore();

  const project = projects.find((entry) => entry.id === selectedProjectId) ?? null;

  return (
    <aside className="flex h-full flex-col border-r border-border/60 bg-white/[0.02]">
      <div className="border-b border-border/60 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Selected project</div>
            <h1 className="mt-2 truncate text-xl font-semibold text-foreground">
              {project?.name ?? "No project yet"}
            </h1>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {project?.description || "Create a project to group repos, docs, and active agent work."}
            </p>
          </div>
          <NewTaskDialog />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tasks.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            No tasks yet.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const active = task.id === selectedTaskId;
              return (
                <button
                  key={task.id}
                  onClick={() => void selectTask(task.id)}
                  className={`group w-full rounded-md border px-3 py-3 text-left transition-all ${
                    active
                      ? "border-emerald-300/35 bg-emerald-300/[0.08] shadow-[0_0_30px_rgba(74,222,128,0.08)]"
                      : "border-transparent bg-white/[0.02] hover:border-border/70 hover:bg-white/[0.045]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-foreground">{task.title}</span>
                    <Badge variant="outline" className="rounded-md border-border/70 bg-black/10 px-1.5 py-0 text-[10px]">
                      {task.provider}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{task.model}</span>
                    <span className={task.status === "running" ? "text-emerald-200" : ""}>
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
