#!/usr/bin/env node
// Live smoke test: starts the built server over stdio and calls every tool
// against the real JMA endpoints. Run `npm run build` first.
//
//   node scripts/smoke.mjs            # compact summary per tool
//   node scripts/smoke.mjs --full     # full JSON responses

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const full = process.argv.includes("--full");

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] });
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const calls = [
  ["jma_find_area", { query: "さっぽろ", limit: 3 }],
  ["jma_get_forecast", { area: "Shibuya" }],
  ["jma_get_warnings", { area: "東京都" }],
  ["jma_list_earthquakes", { limit: 3 }],
  ["jma_get_earthquake", { detail_id: null }],
  ["jma_get_tsunami", { limit: 1 }],
  ["jma_get_volcano_warnings", { volcano: "桜島" }],
];

let lastDetailId = null;
let failures = 0;
for (const [name, args] of calls) {
  if (name === "jma_get_earthquake") args.detail_id = lastDetailId;
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const body = JSON.parse(result.content[0].text);
  if (!body.success) failures += 1;
  if (name === "jma_list_earthquakes" && body.success) lastDetailId = body.data.earthquakes[0]?.detail_id ?? null;
  console.log(`\n### ${name} ${JSON.stringify(args)} (${Date.now() - started} ms)`);
  console.log(JSON.stringify(full ? body : summarize(name, body), null, 2));
}

await client.close();
process.exit(failures === 0 ? 0 : 1);

function summarize(name, body) {
  if (!body.success) return body;
  const d = body.data;
  switch (name) {
    case "jma_find_area":
      return d.matches.map((m) => ({ code: m.code, level: m.level, name: m.name, name_en: m.name_en, office_code: m.office_code, path: m.path }));
    case "jma_get_forecast":
      return {
        office: d.office,
        resolved: d.resolved,
        report_datetime: d.report_datetime,
        short_term: d.short_term.areas.map((a) => ({ name: a.name, days: a.days.map((x) => `${x.date} ${x.weather} (${x.weather_en})`), precipitation_chance: a.precipitation_chance.map((p) => `${p.from.slice(5, 16)} ${p.percent ?? "-"}%`) })),
        temperatures: d.short_term.temperatures,
        weekly: d.weekly?.areas.map((a) => ({ name: a.name, days: a.days.map((x) => `${x.date} ${x.weather_en} ${x.precipitation_chance_percent ?? "-"}% ${x.reliability ?? ""}`.trim()) })),
      };
    case "jma_get_warnings":
      return { office: d.office, latest_report_datetime: d.latest_report_datetime, in_effect: d.in_effect, headlines: d.headlines, note: body.note };
    case "jma_list_earthquakes":
      return d.earthquakes.map((e) => ({ origin_time: e.origin_time, epicenter: e.epicenter, magnitude: e.magnitude, max_intensity: e.max_intensity, detail_id: e.detail_id }));
    case "jma_get_earthquake":
      return {
        title: d.title,
        origin_time: d.origin_time,
        epicenter: d.epicenter,
        magnitude: d.magnitude,
        max_intensity: d.max_intensity,
        tsunami_comment: d.tsunami_comment,
        intensity_by_prefecture: d.intensity_by_prefecture.slice(0, 2).map((p) => ({ name: p.name, max_intensity: p.max_intensity?.value, cities: p.areas.flatMap((a) => a.cities).slice(0, 3).map((c) => `${c.name} ${c.max_intensity?.ja}`) })),
      };
    case "jma_get_tsunami":
      return { any_warning_in_effect: d.any_warning_in_effect, any_in_effect: d.any_in_effect, bulletins: d.bulletins.map((b) => ({ title: b.title, report_datetime: b.report_datetime, valid_until: b.valid_until, in_effect: b.in_effect, highest_level: b.highest_level, earthquake: b.earthquake, areas: b.categories.reduce((n, c) => n + c.areas.length, 0) })), note: body.note };
    case "jma_get_volcano_warnings":
      return d.volcanoes.map((v) => ({ name: v.name, name_en: v.name_en, alert_level: v.alert_level, status: v.status, change: v.change, warning_in_effect: v.warning_in_effect, report_datetime: v.report_datetime }));
    default:
      return body;
  }
}
