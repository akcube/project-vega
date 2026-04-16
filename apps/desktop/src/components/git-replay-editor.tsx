import { useEffect, useRef } from "react";
import {
  Compartment,
  EditorState as CodeMirrorState,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { languageExtensionForPath } from "@/lib/code-language";
import type { ReplayFrame } from "@/lib/git-replay";

export interface ReplayLineSelection {
  filePath: string;
  lineNumber: number;
  lineText: string;
}

export interface ReplayInlineComment {
  filePath: string;
  lineNumber: number;
  lineText: string;
  commitShortOid: string;
  replayStep: number;
  replayStepCount: number;
  semanticTitle?: string | null;
  semanticSummary?: string | null;
  thread: ReplayInlineCommentEntry[];
  pendingQuestion?: string | null;
  value: string;
  error?: string | null;
  sending: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export interface ReplayInlineCommentEntry {
  id: string;
  question: string;
  answer: string | null;
  createdAt: string;
}

const replayTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--color-foreground)",
      fontSize: "14px",
    },
    ".cm-scroller": {
      fontFamily:
        'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: "1.7",
    },
    ".cm-content": {
      padding: "18px 0 28px",
      caretColor: "#6ee7b7",
    },
    ".cm-line": {
      paddingLeft: "18px",
      paddingRight: "24px",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      color: "rgba(226,232,240,0.45)",
      minWidth: "52px",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(74,222,128,0.14)",
      boxShadow: "inset 3px 0 0 rgba(110,231,183,0.72)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(74,222,128,0.18)",
      color: "rgba(226,232,240,0.9)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(110,231,183,0.18)",
    },
    ".cm-cursor, &.cm-focused .cm-cursor, .cm-cursorLayer .cm-cursor": {
      display: "none",
    },
    ".cm-panels": {
      backgroundColor: "rgba(15, 23, 42, 0.86)",
      color: "var(--color-foreground)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(250, 204, 21, 0.18)",
      outline: "1px solid rgba(250, 204, 21, 0.28)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(250, 204, 21, 0.28)",
    },
    "@keyframes vegaCursorPulse": {
      "0%, 100%": { opacity: "1" },
      "50%": { opacity: "0.78" },
    },
  },
  { dark: true },
);

