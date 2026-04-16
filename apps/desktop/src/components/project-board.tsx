import { ChevronRight, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectBoardViewModel, TaskBoardCardViewModel, WorkflowState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { stateLabel, WORKFLOW_STATES, WORKFLOW_STATE_META } from "@/lib/task-ui";
import { NewTaskDialog } from "@/components/new-task-dialog";

interface ProjectBoardProps {
  projectBoard: ProjectBoardViewModel;
  onOpenTask: (taskId: string) => void;
  onUpdateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => void;
  onDeleteTask: (taskId: string) => void;
}

function TaskCard({
  task,
  sourceRepo,
  hasOpenWorkspace,
  isStreaming,
  onOpenTask,
  onUpdateTaskWorkflowState,
  onDeleteTask,
}: TaskBoardCardViewModel & {
  onOpenTask: (taskId: string) => void;
  onUpdateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-white/[0.03] p-3 transition-colors",
        isStreaming && "live-pane border-emerald-400/30 bg-emerald-400/[0.06]",
      )}
    >
      <button type="button" onClick={() => onOpenTask(task.id)} className="w-full text-left">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{task.title}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {sourceRepo?.label ?? "Source repo"}
            </div>
          </div>
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {stateLabel(task.workflowState)}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>{task.provider}</span>
          <span>{task.model}</span>
          {hasOpenWorkspace ? <span className="text-emerald-200">Open</span> : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{task.branchName}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </div>
      </button>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={task.workflowState}
          onValueChange={(value) => onUpdateTaskWorkflowState(task.id, value as WorkflowState)}
        >
          <SelectTrigger className="h-8 flex-1 bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {WORKFLOW_STATE_META[state].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => onDeleteTask(task.id)}
          className="shrink-0 text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ProjectBoard({
  projectBoard,
  onOpenTask,
  onUpdateTaskWorkflowState,
  onDeleteTask,
}: ProjectBoardProps) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-[#13171c]">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Project board</div>
            <h1 className="mt-2 truncate text-xl font-semibold text-foreground">
              {projectBoard.project.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{projectBoard.project.brief}</p>
          </div>
          <div className="flex items-center gap-2">
            <NewTaskDialog projectBoard={projectBoard} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {projectBoard.repositories.length} repos
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {projectBoard.documents.length} docs
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {projectBoard.project.lifecycleState}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="grid h-full min-h-0 grid-cols-4 gap-3">
          {projectBoard.columns.map((column) => (
            <section
              key={column.state}
              className={cn(
                "flex min-h-0 flex-col rounded-md border border-border/60 bg-white/[0.02]",
                WORKFLOW_STATE_META[column.state].panelTone,
              )}
            >
              <div className="border-b border-border/50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{column.label}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {column.tasks.length} tasks
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
                    {column.state}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {column.tasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/50 px-3 py-5 text-sm text-muted-foreground">
                    No tasks here yet.
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <TaskCard
                      key={task.task.id}
                      {...task}
                      onOpenTask={onOpenTask}
                      onUpdateTaskWorkflowState={onUpdateTaskWorkflowState}
                      onDeleteTask={onDeleteTask}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
