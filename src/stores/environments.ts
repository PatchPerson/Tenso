import { createSignal } from "solid-js";
import * as api from "../lib/api";

const [environments, setEnvironments] = createSignal<api.Environment[]>([]);
const [activeEnvId, setActiveEnvId] = createSignal<string | null>(null);

export { environments, setEnvironments, activeEnvId, setActiveEnvId };

export async function loadEnvironments(workspaceId: string) {
  const envs = await api.listEnvironments(workspaceId);
  setEnvironments(envs);
  const active = await api.getActiveEnvironment();
  setActiveEnvId(active);
}

export async function addEnvironment(workspaceId: string, name: string) {
  await api.createEnvironment(workspaceId, name);
  await loadEnvironments(workspaceId);
}

export async function saveEnvironment(env: api.Environment) {
  await api.updateEnvironment(env);
  const workspaceId = env.workspace_id;
  await loadEnvironments(workspaceId);
}

export async function removeEnvironment(id: string, workspaceId: string) {
  await api.deleteEnvironment(id);
  await loadEnvironments(workspaceId);
}

export async function switchEnvironment(envId: string | null) {
  await api.setActiveEnvironment(envId);
  setActiveEnvId(envId);
}
