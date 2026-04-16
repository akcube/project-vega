export type Provider = "Claude" | "Codex";
export type ProjectResourceKind = "repo" | "doc";
export type TaskStatus = "idle" | "running" | "cancelled" | "failed";
export type RunStatus = "ready" | "streaming" | "cancelled" | "failed";
export type TaskView = "agent" | "review" | "run";

export interface Project {
  id: string;
  name: string;
  description: string;
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
  status: TaskStatus;
  worktreePath: string;
  provider: Provider;
  model: string;
  permissionPolicy: string;
  mcpSubset: string[];
  skillSubset: string[];
  currentRunId: string | null;
  lastOpenView: TaskView;
  createdAt: string;
  updatedAt: string;
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

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText: string | null; newText: string };

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
  isStreaming: boolean;
}

export interface RunViewModel {
  run: Run;
  sessionReference: string | null;
  logReference: string | null;
}

export interface TaskWorkspaceViewModel {
  project: Project;
  task: Task;
  resources: ProjectResource[];
  run: RunViewModel | null;
  snapshot: WorkspaceSnapshot;
  review: ReviewSummary;
  live: LiveStateViewModel;
}
