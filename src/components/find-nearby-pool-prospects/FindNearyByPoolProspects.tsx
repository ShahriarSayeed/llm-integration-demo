import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { ensureGoogleMapsLoaded, geocodeAddress } from "../../lib/routeOptimization";
import { OpportunityMapCanvas } from "../opportunity-map/OpportunityMapCanvas";
import { CustomerSearchDrawer } from "../opportunity-map/CustomerSearchDrawer";
import { MarkerDetailDrawer } from "../opportunity-map/MarkerDetailDrawer";
import type { OpportunityMarker, MapFilters } from "../opportunity-map/types";
import { MARKER_COLORS } from "../opportunity-map/types";
import { toast } from "sonner";
import {
  ChevronUp, ChevronDown, MapPin, RefreshCw, Trash2, Plus,
  Eye, EyeOff, FileText, Bot, MapPinned,
} from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

// ─── Demo data ────────────────────────────────────────────────────────────────

function buildDemoCustomerMarkers(): OpportunityMarker[] {
  const names = [
    "Martinez Residence", "Johnson Home", "Smith Pool", "Williams Estate", "Brown Family",
    "Davis Property", "Garcia Residence", "Rodriguez Home", "Wilson Pool", "Anderson Estate",
    "Thomas Residence", "Taylor Home", "Moore Property", "Jackson Pool", "Martin Estate",
    "Lee Residence", "Perez Home", "Thompson Pool", "White Property", "Harris Estate",
    "Sanchez Residence", "Clark Home", "Ramirez Pool", "Lewis Property", "Robinson Estate",
    "Walker Residence", "Young Home", "Allen Pool", "King Property", "Wright Estate",
    "Scott Residence", "Torres Home", "Nguyen Pool", "Hill Property", "Flores Estate",
    "Green Residence", "Adams Home", "Nelson Pool", "Baker Property", "Hall Estate",
    "Rivera Residence", "Campbell Home", "Mitchell Pool", "Carter Property", "Roberts Estate",
    "Gomez Residence", "Phillips Home", "Evans Pool", "Turner Property", "Diaz Estate",
    "Parker Residence", "Cruz Home", "Edwards Pool", "Collins Property", "Reyes Estate",
    "Stewart Residence", "Morris Home", "Morales Pool", "Murphy Property", "Cook Estate",
  ];
  const streets = [
    "Desert Inn Rd", "Tropicana Ave", "Sahara Ave", "Charleston Blvd", "Flamingo Rd",
    "Spring Mountain Rd", "Warm Springs Rd", "Lake Mead Blvd", "Cheyenne Ave", "Craig Rd",
    "Rainbow Blvd", "Jones Blvd", "Decatur Blvd", "Eastern Ave", "Pecos Rd",
  ];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const seed = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  return names.map((name, i) => ({
    id: `demo-cust-${i}`,
    type: "customer" as const,
    name,
    address: `${1000 + Math.floor(seed(i + 200) * 9000)} ${streets[i % streets.length]}, Las Vegas, NV`,
    lat: 36.05 + seed(i) * 0.22,
    lng: -115.35 + seed(i + 100) * 0.3,
    metadata: { serviceDay: days[i % 5], monthlyRevenue: 120 + Math.floor(seed(i + 300) * 180) },
  }));
}

const DEMO_CUSTOMER_MARKERS = buildDemoCustomerMarkers();

