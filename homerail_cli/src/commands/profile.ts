import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { getClient } from "../index.js";

interface GlobalOpts {
  baseUrl?: string;
  json?: boolean;
  requestTimeout?: number;
}

interface ProfileSyncOpts {
  workflow?: string;
}

interface ProfileListOpts {
  workflow?: string;
}

export function registerProfileCommand(program: Command): void {
  const profile = program
    .command("profile")
    .description("DAG runtime profile management");

  profile
    .command("sync <file>")
    .description("Sync a DAG runtime profile YAML into the Manager database")
    .option("--workflow <workflow_id>", "Workflow id to bind when profile YAML does not include workflow_id")
    .action(async (file: string, opts: ProfileSyncOpts) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: profile file not found: ${file}`);
        process.exitCode = 1;
        return;
      }
      try {
        const resp = await client.post("/api/dag/profiles/sync", {
          yaml_text: fs.readFileSync(filePath, "utf8"),
          workflow_id: opts.workflow,
          source_path: filePath,
        }) as { data?: { profile?: { workflow_id?: string; profile_id?: string } }; message?: string };
        if (globalOpts.json) {
          console.log(JSON.stringify(resp));
          return;
        }
        const synced = resp.data?.profile;
        console.log(`Profile synced: ${synced?.workflow_id ?? "unknown"}/${synced?.profile_id ?? "unknown"}`);
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  profile
    .command("list")
    .description("List DAG runtime profiles stored in Manager database")
    .option("--workflow <workflow_id>", "Filter by workflow id")
    .action(async (opts: ProfileListOpts) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      const query = opts.workflow ? `?workflow_id=${encodeURIComponent(opts.workflow)}` : "";
      try {
        const resp = await client.get(`/api/dag/profiles${query}`) as {
          data?: { profiles?: Array<{ workflow_id: string; profile_id: string; description?: string }> };
        };
        const profiles = resp.data?.profiles ?? [];
        if (globalOpts.json) {
          console.log(JSON.stringify(profiles));
          return;
        }
        if (profiles.length === 0) {
          console.log("No DAG runtime profiles found.");
          return;
        }
        console.log(`${"Workflow".padEnd(30)} ${"Profile".padEnd(24)} Description`);
        console.log("-".repeat(78));
        for (const item of profiles) {
          console.log(`${item.workflow_id.padEnd(30)} ${item.profile_id.padEnd(24)} ${item.description ?? ""}`);
        }
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
