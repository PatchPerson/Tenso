import { Component, Show, createSignal, onCleanup, onMount } from "solid-js";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export const UpdateCheck: Component = () => {
  const [update, setUpdate] = createSignal<{ version: string; body: string } | null>(null);
  const [installing, setInstalling] = createSignal(false);

  const checkForUpdate = async () => {
    try {
      const result = await check();
      if (result?.available) {
        setUpdate({ version: result.version, body: result.body ?? "" });
      }
    } catch (e) {
      console.error("Update check failed:", e);
    }
  };

  onMount(() => {
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    onCleanup(() => clearInterval(interval));
  });

  const install = async () => {
    setInstalling(true);
    try {
      const result = await check();
      if (result?.available) {
        await result.downloadAndInstall();
        await relaunch();
      }
    } catch (e) {
      console.error("Update install failed:", e);
      setInstalling(false);
    }
  };

  return (
    <Show when={update()}>
      {(u) => (
        <div class="update-banner">
          <span>v{u().version} available</span>
          <button class="update-btn" onClick={install} disabled={installing()}>
            {installing() ? "Installing..." : "Update & Restart"}
          </button>
          <button class="update-dismiss" onClick={() => setUpdate(null)}>
            &times;
          </button>
        </div>
      )}
    </Show>
  );
};
