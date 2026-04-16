import type {
  CommitReplayFile,
  CommitReplayHunk,
  CommitReplayResult,
  ReplayFileStatus,
  ReplayLineKind,
} from "@/lib/git";

export interface ReplayPlan {
  files: ReplayPlanFile[];
  operations: ReplayOperation[];
}

export interface ReplayPlanFile {
  path: string;
  status: ReplayFileStatus;
  isBinary: boolean;
  initialLines: string[];
}

export interface ReplayEditorState {
  activeFileIndex: number | null;
  activeFilePath: string;
  activeFileStatus: ReplayFileStatus | null;
  activeFileIsBinary: boolean;
  lines: string[];
  cursorRow: number;
  cursorColumn: number;
}

export interface ReplayCursorCache {
  commitOid: string | null;
  appliedCount: number;
  editor: ReplayEditorState;
  activeOperation: ReplayOperation | null;
}

export interface ReplayFrame {
  editor: ReplayEditorState;
  activeOperation: ReplayOperation | null;
}

type ReplayOperation =
  | { kind: "openFile"; fileIndex: number; label: string }
  | { kind: "moveCursor"; row: number; column: number; label: string }
  | { kind: "insertLine"; row: number; label: string }
  | { kind: "deleteLine"; row: number; label: string }
  | { kind: "type"; text: string; label: string }
  | { kind: "backspace"; count: number; label: string }
  | { kind: "pause"; label: string };

interface EditBlockResult {
  nextRow: number;
  netOffset: number;
  changed: boolean;
}

export function buildReplayPlan(replay: CommitReplayResult): ReplayPlan {
  const files = replay.files.map((file) => ({
    path: displayPath(file),
    status: file.status,
    isBinary: file.isBinary,
    initialLines: splitEditorLines(file.oldContent),
  }));
  const operations: ReplayOperation[] = [];

  if (replay.files.length === 0) {
    operations.push({ kind: "pause", label: "No changed files in this commit." });
    return { files, operations };
  }

  replay.files.forEach((file, fileIndex) => {
    operations.push({
      kind: "openFile",
      fileIndex,
      label: `Open ${files[fileIndex]?.path ?? "untitled"}`,
    });

    if (file.isBinary) {
      operations.push({
        kind: "pause",
        label: `${files[fileIndex]?.path ?? "Binary file"} is binary and skipped.`,
      });
      return;
    }

    const workingLines = splitEditorLines(file.oldContent);
    const targetLines = splitEditorLines(file.newContent);
    let rowOffset = 0;
    let touched = false;

    for (const hunk of file.hunks) {
      operations.push({
        kind: "pause",
        label: hunk.header || `Apply edits in ${files[fileIndex]?.path ?? "file"}`,
      });

      const result = appendHunkOperations(workingLines, hunk, operations, rowOffset);
      rowOffset = result.netOffset;
      touched = touched || result.changed;
    }

    if (!linesEqual(workingLines, targetLines)) {
      applyWholeFileRewrite(workingLines, targetLines, operations);
      touched = true;
    }

    operations.push({
      kind: "pause",
      label: touched
        ? `Completed ${files[fileIndex]?.path ?? "file"}`
        : `${files[fileIndex]?.path ?? "file"} unchanged`,
    });
  });

  return { files, operations };
}

export function createReplayCursorCache(): ReplayCursorCache {
  return {
    commitOid: null,
    appliedCount: 0,
    editor: createEmptyEditorState(),
    activeOperation: null,
  };
}

export function createEmptyEditorState(): ReplayEditorState {
  return {
    activeFileIndex: null,
    activeFilePath: "No file selected",
    activeFileStatus: null,
    activeFileIsBinary: false,
    lines: [],
    cursorRow: 0,
    cursorColumn: 0,
  };
}

export function syncReplayFrame(
  plan: ReplayPlan | null,
  commitOid: string | null,
  appliedCount: number,
  cache: ReplayCursorCache,
): ReplayFrame {
  if (!plan || !commitOid) {
    cache.commitOid = null;
    cache.appliedCount = 0;
    cache.editor = createEmptyEditorState();
    cache.activeOperation = null;
    return {
      editor: cache.editor,
      activeOperation: cache.activeOperation,
    };
  }

  const safeCount = clamp(appliedCount, 0, plan.operations.length);

  if (cache.commitOid !== commitOid || safeCount < cache.appliedCount) {
    cache.commitOid = commitOid;
    cache.appliedCount = 0;
    cache.editor = createEmptyEditorState();
    cache.activeOperation = null;
  }

  while (cache.appliedCount < safeCount) {
    const operation = plan.operations[cache.appliedCount];
    if (!operation) {
      break;
    }

    applyOperation(plan, cache.editor, operation);
    cache.activeOperation = operation;
    cache.appliedCount += 1;
  }

  if (safeCount === 0) {
    cache.activeOperation = null;
  }

  return {
    editor: cache.editor,
    activeOperation: cache.activeOperation,
  };
}

