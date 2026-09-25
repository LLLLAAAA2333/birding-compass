import { describe, expect, it } from "vitest";
import { buildRecentUrl, groupByLocation, normalizeObservations } from "./ebird";

const raw = [
  {
    speciesCode: "eurbla",
    comName: "乌鸫",
    sciName: "Turdus merula",
    locId: "L123",
    locName: "天鹅湖",
    obsDt: "2026-09-24 07:30",
    howMany: 2,
    lat: 31.816,
    lng: 117.226,
    subId: "S100",
  },
  {
    speciesCode: "litgre1",
    comName: "小白鹭",
    sciName: "Egretta garzetta",
    locId: "L123",
    locName: "天鹅湖",
    obsDt: "2026-09-23 09:10",
    lat: 31.816,
    lng: 117.226,
  },
];

describe("eBird recent observations", () => {
  it("builds a bounded nearby query with simplified Chinese names", () => {
    const url = new URL(buildRecentUrl(31.82, 117.23, 7, 25));
    expect(url.origin + url.pathname).toBe("https://api.ebird.org/v2/data/obs/geo/recent");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "31.82",
      lng: "117.23",
      back: "7",
      dist: "25",
      sppLocale: "zh_SIM",
    });
    expect(() => buildRecentUrl(31.82, 117.23, 31, 25)).toThrow();
    expect(() => buildRecentUrl(31.82, 117.23, 7, 51)).toThrow();
  });

  it("normalizes usable records and discards malformed coordinates", () => {
    const observations = normalizeObservations([...raw, { ...raw[0], lat: 120 }]);
    expect(observations).toHaveLength(2);
    expect(observations[0].checklistUrl).toBe("https://ebird.org/checklist/S100");
    expect(observations[1].checklistUrl).toBeNull();
  });

  it("groups species at one place and sorts places by newest record", () => {
    const observations = normalizeObservations([
      ...raw,
      { ...raw[0], locId: "L456", locName: "巢湖岸边", obsDt: "2026-09-25 08:00" },
    ]);
    const places = groupByLocation(observations);
    expect(places).toHaveLength(2);
    expect(places[0].name).toBe("巢湖岸边");
    expect(places[1].observations.map((item) => item.commonName)).toEqual(["乌鸫", "小白鹭"]);
  });
});
