import type { ExecutionProvider } from "../providers/types.js";

export class ContainerStartTimeoutError extends Error {
  constructor(id: string, timeoutMs: number) {
    super(`container ${id} did not reach "running" state within ${timeoutMs}ms`);
    this.name = "ContainerStartTimeoutError";
  }
}

export async function startContainer(
  provider: ExecutionProvider,
  id: string,
  timeoutMs: number = 30000,
): Promise<void> {
  await provider.start(id);

  const pollIntervalMs = 200;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const info = await provider.inspect(id);
    if (info.status === "running") {
      return;
    }
    if (info.status === "stopped" || info.status === "removed") {
      throw new Error(
        `container ${id} exited during start (exitCode=${info.exitCode}, error=${info.error})`,
      );
    }
    await sleep(pollIntervalMs);
  }

  throw new ContainerStartTimeoutError(id, timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
