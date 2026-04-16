import type { Provider, ProjectResource, WorkflowState, WorkspaceView } from "@/lib/types";

export const WORKFLOW_STATES: WorkflowState[] = [
  "todo",
  "in_progress",
  "in_review",
  "completed",
];

export const WORKSPACE_VIEWS: { id: WorkspaceView; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "terminal", label: "Terminal" },
  { id: "review", label: "Review" },
];

export const WORKFLOW_STATE_META: Record<
  WorkflowState,
  { label: string; tone: string; panelTone: string }
> = {
  todo: {
    label: "Todo",
    tone: "border-slate-700/70 bg-slate-900/45 text-slate-200",
    panelTone: "bg-slate-950/45",
  },
  in_progress: {
    label: "In Progress",
    tone: "border-emerald-500/35 bg-emerald-500/12 text-emerald-100",
    panelTone: "bg-emerald-500/8",
  },
  in_review: {
    label: "In Review",
    tone: "border-amber-500/35 bg-amber-500/12 text-amber-100",
    panelTone: "bg-amber-500/8",
  },
  completed: {
    label: "Completed",
    tone: "border-cyan-500/35 bg-cyan-500/12 text-cyan-100",
    panelTone: "bg-cyan-500/8",
  },
};

export const PROVIDER_DEFAULT_MODELS: Record<Provider, string> = {
  Codex: "gpt-5.4",
  Claude: "claude-sonnet-4-6",
};

export const PROVIDER_AVAILABLE_MODELS: Record<Provider, string[]> = {
  Codex: ["gpt-5.4", "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.4-mini", "gpt-5.3-codex-spark"],
  Claude: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5-20251001"],
};

export function defaultModelForProvider(provider: Provider) {
  return PROVIDER_DEFAULT_MODELS[provider];
}

export function repoSelectionMode(repositories: ProjectResource[]) {
  return repositories.length <= 1 ? "auto" : "manual";
}

export function stateLabel(state: WorkflowState) {
  return WORKFLOW_STATE_META[state].label;
}
