import { WorkspaceFrame } from "@/components/workspace-frame";
import { WorkspaceStrip } from "@/components/workspace-strip";
import { TaskInspector } from "@/components/task-inspector";
import type { WorkflowState, WorkspaceView } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

export function ActiveWorkspacesScreen() {
  const activeWorkspaces = useTaskStore((state) => state.activeWorkspaces);
  const selectedWorkspaceTaskId = useTaskStore((state) => state.selectedWorkspaceTaskId);
  const workspace = useTaskStore((state) => state.workspace);
  const selectWorkspace = useTaskStore((state) => state.selectWorkspace);
  const closeWorkspace = useTaskStore((state) => state.closeWorkspace);
  const setWorkspaceView = useTaskStore((state) => state.setWorkspaceView);
  const updateTaskWorkflowState = useTaskStore((state) => state.updateTaskWorkflowState);
  const deleteTask = useTaskStore((state) => state.deleteTask);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#11161d]">
      <WorkspaceStrip
        workspaces={activeWorkspaces}
        selectedWorkspaceTaskId={selectedWorkspaceTaskId}
        onSelectWorkspace={(taskId) => void selectWorkspace(taskId)}
        onCloseWorkspace={(taskId) => void closeWorkspace(taskId)}
      />

      <div className="min-h-0 flex-1">
        {workspace ? (
          <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px]">
            <WorkspaceFrame
              workspace={workspace}
              onViewChange={(taskId, view: WorkspaceView) =>
                void setWorkspaceView(taskId, view)
              }
            />
            <TaskInspector
              workspace={workspace}
              onUpdateTaskWorkflowState={(taskId, workflowState: WorkflowState) =>
                void updateTaskWorkflowState(taskId, workflowState)
              }
              onDeleteTask={(taskId) => void deleteTask(taskId)}
              onCloseWorkspace={(taskId) => void closeWorkspace(taskId)}
            />
          </div>
        ) : (
          <section className="flex h-full items-center justify-center">
            <div className="max-w-xl px-6 text-center">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Active workspaces
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-foreground">
                Open a task from a project board
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Each open task gets one workspace with agent chat, terminal, review, and task context.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
