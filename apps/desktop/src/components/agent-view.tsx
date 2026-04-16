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
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-4 text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border/70 bg-white/[0.04]">
              <Bot className="h-7 w-7 opacity-60" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Start the task</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Send a prompt to begin the run. Live thinking, tool calls, and reviewable diffs will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <MessageInput onSend={sendPrompt} onCancel={cancel} isStreaming={isStreaming} disabled={false} />
        </div>
      </div>
    </div>
  );
}
