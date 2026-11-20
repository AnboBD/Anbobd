# AnboBD — Production Deployment Package

AnboBD is a Bangladeshi e-commerce marketplace (Daraz-style, with a fully
different 3D-style landing page). This repo is a **static site** — three
self-contained HTML pages, no framework, plus one tiny Node script
(`scripts/inject-supabase-config.mjs`) that runs as the Vercel build
command only to inject the Supabase config at deploy time.

## Site structure

| Route | File | What it is |
|---|---|---|
| `/` | `index.html` | Storefront — 3D landing page, search/filters, Flash Sale, vouchers, cart, guest checkout, order tracking |
| `/admin/` | `admin/index.html` | Admin panel — platform owner only. Orders (Admin-confirm first), seller approval + KYC, product moderation, commission, Finance & Payouts, coupons, Mega Sale approval, Returns & Refunds, courier, support, staff, activity log |
| `/seller/` | `seller/index.html` | Seller Center — sellers only. Own shop, products, sub-orders, shop coupons, Mega Sale submissions, wallet/payout requests, returns, team |

The three panels are separate entry points. The storefront's Seller Center /
Admin buttons open role-gated in-page panels; the full panels live at
`/seller/` and `/admin/`.

## Business rules (baked in)

- **Order flow:** customer order → Admin first → Admin confirms and sends it
  to the seller → seller packs/ships/dispatches.
- **Shop coupons:** a seller creates their own coupons; they show on the
  storefront and work only on that seller's items.
- **Mega Sell / Mega Discount:** a seller can submit products, but they go
  live only after Admin approval.
- **Separation:** Admin can approve/pause/remove a seller's coupon but never
  create or edit it; a seller can request a payout but never approve it.

## Demo-free

No demo logins, no prefilled credentials, no hardcoded passwords
(`admin123` / `seller123` / `staff123` — none present), no seeded demo
users, products, orders or coupons. Every account starts empty:

- First open of Admin asks to **create the owner account** (Super Admin).
- Sellers register, submit KYC (NID + trade licence) and wait for Admin
  approval — they stay **Under Review** until approved.
- New customers/sellers start with 0 orders, 0 products, ৳0 wallet.

## Supabase (backend)

One shared Supabase project for all three panels:

- **Project:** AnboBD
- **Project ID:** `qxkgbszrpcmuerrezupx`
- **Region:** Southeast Asia (Singapore, `ap-southeast-1`)
- **URL:** https://qxkgbszrpcmuerrezupx.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/qxkgbszrpcmuerrezupx

11 tables, all with Row Level Security enabled, all starting empty:

`profiles`, `shops`, `products`, `orders`, `sub_orders`, `coupons`,
`mega_submissions`, `payouts`, `returns`, `staff`, `activity_log`

RLS: a seller sees only their own shop's rows, a customer sees only their
own orders, Admin sees all rows (except `profiles`, which is own-row only
because an admin policy on `profiles` would recurse).

Verified live: REST reads of `profiles`, `shops` and `products` all return
empty lists via the anon key in the `apikey` header.

## Supabase config — read this before deploying

Each page has a blank config slot (`ANBOBD_SUPABASE` in the storefront,
`SUPABASE_CONFIG` in Admin and Seller Center) with `url: ""` and
`anonKey: ""`. **Keep it blank in the repo — do not invent or commit a key.**

The anon key must be set as a **Vercel environment variable**:

- `NEXT_PUBLIC_SUPABASE_URL=https://qxkgbszrpcmuerrezupx.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<the legacy anon key from Supabase
  Project Settings > API Keys>`

Use the **legacy anon key** (starts `eyJ…`), not the newer publishable key
and never the **service-role key** — the service-role key must never be in
the browser. See `.env.example` (placeholder only, no real key).

Why a build step exists for a static site: plain HTML cannot read Vercel
env vars on its own, so setting them alone would leave the site
disconnected. `vercel.json` runs
`node scripts/inject-supabase-config.mjs` as the build command; that
script reads the two env vars and writes them into the blank config slots
in the three HTML files, in the build output only. The repo files stay
blank and no key is ever committed. If the env vars are missing, the
script warns and the site deploys with in-browser-only data; if they are
set but a slot is not found, the build fails loudly instead of shipping a
silently disconnected site.

Until the key is wired in, accounts and data live only in the current
browser session (in-memory fallback); the pages say so in their Settings /
footer. After wiring, sign-up/sign-in runs on Supabase Auth and data runs
on Postgres with the RLS rules above.

## Deploy to GitHub + Vercel

```bash
cd anbobd-production
git init
git add .
git commit -m "AnboBD production build"
git branch -M main
git remote add origin https://github.com/<your-username>/anbobd.git
git push -u origin main
```

Then in Vercel (already logged in):

1. **Add New → Project → Import** the `anbobd` GitHub repo.
2. Framework Preset: **Other**. Build Command is read from `vercel.json`:
   `node scripts/inject-supabase-config.mjs` (do not clear it — it is
   what puts the Supabase key into the pages at deploy time).
3. Environment Variables: add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production).
4. **Deploy.** Vercel serves `/`, `/admin/` and `/seller/` from
   `vercel.json` (clean URLs + rewrites).

## Local check

```bash
cd anbobd-production
python3 -m http.server 8000
# open http://localhost:8000/ , /admin/ and /seller/
```

## Still to do before live trading

- Wire the Supabase anon key (above).
- Real payment gateway (bKash / Nagad / Card) — checkout currently offers
  COD, bKash, Nagad and Card as payment choices with no live gateway.
- Custom domain + HTTPS is automatic on Vercel once deployed.
