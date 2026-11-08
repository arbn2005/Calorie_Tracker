# Calorie Tracker

A private, offline-first calorie and nutrient tracker, dressed as [**The Daily
Label**](./UI.md) — your whole day reads like one nutrition-facts label you fill
in as you eat. Installable as a PWA on your phone, usable on a laptop, with
**no account, no server and no cloud database** — every food you log stays in
your browser's IndexedDB.

See [DESIGN.md](./DESIGN.md) for the data model and product rationale, and
[UI.md](./UI.md) for the design system.

## Features

- **Today** — one hero number (calories eaten), `of N kcal` beside it and
  `N left/over` below, a goal bar (diagonal hatch when you're over — never
  red), macro bars for protein / carbs / fat, meal sections with tap-to-edit
  and swipe-to-delete rows (5-second undo), and a "what you missed" hint tuned
  to your diet type.
- **Add food** — a drag-dismissable bottom sheet, never a page change:
  - *Browse* the bundled food list (Indian, Italian, Western, Chinese) with
    aliases (`curd` finds yogurt), cuisine chips and recent foods; quantity is
    remembered per food.
  - *Scan* a barcode fully on-device (`BarcodeDetector` with a ZXing fallback)
    and look it up on Open Food Facts — results are cached locally, and the
    whole-packet total is shown with its % of your day.
  - *Manual* entry per 100 g with serving and packet weights.
  - *Recipe* builder that sums your ingredients and saves the per-serving
    result as a reusable custom food.
- **Trends** — hand-built SVG/CSS charts only, no chart libraries: week bars
  with a dashed goal line (hatch pattern on over-goal days), a month calendar
  shaded by how full your label is, food-type and meal-timing splits, a
  three-segment macro bar, and a plain-language goal check.
- **Settings** — body stats, goal and diet type, Mifflin-St Jeor BMR → TDEE →
  daily targets with a safety floor, storage quota meter, persistent-storage
  request, JSON/CSV export, JSON import, and a delete-all danger zone.
- **i18n** — English, Tamil and Chinese (`src/i18n/locales/`).
- **PWA** — service worker with precache + Open Food Facts runtime cache,
  Daily Label icons at 192/512 and maskable, standalone display, light/dark
  status-bar theming, fully offline after first load (except unknown barcode
  lookups).

## Stack

Vite · React 19 · TypeScript · Dexie (IndexedDB) · vite-plugin-pwa ·
@zxing/browser (scanner fallback) · self-hosted Barlow Condensed / DM Sans /
IBM Plex Mono.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5199
```

The first visit needs to be online while `public/seed/foods.json` seeds
IndexedDB; after that the app runs fully offline.

Typecheck and production build:

```bash
npm run typecheck
npm run build      # typecheck + bundles into dist/
npm run preview    # serve the production build locally
```

## Testing on a real phone

Camera access (and service workers) require a secure context, which `localhost`
does not satisfy on another device. The dev server therefore runs HTTPS with a
self-signed certificate:

```bash
npm run dev:lan        # https://<your-lan-ip>:5199
npm run preview:lan    # same, for a production build
```

Open the printed `https://…` URL on a phone on the same Wi-Fi, accept the
certificate warning (Advanced → Proceed), and grant the camera permission when
you open the scanner. Vite's console prints the exact network URL.

## Deploying

The build is a static bundle in `dist/` — zero-config on Vercel (framework:
Vite, output: `dist`):

```bash
npx vercel login
npx vercel              # first deploy / preview URL
npx vercel --prod       # production
```

HTTPS on `*.vercel.app` is automatic, so barcode scanning works with no extra
setup. After deploying:

1. Open the URL in mobile Chrome.
2. Menu (⋮) → **Install app** (or Add to Home screen).
3. It launches fullscreen from the home screen with a saffron `0` label icon,
   and keeps working offline — all data stays on that device.

## Privacy

- No analytics, no accounts, no backend: food logs live in IndexedDB on your
  device only.
- The only outgoing requests are barcode lookups against
  [Open Food Facts](https://world.openfoodfacts.org/) (cached in the service
  worker). Fonts are self-hosted, so nothing else leaves the device.
- Use **Settings → Backup** to export JSON (full restore via import) or CSV
  (spreadsheet-friendly). Export regularly; browsers can evict storage, and
  you can request persistent storage from Settings.

## Design system

The UI follows [UI.md](./UI.md) ("The Daily Label") and the token block at the
top of `src/styles.css`:

- Paper/ink palette with a single saffron accent; over-goal is a hatch
  pattern, never red.
- 2px corners, sections separated by rules, no shadows, gradients or rounded
  cards; mobile-first at a 480px max content width.
- Numerals in Barlow Condensed, body in DM Sans, quantities in IBM Plex Mono
  — all self-hosted from `public/fonts/`.

## Project layout

```
src/
  add/          bottom-sheet add flow (browse, scan, quantity, manual, recipe)
  components/   nav, barcode scanner
  db/           Dexie schema, seed + queries and mutations
  i18n/         locale loader + en/ta/zh strings
  lib/          goals math, date utils, quantity memory, misc utils
  screens/      TodayScreen, TrendScreen, SettingsScreen
  styles.css    design tokens + theme (single source of design CSS)
```

## Notes

- The seed list ships ~135+ common dishes; adding foods is a data change in
  `public/seed/foods.json`, no code needed.
- Calorie floor and nutrient targets are common estimates, not medical advice.
- Data is per-device until a sync backend exists (by design — see DESIGN.md).
