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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useTaskStore } from "@/stores/task-store";

export function AddResourceDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"repo" | "doc">("repo");
  const [label, setLabel] = useState("");
  const [locator, setLocator] = useState("");
  const addProjectResource = useTaskStore((state) => state.addProjectResource);

  const handleSave = async () => {
    if (!label.trim() || !locator.trim()) return;
    await addProjectResource(kind, label.trim(), locator.trim());
    setLabel("");
    setLocator("");
    setKind("repo");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-md border border-border/70 bg-white/3">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add resource
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-background/98 backdrop-blur">
        <DialogHeader>
          <DialogTitle>Add project resource</DialogTitle>
          <DialogDescription>
            Attach a repository or document that should stay visible to this project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={kind} onValueChange={(value) => setKind(value as "repo" | "doc")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repo">Repository</SelectItem>
              <SelectItem value="doc">Document</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
          />
          <Input
            value={locator}
            onChange={(event) => setLocator(event.target.value)}
            placeholder={kind === "repo" ? "/path/to/repo" : "/path/to/doc.md"}
          />
          <Button onClick={handleSave} disabled={!label.trim() || !locator.trim()} className="w-full rounded-md">
            Save resource
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
