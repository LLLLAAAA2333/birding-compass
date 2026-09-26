import { expect, it } from "vitest";
import { mergeTaxonomy, searchSpecies } from "./taxonomy";
it("merges Chinese and English taxonomy by code and searches all three names", () => {
  const english = [
    {
      speciesCode: "litgre1",
      comName: "Little Egret",
      sciName: "Egretta garzetta",
      category: "species",
    },
  ];
  const chinese = [{ ...english[0], comName: "小白鹭" }];
  const catalog = mergeTaxonomy(chinese, english);
  for (const query of ["白鹭", "little egret", "egretta"])
    expect(searchSpecies(catalog, query)[0].speciesCode).toBe("litgre1");
  expect(mergeTaxonomy([], english)[0].commonName).toBe("Little Egret");
});
