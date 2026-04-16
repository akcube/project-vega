import { invoke } from "@tauri-apps/api/core";

import type { CreateProjectInput } from "@/lib/types";

export type PlanningReadiness = "early" | "needs_clarification" | "solid";
export type PlanningIssueSeverity = "critical" | "warning" | "note";

export interface ProjectPlanningIssue {
  severity: PlanningIssueSeverity;
  title: string;
  detail: string;
}

export interface ProjectPlanGuidance {
  summary?: string | null;
  readiness: PlanningReadiness;
  suggestions: string[];
  issues: ProjectPlanningIssue[];
}

export interface SuggestedProjectTask {
  id: string;
  title: string;
  summary: string;
  rationale?: string | null;
  sourceRepoLabel?: string | null;
  confidence?: number | null;
}

export interface ProjectTaskSuggestions {
  summary?: string | null;
  tasks: SuggestedProjectTask[];
}

type ProjectPlanningInput = Pick<
  CreateProjectInput,
  "name" | "brief" | "planMarkdown" | "resources"
>;

export function suggestProjectPlan(input: ProjectPlanningInput) {
  return invoke<ProjectPlanGuidance>("suggest_project_plan", { input });
}

export function suggestProjectTasks(input: ProjectPlanningInput) {
  return invoke<ProjectTaskSuggestions>("suggest_project_tasks", { input });
}
