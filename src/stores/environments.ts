import { createSignal } from "solid-js";
import * as api from "../lib/api";

const [environments, setEnvironments] = createSignal<api.Environment[]>([]);
const [activeEnvId, setActiveEnvId] = createSignal<string | null>(null);

export { environments, setEnvironments, activeEnvId, setActiveEnvId };

const [envRefreshTrigger, setEnvRefreshTrigger] = createSignal(0);
export { envRefreshTrigger };
export function triggerEnvRefresh() {
  setEnvRefreshTrigger(envRefreshTrigger() + 1);
}

export async function loadEnvironments(teamId: string) {
  const envs = await api.listEnvironments(teamId);
  setEnvironments(envs);
  const active = await api.getActiveEnvironment();
  setActiveEnvId(active);
}

export async function addEnvironment(teamId: string, name: string) {
  await api.createEnvironment(teamId, name);
  await loadEnvironments(teamId);
}

export async function saveEnvironment(env: api.Environment) {
  await api.updateEnvironment(env);
  const teamId = env.team_id;
  await loadEnvironments(teamId);
}

export async function removeEnvironment(id: string, teamId: string) {
  await api.deleteEnvironment(id);
  await loadEnvironments(teamId);
}

export async function switchEnvironment(envId: string | null) {
  await api.setActiveEnvironment(envId);
  setActiveEnvId(envId);
}
