import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const FORBIDDEN_PATTERNS = [
  /192\.168\.100/,
  /:8999/,
  /AGENTS\.md/,
  /CLAUDE\.md/,
  /\/home\/matrix/,
  /scripts\/homerail\.sh/,
  new RegExp("omni_" + "manager"),
  /uv run/,
];

const FORBIDDEN_COMMAND_EXAMPLES = [
  /homerail templates --base-url/,
  /homerail templates\s*$/m,
  /homerail templates --json/,
  /homerail run\s+\S+\s+"[^"]+"/,
  /homerail status <run_id> --json/,
  /homerail provider\s*$/m,
  /homerail llm-settings\s*$/m,
  /homerail evidence <subcommand>/,
];

const SKILL_FILES = [
  resolve(repoRoot, "skills/homerail-cli/SKILL.md"),
  resolve(repoRoot, "skills/homerail-dag-ops/SKILL.md"),
];

describe("public skill files must not contain internal hostnames or references", () => {
  for (const filePath of SKILL_FILES) {
    const relative = filePath.replace(repoRoot + "/", "");
    it(`${relative} contains no forbidden patterns`, () => {
      const content = readFileSync(filePath, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          content,
          `${relative} must not match forbidden pattern ${pattern}`,
        ).not.toMatch(pattern);
      }
    });

    it(`${relative} contains current TS CLI command shapes`, () => {
      const content = readFileSync(filePath, "utf-8");
      for (const pattern of FORBIDDEN_COMMAND_EXAMPLES) {
        expect(
          content,
          `${relative} must not contain stale command example ${pattern}`,
        ).not.toMatch(pattern);
      }
    });
  }
});
