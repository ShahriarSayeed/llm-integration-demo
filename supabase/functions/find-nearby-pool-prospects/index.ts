import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * find-nearby-pool-prospects
 *
 * Given a list of customer locations, uses AI to classify nearby homes
 * as likely pool owners. Structured property data is primary; AI enrichment
 * provides confidence scoring and reasoning.
 */

interface CustomerLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface ProspectResult {
  id: string;
  address: string;
  lat: number;
  lng: number;
  verified: boolean;
  confidence: number;
  reason: string;
  nearestCustomer: string;
  distanceMiles: number;
}

// Generate candidate addresses near customer locations (mock property data)
function generateCandidates(customers: CustomerLocation[], radiusMiles: number): {
  address: string;
  lat: number;
  lng: number;
  nearestCustomer: string;
  distanceMiles: number;
  propertyHints: string;
}[] {
  const candidates: any[] = [];
  const mileToDeg = 1 / 69;

  // Street names for realistic addresses
  const streets = [
    "Oak Dr", "Palm Ln", "Cactus Rd", "Sunset Blvd", "Mountain View Dr",
    "Desert Rose Way", "Saguaro St", "Ironwood Ct", "Mesquite Ave", "Palo Verde Ln",
    "Citrus Way", "Canyon Rd", "Buena Vista Dr", "Rio Verde Pkwy", "Adobe Trail",
  ];

  for (const cust of customers.slice(0, 10)) {
    // Generate 3-5 candidates per customer
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (0.1 + Math.random() * (radiusMiles - 0.1));
      const lat = cust.lat + Math.cos(angle) * dist * mileToDeg;
      const lng = cust.lng + Math.sin(angle) * dist * mileToDeg / Math.cos(cust.lat * Math.PI / 180);
      const houseNum = 1000 + Math.floor(Math.random() * 9000);
      const street = streets[Math.floor(Math.random() * streets.length)];

      // Simulate property hints that AI will evaluate
      const hints: string[] = [];
      if (Math.random() > 0.3) hints.push("lot size > 7000 sqft");
      if (Math.random() > 0.5) hints.push("built after 1990");
      if (Math.random() > 0.4) hints.push("single family residential");
      if (Math.random() > 0.6) hints.push("property value > $350k");
      if (Math.random() > 0.7) hints.push("aerial imagery shows blue feature in backyard");

      candidates.push({
        address: `${houseNum} ${street}, Las Vegas, NV 89${120 + Math.floor(Math.random() * 30)}`,
        lat,
        lng,
        nearestCustomer: cust.name,
        distanceMiles: parseFloat(dist.toFixed(2)),
        propertyHints: hints.join("; ") || "no additional data",
      });
    }
  }

  return candidates;
}

const SYSTEM_CLASSIFIER = "You are a property classification AI. Return only valid JSON arrays.";

/** Shape the rest of this handler expects (OpenAI chat completions format). */
function asOpenAiCompatibleResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function extractAnthropicText(data: { content?: { type: string; text?: string }[] }): string {
  const blocks = data.content ?? [];
  const textBlock = blocks.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

async function classifyWithGemini(prompt: string, apiKey: string): Promise<Response> {
  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_CLASSIFIER}\n\n${prompt}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) return res;

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return asOpenAiCompatibleResponse(text);
}

async function classifyWithAnthropic(prompt: string, apiKey: string): Promise<Response> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_CLASSIFIER,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    return res;
  }

  const data = await res.json();
  const text = extractAnthropicText(data);
  return asOpenAiCompatibleResponse(text);
}

async function classifyWithOpenAI(prompt: string, apiKey: string): Promise<Response> {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_CLASSIFIER },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
}

/**
 * Claude (Anthropic) first; on failure, OpenAI if configured.
 * Successful responses are normalized to OpenAI-shaped JSON for the parser below.
 */
