import { useEffect, useRef, useState } from "react";
import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy, Language } from "../data/content.js";
import { stampAssetPath } from "../data/stamps.js";
import { Card } from "./ui/Card.js";
import { Chip } from "./ui/Chip.js";
import styles from "./SpotMap.module.css";

type GoogleMapsApi = {
  Map: new (element: Element, options: { center: { lat: number; lng: number }; zoom: number }) => unknown;
  Marker: new (options: { icon?: unknown; label?: { color: string; fontWeight: string; text: string }; map: unknown; position: { lat: number; lng: number }; title: string }) => unknown;
  Size: new (width: number, height: number) => unknown;
  SymbolPath: { CIRCLE: unknown };
};

declare global { interface Window { google?: { maps?: GoogleMapsApi } } }

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const present = window.google?.maps;
  if (present) return Promise.resolve(present);
  const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
  if (existing) return new Promise((resolve, reject) => { existing.addEventListener("load", () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps was unavailable")), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Maps could not be loaded")), { once: true }); });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps was unavailable"));
    script.onerror = () => reject(new Error("Google Maps could not be loaded"));
    document.head.append(script);
  });
}

type Props = { copy: Copy; language: Language; spots: Spot[]; stampedSpotIds: ReadonlySet<string> };

function token(name: string): string { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function SpotMap({ copy, language, spots, stampedSpotIds }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapUnavailable, setMapUnavailable] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapElement.current || spots.length === 0) return undefined;
    let cancelled = false;
    void loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !mapElement.current) return;
      const firstSpot = spots[0];
      if (!firstSpot) return;
      const map = new maps.Map(mapElement.current, { center: { lat: firstSpot.lat, lng: firstSpot.lng }, zoom: 16 });
      spots.forEach((spot, index) => {
        const stamped = stampedSpotIds.has(spot.id);
        const icon = stamped
          ? { scaledSize: new maps.Size(44, 44), url: stampAssetPath(spot.id) }
          : { fillColor: token("--color-purple"), fillOpacity: 1, path: maps.SymbolPath.CIRCLE, scale: 18, strokeColor: token("--color-ink"), strokeWeight: 3 };
        new maps.Marker({ icon, label: stamped ? undefined : { color: token("--color-surface"), fontWeight: "900", text: String(index + 1) }, map, position: { lat: spot.lat, lng: spot.lng }, title: language === "ja" ? spot.name_ja : spot.name_en });
      });
      setMapUnavailable(false);
    }).catch(() => setMapUnavailable(true));
    return () => { cancelled = true; };
  }, [language, spots, stampedSpotIds]);
  return (
    <section className={styles.page}>
      <header><h1>{copy.mapTitle}</h1><p>{copy.mapHint}</p></header>
      {!mapUnavailable && <Card className={styles.mapCard}><div ref={mapElement} aria-label={copy.mapTitle} className={styles.map} /></Card>}
      {mapUnavailable && <Card className={styles.fallback} tone="band"><p>{copy.mapUnavailable}</p></Card>}
      <ol aria-label={copy.spots} className={styles.list}>{spots.map((spot, index) => {
        const stamped = stampedSpotIds.has(spot.id);
        const name = language === "ja" ? spot.name_ja : spot.name_en;
        const description = language === "ja" ? spot.description_ja : spot.description_en;
        const note = language === "ja" ? spot.location_note_ja : spot.location_note_en;
        return <li key={spot.id}><Card as="article" className={styles.spot}><span className={styles.number}>{index + 1}</span><div><div className={styles.spotHeader}><h2>{name}</h2>{stamped && <Chip>{copy.stamped}</Chip>}</div><p>{description}</p>{note && <small>{note}</small>}</div></Card></li>;
      })}</ol>
    </section>
  );
}
