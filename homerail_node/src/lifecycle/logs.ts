import type { ExecutionProvider } from "../providers/types.js";

export function containerLogs(
  provider: ExecutionProvider,
  id: string,
): AsyncIterable<string> {
  return provider.logs(id);
}