export function formatReplayStatus(status: ReplayFileStatus | null): string {
  if (!status) {
    return "Idle";
  }

  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "modified":
      return "Modified";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "typechange":
      return "Typechange";
    case "unmodified":
      return "Unmodified";
  }
}

export function splitEditorLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function appendHunkOperations(
  workingLines: string[],
  hunk: CommitReplayHunk,
  operations: ReplayOperation[],
  rowOffset: number,
): { netOffset: number; changed: boolean } {
  let currentRow = clamp((Math.max(hunk.oldStart, 1) - 1) + rowOffset, 0, workingLines.length);
  let pendingDeletions: string[] = [];
  let pendingAdditions: string[] = [];
  let changed = false;

  const flush = () => {
    if (pendingDeletions.length === 0 && pendingAdditions.length === 0) {
      return;
    }

    const result = applyEditBlock(
      workingLines,
      currentRow,
      pendingDeletions,
      pendingAdditions,
      operations,
    );
    currentRow = result.nextRow;
    rowOffset += result.netOffset;
    changed = changed || result.changed;
    pendingDeletions = [];
    pendingAdditions = [];
  };

  for (const line of hunk.lines) {
    if (isContextLine(line.kind)) {
      flush();
      currentRow += 1;
      continue;
    }

    if (isDeletionLine(line.kind)) {
      pendingDeletions.push(line.content);
      continue;
    }

    if (isAdditionLine(line.kind)) {
      pendingAdditions.push(line.content);
    }
  }

  flush();

  return { netOffset: rowOffset, changed };
}

function applyEditBlock(
  workingLines: string[],
  startRow: number,
  deletions: string[],
  additions: string[],
  operations: ReplayOperation[],
): EditBlockResult {
  let row = clamp(startRow, 0, workingLines.length);
  const paired = Math.min(deletions.length, additions.length);
  let changed = false;

  for (let index = 0; index < paired; index += 1) {
    rewriteLine(workingLines, row, additions[index] ?? "", operations);
    row += 1;
    changed = true;
  }

  for (let index = paired; index < deletions.length; index += 1) {
    deleteExistingLine(workingLines, row, operations);
    changed = true;
  }

  for (let index = paired; index < additions.length; index += 1) {
    insertNewLine(workingLines, row, additions[index] ?? "", operations);
    row += 1;
    changed = true;
  }

  return {
    nextRow: row,
    netOffset: additions.length - deletions.length,
    changed,
  };
}

function applyWholeFileRewrite(
  workingLines: string[],
  targetLines: string[],
  operations: ReplayOperation[],
) {
  const paired = Math.min(workingLines.length, targetLines.length);

  for (let index = 0; index < paired; index += 1) {
    const target = targetLines[index] ?? "";
    if ((workingLines[index] ?? "") !== target) {
      rewriteLine(workingLines, index, target, operations);
    }
  }

  while (workingLines.length > targetLines.length) {
    deleteExistingLine(workingLines, targetLines.length, operations);
  }

  while (workingLines.length < targetLines.length) {
    insertNewLine(
      workingLines,
      workingLines.length,
      targetLines[workingLines.length] ?? "",
      operations,
    );
  }
}

function rewriteLine(
  workingLines: string[],
  row: number,
  nextLine: string,
  operations: ReplayOperation[],
) {
  if (row >= workingLines.length) {
    insertNewLine(workingLines, row, nextLine, operations);
    return;
  }

  const current = workingLines[row] ?? "";
  const prefix = commonPrefixLength(current, nextLine);
  const deletions = current.length - prefix;

  operations.push({
    kind: "moveCursor",
    row,
    column: current.length,
    label: `Move to line ${row + 1}`,
  });

  for (let index = 0; index < deletions; index += 1) {
    operations.push({
      kind: "backspace",
      count: 1,
      label: `Backspace on line ${row + 1}`,
    });
  }

  for (const character of nextLine.slice(prefix)) {
    operations.push({
      kind: "type",
      text: character,
      label: `Type on line ${row + 1}`,
    });
  }

  workingLines[row] = nextLine;
}

