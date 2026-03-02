import { createSignal } from "solid-js";
import * as api from "../lib/api";

const [history, setHistory] = createSignal<api.HistoryEntry[]>([]);
const [historySearch, setHistorySearch] = createSignal("");

export { history, setHistory, historySearch, setHistorySearch };

const [historyRefreshTrigger, setHistoryRefreshTrigger] = createSignal(0);
export { historyRefreshTrigger };
export function triggerHistoryRefresh() {
  setHistoryRefreshTrigger(historyRefreshTrigger() + 1);
}

export async function loadHistory(teamId: string) {
  const entries = await api.listHistory(teamId, 200);
  setHistory(entries);
}

export async function clearAllHistory(teamId: string) {
  await api.clearHistory(teamId);
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