// 🔧 BUILD: Pool Builders layer — currently static demo data. Future: fetch live from
// Google Places API or a user-managed Supabase table of local pool construction companies.
const POOL_BUILDER_MARKERS: OpportunityMarker[] = [
  { id: "pb-1",  type: "poolbuilder", name: "Blue Haven Pools",          address: "3820 E Flamingo Rd, Las Vegas, NV 89121",     lat: 36.1052, lng: -115.0921, metadata: {} },
  { id: "pb-2",  type: "poolbuilder", name: "Shasta Pools Las Vegas",    address: "4120 N Rancho Dr, Las Vegas, NV 89130",       lat: 36.2641, lng: -115.2252, metadata: {} },
  { id: "pb-3",  type: "poolbuilder", name: "Premier Paradise Inc",      address: "7200 Cathedral Rock St, Las Vegas, NV 89149", lat: 36.2251, lng: -115.3441, metadata: {} },
  { id: "pb-4",  type: "poolbuilder", name: "Pebble Technology Intl",    address: "3600 S Hualapai Way, Las Vegas, NV 89147",    lat: 36.1021, lng: -115.2581, metadata: {} },
  { id: "pb-5",  type: "poolbuilder", name: "Vegas Pool Pros",           address: "8810 W Sahara Ave, Las Vegas, NV 89117",      lat: 36.1481, lng: -115.2812, metadata: {} },
  { id: "pb-6",  type: "poolbuilder", name: "Desert Oasis Pools",        address: "2455 W Warm Springs Rd, Henderson, NV 89014", lat: 36.0512, lng: -115.0941, metadata: {} },
  { id: "pb-7",  type: "poolbuilder", name: "Pinnacle Pool & Spa",       address: "1820 Antelope Ridge Ct, Henderson, NV 89012", lat: 36.0011, lng: -115.0981, metadata: {} },
  { id: "pb-8",  type: "poolbuilder", name: "Southwest Pools & Spas",    address: "5100 W Sunset Rd, Las Vegas, NV 89118",       lat: 36.0912, lng: -115.2131, metadata: {} },
  { id: "pb-9",  type: "poolbuilder", name: "Nevada Pool Craft",         address: "950 Seven Hills Dr, Henderson, NV 89052",     lat: 35.9821, lng: -115.1181, metadata: {} },
  { id: "pb-10", type: "poolbuilder", name: "Cox Pools Las Vegas",       address: "6200 W Charleston Blvd, Las Vegas, NV 89146", lat: 36.1481, lng: -115.2252, metadata: {} },
  { id: "pb-11", type: "poolbuilder", name: "Aquatic Pools NV",          address: "3200 S Valley View Blvd, Las Vegas, NV 89102",lat: 36.1281, lng: -115.1941, metadata: {} },
  { id: "pb-12", type: "poolbuilder", name: "Presidential Pools",        address: "4200 N Durango Dr, Las Vegas, NV 89129",      lat: 36.2421, lng: -115.2821, metadata: {} },
  { id: "pb-13", type: "poolbuilder", name: "Sun State Pools",           address: "7400 W Warm Springs Rd, Las Vegas, NV 89113", lat: 36.0712, lng: -115.2651, metadata: {} },
  { id: "pb-14", type: "poolbuilder", name: "Riverbend Pools",           address: "5800 S Pecos Rd, Las Vegas, NV 89120",        lat: 36.0821, lng: -115.0821, metadata: {} },
  { id: "pb-15", type: "poolbuilder", name: "Sterling Pools & Spas",     address: "2100 N Green Valley Pkwy, Henderson, NV 89014",lat: 36.0491, lng: -114.9721, metadata: {} },
  { id: "pb-16", type: "poolbuilder", name: "Artesian Pools",            address: "4600 N Lamb Blvd, Las Vegas, NV 89115",       lat: 36.2111, lng: -115.0671, metadata: {} },
  { id: "pb-17", type: "poolbuilder", name: "Clearwater Pools NV",       address: "9200 W Sunset Rd, Las Vegas, NV 89148",       lat: 36.0681, lng: -115.2991, metadata: {} },
  { id: "pb-18", type: "poolbuilder", name: "Oasis Pool Design",         address: "1500 N Nellis Blvd, Las Vegas, NV 89110",     lat: 36.1961, lng: -115.0671, metadata: {} },
  { id: "pb-19", type: "poolbuilder", name: "Desert Wind Pools",         address: "3900 S Maryland Pkwy, Las Vegas, NV 89119",   lat: 36.0811, lng: -115.1321, metadata: {} },
  { id: "pb-20", type: "poolbuilder", name: "Legacy Pools & Landscapes", address: "6600 W Cheyenne Ave, Las Vegas, NV 89108",    lat: 36.2131, lng: -115.2341, metadata: {} },
];

