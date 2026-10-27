# mcp-server-jma

> **An MCP server for Japan Meteorological Agency (気象庁, JMA) data** — weather forecasts, warnings and advisories, earthquakes with per-area seismic intensity, tsunami bulletins and volcano alerts. Place names work in kanji, kana or romaji. No API key.

[![CI](https://github.com/b84330808/mcp-server-jma/actions/workflows/ci.yml/badge.svg)](https://github.com/b84330808/mcp-server-jma/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io)

**English** · [日本語](README.ja.md)

---

## Why

JMA publishes its forecasts, warnings and earthquake data as JSON behind
[www.jma.go.jp/bosai](https://www.jma.go.jp/bosai/), but the feeds are keyed by
6–7 digit area codes, use numeric weather and warning codes, and split one
earthquake over several bulletins. This server does that legwork so an LLM can
answer "Is there a warning in Sapporo?" or "How strong was this morning's quake
in Chiba?" with one tool call:

- **Place names in any script** — `渋谷区`, `しぶや`, `シブヤ`, `Shibuya` and `1311300` all resolve through JMA's own `area.json`.
- **Codes decoded** — weather codes get JMA's Japanese and English labels; warning codes become names, severity and alert level.
- **The 2026-05-28 warning system** — JMA moved warnings to a new feed (`warning/data/r8/`) with the new 危険警報 (urgent warning, alert level 4) tier. This server reads the new feed and merges its per-type bulletin streams into "what is in effect now".
- **Polite client** — responses are cached (forecasts 10 min, warnings 2 min, quake and tsunami lists 1 min, area tables 24 h), concurrent identical requests share one fetch, and every request sends `User-Agent: mcp-server-jma/<version> (+https://github.com/b84330808/mcp-server-jma)`.

## Tools

| Tool | What it returns |
|---|---|
| `jma_find_area` | Ranked JMA areas for a place name (kanji, kana, romaji) or code: level (office / class10 / class15 / class20 / center), hierarchy path, and the `office_code` used for forecasts and warnings. |
| `jma_get_forecast` | Today + 2 days per sub-region (weather text, English label, wind, waves, 6-hour precipitation chance %, morning low / daytime high °C per station) and the 7-day outlook (weather, precipitation %, reliability A/B/C, low/high °C with likely range, climate normals), plus the forecaster's written overview. |
| `jma_get_warnings` | Warnings and advisories in effect now: name (ja/en), severity (`advisory` / `warning` / `urgent_warning` / `emergency_warning`), alert level 2–5 where JMA assigns one, extra hazards (竜巻, ひょう …), affected sub-regions and municipalities, and JMA's headline. |
| `jma_list_earthquakes` | Recent quakes, newest first: origin time, epicenter (ja/en, lat/lon, depth km), magnitude, maximum JMA seismic intensity (震度), per-prefecture maxima, and a `detail_id`. Filters: `min_intensity`, `min_magnitude`, `since_hours`, `limit`. |
| `jma_get_earthquake` | One quake in full: hypocenter, magnitude, JMA's tsunami assessment (ja/en), intensity by prefecture → region → municipality (strongest first), and optional per-station readings with coordinates. |
| `jma_get_tsunami` | Latest tsunami bulletin per recent event: in effect or not, highest level (`major_warning` / `warning` / `advisory` / `forecast`), coastal areas grouped by category with expected max height (m) and first-wave arrival, observations, and the source earthquake. |
| `jma_get_volcano_warnings` | Volcanoes in JMA's eruption-warning feed: Volcanic Alert Level 1–5, status wording, raised/lowered, affected municipalities, actions and coordinates. Optional name filter (`桜島`, `Sakurajima`). |

Every response is JSON shaped like `{ "success": true, "data": …, "note": …, "attribution": "出典：気象庁ホームページ …" }`.
Errors come back as `{ "success": false, "error": { "code", "message" } }` with codes such as
`AREA_NOT_FOUND`, `AREA_TOO_BROAD` (e.g. `北海道` — the error lists the forecast offices to pick from),
`EVENT_NOT_FOUND`, `NOT_FOUND`, `UPSTREAM_TIMEOUT` and `UPSTREAM_ERROR`.

**Units.** Temperatures °C · precipitation chance % · 7-day precipitation normals mm · depth km · tsunami height m · magnitude is JMA magnitude (Mj) · seismic intensity is the JMA 震度 scale (`1`–`4`, `5-` 5弱, `5+` 5強, `6-` 6弱, `6+` 6強, `7`), not Mercalli · all times are JST (`+09:00`).

## Live output

Real output of `npm run smoke` (the built server over stdio, against the live JMA endpoints) on 2026-10-27 16:12 JST. It prints a compact summary of each tool result; `npm run smoke -- --full` prints the full JSON.

<details open>
<summary><code>npm run smoke</code> — 2026-10-27 16:12 JST</summary>

```text
### jma_find_area {"query":"さっぽろ","limit":3} (168 ms)
[
  {
    "code": "0110000",
    "level": "class20",
    "name": "札幌市",
    "name_en": "Sapporo City",
    "office_code": "016000",
    "path": "北海道地方 > 石狩・空知・後志地方 > 石狩地方 > 石狩中部 > 札幌市"
  }
]

### jma_get_forecast {"area":"Shibuya"} (49 ms)
{
  "office": {
    "code": "130000",
    "name": "東京都"
  },
  "resolved": {
    "query": "Shibuya",
    "code": "1311300",
    "level": "class20",
    "name": "渋谷区",
    "name_en": "Shibuya City",
    "path": "関東甲信地方 > 東京都 > 東京地方 > ２３区西部 > 渋谷区"
  },
  "report_datetime": "2026-10-27T11:00:00+09:00",
  "short_term": [
    {
      "name": "東京地方",
      "days": [
        "2026-10-27 くもり 時々 晴れ 所により 昼前 雨 (Mostly Cloudy)",
        "2026-10-28 晴れ 夜 くもり (Clear)",
        "2026-10-29 くもり 時々 晴れ (Mostly Cloudy)"
      ],
      "precipitation_chance": [
        "10-27T12:00 10%",
        "10-27T18:00 10%",
        "10-28T00:00 0%",
        "10-28T06:00 0%",
        "10-28T12:00 0%",
        "10-28T18:00 0%"
      ]
    }
  ],
  "temperatures": [
    {
      "station_code": "44132",
      "station": "東京",
      "days": [
        {
          "date": "2026-10-27",
          "min_c": null,
          "max_c": 22
        },
        {
          "date": "2026-10-28",
          "min_c": 15,
          "max_c": 20
        }
      ]
    }
  ],
  "weekly": [
    {
      "name": "東京地方",
      "days": [
        "2026-10-28 Clear -%",
        "2026-10-29 Mostly Cloudy 30%",
        "2026-10-30 Cloudy, Occasional Scattered Showers 50% C",
        "2026-10-31 Cloudy 40% B",
        "2026-11-01 Partly Cloudy 20% A",
        "2026-11-02 Cloudy 40% B",
        "2026-11-03 Mostly Cloudy 30% A"
      ]
    }
  ]
}

### jma_get_warnings {"area":"東京都"} (30 ms)
{
  "office": {
    "code": "130000",
    "name": "東京都"
  },
  "latest_report_datetime": "2026-10-27T16:04:00+09:00",
  "in_effect": [
    {
      "code": "14",
      "name": "雷注意報",
      "name_en": "Thunderstorm Advisory",
      "severity": "advisory",
      "alert_level": null,
      "region_count": 1,
      "municipality_count": 1
    },
    {
      "code": "15",
      "name": "強風注意報",
      "name_en": "Gale Advisory",
      "severity": "advisory",
      "alert_level": null,
      "region_count": 3,
      "municipality_count": 14
    },
    {
      "code": "16",
      "name": "波浪注意報",
      "name_en": "High Wave Advisory",
      "severity": "advisory",
      "alert_level": null,
      "region_count": 3,
      "municipality_count": 14
    }
  ],
  "headlines": [
    {
      "report_datetime": "2026-10-27T16:04:00+09:00",
      "text": "東京地方、伊豆諸島北部、伊豆諸島南部では、強風に注意してください。"
    },
    {
      "report_datetime": "2026-10-27T16:04:00+09:00",
      "text": "東京地方、伊豆諸島北部、伊豆諸島南部では、高波に注意してください。"
    },
    {
      "report_datetime": "2026-10-27T16:04:00+09:00",
      "text": "小笠原諸島では、急な強い雨や落雷に注意してください。"
    }
  ],
  "note": "3 kind(s) of warning/advisory in effect for 東京都."
}

### jma_list_earthquakes {"limit":3} (21 ms)
[
  {
    "origin_time": "2026-10-27T15:32:00+09:00",
    "epicenter": {
      "name": "熊本県熊本地方",
      "name_en": "Kumamoto Region, Kumamoto Prefecture",
      "latitude": 32.5,
      "longitude": 130.6,
      "depth_km": 10
    },
    "magnitude": 3,
    "max_intensity": {
      "value": "2",
      "ja": "震度2",
      "en": "2"
    },
    "detail_id": "20261027153541_20261027153247_VXSE5k_1.json"
  },
  {
    "origin_time": "2026-10-27T09:25:00+09:00",
    "epicenter": {
      "name": "福島県沖",
      "name_en": "Off the Coast of Fukushima Prefecture",
      "latitude": 37.4,
      "longitude": 141.5,
      "depth_km": 60
    },
    "magnitude": 4.6,
    "max_intensity": {
      "value": "3",
      "ja": "震度3",
      "en": "3"
    },
    "detail_id": "20261027092912_20261027092519_VXSE5k_1.json"
  },
  {
    "origin_time": "2026-10-27T08:54:00+09:00",
    "epicenter": {
      "name": "熊本県天草・芦北地方",
      "name_en": "Amakusa and Ashikita Region, Kumamoto Prefecture",
      "latitude": 32.3,
      "longitude": 130.4,
      "depth_km": 10
    },
    "magnitude": 2.1,
    "max_intensity": {
      "value": "1",
      "ja": "震度1",
      "en": "1"
    },
    "detail_id": "20261027085717_20261027085407_VXSE5k_1.json"
  }
]

### jma_get_earthquake {"detail_id":"20261027153541_20261027153247_VXSE5k_1.json"} (12 ms)
{
  "title": "震源・震度情報",
  "origin_time": "2026-10-27T15:32:00+09:00",
  "epicenter": {
    "name": "熊本県熊本地方",
    "name_en": "Kumamoto Region, Kumamoto Prefecture",
    "latitude": 32.5,
    "longitude": 130.6,
    "depth_km": 10
  },
  "magnitude": 3,
  "max_intensity": {
    "value": "2",
    "ja": "震度2",
    "en": "2"
  },
  "tsunami_comment": {
    "ja": "この地震による津波の心配はありません。",
    "en": "This earthquake poses no tsunami risk."
  },
  "intensity_by_prefecture": [
    {
      "name": "熊本県",
      "max_intensity": "2",
      "cities": [
        "八代市 震度2",
        "熊本西区 震度1",
        "宇城市 震度1"
      ]
    }
  ]
}

### jma_get_tsunami {"limit":1} (26 ms)
{
  "any_warning_in_effect": false,
  "any_in_effect": false,
  "bulletins": [
    {
      "title": "津波予報",
      "report_datetime": "2026-10-10T03:37:00+09:00",
      "valid_until": "2026-10-11T20:00:00+09:00",
      "in_effect": false,
      "highest_level": "forecast",
      "earthquake": {
        "origin_time": "2026-10-10T02:56:00+09:00",
        "epicenter": "中米",
        "epicenter_en": "Central America",
        "latitude": 7.5,
        "longitude": -80.8,
        "depth_km": null,
        "magnitude": 8
      },
      "areas": 28
    }
  ],
  "note": "No tsunami warning or advisory is in effect now."
}

### jma_get_volcano_warnings {"volcano":"桜島"} (17 ms)
[
  {
    "name": "桜島",
    "name_en": "Sakurajima",
    "alert_level": 3,
    "status": "レベル3(入山規制)",
    "change": "引下げ",
    "warning_in_effect": true,
    "report_datetime": "2022-07-27T20:00:00+09:00"
  }
]
```

</details>

## Installation

### Claude Desktop

Add this to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jma": {
      "command": "npx",
      "args": ["-y", "--package=https://github.com/b84330808/mcp-server-jma/releases/download/v0.1.0/mcp-server-jma-0.1.0.tgz", "mcp-server-jma"]
    }
  }
}
```

Restart Claude Desktop. The URL is the `npm pack` tarball attached to the [v0.1.0 release](https://github.com/b84330808/mcp-server-jma/releases/tag/v0.1.0); `npx` installs it and its runtime dependencies. Once the package is on npm, `"args": ["-y", "mcp-server-jma"]` works too. (`npx github:b84330808/mcp-server-jma` does not work: current npm fails on git installs that need a build step.)

### Claude Code

```bash
claude mcp add jma -- npx -y --package=https://github.com/b84330808/mcp-server-jma/releases/download/v0.1.0/mcp-server-jma-0.1.0.tgz mcp-server-jma
```

### From source

```bash
git clone https://github.com/b84330808/mcp-server-jma.git
cd mcp-server-jma
npm install
npm run build
```

Then point your client at it:

```json
{
  "mcpServers": {
    "jma": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-jma/dist/index.js"]
    }
  }
}
```

### Example prompts

- 「明日の札幌の天気は？」 / "What's the weather in Naha this week?"
- "Are there any weather warnings for Shibuya right now?"
- 「今朝の地震、千葉ではどのくらい揺れた？」
- "Is there a tsunami warning in effect?"
- "What is Sakurajima's volcanic alert level?"

## Data source and terms

- **Source:** 出典：気象庁ホームページ ([www.jma.go.jp](https://www.jma.go.jp/)). Every tool response carries this attribution and a `source_url` pointing to the matching JMA page; keep it when you show or redistribute the data.
- JMA content is provided under the [気象庁ホームページ利用規約](https://www.jma.go.jp/jma/kishou/info/coment.html), which follows the Government of Japan Standard Terms of Use (政府標準利用規約 2.0, compatible with CC BY 4.0). If you edit or process the data, say so and do not present it as JMA's own output.
- **Unofficial endpoints, no SLA.** The `bosai` JSON files are what JMA's own web pages load; they are public but not a documented API. JMA can change or remove them without notice (it did so for warnings on 2026-05-28). If a tool starts returning `NOT_FOUND` or empty data, check the corresponding page on jma.go.jp and open an issue.
- This server is not affiliated with or endorsed by JMA. For life-safety decisions, follow JMA, your municipality and broadcast alerts directly.

Endpoints used (all under `https://www.jma.go.jp/bosai/`):

