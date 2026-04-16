import type { Extension } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";

export function languageExtensionForPath(filePath: string): Extension {
  const normalized = filePath.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs")
  ) {
    return javascript({ jsx: normalized.endsWith(".jsx") });
  }

  if (
    normalized.endsWith(".ts") ||
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".mts") ||
    normalized.endsWith(".cts")
  ) {
    return javascript({
      jsx: normalized.endsWith(".tsx"),
      typescript: true,
    });
  }

  if (normalized.endsWith(".json")) {
    return json();
  }

  if (normalized.endsWith(".rs")) {
    return rust();
  }

  if (normalized.endsWith(".py")) {
    return python();
  }

  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return markdown();
  }

  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) {
    return html();
  }

  if (
    normalized.endsWith(".css") ||
    normalized.endsWith(".scss") ||
    normalized.endsWith(".sass") ||
    normalized.endsWith(".less")
  ) {
    return css();
  }

  if (
    normalized.endsWith(".c") ||
    normalized.endsWith(".cc") ||
    normalized.endsWith(".cpp") ||
    normalized.endsWith(".cxx") ||
    normalized.endsWith(".h") ||
    normalized.endsWith(".hh") ||
    normalized.endsWith(".hpp") ||
    normalized.endsWith(".hxx")
  ) {
    return cpp();
  }

  return [];
}