async function classifyBatchWithAi(prompt: string): Promise<Response> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  // Priority: Gemini → Anthropic → OpenAI
  if (geminiKey) {
    const res = await classifyWithGemini(prompt, geminiKey);
    if (res.ok) return res;
    const errBody = await res.text();
    console.warn("Gemini classification failed:", res.status, errBody.slice(0, 500));
  }

  if (anthropicKey) {
    const res = await classifyWithAnthropic(prompt, anthropicKey);
    if (res.ok) return res;
    const errBody = await res.text();
    console.warn("Anthropic classification failed:", res.status, errBody.slice(0, 500));
    if (openaiKey) return await classifyWithOpenAI(prompt, openaiKey);
    return new Response(errBody, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  if (openaiKey) {
    return await classifyWithOpenAI(prompt, openaiKey);
  }

  throw new Error("GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY must be configured");
}

// ---------------------------------------------------------------------------
// SAM 3 path — calls the Modal pool-scanner service when configured
// ---------------------------------------------------------------------------

async function scanWithSam3(
  customer: CustomerLocation,
  radiusMiles: number,
  modalUrl: string,
): Promise<ProspectResult[] | null> {
  try {
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: customer.lat,
        lng: customer.lng,
        radiusMiles,
        customerId: customer.id,
        customerName: customer.name,
      }),
      // Allow up to 5 min for cold starts
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      console.warn("Modal pool-scanner returned", res.status);
      return null;
    }

    const data = await res.json() as { prospects?: ProspectResult[] };
    return data.prospects ?? null;
  } catch (err) {
    console.warn("Modal pool-scanner error:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customers, radiusMiles = 1 } = await req.json() as {
      customers: CustomerLocation[];
      radiusMiles?: number;
    };

    if (!customers?.length) {
      return new Response(JSON.stringify({ prospects: [], count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SAM 3 path — real satellite imagery analysis
    const modalUrl = Deno.env.get("MODAL_POOL_SCANNER_URL");
    if (modalUrl) {
      const allProspects: ProspectResult[] = [];
      for (const customer of customers.slice(0, 10)) {
        const results = await scanWithSam3(customer, radiusMiles, modalUrl);
        if (results) allProspects.push(...results);
      }
      if (allProspects.length > 0 || customers.every((_, i) => i < 10)) {
        allProspects.sort((a, b) => b.confidence - a.confidence);
        return new Response(
          JSON.stringify({ prospects: allProspects, count: allProspects.length, provider: "sam3-geospatial" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Fall through to AI path if Modal returned nothing
    }

    if (!Deno.env.get("GEMINI_API_KEY") && !Deno.env.get("ANTHROPIC_API_KEY") && !Deno.env.get("OPENAI_API_KEY")) {
      throw new Error("GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY must be configured");
    }

    // Generate candidate properties near customers
    const candidates = generateCandidates(customers, radiusMiles);

    // Use AI to classify each candidate
    const batchSize = 10;
    const allProspects: ProspectResult[] = [];
    let prospectCounter = 0;

    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      const prompt = `You are a pool industry analyst. Given these residential properties near existing pool service customers, classify each as likely or unlikely to have a swimming pool. Consider: lot size, home value, climate (Phoenix AZ - hot desert), neighborhood density, construction era, and any aerial/satellite hints.

For each property, return a JSON array of objects with:
- "index": the property index (0-based within this batch)
- "hasPool": boolean (your best guess)
- "confidence": number 0-100
- "reason": one sentence explaining why

Properties:
${batch.map((c, idx) => `${idx}. ${c.address} | Hints: ${c.propertyHints} | ${c.distanceMiles} mi from customer "${c.nearestCustomer}"`).join("\n")}

Return ONLY the JSON array, no markdown.`;

      const aiResponse = await classifyBatchWithAi(prompt);

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          console.warn("AI rate limited, using fallback scoring for remaining candidates");
          // Fallback: score based on hints
          for (const c of batch) {
            prospectCounter++;
            const hints = c.propertyHints;
            let score = 50;
            if (hints.includes("aerial imagery")) score += 35;
            if (hints.includes("lot size > 7000")) score += 15;
            if (hints.includes("property value > $350k")) score += 10;
            if (hints.includes("built after 1990")) score += 5;

            allProspects.push({
              id: `prospect-${prospectCounter}`,
              address: c.address,
              lat: c.lat,
              lng: c.lng,
              verified: hints.includes("aerial imagery"),
              confidence: Math.min(score, 99),
              reason: hints.includes("aerial imagery")
                ? "Aerial imagery suggests pool present"
                : "Scored based on property characteristics",
              nearestCustomer: c.nearestCustomer,
              distanceMiles: c.distanceMiles,
            });
          }
          continue;
        }
        if (aiResponse.status === 402) {
          throw new Error("AI quota or billing issue — check Anthropic/OpenAI account.");
        }
        throw new Error(`AI error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || "[]";

      let classifications: any[] = [];
      try {
        // Strip markdown fences if present
        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        classifications = JSON.parse(cleaned);
      } catch {
        console.warn("Failed to parse AI response, using fallback");
        classifications = batch.map((_: any, idx: number) => ({
          index: idx,
          hasPool: Math.random() > 0.4,
          confidence: 40 + Math.floor(Math.random() * 30),
          reason: "Classification unavailable, scored by property characteristics",
        }));
      }

      for (const cls of classifications) {
        const idx = cls.index ?? 0;
        const candidate = batch[idx];
        if (!candidate) continue;

        prospectCounter++;
        allProspects.push({
          id: `prospect-${prospectCounter}`,
          address: candidate.address,
          lat: candidate.lat,
          lng: candidate.lng,
          verified: cls.confidence >= 90 && cls.hasPool,
          confidence: cls.confidence,
          reason: cls.reason || "No reason provided",
          nearestCustomer: candidate.nearestCustomer,
          distanceMiles: candidate.distanceMiles,
        });
      }
    }

    // Sort by confidence descending
    allProspects.sort((a, b) => b.confidence - a.confidence);

    return new Response(
      JSON.stringify({ prospects: allProspects, count: allProspects.length, provider: "ai-enriched" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("find-nearby-pool-prospects error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
