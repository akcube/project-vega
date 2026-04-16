import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TaskWorkspaceViewModel, TerminalEvent } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

const ONE_DARK_THEME = {
  background: "#11161d",
  foreground: "#abb2bf",
  cursor: "#61afef",
  cursorAccent: "#11161d",
  selectionBackground: "rgba(97, 175, 239, 0.24)",
  black: "#282c34",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#dcdfe4",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

export function TerminalPane({ workspace }: { workspace: TaskWorkspaceViewModel }) {
  const attachTerminal = useTaskStore((state) => state.attachTerminal);
  const writeTerminal = useTaskStore((state) => state.writeTerminal);
  const resizeTerminal = useTaskStore((state) => state.resizeTerminal);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const delayedFitRef = useRef<number | null>(null);
  const [status, setStatus] = useState("Connecting terminal");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const term = new Terminal({
      theme: ONE_DARK_THEME,
      fontFamily:
        'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    let lastMeasuredWidth = 0;
    let lastMeasuredHeight = 0;

    const fitAndResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      if (width === lastMeasuredWidth && height === lastMeasuredHeight) {
        return;
      }
      lastMeasuredWidth = width;
      lastMeasuredHeight = height;
      fitAddon.fit();
      void resizeTerminal(
        workspace.task.id,
        Math.max(term.cols, 80),
        Math.max(term.rows, 24),
      );
    };

    const scheduleFit = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (!disposed) {
          fitAndResize();
        }
      });
    };

    const writeEvent = (event: TerminalEvent) => {
      if (disposed) return;
      if (event.type === "output") {
        term.write(event.data);
        return;
      }
      term.write(`\r\n[process exited ${event.exitCode}]\r\n`);
    };

    const boot = async () => {
      try {
        setStatus("Connecting terminal");
        setError(null);
        const snapshot = await attachTerminal(
          workspace.task.id,
          Math.max(term.cols, 80),
          Math.max(term.rows, 24),
          writeEvent,
        );
        if (disposed) return;
        if (snapshot.output) {
          term.write(snapshot.output);
        }
        scheduleFit();
        setStatus(`Shell at ${workspace.task.worktreePath}`);
      } catch (nextError) {
        if (!disposed) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    };

    const dataDisposable = term.onData((data) => {
      void writeTerminal(workspace.task.id, data);
    });

    const handleWindowResize = () => {
      if (!disposed) {
        scheduleFit();
      }
    };

    window.addEventListener("resize", handleWindowResize);
    scheduleFit();
    delayedFitRef.current = window.setTimeout(() => {
      if (!disposed) {
        scheduleFit();
      }
    }, 120);

    void boot();

    return () => {
      disposed = true;
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (delayedFitRef.current !== null) {
        window.clearTimeout(delayedFitRef.current);
        delayedFitRef.current = null;
      }
      window.removeEventListener("resize", handleWindowResize);
      dataDisposable.dispose();
      term.dispose();
    };
  }, [attachTerminal, resizeTerminal, workspace.task.id, workspace.task.worktreePath, writeTerminal]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
        {error ?? status}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full px-4 py-4" />
        )}
      </div>
    </div>
  );
}
