import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";

let testHomeRailHome: string | null = null;

beforeAll(() => {
  if (!process.env.HOMERAIL_HOME) {
    testHomeRailHome = mkdtempSync(join(tmpdir(), "homerail-worker-vitest-"));
    process.env.HOMERAIL_HOME = testHomeRailHome;
  }
});

afterAll(() => {
  if (testHomeRailHome) {
    rmSync(testHomeRailHome, { recursive: true, force: true });
    testHomeRailHome = null;
  }
});
