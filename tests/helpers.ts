import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { BOSAI_BASE, clearCache } from "../src/http";

const FIXTURES = path.join(__dirname, "fixtures");

/**
 * Serves recorded JMA responses (tests/fixtures, recorded 2026-10-27) in place of
 * axios.get. "forecast/data/forecast/130000.json" maps to
 * "forecast_data_forecast_130000.json". Unknown paths answer 404 like JMA does.
 */
export function serveFixtures(overrides: Record<string, unknown> = {}): jest.Mock {
  clearCache();
  const mocked = axios as jest.Mocked<typeof axios>;
  const get = jest.fn(async (url: string) => {
    const rel = url.startsWith(BOSAI_BASE + "/") ? url.slice(BOSAI_BASE.length + 1) : url;
    if (rel in overrides) return { data: overrides[rel] };
    const file = path.join(FIXTURES, rel.replace(/\//g, "_"));
    if (!fs.existsSync(file)) {
      throw Object.assign(new Error("Request failed with status code 404"), {
        isAxiosError: true,
        response: { status: 404 },
      });
    }
    return { data: JSON.parse(fs.readFileSync(file, "utf8")) };
  });
  mocked.get = get as unknown as typeof mocked.get;
  (mocked.isAxiosError as unknown as jest.Mock).mockImplementation(
    (e: unknown) => typeof e === "object" && e !== null && (e as { isAxiosError?: boolean }).isAxiosError === true
  );
  return get;
}

export function fixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8")) as T;
}
