import { Component, onMount } from "solid-js";
import { MainWorkspace } from "./pages/MainWorkspace";
import { loadWorkspaces } from "./stores/collections";

const App: Component = () => {
  onMount(async () => {
    await loadWorkspaces();
  });

  return <MainWorkspace />;
};

export default App;
