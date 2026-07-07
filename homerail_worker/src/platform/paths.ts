import { homedir } from "node:os";
import { join } from "node:path";

export function homerailHome(): string {
  return process.env.HOMERAIL_HOME?.trim() || join(homedir(), ".homerail");
}

export function homerailPath(...segments: string[]): string {
  return join(homerailHome(), ...segments);
}
