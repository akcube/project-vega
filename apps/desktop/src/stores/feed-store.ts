import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { FeedEntry } from "@/lib/types";

interface FeedState {
  entries: FeedEntry[];
  unreadCount: number;

  loadEntries: () => Promise<void>;
  addEntry: (entry: FeedEntry) => void;
  markRead: (entryId: string) => Promise<void>;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  entries: [],
  unreadCount: 0,

  loadEntries: async () => {
    const entries = await invoke<FeedEntry[]>("list_feed_entries", { limit: 100 });
    const unreadCount = await invoke<number>("count_unread_feed_entries");
    set({ entries, unreadCount });
  },

  addEntry: (entry: FeedEntry) => {
    set((state) => ({
      entries: [entry, ...state.entries],
      unreadCount: state.unreadCount + (entry.isRead ? 0 : 1),
    }));
  },

  markRead: async (entryId: string) => {
    await invoke("mark_feed_entry_read", { entryId });
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === entryId ? { ...e, isRead: true } : e,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },
}));
