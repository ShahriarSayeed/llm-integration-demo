export interface OpportunityMarker {
  id: string;
  type: "customer" | "listing" | "permit" | "prospect" | "poolbuilder" | "marketing";
  name: string;
  address: string;
  lat: number;
  lng: number;
  metadata: Record<string, unknown>;
}

export interface MapFilters {
  showCustomers: boolean;
  showListings: boolean;
  showPermits: boolean;
  showProspects: boolean;
  showPoolBuilders: boolean;
  showMarketing: boolean;
  radiusMiles: number | null;
  selectedCustomerId: string | null;
  listingPriceMin: number | null;
  listingPriceMax: number | null;
  prospectConfidenceMin: number;
}

export const MARKER_COLORS: Record<OpportunityMarker["type"], string> = {
  customer: "#22c55e",
  listing: "#ef4444",
  permit: "#3b82f6",
  prospect: "#f97316",
  poolbuilder: "#a855f7",
  marketing: "#14b8a6",
};

export const RADIUS_OPTIONS = [
  { label: "0.5 mi", value: 0.5 },
  { label: "1 mi", value: 1 },
  { label: "3 mi", value: 3 },
  { label: "5 mi", value: 5 },
];