| Data | Path | Cache |
|---|---|---|
| Area table | `common/const/area.json` | 24 h |
| Forecast / overview | `forecast/data/forecast/{office}.json`, `forecast/data/overview_forecast/{office}.json` | 10 min |
| Forecast area maps | `forecast/const/forecast_area.json`, `forecast/const/week_area.json` | 24 h |
| Warnings (since 2026-05-28) | `warning/data/r8/{office}.json` | 2 min |
| Earthquakes | `quake/data/list.json`, `quake/data/{detail_id}` | 1 min / 24 h |
| Tsunami | `tsunami/data/list.json`, `tsunami/data/{file}` | 1 min / 24 h |
| Volcanoes | `volcano/data/warning.json`, `volcano/const/volcano_list.json` | 5 min / 24 h |

## Development

```bash
npm install
npm run lint     # type check
npm test         # unit tests on recorded fixtures (tests/fixtures, recorded 2026-10-27)
npm run build
npm run smoke    # live run against JMA (network)
```

Tests never touch the network: `tests/helpers.ts` serves the recorded JMA responses in place of `axios.get`.

### Project structure

```
src/
├── index.ts         # stdio entry point
├── server.ts        # tool definitions and dispatch
├── http.ts          # fetch + cache + User-Agent, error mapping
├── areas.ts         # area.json index and place-name resolver
├── forecast.ts      # 3-day + weekly forecast parser
├── warnings.ts      # r8 warning feed → what is in effect
├── quake.ts         # earthquake list and detail
├── tsunami.ts       # tsunami bulletins
├── volcano.ts       # volcano warnings
├── codes.ts         # warning codes, prefectures, intensity scale
├── weatherCodes.ts  # JMA weather code labels (ja/en)
└── text.ts          # text, number, time and romaji helpers
```

## License

MIT — see [LICENSE](LICENSE). The data itself belongs to JMA; see *Data source and terms*.
