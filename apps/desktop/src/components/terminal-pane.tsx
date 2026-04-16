import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TaskWorkspaceViewModel, TerminalEvent } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";
import { useTheme } from "@/hooks/use-theme";

const DARK_THEME = {
  background: "#282c34",
  foreground: "#abb2bf",
  cursor: "#61afef",
  cursorAccent: "#282c34",
  selectionBackground: "rgba(97, 175, 239, 0.2)",
  black: "#282c34",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

const LIGHT_THEME = {
  background: "#faf6f0",
  foreground: "#3d3329",
  cursor: "#c8872e",
  cursorAccent: "#faf6f0",
  selectionBackground: "rgba(200, 135, 46, 0.18)",
  black: "#3d3329",
  red: "#c44040",
  green: "#5d8a3e",
  yellow: "#b58a2e",
  blue: "#c8872e",
  magenta: "#8a5db5",
  cyan: "#3e8a8a",
  white: "#8a7d6b",
  brightBlack: "#8a7d6b",
  brightRed: "#c44040",
  brightGreen: "#5d8a3e",
  brightYellow: "#b58a2e",
  brightBlue: "#c8872e",
  brightMagenta: "#8a5db5",
  brightCyan: "#3e8a8a",
  brightWhite: "#3d3329",
};

function terminalThemeFor(theme: "dark" | "light") {
  return theme === "light" ? LIGHT_THEME : DARK_THEME;
}

export function TerminalPane({ workspace }: { workspace: TaskWorkspaceViewModel }) {
  const attachTerminal = useTaskStore((state) => state.attachTerminal);
  const writeTerminal = useTaskStore((state) => state.writeTerminal);
  const resizeTerminal = useTaskStore((state) => state.resizeTerminal);
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const delayedFitRef = useRef<number | null>(null);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = termRef.current;
    if (term) {
      term.options.theme = terminalThemeFor(theme);
    }
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const term = new Terminal({
      theme: terminalThemeFor(theme),
      fontFamily:
        '"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: false,
      scrollback: 5000,
    });
    termRef.current = term;
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    let lastMeasuredWidth = 0;
    let lastMeasuredHeight = 0;

    const fitAndResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (width === lastMeasuredWidth && height === lastMeasuredHeight) return;
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
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (!disposed) fitAndResize();
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
        setStatus("Connecting");
        setError(null);
        const snapshot = await attachTerminal(
          workspace.task.id,
          Math.max(term.cols, 80),
          Math.max(term.rows, 24),
          writeEvent,
        );
        if (disposed) return;
        if (snapshot.output) term.write(snapshot.output);
        scheduleFit();
        setStatus(workspace.task.worktreePath);
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
      if (!disposed) scheduleFit();
    };

    window.addEventListener("resize", handleWindowResize);
    scheduleFit();
    delayedFitRef.current = window.setTimeout(() => {
      if (!disposed) scheduleFit();
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
      termRef.current = null;
    };
  }, [attachTerminal, resizeTerminal, workspace.task.id, workspace.task.worktreePath, writeTerminal]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted">
      {/* Minimal status bar */}
      <div className="flex h-7 items-center border-b border-border/40 px-3">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />
              {status}
            </>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            {error}
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full px-2 py-1" />
        )}
      </div>
    </div>
  );
}
