import { describe, expect, it } from "vitest";
import { DailySpeciesAccumulator } from "./dailySpecies";

const header = [
  "OBSERVATION DATE", "COUNTRY CODE", "CATEGORY", "COMMON NAME", "SCIENTIFIC NAME",
  "STATE CODE", "STATE", "SAMPLING EVENT IDENTIFIER", "APPROVED",
];

function row(date: string, bird: string, scientific: string, province: string, name: string, checklist: string, approved = "1") {
  return [date, "CN", "species", bird, scientific, province, name, checklist, approved];
}

describe("daily species checklist counts", () => {
  it("counts each checklist once per species and groups by province", () => {
    const counter = new DailySpeciesAccumulator("2026-09-25", header);
    counter.addRows([
      row("2026-09-25", "Little Egret", "Egretta garzetta", "CN-34", "Anhui", "S101"),
      row("2026-09-25", "Little Egret", "Egretta garzetta", "CN-34", "Anhui", "S101"),
      row("2026-09-25", "Little Egret", "Egretta garzetta", "CN-32", "Jiangsu", "S102"),
      row("2026-09-25", "Black-crowned Night Heron", "Nycticorax nycticorax", "CN-32", "Jiangsu", "S102"),
      row("2026-09-24", "Little Egret", "Egretta garzetta", "CN-32", "Jiangsu", "S103"),
      ["2026-09-25", "US", "species", "Little Egret", "Egretta garzetta", "US-NY", "New York", "S104", "1"],
      ["2026-09-25", "CN", "subspecies", "Little Egret", "Egretta garzetta", "CN-32", "Jiangsu", "S105", "1"],
      row("2026-09-25", "Little Egret", "Egretta garzetta", "CN-32", "Jiangsu", "S106", "0"),
    ]);

    const result = counter.finish("ebd_CN.txt", 123456);
    expect(result.totalChecklists).toBe(2);
    expect(result.species.map((bird) => [bird.scientificName, bird.checklistCount])).toEqual([
      ["Egretta garzetta", 2], ["Nycticorax nycticorax", 1],
    ]);
    expect(result.species[0].provinces).toEqual([
      { code: "CN-32", name: "Jiangsu", checklistCount: 1 },
      { code: "CN-34", name: "Anhui", checklistCount: 1 },
    ]);
    expect(result.species[0].checklistIds).toEqual(["S101", "S102"]);
  });

  it("rejects a file without fields required for an auditable count", () => {
    expect(() => new DailySpeciesAccumulator("2026-09-25", ["COMMON NAME", "OBSERVATION DATE"]))
      .toThrow("缺少必需列");
  });
});
