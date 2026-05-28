import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "./logger";

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: string;
  authToken?: string | null;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  serverName: string;
  toolName: string;
  ok: boolean;
  output: string;
}

function makeTransport(server: McpServerConfig) {
  const headers: Record<string, string> = {};
  if (server.authToken) headers["Authorization"] = `Bearer ${server.authToken}`;
  const url = new URL(server.url);
  if (server.transport === "http" || server.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  }
  return new SSEClientTransport(url, { requestInit: { headers } });
}

export async function discoverMcpTools(server: McpServerConfig, timeoutMs = 8000): Promise<McpTool[]> {
  const client = new Client({ name: "orahai", version: "1.0" }, { capabilities: {} });
  const transport = makeTransport(server);
  const timer = setTimeout(() => { try { client.close(); } catch { /* ignore */ } }, timeoutMs);
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return tools.map(t => ({
      serverId: server.id,
      serverName: server.name,
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  } finally {
    clearTimeout(timer);
    try { await client.close(); } catch { /* ignore */ }
  }
}

export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<string> {
  const client = new Client({ name: "orahai", version: "1.0" }, { capabilities: {} });
  const transport = makeTransport(server);
  const timer = setTimeout(() => { try { client.close(); } catch { /* ignore */ } }, timeoutMs);
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text)
      .join("\n");
    return text || JSON.stringify(result.content);
  } finally {
    clearTimeout(timer);
    try { await client.close(); } catch { /* ignore */ }
  }
}

export async function discoverAllMcpTools(servers: McpServerConfig[]): Promise<{
  tools: McpTool[];
  errors: { serverName: string; error: string }[];
}> {
  const tools: McpTool[] = [];
  const errors: { serverName: string; error: string }[] = [];
  await Promise.all(servers.map(async (srv) => {
    try {
      const discovered = await discoverMcpTools(srv);
      tools.push(...discovered);
    } catch (err) {
      logger.warn({ err, server: srv.name }, "MCP tool discovery failed");
      errors.push({ serverName: srv.name, error: (err as Error).message });
    }
  }));
  return { tools, errors };
}
