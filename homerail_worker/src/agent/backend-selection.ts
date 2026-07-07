import {
  DEFAULT_MANAGER_AGENT_RUNTIME_AGENT_TYPE,
  normalizeManagerAgentRuntimeAgentType,
} from "homerail-protocol";

export function normalizeAgentBackend(agentType: string | undefined): string | undefined {
  return normalizeManagerAgentRuntimeAgentType(agentType);
}

export function resolveWorkerAgentBackend(options: {
  agentType?: string;
  envBackend?: string;
  hasManagerEnvelope: boolean;
}): string {
  const normalizedAgentType = normalizeAgentBackend(options.agentType);
  if (options.hasManagerEnvelope) return normalizedAgentType ?? DEFAULT_MANAGER_AGENT_RUNTIME_AGENT_TYPE;

  const envBackend = normalizeAgentBackend(options.envBackend);
  return envBackend ?? normalizedAgentType ?? DEFAULT_MANAGER_AGENT_RUNTIME_AGENT_TYPE;
}
