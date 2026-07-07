import type { Command } from "commander";
import * as fs from "node:fs";
import { getClient } from "../index.js";
import { cmdDagChats } from "./dag-chats.js";
import { cmdDagHandoffs } from "./dag-handoffs.js";
import { cmdDagQuick } from "./dag-quick.js";
import {
  cmdDagSuperviseContinuous,
  cmdDagSuperviseTick,
} from "./dag-supervise.js";
import { cmdDagWatch } from "./dag-watch.js";
import { cmdInject } from "./inject.js";
import { cmdResume, type ResumeOptions } from "./resume.js";
import { orchestrationsDir, resolveTemplatePath } from "./templates.js";

interface GlobalOpts {
  baseUrl?: string;
  json?: boolean;
  requestTimeout?: number;
}

export function registerDagCommands(program: Command): void {
  const dagCmd = program.command("dag").description("DAG status and supervision commands");
  const registerResumeCommand = (command: Command) => {
    command
      .command("resume <runId> <nodeId>")
      .description("Fork and resume a DAG node from a SessionStore checkpoint")
      .option("--uuid <uuid>", "Checkpoint entry UUID")
      .option("--last <n>", "Resume from the nth latest checkpoint marker")
      .option("--instruction <text>", "Instruction injected into the resumed node prompt")
      .option("--session-id <id>", "Explicit new session id for the forked attempt")
      .action(async (runId: string, nodeId: string, opts: ResumeOptions) => {
        const globalOpts = program.opts<GlobalOpts>();
        const client = getClient(globalOpts);
        process.exitCode = await cmdResume(client, runId, nodeId, opts, !!globalOpts.json);
      });
  };

  dagCmd
    .command("sync <template>")
    .description("Sync a DAG YAML asset into the Manager database by stable workflow_id")
    .action(async (template: string) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      const filePath = resolveTemplatePath(orchestrationsDir(), template);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: DAG template not found: ${template}`);
        process.exitCode = 1;
        return;
      }
      try {
        const resp = await client.post("/api/dag/workflows/sync", {
          yaml_text: fs.readFileSync(filePath, "utf8"),
          source_path: filePath,
        }) as { data?: { workflow?: { workflow_id?: string; name?: string }; warning?: string }; message?: string };
        if (globalOpts.json) {
          console.log(JSON.stringify(resp));
          return;
        }
        const workflow = resp.data?.workflow;
        console.log(`DAG synced: ${workflow?.workflow_id ?? "unknown"} (${workflow?.name ?? "unnamed"})`);
        console.log("workflow_id is the stable identity. Keep it unchanged when editing YAML; change it only for a new workflow/version.");
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  dagCmd
    .command("quick <runId>")
    .description("Show compact DAG status snapshot")
    .option("--events <n>", "Recent event count", "10")
    .action(async (runId: string, opts: { events: string }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      process.exitCode = await cmdDagQuick(
        client,
        runId,
        parseInt(opts.events, 10),
        !!globalOpts.json,
      );
    });

  dagCmd
    .command("watch <runId>")
    .description("Watch DAG status changes with bounded timeout")
    .option("--events <n>", "Recent event count", "5")
    .option("--interval <sec>", "Polling interval seconds", "2")
    .option("--timeout <sec>", "Total watch timeout seconds", "60")
    .action(async (runId: string, opts: { events: string; interval: string; timeout: string }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      process.exitCode = await cmdDagWatch(
        client,
        runId,
        parseInt(opts.events, 10),
        parseFloat(opts.interval),
        parseInt(opts.timeout, 10),
        !!globalOpts.json,
      );
    });

  dagCmd
    .command("supervise <runId>")
    .description("Supervise a DAG run with cursor-based deltas")
    .option("--tick", "Run one cursor-based supervision tick and exit", false)
    .option("--cursor <str>", "Opaque cursor from previous tick", "")
    .option("--events <n>", "Max new events to include", "5")
    .option("--tools <n>", "Recent tool calls per node", "3")
    .option("--content-limit <n>", "Max handoff content chars", "300")
    .option("--interval <sec>", "Polling interval seconds", "5")
    .option("--timeout <sec>", "Total supervise timeout", "600")
    .option("--report-every <sec>", "Heartbeat interval", "60")
    .action(async (
      runId: string,
      opts: {
        tick?: boolean;
        cursor: string;
        events: string;
        tools: string;
        contentLimit: string;
        interval: string;
        timeout: string;
        reportEvery: string;
      },
    ) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      if (opts.tick) {
        process.exitCode = await cmdDagSuperviseTick(
          client,
          runId,
          opts.cursor ?? "",
          parseInt(opts.events, 10),
          parseInt(opts.tools, 10),
          parseInt(opts.contentLimit, 10),
          !!globalOpts.json,
        );
        return;
      }
      process.exitCode = await cmdDagSuperviseContinuous(
        client,
        runId,
        parseFloat(opts.interval),
        parseInt(opts.timeout, 10),
        parseInt(opts.events, 10),
        parseInt(opts.tools, 10),
        parseInt(opts.contentLimit, 10),
        parseFloat(opts.reportEvery),
        !!globalOpts.json,
      );
    });

  dagCmd
    .command("chats <runId>")
    .description("Summarize per-node chat/tool activity")
    .option("--node <ids...>", "Node IDs to include")
    .option("--tools <n>", "Recent tool calls per node", "5")
    .option("--raw-tools", "Show redacted tool inputs and result previews", false)
    .action(async (runId: string, opts: { node?: string[]; tools: string; rawTools?: boolean }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      process.exitCode = await cmdDagChats(
        client,
        runId,
        opts.node,
        parseInt(opts.tools, 10),
        !!opts.rawTools,
        !!globalOpts.json,
      );
    });

  dagCmd
    .command("handoffs <runId>")
    .description("Show handoff content and contract hook checks")
    .option("--content-limit <n>", "Max handoff content chars", "500")
    .action(async (runId: string, opts: { contentLimit: string }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      process.exitCode = await cmdDagHandoffs(
        client,
        runId,
        parseInt(opts.contentLimit, 10),
        !!globalOpts.json,
      );
    });

  registerResumeCommand(dagCmd);

  program
    .command("inject <runId> <nodeId> <instruction>")
    .description("Inject an instruction into a DAG node")
    .option("--mode <mode>", "Injection mode: auto|inbox|interrupt|redispatch", "inbox")
    .action(async (runId: string, nodeId: string, instruction: string, opts: { mode: string }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const client = getClient(globalOpts);
      process.exitCode = await cmdInject(client, runId, nodeId, instruction, opts.mode);
    });

  registerResumeCommand(program);
}
