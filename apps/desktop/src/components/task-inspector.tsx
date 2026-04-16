import { Calendar, FolderGit2, Layers3, Trash2, X } from "lucide-react";

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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">{label}</div>
      {children}
    </div>
  );
}

export function TaskInspector({
  workspace,
  onUpdateTaskWorkflowState,
  onDeleteTask,
  onCloseWorkspace,
}: TaskInspectorProps) {
  return (
    <aside className="flex h-full min-h-0 w-[260px] flex-col border-l border-border/40 bg-card">
      {/* Header */}
      <div className="border-b border-border/40 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">{workspace.task.title}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge variant="outline" className="rounded-md border-border/40 text-[10px] px-1.5 py-0">
                {workspace.task.provider}
              </Badge>
              <Badge variant="outline" className="rounded-md border-border/40 text-[10px] px-1.5 py-0">
                {workspace.task.model}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-4">
          <InfoRow label="State">
            <Select
              value={workspace.task.workflowState}
              onValueChange={(value) =>
                onUpdateTaskWorkflowState(workspace.task.id, value as WorkflowState)
              }
            >
              <SelectTrigger className="h-8 bg-muted/40 text-xs">
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
          </InfoRow>

          <InfoRow label="Project">
            <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2">
              <div className="text-xs font-medium text-foreground">{workspace.project.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{workspace.project.brief}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {workspace.project.createdAt}
              </div>
            </div>
          </InfoRow>

          <InfoRow label="Worktree">
            <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs">
                <FolderGit2 className="h-3 w-3 text-chart-2" />
                <span className="truncate font-medium text-foreground">{workspace.task.branchName}</span>
              </div>
              <div className="mt-1 break-all text-[10px] text-muted-foreground">{workspace.task.worktreePath}</div>
            </div>
          </InfoRow>

          <InfoRow label="Source repo">
            <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs">
              {workspace.sourceRepo ? (
                <>
                  <div className="font-medium text-foreground">{workspace.sourceRepo.label}</div>
                  <div className="mt-0.5 break-all text-[10px] text-muted-foreground">
                    {workspace.sourceRepo.locator}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No source repo</div>
              )}
            </div>
          </InfoRow>

          <InfoRow label="Documents">
            {workspace.documents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/30 px-3 py-2 text-[11px] text-muted-foreground">
                No docs yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {workspace.documents.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs"
                  >
                    <div className="font-medium text-foreground">{document.label}</div>
                    <div className="mt-0.5 break-all text-[10px] text-muted-foreground">{document.locator}</div>
                  </div>
                ))}
              </div>
            )}
          </InfoRow>

          <InfoRow label="Session">
            <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Layers3 className="h-3 w-3" />
                <span>
                  {workspace.live.hasSession
                    ? workspace.live.isStreaming
                      ? "Live"
                      : "Connected"
                    : workspace.live.canResume
                      ? "Ready to reload"
                      : "No session"}
                </span>
                {workspace.live.isStreaming && (
                  <span className="h-1.5 w-1.5 rounded-full bg-chart-2 dot-pulse" />
                )}
              </div>
              {workspace.run ? (
                <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
                  <div>Status: {workspace.run.run.status}</div>
                  <div>Session: {workspace.run.sessionReference ?? "none"}</div>
                </div>
              ) : null}
            </div>
          </InfoRow>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="flex-1 text-muted-foreground hover:text-foreground"
            onClick={() => onCloseWorkspace(workspace.task.id)}
          >
            <X className="h-3 w-3" />
            Close
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="flex-1 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDeleteTask(workspace.task.id)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>
    </aside>
  );
}
