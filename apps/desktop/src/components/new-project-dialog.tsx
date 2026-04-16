import { useMemo, useState, type DragEvent } from "react";
import { Plus, Sparkles, Upload } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CreateProjectResourceInput, ProjectResourceKind } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

interface ResourceDraft extends CreateProjectResourceInput {
  id: string;
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
  const [resources, setResources] = useState<ResourceDraft[]>([
    createDraft("repo"),
  ]);
  const createProject = useTaskStore((state) => state.createProject);

  const repoCount = useMemo(
    () => resources.filter((resource) => resource.kind === "repo" && resource.locator.trim()).length,
    [resources],
  );

  const reset = () => {
    setName("");
    setBrief("");
    setPlanMarkdown("");
    setResources([createDraft("repo")]);
  };

  const updateResource = (id: string, patch: Partial<ResourceDraft>) => {
    setResources((current) =>
      current.map((resource) => (resource.id === id ? { ...resource, ...patch } : resource)),
    );
  };

  const addResource = (kind: ProjectResourceKind) => {
    setResources((current) => [...current, createDraft(kind)]);
  };

  const removeResource = (id: string) => {
    setResources((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.dataTransfer.getData("text/plain").trim();
    if (!text) return;
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

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedBrief = brief.trim();
    const trimmedPlan = planMarkdown.trim();
    const preparedResources = resources
      .map((resource) => ({
        kind: resource.kind,
        label: resource.label.trim(),
        locator: resource.locator.trim(),
      }))
      .filter((resource) => resource.label && resource.locator);

    if (!trimmedName || !trimmedBrief || !trimmedPlan || repoCount === 0) return;

    await createProject({
      name: trimmedName,
      brief: trimmedBrief,
      planMarkdown: trimmedPlan,
      resources: preparedResources,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="w-full justify-start gap-2 rounded-lg border border-dashed border-border/40 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-border/30 bg-card text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">New project</DialogTitle>
          <DialogDescription className="text-xs">
            Collect the plan and source material before creating tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
              className="min-h-20 bg-muted/30 text-sm"
            />
            <Textarea
              value={planMarkdown}
              onChange={(event) => setPlanMarkdown(event.target.value)}
              placeholder="Plan (markdown)"
              className="min-h-36 bg-muted/30 font-mono text-xs"
            />
          </div>

          <div className="space-y-2.5">
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
                    Drop repos or docs, or add manually below.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {resources.map((resource, index) => (
                <div
                  key={resource.id}
                  className={cn(
                    "space-y-1.5 rounded-lg border border-border/30 bg-muted/20 p-2.5",
                    resource.kind === "repo" && "ring-1 ring-chart-2/10",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={resource.kind}
                      onValueChange={(value) => updateResource(resource.id, { kind: value as ProjectResourceKind })}
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
                    onChange={(event) => updateResource(resource.id, { label: event.target.value })}
                    placeholder={resource.kind === "repo" ? "Repo label" : "Doc label"}
                    className="h-7 bg-background/40 text-xs"
                  />
                  <Input
                    value={resource.locator}
                    onChange={(event) => updateResource(resource.id, { locator: event.target.value })}
                    placeholder={resource.kind === "repo" ? "/path/to/repo" : "/path/to/doc.md"}
                    className="h-7 bg-background/40 text-xs"
                  />
                  {index === 0 && resource.kind === "repo" ? (
                    <div className="text-[10px] font-medium text-chart-2/60">
                      {repoCount === 0 ? "Need one repository" : "Repository set"}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="xs" onClick={() => addResource("repo")} className="flex-1">
                Add repo
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={() => addResource("doc")} className="flex-1">
                Add doc
              </Button>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !brief.trim() || !planMarkdown.trim() || repoCount === 0}
              className="w-full"
              size="sm"
            >
              Create project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
