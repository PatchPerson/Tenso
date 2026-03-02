import { createSignal } from "solid-js";
import * as api from "../lib/api";

const [history, setHistory] = createSignal<api.HistoryEntry[]>([]);
const [historySearch, setHistorySearch] = createSignal("");

export { history, setHistory, historySearch, setHistorySearch };

export async function loadHistory(workspaceId: string) {
  const entries = await api.listHistory(workspaceId, 200);
  setHistory(entries);
}

export async function clearAllHistory(workspaceId: string) {
  await api.clearHistory(workspaceId);
  setHistory([]);
}

export function filteredHistory() {
  const search = historySearch().toLowerCase();
  if (!search) return history();
  return history().filter(h =>
    h.url.toLowerCase().includes(search) ||
    h.method.toLowerCase().includes(search)
  );
}
