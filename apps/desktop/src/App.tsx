import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useTaskStore } from "@/stores/task-store";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const loadProjects = useTaskStore((s) => s.loadProjects);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  );
}
