/* AnboBD — per-product OG tags (audit P2, 2026-11-24).
   /product?id=<uuid> hits this Edge Function via the vercel.json rewrite.
   It fetches the static product.html, looks the product up in Supabase
   (anon key from Vercel env — NEVER committed), and injects per-product
   og:title / og:description / og:image / og:url + <title> + meta description.
   ANY failure (no id, no env, DB error, product not live) returns the static
   page unchanged — the product page never breaks because of this function. */

export const config = { runtime: "edge" };

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function absImg(u, origin) {
  u = String(u || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === "/") return origin + u;
  return origin + "/" + u;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const headers = { "content-type": "text/html; charset=utf-8" };

  /* Static page first — this is the fallback for every error path. */
  let html;
  try {
    const res = await fetch(new URL("/product-page.html", url));
    if (!res.ok) return new Response("Product page unavailable", { status: 503 });
    html = await res.text();
  } catch (e) {
    return new Response("Product page unavailable", { status: 503 });
  }
  const staticResp = () => new Response(html, { headers });

  try {
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return staticResp();
    const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!supaUrl || !anon) return staticResp();
    const q = supaUrl + "/rest/v1/products?select=name,description,price,image_url,images&id=eq." + encodeURIComponent(id) + "&status=eq.approved";
    const pr = await fetch(q, { headers: { apikey: anon, Authorization: "Bearer " + anon } });
    if (!pr.ok) return staticResp();
    const rows = await pr.json();
    if (!rows || !rows.length || !rows[0]) return staticResp();
    const p = rows[0];
    const name = String(p.name || "AnboBD").trim();
    const desc = String(p.description || name).replace(/\s+/g, " ").trim().slice(0, 160) || name;
    const img = absImg((Array.isArray(p.images) && p.images[0]) || p.image_url || "", url.origin) || (url.origin + "/assets/hero-3d.webp");
    const pageUrl = url.origin + "/product?id=" + encodeURIComponent(id);
    const title = name + " | AnboBD";

    html = html.replace(/<meta property="og:type"[^>]*>/, '<meta property="og:type" content="product" />');
    html = html.replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(title) + '" />');
    html = html.replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(desc) + '" />');
    html = html.replace(/<meta property="og:image"[^>]*>/, '<meta property="og:image" content="' + esc(img) + '" />');
    if (!/property="og:url"/.test(html)) {
      html = html.replace(/<meta property="og:image"[^>]*>/, function (m) { return m + '\n<meta property="og:url" content="' + esc(pageUrl) + '" />'; });
    } else {
      html = html.replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="' + esc(pageUrl) + '" />');
    }
    html = html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + "</title>");
    html = html.replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(desc) + '" />');
    return new Response(html, { headers: { ...headers, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } });
  } catch (e) {
    return staticResp();
  }
}
