import { isMacOS, isWindows } from "../platform/paths.js";

export interface VolumeMount {
  host: string;
  container: string;
  mode: string;
}

/**
 * Map a host path to a Docker volume mount specification.
 *
 * Linux: passthrough, no translation.
 * macOS: passthrough — requires Docker Desktop file sharing for the path.
 *   If the host path is outside the shared directories (default: /Users, /Volumes,
 *   /private, /tmp), Docker Desktop will silently fail to mount it. The caller
 *   should ensure the path is within a shared directory or configure file sharing.
 * Windows: drive letter translation (C:\... -> C:\...), requires drive sharing
 *   in Docker Desktop settings.
 * WSL2: Linux convention paths; use host.docker.internal for Manager connectivity
 *   when the Manager runs on the Windows host.
 */
export function dockerVolumeMount(
  hostPath: string,
  containerPath?: string,
  mode: string = "rw",
): VolumeMount {
  const container = containerPath || "/data";
  const host = hostPath.replace(/\\/g, "/");

  if (isMacOS) {
    // Docker Desktop on macOS only shares /Users, /Volumes, /private, /tmp by default.
    // Paths outside these (e.g. /opt, /data) must be added in Docker Desktop →
    // Settings → Resources → File Sharing.
  }

  if (isWindows) {
    // Windows paths like C:\Users\... are translated to /c/Users/... by Docker Desktop
    // when using WSL2 backend. Drive letters other than C: may need explicit sharing.
    // WSL2 paths (/mnt/c/...) also work but require the WSL2 integration to be enabled.
  }

  return { host, container, mode };
}
