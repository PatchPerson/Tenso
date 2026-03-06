import { Component, Show, createSignal, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isMacOS = navigator.platform.toUpperCase().includes("MAC");

export const TitleBar: Component = () => {
  const [maximized, setMaximized] = createSignal(false);
  const appWindow = getCurrentWindow();

  const updateMaxState = async () => {
    setMaximized(await appWindow.isMaximized());
  };

  onMount(async () => {
    await updateMaxState();
    const unlisten = await appWindow.onResized(updateMaxState);
    onCleanup(() => unlisten());
  });

  const handleMinimize = () => {
    appWindow.minimize().catch(console.error);
  };
  const handleMaximize = () => {
    appWindow.toggleMaximize().catch(console.error);
  };
  const handleClose = () => {
    appWindow.close().catch(console.error);
  };

  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-left" data-tauri-drag-region style={isMacOS ? { "padding-left": "79px" } : undefined}>
        <span class="titlebar-title" data-tauri-drag-region>Tenso</span>
      </div>
      <div class="titlebar-drag" data-tauri-drag-region />
      <Show when={!isMacOS}>
        <div class="titlebar-controls">
          <button class="titlebar-btn" onClick={handleMinimize} title="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          <button class="titlebar-btn" onClick={handleMaximize} title={maximized() ? "Restore" : "Maximize"}>
            {maximized() ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M3 1h6v6" stroke="currentColor" stroke-width="1.2" fill="none" />
                <rect x="0.5" y="3.5" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none" />
              </svg>
            )}
          </button>
          <button class="titlebar-btn close" onClick={handleClose} title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
        </div>
      </Show>
    </div>
  );
};
