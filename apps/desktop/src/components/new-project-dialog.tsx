import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  suggestProjectPlan,
  suggestProjectTasks,
  type ProjectPlanGuidance,
  type SuggestedProjectTask,
  type ProjectTaskSuggestions,
} from "@/lib/project-planner";
import { defaultModelForProvider } from "@/lib/task-ui";
import type { CreateProjectResourceInput, ProjectResourceKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/task-store";

interface ResourceDraft extends CreateProjectResourceInput {
  id: string;
}

const PLAN_REFRESH_DEBOUNCE_MS = 2000;
const PLAN_GUIDANCE_DIFF_THRESHOLD = 48;
const TASK_SUGGESTION_DIFF_THRESHOLD = 96;

interface PlanningSnapshot {
  name: string;
  brief: string;
  planMarkdown: string;
  resourcesKey: string;
  normalizedGuidanceText: string;
  normalizedTaskText: string;
  lineCount: number;
  bulletCount: number;
  guidanceSignal: number;
  taskSignal: number;
}

const createDraft = (kind: ProjectResourceKind = "repo"): ResourceDraft => ({
  id: crypto.randomUUID(),
  kind,
  label: "",
  locator: "",
});

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [resources, setResources] = useState<ResourceDraft[]>([createDraft("repo")]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [planGuidance, setPlanGuidance] = useState<ProjectPlanGuidance | null>(null);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const [loadingGuidance, setLoadingGuidance] = useState(false);
  const [taskSuggestions, setTaskSuggestions] = useState<ProjectTaskSuggestions | null>(null);
  const [taskSuggestionError, setTaskSuggestionError] = useState<string | null>(null);
  const [loadingTaskSuggestions, setLoadingTaskSuggestions] = useState(false);
  const [selectedSuggestedTaskIds, setSelectedSuggestedTaskIds] = useState<string[]>([]);

  const guidanceRequestRef = useRef(0);
  const taskSuggestionRequestRef = useRef(0);
  const lastGuidanceSnapshotRef = useRef<PlanningSnapshot | null>(null);
  const lastTaskSuggestionSnapshotRef = useRef<PlanningSnapshot | null>(null);

  const createProject = useTaskStore((state) => state.createProject);
  const createTask = useTaskStore((state) => state.createTask);
  const refreshProjectBoard = useTaskStore((state) => state.refreshProjectBoard);

  const planningResources = useMemo(
    () =>
      resources
        .map((resource) => ({
          kind: resource.kind,
          label: resource.label.trim(),
          locator: resource.locator.trim(),
        }))
        .filter((resource) => resource.label || resource.locator),
    [resources],
  );

  const submitResources = useMemo(
    () =>
      resources
        .map((resource) => ({
          kind: resource.kind,
          label: resource.label.trim(),
          locator: resource.locator.trim(),
        }))
        .filter((resource) => resource.label && resource.locator),
    [resources],
  );

  const submittableRepoResources = useMemo(
    () =>
      submitResources.filter(
        (resource): resource is CreateProjectResourceInput & { kind: "repo" } =>
          resource.kind === "repo" && Boolean(resource.label || resource.locator),
      ),
    [submitResources],
  );

  const repoCount = useMemo(
    () => submitResources.filter((resource) => resource.kind === "repo").length,
    [submitResources],
  );

  const planningInput = useMemo(
    () => ({
      name: name.trim(),
      brief,
      planMarkdown,
      resources: planningResources,
    }),
    [name, brief, planMarkdown, planningResources],
  );
  const planningSnapshot = useMemo(
    () => buildPlanningSnapshot(planningInput),
    [planningInput],
  );

  const selectedSuggestedTasks = useMemo(
    () =>
      (taskSuggestions?.tasks ?? []).filter((task) =>
        selectedSuggestedTaskIds.includes(task.id),
      ),
    [selectedSuggestedTaskIds, taskSuggestions?.tasks],
  );

  const selectableSuggestedTasks = useMemo(
    () =>
      (taskSuggestions?.tasks ?? []).filter((task) =>
        canSelectSuggestedTask(task, submittableRepoResources),
      ),
    [submittableRepoResources, taskSuggestions?.tasks],
  );

  const allSelectableSelected =
    selectableSuggestedTasks.length > 0 &&
    selectableSuggestedTasks.every((task) => selectedSuggestedTaskIds.includes(task.id));

  const reset = () => {
    setName("");
    setBrief("");
    setPlanMarkdown("");
    setResources([createDraft("repo")]);
    setCreating(false);
    setFormError(null);
    setPlanGuidance(null);
    setGuidanceError(null);
    setLoadingGuidance(false);
    setTaskSuggestions(null);
    setTaskSuggestionError(null);
    setLoadingTaskSuggestions(false);
    setSelectedSuggestedTaskIds([]);
    guidanceRequestRef.current += 1;
    taskSuggestionRequestRef.current += 1;
    lastGuidanceSnapshotRef.current = null;
    lastTaskSuggestionSnapshotRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    if (planningSnapshot.guidanceSignal < 24) {
      setLoadingGuidance(false);
      return;
    }

    if (
      !shouldRefreshPlanningSurface(
        lastGuidanceSnapshotRef.current,
        planningSnapshot,
        "guidance",
      )
    ) {
      setLoadingGuidance(false);
      return;
    }

    const requestId = guidanceRequestRef.current + 1;
    guidanceRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      lastGuidanceSnapshotRef.current = planningSnapshot;
      setLoadingGuidance(true);
      setGuidanceError(null);

      try {
        const response = await suggestProjectPlan(planningInput);
        if (guidanceRequestRef.current !== requestId) {
          return;
        }
        setPlanGuidance((current) => mergePlanGuidance(current, response));
      } catch (error) {
        if (guidanceRequestRef.current !== requestId) {
          return;
        }
        setGuidanceError(normalizeError(error));
      } finally {
        if (guidanceRequestRef.current === requestId) {
          setLoadingGuidance(false);
        }
      }
    }, PLAN_REFRESH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, planningInput, planningSnapshot]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (planningSnapshot.taskSignal < 32) {
      setLoadingTaskSuggestions(false);
      return;
    }

    if (
      !shouldRefreshPlanningSurface(
        lastTaskSuggestionSnapshotRef.current,
        planningSnapshot,
        "tasks",
      )
    ) {
      setLoadingTaskSuggestions(false);
      return;
    }

    const requestId = taskSuggestionRequestRef.current + 1;
    taskSuggestionRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      lastTaskSuggestionSnapshotRef.current = planningSnapshot;
      setLoadingTaskSuggestions(true);
      setTaskSuggestionError(null);

      try {
        const response = await suggestProjectTasks(planningInput);
        if (taskSuggestionRequestRef.current !== requestId) {
          return;
        }
        setTaskSuggestions((current) => mergeTaskSuggestions(current, response));
      } catch (error) {
        if (taskSuggestionRequestRef.current !== requestId) {
          return;
        }
        setTaskSuggestionError(normalizeError(error));
      } finally {
        if (taskSuggestionRequestRef.current === requestId) {
          setLoadingTaskSuggestions(false);
        }
      }
    }, PLAN_REFRESH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, planningInput, planningSnapshot]);

  useEffect(() => {
    setSelectedSuggestedTaskIds((current) =>
      current.filter((id) =>
            (taskSuggestions?.tasks ?? []).some(
          (task) => task.id === id && canSelectSuggestedTask(task, submittableRepoResources),
        ),
      ),
    );
  }, [submittableRepoResources, taskSuggestions?.tasks]);

  const updateResource = (id: string, patch: Partial<ResourceDraft>) => {
    setResources((current) =>
      current.map((resource) => (resource.id === id ? { ...resource, ...patch } : resource)),
    );
  };

  const addResource = (kind: ProjectResourceKind) => {
    setResources((current) => [...current, createDraft(kind)]);
  };

  const removeResource = (id: string) => {
    setResources((current) =>
      current.length === 1 ? current : current.filter((item) => item.id !== id),
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.dataTransfer.getData("text/plain").trim();
    if (!text) {
      return;
    }

    addResource(text.toLowerCase().includes(".md") ? "doc" : "repo");
    setResources((current) => {
      const next = [...current];
      next[next.length - 1] = {
        ...next[next.length - 1],
        label: text.split("/").pop() || text,
        locator: text,
      };
      return next;
    });
  };

  const toggleSuggestedTask = (taskId: string) => {
    setSelectedSuggestedTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  };

  const toggleAllSuggestedTasks = () => {
    if (allSelectableSelected) {
      setSelectedSuggestedTaskIds((current) =>
        current.filter((id) => !selectableSuggestedTasks.some((task) => task.id === id)),
      );
      return;
    }

    setSelectedSuggestedTaskIds((current) => {
      const next = new Set(current);
      for (const task of selectableSuggestedTasks) {
        next.add(task.id);
      }
      return [...next];
    });
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedBrief = brief.trim();
    const trimmedPlan = planMarkdown.trim();
    if (!trimmedName || !trimmedBrief || !trimmedPlan || repoCount === 0 || creating) {
      return;
    }

    setCreating(true);
    setFormError(null);

    try {
      const project = await createProject({
        name: trimmedName,
        brief: trimmedBrief,
        planMarkdown: trimmedPlan,
        resources: submitResources,
      });

      if (selectedSuggestedTasks.length > 0) {
        await refreshProjectBoard(project.id);
        const latestBoard = useTaskStore.getState().projectBoard;
        const repositories =
          latestBoard?.project.id === project.id ? latestBoard.repositories : [];
        const failedTasks: string[] = [];

        for (const task of selectedSuggestedTasks) {
          try {
            const sourceRepo =
              repositories.length <= 1
                ? (repositories[0] ?? null)
                : repositories.find((repository) => repository.label === task.sourceRepoLabel) ??
                  null;

            if (repositories.length > 1 && !sourceRepo) {
              failedTasks.push(task.title);
              continue;
            }

            await createTask({
              projectId: project.id,
              title: task.title,
              sourceRepoResourceId: sourceRepo?.id ?? null,
              materializeWorktree: false,
              provider: "Codex",
              model: defaultModelForProvider("Codex"),
            });
          } catch (error) {
            failedTasks.push(task.title);
            console.error("failed to create suggested task", task.title, error);
          }
        }

        await refreshProjectBoard(project.id);

        if (failedTasks.length > 0) {
          throw new Error(
            `Project created, but these suggested tasks were not added: ${failedTasks.join(", ")}`,
          );
        }
      }

      reset();
      setOpen(false);
    } catch (error) {
      setFormError(normalizeError(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-2 rounded-lg border border-dashed border-border/40 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-border/30 bg-card text-foreground shadow-2xl sm:w-[min(97vw,1320px)] sm:max-w-none">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-sm font-semibold">New project</DialogTitle>
          <DialogDescription className="text-xs">
            Capture the brief, shape the plan, then promote the good suggested tasks straight into the board.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1 xl:grid-cols-[minmax(0,1fr)_400px] xl:overflow-hidden xl:pr-0">
          <div className="min-h-0 space-y-4 xl:overflow-y-auto xl:pr-1">
            <div className="space-y-2.5">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                autoFocus
                className="bg-muted/30 text-sm"
              />
              <Textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="Brief"
                className="min-h-24 bg-muted/30 text-sm"
              />
              <Textarea
                value={planMarkdown}
                onChange={(event) => setPlanMarkdown(event.target.value)}
                placeholder="Plan (markdown)"
                className="min-h-[240px] bg-muted/30 font-mono text-xs"
              />
            </div>

            <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="group rounded-lg border border-dashed border-primary/20 bg-primary/[0.03] p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/[0.06]"
              >
                <div className="flex items-start gap-2.5">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Upload className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      Intake resources
                      <Sparkles className="h-3 w-3 text-primary/60 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Drop repos or docs, or add them manually below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {resources.map((resource, index) => (
                  <div
                    key={resource.id}
                    className={cn(
                      "space-y-1.5 rounded-lg border border-border/30 bg-background/40 p-2.5",
                      resource.kind === "repo" && "ring-1 ring-chart-2/10",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Select
                        value={resource.kind}
                        onValueChange={(value) =>
                          updateResource(resource.id, { kind: value as ProjectResourceKind })
                        }
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="repo">Repo</SelectItem>
                          <SelectItem value="doc">Doc</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => removeResource(resource.id)}
                        className="ml-auto text-[10px] text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                    <Input
                      value={resource.label}
                      onChange={(event) =>
                        updateResource(resource.id, { label: event.target.value })
                      }
                      placeholder={resource.kind === "repo" ? "Repo label" : "Doc label"}
                      className="h-7 bg-background/40 text-xs"
                    />
                    <Input
                      value={resource.locator}
                      onChange={(event) =>
                        updateResource(resource.id, { locator: event.target.value })
                      }
                      placeholder={resource.kind === "repo" ? "/path/to/repo" : "/path/to/doc.md"}
                      className="h-7 bg-background/40 text-xs"
                    />
                    {index === 0 && resource.kind === "repo" ? (
                      <div className="text-[10px] font-medium text-chart-2/70">
                        {repoCount === 0 ? "Need one repository" : "Repository set"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => addResource("repo")}
                  className="flex-1"
                >
                  Add repo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => addResource("doc")}
                  className="flex-1"
                >
                  Add doc
                </Button>
              </div>
            </div>

            {formError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {formError}
              </div>
            ) : null}

            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !brief.trim() || !planMarkdown.trim() || repoCount === 0 || creating}
              className="w-full"
              size="sm"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {selectedSuggestedTasks.length > 0
                ? `Create project + ${selectedSuggestedTasks.length} tasks`
                : "Create project"}
            </Button>
          </div>

          <div className="min-h-[320px] overflow-hidden rounded-xl border border-border/30 bg-muted/20 xl:min-h-0">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                <section className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
                        <WandSparkles className="h-3.5 w-3.5" />
                        Plan copilot
                      </div>
                      <p className="mt-2 text-sm text-foreground">
                        Fast feedback while the brief and plan are still forming.
                      </p>
                    </div>
                    {planGuidance ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                          readinessTone(planGuidance.readiness),
                        )}
                      >
                        {readinessLabel(planGuidance.readiness)}
                      </Badge>
                    ) : null}
                  </div>

                  {planGuidance ? (
                    <div className="mt-4 space-y-4">
                      {loadingGuidance ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Refreshing guidance after meaningful draft changes...
                        </div>
                      ) : null}

                      {guidanceError ? (
                        <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                          {guidanceError}
                        </div>
                      ) : null}

                      {planGuidance.summary ? (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {planGuidance.summary}
                        </p>
                      ) : null}

                      {planGuidance.issues.length > 0 ? (
                        <div className="space-y-2">
                          {planGuidance.issues.map((issue, index) => (
                            <div
                              key={`${issue.title}-${index}`}
                              className="rounded-lg border border-border/30 bg-background/50 px-3 py-2"
                            >
                              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                                <CircleAlert className="h-3.5 w-3.5 text-amber-300" />
                                {issue.title}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {issue.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {planGuidance.suggestions.length > 0 ? (
                        <div className="space-y-2">
                          {planGuidance.suggestions.map((suggestion, index) => (
                            <div
                              key={`${suggestion}-${index}`}
                              className="rounded-lg border border-border/25 bg-background/40 px-3 py-2 text-xs leading-5 text-muted-foreground"
                            >
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : loadingGuidance ? (
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Reading the current draft...
                    </div>
                  ) : guidanceError ? (
                    <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                      {guidanceError}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      Start writing the brief and plan. After a sentence or two, the copilot will
                      begin flagging gaps and suggesting what to think about next.
                    </p>
                  )}
                </section>

                <section className="rounded-xl border border-border/30 bg-background/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                        Suggested tasks
                      </div>
                      <p className="mt-2 text-sm text-foreground">
                        Promote the useful ones when you create the project.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-md border-border/40 bg-background/70 text-[10px]">
                        {taskSuggestions?.tasks.length ?? 0}
                      </Badge>
                      {selectableSuggestedTasks.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={toggleAllSuggestedTasks}
                          className="text-[10px] text-muted-foreground"
                        >
                          {allSelectableSelected ? "Clear" : "Select all"}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {taskSuggestions?.tasks.length ? (
                    <div className="mt-4 space-y-3">
                      {loadingTaskSuggestions ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Refreshing task candidates after meaningful plan edits...
                        </div>
                      ) : null}

                      {taskSuggestionError ? (
                        <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                          {taskSuggestionError}
                        </div>
                      ) : null}

                      {taskSuggestions.summary ? (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {taskSuggestions.summary}
                        </p>
                      ) : null}

                      {taskSuggestions.tasks.map((task) => {
                        const selected = selectedSuggestedTaskIds.includes(task.id);
                        const resolvedRepo = resolveSuggestedRepo(task, submittableRepoResources);
                        const selectable = canSelectSuggestedTask(task, submittableRepoResources);

                        return (
                          <article
                            key={task.id}
                            className={cn(
                              "rounded-xl border px-3 py-3 transition-colors",
                              selected
                                ? "border-primary/35 bg-primary/[0.06]"
                                : "border-border/30 bg-muted/10",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-foreground">
                                  {task.title}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {task.summary}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="xs"
                                variant={selected ? "default" : "outline"}
                                onClick={() => toggleSuggestedTask(task.id)}
                                disabled={!selectable}
                              >
                                {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                {selected ? "Added" : "Add"}
                              </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-md border-border/40 bg-background/70 text-[10px]">
                                {resolvedRepo?.label ??
                                  task.sourceRepoLabel ??
                                  (submittableRepoResources.length === 1
                                    ? submittableRepoResources[0].label
                                    : "Repo not set")}
                              </Badge>
                              {task.confidence !== null && task.confidence !== undefined ? (
                                <Badge variant="outline" className="rounded-md border-border/40 bg-background/70 text-[10px]">
                                  {Math.round(task.confidence * 100)}%
                                </Badge>
                              ) : null}
                            </div>

                            {task.rationale ? (
                              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                {task.rationale}
                              </p>
                            ) : null}

                            {!selectable ? (
                              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[11px] leading-5 text-amber-100/85">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                This task needs a repo mapping first. Name the target repo in the
                                plan or keep only one repository attached.
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : loadingTaskSuggestions ? (
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Breaking the plan into possible tasks...
                    </div>
                  ) : taskSuggestionError ? (
                    <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                      {taskSuggestionError}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      Add a few concrete implementation bullets to the plan and task candidates
                      will show up here.
                    </p>
                  )}
                </section>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function canSelectSuggestedTask(
  task: SuggestedProjectTask,
  repositories: CreateProjectResourceInput[],
) {
  return repositories.length <= 1 || Boolean(resolveSuggestedRepo(task, repositories));
}

function resolveSuggestedRepo(
  task: SuggestedProjectTask,
  repositories: CreateProjectResourceInput[],
) {
  if (repositories.length <= 1) {
    return repositories[0] ?? null;
  }

  const repoLabel = task.sourceRepoLabel?.trim();
  if (!repoLabel) {
    return null;
  }

  return repositories.find((repository) => repository.label === repoLabel) ?? null;
}

function readinessLabel(readiness: ProjectPlanGuidance["readiness"]) {
  switch (readiness) {
    case "early":
      return "Early";
    case "needs_clarification":
      return "Needs clarity";
    case "solid":
      return "Solid";
  }
}

function readinessTone(readiness: ProjectPlanGuidance["readiness"]) {
  switch (readiness) {
    case "early":
      return "border-slate-500/25 bg-slate-500/10 text-slate-200";
    case "needs_clarification":
      return "border-amber-400/25 bg-amber-400/10 text-amber-100";
    case "solid":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }
}

function buildPlanningSnapshot(input: {
  name: string;
  brief: string;
  planMarkdown: string;
  resources: CreateProjectResourceInput[];
}): PlanningSnapshot {
  const name = input.name.trim();
  const brief = normalizeMultilineText(input.brief);
  const planMarkdown = normalizeMultilineText(input.planMarkdown);
  const resourcesKey = input.resources
    .map((resource) => `${resource.kind}:${resource.label.trim()}=>${resource.locator.trim()}`)
    .join("|");

  return {
    name,
    brief,
    planMarkdown,
    resourcesKey,
    normalizedGuidanceText: normalizeComparisonText(`${name}\n${brief}\n${planMarkdown}`),
    normalizedTaskText: normalizeComparisonText(planMarkdown),
    lineCount: planMarkdown ? planMarkdown.split("\n").length : 0,
    bulletCount: countPlanBullets(planMarkdown),
    guidanceSignal: brief.length + planMarkdown.length,
    taskSignal: planMarkdown.length,
  };
}

function shouldRefreshPlanningSurface(
  previous: PlanningSnapshot | null,
  next: PlanningSnapshot,
  mode: "guidance" | "tasks",
) {
  if (!previous) {
    return true;
  }

  if (previous.resourcesKey !== next.resourcesKey || previous.name !== next.name) {
    return true;
  }

  const previousText =
    mode === "guidance" ? previous.normalizedGuidanceText : previous.normalizedTaskText;
  const nextText = mode === "guidance" ? next.normalizedGuidanceText : next.normalizedTaskText;

  if (previousText === nextText) {
    return false;
  }

  if (previous.bulletCount !== next.bulletCount) {
    return true;
  }

  if (Math.abs(previous.lineCount - next.lineCount) >= 2) {
    return true;
  }

  return (
    approximateChangedCharacters(previousText, nextText) >=
    (mode === "guidance" ? PLAN_GUIDANCE_DIFF_THRESHOLD : TASK_SUGGESTION_DIFF_THRESHOLD)
  );
}

function mergePlanGuidance(
  current: ProjectPlanGuidance | null,
  incoming: ProjectPlanGuidance,
): ProjectPlanGuidance {
  if (!current) {
    return incoming;
  }

  return {
    summary: incoming.summary ?? current.summary,
    readiness: incoming.readiness,
    suggestions: dedupeStrings([...incoming.suggestions, ...current.suggestions]).slice(0, 6),
    issues: dedupeIssues([...incoming.issues, ...current.issues]).slice(0, 6),
  };
}

function mergeTaskSuggestions(
  current: ProjectTaskSuggestions | null,
  incoming: ProjectTaskSuggestions,
): ProjectTaskSuggestions {
  if (!current) {
    return incoming;
  }

  const merged = new Map<string, SuggestedProjectTask>();

  for (const task of current.tasks) {
    merged.set(taskMergeKey(task), task);
  }

  for (const task of incoming.tasks) {
    const key = taskMergeKey(task);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...task, id: previous.id } : task);
  }

  return {
    summary: incoming.summary ?? current.summary,
    tasks: [...merged.values()].slice(0, 10),
  };
}

function taskMergeKey(task: SuggestedProjectTask) {
  return normalizeComparisonText(
    `${task.title}::${task.sourceRepoLabel ?? ""}`,
  );
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped;
}

function dedupeIssues(issues: ProjectPlanGuidance["issues"]) {
  const seen = new Set<string>();
  const deduped: ProjectPlanGuidance["issues"] = [];

  for (const issue of issues) {
    const key = normalizeComparisonText(
      `${issue.severity}:${issue.title}:${issue.detail}`,
    );
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function normalizeComparisonText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

function normalizeMultilineText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function countPlanBullets(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line) || /^#{1,6}\s+/.test(line),
    ).length;
}

function approximateChangedCharacters(previous: string, next: string) {
  if (previous === next) {
    return 0;
  }

  let prefix = 0;
  const maxPrefix = Math.min(previous.length, next.length);
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) {
    prefix += 1;
  }

  let previousSuffix = previous.length - 1;
  let nextSuffix = next.length - 1;
  while (
    previousSuffix >= prefix &&
    nextSuffix >= prefix &&
    previous[previousSuffix] === next[nextSuffix]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  const previousChanged = Math.max(previousSuffix - prefix + 1, 0);
  const nextChanged = Math.max(nextSuffix - prefix + 1, 0);
  return previousChanged + nextChanged;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong.";
}
