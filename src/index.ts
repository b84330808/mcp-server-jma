#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";
import { SERVER_NAME, SERVER_VERSION } from "./http.js";

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is reserved for MCP JSON-RPC messages
  process.stderr.write(`${SERVER_NAME} v${SERVER_VERSION} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
