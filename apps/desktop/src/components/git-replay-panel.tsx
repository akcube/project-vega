import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FolderGit2,
  GitCommitHorizontal,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";

import {
  GitReplayEditor,
  type ReplayInlineComment,
  type ReplayInlineCommentEntry,
  type ReplayLineSelection,
} from "@/components/git-replay-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import {
  buildReplayPlan,
  createReplayCursorCache,
  formatReplayStatus,
  syncReplayFrame,
  type ReplayPlan,
} from "@/lib/git-replay";
import {
  loadCommitHistory,
  loadCommitReplay,
  type CommitHistoryResult,
  type CommitReplayResult,
  type CommitSummary,
  type SemanticHunk,
} from "@/lib/git";
import type { TaskWorkspaceViewModel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/task-store";

interface RepoSource {
  id: string;
  label: string;
  path: string;
  detail: string;
}

interface ReviewAnchor {
  filePath: string;
  lineNumber: number;
  lineText: string;
  commitOid: string;
  commitShortOid: string;
  replayStep: number;
  replayStepCount: number;
  operationLabel: string | null;
  repositoryPath: string;
  semanticTitle: string | null;
  semanticSummary: string | null;
}

interface ReviewAgentNote {
  id: string;
  anchor: ReviewAnchor;
  question: string;
  answer: string | null;
  createdAt: string;
}

const MIN_PLAYBACK_DELAY_MS = 12;
const MAX_PLAYBACK_DELAY_MS = 90;

export function GitReplayPanel({
  workspace,
}: {
  workspace: TaskWorkspaceViewModel;
}) {
  const { sendPrompt } = useSession();
  const isStreaming = useTaskStore((state) => state.isStreaming);
  const repoSources = collectRepoSources(workspace);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    repoSources[0]?.id ?? null,
  );
  const [headReference, setHeadReference] = useState<string | null>(null);
  const [history, setHistory] = useState<CommitSummary[]>([]);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [replay, setReplay] = useState<CommitReplayResult | null>(null);
  const [replayPlan, setReplayPlan] = useState<ReplayPlan | null>(null);
  const [playbackCursor, setPlaybackCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(34);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [reviewAnchor, setReviewAnchor] = useState<ReviewAnchor | null>(null);
  const [reviewNoteText, setReviewNoteText] = useState("");
  const [reviewNoteError, setReviewNoteError] = useState<string | null>(null);
  const [sendingReviewNote, setSendingReviewNote] = useState(false);
  const [submittedNotes, setSubmittedNotes] = useState<ReviewAgentNote[]>([]);
  const [pendingReviewQuestion, setPendingReviewQuestion] = useState<string | null>(null);
  const replayCacheRef = useRef(createReplayCursorCache());

  const selectedSource =
    repoSources.find((source) => source.id === selectedSourceId) ?? repoSources[0] ?? null;

  useEffect(() => {
    if (!selectedSourceId || repoSources.some((source) => source.id === selectedSourceId)) {
      return;
    }

    setSelectedSourceId(repoSources[0]?.id ?? null);
  }, [repoSources, selectedSourceId]);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory(source: RepoSource) {
      setLoadingHistory(true);
      setHistoryError(null);
      setReplayError(null);
      setReplay(null);
      setReplayPlan(null);
      setHistory([]);
      setSelectedCommitId(null);
      setHeadReference(null);
      setPlaybackCursor(0);
      setPlaying(false);
      setReviewAnchor(null);
      setReviewNoteText("");
      setReviewNoteError(null);
      setSubmittedNotes([]);
      setPendingReviewQuestion(null);
      replayCacheRef.current = createReplayCursorCache();

      try {
        const result = await loadCommitHistory(source.path);
        if (cancelled) {
          return;
        }

        applyHistory(result);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setHistoryError(normalizeError(error));
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    if (selectedSource) {
      void fetchHistory(selectedSource);
    } else {
      setHistory([]);
      setHeadReference(null);
      setSelectedCommitId(null);
      setReplay(null);
      setReplayPlan(null);
      setLoadingHistory(false);
      setLoadingReplay(false);
      setPlaying(false);
      setPlaybackCursor(0);
      setReviewAnchor(null);
      setReviewNoteText("");
      setReviewNoteError(null);
      setSubmittedNotes([]);
      setPendingReviewQuestion(null);
      replayCacheRef.current = createReplayCursorCache();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedSource?.id, selectedSource?.path]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReplay(source: RepoSource, commitId: string) {
      setLoadingReplay(true);
      setReplayError(null);
      setReplay(null);
      setReplayPlan(null);
      setPlaybackCursor(0);
      setPlaying(false);
      setReviewAnchor(null);
      setReviewNoteText("");
      setReviewNoteError(null);
      setSubmittedNotes([]);
      setPendingReviewQuestion(null);
      replayCacheRef.current = createReplayCursorCache();

      try {
        const result = await loadCommitReplay(source.path, commitId);
        if (cancelled) {
          return;
        }

        setReplay(result);
        setReplayPlan(buildReplayPlan(result));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setReplayError(normalizeError(error));
      } finally {
        if (!cancelled) {
          setLoadingReplay(false);
        }
      }
    }

    if (selectedSource && selectedCommitId) {
      void fetchReplay(selectedSource, selectedCommitId);
    } else {
      setReplay(null);
      setReplayPlan(null);
      setLoadingReplay(false);
      setPlaying(false);
      setPlaybackCursor(0);
      setReviewAnchor(null);
      setReviewNoteText("");
      setReviewNoteError(null);
      setSubmittedNotes([]);
      setPendingReviewQuestion(null);
      replayCacheRef.current = createReplayCursorCache();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedSource?.path, selectedCommitId]);

  useEffect(() => {
    const totalSteps = replayPlan?.operations.length ?? 0;
    if (!playing || totalSteps === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setPlaybackCursor((current) => {
        if (current >= totalSteps) {
          setPlaying(false);
          return current;
        }

        return current + 1;
      });
    }, speedMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [playing, replayPlan?.operations.length, speedMs]);

  const totalSteps = replayPlan?.operations.length ?? 0;
  const safeCursor = Math.min(playbackCursor, totalSteps);
  const frame = syncReplayFrame(
    replayPlan,
    replay?.commit.oid ?? null,
    safeCursor,
    replayCacheRef.current,
  );
  const progress = totalSteps === 0 ? 0 : (safeCursor / totalSteps) * 100;
  const canReplay = totalSteps > 0;
  const activeLabel = renderPlaybackLabel({
    loadingReplay,
    replayPlan,
    safeCursor,
    totalSteps,
    activeLabel: frame.activeOperation?.label ?? null,
    playing,
  });
  const semanticFileIndex =
    frame.editor.activeFileIndex ?? (replay?.files.length ? 0 : null);
  const semanticFile =
    semanticFileIndex !== null ? (replay?.files[semanticFileIndex] ?? null) : null;
  const semanticHunks = semanticFile?.semanticHunks ?? [];
  const selectedAnchorLineNumber =
    reviewAnchor?.filePath === frame.editor.activeFilePath ? reviewAnchor.lineNumber : null;
  const activeThread: ReplayInlineCommentEntry[] = reviewAnchor
    ? submittedNotes
        .filter((note) => sameReviewThread(note.anchor, reviewAnchor))
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        )
        .map((note) => ({
          id: note.id,
          question: note.question,
          answer: note.answer,
          createdAt: note.createdAt,
        }))
    : [];

  function handleReplayLineSelect(selection: ReplayLineSelection) {
    if (sendingReviewNote || isStreaming) {
      return;
    }

    setPlaying(false);
    setReviewNoteText("");
    setReviewNoteError(null);

    const relatedSemanticHunk = findSemanticHunkForLine(semanticHunks, selection.lineNumber);
    const commit = replay?.commit;
    const repositoryPath = selectedSource?.path ?? workspace.task.worktreePath;

    if (!commit || !repositoryPath) {
      return;
    }

    setReviewAnchor({
      filePath: selection.filePath,
      lineNumber: selection.lineNumber,
      lineText: selection.lineText,
      commitOid: commit.oid,
      commitShortOid: commit.shortOid,
      replayStep: safeCursor,
      replayStepCount: totalSteps,
      operationLabel: frame.activeOperation?.label ?? null,
      repositoryPath,
      semanticTitle: relatedSemanticHunk?.title ?? null,
      semanticSummary: relatedSemanticHunk?.summary ?? null,
    });
  }

  function clearReviewAnchor() {
    setReviewAnchor(null);
    setReviewNoteError(null);
    setReviewNoteText("");
    setPendingReviewQuestion(null);
  }

  async function handleSendReviewNote() {
    const trimmed = reviewNoteText.trim();
    if (!reviewAnchor || !trimmed || isStreaming || sendingReviewNote) {
      return;
    }

    const anchor = reviewAnchor;
    setSendingReviewNote(true);
    setReviewNoteError(null);
    setPendingReviewQuestion(trimmed);
    setReviewNoteText("");

    try {
      await sendPrompt(buildReplayReviewPrompt(anchor, trimmed));
      const latestAnswer = extractLatestAssistantAnswer(useTaskStore.getState().workspace?.snapshot);
      setSubmittedNotes((current) => [
        {
          id: globalThis.crypto.randomUUID(),
          anchor,
          question: trimmed,
          answer: latestAnswer,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setPendingReviewQuestion(null);
    } catch (error) {
      setPendingReviewQuestion(null);
      setReviewNoteText(trimmed);
      setReviewNoteError(normalizeError(error));
    } finally {
      setSendingReviewNote(false);
    }
  }

  const inlineComment: ReplayInlineComment | null =
    reviewAnchor && reviewAnchor.filePath === frame.editor.activeFilePath
      ? {
          filePath: reviewAnchor.filePath,
          lineNumber: reviewAnchor.lineNumber,
          lineText: reviewAnchor.lineText,
          commitShortOid: reviewAnchor.commitShortOid,
          replayStep: reviewAnchor.replayStep,
          replayStepCount: reviewAnchor.replayStepCount,
          semanticTitle: reviewAnchor.semanticTitle,
          semanticSummary: reviewAnchor.semanticSummary,
          thread: activeThread,
          pendingQuestion: pendingReviewQuestion,
          value: reviewNoteText,
          error: reviewNoteError,
          sending: sendingReviewNote,
          disabled: isStreaming,
          onChange: setReviewNoteText,
          onSend: () => void handleSendReviewNote(),
          onCancel: clearReviewAnchor,
        }
      : null;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
      <header className="border-b border-border/60 px-7 py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Git replay
            </div>
            <h2 className="mt-2 text-lg font-semibold">Commit playback review</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Reconstruct a commit as editor actions inside CodeMirror so review is about how code
              changed, not just the final diff.
            </p>
          </div>

          <div className="grid min-w-[320px] gap-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Repository source
            </div>
            <Select
              value={selectedSource?.id ?? ""}
              onValueChange={(value) => setSelectedSourceId(value)}
              disabled={repoSources.length === 0}
            >
              <SelectTrigger className="w-full rounded-md border-border/70 bg-black/10">
                <SelectValue placeholder="Choose a repository" />
              </SelectTrigger>
              <SelectContent>
                {repoSources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="truncate text-xs text-muted-foreground">
              {selectedSource?.detail ?? "Attach a repo resource or create a task worktree."}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
            {headReference ?? "No head loaded"}
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
            {history.length} commits
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
            {replayPlan?.operations.length ?? 0} replay steps
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
            {selectedSource?.path ?? workspace.task.worktreePath}
          </Badge>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)] divide-x divide-border/60">
        <aside className="min-h-0 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                History
              </div>
              <h3 className="mt-2 text-sm font-semibold">Commit timeline</h3>
            </div>
            {loadingHistory && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {historyError ? (
            <ReplayMessage
              title="Couldn’t load repository history"
              body={historyError}
              icon={<FolderGit2 className="h-4 w-4" />}
            />
          ) : history.length === 0 ? (
            <ReplayMessage
              title={selectedSource ? "No commits found" : "No repository source"}
              body={
                selectedSource
                  ? "This source didn’t return any commits yet."
                  : "Attach a repo resource or use a task with a git worktree."
              }
              icon={<GitCommitHorizontal className="h-4 w-4" />}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {history.map((commit) => {
                const active = commit.oid === selectedCommitId;
                return (
                  <button
                    key={commit.oid}
                    onClick={() => setSelectedCommitId(commit.oid)}
                    className={cn(
                      "w-full rounded-md border px-3 py-3 text-left transition-all",
                      active
                        ? "border-emerald-300/35 bg-emerald-300/[0.08] shadow-[0_0_30px_rgba(74,222,128,0.08)]"
                        : "border-transparent bg-white/[0.02] hover:border-border/70 hover:bg-white/[0.045]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {commit.summary}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {commit.authorName}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
                      >
                        {commit.shortOid}
                      </Badge>
                    </div>
                    <div className="mt-2 truncate text-xs text-muted-foreground">
                      {formatShortDate(commit.timestamp)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
          <div className="border-b border-border/60 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Replay theater
                </div>
                <h3 className="mt-2 truncate text-lg font-semibold">
                  {replay?.commit.summary ?? "Pick a commit"}
                </h3>
                <p className="mt-2 truncate text-sm text-muted-foreground">
                  {replay
                    ? `${replay.commit.authorName} • ${formatTimestamp(replay.commit.timestamp)} • ${replay.commit.shortOid}`
                    : "Select a commit from the timeline to load the replay plan."}
                </p>
              </div>

              <div className="grid min-w-[240px] grid-cols-3 gap-2">
                <StatCard label="Files" value={replay?.stats.filesChanged ?? 0} />
                <StatCard label="Insertions" value={replay?.stats.insertions ?? 0} />
                <StatCard label="Deletions" value={replay?.stats.deletions ?? 0} />
              </div>
            </div>
          </div>

          <div className="border-b border-border/60 px-6 py-4">
            <div className="rounded-xl border border-white/8 bg-slate-950/78 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.24)]">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setPlaying((current) => !current)}
                  disabled={!canReplay}
                  className="rounded-md"
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPlaybackCursor((current) => Math.max(current - 1, 0))
                  }
                  disabled={!canReplay}
                  className="rounded-md border-white/10 bg-white/[0.02]"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPlaybackCursor((current) => Math.min(current + 1, totalSteps))
                  }
                  disabled={!canReplay}
                  className="rounded-md border-white/10 bg-white/[0.02]"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Forward
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPlaying(false);
                    setPlaybackCursor(0);
                  }}
                  disabled={!canReplay}
                  className="rounded-md border-white/10 bg-white/[0.02]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>

                <label className="ml-auto flex items-center gap-3 text-xs text-slate-300">
                  <span className="uppercase tracking-[0.16em] text-slate-400">Speed</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    Slow
                  </span>
                  <input
                    type="range"
                    min={MIN_PLAYBACK_DELAY_MS}
                    max={MAX_PLAYBACK_DELAY_MS}
                    step="1"
                    value={MAX_PLAYBACK_DELAY_MS + MIN_PLAYBACK_DELAY_MS - speedMs}
                    onChange={(event) =>
                      setSpeedMs(
                        MAX_PLAYBACK_DELAY_MS + MIN_PLAYBACK_DELAY_MS - Number(event.target.value),
                      )
                    }
                    className="w-32 accent-emerald-400"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    Fast
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">{speedMs}ms</span>
                </label>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-lime-200 transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                <span>{safeCursor} / {totalSteps} steps</span>
                <span className="truncate text-right text-slate-400">{activeLabel}</span>
              </div>
            </div>
          </div>

          <div className="min-h-0 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid h-full min-h-[560px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-border/60 bg-black/20 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {frame.editor.activeFilePath}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {formatReplayStatus(frame.editor.activeFileStatus)}
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                      {frame.editor.activeFileIsBinary ? "Binary file" : "CodeMirror replay"}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {replay?.files.length ? (
                      replay.files.map((file, index) => {
                        const path = file.newPath ?? file.oldPath ?? "untitled";
                        const active = index === frame.editor.activeFileIndex;
                        return (
                          <Badge
                            key={`${path}-${index}`}
                            variant="outline"
                            className={cn(
                              "rounded-md border-border/70 bg-black/10 px-2.5 py-1 font-mono text-[11px]",
                              active &&
                                "border-emerald-300/45 bg-emerald-300/[0.08] text-emerald-100",
                            )}
                          >
                            {path}
                          </Badge>
                        );
                      })
                    ) : (
                      <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                        No file replay loaded
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="min-h-0">
                  {loadingReplay ? (
                    <EditorEmptyState
                      title="Building replay"
                      body="Collecting commit snapshots and hunk data from the git service."
                    />
                  ) : replayError ? (
                    <EditorEmptyState title="Couldn’t load replay" body={replayError} />
                  ) : !selectedCommitId ? (
                    <EditorEmptyState
                      title="Choose a commit"
                      body="Select a commit from the timeline to generate the replay plan."
                    />
                  ) : frame.editor.activeFileIndex === null ? (
                    <EditorEmptyState
                      title="Replay ready"
                      body="Press play or step forward to open the first changed file."
                    />
                  ) : frame.editor.activeFileIsBinary ? (
                    <EditorEmptyState
                      title="Binary file"
                      body="This file is part of the commit, but typed playback is skipped because it isn’t text."
                    />
                  ) : (
                    <GitReplayEditor
                      frame={frame}
                      loading={loadingReplay}
                      selectedLineNumber={selectedAnchorLineNumber}
                      inlineComment={inlineComment}
                      onLineSelect={handleReplayLineSelect}
                    />
                  )}
                </div>
              </div>

              <aside className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-border/60 bg-white/[0.02] shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
                <div className="border-b border-border/60 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Review lane
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">
                        Pause, click, and chat with the agent inline
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                      {submittedNotes.length} chats
                    </Badge>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-5 py-4">
                  <section className="rounded-xl border border-white/8 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          Ask the agent
                        </div>
                        <h4 className="mt-2 text-sm font-semibold text-foreground">
                          Click a line to ask a question or request a change right in the editor
                        </h4>
                      </div>
                    </div>

                    {reviewAnchor ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-md border-emerald-300/30 bg-emerald-300/[0.08] font-mono text-[10px] text-emerald-100"
                          >
                            {reviewAnchor.filePath}:{reviewAnchor.lineNumber}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
                          >
                            step {reviewAnchor.replayStep}/{reviewAnchor.replayStepCount}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
                          >
                            {reviewAnchor.commitShortOid}
                          </Badge>
                        </div>

                        <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2 font-mono text-xs text-slate-300">
                          {reviewAnchor.lineText || "(blank line)"}
                        </div>

                        <p className="text-xs leading-5 text-slate-400">
                          <span className="font-medium uppercase tracking-[0.16em] text-slate-500">
                            Composer open
                          </span>
                          {" "}
                          at {reviewAnchor.filePath}:{reviewAnchor.lineNumber}
                          {reviewAnchor.semanticTitle ? ` in ${reviewAnchor.semanticTitle}` : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Pause the replay and click a line in the editor to start a review question.
                      </p>
                    )}

                    {reviewAnchor ? (
                      <p className="mt-4 text-xs text-slate-400">
                        The inline composer is pinned to the selected line in the code view.
                      </p>
                    ) : null}
                  </section>

                  {submittedNotes.length > 0 ? (
                    <section className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Review Q&A
                        </div>
                        <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                          {submittedNotes.length}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-3">
                        {submittedNotes.slice(0, 6).map((note) => (
                          <article
                            key={note.id}
                            className="rounded-lg border border-white/8 bg-slate-950/60 px-3 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
                              >
                                {note.anchor.filePath}:{note.anchor.lineNumber}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
                              >
                                {note.anchor.commitShortOid}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              Question
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-200">{note.question}</p>
                            <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              Agent
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-300">
                              {note.answer ?? "The agent responded without a plain-text answer."}
                            </p>
                            <p className="mt-2 text-[11px] text-slate-500">
                              {formatSentTimestamp(note.createdAt)}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Semantic diff
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {semanticFile
                            ? `Logical changes in ${semanticFile.newPath ?? semanticFile.oldPath ?? "file"}`
                            : "Logical change groups"}
                        </div>
                      </div>
                      <Badge variant="outline" className="rounded-md border-border/70 bg-black/10">
                        {semanticHunks.length} semantic hunks
                      </Badge>
                    </div>

                    <div className="mt-4">
                      {loadingReplay ? (
                        <p className="text-sm text-muted-foreground">
                          Asking the semantic diff annotator to group and explain the meaningful changes.
                        </p>
                      ) : semanticHunks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No semantic annotations for this file yet. Very small changes may be omitted, or
                          the model may be unavailable in this runtime.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {semanticHunks.map((semanticHunk) => (
                            <article
                              key={semanticHunk.id}
                              className={cn(
                                "rounded-xl border border-white/8 bg-slate-950/70 p-4",
                                reviewAnchor?.semanticTitle === semanticHunk.title &&
                                  "border-emerald-300/35 bg-emerald-300/[0.08]",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "rounded-md px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                                    semanticKindClassName(semanticHunk.kind),
                                  )}
                                >
                                  {semanticKindLabel(semanticHunk.kind)}
                                </Badge>
                                {semanticHunk.confidence !== null &&
                                semanticHunk.confidence !== undefined ? (
                                  <span className="font-mono text-[11px] text-slate-400">
                                    {Math.round(semanticHunk.confidence * 100)}%
                                  </span>
                                ) : null}
                              </div>

                              <h4 className="mt-3 text-sm font-semibold text-foreground">
                                {semanticHunk.title}
                              </h4>

                              {semanticHunk.summary ? (
                                <p className="mt-2 text-sm leading-6 text-slate-200">
                                  {semanticHunk.summary}
                                </p>
                              ) : null}

                              {semanticHunk.rationale ? (
                                <p className="mt-3 text-xs leading-5 text-slate-400">
                                  <span className="font-medium uppercase tracking-[0.16em] text-slate-500">
                                    Why
                                  </span>
                                  {" "}
                                  {semanticHunk.rationale}
                                </p>
                              ) : null}

                              {semanticHunk.reviewNotes.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {semanticHunk.reviewNotes.slice(0, 3).map((note, index) => (
                                    <p
                                      key={`${semanticHunk.id}-note-${index}`}
                                      className="text-xs leading-5 text-slate-300"
                                    >
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  function applyHistory(result: CommitHistoryResult) {
    setHeadReference(result.headReference ?? null);
    setHistory(result.commits);
    setSelectedCommitId((current) =>
      current && result.commits.some((commit) => commit.oid === current)
        ? current
        : result.commits[0]?.oid ?? null,
    );
  }
}

function collectRepoSources(workspace: TaskWorkspaceViewModel): RepoSource[] {
  const seen = new Set<string>();
  const sources: RepoSource[] = [];

  if (workspace.task.worktreePath) {
    seen.add(workspace.task.worktreePath);
    sources.push({
      id: `worktree:${workspace.task.worktreePath}`,
      label: "Task worktree",
      path: workspace.task.worktreePath,
      detail: workspace.task.worktreePath,
    });
  }

  const sourceRepo = workspace.sourceRepo;
  if (sourceRepo?.kind === "repo" && sourceRepo.locator && !seen.has(sourceRepo.locator)) {
    seen.add(sourceRepo.locator);
    sources.push({
      id: `resource:${sourceRepo.id}`,
      label: sourceRepo.label || "Repository resource",
      path: sourceRepo.locator,
      detail: sourceRepo.locator,
    });
  }

  return sources;
}

function renderPlaybackLabel({
  loadingReplay,
  replayPlan,
  safeCursor,
  totalSteps,
  activeLabel,
  playing,
}: {
  loadingReplay: boolean;
  replayPlan: ReplayPlan | null;
  safeCursor: number;
  totalSteps: number;
  activeLabel: string | null;
  playing: boolean;
}) {
  if (loadingReplay) {
    return "Loading replay...";
  }

  if (!replayPlan) {
    return "Standing by";
  }

  if (totalSteps === 0) {
    return "No replay steps";
  }

  if (safeCursor === 0) {
    return "Queued at the starting frame";
  }

  if (safeCursor >= totalSteps && !playing) {
    return activeLabel ?? "Replay complete";
  }

  if (playing) {
    return activeLabel ?? "Now playing";
  }

  return activeLabel ?? "Paused";
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-white/[0.03] px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ReplayMessage({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-white/[0.02] px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function EditorEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center px-6 py-8">
      <div className="max-w-md text-center">
        <div className="text-base font-medium text-foreground">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong while talking to the backend.";
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatSentTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function findSemanticHunkForLine(semanticHunks: SemanticHunk[], lineNumber: number) {
  return semanticHunks.find((semanticHunk) => {
    if (
      semanticHunk.newStart !== null &&
      semanticHunk.newStart !== undefined &&
      semanticHunk.newEnd !== null &&
      semanticHunk.newEnd !== undefined
    ) {
      return lineNumber >= semanticHunk.newStart && lineNumber <= semanticHunk.newEnd;
    }

    if (
      semanticHunk.oldStart !== null &&
      semanticHunk.oldStart !== undefined &&
      semanticHunk.oldEnd !== null &&
      semanticHunk.oldEnd !== undefined
    ) {
      return lineNumber >= semanticHunk.oldStart && lineNumber <= semanticHunk.oldEnd;
    }

    return false;
  });
}

function buildReplayReviewPrompt(anchor: ReviewAnchor, note: string) {
  const contextLines = [
    "Review question from git replay.",
    "Answer the user's question directly. If the request is actionable, make the change. If something is unclear, ask follow-up questions.",
    `Repository: ${anchor.repositoryPath}`,
    `Commit: ${anchor.commitOid}`,
    `Replay step: ${anchor.replayStep}/${anchor.replayStepCount}`,
    anchor.operationLabel ? `Current replay operation: ${anchor.operationLabel}` : null,
    `File: ${anchor.filePath}`,
    `Line: ${anchor.lineNumber}`,
    `Line content: ${anchor.lineText || "(blank line)"}`,
    anchor.semanticTitle ? `Semantic hunk: ${anchor.semanticTitle}` : null,
    anchor.semanticSummary ? `Semantic summary: ${anchor.semanticSummary}` : null,
    "",
    "User question:",
    note,
  ].filter(Boolean);

  return contextLines.join("\n");
}

function extractLatestAssistantAnswer(
  snapshot: TaskWorkspaceViewModel["snapshot"] | null | undefined,
) {
  if (!snapshot) {
    return null;
  }

  const messages = snapshot.currentMessage
    ? [...snapshot.messages, snapshot.currentMessage]
    : snapshot.messages;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!latestAssistant) {
    return null;
  }

  const text = latestAssistant.segments
    .filter((segment) => segment.type === "text")
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text || null;
}

function sameReviewThread(left: ReviewAnchor, right: ReviewAnchor) {
  return (
    left.commitOid === right.commitOid &&
    left.filePath === right.filePath &&
    left.lineNumber === right.lineNumber
  );
}

function semanticKindLabel(kind: SemanticHunk["kind"]) {
  switch (kind) {
    case "annotated":
      return "Annotated";
    case "trivial":
      return "Trivial";
    case "unavailable":
      return "Fallback";
  }
}

function semanticKindClassName(kind: SemanticHunk["kind"]) {
  switch (kind) {
    case "annotated":
      return "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100";
    case "trivial":
      return "border-sky-300/30 bg-sky-300/[0.08] text-sky-100";
    case "unavailable":
      return "border-amber-300/30 bg-amber-300/[0.08] text-amber-100";
  }
}
