import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionUpdate } from "@/lib/types";
import { useTaskStore } from "@/stores/task-store";

export function useSession() {
  const store = useTaskStore();

  const sendPrompt = async (text: string) => {
    const taskId = store.selectedTaskId;
    if (!taskId || store.isStreaming) return;

    store.beginStreaming(text);

    const channel = new Channel<SessionUpdate>();
    channel.onmessage = (update) => {
      store.applyStreamUpdate(update);
    };

    try {
      await invoke("send_prompt", { taskId, text, onEvent: channel });
    } finally {
      await store.finishStreaming();
    }
  };

  const cancel = async () => {
    const taskId = store.selectedTaskId;
    if (!taskId) return;
    await invoke("cancel_run", { taskId });
    await store.refreshWorkspace();
  };

  return { sendPrompt, cancel };
}
