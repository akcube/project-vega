import { useState, useRef, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function MessageInput({
  onSend,
  onCancel,
  isStreaming,
  disabled,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        className="min-h-[40px] max-h-[160px] resize-none rounded-lg border-border/40 bg-muted/40 pr-12 text-[13px] placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/30"
        disabled={disabled || isStreaming}
        rows={1}
      />
      <div className="absolute bottom-1.5 right-1.5">
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/80 text-white transition-colors hover:bg-destructive"
          >
            <Square className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/80 text-primary-foreground transition-colors hover:bg-primary disabled:opacity-30 disabled:hover:bg-primary/80"
          >
            <Send className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
