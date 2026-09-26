export type Observation = {
  speciesCode: string;
  commonName: string;
  scientificName: string;
  locationId: string;
  locationName: string;
  observedAt: string;
  count: number | null;
  latitude: number;
  longitude: number;
  checklistUrl: string | null;
  isHotspot: boolean;
};

export type BirdPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  latestAt: string;
  observations: Observation[];
};

const API_URL = "https://api.ebird.org/v2/data/obs/geo/recent";

export function buildRecentUrl(latitude: number, longitude: number, days: number, radiusKm: number): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("纬度无效");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("经度无效");
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("查询天数须为 1–30 天");
  if (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > 50) throw new Error("查询半径须为 1–50 公里");

  const url = new URL(API_URL);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lng", String(longitude));
  url.searchParams.set("back", String(days));
  url.searchParams.set("dist", String(radiusKm));
  url.searchParams.set("sppLocale", "zh_SIM");
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeObservations(payload: unknown): Observation[] {
  if (!Array.isArray(payload)) throw new Error("eBird 返回的数据格式无法识别");

  const observations: Observation[] = [];
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    const speciesCode = requiredString(entry.speciesCode);
    const commonName = requiredString(entry.comName);
    const scientificName = requiredString(entry.sciName);
    const locationName = requiredString(entry.locName);
    const observedAt = requiredString(entry.obsDt);
    const latitude = entry.lat;
    const longitude = entry.lng;
    if (!speciesCode || !commonName || !scientificName || !locationName || !observedAt) continue;
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) continue;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue;
    const locationId = requiredString(entry.locId) ?? `${latitude.toFixed(4)},${longitude.toFixed(4)}:${locationName}`;
    const submissionId = requiredString(entry.subId);
    observations.push({
      speciesCode,
      commonName,
      scientificName,
      locationId,
      locationName,
      observedAt,
      count: typeof entry.howMany === "number" && Number.isFinite(entry.howMany) ? entry.howMany : null,
      latitude,
      longitude,
      isHotspot: entry.locationPrivate === false,
      checklistUrl: submissionId && /^S\d+$/.test(submissionId) ? `https://ebird.org/checklist/${submissionId}` : null,
    });
  }
  return observations.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

export function groupByLocation(observations: Observation[]): BirdPlace[] {
  const groups = new Map<string, BirdPlace>();
  for (const observation of observations) {
    let place = groups.get(observation.locationId);
    if (!place) {
      place = {
        id: observation.locationId,
        name: observation.locationName,
        latitude: observation.latitude,
        longitude: observation.longitude,
        latestAt: observation.observedAt,
        observations: [],
      };
      groups.set(observation.locationId, place);
    }
    place.observations.push(observation);
    if (observation.observedAt > place.latestAt) place.latestAt = observation.observedAt;
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
