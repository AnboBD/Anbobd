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
// - Safe to run twice: re-injects the same values over already-filled slots.
//
// Usage (local test only, with dummy values):
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key \
//   node scripts/inject-supabase-config.mjs
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
  },
  {
    file: "admin/index.html",
    // var SUPABASE_CONFIG = { url: "", anonKey: "" };
    pattern: /var SUPABASE_CONFIG = \{[^}]*\};/,
    replacement: `var SUPABASE_CONFIG = { url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anonKey)} };`,
  },
  {
    file: "seller/index.html",
    pattern: /var SUPABASE_CONFIG = \{[^}]*\};/,
    replacement: `var SUPABASE_CONFIG = { url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anonKey)} };`,
  },
];

for (const { file, pattern, replacement } of targets) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  if (!pattern.test(before)) {
    console.error(`[anbobd] ERROR: config slot not found in ${file} — refusing to deploy disconnected.`);
    process.exit(1);
  }
  writeFileSync(path, before.replace(pattern, replacement));
  console.log(`[anbobd] Injected Supabase config into ${file}`);
}
console.log("[anbobd] Supabase config injected into all 3 panels.");
