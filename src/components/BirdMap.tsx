import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BirdPlace } from "../lib/ebird";
import type { City } from "../lib/data";
import styles from "./BirdMap.module.css";

type Props = {
  city: City;
  radiusKm: number;
  places: BirdPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function BirdMap({ city, radiusKm, places, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const rangeRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, minZoom: 5, maxZoom: 17 })
      .setView([city.latitude, city.longitude], 11);
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
    rangeRef.current = L.circle([city.latitude, city.longitude], {
      radius: radiusKm * 1000,
      color: "#637e6d",
      weight: 1,
      opacity: 0.55,
      fillColor: "#739073",
      fillOpacity: 0.045,
      interactive: false,
    }).addTo(map);
    map.flyTo([city.latitude, city.longitude], radiusKm <= 10 ? 11 : radiusKm <= 25 ? 10 : 9, { duration: 0.55 });
  }, [city, radiusKm]);

  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const place of places) {
      const selected = place.id === selectedId;
      const tooltip = document.createElement("span");
      tooltip.textContent = `${place.name} · ${place.observations.length} 种`;
      L.circleMarker([place.latitude, place.longitude], {
        radius: selected ? 13 : Math.min(11, 6 + Math.sqrt(place.observations.length)),
        color: selected ? "#fff9e8" : "#fffef8",
        weight: selected ? 3 : 2,
        fillColor: selected ? "#b95d38" : "#2f6755",
        fillOpacity: 1,
      })
        .bindTooltip(tooltip, { direction: "top", offset: [0, -6] })
        .on("click", () => onSelect(place.id))
        .addTo(layer);
    }
  }, [places, selectedId, onSelect]);

  useEffect(() => {
    const place = places.find((item) => item.id === selectedId);
    if (place) mapRef.current?.panTo([place.latitude, place.longitude], { animate: true, duration: 0.4 });
  }, [places, selectedId]);

  return <div className={styles.map} ref={containerRef} aria-label={`${city.name}观鸟地点地图`} role="application" />;
}
