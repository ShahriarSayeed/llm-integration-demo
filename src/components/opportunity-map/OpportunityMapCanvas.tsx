/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import type { OpportunityMarker, MapFilters } from "./types";
import { MARKER_COLORS } from "./types";

interface Props {
  markers: OpportunityMarker[];
  filters: MapFilters;
  apiKey: string;
  onMarkerClick: (marker: OpportunityMarker) => void;
  selectedCustomerId?: string | null;
  dropPinMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
}

const geocodeCache = new Map<string, google.maps.LatLngLiteral>();

function createDotSvg(color: string, size: number): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>`
  )}`;
}

export function OpportunityMapCanvas({ markers, filters, apiKey, onMarkerClick, selectedCustomerId, dropPinMode, onMapClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const gMarkersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;

    const init = () => {
      if (!mapRef.current) return;
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 36.1699, lng: -115.1398 },
        zoom: 11,
        mapTypeId: google.maps.MapTypeId.HYBRID,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: [
            google.maps.MapTypeId.ROADMAP,
            google.maps.MapTypeId.SATELLITE,
            google.maps.MapTypeId.HYBRID,
          ],
        },
      });
      mapInstanceRef.current = map;
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onMapClick?.(e.latLng.lat(), e.latLng.lng());
        }
      });
      setMapReady(true);
    };

    if (window.google?.maps) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) return;

    const map = mapInstanceRef.current;

    gMarkersRef.current.forEach((m) => m.setMap(null));
    gMarkersRef.current = [];
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();

    const bounds = new google.maps.LatLngBounds();
    let hasMarkers = false;

    const placeAllMarkers = async () => {
      for (const marker of markers) {
        let position: google.maps.LatLngLiteral | undefined;

        if (marker.lat && marker.lng) {
          position = { lat: marker.lat, lng: marker.lng };
        } else if (marker.address) {
          const cached = geocodeCache.get(marker.address);
          if (cached) {
            position = cached;
          } else {
            try {
              const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
                geocoderRef.current!.geocode({ address: marker.address }, (results, status) => {
                  if (status === "OK" && results?.length) resolve(results);
                  else reject(new Error(`Geocode failed: ${status}`));
                });
              });
              position = { lat: result[0].geometry.location.lat(), lng: result[0].geometry.location.lng() };
              geocodeCache.set(marker.address, position);
            } catch {
              continue;
            }
          }
        }

        if (!position) continue;

        const color = MARKER_COLORS[marker.type];
        const size = 20;

        const gMarker = new google.maps.Marker({
          map,
          position,
          title: marker.name,
          icon: {
            url: createDotSvg(color, size),
            scaledSize: new google.maps.Size(size, size),
            anchor: new google.maps.Point(size / 2, size / 2),
          },
          zIndex: marker.type === "customer" ? 10 : 5,
        });

        gMarker.addListener("click", () => onMarkerClick(marker));
        gMarkersRef.current.push(gMarker);
        bounds.extend(position);
        hasMarkers = true;

        if (marker.type === "customer" && filters.radiusMiles && marker.id === selectedCustomerId) {
          const radiusMeters = filters.radiusMiles * 1609.34;
          const circle = new google.maps.Circle({
            map,
            center: position,
            radius: radiusMeters,
            fillColor: color,
            fillOpacity: 0.04,
            strokeColor: color,
            strokeOpacity: 0.7,
            strokeWeight: 2,
          });
          circlesRef.current.push(circle);
        }
      }

      if (hasMarkers) {
        map.fitBounds(bounds);
        const listener = google.maps.event.addListener(map, "idle", () => {
          if ((map.getZoom() ?? 20) > 15) map.setZoom(15);
          google.maps.event.removeListener(listener);
        });
      }
    };

    void placeAllMarkers();
  }, [mapReady, markers, filters.radiusMiles, selectedCustomerId, onMarkerClick]);

  return <div ref={mapRef} className="w-full! h-full! min-h-screen!" style={{ cursor: dropPinMode ? "crosshair" : undefined }} />;
}
