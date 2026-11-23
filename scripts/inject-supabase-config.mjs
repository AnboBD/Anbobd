// AnboBD deploy-time config injection.
//
// The three panels are plain static HTML with no framework and no build
// step of their own, so a Vercel environment variable alone never reaches
// the browser — nothing in the HTML reads process.env. This script is the
// missing link: Vercel runs it as the build command (see vercel.json),
// it reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
// the environment and writes them into the blank config slots in the
// three HTML files, in the build output only. Nothing is committed to
// Git: the repo files stay blank, and the key never appears in git history.
//
// - Env vars missing: prints a warning and exits 0, leaving the slots
//   blank (site still deploys, with in-browser-only accounts/data).
// - Env vars present but a slot pattern is not found: exits 1 so the
//   deploy fails loudly instead of shipping a silently disconnected site.
//   Exception: the storefront (index.html) no longer carries the plain
//   `var ANBOBD_SUPABASE = {...};` slot — its script reads a pre-set
//   window.ANBOBD_SUPABASE instead — so when that slot is absent the
//   filled config is injected as an early <script> right after <head>.
//   The standalone product page (product.html) works the same way.
// - Safe to run twice: re-injects the same values over already-filled slots.
//
// Usage (local test only, with dummy values):
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key \
//   node scripts/inject-supabase-config.mjs
//
// 2026-11-21: product.html target added (standalone product detail page,
// /product.html?id=<uuid>) — mirrors the index.html entry: same IIFE that
// reads a pre-set window.ANBOBD_SUPABASE, same early <script> fallback.
// Deploy this file to the repo at scripts/inject-supabase-config.mjs
// together with product.html, or product.html will ship unconfigured
// (it then shows "এই পণ্যটি এখন লাইভ নেই" instead of the product).
//
// 2026-11-23: shop.html target added (shop pages, /shop and
// /shop?id=<uuid>) — mirrors the product.html entry: same IIFE that
// reads a pre-set window.ANBOBD_SUPABASE, same early <script> fallback.
// Deploy together with shop.html, or shop pages will ship unconfigured
// (they then show "এই দোকানটি পাওয়া যায়নি" instead of the shop).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!url || !anonKey) {
  console.warn(
    "[anbobd] Supabase env vars not set — leaving config slots blank. " +
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel " +
    "to connect the deployed site to Supabase."
  );
  process.exit(0);
}

const targets = [
  {
    file: "index.html",
    // var ANBOBD_SUPABASE = { url:"", anonKey:"", configured:false };
    pattern: /var ANBOBD_SUPABASE = \{[^}]*\};/,
    replacement: `var ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };`,
    // The current storefront reads a pre-set window.ANBOBD_SUPABASE (see
    // the IIFE at the top of its script) instead of carrying the plain
    // slot above, so when the slot is absent inject the filled config
    // as an early <script> right after <head>, before any panel script runs.
    early: `<script>window.ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };</script>`,
  },
  {
    // 2026-11-21: standalone product detail page — same pattern as the
    // storefront: its IIFE reads a pre-set window.ANBOBD_SUPABASE, so
    // the early <script> after <head> is what fills it at build time.
    file: "product.html",
    pattern: /var ANBOBD_SUPABASE = \{[^}]*\};/,
    replacement: `var ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };`,
    early: `<script>window.ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };</script>`,
  },
  {
    // 2026-11-23: shop pages — same pattern as product.html: its IIFE
    // reads a pre-set window.ANBOBD_SUPABASE, so the early <script>
    // after <head> is what fills it at build time.
    file: "shop.html",
    pattern: /var ANBOBD_SUPABASE = \{[^}]*\};/,
    replacement: `var ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };`,
    early: `<script>window.ANBOBD_SUPABASE = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)}, configured:true };</script>`,
  },
  {
    file: "admin/index.html",
    // var SUPABASE_CONFIG = { url: "", anonKey: "" };
    pattern: /var SUPABASE_CONFIG = \{[^}]*\};/,
    replacement: `var SUPABASE_CONFIG = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)} };`,
  },
  {
    file: "seller/index.html",
    pattern: /var SUPABASE_CONFIG = \{[^}]*\};/,
    replacement: `var SUPABASE_CONFIG = { url:${JSON.stringify(url)}, anonKey:${JSON.stringify(anonKey)} };`,
  },
];


// Info/policy pages (pages/*.html): same SUPABASE_CONFIG slot, so an Admin
// edit in site_pages can override each page's built-in text at load time.
const pageSlugs = ["return-refund", "delivery", "warranty", "privacy", "contact", "about", "terms", "career", "help"];
for (const slug of pageSlugs) {
  targets.push({
    file: "pages/" + slug + ".html",
    pattern: /var SUPABASE_CONFIG = \{[^}]*\};/,
    replacement: `var SUPABASE_CONFIG = { url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anonKey)} };`,
  });
}

for (const { file, pattern, replacement, early } of targets) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  if (pattern.test(before)) {
    writeFileSync(path, before.replace(pattern, replacement));
    console.log(`[anbobd] Injected Supabase config into ${file}`);
    continue;
  }
  if (early) {
    if (before.includes(early)) {
      // Already injected on an earlier run; nothing to do.
      console.log(`[anbobd] Supabase config already injected into ${file}`);
      continue;
    }
    const head = before.match(/<head[^>]*>/i);
    if (!head) {
      console.error(`[anbobd] ERROR: config slot not found in ${file} — refusing to deploy disconnected.`);
      process.exit(1);
    }
    writeFileSync(path, before.replace(/<head[^>]*>/i, (m) => m + "\n" + early));
    console.log(`[anbobd] Injected Supabase config into ${file} (early <script> after <head>; no plain slot present)`);
    continue;
  }
  console.error(`[anbobd] ERROR: config slot not found in ${file} — refusing to deploy disconnected.`);
  process.exit(1);
}
console.log("[anbobd] Supabase config injected into all panels and pages.");
