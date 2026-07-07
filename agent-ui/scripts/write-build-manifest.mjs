#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentUiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(agentUiRoot, "..");
const distRoot = path.join(agentUiRoot, "dist");
const manifestPath = path.join(distRoot, "homerail-build.json");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (entry.isFile() && full !== manifestPath) {
      files.push(full);
    }
  }
  return files.sort();
}

function git(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function distHash() {
  const hash = createHash("sha256");
  for (const file of await walk(distRoot)) {
    const rel = path.relative(distRoot, file);
    const info = await stat(file);
    hash.update(rel);
    hash.update("\0");
    hash.update(String(info.size));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function main() {
  if (!existsSync(path.join(distRoot, "index.html"))) {
    throw new Error("agent-ui/dist/index.html not found; run vite build first");
  }
  const pkg = JSON.parse(await readFile(path.join(agentUiRoot, "package.json"), "utf8"));
  const manifest = {
    app: "homerail-agent-ui",
    version: pkg.version || "0.0.0",
    built_at: new Date().toISOString(),
    git_commit: git(["rev-parse", "HEAD"]) || null,
    git_commit_short: git(["rev-parse", "--short", "HEAD"]) || null,
    git_branch: git(["branch", "--show-current"]) || null,
    dist_sha256: await distHash(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(repoRoot, manifestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
