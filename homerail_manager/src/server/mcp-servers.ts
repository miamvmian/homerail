/**
 * - HTTP route handler for /api/api/mcp/ CRUD.
 * - Added runtime-refresh endpoint.
 *
 * Source Issue: #950, #955
 *
 * Routes:
 *   GET    /api/api/mcp/               -- list MCP servers
 *   POST   /api/api/mcp/               -- create MCP server
 *   PUT    /api/api/mcp/               -- update MCP server
 *   DELETE /api/api/mcp/               -- delete MCP server (expects { id } in body)
 *   POST   /api/api/mcp/runtime-refresh -- refresh runtime status for an MCP server
 */

import * as http from "node:http";
import {
  listServers,
  createServer,
  updateServer,
  deleteServer,
  refreshMCPRuntimeStatus,
  toPublicServer,
  type CreateMCPServerInput,
  type UpdateMCPServerInput,
} from "../persistence/mcp-servers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BaseResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

function json(res: http.ServerResponse, status: number, body: BaseResponse) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function _badRequest(res: http.ServerResponse, message: string) {
  json(res, 400, { success: false, message, error: message });
}

function _notFound(res: http.ServerResponse, message: string) {
  json(res, 404, { success: false, message, error: message });
}

function _ok(res: http.ServerResponse, message: string, data?: unknown) {
  json(res, 200, { success: true, message, data });
}

function _created(res: http.ServerResponse, message: string, data: unknown) {
  json(res, 201, { success: true, message, data });
}

async function _readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function mcpServersRoutesHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const urlObj = new URL(req.url || "/", "http://localhost");
  const pathname = urlObj.pathname;

  // Handle /api/api/mcp/runtime-refresh ()
  const normalizedPath = pathname.replace(/\/$/, "");
  if (normalizedPath === "/api/api/mcp/runtime-refresh" && req.method === "POST") {
    _readJsonBody(req)
      .then((raw) => {
        const body = raw as Record<string, unknown>;
        const id = typeof body.id === "string" ? body.id : "";

        if (!id) {
          _badRequest(res, "Missing required field: id");
          return;
        }

        const updated = refreshMCPRuntimeStatus(id);
        if (!updated) {
          _notFound(res, `MCP server not found: ${id}`);
          return;
        }
        _ok(res, "Runtime status refreshed", toPublicServer(updated));
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  // Only handle /api/api/mcp paths (with or without trailing slash)
  if (normalizedPath !== "/api/api/mcp") return false;

  // GET /api/api/mcp/ -- list
  if (req.method === "GET") {
    const servers = listServers().map(toPublicServer);
    _ok(res, `Found ${servers.length} MCP servers`, { servers });
    return true;
  }

  // POST /api/api/mcp/ -- create
  if (req.method === "POST") {
    _readJsonBody(req)
      .then((raw) => {
        const body = raw as Record<string, unknown>;

        const input: CreateMCPServerInput = {
          name: typeof body.name === "string" ? body.name : "",
          description: typeof body.description === "string" ? body.description : undefined,
          type: typeof body.type === "string" ? (body.type as any) : undefined,
          url: typeof body.url === "string" ? body.url : undefined,
          command: typeof body.command === "string" ? body.command : undefined,
          arguments: typeof body.arguments === "string" ? body.arguments : undefined,
          environment_variables: typeof body.environment_variables === "string" ? body.environment_variables : undefined,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        };

        try {
          const server = createServer(input);
          _created(res, "MCP server created", toPublicServer(server));
        } catch (err) {
          _badRequest(res, err instanceof Error ? err.message : String(err));
        }
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  // PUT /api/api/mcp/ -- update
  if (req.method === "PUT") {
    _readJsonBody(req)
      .then((raw) => {
        const body = raw as Record<string, unknown>;
        const id = typeof body.id === "string" ? body.id : "";

        if (!id) {
          _badRequest(res, "Missing required field: id");
          return;
        }

        const input: UpdateMCPServerInput = {
          id,
          name: typeof body.name === "string" ? body.name : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          type: typeof body.type === "string" ? (body.type as any) : undefined,
          url: typeof body.url === "string" ? body.url : undefined,
          command: typeof body.command === "string" ? body.command : undefined,
          arguments: typeof body.arguments === "string" ? body.arguments : undefined,
          environment_variables: typeof body.environment_variables === "string" ? body.environment_variables : undefined,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        };

        try {
          const server = updateServer(input);
          _ok(res, "MCP server updated", toPublicServer(server));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("not found")) {
            _notFound(res, message);
          } else {
            _badRequest(res, message);
          }
        }
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  // DELETE /api/api/mcp/ -- delete
  if (req.method === "DELETE") {
    _readJsonBody(req)
      .then((raw) => {
        const body = raw as Record<string, unknown>;
        const id = typeof body.id === "string" ? body.id : "";

        if (!id) {
          _badRequest(res, "Missing required field: id");
          return;
        }

        const removed = deleteServer(id);
        if (!removed) {
          _notFound(res, `MCP server not found: ${id}`);
          return;
        }
        _ok(res, "MCP server deleted");
      })
      .catch((err) => {
        _badRequest(res, err instanceof Error ? err.message : "Invalid JSON body");
      });
    return true;
  }

  return false;
}
