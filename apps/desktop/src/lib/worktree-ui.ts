import type {
  WorktreeChangeKind,
  WorktreeInspectionViewModel,
  WorktreeTreeNode,
} from "@/lib/types";

export function fileNameFromPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function directoryAncestors(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function findFirstFile(nodes: WorktreeTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "file") return node.path;
    const nested = findFirstFile(node.children);
    if (nested) return nested;
  }
  return null;
}

export function treeContainsPath(nodes: WorktreeTreeNode[], targetPath: string): boolean {
  return nodes.some((node) => {
    if (node.path === targetPath) return true;
    return treeContainsPath(node.children, targetPath);
  });
}

export function pickInitialDocumentPath(
  overview: WorktreeInspectionViewModel,
  preferredPath?: string | null,
) {
  if (
    preferredPath &&
    (treeContainsPath(overview.tree, preferredPath) ||
      overview.changedFiles.some((entry) => entry.path === preferredPath))
  ) {
    return preferredPath;
  }

  const changedCandidate = overview.changedFiles.find((entry) => entry.kind !== "deleted");
  if (changedCandidate) return changedCandidate.path;
  return findFirstFile(overview.tree);
}

export function buildInitialExpandedPaths(
  overview: WorktreeInspectionViewModel,
  selectedPath?: string | null,
) {
  const expanded = new Set<string>();

  for (const entry of overview.changedFiles) {
    for (const ancestor of directoryAncestors(entry.path)) {
      expanded.add(ancestor);
    }
  }

  if (selectedPath) {
    for (const ancestor of directoryAncestors(selectedPath)) {
      expanded.add(ancestor);
    }
  }

  for (const node of overview.tree) {
    if (node.kind === "directory") {
      expanded.add(node.path);
    }
  }

  return expanded;
}

export function changeKindLabel(kind: WorktreeChangeKind) {
  switch (kind) {
    case "added":
      return "Added";
    case "modified":
      return "Modified";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "typechange":
      return "Type";
  }
}
