import { describe, expect, it } from "vitest";

import {
  buildInitialExpandedPaths,
  changeKindLabel,
  fileNameFromPath,
  pickInitialDocumentPath,
} from "@/lib/worktree-ui";
import type { WorktreeInspectionViewModel } from "@/lib/types";

const overview: WorktreeInspectionViewModel = {
  rootName: "repo",
  rootPath: "/tmp/repo",
  isTruncated: false,
  stats: {
    filesChanged: 2,
    insertions: 8,
    deletions: 3,
  },
  changedFiles: [
    { path: "src/app.tsx", kind: "modified", additions: 6, deletions: 2 },
    { path: "README.md", kind: "deleted", additions: 0, deletions: 1 },
  ],
  tree: [
    {
      name: "src",
      path: "src",
      kind: "directory",
      isChanged: true,
      changedDescendantCount: 1,
      children: [
        {
          name: "app.tsx",
          path: "src/app.tsx",
          kind: "file",
          isChanged: true,
          changedDescendantCount: 1,
          children: [],
        },
      ],
    },
    {
      name: "package.json",
      path: "package.json",
      kind: "file",
      isChanged: false,
      changedDescendantCount: 0,
      children: [],
    },
  ],
};

describe("worktree ui helpers", () => {
  it("picks readable file names from paths", () => {
    expect(fileNameFromPath("src/app.tsx")).toBe("app.tsx");
    expect(fileNameFromPath("README.md")).toBe("README.md");
  });

  it("prefers a changed non-deleted file when picking the initial document", () => {
    expect(pickInitialDocumentPath(overview)).toBe("src/app.tsx");
    expect(pickInitialDocumentPath(overview, "package.json")).toBe("package.json");
  });

  it("expands changed directories and labels change kinds", () => {
    const expanded = buildInitialExpandedPaths(overview, "src/app.tsx");
    expect(expanded.has("src")).toBe(true);
    expect(changeKindLabel("typechange")).toBe("Type");
  });
});
