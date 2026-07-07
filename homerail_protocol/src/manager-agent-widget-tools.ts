/**
 * Shared Manager Agent widget-file tool handlers.
 * @version 0.1.0
 */

import type { AgentToolDefinition } from "./types.js";
import {
  managerAgentToolSpec,
  type ManagerAgentToolName,
  type ManagerAgentWidgetFileType,
} from "./manager-agent-tools.js";

export const MANAGER_AGENT_WIDGET_FILE_TOOL_NAMES = [
  "update_voice_memo",
  "validate_widget_file",
  "write_widget_file",
  "read_widget_file",
  "remove_widget_file",
  "show_widget_toml_example",
] as const;

export type ManagerAgentWidgetFileToolName = (typeof MANAGER_AGENT_WIDGET_FILE_TOOL_NAMES)[number];

export type ManagerAgentWidgetToolHandlerResult = {
  content: Array<{ type: "text"; text: string }>;
  is_error?: boolean;
};

export interface ManagerAgentWidgetFileTool extends AgentToolDefinition {
  name: ManagerAgentWidgetFileToolName;
  handler: (args: Record<string, unknown>) => Promise<ManagerAgentWidgetToolHandlerResult>;
}

export interface ManagerAgentWidgetFileToolResult {
  text: string;
  isError?: boolean;
  widget?: Record<string, unknown>;
  removeWidgetId?: string;
}

export interface ManagerAgentWidgetFileRuntimeContext {
  projectId?: string;
  sessionId?: string;
}

export interface ManagerAgentWidgetFileToolAdapter {
  updateVoiceMemo(
    args: Record<string, unknown>,
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
  validateWidgetFile(
    args: { widgetType: ManagerAgentWidgetFileType; toml: string },
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
  writeWidgetFile(
    args: { widgetId?: string; widgetType: ManagerAgentWidgetFileType; toml: string },
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
  readWidgetFile(
    args: { widgetId: string; widgetType?: ManagerAgentWidgetFileType },
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
  removeWidgetFile(
    args: { widgetId: string },
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
  showWidgetTomlExample(
    args: { widgetType: ManagerAgentWidgetFileType },
    context: ManagerAgentWidgetFileRuntimeContext,
  ): Promise<ManagerAgentWidgetFileToolResult>;
}

export interface ManagerAgentWidgetFileVoiceSurfaceSink {
  addWidget(widget: Record<string, unknown>): void;
  removeWidget(id: string): void;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === "string" ? args[key].trim() : "";
}

function widgetTypeArg(args: Record<string, unknown>): ManagerAgentWidgetFileType {
  return stringArg(args, "widget_type") as ManagerAgentWidgetFileType;
}

function toolResult(result: ManagerAgentWidgetFileToolResult): ManagerAgentWidgetToolHandlerResult {
  return {
    content: [{ type: "text", text: result.text }],
    is_error: result.isError || undefined,
  };
}

async function runWidgetFileTool(
  adapterCall: () => Promise<ManagerAgentWidgetFileToolResult>,
  voiceSurface: ManagerAgentWidgetFileVoiceSurfaceSink,
): Promise<ManagerAgentWidgetToolHandlerResult> {
  const result = await adapterCall();
  if (!result.isError && result.widget) {
    voiceSurface.addWidget(result.widget);
  }
  if (result.removeWidgetId) {
    voiceSurface.removeWidget(result.removeWidgetId);
  }
  return toolResult(result);
}

function widgetToolSpec(name: ManagerAgentWidgetFileToolName): AgentToolDefinition {
  return managerAgentToolSpec(name as ManagerAgentToolName);
}

export function createManagerAgentWidgetFileTools(options: {
  adapter: ManagerAgentWidgetFileToolAdapter;
  context: ManagerAgentWidgetFileRuntimeContext;
  voiceSurface: ManagerAgentWidgetFileVoiceSurfaceSink;
}): ManagerAgentWidgetFileTool[] {
  const { adapter, context, voiceSurface } = options;
  return [
    {
      ...widgetToolSpec("update_voice_memo"),
      name: "update_voice_memo",
      handler: async (args) => runWidgetFileTool(
        () => adapter.updateVoiceMemo(args, context),
        voiceSurface,
      ),
    },
    {
      ...widgetToolSpec("validate_widget_file"),
      name: "validate_widget_file",
      handler: async (args) => runWidgetFileTool(
        () => adapter.validateWidgetFile({
          widgetType: widgetTypeArg(args),
          toml: String(args.toml || ""),
        }, context),
        voiceSurface,
      ),
    },
    {
      ...widgetToolSpec("write_widget_file"),
      name: "write_widget_file",
      handler: async (args) => runWidgetFileTool(
        () => adapter.writeWidgetFile({
          widgetId: stringArg(args, "widget_id") || undefined,
          widgetType: widgetTypeArg(args),
          toml: String(args.toml || ""),
        }, context),
        voiceSurface,
      ),
    },
    {
      ...widgetToolSpec("read_widget_file"),
      name: "read_widget_file",
      handler: async (args) => runWidgetFileTool(
        () => adapter.readWidgetFile({
          widgetId: stringArg(args, "widget_id"),
          widgetType: stringArg(args, "widget_type") ? widgetTypeArg(args) : undefined,
        }, context),
        voiceSurface,
      ),
    },
    {
      ...widgetToolSpec("remove_widget_file"),
      name: "remove_widget_file",
      handler: async (args) => runWidgetFileTool(
        () => adapter.removeWidgetFile({ widgetId: stringArg(args, "widget_id") }, context),
        voiceSurface,
      ),
    },
    {
      ...widgetToolSpec("show_widget_toml_example"),
      name: "show_widget_toml_example",
      handler: async (args) => runWidgetFileTool(
        () => adapter.showWidgetTomlExample({ widgetType: widgetTypeArg(args) }, context),
        voiceSurface,
      ),
    },
  ];
}
