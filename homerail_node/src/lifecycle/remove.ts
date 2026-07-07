import type { ExecutionProvider } from "../providers/types.js";

export async function removeContainer(
  provider: ExecutionProvider,
  id: string,
  removeVolumes: boolean = false,
): Promise<void> {
  if (removeVolumes) {
    await provider.remove(id);
    // Docker CLI: equivalent to docker rm -f -v <id>
    // dockerode: remove({ force: true, v: true })
    return;
  }
  await provider.remove(id);
}
