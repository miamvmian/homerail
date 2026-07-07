import type { ExecutionProvider } from "../providers/types.js";

export async function stopContainer(
  provider: ExecutionProvider,
  id: string,
  graceMs: number = 10000,
): Promise<void> {
  await provider.stop(id);

  const pollIntervalMs = 200;
  const deadline = Date.now() + graceMs;

  while (Date.now() < deadline) {
    const info = await provider.inspect(id);
    if (info.status === "stopped" || info.status === "removed") {
      return;
    }
    await sleep(pollIntervalMs);
  }

  await forceKill(provider, id);
}

async function forceKill(
  provider: ExecutionProvider,
  id: string,
): Promise<void> {
  try {
    await provider.kill(id);
  } catch (err) {
    if (!isMissingContainerError(err)) {
      throw err;
    }
  }
}

function isMissingContainerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not found|no such container|404/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
