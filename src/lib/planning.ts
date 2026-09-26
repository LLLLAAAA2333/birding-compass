import type { Observation } from './ebird';
export type BirdSource = 'ebird' | 'birdreport';
export type PlanningRecord = {
  id: string;
  source: BirdSource;
  sourceRecordId: string;
  reportId: string;
  sourceTaxonId: string;
  commonName: string;
  scientificName: string;
  englishName: string;
  observedAt: string;
  locationName: string;
  position: { latitude: number; longitude: number } | null;
  coordinateNote: string;
  count: number | null;
  quality: 'accepted' | 'unflagged' | 'flagged' | 'unknown';
  originalUrl: string;
  fetchedAt: string;
};
export const SOURCE_LABELS: Record<BirdSource, string> = { ebird: 'eBird', birdreport: '中国观鸟记录中心' };
export function fromEbird(observations: Observation[], fetchedAt: string): PlanningRecord[] {
  return observations.map(row => {
    const reportId = row.checklistUrl?.match(/\/checklist\/(S\d+)$/)?.[1] ?? `${row.locationId}:${row.observedAt}`;
    const sourceRecordId = `${reportId}:${row.speciesCode}`;
    return { id: `ebird:${sourceRecordId}`, source: 'ebird', sourceRecordId, reportId, sourceTaxonId: row.speciesCode, commonName: row.commonName, scientificName: row.scientificName, englishName: '', observedAt: row.observedAt, locationName: row.locationName, position: { latitude: row.latitude, longitude: row.longitude }, coordinateNote: 'WGS84', count: row.count, quality: 'accepted', originalUrl: row.checklistUrl ?? '', fetchedAt };
  });
}
export function planningPlaces(records: PlanningRecord[]) {
  const places = new Map<string, { id: string; source: BirdSource; name: string; position: PlanningRecord['position']; records: PlanningRecord[] }>();
  for (const row of records) {
    const id = `${row.source}:${row.locationName}:${row.position ? `${row.position.latitude.toFixed(5)},${row.position.longitude.toFixed(5)}` : row.reportId}`;
    const place = places.get(id) ?? { id, source: row.source, name: row.locationName, position: row.position, records: [] };
    place.records.push(row);
    places.set(id, place);
  }
  return [...places.values()];
}
export function mergePlanningRecords(...sets: PlanningRecord[][]): PlanningRecord[] {
  const byId = new Map<string, PlanningRecord>();
  for (const row of sets.flat()) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id));
}
export function filterPlanningRecords(records: PlanningRecord[], options: { text: string; source: BirdSource | 'all'; includeFlagged: boolean }): PlanningRecord[] {
  const text = options.text.trim().toLocaleLowerCase();
  return records.filter(row => (options.source === 'all' || row.source === options.source) && (options.includeFlagged || row.quality !== 'flagged') && (!text || [row.commonName, row.scientificName, row.englishName, row.locationName].some(name => name.toLocaleLowerCase().includes(text))));
}
