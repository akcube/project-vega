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
import { defaultModelForProvider, repoSelectionMode } from "@/lib/task-ui";
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

  const sourceRepo = useMemo<ProjectResource | null>(() => {
    if (repositories.length === 1) {
      return repositories[0];
    }
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
        <Button variant="ghost" size="sm" className="rounded-md border border-border/70 bg-white/[0.03]">
          <Plus className="h-3.5 w-3.5" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl border-border/60 bg-[#1d2128] text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Tasks always land in the selected project and spawn a worktree from one of its repos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title"
            autoFocus
            className="bg-white/[0.03]"
          />
          <Select value={provider} onValueChange={(value) => {
            const nextProvider = value as Provider;
            setProvider(nextProvider);
            setModel(defaultModelForProvider(nextProvider));
          }}>
            <SelectTrigger className="bg-white/[0.03]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Codex">Codex</SelectItem>
              <SelectItem value="Claude">Claude</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Model"
            className="bg-white/[0.03]"
          />

          {selectionMode === "manual" ? (
            <Select
              value={sourceRepoResourceId ?? undefined}
              onValueChange={setSourceRepoResourceId}
            >
              <SelectTrigger className="bg-white/[0.03]">
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
            <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground">
              {sourceRepo ? `Auto-selected ${sourceRepo.label}` : "This project has one repository."}
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={!projectBoard || !title.trim() || model.trim().length === 0 || (selectionMode === "manual" && !sourceRepoResourceId)}
            className="w-full"
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
