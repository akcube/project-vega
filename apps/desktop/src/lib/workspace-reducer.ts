import type {
  ChatMessage,
  MessageSegment,
  PlanEntry,
  ReviewSummary,
  SessionUpdate,
  TaskWorkspaceViewModel,
  ToolCallState,
  ToolContent,
  WorkspaceSnapshot,
} from "@/lib/types";

function nextMessageId(snapshot: WorkspaceSnapshot) {
  return `msg-${snapshot.messages.length + (snapshot.currentMessage ? 1 : 0) + 1}`;
}

function ensureAssistantMessage(snapshot: WorkspaceSnapshot) {
  if (!snapshot.currentMessage) {
    snapshot.currentMessage = {
      id: nextMessageId(snapshot),
      role: "assistant",
      segments: [],
    };
  }
}

function finalizeCurrentMessage(snapshot: WorkspaceSnapshot) {
  if (snapshot.currentMessage && snapshot.currentMessage.segments.length > 0) {
    snapshot.messages = [...snapshot.messages, snapshot.currentMessage];
  }
  snapshot.currentMessage = null;
}

function appendTextLikeSegment(
  snapshot: WorkspaceSnapshot,
  type: "text" | "thinking",
  text: string,
) {
  if (!text) return;
  ensureAssistantMessage(snapshot);
  const current = snapshot.currentMessage!;
  const last = current.segments[current.segments.length - 1];
  if (last?.type === type) {
    current.segments[current.segments.length - 1] = {
      ...last,
      text: last.text + text,
    } as MessageSegment;
    return;
  }
  current.segments.push({ type, text } as MessageSegment);
}

function renderPlan(entries: PlanEntry[]) {
  return entries.map((entry) => `[${entry.status}] ${entry.content}`).join("\n");
}

export function appendOptimisticUserMessage(
  snapshot: WorkspaceSnapshot,
  text: string,
): WorkspaceSnapshot {
  finalizeCurrentMessage(snapshot);
  return {
    ...snapshot,
    messages: [
      ...snapshot.messages,
      {
        id: nextMessageId(snapshot),
        role: "user",
        segments: [{ type: "text", text }],
      },
    ],
  };
}

export function applySessionUpdate(
  snapshot: WorkspaceSnapshot,
  update: SessionUpdate,
): WorkspaceSnapshot {
  const next: WorkspaceSnapshot = {
    messages: [...snapshot.messages],
    currentMessage: snapshot.currentMessage
      ? {
          ...snapshot.currentMessage,
          segments: [...snapshot.currentMessage.segments],
        }
      : null,
  };

  switch (update.type) {
    case "textChunk":
      appendTextLikeSegment(next, "text", update.text);
      return next;
    case "thinkingChunk":
      appendTextLikeSegment(next, "thinking", update.text);
      return next;
    case "toolCall": {
      ensureAssistantMessage(next);
      next.currentMessage!.segments.push({
        type: "toolCall",
        toolCall: {
          id: update.toolCallId,
          title: update.title,
          kind: update.kind,
          status: update.status,
          content: update.content,
        },
      });
      return next;
    }
    case "toolCallUpdate": {
      ensureAssistantMessage(next);
      next.currentMessage!.segments = next.currentMessage!.segments.map((segment) =>
        segment.type === "toolCall" && segment.toolCall.id === update.toolCallId
          ? {
              type: "toolCall",
              toolCall: {
                ...segment.toolCall,
                status: update.status || segment.toolCall.status,
                content:
                  update.content.length > 0
                    ? update.content
                    : segment.toolCall.content,
              },
            }
          : segment,
      );
      return next;
    }
    case "plan":
      appendTextLikeSegment(next, "thinking", renderPlan(update.entries));
      return next;
    case "done":
      finalizeCurrentMessage(next);
      return next;
    case "error":
      appendTextLikeSegment(next, "text", `Error: ${update.message}`);
      finalizeCurrentMessage(next);
      return next;
  }
}

export function buildReviewSummary(snapshot: WorkspaceSnapshot): ReviewSummary {
  const toolCalls: ToolCallState[] = [];
  const diffs: ReviewSummary["diffs"] = [];
  const messages: ChatMessage[] = snapshot.currentMessage
    ? [...snapshot.messages, snapshot.currentMessage]
    : snapshot.messages;

  for (const message of messages) {
    for (const segment of message.segments) {
      if (segment.type !== "toolCall") continue;
      toolCalls.unshift(segment.toolCall);
      for (const item of segment.toolCall.content) {
        if (item.type === "diff") {
          diffs.unshift({
            path: item.path,
            oldText: item.oldText,
            newText: item.newText,
          });
        }
      }
    }
  }

  return { toolCalls, diffs };
}

export function applyLiveUpdateToWorkspace(
  workspace: TaskWorkspaceViewModel,
  update: SessionUpdate,
): TaskWorkspaceViewModel {
  const snapshot = applySessionUpdate(workspace.snapshot, update);
  return {
    ...workspace,
    snapshot,
    review: buildReviewSummary(snapshot),
    live: {
      ...workspace.live,
      isStreaming: update.type !== "done" && update.type !== "error",
    },
  };
}
