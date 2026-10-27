import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { ATTRIBUTION, JmaError, SERVER_NAME, SERVER_VERSION } from "./http.js";
import { findAreas } from "./areas.js";
import { getForecast } from "./forecast.js";
import { getWarnings } from "./warnings.js";
import { getEarthquakeDetail, listEarthquakes } from "./quake.js";
import { getTsunamiInfo } from "./tsunami.js";
import { getVolcanoWarnings } from "./volcano.js";
import { INTENSITY_SCALE } from "./codes.js";

export const TOOL_FIND_AREA = "jma_find_area";
export const TOOL_FORECAST = "jma_get_forecast";
export const TOOL_WARNINGS = "jma_get_warnings";
export const TOOL_LIST_EARTHQUAKES = "jma_list_earthquakes";
export const TOOL_EARTHQUAKE = "jma_get_earthquake";
export const TOOL_TSUNAMI = "jma_get_tsunami";
export const TOOL_VOLCANO = "jma_get_volcano_warnings";

const AREA_PARAM = {
  type: "string",
  description:
    "Place in Japan: prefecture, city, ward, town or region in kanji (東京都, 大阪市, 渋谷区), kana (さっぽろ, ナハ), " +
    "or romaji/English (Tokyo, Sapporo, Naha, Shibuya); or a 6–7 digit JMA area code from jma_find_area.",
} as const;

