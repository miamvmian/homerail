export type {
  ContainerConfig,
  ContainerInfo,
  ExecResult,
  ExecutionProvider,
} from "./providers/types.js";

export { DockerCliProvider, DockerNotFoundError, DockerDaemonError, DockerPermissionError } from "./providers/docker-cli-provider.js";

export { DockerApiProvider } from "./providers/docker-api-provider.js";

export { MockProvider } from "./providers/mock-provider.js";

export {
  validateMounts,
  allowedMounts,
  workerAllowedMounts,
  MountPolicyError,
} from "./storage/mount-policy.js";
export type { MountEntry, MountPolicyOptions } from "./storage/mount-policy.js";

export { homerailHomePath, homerailNodeVolumePath, homerailHomeUserPath, homerailWorkerWorkspacePath } from "./storage/homerail-home.js";

export { dockerVolumeMount } from "./storage/local-volume.js";
export type { VolumeMount } from "./storage/local-volume.js";

export { resolveHomerailHome, normalizePath } from "./platform/paths.js";

export { createContainer, createWorkerContainer } from "./lifecycle/create.js";
export type { CreateOptions, CreateWorkerOptions } from "./lifecycle/create.js";

export { startContainer, ContainerStartTimeoutError } from "./lifecycle/start.js";

export { stopContainer } from "./lifecycle/stop.js";

export { inspectContainer } from "./lifecycle/inspect.js";

export { removeContainer } from "./lifecycle/remove.js";

export { containerLogs } from "./lifecycle/logs.js";

export {
  handleLifecycleRequest,
  type LifecycleRequest,
  type LifecycleResponse,
  type SendFn,
} from "./control-plane/lifecycle-handler.js";

export {
  createNodeClient,
  type NodeClient,
  type NodeClientOptions,
} from "./control-plane/ws-client.js";
