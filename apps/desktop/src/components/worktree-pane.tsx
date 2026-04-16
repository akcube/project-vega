import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  FileCode2,
  FileDiff,
  Folder,
  FolderOpen,
  FolderTree,
  RefreshCw,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { languageExtensionForPath } from "@/lib/code-language";
import {
  buildInitialExpandedPaths,
  changeKindLabel,
  fileNameFromPath,
  pickInitialDocumentPath,
} from "@/lib/worktree-ui";
import type {
  TaskWorkspaceViewModel,
  WorktreeChangeKind,
  WorktreeFileDocument,
  WorktreeInspectionViewModel,
  WorktreeTreeNode,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

const vegaLightEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--card)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--primary) 12%, transparent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--primary) 18%, transparent)",
    },
    ".cm-cursor, &.cm-focused .cm-cursor": {
      borderLeftColor: "var(--primary)",
    },
  },
  { dark: false },
);

const changeTone: Record<WorktreeChangeKind, string> = {
  added: "text-chart-2",
  modified: "text-primary",
  deleted: "text-destructive",
  renamed: "text-chart-3",
  copied: "text-chart-4",
  typechange: "text-chart-5",
};

type CodeMirrorExtension = NonNullable<ComponentProps<typeof CodeMirror>["extensions"]>[number];