const SCRIPTS = [
  {
    title: "Door Hanger Drop",
    body: "Hi! We're Reliable Pool Care LLC and we service pools in your neighborhood. We'd love to keep your pool clean and clear all year — give us a call for a free quote!",
  },
  {
    title: "Cold Call Opener",
    body: "Hi, is this the homeowner? Great — my name is [YOUR NAME] with Reliable Pool Care. We've been servicing pools in your area and I wanted to see if you'd be interested in a free water test and quote for weekly pool maintenance.",
  },
  {
    title: "Follow-Up Call",
    body: "Hi [NAME], this is [YOUR NAME] from Reliable Pool Care. I'm following up on the door hanger we dropped last week. We still have a few open spots in your neighborhood — do you have a few minutes to talk about your pool care needs?",
  },
  {
    title: "Neighbor Referral",
    body: "Hi! We actually service a few of your neighbors' pools — the [NEIGHBOR] family on [STREET]. They've been really happy with our service and I thought you might be interested as well. Can I leave you a card?",
  },
];

// ─── Service Areas panel ──────────────────────────────────────────────────────

interface ServiceArea {
  id: string;
  name: string;
}

interface ServiceAreasPanelProps {
  areas: ServiceArea[];
  searchResults: { listings: number; permits: number; prospects: number } | null;
  lastSearchTime: Date | null;
  onRefresh: () => void;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}

