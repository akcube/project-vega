import { Calendar, FolderGit2, Layers3, Trash2, Unplug } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskWorkspaceViewModel, WorkflowState } from "@/lib/types";
import { WORKFLOW_STATES, WORKFLOW_STATE_META } from "@/lib/task-ui";

interface TaskInspectorProps {
  workspace: TaskWorkspaceViewModel;
  onUpdateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => void;
  onDeleteTask: (taskId: string) => void;
  onCloseWorkspace: (taskId: string) => void;
}

export function TaskInspector({
  workspace,
  onUpdateTaskWorkflowState,
  onDeleteTask,
  onCloseWorkspace,
}: TaskInspectorProps) {
  return (
    <aside className="flex h-full min-h-0 w-[320px] flex-col border-l border-border/60 bg-[#171b21]">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Task</div>
        <h2 className="mt-2 truncate text-lg font-semibold text-foreground">{workspace.task.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {workspace.task.provider}
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {workspace.task.model}
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/60 bg-white/[0.03]">
            {WORKFLOW_STATE_META[workspace.task.workflowState].label}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">State</div>
            <Select
              value={workspace.task.workflowState}
              onValueChange={(value) =>
                onUpdateTaskWorkflowState(workspace.task.id, value as WorkflowState)
              }
            >
              <SelectTrigger className="bg-white/[0.03]">
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
          </section>

          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Project</div>
            <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-3">
              <div className="text-sm font-medium text-foreground">{workspace.project.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{workspace.project.brief}</div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {workspace.project.createdAt}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Worktree</div>
            <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-3 text-sm text-foreground">
              <div className="flex items-center gap-2">
                <FolderGit2 className="h-4 w-4 text-emerald-200" />
                {workspace.task.branchName}
              </div>
              <div className="mt-2 break-all text-xs text-muted-foreground">{workspace.task.worktreePath}</div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Source repo</div>
            <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-3 text-sm">
              {workspace.sourceRepo ? (
                <>
                  <div className="font-medium text-foreground">{workspace.sourceRepo.label}</div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    {workspace.sourceRepo.locator}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No source repo attached.</div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Documents</div>
            <div className="space-y-2">
              {workspace.documents.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/50 px-3 py-3 text-sm text-muted-foreground">
                  No docs yet.
                </div>
              ) : (
                workspace.documents.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                  >
                    <div className="font-medium">{document.label}</div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">{document.locator}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Session</div>
            <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-3 text-sm text-foreground">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers3 className="h-4 w-4" />
                {workspace.live.hasSession
                  ? workspace.live.isStreaming
                    ? "Live session connected"
                    : "Session connected"
                  : workspace.live.canResume
                    ? "Session ready to reload"
                    : "No live session"}
              </div>
              {workspace.run ? (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div>Run status: {workspace.run.run.status}</div>
                  <div>Session: {workspace.run.sessionReference ?? "none"}</div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-border/60 px-5 py-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onCloseWorkspace(workspace.task.id)}
          >
            <Unplug className="h-3.5 w-3.5" />
            Close
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => onDeleteTask(workspace.task.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </aside>
  );
}
