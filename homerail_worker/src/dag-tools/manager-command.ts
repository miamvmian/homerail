/**
 * manager_command DAG tool — retained only to reject legacy dynamic run control.
 * @version 0.1.0
 */

import type { DagToolDefinition } from "../agent/types.js";
import type { DagToolsState } from "./index.js";

export function createManagerCommandTool(state: DagToolsState): DagToolDefinition {
  void state;
  return {
    name: "manager_command",
    description: "Unsupported legacy tool. Update the DAG template or use the CLI instead.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        command_id: { type: "string" },
        append: { type: "object" },
      },
      required: ["command"],
      additionalProperties: true,
    },
    async handler(_args: Record<string, unknown>) {
      return {
        content: [{
          type: "text",
          text: "manager_command is unsupported; express topology changes in the DAG template before creating the run.",
        }],
        is_error: true,
      };
    },
  };
}