interface TreeBranchProps {
  nodes: WorktreeTreeNode[];
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggleDirectory: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function TreeBranch({
  nodes,
  depth,
  selectedPath,
  expandedPaths,
  onToggleDirectory,
  onOpenFile,
}: TreeBranchProps) {
  return (
    <>
      {nodes.map((node) => {
        const isDirectory = node.kind === "directory";
        const expanded = isDirectory && expandedPaths.has(node.path);
        const active = selectedPath === node.path;
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => (isDirectory ? onToggleDirectory(node.path) : onOpenFile(node.path))}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                active
                  ? "bg-primary/12 text-foreground ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
            >
              {isDirectory ? (
                <>
                  <ChevronRight
                    className={cn("h-3 w-3 shrink-0 transition-transform", expanded && "rotate-90")}
                  />
                  {expanded ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-3 shrink-0" />
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                </>
              )}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {node.changedDescendantCount > 0 ? (
                <span className="rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] text-chart-3">
                  {isDirectory ? node.changedDescendantCount : "M"}
                </span>
              ) : null}
            </button>
            {isDirectory && expanded ? (
              <TreeBranch
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onToggleDirectory={onToggleDirectory}
                onOpenFile={onOpenFile}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function WorktreePane({ workspace }: { workspace: TaskWorkspaceViewModel }) {
  const { theme } = useTheme();
  const taskId = workspace.task.id;
  const requestIdRef = useRef(0);

  const [overview, setOverview] = useState<WorktreeInspectionViewModel | null>(null);
  const [document, setDocument] = useState<WorktreeFileDocument | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editorValue, setEditorValue] = useState("");
  const [languageExtension, setLanguageExtension] = useState<CodeMirrorExtension | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !!document &&
    !document.isBinary &&
    !document.isDeleted &&
    editorValue !== document.text;
  const selectedChange = useMemo(
    () => overview?.changedFiles.find((entry) => entry.path === selectedPath) ?? null,
    [overview, selectedPath],
  );

  const loadDocument = useCallback(
    async (path: string, currentTaskId: string, requestId: number) => {
      const nextDocument = await invoke<WorktreeFileDocument>("read_worktree_file", {
        taskId: currentTaskId,
        relativePath: path,
      });
      if (requestId !== requestIdRef.current) return;
      setSelectedPath(path);
      setDocument(nextDocument);
      setEditorValue(nextDocument.text);
    },
    [],
  );

  const refreshInspection = useCallback(
    async (preferredPath?: string | null) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const nextOverview = await invoke<WorktreeInspectionViewModel>("inspect_worktree", {
          taskId,
        });
        if (requestId !== requestIdRef.current) return;
        setOverview(nextOverview);
        const nextPath = pickInitialDocumentPath(nextOverview, preferredPath);
        setExpandedPaths(buildInitialExpandedPaths(nextOverview, nextPath));
        if (nextPath) {
          await loadDocument(nextPath, taskId, requestId);
        } else {
          setSelectedPath(null);
          setDocument(null);
          setEditorValue("");
        }
      } catch (reason) {
        if (requestId === requestIdRef.current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [loadDocument, taskId],
  );

  useEffect(() => {
    void refreshInspection(null);
  }, [refreshInspection]);

  useEffect(() => {
    if (!document || document.isBinary || document.isDeleted) {
      setLanguageExtension(null);
      return;
    }

    setLanguageExtension(languageExtensionForPath(document.path));
  }, [document]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && dirty) {
        event.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  const openFile = async (path: string) => {
    if (path === selectedPath) return;
    if (dirty && !window.confirm("Discard unsaved changes in the current file?")) return;
    setExpandedPaths((current) => {
      const next = new Set(current);
      for (const entry of buildInitialExpandedPaths(
        overview ?? {
          rootName: "",
          rootPath: "",
          isTruncated: false,
          tree: [],
          changedFiles: [],
          stats: { filesChanged: 0, insertions: 0, deletions: 0 },
        },
        path,
      )) {
        next.add(entry);
      }
      return next;
    });
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      await loadDocument(path, taskId, requestId);
    } catch (reason) {
      if (requestId === requestIdRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
  };

  const toggleDirectory = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleReload = async () => {
    if (dirty && !window.confirm("Discard unsaved changes and reload the worktree view?")) return;
    await refreshInspection(selectedPath);
  };

  async function handleSave() {
    if (!selectedPath || !document || document.isBinary || document.isDeleted || !dirty) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await invoke<WorktreeFileDocument>("save_worktree_file", {
        taskId,
        relativePath: selectedPath,
        contents: editorValue,
      });
      setDocument(saved);
      setEditorValue(saved.text);
      await refreshInspection(selectedPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(220px,18rem)_minmax(0,1fr)_minmax(240px,18rem)] divide-x divide-border/30 bg-background">
      <aside className="min-h-0 overflow-hidden bg-card/50">
        <div className="flex h-12 items-center gap-2 border-b border-border/30 px-4">
          <FolderTree className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{overview?.rootName ?? workspace.task.worktreeName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{workspace.task.worktreePath}</div>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-2 py-3">
          {overview?.isTruncated ? (
            <div className="mb-2 rounded-md border border-chart-3/20 bg-chart-3/8 px-2 py-1.5 text-[11px] text-chart-3">
              Tree trimmed for responsiveness.
            </div>
          ) : null}
          {overview ? (
            <TreeBranch
              nodes={overview.tree}
              depth={0}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggleDirectory={toggleDirectory}
              onOpenFile={(path) => void openFile(path)}
            />
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-background">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-border/30 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {selectedPath ? fileNameFromPath(selectedPath) : "Open a file"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {selectedPath ?? "Select a file from the tree or changed files list"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedChange ? (
              <span className={cn("text-[11px] font-medium", changeTone[selectedChange.kind])}>
                {changeKindLabel(selectedChange.kind)}
              </span>
            ) : null}
            {document ? (
              <span className="text-[11px] text-muted-foreground">{document.lineCount} lines</span>
            ) : null}
            {dirty ? (
              <span className="rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] text-chart-3">
                Unsaved
              </span>
            ) : null}
            <Button size="xs" variant="ghost" onClick={() => void handleReload()}>
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
              Reload
            </Button>
            <Button size="xs" onClick={() => void handleSave()} disabled={!dirty || isSaving || !document || document.isBinary || document.isDeleted}>
              <Save className={cn("h-3 w-3", isSaving && "animate-spin")} />
              Save
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-destructive">
              {error}
            </div>
          ) : isLoading && !overview ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
              Loading worktree...
            </div>
          ) : !document ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
              No file selected.
            </div>
          ) : document.isDeleted ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="max-w-sm text-center">
                <div className="text-sm font-semibold text-foreground">{document.path}</div>
                <div className="mt-1 text-xs text-muted-foreground">This file was deleted from the worktree.</div>
              </div>
            </div>
          ) : document.isBinary ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="max-w-sm text-center">
                <div className="text-sm font-semibold text-foreground">{document.path}</div>
                <div className="mt-1 text-xs text-muted-foreground">Binary files are listed here but not rendered in the editor.</div>
              </div>
            </div>
          ) : (
            <CodeMirror
              value={editorValue}
              height="100%"
              theme={theme === "dark" ? oneDark : vegaLightEditorTheme}
              extensions={languageExtension ? [languageExtension] : []}
              onChange={(value) => setEditorValue(value)}
              basicSetup={{
                foldGutter: false,
                autocompletion: false,
              }}
              className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border/30 [&_.cm-scroller]:font-mono"
            />
          )}
        </div>
      </section>

      <aside className="min-h-0 overflow-hidden bg-card/35">
        <div className="border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileDiff className="h-4 w-4 text-chart-3" />
            <div className="text-xs font-semibold text-foreground">Affected Files</div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{overview?.stats.filesChanged ?? 0} files</span>
            <span className="text-chart-2">+{overview?.stats.insertions ?? 0}</span>
            <span className="text-destructive">-{overview?.stats.deletions ?? 0}</span>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-2 py-2">
          {overview?.changedFiles.length ? (
            overview.changedFiles.map((entry) => {
              const active = entry.path === selectedPath;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => void openFile(entry.path)}
                  className={cn(
                    "mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                    active
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-muted/50",
                  )}
                >
                  <span className={cn("mt-0.5 h-2 w-2 rounded-full shrink-0", {
                    "bg-chart-2": entry.kind === "added",
                    "bg-primary": entry.kind === "modified" || entry.kind === "renamed" || entry.kind === "copied" || entry.kind === "typechange",
                    "bg-destructive": entry.kind === "deleted",
                  })} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {fileNameFromPath(entry.path)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{entry.path}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      <span className={cn("font-medium", changeTone[entry.kind])}>
                        {changeKindLabel(entry.kind)}
                      </span>
                      <span className="text-chart-2">+{entry.additions}</span>
                      <span className="text-destructive">-{entry.deletions}</span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-2 py-3 text-xs text-muted-foreground">No local file changes yet.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
