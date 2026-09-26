import { expect, it } from 'vitest';
import { filterPlanningRecords, mergePlanningRecords, fromEbird } from './planning';
import type { PlanningRecord } from './planning';
const record: PlanningRecord = { id: 'ebird:S1:litgre1', source: 'ebird', sourceRecordId: 'S1:litgre1', reportId: 'S1', sourceTaxonId: 'litgre1', commonName: '白鹭', scientificName: 'Egretta garzetta', englishName: 'Little Egret', observedAt: '2026-09-26', locationName: '湿地', position: { latitude: 31, longitude: 117 }, coordinateNote: 'WGS84', count: 2, quality: 'accepted', originalUrl: 'https://ebird.org/checklist/S1', fetchedAt: '2026-09-26T08:00:00Z' };
it('deduplicates by source identity without deleting observations shared across sources', () => {
  const other = { ...record, id: 'birdreport:1:1', source: 'birdreport' as const };
  expect(mergePlanningRecords([record], [record, other])).toHaveLength(2);
});
it('searches names and places across sources and does not invent coordinates', () => {
  const other = { ...record, id: 'birdreport:1:1', source: 'birdreport' as const, position: null, quality: 'flagged' as const };
  expect(filterPlanningRecords([record, other], { text: 'garzetta', source: 'all', includeFlagged: false })).toEqual([record]);
  expect(filterPlanningRecords([record, other], { text: '湿地', source: 'birdreport', includeFlagged: true })).toEqual([other]);
});
it('eBird provenance uses a namespaced identity and its original checklist', () => {
  const [row] = fromEbird([{speciesCode:'litgre1',commonName:'白鹭',scientificName:'Egretta garzetta',locationId:'L1',locationName:'湿地',observedAt:'2026-09-26',count:2,latitude:31,longitude:117,checklistUrl:'https://ebird.org/checklist/S1',isHotspot:true}], '2026-09-26T08:00:00Z');
  expect(row.id).toBe('ebird:S1:litgre1');
  expect(row.originalUrl).toBe(record.originalUrl);
});
