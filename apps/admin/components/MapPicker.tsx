"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import { formatPickedCoordinate, type MapPoint } from "@/lib/coordinates";

/** Zoom used when the map opens on a known point: close enough to see a lot's driveways. */
const POINT_ZOOM = 18;
/** No point known at all: show the world rather than invent a location. */
const WORLD_VIEW = { center: { lat: 0, lng: 0 }, zoom: 2 };

/**
 * Basemaps. Satellite first, because parking areas are visible on imagery and
 * usually are not drawn on street maps. Both are free tile services that need
 * no API key; both require their attribution to stay visible.
 */
const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};
const STREETS = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export interface MapPickerProps {
  /** Container id; also the test id. */
  id: string;
  /** Accessible name of the map region. */
  label: string;
  /** Id of the help text that explains how to use the map. */
  describedBy?: string;
  /** The pin, from the typed coordinate fields; null shows no pin. */
  value: MapPoint | null;
  /** Where to open when there is no pin yet (another zone's pin). */
  fallbackCenter: MapPoint | null;
  /** The operator placed or dragged the pin. Values are rounded strings, ready for the fields. */
  onPick: (lat: string, lng: string) => void;
}

/**
 * Click-to-place pin for a zone's Directions target. It only edits the same
 * latitude/longitude the form already sends: the typed fields stay the source
 * of truth (and the keyboard-accessible path), the map is a faster way to fill
 * them. Leaflet touches `window` when it loads, so it is imported inside the
 * effect, never during server rendering.
 */
export function MapPicker({ id, label, describedBy, value, fallbackCenter, onPick }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onPickRef = useRef(onPick);
  const valueRef = useRef(value);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
    valueRef.current = value;
  });

  // Create the map once. The initial view comes from the first render's props;
  // later pin changes are applied by the effect below without resetting the view.
  const initialCenter = useRef(value ?? fallbackCenter);
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        const L = (mod as { default?: typeof import("leaflet") }).default ?? mod;
        if (cancelled || !containerRef.current) return;
        leafletRef.current = L;
        const start = initialCenter.current;
        const map = L.map(containerRef.current, {
          center: start ?? WORLD_VIEW.center,
          zoom: start ? POINT_ZOOM : WORLD_VIEW.zoom,
          maxZoom: 21,
        });
        const satellite = L.tileLayer(SATELLITE.url, {
          attribution: SATELLITE.attribution,
          maxNativeZoom: 19,
          maxZoom: 21,
        });
        const streets = L.tileLayer(STREETS.url, {
          attribution: STREETS.attribution,
          maxNativeZoom: 19,
          maxZoom: 21,
        });
        for (const layer of [satellite, streets]) {
          layer.on("tileerror", () => setTilesFailed(true));
        }
        satellite.addTo(map);
        L.control.layers({ Satellite: satellite, Streets: streets }, undefined, { position: "topright" }).addTo(map);
        map.on("click", (event: LeafletMouseEvent) => {
          onPickRef.current(formatPickedCoordinate(event.latlng.lat), formatPickedCoordinate(event.latlng.lng));
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep the pin on the typed / picked point.
  const lat = value?.lat;
  const lng = value?.lng;
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (lat === undefined || lng === undefined) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const point = L.latLng(lat, lng);
    if (markerRef.current) {
      markerRef.current.setLatLng(point);
    } else {
      const marker = L.marker(point, {
        draggable: true,
        keyboard: false,
        title: "Directions target",
        icon: L.divIcon({
          className: "map-pin-icon",
          html: '<span class="map-pin"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 34],
        }),
      });
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        onPickRef.current(formatPickedCoordinate(next.lat), formatPickedCoordinate(next.lng));
      });
      marker.addTo(map);
      markerRef.current = marker;
    }
    // A coordinate typed far away would leave the pin off-screen.
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [ready, lat, lng]);

  if (loadFailed) {
    return (
      <p role="status" className="rounded-control border border-line bg-raised px-4 py-3 text-sm text-muted">
        The map could not load. Type the latitude and longitude instead.
      </p>
    );
  }

  return (
    <div>
      {/* `isolate` keeps Leaflet's high z-index panes under the app shell's menus. */}
      <div
        ref={containerRef}
        id={id}
        data-testid={id}
        role="region"
        aria-label={label}
        aria-describedby={describedBy}
        className="isolate h-80 w-full overflow-hidden rounded-control border-[1.5px] border-control bg-raised"
      />
      {tilesFailed ? (
        <p role="status" className="field-help">
          Some map tiles could not load (no internet connection?). You can still type the coordinates.
        </p>
      ) : null}
    </div>
  );
}
