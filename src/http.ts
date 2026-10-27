import axios, { AxiosError } from "axios";
import type { McpErrorPayload } from "./types.js";

export const SERVER_NAME = "mcp-server-jma";
export const SERVER_VERSION = "0.1.0";
export const REPO_URL = "https://github.com/b84330808/mcp-server-jma";

export const BOSAI_BASE = "https://www.jma.go.jp/bosai";
export const USER_AGENT = `${SERVER_NAME}/${SERVER_VERSION} (+${REPO_URL})`;
export const ATTRIBUTION = "出典：気象庁ホームページ (Source: Japan Meteorological Agency website, https://www.jma.go.jp/)";

const REQUEST_TIMEOUT_MS = 10_000;

const MINUTE = 60_000;

// How long each kind of response stays cached. JMA updates forecasts a few
// times a day and warnings/quake lists within minutes; constants and
// individual quake/tsunami bulletins never change once published.
export const TTL = {
  constant: 24 * 60 * MINUTE,
  forecast: 10 * MINUTE,
  warning: 2 * MINUTE,
  list: 1 * MINUTE,
  bulletin: 24 * 60 * MINUTE,
  volcano: 5 * MINUTE,
} as const;

export class JmaError extends Error {
  constructor(
    public readonly payload: McpErrorPayload,
    message: string
  ) {
    super(message);
    this.name = "JmaError";
  }
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Drops every cached response. Used by tests. */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * GETs a JSON document below https://www.jma.go.jp/bosai/ and caches it for `ttlMs`.
 * Concurrent requests for the same path share one HTTP request.
 */
export async function fetchJson<T>(path: string, ttlMs: number): Promise<T> {
  const url = `${BOSAI_BASE}/${path}`;
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expires > now) {
    return hit.value as T;
  }

  const pending = inflight.get(url);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = (async () => {
    try {
      const { data } = await axios.get<T>(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        responseType: "json",
      });
      if (typeof data !== "object" || data === null) {
        throw new JmaError(
          { code: "UPSTREAM_ERROR", message: `JMA returned a non-JSON response for ${url}.` },
          "Non-JSON response"
        );
      }
      cache.set(url, { expires: Date.now() + ttlMs, value: data });
      return data;
    } catch (err) {
      throw toJmaError(err, url);
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}

function toJmaError(err: unknown, url: string): JmaError {
  if (err instanceof JmaError) return err;
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError;
    if (axiosErr.code === "ECONNABORTED" || axiosErr.code === "ETIMEDOUT") {
      return new JmaError(
        { code: "UPSTREAM_TIMEOUT", message: `JMA did not respond within ${REQUEST_TIMEOUT_MS / 1000} s.`, details: url },
        "Timeout"
      );
    }
    const status = axiosErr.response?.status;
    if (status === 404) {
      return new JmaError(
        { code: "NOT_FOUND", message: "JMA has no data at this address (404).", details: url },
        "Not found"
      );
    }
    return new JmaError(
      {
        code: "UPSTREAM_ERROR",
        message: status ? `JMA responded with HTTP ${status}.` : `Request to JMA failed: ${axiosErr.message}`,
        details: url,
      },
      "Upstream error"
    );
  }
  return new JmaError({ code: "UPSTREAM_ERROR", message: String(err), details: url }, "Upstream error");
}
