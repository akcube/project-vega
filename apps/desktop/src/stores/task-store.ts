import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  ProjectResourceKind,
  SessionUpdate,
  Task,
  TaskView,
  TaskWorkspaceViewModel,
} from "@/lib/types";
import {
  appendOptimisticUserMessage,
  applyLiveUpdateToWorkspace,
} from "@/lib/workspace-reducer";

interface VegaState {
  projects: Project[];
  selectedProjectId: string | null;
  tasks: Task[];
  selectedTaskId: string | null;
  workspace: TaskWorkspaceViewModel | null;
  isStreaming: boolean;

  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  createProject: (name: string, description: string) => Promise<void>;
  addProjectResource: (
    kind: ProjectResourceKind,
    label: string,
    locator: string,
  ) => Promise<void>;
  loadTasks: (projectId: string) => Promise<void>;
  selectTask: (taskId: string) => Promise<void>;
  createTask: (input: {
    title: string;
    worktreePath: string;
    provider: "Claude" | "Codex";
    model: string;
  }) => Promise<void>;
  setView: (view: TaskView) => Promise<void>;
  beginStreaming: (text: string) => void;
  applyStreamUpdate: (update: SessionUpdate) => void;
  refreshWorkspace: () => Promise<void>;
  finishStreaming: () => Promise<void>;
}

export const useTaskStore = create<VegaState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  tasks: [],
  selectedTaskId: null,
  workspace: null,
  isStreaming: false,

  loadProjects: async () => {
    const projects = await invoke<Project[]>("list_projects");
    const selectedProjectId = get().selectedProjectId ?? projects[0]?.id ?? null;
    set({ projects, selectedProjectId });
    if (selectedProjectId) {
      await get().loadTasks(selectedProjectId);
    } else {
      set({ tasks: [], selectedTaskId: null, workspace: null });
    }
  },

  selectProject: async (projectId) => {
    set({ selectedProjectId: projectId, selectedTaskId: null, workspace: null });
    await get().loadTasks(projectId);
  },

  createProject: async (name, description) => {
    const project = await invoke<Project>("create_project", {
      input: { name, description },
    });
    set((state) => ({
      projects: [project, ...state.projects],
      selectedProjectId: project.id,
      tasks: [],
      selectedTaskId: null,
      workspace: null,
    }));
  },

  addProjectResource: async (kind, label, locator) => {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    await invoke("add_project_resource", {
      input: { projectId, kind, label, locator },
    });
    await get().refreshWorkspace();
  },

  loadTasks: async (projectId) => {
    const tasks = await invoke<Task[]>("list_tasks", { projectId });
    const selectedTaskId =
      get().selectedTaskId && tasks.some((task) => task.id === get().selectedTaskId)
        ? get().selectedTaskId
        : tasks[0]?.id ?? null;
    set({ tasks, selectedTaskId });
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    } else {
      set({ workspace: null });
    }
  },

  selectTask: async (taskId) => {
    const workspace = await invoke<TaskWorkspaceViewModel>("open_task", { taskId });
    set({
      selectedTaskId: taskId,
      workspace,
      isStreaming: workspace.live.isStreaming,
    });
  },

  createTask: async ({ title, worktreePath, provider, model }) => {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    const task = await invoke<Task>("create_task", {
      input: { projectId, title, worktreePath, provider, model },
    });
    set((state) => ({
      tasks: [task, ...state.tasks],
      selectedTaskId: task.id,
    }));
    await get().selectTask(task.id);
  },

  setView: async (view) => {
    const taskId = get().selectedTaskId;
    const workspace = get().workspace;
    if (!taskId || !workspace) return;
    set({
      workspace: {
        ...workspace,
        task: {
          ...workspace.task,
          lastOpenView: view,
        },
      },
    });
    await invoke("set_last_open_view", { taskId, view });
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
    set({
      workspace: applyLiveUpdateToWorkspace(workspace, update),
    });
  },

  refreshWorkspace: async () => {
    const taskId = get().selectedTaskId;
    if (!taskId) return;
    const workspace = await invoke<TaskWorkspaceViewModel>("open_task", { taskId });
    set({
      workspace,
      isStreaming: workspace.live.isStreaming,
    });
  },

  finishStreaming: async () => {
    set({ isStreaming: false });
    await get().refreshWorkspace();
  },
}));
