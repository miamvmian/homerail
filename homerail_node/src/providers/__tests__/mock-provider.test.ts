import { describe, it, expect, beforeEach } from "vitest";
import { MockProvider } from "../mock-provider.js";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  describe("state machine: created → running → stopped → removed", () => {
    it("transitions through full lifecycle", async () => {
      const created = await provider.create({ image: "node:20-alpine" });
      expect(created.status).toBe("created");

      await provider.start(created.id);
      const running = await provider.inspect(created.id);
      expect(running.status).toBe("running");
      expect(running.startedAt).toBeDefined();

      await provider.stop(created.id);
      const stopped = await provider.inspect(created.id);
      expect(stopped.status).toBe("stopped");
      expect(stopped.finishedAt).toBeDefined();
      expect(stopped.exitCode).toBe(0);

      await provider.remove(created.id);
      await expect(provider.inspect(created.id)).rejects.toThrow("not found");
    });

    it("list reflects current state of all containers", async () => {
      const c1 = await provider.create({ image: "alpine" });
      const c2 = await provider.create({ image: "ubuntu" });

      let list = await provider.list();
      expect(list).toHaveLength(2);

      await provider.start(c1.id);
      list = await provider.list();
      const started = list.find((c) => c.id === c1.id);
      expect(started!.status).toBe("running");

      await provider.remove(c2.id);
      list = await provider.list();
      expect(list).toHaveLength(1);
    });
  });

  describe("exec", () => {
    it("executes echo command", async () => {
      const c = await provider.create({ image: "alpine" });
      await provider.start(c.id);

      const result = await provider.exec(c.id, ["echo", "hello", "world"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("hello world\n");
    });

    it("returns error when container is not running", async () => {
      const c = await provider.create({ image: "alpine" });
      const result = await provider.exec(c.id, ["echo", "hi"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not running");
    });

    it("simulates node -e with console.log", async () => {
      const c = await provider.create({ image: "node:20-alpine" });
      await provider.start(c.id);

      const result = await provider.exec(c.id, [
        "node",
        "-e",
        "console.log('ok')",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("ok");
    });

    it("simulates node -e with process.exit", async () => {
      const c = await provider.create({ image: "node:20-alpine" });
      await provider.start(c.id);

      const result = await provider.exec(c.id, [
        "node",
        "-e",
        "process.exit(42)",
      ]);
      expect(result.exitCode).toBe(42);
    });
  });

  describe("logs", () => {
    it("replays stored log lines", async () => {
      const c = await provider.create({ image: "alpine" });
      await provider.start(c.id);
      await provider.exec(c.id, ["echo", "line1"]);
      await provider.exec(c.id, ["echo", "line2"]);

      const lines: string[] = [];
      for await (const line of provider.logs(c.id)) {
        lines.push(line);
      }

      expect(lines.some((l) => l.includes("line1"))).toBe(true);
      expect(lines.some((l) => l.includes("line2"))).toBe(true);
    });
  });

  describe("container isolation", () => {
    it("each container has independent state", async () => {
      const c1 = await provider.create({ image: "alpine" });
      const c2 = await provider.create({ image: "ubuntu" });

      await provider.start(c1.id);

      const info1 = await provider.inspect(c1.id);
      const info2 = await provider.inspect(c2.id);
      expect(info1.status).toBe("running");
      expect(info2.status).toBe("created");
    });
  });
});
