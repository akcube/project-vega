import { useEffect, useMemo, useRef } from "react";
import { Bot } from "lucide-react";

import { MessageBubble } from "@/components/message-bubble";
import { MessageInput } from "@/components/message-input";
import { useSession } from "@/hooks/use-session";
import type { WorkspaceSnapshot } from "@/lib/types";

export function AgentView({
  snapshot,
  isStreaming,
}: {
  snapshot: WorkspaceSnapshot;
  isStreaming: boolean;
}) {
  const { sendPrompt, cancel } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(
    () =>
      snapshot.currentMessage
        ? [...snapshot.messages, snapshot.currentMessage]
        : snapshot.messages,
    [snapshot],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, snapshot.currentMessage?.segments.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/30">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Start the task</h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Send a prompt to begin. Thinking, tool calls, and diffs will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border/40 px-5 py-3">
        <div className="mx-auto max-w-2xl">
          <MessageInput onSend={sendPrompt} onCancel={cancel} isStreaming={isStreaming} disabled={false} />
        </div>
      </div>
    </div>
  );
}
