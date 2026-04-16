import { invoke } from "@tauri-apps/api/core";

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface CommitSummary {
  oid: string;
  shortOid: string;
  summary: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  parentOids: string[];
}

export interface CommitHistoryResult {
  repositoryPath: string;
  headReference?: string | null;
  commits: CommitSummary[];
}

export interface CommitReplayResult {
  repositoryPath: string;
  commit: CommitSummary;
  stats: DiffStats;
  files: CommitReplayFile[];
}

export interface CommitReplayFile {
  oldPath?: string | null;
  newPath?: string | null;
  status: ReplayFileStatus;
  oldContent: string;
  newContent: string;
  isBinary: boolean;
  hunks: CommitReplayHunk[];
  semanticHunks: SemanticHunk[];
}

export interface CommitReplayHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: CommitReplayLine[];
}

export interface CommitReplayLine {
  kind: ReplayLineKind;
  content: string;
  oldLineno?: number | null;
  newLineno?: number | null;
}

export interface SemanticHunk {
  id: string;
  title: string;
  summary?: string | null;
  rationale?: string | null;
  reviewNotes: string[];
  confidence?: number | null;
  kind: SemanticHunkKind;
  rawHunkIndexes: number[];
  oldStart?: number | null;
  oldEnd?: number | null;
  newStart?: number | null;
  newEnd?: number | null;
}

export type ReplayFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "copied"
  | "typechange"
  | "unmodified";

export type ReplayLineKind =
  | "context"
  | "addition"
  | "deletion"
  | "contextEofNl"
  | "addEofNl"
  | "deleteEofNl";

export type SemanticHunkKind = "annotated" | "trivial" | "unavailable";

export function loadCommitHistory(repositoryPath: string, maxCount = 80) {
  return invoke<CommitHistoryResult>("load_commit_history", {
    request: {
      repositoryPath,
      maxCount,
    },
  });
}

export function loadCommitReplay(repositoryPath: string, commitOid: string, contextLines = 3) {
  return invoke<CommitReplayResult>("load_commit_replay", {
    request: {
      repositoryPath,
      commitOid,
      contextLines,
    },
  });
}
