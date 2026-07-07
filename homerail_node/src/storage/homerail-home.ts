import { resolveHomerailHome, normalizePath } from "../platform/paths.js";

function safeRelativePathSegments(value: string, label: string): string[] {
  const normalized = normalizePath(value);
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`${label} must be a relative .homerail path segment`);
  }

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error(`${label} contains an unsafe path segment`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) {
      throw new Error(`${label} contains unsupported characters`);
    }
  }
  return segments;
}

export function homerailHomePath(...segments: string[]): string {
  const base = resolveHomerailHome();
  const normalized = segments.map(normalizePath);
  return [base, ...normalized].join("/");
}

export function homerailNodeVolumePath(volumeId: string): string {
  return homerailHomePath("node", "volumes", ...safeRelativePathSegments(volumeId, "volumeId"));
}

export function homerailHomeUserPath(): string {
  return homerailHomePath("home");
}

export function homerailWorkerWorkspacePath(workspaceId: string): string {
  return homerailHomePath("workspace", ...safeRelativePathSegments(workspaceId, "workspaceId"));
}
