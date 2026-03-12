import { Component, Show, onMount } from "solid-js";
import { MainWorkspace } from "./pages/MainWorkspace";
import { AuthCodeModal } from "./components/shared/AuthCodeModal";
import { ToastContainer } from "./components/shared/Toast";
import { loadTeams, activeTeam } from "./stores/collections";
import { applyTheme, getStoredTheme } from "./lib/themes";
import { initAuth, submitAuthCode, showCodeEntry } from "./lib/auth";
import { restoreSession, reconcileRestoredTabs, saveSession } from "./lib/session";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";

function handleDeepLinkUrls(urls: string[]) {
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (code) {
        submitAuthCode(code);
        return;
      }
    } catch {
      console.error("Failed to parse deep link:", url);
    }
  }
}

const App: Component = () => {
  onMount(async () => {
    applyTheme(getStoredTheme());
    await loadTeams();
    restoreSession(activeTeam());
    reconcileRestoredTabs().catch(console.warn);
    await initAuth();

    // Flush session on app close
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (_event) => {
      try {
        saveSession();
      } catch (err) {
        console.warn("Failed to save session on close:", err);
      }
    });

    // Cold start: app was opened via deep link
    const initialUrls = await getCurrent();
    if (initialUrls?.length) {
      handleDeepLinkUrls(initialUrls);
    }

    // Warm start: app already running, receives deep link
    onOpenUrl(handleDeepLinkUrls);
  });

  return (
    <>
      <MainWorkspace />
      <Show when={showCodeEntry()}>
        <AuthCodeModal />
      </Show>
      <ToastContainer />
    </>
  );
};

export default App;