export const TOOLS: Tool[] = [
  {
    name: TOOL_FIND_AREA,
    description:
      "Looks up Japan Meteorological Agency (JMA, 気象庁) area codes for a place in Japan. Accepts kanji (東京都, 札幌市, 渋谷区), " +
      "kana (さっぽろ, シブヤ), romaji/English (Sapporo, Shibuya, Tokyo) or a JMA code. Returns ranked matches with their level " +
      "(office = prefecture-level forecast district 府県予報区; class10 = sub-region 一次細分区域; class15 = local area; " +
      "class20 = municipality 市区町村; center = regional block such as 北海道地方), the hierarchy path, and office_code, the code " +
      "jma_get_forecast and jma_get_warnings use. You can usually pass a place name straight to those tools; call this first " +
      "when a name is ambiguous (府中 exists in Tokyo and Hiroshima) or to show the user which area was meant. No API key needed.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Place name in kanji, kana or romaji, e.g. '札幌', 'さっぽろ', 'Sapporo', '那覇市', 'Shibuya', or a JMA code like '130000'.",
        },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum number of matches to return (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_FORECAST,
    description:
      "Weather forecast from the Japan Meteorological Agency (JMA, 気象庁) for a place in Japan. Returns: today and the next 2 days " +
      "per sub-region (weather text, wind, wave height in metres, precipitation chance in % for each 6-hour block, morning low and " +
      "daytime high in °C at observation stations); a 7-day outlook (weather, precipitation chance %, reliability A=high/B=fair/C=low, " +
      "low/high °C with the likely range, 30-year climate normals); and the forecaster's written overview. JMA issues forecasts per " +
      "prefecture-level office around 05:00, 11:00 and 17:00 JST. Naming a municipality narrows the result to its sub-region. " +
      "All times are JST (+09:00). Weather, wind and wave text is Japanese as JMA issued it; weather_en is an English label for each weather code.",
    inputSchema: {
      type: "object",
      properties: { area: AREA_PARAM },
      required: ["area"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_WARNINGS,
    description:
      "Weather warnings and advisories (気象警報・注意報) in effect now, from the Japan Meteorological Agency (JMA), for a place in Japan. " +
      "Uses the warning system JMA introduced on 2026-05-28: advisory 注意報 < warning 警報 < urgent warning 危険警報 < emergency " +
      "warning 特別警報; heavy rain, landslide and storm surge also carry an alert level 2–5 (警戒レベル). Returns the distinct warnings " +
      "in effect (severity, alert level, how many sub-regions and municipalities), each affected area with its warnings and extra " +
      "hazards (e.g. 竜巻 tornado, ひょう hail, うねり swell), and JMA's Japanese headline text. An empty in_effect list means no " +
      "warning or advisory is in effect for that area. Naming a municipality narrows the result to it.",
    inputSchema: {
      type: "object",
      properties: { area: AREA_PARAM },
      required: ["area"],
      additionalProperties: false,
    },
  },
  {
    name: TOOL_LIST_EARTHQUAKES,
    description:
      "Recent earthquakes in and around Japan from the Japan Meteorological Agency (JMA) feed, newest first (the feed covers roughly the " +
      "last few weeks). Each item: origin time (JST), epicenter name in Japanese and English with latitude/longitude and depth in km, " +
      "JMA magnitude (Mj), maximum seismic intensity on the JMA 震度 scale (1, 2, 3, 4, 5- = 5弱, 5+ = 5強, 6- = 6弱, 6+ = 6強, 7; this is " +
      "not the Mercalli scale), maximum intensity per prefecture, and a detail_id for jma_get_earthquake. Use the filters to find " +
      "significant quakes, e.g. min_intensity '4' or min_magnitude 5.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum number of earthquakes to return (default 10)." },
        min_intensity: {
          type: "string",
          enum: [...INTENSITY_SCALE],
          description: "Only quakes whose maximum JMA seismic intensity (震度) is at least this: '1'–'4', '5-' (5弱), '5+' (5強), '6-', '6+', '7'.",
        },
        min_magnitude: { type: "number", description: "Only quakes with JMA magnitude (Mj) at least this, e.g. 5.0." },
        since_hours: { type: "number", exclusiveMinimum: 0, description: "Only quakes that occurred within this many hours before now." },
      },
      additionalProperties: false,
    },
  },
  {
    name: TOOL_EARTHQUAKE,
    description:
      "Full Japan Meteorological Agency (JMA) report for one earthquake: hypocenter (name, latitude/longitude, depth in km), JMA magnitude, " +
      "JMA's tsunami assessment in Japanese and English (e.g. 'This earthquake poses no tsunami risk.'), and observed seismic intensity " +
      "(震度) by prefecture → region → municipality, strongest first. Set include_stations to also get each seismometer's reading and " +
      "coordinates (large quakes have hundreds). Identify the quake with detail_id from jma_list_earthquakes, or with its 14-digit event_id.",
    inputSchema: {
      type: "object",
      properties: {
        detail_id: { type: "string", description: "The detail_id from jma_list_earthquakes, e.g. '20261008041755_20261008041355_VXSE5k_1.json'." },
        event_id: { type: "string", description: "JMA event ID (origin time as YYYYMMDDhhmmss JST), e.g. '20261008041355'." },
        include_stations: { type: "boolean", description: "Include per-station intensities with coordinates (default false)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: TOOL_TSUNAMI,
    description:
      "Tsunami warnings, advisories and forecasts (津波警報・注意報・予報) from the Japan Meteorological Agency (JMA). Returns the latest " +
      "bulletin for each recent tsunami-related event, newest first, with: whether it is still in effect; its highest level " +
      "(major_warning 大津波警報 > warning 津波警報 > advisory 津波注意報 > forecast 津波予報, i.e. slight sea-level change with no damage expected); " +
      "coastal forecast areas grouped by category with expected maximum height in metres and first-wave arrival time (JST); observed " +
      "tsunami heights if any; and the source earthquake (which may be far from Japan). any_warning_in_effect=false means no tsunami " +
      "warning or advisory is active now.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 10, description: "How many recent events to return (default 3)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: TOOL_VOLCANO,
    description:
      "Volcanic eruption warnings (噴火警報) from the Japan Meteorological Agency (JMA). Lists volcanoes in JMA's current eruption-warning " +
      "feed with their Volcanic Alert Level 1–5 (噴火警戒レベル), JMA's status wording (e.g. レベル２（火口周辺規制） = Level 2, do not " +
      "approach the crater; 周辺海域警戒 = stay clear of surrounding waters), whether the level was raised (引上げ) or lowered (引下げ), " +
      "the affected municipalities, required actions and coordinates. Optional volcano filter by Japanese or romaji name (桜島, " +
      "Sakurajima, 阿蘇, Aso) or JMA volcano code. A volcano that is not in the feed has no eruption warning in effect.",
    inputSchema: {
      type: "object",
      properties: {
        volcano: { type: "string", description: "Optional volcano name (桜島, Sakurajima, 十勝岳, Tokachidake) or JMA volcano code (e.g. '506')." },
      },
      additionalProperties: false,
    },
  },
];

// ─── Argument helpers ────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

function optionalString(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new McpError(ErrorCode.InvalidParams, `'${key}' must be a string.`);
  return v;
}

function requiredString(args: Args, key: string): string {
  const v = optionalString(args, key);
  if (v === undefined || v.trim() === "") throw new McpError(ErrorCode.InvalidParams, `'${key}' is required.`);
  if (v.length > 200) throw new McpError(ErrorCode.InvalidParams, `'${key}' must be at most 200 characters.`);
  return v;
}

function optionalNumber(args: Args, key: string, min?: number, max?: number, integer = false): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v))) {
    throw new McpError(ErrorCode.InvalidParams, `'${key}' must be ${integer ? "an integer" : "a number"}.`);
  }
  if ((min !== undefined && v < min) || (max !== undefined && v > max)) {
    throw new McpError(ErrorCode.InvalidParams, `'${key}' must be between ${min ?? "-∞"} and ${max ?? "∞"}.`);
  }
  return v;
}

