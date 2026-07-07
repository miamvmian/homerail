import type { ExecutionProvider, ContainerInfo } from "../providers/types.js";

export async function inspectContainer(
  provider: ExecutionProvider,
  id: string,
): Promise<ContainerInfo> {
  const info = await provider.inspect(id);
  return {
    ...info,
    exitCode: info.status === "running" ? undefined : info.exitCode,
  };
}
