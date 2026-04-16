import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FolderGit2,
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
        const result = await loadCommitHistory(source.path, 1);
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-border/60 px-7 py-6">
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
              <SelectTrigger className="w-full rounded-md border-border/70 bg-muted/50">
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
          <Badge variant="outline" className="rounded-md border-border/70 bg-muted/50">
            {headReference ?? "No head loaded"}
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-muted/50">
            {history.length} commits
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-muted/50">
            {replayPlan?.operations.length ?? 0} replay steps
          </Badge>
          <Badge variant="outline" className="rounded-md border-border/70 bg-muted/50">
            {selectedSource?.path ?? workspace.task.worktreePath}
          </Badge>
        </div>
      </header>

      <div className="flex min-h-[600px] flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col">
          {historyError ? (
            <div className="px-6 py-4">
              <ReplayMessage
                title="Couldn’t load repository history"
                body={historyError}
                icon={<FolderGit2 className="h-4 w-4" />}
              />
            </div>
          ) : null}
          <div className="border-b border-border/60 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Replay theater
                </div>
                <h3 className="mt-2 truncate text-lg font-semibold">
                  {replay?.commit.summary ?? "Loading latest commit..."}
                </h3>
                <p className="mt-2 truncate text-sm text-muted-foreground">
                  {replay
                    ? `${replay.commit.authorName} • ${formatTimestamp(replay.commit.timestamp)} • ${replay.commit.shortOid}`
                    : "Fetching the latest commit for replay."}
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
            <div className="rounded-xl border border-border/40 bg-card/80 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
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
                  className="rounded-md"
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
                  className="rounded-md"
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
                  className="rounded-md"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>

                <label className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="uppercase tracking-[0.16em] text-muted-foreground">Speed</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
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
                    className="w-32 accent-primary"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Fast
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{speedMs}ms</span>
                </label>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-chart-5 to-chart-2 transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{safeCursor} / {totalSteps} steps</span>
                <span className="truncate text-right text-muted-foreground/80">{activeLabel}</span>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[180px_minmax(0,1fr)_320px] divide-x divide-border/40">
            {/* ── Changed files sidebar ── */}
            <aside className="min-h-0 overflow-y-auto bg-card/30 px-2 py-3">
              <div className="mb-2 px-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Changed files
              </div>
              {replay?.files.length ? (
                replay.files.map((file, index) => {
                  const path = file.newPath ?? file.oldPath ?? "untitled";
                  const fileName = path.split("/").pop() ?? path;
                  const active = index === frame.editor.activeFileIndex;
                  return (
                    <button
                      key={`${path}-${index}`}
                      type="button"
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "bg-primary/12 text-foreground ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      <span className="min-w-0 truncate font-mono">{fileName}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2 text-xs text-muted-foreground">
                  {loadingReplay ? "Loading..." : "No files"}
                </div>
              )}

            </aside>

            {/* ── Editor pane ── */}
            <section className="grid min-h-0 grid-rows-[auto_1fr]">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {frame.editor.activeFilePath}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {formatReplayStatus(frame.editor.activeFileStatus)}
                  </div>
                </div>
                <Badge variant="outline" className="rounded-md border-border/70 bg-muted/50 text-[10px]">
                  {frame.editor.activeFileIsBinary ? "Binary" : "Replay"}
                </Badge>
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
                    title="No commit loaded"
                    body="Waiting for the latest commit to load."
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
            </section>

            {/* ── Annotations & review sidebar ── */}
            <aside className="min-h-0 overflow-y-auto bg-card/30 px-4 py-4">
              {/* Semantic diff annotations */}
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Semantic diff
              </div>
              <div className="mt-1 text-xs font-medium text-foreground">
                {semanticFile
                  ? `${semanticFile.newPath ?? semanticFile.oldPath ?? "file"}`
                  : "Logical change groups"}
              </div>

              <div className="mt-3">
                {loadingReplay ? (
                  <p className="text-xs text-muted-foreground">
                    Grouping and explaining the meaningful changes...
                  </p>
                ) : semanticHunks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No semantic annotations for this file yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {semanticHunks.map((semanticHunk) => (
                      <article
                        key={semanticHunk.id}
                        className={cn(
                          "rounded-lg border border-border/40 bg-card/60 p-3",
                          reviewAnchor?.semanticTitle === semanticHunk.title &&
                            "border-primary/35 bg-primary/[0.08]",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                              semanticKindClassName(semanticHunk.kind),
                            )}
                          >
                            {semanticKindLabel(semanticHunk.kind)}
                          </Badge>
                          {semanticHunk.confidence !== null &&
                          semanticHunk.confidence !== undefined ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {Math.round(semanticHunk.confidence * 100)}%
                            </span>
                          ) : null}
                        </div>

                        <h4 className="mt-2 text-xs font-semibold text-foreground">
                          {semanticHunk.title}
                        </h4>

                        {semanticHunk.summary ? (
                          <p className="mt-1.5 text-xs leading-5 text-foreground/80">
                            {semanticHunk.summary}
                          </p>
                        ) : null}

                        {semanticHunk.rationale ? (
                          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                            <span className="font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                              Why
                            </span>
                            {" "}
                            {semanticHunk.rationale}
                          </p>
                        ) : null}

                        {semanticHunk.reviewNotes.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {semanticHunk.reviewNotes.slice(0, 3).map((note, index) => (
                              <p
                                key={`${semanticHunk.id}-note-${index}`}
                                className="text-[11px] leading-4 text-muted-foreground"
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

              {/* Review anchor */}
              {reviewAnchor ? (
                <div className="mt-5 border-t border-border/30 pt-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Review anchor
                  </div>
                  <div className="mt-2 space-y-2">
                    <Badge
                      variant="outline"
                      className="rounded-md border-primary/30 bg-primary/[0.08] font-mono text-[10px] text-primary"
                    >
                      {reviewAnchor.filePath}:{reviewAnchor.lineNumber}
                    </Badge>
                    <div className="rounded-md border border-border/40 bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {reviewAnchor.lineText || "(blank line)"}
                    </div>
                    {reviewAnchor.semanticTitle ? (
                      <p className="text-[11px] text-muted-foreground">
                        in {reviewAnchor.semanticTitle}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Q&A history */}
              {submittedNotes.length > 0 ? (
                <div className="mt-5 border-t border-border/30 pt-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Q&A ({submittedNotes.length})
                  </div>
                  <div className="mt-2 space-y-2">
                    {submittedNotes.slice(0, 6).map((note) => (
                      <div
                        key={note.id}
                        className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-2"
                      >
                        <p className="text-xs font-medium text-foreground">{note.question}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {note.answer ?? "No answer."}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {formatSentTimestamp(note.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
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
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
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
    <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-4">
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
      return "border-chart-2/35 bg-chart-2/[0.08] text-chart-2";
    case "trivial":
      return "border-chart-5/30 bg-chart-5/[0.08] text-chart-5";
    case "unavailable":
      return "border-chart-3/30 bg-chart-3/[0.08] text-chart-3";
  }
}