function deleteExistingLine(
  workingLines: string[],
  row: number,
  operations: ReplayOperation[],
) {
  if (row >= workingLines.length) {
    return;
  }

  const existing = workingLines[row] ?? "";
  operations.push({
    kind: "moveCursor",
    row,
    column: existing.length,
    label: `Move to line ${row + 1}`,
  });

  for (let index = 0; index < existing.length; index += 1) {
    operations.push({
      kind: "backspace",
      count: 1,
      label: `Backspace on line ${row + 1}`,
    });
  }

  operations.push({
    kind: "deleteLine",
    row,
    label: `Delete line ${row + 1}`,
  });

  workingLines.splice(row, 1);
}

function insertNewLine(
  workingLines: string[],
  row: number,
  nextLine: string,
  operations: ReplayOperation[],
) {
  const safeRow = clamp(row, 0, workingLines.length);
  operations.push({
    kind: "insertLine",
    row: safeRow,
    label: `Insert line ${safeRow + 1}`,
  });
  operations.push({
    kind: "moveCursor",
    row: safeRow,
    column: 0,
    label: `Move to line ${safeRow + 1}`,
  });

  for (const character of nextLine) {
    operations.push({
      kind: "type",
      text: character,
      label: `Type on line ${safeRow + 1}`,
    });
  }

  workingLines.splice(safeRow, 0, nextLine);
}

function applyOperation(
  plan: ReplayPlan,
  editor: ReplayEditorState,
  operation: ReplayOperation,
) {
  switch (operation.kind) {
    case "openFile": {
      const file = plan.files[operation.fileIndex];
      if (!file) {
        return;
      }

      editor.activeFileIndex = operation.fileIndex;
      editor.activeFilePath = file.path;
      editor.activeFileStatus = file.status;
      editor.activeFileIsBinary = file.isBinary;
      editor.lines = [...file.initialLines];
      editor.cursorRow = 0;
      editor.cursorColumn = 0;
      return;
    }
    case "moveCursor": {
      const row = clamp(operation.row, 0, Math.max(editor.lines.length - 1, 0));
      const column = Math.min(operation.column, editor.lines[row]?.length ?? 0);
      editor.cursorRow = row;
      editor.cursorColumn = column;
      return;
    }
    case "insertLine": {
      const row = clamp(operation.row, 0, editor.lines.length);
      editor.lines.splice(row, 0, "");
      editor.cursorRow = row;
      editor.cursorColumn = 0;
      return;
    }
    case "deleteLine": {
      if (editor.lines.length === 0) {
        editor.cursorRow = 0;
        editor.cursorColumn = 0;
        return;
      }

      const row = clamp(operation.row, 0, editor.lines.length - 1);
      editor.lines.splice(row, 1);
      editor.cursorRow = Math.min(row, Math.max(editor.lines.length - 1, 0));
      editor.cursorColumn = Math.min(
        editor.cursorColumn,
        editor.lines[editor.cursorRow]?.length ?? 0,
      );
      return;
    }
    case "type": {
      ensureCursorLine(editor);
      const row = clamp(editor.cursorRow, 0, Math.max(editor.lines.length - 1, 0));
      const current = editor.lines[row] ?? "";
      const column = clamp(editor.cursorColumn, 0, current.length);
      editor.lines[row] = `${current.slice(0, column)}${operation.text}${current.slice(column)}`;
      editor.cursorRow = row;
      editor.cursorColumn = column + operation.text.length;
      return;
    }
    case "backspace": {
      ensureCursorLine(editor);
      const row = clamp(editor.cursorRow, 0, Math.max(editor.lines.length - 1, 0));
      const current = editor.lines[row] ?? "";
      const column = clamp(editor.cursorColumn, 0, current.length);
      const count = Math.min(operation.count, column);
      editor.lines[row] = `${current.slice(0, column - count)}${current.slice(column)}`;
      editor.cursorRow = row;
      editor.cursorColumn = column - count;
      return;
    }
    case "pause":
      return;
  }
}

function ensureCursorLine(editor: ReplayEditorState) {
  if (editor.lines.length === 0) {
    editor.lines.push("");
    editor.cursorRow = 0;
    editor.cursorColumn = 0;
  }
}

function displayPath(file: CommitReplayFile): string {
  return file.newPath ?? file.oldPath ?? "untitled";
}

function linesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((line, index) => line === right[index]);
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function isContextLine(kind: ReplayLineKind): boolean {
  return kind === "context" || kind === "contextEofNl";
}

function isDeletionLine(kind: ReplayLineKind): boolean {
  return kind === "deletion" || kind === "deleteEofNl";
}

function isAdditionLine(kind: ReplayLineKind): boolean {
  return kind === "addition" || kind === "addEofNl";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
