import { getEarthquakeDetail, listEarthquakes, summarizeEvents } from "../src/quake";
import { parseCoordinate } from "../src/text";
import { intensityRank } from "../src/codes";
import { fixture, serveFixtures } from "./helpers";
import type { RawQuakeListEntry } from "../src/types";

jest.mock("axios");

beforeEach(() => {
  serveFixtures();
});

describe("parseCoordinate", () => {
  it("reads latitude, longitude and depth in km", () => {
    expect(parseCoordinate("+37.4+141.5-60000/")).toEqual({ latitude: 37.4, longitude: 141.5, depth_km: 60 });
    expect(parseCoordinate("+35.7+140.7+0/")).toEqual({ latitude: 35.7, longitude: 140.7, depth_km: 0 });
  });

  it("handles missing depth and junk", () => {
    expect(parseCoordinate("+07.5-080.8/")).toEqual({ latitude: 7.5, longitude: -80.8, depth_km: null });
    expect(parseCoordinate("")).toEqual({ latitude: null, longitude: null, depth_km: null });
  });
});

describe("summarizeEvents", () => {
  it("merges the bulletins of one event and prefers the full intensity report", () => {
    const events = summarizeEvents(fixture<RawQuakeListEntry[]>("quake_data_list.json"));
    const e = events.find((x) => x.event_id === "20261027092519")!;
    expect(e).toMatchObject({
      origin_time: "2026-10-27T09:25:00+09:00",
      magnitude: 4.6,
      max_intensity: { value: "3", ja: "震度3", en: "3" },
      epicenter: { name: "福島県沖", name_en: "Off the Coast of Fukushima Prefecture", latitude: 37.4, longitude: 141.5, depth_km: 60 },
      detail_id: "20261027092912_20261027092519_VXSE5k_1.json",
    });
    expect(e.prefectures[0]).toEqual({ code: "04", name: "宮城県", name_en: "Miyagi", max_intensity: { value: "3", ja: "震度3", en: "3" } });
    // One summary per event.
    expect(new Set(events.map((x) => x.event_id)).size).toBe(events.length);
  });
});

describe("listEarthquakes", () => {
  it("returns the newest quakes first, 10 by default", async () => {
    const r = await listEarthquakes();
    expect(r.earthquakes).toHaveLength(10);
    const times = r.earthquakes.map((e) => e.origin_time!);
    expect([...times].sort().reverse()).toEqual(times);
    expect(r.list_covers_from).not.toBeNull();
  });

  it("filters by minimum intensity and magnitude", async () => {
    const r = await listEarthquakes({ min_intensity: "4", limit: 50 });
    expect(r.earthquakes.length).toBeGreaterThan(0);
    expect(r.earthquakes.every((e) => intensityRank(e.max_intensity?.value) >= intensityRank("4"))).toBe(true);
    expect(r.earthquakes.map((e) => e.event_id)).toContain("20261008041355");

    const big = await listEarthquakes({ min_magnitude: 6, limit: 50 });
    expect(big.earthquakes.every((e) => (e.magnitude ?? 0) >= 6)).toBe(true);
  });

  it("filters by time window", async () => {
    const r = await listEarthquakes({ since_hours: 2, now: new Date("2026-10-27T11:00:00+09:00"), limit: 50 });
    expect(r.earthquakes.map((e) => e.event_id)).toEqual(["20261027092519"]);
  });
});

describe("getEarthquakeDetail", () => {
  it("looks up an event id and returns intensities by prefecture, strongest first", async () => {
    const d = await getEarthquakeDetail({ event_id: "20261008041355" });
    expect(d).toMatchObject({
      event_id: "20261008041355",
      title: "震源・震度情報",
      origin_time: "2026-10-08T04:13:00+09:00",
      magnitude: 4.8,
      max_intensity: { value: "4" },
      epicenter: { name: "千葉県北東部", name_en: "Northeastern Chiba Prefecture", depth_km: 50 },
      tsunami_comment: { ja: "この地震による津波の心配はありません。", en: "This earthquake poses no tsunami risk." },
    });
    const chiba = d.intensity_by_prefecture[0];
    expect(chiba).toMatchObject({ code: "12", name: "千葉県", max_intensity: { value: "4" } });
    expect(chiba.areas[0].cities[0]).toMatchObject({ name: "旭市", max_intensity: { value: "4" } });
    expect(chiba.areas[0].cities[0].stations).toBeUndefined();
  });

  it("adds station readings on request", async () => {
    const d = await getEarthquakeDetail({ detail_id: "20261008041755_20261008041355_VXSE5k_1.json", include_stations: true });
    const station = d.intensity_by_prefecture[0].areas[0].cities[0].stations![0];
    expect(station).toEqual({
      name: "旭市南堀之内＊",
      name_en: "Asahi-shi Minami-horinouchi*",
      intensity: { value: "4", ja: "震度4", en: "4" },
      latitude: 35.77,
      longitude: 140.62,
    });
  });

  it("rejects ids that are not JMA file names", async () => {
    await expect(getEarthquakeDetail({ detail_id: "../../etc/passwd" })).rejects.toMatchObject({ payload: { code: "INVALID_INPUT" } });
    await expect(getEarthquakeDetail({})).rejects.toMatchObject({ payload: { code: "INVALID_INPUT" } });
  });

  it("explains when an event is not in the recent list", async () => {
    await expect(getEarthquakeDetail({ event_id: "19950117054652" })).rejects.toMatchObject({ payload: { code: "EVENT_NOT_FOUND" } });
  });
});
