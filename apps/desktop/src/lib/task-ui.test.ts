import { describe, expect, it } from "vitest";

import {
  defaultModelForProvider,
  repoSelectionMode,
  stateLabel,
  WORKFLOW_STATES,
} from "@/lib/task-ui";

describe("task ui helpers", () => {
  it("chooses a default model per provider", () => {
    expect(defaultModelForProvider("Codex")).toBe("gpt-5-codex");
    expect(defaultModelForProvider("Claude")).toBe("claude-sonnet-4-5");
  });

  it("switches repo selection mode by repo count", () => {
    expect(repoSelectionMode([])).toBe("auto");
    expect(repoSelectionMode([{ id: "1" } as never])).toBe("auto");
    expect(repoSelectionMode([{ id: "1" } as never, { id: "2" } as never])).toBe("manual");
  });

  it("keeps the workflow state ordering stable", () => {
    expect(WORKFLOW_STATES).toEqual(["todo", "in_progress", "blocked", "completed"]);
    expect(stateLabel("blocked")).toBe("Blocked");
  });
});
