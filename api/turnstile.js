/* AnboBD — Turnstile token verification (P3 / SEC-P1-7, Part A, 2026-11-26).
   POST /api/turnstile {token, phone} -> verifies the Turnstile token with
   Cloudflare, then stores a short-lived one-time proof via the Supabase RPC
   anbo_turnstile_proof. The storefront sends that proof with place_order;
   the RPC (Part B) checks + consumes it. Nothing here touches the live
   checkout — the storefront does not call this endpoint yet.
   Turnstile widget "AnboBD" (Managed, hostname anbobd-azure.vercel.app,
   site key 0x4AAAAAAGUgmFRIQ9Ft98Lg) already exists in Cloudflare.
   Secrets: TURNSTILE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY come from
   Vercel env — NEVER committed, never echoed in any response. Until
   TURNSTILE_SECRET_KEY is set, this answers not_configured (expected). */

export const config = { runtime: "edge" };

const HOSTNAME = "anbobd-azure.vercel.app";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("880")) d = "0" + d.slice(3);
  else if (d.length === 12 && d.startsWith("88")) d = "0" + d.slice(2);
  return /^01[3-9][0-9]{8}$/.test(d) ? d : "";
}

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { ok: false, error: "bad_token" });
  }
  const phone = normPhone(body && body.phone);
  if (!phone) return json(400, { ok: false, error: "bad_phone" });
  const token = String((body && body.token) || "").trim();
  if (!token) return json(400, { ok: false, error: "bad_token" });
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) return json(503, { ok: false, error: "not_configured" });

  /* Verify the token with Cloudflare. */
  let data;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "secret=" + encodeURIComponent(secret) + "&response=" + encodeURIComponent(token),
    });
    data = await res.json();
  } catch (e) {
    return json(200, { ok: false, error: "bad_token" });
  }
  if (!data || data.success !== true) return json(200, { ok: false, error: "bad_token" });
  if (data.hostname && data.hostname !== HOSTNAME) return json(200, { ok: false, error: "bad_token" });

  /* Token is good — mint a one-time proof and store it in Supabase. */
  const proof = crypto.randomUUID();
  const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supaUrl || !anon) return json(503, { ok: false, error: "proof_store_failed" });
  try {
    const pr = await fetch(supaUrl + "/rest/v1/rpc/anbo_turnstile_proof", {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: "Bearer " + anon,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_phone: phone, p_proof: proof }),
    });
    const stored = await pr.json().catch(function () { return null; });
    if (!pr.ok || stored !== true) return json(503, { ok: false, error: "proof_store_failed" });
  } catch (e) {
    return json(503, { ok: false, error: "proof_store_failed" });
  }
  return json(200, { ok: true, proof });
}
