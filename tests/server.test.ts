import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, TOOLS } from "../src/server";
import { clearCache, fetchJson, SERVER_VERSION, TTL, USER_AGENT } from "../src/http";
import { serveFixtures } from "./helpers";
import * as pkg from "../package.json";
import * as serverJson from "../server.json";

jest.mock("axios");

async function connect() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function parse(result: unknown): { success: boolean; data?: any; error?: any; attribution?: string } {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0].text);
}

beforeEach(() => {
  serveFixtures();
});

describe("MCP server", () => {
  it("lists seven tools with descriptions and object schemas", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "jma_find_area",
      "jma_get_forecast",
      "jma_get_warnings",
      "jma_list_earthquakes",
      "jma_get_earthquake",
      "jma_get_tsunami",
      "jma_get_volcano_warnings",
    ]);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(100);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("answers a forecast call with data and JMA attribution", async () => {
    const client = await connect();
    const body = parse(await client.callTool({ name: "jma_get_forecast", arguments: { area: "那覇" } }).catch((e) => e));
    // 那覇 → office 471000, which has no recorded fixture: the error must be structured.
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");

    const ok = parse(await client.callTool({ name: "jma_get_forecast", arguments: { area: "Shibuya" } }));
    expect(ok.success).toBe(true);
    expect(ok.data.office.code).toBe("130000");
    expect(ok.attribution).toContain("出典：気象庁ホームページ");
  });

  it("returns structured errors for unknown areas", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "jma_get_warnings", arguments: { area: "Atlantis" } });
    expect(result.isError).toBe(true);
    expect(parse(result).error.code).toBe("AREA_NOT_FOUND");
  });

  it("rejects bad arguments", async () => {
    const client = await connect();
    await expect(client.callTool({ name: "jma_list_earthquakes", arguments: { min_intensity: "5" } })).rejects.toThrow(/min_intensity/);
    await expect(client.callTool({ name: "jma_get_forecast", arguments: {} })).rejects.toThrow(/area/);
  });

  it("runs every tool against the fixtures", async () => {
    const client = await connect();
    const calls: Array<[string, Record<string, unknown>]> = [
      ["jma_find_area", { query: "さっぽろ" }],
      ["jma_get_warnings", { area: "東京" }],
      ["jma_list_earthquakes", { limit: 3 }],
      ["jma_get_earthquake", { event_id: "20261008041355" }],
      ["jma_get_tsunami", {}],
      ["jma_get_volcano_warnings", { volcano: "桜島" }],
    ];
    for (const [name, args] of calls) {
      const body = parse(await client.callTool({ name, arguments: args }));
      expect({ name, success: body.success }).toEqual({ name, success: true });
    }
  });
});

describe("HTTP politeness", () => {
  it("sends a User-Agent naming the project and caches responses", async () => {
    const get = serveFixtures();
    await fetchJson("volcano/data/warning.json", TTL.volcano);
    await fetchJson("volcano/data/warning.json", TTL.volcano);
    expect(get).toHaveBeenCalledTimes(1);
    const [, config] = get.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(config.headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toContain("https://github.com/b84330808/mcp-server-jma");
  });

  it("refetches after the TTL expires", async () => {
    const get = serveFixtures();
    jest.useFakeTimers({ now: new Date("2026-10-27T12:00:00Z") });
    try {
      await fetchJson("volcano/data/warning.json", TTL.volcano);
      jest.setSystemTime(new Date(Date.now() + TTL.volcano + 1));
      await fetchJson("volcano/data/warning.json", TTL.volcano);
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("maps timeouts to UPSTREAM_TIMEOUT", async () => {
    clearCache();
    (axios.get as unknown as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" })
    );
    await expect(fetchJson("quake/data/list.json", TTL.list)).rejects.toMatchObject({ payload: { code: "UPSTREAM_TIMEOUT" } });
  });
});

describe("release metadata", () => {
  it("keeps versions in sync", () => {
    expect(pkg.version).toBe(SERVER_VERSION);
    expect(serverJson.version).toBe(SERVER_VERSION);
    expect(serverJson.packages[0].version).toBe(SERVER_VERSION);
    expect(serverJson.name).toBe(pkg.mcpName);
  });

  it("exports the tool list used by the server", () => {
    expect(TOOLS).toHaveLength(7);
  });
});
