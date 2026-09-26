export type ProvinceCount = { code: string; name: string; checklistCount: number };
export type DailySpecies = {
  scientificName: string;
  commonName: string;
  checklistCount: number;
  provinces: ProvinceCount[];
  checklistIds: string[];
};
export type DailySpeciesSummary = {
  date: string;
  sourceFile: string;
  sourceSize: number;
  importedAt: string;
  totalChecklists: number;
  species: DailySpecies[];
};

const REQUIRED_COLUMNS = [
  "OBSERVATION DATE", "COUNTRY CODE", "CATEGORY", "COMMON NAME", "SCIENTIFIC NAME",
  "STATE CODE", "STATE", "SAMPLING EVENT IDENTIFIER", "APPROVED",
];

type MutableSpecies = {
  scientificName: string;
  commonName: string;
  checklists: Set<string>;
  provinces: Map<string, { name: string; count: number }>;
  examples: string[];
};

export class DailySpeciesAccumulator {
  private readonly column: Record<string, number>;
  private readonly date: string;
  private readonly allChecklists = new Set<string>();
  private readonly birds = new Map<string, MutableSpecies>();

  constructor(date: string, header: string[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error("观测日期无效");
    this.date = date;
    this.column = Object.fromEntries(header.map((name, index) => [name.replace(/^\uFEFF/, "").trim().toUpperCase(), index]));
    const missing = REQUIRED_COLUMNS.filter((name) => this.column[name] === undefined);
    if (missing.length) throw new Error(`EBD 文件缺少必需列：${missing.join("、")}`);
  }

  addRows(rows: string[][]): void {
    const value = (row: string[], name: string) => row[this.column[name]]?.trim() ?? "";
    for (const row of rows) {
      if (value(row, "OBSERVATION DATE") !== this.date || value(row, "COUNTRY CODE") !== "CN") continue;
      if (value(row, "CATEGORY").toLowerCase() !== "species") continue;
      if (!/^(1|true)$/i.test(value(row, "APPROVED"))) continue;
      const scientificName = value(row, "SCIENTIFIC NAME");
      const commonName = value(row, "COMMON NAME");
      const checklistId = value(row, "SAMPLING EVENT IDENTIFIER");
      if (!scientificName || !commonName || !/^S\d+$/.test(checklistId)) continue;

      let bird = this.birds.get(scientificName);
      if (!bird) {
        bird = { scientificName, commonName, checklists: new Set(), provinces: new Map(), examples: [] };
        this.birds.set(scientificName, bird);
      }
      if (bird.checklists.has(checklistId)) continue;
      bird.checklists.add(checklistId);
      this.allChecklists.add(checklistId);
      if (bird.examples.length < 4) bird.examples.push(checklistId);

      const provinceCode = value(row, "STATE CODE");
      const provinceName = value(row, "STATE") || provinceCode || "地区未标注";
      const province = bird.provinces.get(provinceCode);
      if (province) province.count += 1;
      else bird.provinces.set(provinceCode, { name: provinceName, count: 1 });
    }
  }

  finish(sourceFile: string, sourceSize: number): DailySpeciesSummary {
    const species = [...this.birds.values()].map((bird): DailySpecies => ({
      scientificName: bird.scientificName,
      commonName: bird.commonName,
      checklistCount: bird.checklists.size,
      provinces: [...bird.provinces].map(([code, item]) => ({ code, name: item.name, checklistCount: item.count }))
        .sort((a, b) => b.checklistCount - a.checklistCount || a.code.localeCompare(b.code)),
      checklistIds: bird.examples,
    })).sort((a, b) => b.checklistCount - a.checklistCount || a.scientificName.localeCompare(b.scientificName));
    return {
      date: this.date,
      sourceFile,
      sourceSize,
      importedAt: new Date().toISOString(),
      totalChecklists: this.allChecklists.size,
      species,
    };
  }
}
