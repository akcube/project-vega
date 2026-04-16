export type Provider = "Claude" | "Codex";
export type ProjectResourceKind = "repo" | "doc";
export type ProjectLifecycleState = "active" | "archived";
export type WorkflowState = "todo" | "in_progress" | "in_review" | "completed";
export type RunStatus = "ready" | "streaming" | "cancelled" | "failed";
export type WorkspaceView = "agent" | "terminal" | "review";
export type AppMode = "projects" | "workspaces";

export interface Project {
  id: string;
  name: string;
  brief: string;
  planMarkdown: string;
  lifecycleState: ProjectLifecycleState;
  createdAt: string;
}

export interface ProjectResource {
  id: string;
  projectId: string;
  kind: ProjectResourceKind;
  label: string;
  locator: string;
  metadata: unknown;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  workflowState: WorkflowState;
  sourceRepoResourceId: string | null;
  worktreePath: string;
  worktreeName: string;
  branchName: string;
  provider: Provider;
  model: string;
  permissionPolicy: string;
  mcpSubset: string[];
  skillSubset: string[];
  currentRunId: string | null;
  lastOpenView: WorkspaceView;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveWorkspace {
  taskId: string;
  selectedView: WorkspaceView;
  stripOrder: number;
  lastFocusedAt: string;
}

export interface Run {
  id: string;
  taskId: string;
  provider: Provider;
  status: RunStatus;
  providerSessionId: string | null;
  providerLogPath: string | null;
  configSnapshot: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
}

export interface CreateProjectResourceInput {
  kind: ProjectResourceKind;
  label: string;
  locator: string;
}

export interface CreateProjectInput {
  name: string;
  brief: string;
  planMarkdown: string;
  resources: CreateProjectResourceInput[];
}

export interface AddProjectResourceInput {
  projectId: string;
  kind: ProjectResourceKind;
  label: string;
  locator: string;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  sourceRepoResourceId?: string | null;
  provider: Provider;
  model: string;
}

export interface ToolContentText {
  type: "text";
  text: string;
}

export interface ToolContentDiff {
  type: "diff";
  path: string;
  oldText: string | null;
  newText: string;
}

export type ToolContent = ToolContentText | ToolContentDiff;

export interface PlanEntry {
  content: string;
  status: string;
}

export type SessionUpdate =
  | { type: "textChunk"; text: string }
  | { type: "thinkingChunk"; text: string }
  | {
      type: "toolCall";
      toolCallId: string;
      title: string;
      kind: string;
      status: string;
      content: ToolContent[];
    }
  | {
      type: "toolCallUpdate";
      toolCallId: string;
      status: string;
      content: ToolContent[];
    }
  | { type: "plan"; entries: PlanEntry[] }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };

export interface ToolCallState {
  id: string;
  title: string;
  kind: string;
  status: string;
  content: ToolContent[];
}

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "toolCall"; toolCall: ToolCallState };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  segments: MessageSegment[];
}

export interface WorkspaceSnapshot {
  messages: ChatMessage[];
  currentMessage: ChatMessage | null;
}

export interface DiffArtifact {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ReviewSummary {
  toolCalls: ToolCallState[];
  diffs: DiffArtifact[];
}

export interface LiveStateViewModel {
  hasSession: boolean;
  canResume: boolean;
  isStreaming: boolean;
}

export interface RunViewModel {
  run: Run;
  sessionReference: string | null;
  logReference: string | null;
}

export interface WorkspaceSummaryViewModel {
  workspace: ActiveWorkspace;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  workflowState: WorkflowState;
  isStreaming: boolean;
}

export interface TaskBoardCardViewModel {
  task: Task;
  sourceRepo: ProjectResource | null;
  hasOpenWorkspace: boolean;
  isStreaming: boolean;
}

export interface TaskBoardColumnViewModel {
  state: WorkflowState;
  label: string;
  tasks: TaskBoardCardViewModel[];
}

export interface ProjectBoardViewModel {
  project: Project;
  repositories: ProjectResource[];
  documents: ProjectResource[];
  columns: TaskBoardColumnViewModel[];
}

export interface TaskWorkspaceViewModel {
  workspace: ActiveWorkspace;
  project: Project;
  task: Task;
  sourceRepo: ProjectResource | null;
  documents: ProjectResource[];
  run: RunViewModel | null;
  snapshot: WorkspaceSnapshot;
  review: ReviewSummary;
  live: LiveStateViewModel;
}

export interface TerminalEventOutput {
  type: "output";
  data: string;
}

export interface TerminalEventExit {
  type: "exit";
  exitCode: number;
}

export type TerminalEvent = TerminalEventOutput | TerminalEventExit;

export interface TerminalSnapshot {
  output: string;
}
