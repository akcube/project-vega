import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useTaskStore } from "@/stores/task-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";

export default function App() {
  const bootstrap = useTaskStore((s) => s.bootstrap);
  const { theme } = useTheme();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className={theme}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </div>
  );
}
