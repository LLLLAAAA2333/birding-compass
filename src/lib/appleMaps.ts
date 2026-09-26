export function appleMapsUrl(name: string, latitude: number, longitude: number): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("ll", `${latitude},${longitude}`);
  url.searchParams.set("q", name);
  return url.toString();
}
