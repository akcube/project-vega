import { Channel, invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type {
  AddProjectResourceInput,
  AppMode,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectBoardViewModel,
  ProjectResource,
  SessionUpdate,
  Task,
  TaskWorkspaceViewModel,
  TerminalEvent,
  TerminalSnapshot,
  WorkflowState,
  WorkspaceSummaryViewModel,
  WorkspaceView,
} from "@/lib/types";
import { applyLiveUpdateToWorkspace, appendOptimisticUserMessage } from "@/lib/workspace-reducer";

interface AppState {
  mode: AppMode;
  projects: Project[];
  selectedProjectId: string | null;
  projectBoard: ProjectBoardViewModel | null;
  activeWorkspaces: WorkspaceSummaryViewModel[];
  selectedWorkspaceTaskId: string | null;
  workspace: TaskWorkspaceViewModel | null;
  isBootstrapping: boolean;
  isStreaming: boolean;

  bootstrap: () => Promise<void>;
  setMode: (mode: AppMode) => void;
  loadProjects: () => Promise<void>;
  refreshProjectBoard: (projectId?: string | null) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  loadActiveWorkspaces: () => Promise<void>;
  selectWorkspace: (taskId: string) => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  addProjectResource: (input: AddProjectResourceInput) => Promise<ProjectResource>;
  createTask: (
    input: Omit<CreateTaskInput, "projectId"> & { projectId?: string | null },
  ) => Promise<Task>;
  updateTaskWorkflowState: (taskId: string, workflowState: WorkflowState) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  openWorkspace: (taskId: string) => Promise<TaskWorkspaceViewModel>;
  setWorkspaceView: (taskId: string, view: WorkspaceView) => Promise<TaskWorkspaceViewModel>;
  closeWorkspace: (taskId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  beginStreaming: (text: string) => void;
  applyStreamUpdate: (update: SessionUpdate) => void;
  finishStreaming: () => Promise<void>;
  attachTerminal: (
    taskId: string,
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ) => Promise<TerminalSnapshot>;
  writeTerminal: (taskId: string, data: string) => Promise<void>;
  resizeTerminal: (taskId: string, cols: number, rows: number) => Promise<void>;
}

async function loadProjectBoard(projectId: string) {
  return invoke<ProjectBoardViewModel>("get_project_board", { projectId });
}

export const useTaskStore = create<AppState>((set, get) => ({
  mode: "projects",
  projects: [],
  selectedProjectId: null,
  projectBoard: null,
  activeWorkspaces: [],
  selectedWorkspaceTaskId: null,
  workspace: null,
  isBootstrapping: false,
  isStreaming: false,

  bootstrap: async () => {
    set({ isBootstrapping: true });
    try {
      await Promise.all([get().loadProjects(), get().loadActiveWorkspaces()]);
      const selectedWorkspaceTaskId = get().selectedWorkspaceTaskId;
      if (selectedWorkspaceTaskId && !get().workspace) {
        await get().openWorkspace(selectedWorkspaceTaskId);
      }
    } finally {
      set({ isBootstrapping: false });
    }
  },

  setMode: (mode) => set({ mode }),

  loadProjects: async () => {
    const projects = await invoke<Project[]>("list_projects");
    const selectedProjectId =
      get().selectedProjectId && projects.some((project) => project.id === get().selectedProjectId)
        ? get().selectedProjectId
        : projects[0]?.id ?? null;

    set({ projects, selectedProjectId });

    if (selectedProjectId) {
      const projectBoard = await loadProjectBoard(selectedProjectId);
      set({ projectBoard });
    } else {
      set({ projectBoard: null });
    }
  },

  refreshProjectBoard: async (projectId) => {
    const selectedProjectId = projectId ?? get().selectedProjectId;
    if (!selectedProjectId) {
      set({ projectBoard: null });
      return;
    }

    const projectBoard = await loadProjectBoard(selectedProjectId);
    set({
      selectedProjectId,
      projectBoard,
    });
  },

  selectProject: async (projectId) => {
    set({ selectedProjectId: projectId, mode: "projects" });
    const projectBoard = await loadProjectBoard(projectId);
    set({ projectBoard });
  },

  loadActiveWorkspaces: async () => {
    const activeWorkspaces = await invoke<WorkspaceSummaryViewModel[]>("list_active_workspaces");
    const selectedWorkspaceTaskId =
      get().selectedWorkspaceTaskId &&
      activeWorkspaces.some((workspace) => workspace.taskId === get().selectedWorkspaceTaskId)
        ? get().selectedWorkspaceTaskId
        : activeWorkspaces[0]?.taskId ?? null;

    set({ activeWorkspaces, selectedWorkspaceTaskId });
  },

  selectWorkspace: async (taskId) => {
    await get().openWorkspace(taskId);
    set({ mode: "workspaces" });
  },

  createProject: async (input) => {
    const project = await invoke<Project>("create_project", {
      input: {
        name: input.name,
        brief: input.brief,
        planMarkdown: input.planMarkdown,
        resources: input.resources,
      },
    });

    set((state) => ({
      projects: [project, ...state.projects.filter((entry) => entry.id !== project.id)],
      selectedProjectId: project.id,
      projectBoard: null,
      mode: "projects",
    }));
    await get().refreshProjectBoard(project.id);
    return project;
  },

  addProjectResource: async (input) => {
    const resource = await invoke<ProjectResource>("add_project_resource", {
      input,
    });
    await get().refreshProjectBoard(input.projectId);
    return resource;
  },

  createTask: async (input) => {
    const projectId = input.projectId ?? get().selectedProjectId;
    if (!projectId) {
      throw new Error("Select a project before creating a task.");
    }

    const task = await invoke<Task>("create_task", {
      input: {
        projectId,
        title: input.title,
        sourceRepoResourceId: input.sourceRepoResourceId ?? null,
        materializeWorktree: input.materializeWorktree ?? true,
        provider: input.provider,
        model: input.model,
      },
    });

    await get().refreshProjectBoard(projectId);
    return task;
  },

  updateTaskWorkflowState: async (taskId, workflowState) => {
    await invoke("update_task_workflow_state", { taskId, workflowState });
    await get().refreshProjectBoard();
    await get().loadActiveWorkspaces();
    await get().refreshWorkspace();
  },

  deleteTask: async (taskId) => {
    await invoke("delete_task", { taskId });
    if (get().selectedWorkspaceTaskId === taskId) {
      set({ workspace: null, selectedWorkspaceTaskId: null });
    }
    await get().refreshProjectBoard();
    await get().loadActiveWorkspaces();
  },

  deleteProject: async (projectId) => {
    await invoke("delete_project", { projectId });
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== projectId),
      projectBoard:
        state.projectBoard?.project.id === projectId ? null : state.projectBoard,
      selectedProjectId:
        state.selectedProjectId === projectId
          ? state.projects.find((project) => project.id !== projectId)?.id ?? null
          : state.selectedProjectId,
    }));
    await get().loadProjects();
    await get().loadActiveWorkspaces();
  },

  openWorkspace: async (taskId) => {
    const workspace = await invoke<TaskWorkspaceViewModel>("open_workspace", { taskId });
    set({
      workspace,
      selectedWorkspaceTaskId: taskId,
      mode: "workspaces",
      isStreaming: workspace.live.isStreaming,
    });
    await get().loadActiveWorkspaces();
    return workspace;
  },

  setWorkspaceView: async (taskId, view) => {
    const workspace = await invoke<TaskWorkspaceViewModel>("set_workspace_view", {
      taskId,
      view,
    });
    set({
      workspace,
      selectedWorkspaceTaskId: taskId,
      isStreaming: workspace.live.isStreaming,
    });
    await get().loadActiveWorkspaces();
    return workspace;
  },

  closeWorkspace: async (taskId) => {
    await invoke("close_workspace", { taskId });
    if (get().selectedWorkspaceTaskId === taskId) {
      set({ workspace: null, selectedWorkspaceTaskId: null });
    }
    await get().loadActiveWorkspaces();
  },

  refreshWorkspace: async () => {
    const taskId = get().selectedWorkspaceTaskId;
    if (!taskId) return;
    const workspace = await invoke<TaskWorkspaceViewModel>("open_workspace", { taskId });
    set({
      workspace,
      isStreaming: workspace.live.isStreaming,
    });
    await get().loadActiveWorkspaces();
  },

  beginStreaming: (text) => {
    const workspace = get().workspace;
    if (!workspace) return;

    set({
      isStreaming: true,
      workspace: {
        ...workspace,
        snapshot: appendOptimisticUserMessage(workspace.snapshot, text),
        live: {
          ...workspace.live,
          isStreaming: true,
        },
      },
    });
  },

  applyStreamUpdate: (update) => {
    const workspace = get().workspace;
    if (!workspace) return;

    const nextWorkspace = applyLiveUpdateToWorkspace(workspace, update);
    set({
      workspace: nextWorkspace,
      isStreaming: nextWorkspace.live.isStreaming,
    });
  },

  finishStreaming: async () => {
    set({ isStreaming: false });
    await get().refreshWorkspace();
  },

  attachTerminal: async (taskId, cols, rows, onEvent) => {
    const channel = new Channel<TerminalEvent>();
    channel.onmessage = onEvent;

    return invoke<TerminalSnapshot>("attach_terminal", {
      taskId,
      cols,
      rows,
      onEvent: channel,
    });
  },

  writeTerminal: async (taskId, data) => {
    await invoke("write_terminal", { taskId, data });
  },

  resizeTerminal: async (taskId, cols, rows) => {
    await invoke("resize_terminal", { taskId, cols, rows });
  },
}));
