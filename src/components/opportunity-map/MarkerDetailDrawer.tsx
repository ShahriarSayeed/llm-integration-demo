import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { MapPin, DollarSign, ExternalLink, UserPlus, StickyNote, Mail, Search, MapPinned, Loader2, Phone, User } from "lucide-react";
import type { OpportunityMarker } from "./types";
import { MARKER_COLORS } from "./types";
import { toast } from "sonner";
import { supabase } from "../integrations/supabase/client";
import { getEdgeFunctionAuthHeaders } from "../../lib/supabaseFunctions";

interface SkipTraceResult {
  name: string;
  phones: { phone_number: string; line_type: string }[];
  emails: string[];
  age?: string;
  gender?: string;
}

interface Props {
  marker: OpportunityMarker | null;
  open: boolean;
  onClose: () => void;
  nearbyStats?: { listings: number; permits: number; prospects: number };
}

function parseAddress(address: string): { street_line_1: string; city: string; state_code: string; postal_code: string } | null {
  const match = address.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5})?/i);
  if (match) {
    return {
      street_line_1: match[1].trim(),
      city: match[2].trim(),
      state_code: match[3].trim().toUpperCase(),
      postal_code: match[4]?.trim() || "",
    };
  }
  return null;
}

export function MarkerDetailDrawer({ marker, open, onClose, nearbyStats }: Props) {
  const [skipTraceLoading, setSkipTraceLoading] = useState(false);
  const [skipTraceResults, setSkipTraceResults] = useState<SkipTraceResult[] | null>(null);
  const [postcardLoading, setPostcardLoading] = useState(false);

  if (!marker) return null;

  const borderColor = MARKER_COLORS[marker.type];
  const meta = marker.metadata as Record<string, unknown>;

  const handleAction = (action: string) => {
    toast.info(`${action} — coming in Phase 2`);
  };

  const handleSkipTrace = async () => {
    if (!marker.address) {
      toast.error("No address available for skip trace");
      return;
    }

    const parsed = parseAddress(marker.address);
    if (!parsed || !parsed.postal_code) {
      toast.error("Could not parse address. Expected format: Street, City, ST 12345");
      return;
    }

    setSkipTraceLoading(true);
    setSkipTraceResults(null);

    try {
      const headers = await getEdgeFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("skip-trace", {
        body: parsed,
        headers,
      });

      if (error) {
        console.error("Skip trace error:", error);
        toast.error("Skip trace failed. Please try again.");
        return;
      }

      const residents = (data as { current_residents?: unknown[] })?.current_residents || [];
      const results: SkipTraceResult[] = (residents as Record<string, unknown>[])
        .filter((r) => r.type === "Person" || !r.type)
        .map((p) => ({
          name: [p.firstname, p.middlename, p.lastname].filter(Boolean).join(" ") || (p.name as string) || "Unknown",
          phones: ((p.phones as Record<string, string>[]) || []).map((ph) => ({
            phone_number: ph.phone_number || "",
            line_type: ph.line_type || "unknown",
          })),
          emails: ((p.emails as unknown[]) || []).filter((e): e is string => typeof e === "string" && e.length > 0),
          age: (p.age_range as string) || undefined,
          gender: (p.gender as string) || undefined,
        }));

      setSkipTraceResults(results);

      if (results.length === 0) {
        toast.info("No results found for this address");
      } else {
        toast.success(`Found ${results.length} person(s) at this address`);
      }
    } catch (err) {
      console.error("Skip trace exception:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("logged in")) {
        toast.error("Sign in to use skip trace");
      } else {
        toast.error("Skip trace failed unexpectedly");
      }
    } finally {
      setSkipTraceLoading(false);
    }
  };

  const handleSendPostcard = async () => {
    if (!marker.address) {
      toast.error("No address available for postcard");
      return;
    }

    const parsed = parseAddress(marker.address);
    if (!parsed) {
      toast.error("Could not parse address. Expected format: Street, City, ST 12345");
      return;
    }

    setPostcardLoading(true);
    try {
      const headers = await getEdgeFunctionAuthHeaders();
      const firstPerson = skipTraceResults?.[0];
      const { data, error } = await supabase.functions.invoke("send-postcard", {
        body: {
          toAddress: parsed.street_line_1,
          toCity: parsed.city,
          toState: parsed.state_code,
          toZip: parsed.postal_code,
          ...(firstPerson?.name && {
            toFirstName: firstPerson.name.split(" ")[0],
            toLastName: firstPerson.name.split(" ").slice(1).join(" "),
          }),
        },
        headers,
      });

      if (error) {
        console.error("Send postcard error:", error);
        toast.error("Failed to send postcard. Please try again.");
        return;
      }

      if ((data as { success?: boolean })?.success) {
        toast.success("Postcard queued for delivery!");
      } else {
        toast.error("Postcard submission failed. Check console for details.");
      }
    } catch (err) {
      console.error("Postcard exception:", err);
      toast.error("Postcard failed unexpectedly");
    } finally {
      setPostcardLoading(false);
    }
  };

  const handleClose = () => {
    setSkipTraceResults(null);
    setSkipTraceLoading(false);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: borderColor }} />
            <SheetTitle className="text-base">{marker.type === "customer" ? marker.name : marker.address}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{marker.address}</span>
          </div>

          {marker.type === "customer" && (
            <>
              {typeof meta.monthlyRevenue === "number" && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>${meta.monthlyRevenue}/mo</span>
                </div>
              )}
              {typeof meta.serviceDay === "string" && (
                <Badge variant="secondary">{meta.serviceDay}</Badge>
              )}
              {typeof meta.techName === "string" && (
                <p className="text-xs text-muted-foreground">Tech: {meta.techName}</p>
              )}
              {nearbyStats && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-foreground">Nearby Opportunities</p>
                  <div className="flex gap-3 text-xs">
                    <span className="text-red-500">{nearbyStats.listings} listings</span>
                    <span className="text-blue-500">{nearbyStats.permits} permits</span>
                    <span className="text-orange-500">{nearbyStats.prospects} prospects</span>
                  </div>
                </div>
              )}
            </>
          )}

          {marker.type === "listing" && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Price:</span> ${Number(meta.listPrice ?? 0).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Beds:</span> {String(meta.beds ?? "")}</div>
                <div><span className="text-muted-foreground">Baths:</span> {String(meta.baths ?? "")}</div>
                <div><span className="text-muted-foreground">Sqft:</span> {Number(meta.sqft ?? 0).toLocaleString()}</div>
              </div>
              <Badge variant="outline">{String(meta.status ?? "")}</Badge>
              <p className="text-xs text-muted-foreground">Source: {String(meta.source ?? "")}</p>
              {typeof meta.listingUrl === "string" && meta.listingUrl && meta.listingUrl !== "#" && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={meta.listingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View listing
                  </a>
                </Button>
              )}
              {meta.distanceMiles != null && typeof meta.distanceMiles === "number" && (
                <p className="text-xs text-muted-foreground">{meta.distanceMiles.toFixed(1)} mi from nearest customer</p>
              )}
            </>
          )}

          {marker.type === "permit" && (
            <>
              <p className="text-sm">{String(meta.description ?? "")}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {String(meta.permitDate ?? "")}</div>
                <div><span className="text-muted-foreground">Status:</span> {String(meta.status ?? "")}</div>
              </div>
              {meta.contractor && (
                <p className="text-xs text-muted-foreground">Contractor: {String(meta.contractor)}</p>
              )}
              {meta.estimatedValue != null && (
                <p className="text-xs text-muted-foreground">Est. Value: ${Number(meta.estimatedValue).toLocaleString()}</p>
              )}
            </>
          )}

          {marker.type === "prospect" && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={meta.verified ? "default" : "secondary"}>
                  {meta.verified ? "Verified Pool" : "Likely Pool"}
                </Badge>
                <span className="text-sm font-medium">{String(meta.confidence ?? "")}% confidence</span>
              </div>
              <p className="text-sm text-muted-foreground">{String(meta.reason ?? "")}</p>
              {typeof meta.nearestCustomer === "string" && (
                <p className="text-xs text-muted-foreground">
                  Nearest: {meta.nearestCustomer} ({typeof meta.distanceMiles === "number" ? meta.distanceMiles.toFixed(1) : "?"} mi)
                </p>
              )}
            </>
          )}

          {marker.type === "poolbuilder" && (
            <>
              <p className="text-sm text-muted-foreground">Pool construction company</p>
              {typeof meta.phone === "string" && (
                <a href={`tel:${meta.phone}`} className="text-sm text-primary hover:underline block">{meta.phone}</a>
              )}
            </>
          )}

          {marker.type === "marketing" && (
            <>
              <Badge variant="secondary">Marketing Pin</Badge>
              {typeof meta.droppedAt === "string" && (
                <p className="text-xs text-muted-foreground">
                  Dropped: {new Date(meta.droppedAt).toLocaleString()}
                </p>
              )}
            </>
          )}

          {marker.type !== "customer" && (
            <div className="pt-2 border-t space-y-2">
              <Button size="sm" className="w-full" onClick={() => handleAction("Save as Lead")}>
                <UserPlus className="h-4 w-4 mr-2" /> Save as Lead
              </Button>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => handleAction("Add to Route – Drop off Door Hanger/Flyer")}>
                <MapPinned className="h-4 w-4 mr-2" /> Drop off Door Hanger / Flyer
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => handleAction("Add Note")}>
                  <StickyNote className="h-4 w-4 mr-1" /> Note
                </Button>
                <Button size="sm" variant="outline" onClick={handleSendPostcard} disabled={postcardLoading}>
                  {postcardLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                  Postcard
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleSkipTrace}
                disabled={skipTraceLoading}
              >
                {skipTraceLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tracing...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" /> Skip Trace the Lead
                  </>
                )}
              </Button>

              {skipTraceResults && skipTraceResults.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Skip Trace Results ({skipTraceResults.length})
                  </p>
                  {skipTraceResults.map((person, i) => (
                    <div key={i} className="border-b border-border pb-2 last:border-0 last:pb-0 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{person.name}</span>
                        {person.age && <span className="text-xs text-muted-foreground">{person.age}</span>}
                        {person.gender && <span className="text-xs text-muted-foreground">• {person.gender}</span>}
                      </div>
                      {person.phones.length > 0 && (
                        <div className="space-y-0.5 ml-5">
                          {person.phones.slice(0, 3).map((ph, j) => (
                            <a
                              key={j}
                              href={`tel:${ph.phone_number}`}
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {ph.phone_number}
                              <span className="text-muted-foreground">({ph.line_type})</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {person.emails.length > 0 && (
                        <div className="space-y-0.5 ml-5">
                          {person.emails.slice(0, 2).map((email, j) => (
                            <a
                              key={j}
                              href={`mailto:${email}`}
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <Mail className="h-3 w-3" />
                              {email}
                            </a>
                          ))}
                        </div>
                      )}
                      {person.phones.length === 0 && person.emails.length === 0 && (
                        <p className="text-xs text-muted-foreground ml-5">No contact info found</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {skipTraceResults && skipTraceResults.length === 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground text-center">No records found at this address</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
