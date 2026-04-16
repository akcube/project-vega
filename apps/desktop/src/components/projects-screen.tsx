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
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)]">
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
        <section className="flex h-full min-h-0 flex-1 items-center justify-center bg-[#13171c]">
          <div className="max-w-lg px-6 text-center">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Project board</div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">Create a project</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Add a brief, a plan, and at least one repository. Tasks will spawn worktrees from those sources.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
