import type { AgentClient, AgentEvent, AgentRunContext, DagToolDefinition } from "./types.js";

function textFromResult(result: Awaited<ReturnType<DagToolDefinition["handler"]>>): string {
  return result.content.map((item) => item.text).join("");
}

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

/**
 * Release-smoke-only backend for validating the manager-agent HTTP surface
 * inside the built worker image without calling a real model provider.
 */
export class ManagerAgentSmokeClient implements AgentClient {
  async *run(
    prompt: string,
    tools: DagToolDefinition[],
    _context: AgentRunContext,
  ): AsyncIterable<AgentEvent> {
    const createAndRun = tools.find((tool) => tool.name === "create_and_run");
    if (!createAndRun) {
      yield { type: "error", message: "create_and_run tool not found" };
      yield { type: "done" };
      return;
    }

    const input = {
      yamlPath: envOrDefault("HOMERAIL_MANAGER_AGENT_SMOKE_YAML", "assets/orchestrations/public-two-node.yaml.template"),
      profile: envOrDefault("HOMERAIL_MANAGER_AGENT_SMOKE_PROFILE", "offline-deterministic"),
      prompt: envOrDefault("HOMERAIL_MANAGER_AGENT_SMOKE_PROMPT", prompt),
    };
    yield { type: "tool_use", id: "manager-agent-smoke-create-and-run", name: "create_and_run", input };
    const result = await createAndRun.handler(input);
    yield {
      type: "tool_result",
      tool_use_id: "manager-agent-smoke-create-and-run",
      content: textFromResult(result),
      is_error: result.is_error,
    };

    const finish = tools.find((tool) => tool.name === "finish");
    if (finish) {
      const finishInput = { text: "manager-agent smoke completed" };
      yield { type: "tool_use", id: "manager-agent-smoke-finish", name: "finish", input: finishInput };
      const finishResult = await finish.handler(finishInput);
      yield {
        type: "tool_result",
        tool_use_id: "manager-agent-smoke-finish",
        content: textFromResult(finishResult),
        is_error: finishResult.is_error,
      };
    } else {
      yield { type: "text", text: "manager-agent smoke completed" };
    }
    yield { type: "done" };
  }
}
