import { Component, onMount } from "solid-js";
import { MainWorkspace } from "./pages/MainWorkspace";
import { loadTeams } from "./stores/collections";
import { applyTheme, getStoredTheme } from "./lib/themes";
import { initAuth } from "./lib/auth";

const App: Component = () => {
  onMount(async () => {
    applyTheme(getStoredTheme());
    await loadTeams();
    // Initialize auth (checks for stored token, fetches user if valid)
    await initAuth();
  });

  return <MainWorkspace />;
};

export default App;
