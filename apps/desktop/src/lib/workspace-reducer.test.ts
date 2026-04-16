import { applySessionUpdate, appendOptimisticUserMessage, buildReviewSummary } from "@/lib/workspace-reducer";
import type { WorkspaceSnapshot } from "@/lib/types";

describe("workspace reducer", () => {
  it("builds transcript segments from a streamed assistant turn", () => {
    const start: WorkspaceSnapshot = { messages: [], currentMessage: null };
    const withUser = appendOptimisticUserMessage(start, "Check the build");
    const withThinking = applySessionUpdate(withUser, {
      type: "thinkingChunk",
      text: "Looking at the failing target",
    });
    const withText = applySessionUpdate(withThinking, {
      type: "textChunk",
      text: "I found the root cause.",
    });
    const done = applySessionUpdate(withText, {
      type: "done",
      stopReason: "end_turn",
    });

    expect(done.messages).toHaveLength(2);
    expect(done.currentMessage).toBeNull();
    expect(done.messages[1].segments).toHaveLength(2);
  });

  it("extracts diff summaries from tool call segments", () => {
    const snapshot = applySessionUpdate(
      { messages: [], currentMessage: null },
      {
        type: "toolCall",
        toolCallId: "call-1",
        title: "Edit shell",
        kind: "edit",
        status: "completed",
        content: [
          {
            type: "diff",
            path: "src/App.tsx",
            oldText: "before",
            newText: "after",
          },
        ],
      },
    );
    const done = applySessionUpdate(snapshot, {
      type: "done",
      stopReason: "end_turn",
    });
    const review = buildReviewSummary(done);

    expect(review.toolCalls).toHaveLength(1);
    expect(review.diffs[0]?.path).toBe("src/App.tsx");
  });
});
