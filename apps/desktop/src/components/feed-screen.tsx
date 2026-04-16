import { CheckCircle, AlertTriangle, Clock, ExternalLink } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store";
import { useTaskStore } from "@/stores/task-store";
import { cn } from "@/lib/utils";
import type { FeedEntry } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CompletionCard({
  entry,
  onClick,
}: {
  entry: FeedEntry;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full gap-3 rounded-lg border p-3 text-left transition-all duration-150",
        entry.isRead
          ? "border-border/20 bg-muted/10 opacity-60 hover:opacity-80"
          : "border-chart-2/20 bg-chart-2/[0.03] hover:bg-chart-2/[0.06]",
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
        <CheckCircle className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "truncate text-xs",
            entry.isRead ? "text-muted-foreground" : "font-semibold text-foreground",
          )}>
            {entry.title}
          </span>
          {!entry.isRead && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2" />
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
          {entry.summary}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(entry.createdAt)}
          <ExternalLink className="ml-auto h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </button>
  );
}

function AlertCard({
  entry,
  onClick,
}: {
  entry: FeedEntry;
  onClick: () => void;
}) {
  const isHighSeverity = entry.severity >= 4;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full gap-3 rounded-lg border p-3 text-left transition-all duration-150",
        entry.isRead
          ? "border-border/20 bg-muted/10 opacity-60 hover:opacity-80"
          : isHighSeverity
            ? "border-destructive/25 bg-destructive/[0.04] hover:bg-destructive/[0.07]"
            : "border-chart-3/25 bg-chart-3/[0.04] hover:bg-chart-3/[0.07]",
      )}
    >
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        isHighSeverity
          ? "bg-destructive/15 text-destructive"
          : "bg-chart-3/15 text-chart-3",
      )}>
        <AlertTriangle className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "truncate text-xs",
            entry.isRead ? "text-muted-foreground" : "font-semibold text-foreground",
          )}>
            {entry.title}
          </span>
          <span className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1",
            isHighSeverity
              ? "bg-destructive/10 text-destructive ring-destructive/20"
              : "bg-chart-3/10 text-chart-3 ring-chart-3/20",
          )}>
            SEV {entry.severity}
          </span>
          {!entry.isRead && (
            <span className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              isHighSeverity ? "bg-destructive" : "bg-chart-3",
            )} />
          )}
        </div>
        {entry.category && (
          <span className="mt-1 inline-block rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground ring-1 ring-border/20">
            {entry.category.replace("_", " ")}
          </span>
        )}
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
          {entry.summary}
        </p>
        {entry.recommendedAction && (
          <p className="mt-1 text-[10px] font-medium text-foreground/70">
            → {entry.recommendedAction}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(entry.createdAt)}
          <ExternalLink className="ml-auto h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </button>
  );
}

export function FeedScreen() {
  const entries = useFeedStore((s) => s.entries);
  const markRead = useFeedStore((s) => s.markRead);
  const openWorkspace = useTaskStore((s) => s.openWorkspace);

  const handleClick = async (entry: FeedEntry) => {
    if (!entry.isRead) {
      void markRead(entry.id);
    }
    void openWorkspace(entry.taskId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/40 px-5 py-3">
        <h1 className="text-sm font-semibold text-foreground">Feed</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Session completions and monitoring alerts
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="fade-rise flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/30">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-foreground">No activity yet</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Feed entries appear when agent sessions complete or monitoring alerts fire.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2 p-4">
            {entries.map((entry) =>
              entry.kind === "alert" ? (
                <AlertCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => handleClick(entry)}
                />
              ) : (
                <CompletionCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => handleClick(entry)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
