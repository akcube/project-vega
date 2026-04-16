import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/app-shell";
import { useTaskStore } from "@/stores/task-store";
import { useFeedStore } from "@/stores/feed-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import type { FeedEntry } from "@/lib/types";

export default function App() {
  const bootstrap = useTaskStore((s) => s.bootstrap);
  const { theme } = useTheme();

  useEffect(() => {
    void bootstrap();
    void useFeedStore.getState().loadEntries();
  }, [bootstrap]);

  // Listen for real-time feed entries from the backend
  useEffect(() => {
    const promise = listen<FeedEntry>("feed:new-entry", (event) => {
      useFeedStore.getState().addEntry(event.payload);
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className={theme}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </div>
  );
}
