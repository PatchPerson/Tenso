import { createSignal } from "solid-js";
import type { KeyValue } from "../lib/api";

const STORAGE_KEY = "reqlite-global-vars";

const [globalVars, setGlobalVars] = createSignal<KeyValue[]>([]);

export { globalVars, setGlobalVars };

export function loadGlobalVars() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setGlobalVars(JSON.parse(stored));
    }
  } catch {
    // ignore corrupt data
  }
}

export function saveGlobalVars(vars: KeyValue[]) {
  setGlobalVars(vars);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vars));
}

export function resolveGlobals(text: string): string {
  const vars = globalVars();
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = vars.find(v => v.enabled && v.key === key);
    return v ? v.value : match;
  });
}

export function getGlobalVarNames(): Set<string> {
  return new Set(globalVars().filter(v => v.enabled && v.key).map(v => v.key));
}
