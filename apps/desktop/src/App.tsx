import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useTaskStore } from "@/stores/task-store";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const bootstrap = useTaskStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="dark">
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </div>
  );
}