export function GitReplayEditor({
  frame,
  loading,
  selectedLineNumber,
  inlineComment,
  onLineSelect,
}: {
  frame: ReplayFrame;
  loading: boolean;
  selectedLineNumber?: number | null;
  inlineComment?: ReplayInlineComment | null;
  onLineSelect?: (selection: ReplayLineSelection) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const commentBoxRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const lineSelectRef = useRef(onLineSelect);
  const activeFilePathRef = useRef(frame.editor.activeFilePath);

  useEffect(() => {
    lineSelectRef.current = onLineSelect;
  }, [onLineSelect]);

  useEffect(() => {
    activeFilePathRef.current = frame.editor.activeFilePath;
  }, [frame.editor.activeFilePath]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const view = new EditorView({
      state: CodeMirrorState.create({
        doc: "",
        extensions: [
          basicSetup,
          oneDark,
          replayTheme,
          languageCompartmentRef.current.of(languageExtensionForPath(frame.editor.activeFilePath)),
          CodeMirrorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            mousedown(event, view) {
              const position = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              if (position === null) {
                return false;
              }

              const line = view.state.doc.lineAt(position);
              view.dispatch({
                selection: { anchor: line.from },
                scrollIntoView: true,
              });

              lineSelectRef.current?.({
                filePath: activeFilePathRef.current,
                lineNumber: line.number,
                lineText: line.text,
              });

              return false;
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        languageExtensionForPath(frame.editor.activeFilePath),
      ),
    });
  }, [frame.editor.activeFilePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!selectedLineNumber || selectedLineNumber < 1) {
      return;
    }

    const line = view.state.doc.line(Math.min(selectedLineNumber, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      scrollIntoView: true,
    });
  }, [frame.editor.activeFilePath, selectedLineNumber]);

  useEffect(() => {
    const view = viewRef.current;
    const wrapper = wrapperRef.current;
    const commentBox = commentBoxRef.current;
    if (!view || !wrapper || !commentBox) {
      return;
    }

    if (
      !inlineComment ||
      inlineComment.filePath !== frame.editor.activeFilePath ||
      view.state.doc.lines === 0
    ) {
      commentBox.style.opacity = "0";
      commentBox.style.pointerEvents = "none";
      return;
    }

    requestAnimationFrame(() => {
      if (viewRef.current !== view || wrapperRef.current !== wrapper || commentBoxRef.current !== commentBox) {
        return;
      }

      positionInlineCommentBox(view, wrapper, commentBox, inlineComment.lineNumber);
    });
  }, [
    frame.editor.activeFilePath,
    inlineComment,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    const wrapper = wrapperRef.current;
    const cursor = cursorRef.current;
    if (!view) {
      return;
    }

    const docText = frame.editor.lines.join("\n");
    const cursorOffset = Math.min(computeCursorOffset(frame), docText.length);
    const currentSelection = view.state.selection.main.anchor;
    const nextUpdate: Parameters<EditorView["dispatch"]>[number] = {};

    if (view.state.doc.toString() !== docText) {
      nextUpdate.changes = {
        from: 0,
        to: view.state.doc.length,
        insert: docText,
      };
    }

    if (currentSelection !== cursorOffset || loading) {
      nextUpdate.selection = { anchor: cursorOffset };
      nextUpdate.effects = EditorView.scrollIntoView(cursorOffset, {
        y: "center",
        yMargin: 48,
      });
    }

    if (nextUpdate.changes || nextUpdate.selection || nextUpdate.effects) {
      view.dispatch(nextUpdate);
    }

    requestAnimationFrame(() => {
      if (viewRef.current !== view || !wrapper || !cursor) {
        return;
      }

      positionPlaybackCursor(view, wrapper, cursor, cursorOffset);
    });
  }, [frame, loading]);

  return (
    <div ref={wrapperRef} className="relative h-full min-h-0 overflow-hidden">
      <div ref={containerRef} className="h-full min-h-0" />
      {inlineComment && inlineComment.filePath === frame.editor.activeFilePath ? (
        <div
          ref={commentBoxRef}
          className="absolute z-30 rounded-xl border border-emerald-300/25 bg-slate-950/96 p-4 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur"
          style={{
            opacity: 0,
            pointerEvents: "auto",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-md border-emerald-300/30 bg-emerald-300/[0.08] font-mono text-[10px] text-emerald-100"
            >
              {inlineComment.filePath}:{inlineComment.lineNumber}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
            >
              step {inlineComment.replayStep}/{inlineComment.replayStepCount}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md border-border/70 bg-black/10 font-mono text-[10px]"
            >
              {inlineComment.commitShortOid}
            </Badge>
          </div>

          <div className="mt-3 rounded-lg border border-white/8 bg-black/30 px-3 py-2 font-mono text-xs text-slate-300">
            {inlineComment.lineText || "(blank line)"}
          </div>

          {inlineComment.semanticTitle ? (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              <span className="font-medium uppercase tracking-[0.16em] text-slate-500">
                Semantic context
              </span>
              {" "}
              {inlineComment.semanticTitle}
              {inlineComment.semanticSummary ? `: ${inlineComment.semanticSummary}` : ""}
            </p>
          ) : null}

          {inlineComment.thread.length > 0 || inlineComment.pendingQuestion ? (
            <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
              {inlineComment.thread.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                    You
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                    {entry.question}
                  </p>
                  <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Agent
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {entry.answer ?? "The agent responded without a plain-text answer."}
                  </p>
                </div>
              ))}

              {inlineComment.pendingQuestion ? (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-200/80">
                    You
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                    {inlineComment.pendingQuestion}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-200/80">
                    <span>Agent</span>
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    Thinking through this line with the replay context.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <Textarea
            value={inlineComment.value}
            onChange={(event) => inlineComment.onChange(event.target.value)}
            placeholder="Ask what this line does, why it changed, or request a change from the agent."
            className="mt-3 min-h-28 border-white/10 bg-black/20 text-sm text-slate-100 caret-emerald-200 placeholder:text-slate-500"
            disabled={inlineComment.disabled || inlineComment.sending}
          />

          {inlineComment.error ? (
            <p className="mt-3 text-xs text-red-300">{inlineComment.error}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={inlineComment.onSend}
              disabled={!inlineComment.value.trim() || inlineComment.disabled || inlineComment.sending}
              className="rounded-md"
            >
              {inlineComment.sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ask agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={inlineComment.onCancel}
              disabled={inlineComment.sending}
              className="rounded-md border-white/10 bg-white/[0.02]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div
        ref={cursorRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-20 w-1 rounded-full bg-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_0_16px_rgba(110,231,183,0.8)] transition-transform duration-75 ease-out"
        style={{
          height: "0px",
          opacity: 0,
          transform: "translate(0px, 0px)",
        }}
      />
    </div>
  );
}

function computeCursorOffset(frame: ReplayFrame) {
  let offset = 0;

  for (let index = 0; index < frame.editor.cursorRow; index += 1) {
    offset += (frame.editor.lines[index]?.length ?? 0) + 1;
  }

  const currentLineLength = frame.editor.lines[frame.editor.cursorRow]?.length ?? 0;
  offset += Math.min(frame.editor.cursorColumn, currentLineLength);

  return offset;
}

function positionPlaybackCursor(
  view: EditorView,
  wrapper: HTMLDivElement,
  cursor: HTMLDivElement,
  cursorOffset: number,
) {
  const safeOffset = Math.min(cursorOffset, view.state.doc.length);
  const wrapperRect = wrapper.getBoundingClientRect();
  const contentRect = view.contentDOM.getBoundingClientRect();
  const coords = view.coordsAtPos(safeOffset);
  const top = coords?.top ?? contentRect.top;
  const bottom = coords?.bottom ?? top + view.defaultLineHeight;
  const left = coords?.left ?? contentRect.left;

  cursor.style.height = `${Math.max(bottom - top, view.defaultLineHeight)}px`;
  cursor.style.opacity = "1";
  cursor.style.transform = `translate(${Math.max(left - wrapperRect.left, 0)}px, ${Math.max(top - wrapperRect.top, 0)}px)`;
}

function positionInlineCommentBox(
  view: EditorView,
  wrapper: HTMLDivElement,
  commentBox: HTMLDivElement,
  lineNumber: number,
) {
  const safeLineNumber = clamp(lineNumber, 1, Math.max(view.state.doc.lines, 1));
  const line = view.state.doc.line(safeLineNumber);
  const lineCoords = view.coordsAtPos(line.from);
  const wrapperRect = wrapper.getBoundingClientRect();
  const contentRect = view.contentDOM.getBoundingClientRect();
  const left = Math.max(contentRect.left - wrapperRect.left + 12, 72);
  const width = Math.min(Math.max(wrapperRect.width - left - 24, 260), 480);
  const preferredTop = (lineCoords?.bottom ?? contentRect.top) - wrapperRect.top + 10;
  const boxHeight = Math.max(commentBox.getBoundingClientRect().height, 220);
  const top =
    preferredTop + boxHeight > wrapperRect.height - 16
      ? Math.max((lineCoords?.top ?? contentRect.top) - wrapperRect.top - boxHeight - 10, 12)
      : preferredTop;

  commentBox.style.left = `${left}px`;
  commentBox.style.top = `${top}px`;
  commentBox.style.width = `${width}px`;
  commentBox.style.opacity = "1";
  commentBox.style.pointerEvents = "auto";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
