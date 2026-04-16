import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { WorkspaceFrame } from "@/components/workspace-frame";
import { WorkspaceStrip } from "@/components/workspace-strip";
import { TaskInspector } from "@/components/task-inspector";
import type { WorkflowState, WorkspaceView } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";
import { cn } from "@/lib/utils";

export function ActiveWorkspacesScreen() {
  const activeWorkspaces = useTaskStore((state) => state.activeWorkspaces);
  const selectedWorkspaceTaskId = useTaskStore((state) => state.selectedWorkspaceTaskId);
  const workspace = useTaskStore((state) => state.workspace);
  const selectWorkspace = useTaskStore((state) => state.selectWorkspace);
  const closeWorkspace = useTaskStore((state) => state.closeWorkspace);
  const setWorkspaceView = useTaskStore((state) => state.setWorkspaceView);
  const updateTaskWorkflowState = useTaskStore((state) => state.updateTaskWorkflowState);
  const deleteTask = useTaskStore((state) => state.deleteTask);

  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkspaceStrip
        workspaces={activeWorkspaces}
        selectedWorkspaceTaskId={selectedWorkspaceTaskId}
        onSelectWorkspace={(taskId) => void selectWorkspace(taskId)}
        onCloseWorkspace={(taskId) => void closeWorkspace(taskId)}
      />

      <div className="min-h-0 flex-1">
        {workspace ? (
          <div className="relative flex h-full min-h-0">
            {/* Main workspace area */}
            <div className="min-w-0 flex-1">
              <WorkspaceFrame
                workspace={workspace}
                onViewChange={(taskId, view: WorkspaceView) =>
                  void setWorkspaceView(taskId, view)
                }
              />
            </div>

            {/* Inspector toggle button */}
            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className="absolute right-0 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-l-lg border border-r-0 border-border/40 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={inspectorOpen ? { right: "260px" } : undefined}
            >
              {inspectorOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Collapsible inspector */}
            <div
              className={cn(
                "h-full overflow-hidden transition-[width] duration-200 ease-in-out",
                inspectorOpen ? "w-[260px]" : "w-0",
              )}
            >
              {inspectorOpen && (
                <TaskInspector
                  workspace={workspace}
                  onUpdateTaskWorkflowState={(taskId, workflowState: WorkflowState) =>
                    void updateTaskWorkflowState(taskId, workflowState)
                  }
                  onDeleteTask={(taskId) => void deleteTask(taskId)}
                  onCloseWorkspace={(taskId) => void closeWorkspace(taskId)}
                />
              )}
            </div>
          </div>
        ) : (
          <section className="flex h-full items-center justify-center">
            <div className="fade-rise flex max-w-md flex-col items-center gap-4 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M3 9h18M9 3v18" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">No open workspaces</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Open a task from a project board to start working.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
