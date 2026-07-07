/**
 * receive_message DAG tool — block until a message arrives or timeout.
 * @version 0.1.0
 */

import type { ReceiveMessageEvent } from "homerail-protocol";
import type { DagToolDefinition } from "../agent/types.js";
import type { DagToolsState } from "./index.js";

export function createReceiveMessageTool(state: DagToolsState): DagToolDefinition {
  return {
    name: "receive_message",
    description:
      "阻塞等待并接收其他节点发送给你的消息。" +
      "如果没有消息会一直等待，直到收到消息或超时。" +
      "超时时间可通过 timeout 参数指定（默认 300 秒）。",
    input_schema: {
      type: "object",
      properties: {
        timeout: {
          type: "integer",
          description: "等待超时秒数（默认 300 秒）",
          default: 300,
        },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const timeout = Number(args.timeout ?? 300);

      // Check inbox first
      if (state.inbox.length > 0) {
        const msg = state.inbox.shift()!;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(msg),
            },
          ],
        };
      }

      // Notify manager we're waiting
      const receiveEvent: ReceiveMessageEvent = {
        type: "node_receive_message",
        from_node: state.nodeId,
        run_id: state.runId,
        session_id: state.sessionId,
      };
      try {
        state.wsSend(JSON.stringify({ type: "response", session_id: state.sessionId, data: receiveEvent }));
      } catch {
        // Non-fatal — manager may still deliver via inbox
      }

      // Register waiter and block
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          state.waiters.delete(state.nodeId);
          resolve({
            content: [
              {
                type: "text" as const,
                text: `等待消息超时（${timeout} 秒），当前无消息到达。`,
              },
            ],
          });
        }, timeout * 1000);

        state.waiters.set(state.nodeId, () => {
          clearTimeout(timer);
          if (state.inbox.length > 0) {
            const msg = state.inbox.shift()!;
            resolve({
              content: [{ type: "text" as const, text: JSON.stringify(msg) }],
            });
          } else {
            resolve({
              content: [
                { type: "text" as const, text: "等待被意外唤醒，inbox 为空" },
              ],
            });
          }
        });
      });
    },
  };
}
