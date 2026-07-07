import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { _hostShellWorkerEntryFingerprintForTest } from "../src/server/host-shell-manager-agent.js";

describe("host-shell Manager Agent worker fingerprint", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("changes when the worker entry build artifact changes", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-host-shell-fingerprint-"));
    const entry = path.join(tmpDir, "worker-entry.js");
    fs.writeFileSync(entry, "console.log('one')\n", "utf-8");

    const first = _hostShellWorkerEntryFingerprintForTest(entry);
    fs.writeFileSync(entry, "console.log('two with a larger build')\n", "utf-8");
    const second = _hostShellWorkerEntryFingerprintForTest(entry);

    expect(first.path).toBe(path.resolve(entry));
    expect(second.path).toBe(path.resolve(entry));
    expect(second).not.toEqual(first);
  });
});
