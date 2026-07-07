import type {
  ExecutionProvider,
  ContainerConfig,
  ContainerInfo,
  ExecResult,
} from "./types.js";

type MockStatus = "created" | "running" | "stopped" | "removed";

interface MockContainer {
  id: string;
  config: ContainerConfig;
  status: MockStatus;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  files: Map<string, string>;
  logLines: string[];
  startTime?: number;
}

let nextId = 1;

function genId(): string {
  return `mock-${nextId++}-${Date.now().toString(36)}`;
}

export class MockProvider implements ExecutionProvider {
  containers: Map<string, MockContainer> = new Map();

  async create(config: ContainerConfig): Promise<ContainerInfo> {
    const id = genId();
    const container: MockContainer = {
      id,
      config: { ...config },
      status: "created",
      files: new Map(),
      logLines: [],
    };
    this.containers.set(id, container);
    return this.toInfo(container);
  }

  async start(id: string): Promise<void> {
    const c = this.getOrThrow(id);
    c.status = "running";
    c.startedAt = new Date().toISOString();
    c.startTime = Date.now();
    c.exitCode = undefined;
    c.finishedAt = undefined;
    c.error = undefined;
  }

  async stop(id: string): Promise<void> {
    const c = this.getOrThrow(id);
    c.status = "stopped";
    c.finishedAt = new Date().toISOString();
    if (c.exitCode === undefined) {
      c.exitCode = 0;
    }
  }

  async kill(id: string): Promise<void> {
    const c = this.getOrThrow(id);
    c.status = "stopped";
    c.finishedAt = new Date().toISOString();
    c.exitCode = 137;
  }

  async remove(id: string): Promise<void> {
    const c = this.getOrThrow(id);
    c.status = "removed";
    this.containers.delete(id);
  }

  async exec(id: string, cmd: string[]): Promise<ExecResult> {
    const c = this.getOrThrow(id);
    if (c.status !== "running") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `container ${id} is not running (status: ${c.status})`,
      };
    }

    const cmdStr = cmd.join(" ");
    c.logLines.push(`$ ${cmdStr}`);

    // Simple echo simulation
    if (cmd[0] === "echo") {
      const out = cmd.slice(1).join(" ") + "\n";
      c.logLines.push(out.trimEnd());
      return { exitCode: 0, stdout: out, stderr: "" };
    }

    // Node evaluation
    if (cmd[0] === "node" && cmd[1] === "-e") {
      const code = cmd[2] || "";
      try {
        if (code.includes("console.log")) {
          const match = code.match(/console\.log\(['"](.+?)['"]\)/);
          const output = match ? match[1] + "\n" : "undefined\n";
          c.logLines.push(output.trimEnd());
          return { exitCode: 0, stdout: output, stderr: "" };
        }
        if (code.includes("console.error")) {
          const match = code.match(/console\.error\(['"](.+?)['"]\)/);
          const output = match ? match[1] + "\n" : "";
          return { exitCode: 0, stdout: "", stderr: output };
        }
        if (code.includes("process.exit")) {
          const match = code.match(/process\.exit\((\d+)\)/);
          const ec = match ? parseInt(match[1]!, 10) : 0;
          return { exitCode: ec, stdout: "", stderr: "" };
        }
        // Generic: just return success
        c.logLines.push("(evaluated)");
        return { exitCode: 0, stdout: "", stderr: "" };
      } catch (e) {
        return { exitCode: 1, stdout: "", stderr: String(e) };
      }
    }

    // File operations
    if (cmd[0] === "cat") {
      const path = cmd[1] || "";
      const content = c.files.get(path);
      if (content !== undefined) {
        c.logLines.push(content);
        return { exitCode: 0, stdout: content, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: `cat: ${path}: No such file` };
    }

    // Default: success with empty output
    c.logLines.push("(ok)");
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  async *logs(id: string): AsyncIterable<string> {
    const c = this.getOrThrow(id);
    for (const line of c.logLines) {
      yield line + "\n";
    }
  }

  async inspect(id: string): Promise<ContainerInfo> {
    const c = this.getOrThrow(id);
    return this.toInfo(c);
  }

  async list(): Promise<ContainerInfo[]> {
    return Array.from(this.containers.values()).map((c) => this.toInfo(c));
  }

  private getOrThrow(id: string): MockContainer {
    const c = this.containers.get(id);
    if (!c) {
      throw new Error(`container ${id} not found`);
    }
    return c;
  }

  private toInfo(c: MockContainer): ContainerInfo {
    return {
      id: c.id,
      status: c.status,
      exitCode: c.exitCode,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      error: c.error,
    };
  }
}
