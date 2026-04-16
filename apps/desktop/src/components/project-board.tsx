import { useState, type DragEvent } from "react";
import { ChevronRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectBoardViewModel, TaskBoardCardViewModel, WorkflowState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WORKFLOW_STATES, WORKFLOW_STATE_META } from "@/lib/task-ui";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { Badge } from "@/components/ui/badge";

interface ProjectBoardProps {
  projectBoard: ProjectBoardViewModel;
  onOpenTask: (taskId: string) => void;
  onUpdateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => void;
  onDeleteTask: (taskId: string) => void;
}

const columnDot: Record<string, string> = {
  todo: "bg-[#5c6370]",
  in_progress: "bg-[#98c379]",
  in_review: "bg-[#e5c07b]",
  completed: "bg-[#56b6c2]",
};

function TaskCard({
  task,
  sourceRepo,
  hasOpenWorkspace,
  isStreaming,
  onOpenTask,
  onUpdateTaskWorkflowState,
  onDeleteTask,
  onDragStart,
}: TaskBoardCardViewModel & {
  onOpenTask: (taskId: string) => void;
  onUpdateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => void;
  onDeleteTask: (taskId: string) => void;
  onDragStart: (e: DragEvent, taskId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className={cn(
        "group cursor-grab rounded-lg border border-border/30 bg-background/60 p-3 transition-all duration-150 hover:border-border/60 hover:bg-background/80 active:cursor-grabbing active:opacity-70 active:scale-[0.98]",
        isStreaming && "live-pane border-chart-2/25 ring-1 ring-chart-2/10",
      )}
    >
      <button type="button" onClick={() => onOpenTask(task.id)} className="w-full text-left">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">{task.title}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {sourceRepo?.label ?? "No repo"}
            </div>
          </div>
          {hasOpenWorkspace && (
            <span className={cn(
              "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2",
              isStreaming && "dot-pulse shadow-[0_0_6px_rgba(152,195,121,0.5)]",
            )} />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-mono text-muted-foreground/70">{task.branchName}</span>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
        </div>
      </button>

      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/20 pt-2.5">
        <Select
          value={task.workflowState}
          onValueChange={(value) => onUpdateTaskWorkflowState(task.id, value as WorkflowState)}
        >
          <SelectTrigger className="h-6 flex-1 bg-muted/30 text-[11px]">
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
          className="shrink-0 text-muted-foreground/40 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
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
  const [dragOverColumn, setDragOverColumn] = useState<WorkflowState | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const handleDragStart = (e: DragEvent, taskId: string) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDragOver = (e: DragEvent, state: WorkflowState) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(state);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: DragEvent, targetState: WorkflowState) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTaskWorkflowState(taskId, targetState);
    }
    setDragOverColumn(null);
    setDraggingTaskId(null);
  };

  const handleDragEnd = () => {
    setDragOverColumn(null);
    setDraggingTaskId(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="border-b border-border/40 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {projectBoard.project.name}
            </h1>
            <p className="mt-0.5 max-w-2xl truncate text-xs text-muted-foreground">{projectBoard.project.brief}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-md border-border/30 text-[10px] px-1.5 py-0 text-muted-foreground">
              {projectBoard.repositories.length} repos
            </Badge>
            <Badge variant="outline" className="rounded-md border-border/30 text-[10px] px-1.5 py-0 text-muted-foreground">
              {projectBoard.documents.length} docs
            </Badge>
            <NewTaskDialog projectBoard={projectBoard} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3" onDragEnd={handleDragEnd}>
        <div className="grid h-full min-h-0 grid-cols-4 gap-2.5">
          {projectBoard.columns.map((column) => (
            <section
              key={column.state}
              onDragOver={(e) => handleDragOver(e, column.state)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.state)}
              className={cn(
                "flex min-h-0 flex-col rounded-xl border bg-muted/20 transition-all duration-150",
                dragOverColumn === column.state
                  ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20"
                  : "border-border/25",
              )}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", columnDot[column.state])} />
                  <span className="text-xs font-medium text-foreground">{column.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{column.tasks.length}</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
                {column.tasks.length === 0 ? (
                  <div className={cn(
                    "rounded-lg border border-dashed px-3 py-4 text-center text-[11px] transition-colors",
                    dragOverColumn === column.state
                      ? "border-primary/30 text-primary/50"
                      : "border-border/20 text-muted-foreground/50",
                  )}>
                    {dragOverColumn === column.state ? "Drop here" : "Empty"}
                  </div>
                ) : (
                  column.tasks.map((task) => (
                    <TaskCard
                      key={task.task.id}
                      {...task}
                      onOpenTask={onOpenTask}
                      onUpdateTaskWorkflowState={onUpdateTaskWorkflowState}
                      onDeleteTask={onDeleteTask}
                      onDragStart={handleDragStart}
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
