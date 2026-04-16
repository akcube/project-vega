import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

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
import type { ProjectBoardViewModel, Provider, ProjectResource } from "@/lib/types";
import { defaultModelForProvider, repoSelectionMode, PROVIDER_AVAILABLE_MODELS } from "@/lib/task-ui";
import { useTaskStore } from "@/stores/task-store";

interface CreateTaskDialogProps {
  projectBoard: ProjectBoardViewModel | null;
}

export function NewTaskDialog({ projectBoard }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<Provider>("Codex");
  const [model, setModel] = useState(defaultModelForProvider("Codex"));
  const [sourceRepoResourceId, setSourceRepoResourceId] = useState<string | null>(null);
  const createTask = useTaskStore((state) => state.createTask);
  const openWorkspace = useTaskStore((state) => state.openWorkspace);
  const setMode = useTaskStore((state) => state.setMode);

  const repositories = projectBoard?.repositories ?? [];
  const selectionMode = repoSelectionMode(repositories);
  const availableModels = PROVIDER_AVAILABLE_MODELS[provider];

  const sourceRepo = useMemo<ProjectResource | null>(() => {
    if (repositories.length === 1) return repositories[0];
    return repositories.find((repository) => repository.id === sourceRepoResourceId) ?? null;
  }, [repositories, sourceRepoResourceId]);

  const reset = () => {
    setTitle("");
    setProvider("Codex");
    setModel(defaultModelForProvider("Codex"));
    setSourceRepoResourceId(repositories[0]?.id ?? null);
  };

  const handleCreate = async () => {
    if (!projectBoard || !title.trim()) return;
    const task = await createTask({
      title: title.trim(),
      sourceRepoResourceId:
        selectionMode === "auto" ? repositories[0]?.id ?? null : sourceRepoResourceId,
      provider,
      model: model.trim(),
    });
    await openWorkspace(task.id);
    setMode("workspaces");
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSourceRepoResourceId(repositories[0]?.id ?? null);
        } else {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/60">
          <Plus className="h-3 w-3" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-border/30 bg-card text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">New task</DialogTitle>
          <DialogDescription className="text-xs">
            Tasks spawn a worktree from one of the project's repos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title"
            autoFocus
            className="bg-muted/30 text-sm"
          />

          {/* Provider */}
          <Select value={provider} onValueChange={(value) => {
            const nextProvider = value as Provider;
            setProvider(nextProvider);
            setModel(defaultModelForProvider(nextProvider));
          }}>
            <SelectTrigger className="bg-muted/30 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Codex">Codex</SelectItem>
              <SelectItem value="Claude">Claude</SelectItem>
            </SelectContent>
          </Select>

          {/* Model dropdown */}
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="bg-muted/30 text-sm font-mono">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m} value={m} className="font-mono text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectionMode === "manual" ? (
            <Select
              value={sourceRepoResourceId ?? undefined}
              onValueChange={setSourceRepoResourceId}
            >
              <SelectTrigger className="bg-muted/30 text-sm">
                <SelectValue placeholder="Select repo" />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repository) => (
                  <SelectItem key={repository.id} value={repository.id}>
                    {repository.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {sourceRepo ? `Auto-selected ${sourceRepo.label}` : "This project has one repository."}
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={!projectBoard || !title.trim() || model.trim().length === 0 || (selectionMode === "manual" && !sourceRepoResourceId)}
            className="w-full"
            size="sm"
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