function ServiceAreasPanel({ areas = [], searchResults, lastSearchTime, onRefresh, onAdd, onRemove }: ServiceAreasPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cityValue, setCityValue] = useState("");
  const [stateValue, setStateValue] = useState("");

  const timeAgo = (d: Date) => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleAdd = () => {
    const city = cityValue.trim();
    const state = stateValue.trim();
    if (!city) return;
    const name = state ? `${city}, ${state}` : city;
    onAdd(name);
    setCityValue("");
    setStateValue("");
    setAdding(false);
  };

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg text-white shadow-xl w-64">
      <button
        className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-semibold"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Service Areas</span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-700 px-3 pb-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-gray-400 font-medium">Service Areas</span>
            <button
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>

          {adding && (
            <div className="mb-2 space-y-1.5">
              <input
                autoFocus
                value={cityValue}
                onChange={(e) => setCityValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setCityValue(""); setStateValue(""); } }}
                placeholder="City (e.g. Las Vegas)"
                className="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <input
                value={stateValue}
                onChange={(e) => setStateValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setCityValue(""); setStateValue(""); } }}
                placeholder="STATE (E.G. NV)"
                className="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase"
              />
              <button
                onClick={handleAdd}
                className="w-full text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1.5 rounded transition-colors flex items-center justify-center gap-1 font-medium"
              >
                <Plus className="h-3 w-3" /> Add &amp; sync leads
              </button>
            </div>
          )}

          {areas.length === 0 && !adding && (
            <p className="text-[10px] text-gray-500 py-1">No service areas yet — click + Add to get started</p>
          )}

          {areas.map((area) => (
            <div key={area.id} className="flex items-start gap-2 py-1.5">
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight">{area.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                  {searchResults ? (
                    <>
                      {searchResults.listings} listings · {searchResults.permits} permits
                      {" · "}{POOL_BUILDER_MARKERS.length} builders
                      {lastSearchTime && ` · ${timeAgo(lastSearchTime)}`}
                    </>
                  ) : (
                    "Click a customer pin to search"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  title="Refresh"
                  onClick={onRefresh}
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                <button
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove area"
                  onClick={() => onRemove(area.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Map Layers panel ─────────────────────────────────────────────────────────

type LayerVisibility = {
  customers: boolean;
  listings: boolean;
  permits: boolean;
  prospects: boolean;
  poolbuilders: boolean;
  marketing: boolean;
};

interface LayerRow {
  key: keyof LayerVisibility;
  label: string;
  color: string;
  count: number;
}

interface MapLayersPanelProps {
  layers: LayerRow[];
  visibility: LayerVisibility;
  onToggle: (key: keyof LayerVisibility) => void;
}

function MapLayersPanel({ layers, visibility, onToggle }: MapLayersPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const left = layers.slice(0, 3);
  const right = layers.slice(3);

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg text-white shadow-xl w-52">
      <button
        className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-semibold"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Map Layers</span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-700 px-3 py-2 grid grid-cols-2 gap-x-2">
          {[left, right].map((col, ci) => (
            <div key={ci} className="space-y-1.5">
              {col.map((layer) => {
                const on = visibility[layer.key];
                return (
                  <div key={layer.key} className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: on ? layer.color : "#6b7280" }}
                    />
                    <span className={`text-[10px] flex-1 truncate ${on ? "text-white" : "text-gray-500"}`}>
                      {layer.label}
                      <span className="text-gray-500 ml-0.5">· {layer.count}</span>
                    </span>
                    <button
                      className="shrink-0 text-gray-500 hover:text-white transition-colors"
                      onClick={() => onToggle(layer.key)}
                      title={on ? "Hide layer" : "Show layer"}
                    >
                      {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main experience ──────────────────────────────────────────────────────────

export function OpportunityMapExperience() {
  const apiKey  = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  // const { data: rawCustomers = [], isLoading: customersLoading } = useCustomers();
  const rawCustomers: any[] = [];
  const customersLoading = false

  const [geocodeError, setGeocodeError] = useState(false);

  const { data: tenantCustomerMarkers, isPending: geocodingCustomers, isError: geocodingFailed } = useQuery({
    queryKey: ["opportunity_map_geocoded", rawCustomers.map((c: { id: string }) => c.id).join(",")],
    enabled: Boolean(apiKey && !customersLoading && rawCustomers.length > 0),
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<OpportunityMarker[]> => {
      await ensureGoogleMapsLoaded(apiKey!);
      const markers: OpportunityMarker[] = [];
      for (let i = 0; i < rawCustomers.length; i += 5) {
        const slice = rawCustomers.slice(i, i + 5);
        const batch = await Promise.all(
          slice.map(async (c: Record<string, unknown>) => {
            const addr = [
              String(c.service_address || c.address || "").trim(),
              String(c.service_city || c.city || "").trim(),
              String(c.service_state || c.state || "").trim(),
              String(c.service_zip || c.zip || "").trim(),
            ].filter(Boolean).join(", ");
            if (!addr) return null;
            try {
              const pos = await geocodeAddress(addr);
              if (!pos) return null;
              const monthly = c.monthly_amount;
              return {
                id: String(c.id),
                type: "customer" as const,
                name: String(c.name || "Customer"),
                address: addr,
                lat: pos.lat,
                lng: pos.lng,
                metadata: {
                  serviceDay: c.service_day,
                  ...(typeof monthly === "number" ? { monthlyRevenue: monthly } : {}),
                },
              } satisfies OpportunityMarker;
            } catch { return null; }
          })
        );
        for (const m of batch) if (m) markers.push(m);
      }
      return markers;
    },
  });

  useEffect(() => { if (geocodingFailed) setGeocodeError(true); }, [geocodingFailed]);

  const customerMarkers = useMemo(() => {
    if (rawCustomers.length > 0 && geocodingCustomers) return [];
    if (tenantCustomerMarkers && tenantCustomerMarkers.length > 0) return tenantCustomerMarkers;
    if (rawCustomers.length > 0 && tenantCustomerMarkers !== undefined) return [];
    return DEMO_CUSTOMER_MARKERS;
  }, [rawCustomers.length, geocodingCustomers, tenantCustomerMarkers]);

  // Layer visibility toggles
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    customers: true, listings: true, permits: true,
    prospects: true, poolbuilders: true, marketing: true,
  });
  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Search / filter state
  const [filters, setFilters] = useState<MapFilters>({
    showCustomers: true, showListings: false, showPermits: false,
    showProspects: false, showPoolBuilders: true, showMarketing: true,
    radiusMiles: null, selectedCustomerId: null,
    listingPriceMin: null, listingPriceMax: null, prospectConfidenceMin: 0,
  });
  const [selectedCustomer, setSelectedCustomer] = useState<OpportunityMarker | null>(null);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [leadDrawerMarker, setLeadDrawerMarker] = useState<OpportunityMarker | null>(null);
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchedListings, setSearchedListings] = useState<OpportunityMarker[]>([]);
  const [searchedPermits, setSearchedPermits] = useState<OpportunityMarker[]>([]);
  const [searchedProspects, setSearchedProspects] = useState<OpportunityMarker[]>([]);
  const [searchResults, setSearchResults] = useState<{ listings: number; permits: number; prospects: number } | null>(null);
  const [lastSearchTime, setLastSearchTime] = useState<Date | null>(null);

  // Drop pin + marketing pins
  const [dropPinMode, setDropPinMode] = useState(false);
  const [marketingPins, setMarketingPins] = useState<OpportunityMarker[]>([]);
  const pinCounter = useRef(0);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (!dropPinMode) return;
    pinCounter.current += 1;
    setMarketingPins((prev) => [
      ...prev,
      {
        id: `marketing-${pinCounter.current}`,
        type: "marketing",
        name: `Marketing Pin #${pinCounter.current}`,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat, lng,
        metadata: { droppedAt: new Date().toISOString() },
      },
    ]);
    toast.success("Marketing pin dropped");
    setDropPinMode(false);
  }, [dropPinMode]);

  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([{ id: "sa-1", name: "Las Vegas, NV" }]);
  const [scriptsOpen, setScriptsOpen] = useState(false);

  const layerRows: LayerRow[] = [
    { key: "customers",    label: "Customers",     color: MARKER_COLORS.customer,    count: customerMarkers.length },
    { key: "permits",      label: "Permits",       color: MARKER_COLORS.permit,      count: searchedPermits.length },
    { key: "poolbuilders", label: "Pool Builders", color: MARKER_COLORS.poolbuilder, count: POOL_BUILDER_MARKERS.length },
    { key: "listings",     label: "Listings",      color: MARKER_COLORS.listing,     count: searchedListings.length },
    { key: "prospects",    label: "Prospects",     color: MARKER_COLORS.prospect,    count: searchedProspects.length },
    { key: "marketing",    label: "Marketing",     color: MARKER_COLORS.marketing,   count: marketingPins.length },
  ];

  const visibleMarkers = useMemo(() => {
    const out: OpportunityMarker[] = [];
    if (layerVisibility.customers) out.push(...customerMarkers);
    if (layerVisibility.listings) out.push(...searchedListings);
    if (layerVisibility.permits) out.push(...searchedPermits);
    if (layerVisibility.prospects) out.push(...searchedProspects);
    if (layerVisibility.poolbuilders) out.push(...POOL_BUILDER_MARKERS);
    if (layerVisibility.marketing) out.push(...marketingPins);
    return out;
  }, [layerVisibility, customerMarkers, searchedListings, searchedPermits, searchedProspects, marketingPins]);

  const handleMarkerClick = useCallback((marker: OpportunityMarker) => {
    if (dropPinMode) return;
    if (marker.type === "customer") {
      setSelectedCustomer(marker);
      setCustomerDrawerOpen(true);
    } else {
      setLeadDrawerMarker(marker);
      setLeadDrawerOpen(true);
    }
  }, [dropPinMode]);

  const handleSearch = useCallback(
    async (
      marker: OpportunityMarker,
      config: { showListings: boolean; showPermits: boolean; showProspects: boolean; radiusMiles: number }
    ) => {
      setIsSearching(true);
      toast.info(`Searching ${config.radiusMiles} mi around "${marker.name}"...`);
      setFilters((f) => ({
        ...f, radiusMiles: config.radiusMiles, selectedCustomerId: marker.id,
        showListings: config.showListings, showPermits: config.showPermits, showProspects: config.showProspects,
      }));
      const results = { listings: 0, permits: 0, prospects: 0 };
      try {
        const parts = marker.address.split(",").map((s) => s.trim());
        const city = parts.length > 1 ? parts[1] : "Las Vegas";
        const state = parts.length > 2 ? parts[2].split(" ")[0] : "NV";
        const promises: Promise<void>[] = [];

        if (config.showListings) {
          promises.push(
            supabase.functions.invoke("fetch-pool-listings", {
              body: { city, state, lat: marker.lat, lng: marker.lng, radiusMiles: config.radiusMiles },
            }).then(({ data, error }) => {
              if (error) { toast.error("Listings search failed (check HASDATA_API_KEY)."); return; }
              const errMsg = (data as { error?: string })?.error;
              if (errMsg) { toast.error(errMsg); setSearchedListings([]); return; }
              const listings = (((data as { listings?: unknown[] })?.listings ?? []) as Record<string, unknown>[]).map((l) => {
                const addr = typeof l.address === "string" ? l.address
                  : l.address && typeof l.address === "object"
                    ? `${(l.address as Record<string, string>).street || ""}, ${(l.address as Record<string, string>).city || ""}, ${(l.address as Record<string, string>).state || ""} ${(l.address as Record<string, string>).zipcode || ""}`
                    : "Unknown";
                return {
                  id: String(l.id ?? ""), type: "listing" as const, name: addr, address: addr,
                  lat: Number(l.lat), lng: Number(l.lng),
                  metadata: { listPrice: l.listPrice, beds: l.beds, baths: l.baths, sqft: l.sqft, status: l.status, hasPool: l.hasPool, source: l.source, listingUrl: l.listingUrl, photoUrl: l.photoUrl },
                };
              });
              const filtered = filterByRadius(listings, marker.lat, marker.lng, config.radiusMiles);
              setSearchedListings(filtered);
              results.listings = filtered.length;
            })
          );
        } else { setSearchedListings([]); }

        if (config.showPermits) {
          promises.push(
            supabase.functions.invoke("fetch-pool-permits", {
              body: { city, state, lat: marker.lat, lng: marker.lng, radiusMiles: config.radiusMiles },
            }).then(({ data, error }) => {
              if (error) { console.error("Permits error:", error); return; }
              const permits = ((data as { permits?: unknown[] })?.permits ?? []).map((p: unknown) => {
                const permit = p as Record<string, unknown>;
                return {
                  id: String(permit.id ?? ""), type: "permit" as const,
                  name: String(permit.description || permit.address || ""), address: String(permit.address ?? ""),
                  lat: Number(permit.lat), lng: Number(permit.lng),
                  metadata: { permitDate: permit.permitDate, status: permit.status, description: permit.description, contractor: permit.contractor, estimatedValue: permit.estimatedValue, source: permit.source },
                };
              });
              const filtered = filterByRadius(permits, marker.lat, marker.lng, config.radiusMiles);
              setSearchedPermits(filtered);
              results.permits = filtered.length;
            })
          );
        } else { setSearchedPermits([]); }

        if (config.showProspects) {
          promises.push(
            supabase.functions.invoke("find-nearby-pool-prospects", {
              body: { customers: [{ id: marker.id, name: marker.name, lat: marker.lat, lng: marker.lng }], radiusMiles: config.radiusMiles },
            }).then(({ data, error }) => {
              if (error) { toast.error("Prospects search failed (set ANTHROPIC_API_KEY on the server)."); return; }
              const errMsg = (data as { error?: string })?.error;
              if (errMsg) { toast.error(errMsg); setSearchedProspects([]); return; }
              const prospects = (((data as { prospects?: unknown[] })?.prospects ?? []) as Record<string, unknown>[]).map((p) => ({
                id: String(p.id ?? ""), type: "prospect" as const,
                name: String(p.address ?? ""), address: String(p.address ?? ""),
                lat: Number(p.lat), lng: Number(p.lng),
                metadata: { hasPool: p.verified, verified: p.verified, confidence: p.confidence, reason: p.reason, nearestCustomer: p.nearestCustomer, distanceMiles: p.distanceMiles },
              }));
              const filtered = filterByRadius(prospects, marker.lat, marker.lng, config.radiusMiles);
              setSearchedProspects(filtered);
              results.prospects = filtered.length;
            })
          );
        } else { setSearchedProspects([]); }

        await Promise.all(promises);
        setSearchResults(results);
        setLastSearchTime(new Date());
        const total = results.listings + results.permits + results.prospects;
        toast.success(`Found ${total} lead${total !== 1 ? "s" : ""} nearby`);
      } catch (err) {
        console.error("Search error:", err);
        toast.error("Search failed — please try again");
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const handleRefreshArea = useCallback(() => {
    if (!selectedCustomer) {
      toast.info("Click a customer pin first to search an area");
    } else {
      toast.info("Refreshing search area...");
    }
  }, [selectedCustomer]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {geocodeError && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-destructive/90 text-destructive-foreground text-xs px-4 py-2 text-center">
          Customer addresses could not be geocoded — showing demo markers instead.
        </div>
      )}

      {/* Map fills entire container */}
      {apiKey ? (
        <OpportunityMapCanvas
          markers={visibleMarkers}
          filters={filters}
          apiKey={apiKey}
          onMarkerClick={handleMarkerClick}
          selectedCustomerId={filters.selectedCustomerId}
          dropPinMode={dropPinMode}
          onMapClick={handleMapClick}
        />
      ) : (
        <div className="flex items-center justify-center h-full bg-gray-900">
          <p className="text-sm text-gray-400">Loading map…</p>
        </div>
      )}

      {/* Service Areas — top-left overlay */}
      <div className="absolute top-3 left-3 z-20">
        <ServiceAreasPanel
          areas={serviceAreas}
          searchResults={searchResults}
          lastSearchTime={lastSearchTime}
          onRefresh={handleRefreshArea}
          onAdd={(name) => setServiceAreas((prev) => [...prev, { id: `sa-${Date.now()}`, name }])}
          onRemove={(id) => setServiceAreas((prev) => prev.filter((a) => a.id !== id))}
        />
      </div>

      {/* Map Layers — top-right overlay */}
      <div className="absolute top-3 right-3 z-20">
        <MapLayersPanel
          layers={layerRows}
          visibility={layerVisibility}
          onToggle={toggleLayer}
        />
      </div>

      {/* Drop-pin mode hint */}
      {dropPinMode && (
        <div className="absolute! top-1/2! left-1/2! -translate-x-1/2! -translate-y-1/2! z-30! pointer-events-none!">
          <div className="bg-gray-900/90! text-white! text-sm! font-medium! px-4! py-2! rounded-full! border! border-teal-500! shadow-lg!">
            Click anywhere on the map to drop a marketing pin
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="absolute bottom-4 left-0 right-0 flex items-end justify-between px-4 z-20 pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium shadow-lg border transition-colors ${
              dropPinMode
                ? "bg-teal-600 border-teal-500 text-white"
                : "bg-white/90 backdrop-blur-sm border-gray-200 text-gray-700 hover:bg-white"
            }`}
            onClick={() => setDropPinMode((v) => !v)}
          >
            <MapPinned className="h-4 w-4" />
            Drop pin
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-700 hover:bg-white text-sm font-medium shadow-lg transition-colors"
            onClick={() => setScriptsOpen(true)}
          >
            <FileText className="h-4 w-4" />
            Scripts
          </button>
        </div>

        <div className="flex items-end gap-3 pointer-events-auto">
          {/* 🔧 BUILD: Quota bar — currently static. Future: track actual skip-trace API calls per tenant */}
          <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-lg">
            <p className="text-[10px] text-gray-500 font-medium">25,000 left</p>
            <div className="mt-1 h-1 w-28 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: "0%" }} />
            </div>
            <p className="text-[9px] text-gray-400 mt-0.5">0 / 25,000</p>
          </div>
          {/* 🔧 BUILD: AI Assistant — coming soon */}
          <button
            className="h-11 w-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-colors"
            onClick={() => toast.info("AI Assistant — coming soon")}
            title="AI Assistant"
          >
            <Bot className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scripts dialog */}
      <Dialog open={scriptsOpen} onOpenChange={setScriptsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marketing Scripts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {SCRIPTS.map((s) => (
              <div key={s.title} className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                <Button
                  // size="sm"
                  // variant="outline"
                  onClick={() => { navigator.clipboard.writeText(s.body); toast.success("Copied to clipboard"); }}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CustomerSearchDrawer
        marker={selectedCustomer}
        open={customerDrawerOpen}
        onClose={() => setCustomerDrawerOpen(false)}
        onSearch={handleSearch}
        isSearching={isSearching}
        searchResults={searchResults}
      />

      <MarkerDetailDrawer
        marker={leadDrawerMarker}
        open={leadDrawerOpen}
        onClose={() => setLeadDrawerOpen(false)}
      />
    </div>
  );
}

function filterByRadius(markers: OpportunityMarker[], cLat: number, cLng: number, miles: number): OpportunityMarker[] {
  const R = 3958.8;
  return markers.filter((m) => {
    const dLat = ((m.lat - cLat) * Math.PI) / 180;
    const dLng = ((m.lng - cLng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((cLat * Math.PI) / 180) * Math.cos((m.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a)) <= miles;
  });
}
