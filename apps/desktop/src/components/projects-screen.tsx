import { ProjectBoard } from "@/components/project-board";
import { ProjectSidebar } from "@/components/project-sidebar";
import type { WorkflowState } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

export function ProjectsScreen() {
  const projects = useTaskStore((state) => state.projects);
  const selectedProjectId = useTaskStore((state) => state.selectedProjectId);
  const projectBoard = useTaskStore((state) => state.projectBoard);
  const selectProject = useTaskStore((state) => state.selectProject);
  const deleteProject = useTaskStore((state) => state.deleteProject);
  const openWorkspace = useTaskStore((state) => state.openWorkspace);
  const updateTaskWorkflowState = useTaskStore((state) => state.updateTaskWorkflowState);
  const deleteTask = useTaskStore((state) => state.deleteTask);

  return (
    <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]">
      <ProjectSidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={selectProject}
        onDeleteProject={deleteProject}
      />
      {projectBoard ? (
        <ProjectBoard
          projectBoard={projectBoard}
          onOpenTask={openWorkspace}
          onUpdateTaskWorkflowState={(taskId, workflowState: WorkflowState) =>
            updateTaskWorkflowState(taskId, workflowState)
          }
          onDeleteTask={deleteTask}
        />
      ) : (
        <section className="flex h-full min-h-0 flex-1 items-center justify-center bg-background">
          <div className="fade-rise flex max-w-md flex-col items-center gap-4 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/30">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Create a project</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Add a brief, a plan, and at least one repository.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
