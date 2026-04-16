import { Activity, Bell, KanbanSquare, Moon, Sparkles, Sun } from "lucide-react";

import { ActiveWorkspacesScreen } from "@/components/active-workspaces-screen";
import { FeedScreen } from "@/components/feed-screen";
import { ProjectsScreen } from "@/components/projects-screen";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/task-store";
import { useFeedStore } from "@/stores/feed-store";
import { useTheme } from "@/hooks/use-theme";

export function AppShell() {
  const mode = useTaskStore((state) => state.mode);
  const setMode = useTaskStore((state) => state.setMode);
  const activeWorkspaces = useTaskStore((state) => state.activeWorkspaces);
  const isBootstrapping = useTaskStore((state) => state.isBootstrapping);
  const unreadCount = useFeedStore((state) => state.unreadCount);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground">
      {/* Subtle ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(97,175,239,0.04),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(198,120,221,0.03),transparent_50%)]" />

      <div className="relative flex h-full min-h-0 flex-col">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="glass-surface border-b border-border/50">
          <div className="flex h-11 items-center justify-between gap-4 px-4">
            {/* Left: brand */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-foreground/90">
                Vega
              </span>
            </div>

            {/* Center: nav pills */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <button
                type="button"
                onClick={() => setMode("projects")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150",
                  mode === "projects"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <KanbanSquare className="h-3 w-3" />
                Projects
              </button>
              <button
                type="button"
                onClick={() => setMode("feed")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150",
                  mode === "feed"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Bell className="h-3 w-3" />
                Feed
                {unreadCount > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-chart-3/20 px-1 text-[10px] font-semibold text-chart-3">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode("workspaces")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150",
                  mode === "workspaces"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Activity className="h-3 w-3" />
                Workspaces
                {activeWorkspaces.length > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
                    {activeWorkspaces.length}
                  </span>
                )}
              </button>
            </div>

            {/* Right: theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>

        {/* ── Main content ────────────────────────────────────── */}
        <main className="min-h-0 flex-1">
          {isBootstrapping ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 50 50"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="25" cy="25" r="20"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity="0.15"
                  />
                  <circle
                    cx="25" cy="25" r="20"
                    className="text-primary"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="80 150"
                    strokeDashoffset="0"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 25 25" to="360 25 25"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
                <span className="text-xs text-muted-foreground">Loading workspace state</span>
              </div>
            </div>
          ) : mode === "projects" ? (
            <ProjectsScreen />
          ) : mode === "feed" ? (
            <FeedScreen />
          ) : (
            <ActiveWorkspacesScreen />
          )}
        </main>
      </div>
    </div>
  );
}
