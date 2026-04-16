import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useTaskStore } from "@/stores/task-store";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createProject = useTaskStore((state) => state.createProject);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createProject(name.trim(), description.trim());
    setName("");
    setDescription("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-10 w-10 rounded-md border border-border/70 bg-white/3">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-background/98 backdrop-blur">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Create a project to group repos, docs, and active tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does this project hold?"
            className="min-h-28"
          />
          <Button onClick={handleCreate} disabled={!name.trim()} className="w-full rounded-md">
            Create project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
