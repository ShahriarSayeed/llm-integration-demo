import { useState } from "react";
import { MapPin, DollarSign, X, ScanLine, Loader2 } from "lucide-react";
import type { OpportunityMarker } from "./types";
import { MARKER_COLORS } from "./types";

interface SearchConfig {
  showListings: boolean;
  showPermits: boolean;
  showProspects: boolean;
  radiusMiles: number;
}

interface Props {
  marker: OpportunityMarker | null;
  open: boolean;
  onClose: () => void;
  onSearch: (marker: OpportunityMarker, config: SearchConfig) => void;
  isSearching: boolean;
  searchResults?: { listings: number; permits: number; prospects: number } | null;
}

export function CustomerSearchDrawer({ marker, open, onClose, onSearch, isSearching }: Props) {
  const [radiusMiles] = useState(0.25);

  if (!marker || marker.type !== "customer" || !open) return null;

  const meta = marker.metadata as Record<string, unknown>;

  const handleScan = () => {
    onSearch(marker, {
      showListings: false,
      showPermits: false,
      showProspects: true,
      radiusMiles,
    });
  };

  return (
    <div className="absolute top-0 right-0 h-full w-[380px] z-30 flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="h-3 w-3 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: MARKER_COLORS.customer }}
          />
          <div>
            <h2 className="text-white font-semibold text-base leading-tight">{marker.name}</h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1 -mt-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Customer info */}
      <div className="px-5 pb-4 space-y-2">
        <div className="flex items-start gap-2 text-sm text-gray-400">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-gray-500" />
          <span>{marker.address}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {typeof meta.monthlyRevenue === "number" && (
            <div className="flex items-center gap-1.5 text-sm text-gray-300">
              <DollarSign className="h-3.5 w-3.5 text-gray-500" />
              <span>${meta.monthlyRevenue}/mo</span>
            </div>
          )}
          {typeof meta.serviceDay === "string" && (
            <span className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700">
              {meta.serviceDay}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 mx-5" />

      {/* Scan section */}
      <div className="px-5 pt-4 pb-5 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
            <ScanLine className="h-3 w-3 text-orange-400" />
          </div>
          <h3 className="text-white font-semibold text-sm">Scan for Neighbors with Pools</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          We'll scan satellite imagery within the radius and drop an orange pin on every home with a pool.
        </p>

        {/* Neighborhood Scan option card */}
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-3.5 mb-4">
          <p className="text-sm font-medium text-white mb-1">Neighborhood Scan</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Scans this customer's street and the few streets immediately around them — slower but won't miss any nearby pools.
          </p>
        </div>

        {/* Scan button */}
        <button
          onClick={handleScan}
          disabled={isSearching}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium text-sm py-3 rounded-lg transition-colors"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning satellite imagery...
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4" />
              Scan This Area
            </>
          )}
        </button>
      </div>
    </div>
  );
}
