import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallBlock } from "./tool-call-block";
import type { ChatMessage } from "@/lib/types";
import { User, Bot } from "lucide-react";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`fade-rise flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
          isUser
            ? "border-emerald-300/35 bg-emerald-300/[0.1] text-emerald-50"
            : "border-border/70 bg-white/[0.03]"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
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
              className={`inline-block max-w-full rounded-md border px-3 py-2 text-left text-sm ${
                isUser
                  ? "border-emerald-300/35 bg-emerald-300/[0.1] text-emerald-50"
                  : "border-border/60 bg-white/[0.03]"
              }`}
            >
              <div className="prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
