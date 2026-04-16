import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallBlock } from "./tool-call-block";
import type { ChatMessage } from "@/lib/types";
import { User, Bot } from "lucide-react";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`fade-rise flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? "bg-chart-2/15 text-chart-2 ring-1 ring-chart-2/20"
            : "bg-muted/60 text-muted-foreground ring-1 ring-border/30"
        }`}
      >
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {message.segments.map((segment, i) => {
          if (segment.type === "thinking") {
            return <ThinkingBlock key={i} text={segment.text} />;
          }
          if (segment.type === "toolCall") {
            const toolCall = "toolCall" in segment ? segment.toolCall : undefined;
            if (!toolCall) {
              return null;
            }
            return <ToolCallBlock key={toolCall.id ?? i} toolCall={toolCall} />;
          }
          return (
            <div
              key={i}
              className={`inline-block max-w-full rounded-lg px-3 py-2 text-left text-[13px] leading-relaxed ${
                isUser
                  ? "bg-primary/15 text-foreground ring-1 ring-primary/15"
                  : "bg-muted/40 text-foreground ring-1 ring-border/20"
              }`}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:rounded-lg [&_pre]:bg-muted/60 [&_pre]:ring-1 [&_pre]:ring-border/20">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {segment.text}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
