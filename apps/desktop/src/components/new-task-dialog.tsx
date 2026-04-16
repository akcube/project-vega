import { useEffect, useState } from "react";

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
import { Plus } from "lucide-react";
import { useTaskStore } from "@/stores/task-store";

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [worktreePath, setWorktreePath] = useState("");
  const [provider, setProvider] = useState<"Claude" | "Codex">("Codex");
  const [model, setModel] = useState("gpt-5-codex");
  const createTask = useTaskStore((state) => state.createTask);

  useEffect(() => {
    setModel(provider === "Codex" ? "gpt-5-codex" : "claude-sonnet-4-5");
  }, [provider]);

  const handleCreate = async () => {
    if (!title.trim() || !worktreePath.trim()) return;
    await createTask({
      title: title.trim(),
      worktreePath: worktreePath.trim(),
      provider,
      model: model.trim(),
    });
    setTitle("");
    setWorktreePath("");
    setProvider("Codex");
    setModel("gpt-5-codex");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-md border border-border/70 bg-white/3">
          <Plus className="mr-2 h-3.5 w-3.5" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-background/98 backdrop-blur">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Start a task with a worktree, provider, and model configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title"
            autoFocus
          />
          <Input
            value={worktreePath}
            onChange={(event) => setWorktreePath(event.target.value)}
            placeholder="/path/to/worktree"
          />
          <Select value={provider} onValueChange={(value) => setProvider(value as "Claude" | "Codex")}>
            <SelectTrigger>
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
          />
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || !worktreePath.trim() || !model.trim()}
            className="w-full rounded-md"
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
