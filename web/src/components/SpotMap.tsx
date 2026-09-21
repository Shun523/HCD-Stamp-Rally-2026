import { useEffect, useRef, useState } from "react";
import type { Spot } from "@hcd-stamp-rally/shared";
import type { Copy, Language } from "../data/content.js";

type GoogleMapsApi = {
  Map: new (element: Element, options: { center: { lat: number; lng: number }; zoom: number }) => unknown;
  Marker: new (options: { position: { lat: number; lng: number }; map: unknown; title: string }) => unknown;
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
  }
}

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const present = window.google?.maps;
  if (present) return Promise.resolve(present);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps was unavailable"));
    script.onerror = () => reject(new Error("Google Maps could not be loaded"));
    document.head.append(script);
  });
}

type Props = {
  spots: Spot[];
  stampedSpotIds: ReadonlySet<string>;
  language: Language;
  copy: Copy;
};

export function SpotMap({ spots, stampedSpotIds, language, copy }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapUnavailable, setMapUnavailable] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapElement.current || spots.length === 0) return undefined;
    let cancelled = false;
    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapElement.current) return;
        const firstSpot = spots[0];
        if (!firstSpot) return;
        const map = new maps.Map(mapElement.current, {
          center: { lat: firstSpot.lat, lng: firstSpot.lng },
          zoom: 16,
        });
        spots.forEach((spot) => {
          new maps.Marker({
            position: { lat: spot.lat, lng: spot.lng },
            map,
            title: language === "ja" ? spot.name_ja : spot.name_en,
          });
        });
        setMapUnavailable(false);
      })
      .catch(() => setMapUnavailable(true));
    return () => { cancelled = true; };
  }, [language, spots]);

  return (
    <>
      {!mapUnavailable && <div ref={mapElement} className="spot-map" aria-label={copy.map} />}
      {mapUnavailable && <p className="map-fallback">{copy.mapUnavailable}</p>}
      <ol className="spot-list" aria-label={copy.spots}>
        {spots.map((spot) => {
          const stamped = stampedSpotIds.has(spot.id);
          const name = language === "ja" ? spot.name_ja : spot.name_en;
          const description = language === "ja" ? spot.description_ja : spot.description_en;
          const note = language === "ja" ? spot.location_note_ja : spot.location_note_en;
          return (
            <li key={spot.id} className={stamped ? "spot stamped" : "spot"}>
              <span className="spot-state">{stamped ? copy.stamped : copy.notStamped}</span>
              <h3>{name}</h3>
              <p>{description}</p>
              {note && <p className="subtle">{note}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