function optionalBoolean(args: Args, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new McpError(ErrorCode.InvalidParams, `'${key}' must be a boolean.`);
  return v;
}

function ok(data: unknown, note?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, data, ...(note ? { note } : {}), attribution: ATTRIBUTION }, null, 2),
      },
    ],
  };
}

async function dispatch(name: string, args: Args) {
  switch (name) {
    case TOOL_FIND_AREA: {
      const query = requiredString(args, "query");
      const limit = optionalNumber(args, "limit", 1, 20, true) ?? 5;
      const matches = await findAreas(query, limit);
      return ok(
        { query, matches },
        matches.length === 0
          ? "No match. Try another spelling, the prefecture name, or kana."
          : "Pass a match's code (or office_code) as 'area' to jma_get_forecast or jma_get_warnings."
      );
    }

    case TOOL_FORECAST: {
      const result = await getForecast(requiredString(args, "area"));
      return ok(
        result,
        result.other_candidates.length > 0
          ? `"${result.resolved.query}" also matches other places (see other_candidates); call again with a code if the wrong one was used.`
          : undefined
      );
    }

    case TOOL_WARNINGS: {
      const result = await getWarnings(requiredString(args, "area"));
      return ok(
        result,
        result.in_effect.length === 0
          ? `No warnings or advisories are in effect for ${result.resolved.name}.`
          : `${result.in_effect.length} kind(s) of warning/advisory in effect for ${result.resolved.name}.`
      );
    }

    case TOOL_LIST_EARTHQUAKES: {
      const minIntensity = optionalString(args, "min_intensity");
      if (minIntensity !== undefined && !(INTENSITY_SCALE as readonly string[]).includes(minIntensity)) {
        throw new McpError(ErrorCode.InvalidParams, `'min_intensity' must be one of ${INTENSITY_SCALE.join(", ")}.`);
      }
      const result = await listEarthquakes({
        limit: optionalNumber(args, "limit", 1, 50, true),
        min_intensity: minIntensity,
        min_magnitude: optionalNumber(args, "min_magnitude", -2, 10),
        since_hours: optionalNumber(args, "since_hours", 0),
      });
      return ok(result);
    }

    case TOOL_EARTHQUAKE: {
      const result = await getEarthquakeDetail({
        detail_id: optionalString(args, "detail_id"),
        event_id: optionalString(args, "event_id"),
        include_stations: optionalBoolean(args, "include_stations"),
      });
      return ok(result);
    }

    case TOOL_TSUNAMI: {
      const result = await getTsunamiInfo({ limit: optionalNumber(args, "limit", 1, 10, true) });
      return ok(
        result,
        result.bulletins.length === 0
          ? "JMA's tsunami feed has no recent bulletins."
          : result.any_warning_in_effect
            ? "A tsunami warning or advisory is in effect. Move away from the coast in the listed areas."
            : "No tsunami warning or advisory is in effect now."
      );
    }

    case TOOL_VOLCANO: {
      const result = await getVolcanoWarnings({ volcano: optionalString(args, "volcano") });
      return ok(result);
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: "${name}"`);
  }
}

export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (args !== undefined && (typeof args !== "object" || args === null)) {
      throw new McpError(ErrorCode.InvalidParams, "Tool arguments must be an object.");
    }

    try {
      return await dispatch(name, (args ?? {}) as Args);
    } catch (err) {
      if (err instanceof JmaError) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: err.payload }, null, 2) }],
          isError: true,
        };
      }
      if (err instanceof McpError) throw err;
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${String(err)}`);
    }
  });

  return server;
}
