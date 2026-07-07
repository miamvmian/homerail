import { describe, expect, it } from "vitest";
import { parseDAGYaml } from "../src/orchestration/yaml-loader.js";

describe("parseDAGYaml image defaults", () => {
  it("leaves node image unset when the YAML does not explicitly configure one", () => {
    const parsed = parseDAGYaml(`
name: image-default
agents:
  worker:
    system: HANDOFF port=done content=ok
nodes:
  first:
    agent: worker
    outputs:
      done:
        to: ""
`);

    expect(parsed.graph.nodes[0]?.image).toBeUndefined();
  });

  it("applies a root image when configured", () => {
    const parsed = parseDAGYaml(`
name: image-default
image: homerail-worker:custom
agents:
  worker:
    system: HANDOFF port=done content=ok
nodes:
  first:
    agent: worker
    outputs:
      done:
        to: ""
`);

    expect(parsed.graph.nodes[0]?.image).toBe("homerail-worker:custom");
  });
});
