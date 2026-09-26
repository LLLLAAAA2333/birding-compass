import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Area } from "../lib/data";
import styles from "./BirdMap.module.css";

type Props = {
  area: Area | null;
  radiusKm: number;
  points: { id: string; name: string; latitude: number; longitude: number; count: number | null; description?: string; source?: "ebird" | "birdreport" }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function BirdMap({ area, radiusKm, points, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const rangeRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, minZoom: 3, maxZoom: 17 })
      .setView(area ? [area.latitude, area.longitude] : [35, 104], area ? 9 : 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      rangeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    rangeRef.current?.remove();
    if (!area) {
      map.flyTo([35, 104], 4, { duration: 0.4, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
      return;
    }
    rangeRef.current = L.circle([area.latitude, area.longitude], {
      radius: radiusKm * 1000,
      color: "#637e6d",
      weight: 1,
      opacity: 0.55,
      fillColor: "#739073",
      fillOpacity: 0.045,
      interactive: false,
    }).addTo(map);
    map.flyTo([area.latitude, area.longitude], radiusKm <= 10 ? 11 : radiusKm <= 25 ? 10 : 9, { duration: 0.4, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [area, radiusKm]);

  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const point of points) {
      const selected = point.id === selectedId;
      const tooltip = document.createElement("span");
      tooltip.textContent = `${point.name}${point.count !== null ? ` · 近期 ${point.count} 种` : ""}${point.description ? ` · ${point.description}` : ""}`;
      L.circleMarker([point.latitude, point.longitude], {
        radius: selected ? 11 : point.source === "birdreport" ? 9 : 7,
        color: selected ? "#fff9e8" : "#fffef8",
        weight: selected ? 3 : 2,
        fillColor: point.source === "birdreport" ? "#9d5335" : point.source === "ebird" ? "#2f6755" : selected ? "#b95d38" : "#2f6755",
        fillOpacity: 1,
      })
        .bindTooltip(tooltip, { direction: "top", offset: [0, -6] })
        .on("click", () => onSelect(point.id))
        .addTo(layer);
    }
  }, [points, selectedId, onSelect]);

  useEffect(() => {
    const point = points.find((item) => item.id === selectedId);
    if (point) mapRef.current?.panTo([point.latitude, point.longitude], { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, duration: 0.3 });
  }, [points, selectedId]);

  return <div className={styles.map} ref={containerRef} aria-label={`${area?.name ?? "全国近期"}观鸟地点地图`} role="application" />;
}
