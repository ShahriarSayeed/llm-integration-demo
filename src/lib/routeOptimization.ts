/// <reference types="google.maps" />

import type { SupabaseClient } from "@supabase/supabase-js";

export type LatLng = { lat: number; lng: number };

/** Minimal stop shape for optimization (geocoding + persistence) */
export type OptimizableStop = {
  stopKey: string;
  customerId: string;
  propertyId: string | null;
  /** Full single-line address for Google Geocoder */
  fullAddress: string;
};

const geocodeCache = new Map<string, LatLng>();

let mapsLoadPromise: Promise<void> | null = null;

/** Ensures `window.google.maps` is available (loads script once). */
export function ensureGoogleMapsLoaded(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      if (window.google?.maps) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed")));
      return;
    }

    const script = document.createElement("script");
    // Keep libraries in sync with GoogleMapView / PoolVolumeCalculator (drawing, geocoding, places).
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing,geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cached = geocodeCache.get(trimmed);
  if (cached) return cached;

  if (!window.google?.maps) throw new Error("Google Maps is not loaded");

  const geocoder = new google.maps.Geocoder();
  const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
    geocoder.geocode({ address: trimmed }, (res, status) => {
      if (status === "OK" && res && res.length > 0) resolve(res);
      else reject(new Error(`Geocode failed: ${status}`));
    });
  });

  const pos: LatLng = {
    lat: results[0].geometry.location.lat(),
    lng: results[0].geometry.location.lng(),
  };
  geocodeCache.set(trimmed, pos);
  return pos;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/** Open-path TSP heuristic: nearest neighbor from virtual start (home or centroid). */
export function nearestNeighborOrder(
  start: LatLng | null,
  points: { stopKey: string; latLng: LatLng }[]
): string[] {
  if (points.length === 0) return [];
  const unvisited = [...points];
  const out: string[] = [];
  let current: LatLng = start ?? centroid(unvisited.map((u) => u.latLng));

  while (unvisited.length > 0) {
    let bestI = 0;
    let bestD = Infinity;
    unvisited.forEach((u, i) => {
      const d = haversineKm(current, u.latLng);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    const next = unvisited.splice(bestI, 1)[0];
    out.push(next.stopKey);
    current = next.latLng;
  }
  return out;
}

function pathLengthHaversine(order: string[], pos: Map<string, LatLng>): number {
  if (order.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const a = pos.get(order[i]);
    const b = pos.get(order[i + 1]);
    if (a && b) sum += haversineKm(a, b);
  }
  return sum;
}

/** Reverse segment (i+1 … k) inclusive — classic 2-opt for open path. */
function twoOptSwap(order: string[], i: number, k: number): string[] {
  const next = [...order];
  const rev = next.slice(i + 1, k + 1).reverse();
  return [...next.slice(0, i + 1), ...rev, ...next.slice(k + 1)];
}

export function twoOptImprove(order: string[], pos: Map<string, LatLng>): string[] {
  if (order.length < 4) return order;
  let best = [...order];
  let bestLen = pathLengthHaversine(best, pos);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 2; i++) {
      for (let k = i + 2; k < best.length; k++) {
        const trial = twoOptSwap(best, i, k);
        const len = pathLengthHaversine(trial, pos);
        if (len + 1e-9 < bestLen) {
          best = trial;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

async function persistTechStopOrder(
  supabase: SupabaseClient,
  routeDate: string,
  techId: string,
  ordered: OptimizableStop[]
): Promise<void> {
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    let q = supabase
      .from("route_stops")
      .select("id")
      .eq("customer_id", s.customerId)
      .eq("route_date", routeDate)
      .eq("tech_id", techId);
    if (s.propertyId) q = q.eq("property_id", s.propertyId);
    else q = q.is("property_id", null);
    const { data: existing, error: selErr } = await q.maybeSingle();
    if (selErr) throw selErr;
    if (existing) {
      const { error } = await supabase.from("route_stops").update({ stop_order: i }).eq("id", existing.id);
      if (error) throw error;
    } else {
      const row: Record<string, unknown> = {
        customer_id: s.customerId,
        tech_id: techId,
        route_date: routeDate,
        stop_order: i,
        status: "pending",
      };
      if (s.propertyId) row.property_id = s.propertyId;
      const { error } = await supabase.from("route_stops").insert(row);
      if (error) throw error;
    }
  }
}

export type RouteReorderResult = {
  techsOptimized: number;
  stopsTotal: number;
  failedStops: { techId: string; stopKey: string; reason: string }[];
};

/**
 * Reorders stops per technician using geocoding + nearest-neighbor + 2-opt, then persists `stop_order`.
 */
export async function runRouteReorderOptimization(input: {
  supabase: SupabaseClient;
  mapsApiKey: string;
  routeDate: string;
  technicians: { id: string; home_address?: string | null }[];
  /** Stops grouped by tech (only stops with a geocodable address should be included) */
  techStops: Record<string, OptimizableStop[]>;
  includedTechIds: Set<string>;
  /** Per-run home override (takes precedence over DB) */
  homeOverrides: Record<string, string>;
  startFromHome: boolean;
}): Promise<RouteReorderResult> {
  await ensureGoogleMapsLoaded(input.mapsApiKey);

  const failedStops: { techId: string; stopKey: string; reason: string }[] = [];
  let techsOptimized = 0;
  let stopsTotal = 0;

  for (const techId of input.includedTechIds) {
    const stops = input.techStops[techId] ?? [];
    if (stops.length === 0) continue;

    const tech = input.technicians.find((t) => t.id === techId);
    const homeRaw =
      (input.homeOverrides[techId] ?? "").trim() ||
      (tech?.home_address as string | undefined)?.trim() ||
      "";

    let start: LatLng | null = null;
    if (input.startFromHome && homeRaw) {
      try {
        start = await geocodeAddress(homeRaw);
      } catch {
        start = null;
      }
    }

    const withPos: { stopKey: string; latLng: LatLng; stop: OptimizableStop }[] = [];
    for (const s of stops) {
      try {
        const pos = await geocodeAddress(s.fullAddress);
        if (!pos) {
          failedStops.push({ techId, stopKey: s.stopKey, reason: "Empty geocode" });
          continue;
        }
        withPos.push({ stopKey: s.stopKey, latLng: pos, stop: s });
      } catch (e) {
        failedStops.push({
          techId,
          stopKey: s.stopKey,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (withPos.length === 0) continue;

    const points = withPos.map((p) => ({ stopKey: p.stopKey, latLng: p.latLng }));
    let order = nearestNeighborOrder(start, points);
    const posMap = new Map<string, LatLng>();
    withPos.forEach((p) => posMap.set(p.stopKey, p.latLng));
    order = twoOptImprove(order, posMap);

    const byKey = new Map(withPos.map((p) => [p.stopKey, p.stop]));
    const orderedStops: OptimizableStop[] = order.map((k) => byKey.get(k)!).filter(Boolean);

    await persistTechStopOrder(input.supabase, input.routeDate, techId, orderedStops);
    techsOptimized += 1;
    stopsTotal += orderedStops.length;
  }

  return { techsOptimized, stopsTotal, failedStops };
}
