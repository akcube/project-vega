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
        <Button size="sm" variant="ghost" className="rounded-md border border-border/70 bg-white/[0.03]">
          <Plus className="h-3.5 w-3.5" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-border/60 bg-[#1d2128] text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Collect the plan and source material before creating tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              autoFocus
              className="bg-white/[0.03]"
            />
            <Textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Brief"
              className="min-h-24 bg-white/[0.03]"
            />
            <Textarea
              value={planMarkdown}
              onChange={(event) => setPlanMarkdown(event.target.value)}
              placeholder="Plan"
              className="min-h-40 bg-white/[0.03] font-mono text-sm"
            />
          </div>

          <div className="space-y-3">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="group rounded-md border border-dashed border-emerald-400/25 bg-emerald-400/[0.04] p-4 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/[0.06]"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md border border-border/60 bg-white/[0.03] p-2">
                  <Upload className="h-4 w-4 text-emerald-200" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    Intake resources
                    <Sparkles className="h-3.5 w-3.5 text-emerald-200/80 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Drop repos or docs here, or add them manually below.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {resources.map((resource, index) => (
                <div
                  key={resource.id}
                  className={cn(
                    "space-y-2 rounded-md border border-border/60 bg-white/[0.03] p-3",
                    resource.kind === "repo" && "shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={resource.kind}
                      onValueChange={(value) => updateResource(resource.id, { kind: value as ProjectResourceKind })}
                    >
                      <SelectTrigger className="h-8 w-28">
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
                      className="ml-auto text-muted-foreground"
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    value={resource.label}
                    onChange={(event) => updateResource(resource.id, { label: event.target.value })}
                    placeholder={resource.kind === "repo" ? "Repo label" : "Doc label"}
                    className="h-8 bg-background/60"
                  />
                  <Input
                    value={resource.locator}
                    onChange={(event) => updateResource(resource.id, { locator: event.target.value })}
                    placeholder={resource.kind === "repo" ? "/path/to/repo" : "/path/to/doc.md"}
                    className="h-8 bg-background/60"
                  />
                  {index === 0 && resource.kind === "repo" ? (
                    <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/70">
                      {repoCount === 0 ? "Need one repository" : "Repository set"}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addResource("repo")} className="flex-1">
                Add repo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addResource("doc")} className="flex-1">
                Add doc
              </Button>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !brief.trim() || !planMarkdown.trim() || repoCount === 0}
              className="w-full"
            >
              Create project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
