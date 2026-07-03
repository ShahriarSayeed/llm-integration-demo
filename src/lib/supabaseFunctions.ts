import { supabase } from "../components/integrations/supabase/client";

/**
 * Returns headers with the current session's JWT for Edge Function calls.
 * Use when invoking functions that require authentication so the
 * Authorization header is reliably sent (with refresh when near expiry).
 * @throws if there is no session (user not logged in)
 */
export async function getEdgeFunctionAuthHeaders(): Promise<{ Authorization: string }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("You must be logged in to perform this action.");
  }

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs < Date.now() + 120_000) {
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    const next = refreshData.session;
    if (!refreshErr && next?.access_token) {
      return { Authorization: `Bearer ${next.access_token}` };
    }
    if (expiresAtMs <= Date.now() + 60_000) {
      throw new Error(refreshErr?.message ?? "Session expired. Please sign in again.");
    }
  }

  return { Authorization: `Bearer ${session.access_token}` };
}
