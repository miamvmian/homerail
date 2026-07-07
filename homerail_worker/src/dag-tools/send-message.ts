/**
 * send_message DAG tool — point-to-point message to another node.
 * @version 0.1.0
 */

import type { SendMessageEvent } from "homerail-protocol";
import type { DagToolDefinition } from "../agent/types.js";
import type { DagToolsState } from "./index.js";

export function createSendMessageTool(state: DagToolsState): DagToolDefinition {
  return {
    name: "send_message",
    description:
      "向图中的指定节点发送消息。目标节点必须通过 receive_message 来接收。" +
      "用于节点间的点对点通信，例如协商、请求补充信息等。",
    input_schema: {
      type: "object",
      properties: {
        to_node: {
          type: "string",
          description: "目标节点 ID（必须是图中的合法节点）",
        },
        content: {
          description: "消息内容（JSON 值，任意类型）",
        },
      },
      required: ["to_node", "content"],
    },
    handler: async (args: Record<string, unknown>) => {
      const toNode = String(args.to_node ?? "");
      const content = args.content ?? "";

      if (!state.graphNodes.includes(toNode)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `无效的目标节点: ${toNode}。图中的合法节点: ${state.graphNodes.join(", ")}`,
            },
          ],
          is_error: true,
        };
      }

      const event: SendMessageEvent = {
        type: "node_send_message",
        run_id: state.runId,
        from_node: state.nodeId,
        to_node: toNode,
        content,
        session_id: state.sessionId,
      };

      try {
        state.wsSend(JSON.stringify({ type: "response", session_id: state.sessionId, data: event }));
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `消息发送失败: ${err}` }],
          is_error: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: `消息已发送给 ${toNode}` }],
      };
    },
  };
}
