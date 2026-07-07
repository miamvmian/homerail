import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readWidgetFile,
  removeWidgetFile,
  validateWidgetToml,
  voiceMemoToWidgetToml,
  widgetFilePath,
  widgetTomlExample,
  writeWidgetFile,
} from "../src/widgets/widget-file-protocol.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(testDir, "fixtures", "widgets");

function fixture(name: string): string {
  return fs.readFileSync(path.join(fixturesRoot, name), "utf8");
}

describe("Widget File Protocol", () => {
  let tmpHome: string;
  let oldHome: string | undefined;

  beforeEach(() => {
    oldHome = process.env.HOMERAIL_HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "homerail-widget-protocol-"));
    process.env.HOMERAIL_HOME = tmpHome;
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.HOMERAIL_HOME;
    else process.env.HOMERAIL_HOME = oldHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("validates and renders a memo fixture into the stable voice-memo widget", () => {
    const memoPath = widgetFilePath("Project Alpha", "voice-session-123", "voice-memo");
    const result = validateWidgetToml(fixture("memo.toml"), "memo", { filePath: memoPath });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.widget).toMatchObject({
      id: "voice-memo",
      type: "note",
      title: "任务记录",
      status: "clarifying",
      data: {
        visual: "memo",
        width: "wide",
        memo_path: memoPath,
        ready_to_execute: false,
      },
    });
    expect(result.widget.items).toContain("DONE 确认范围");
    expect(result.widget.items).toContain("TODO 确认交付形式");
  });

  it("validates and renders a non-memo checklist fixture", () => {
    const result = validateWidgetToml(fixture("checklist.toml"), "checklist", { filePath: "/tmp/review-checklist.toml" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.widget).toMatchObject({
      id: "review-checklist",
      type: "list",
      title: "PR 审查清单",
      status: "doing",
      data: { visual: "checklist", widget_file: "/tmp/review-checklist.toml" },
    });
    expect(result.widget.items).toEqual(["DONE 读取 diff", "TODO 运行测试"]);
  });

  it("returns structured validation errors and does not write malformed memo TOML", () => {
    const result = writeWidgetFile({
      projectId: "p1",
      sessionId: "s1",
      widgetId: "voice-memo",
      widgetType: "memo",
      tomlContent: fixture("malformed-memo.toml"),
    });

    expect(result.ok).toBe(false);
    expect(result.file).toBe(widgetFilePath("p1", "s1", "voice-memo"));
    if (result.ok) throw new Error("expected validation failure");
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "status" }));
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "summary" }));
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "ready_to_execute" }));
    expect(fs.existsSync(result.file)).toBe(false);
  });

  it("atomically writes corrected TOML and can replay/remove the widget file", () => {
    const toml = voiceMemoToWidgetToml({
      title: "任务记录",
      status: "ready",
      summary: "用户已确认调查 AI 新闻。",
      known_facts: ["时间范围是过去 24 小时"],
      open_questions: [],
      todos: [{ text: "确认交付形式", done: true }],
      next_action: "等待确认执行",
      ready_to_execute: true,
    });

    const written = writeWidgetFile({ projectId: "p1", sessionId: "s1", widgetType: "memo", tomlContent: toml });
    expect(written.ok).toBe(true);
    if (!written.ok) throw new Error(JSON.stringify(written.errors));
    expect(fs.readFileSync(written.file, "utf8")).toContain('widget_type = "memo"');
    expect(fs.readdirSync(path.dirname(written.file)).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
    expect(written.widget).toMatchObject({ id: "voice-memo", status: "ready" });

    const replayed = readWidgetFile({ projectId: "p1", sessionId: "s1", widgetId: "voice-memo", widgetType: "memo" });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error(JSON.stringify(replayed.errors));
    expect(replayed.widget).toMatchObject({ id: "voice-memo", status: "ready" });

    const removed = removeWidgetFile({ projectId: "p1", sessionId: "s1", widgetId: "voice-memo" });
    expect(removed.removed).toBe(true);
    expect(fs.existsSync(written.file)).toBe(false);
  });

  it("ships canonical TOML examples for all V1 widget types", () => {
    for (const type of ["memo", "task_draft", "progress_status", "checklist", "artifact_ref", "timeline"] as const) {
      const result = validateWidgetToml(widgetTomlExample(type), type);
      expect(result.ok).toBe(true);
    }
  });
});
