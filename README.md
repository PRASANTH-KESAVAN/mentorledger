# MentorLedger

A installable, fully offline PWA for coding trainers to track students, class hours, stipend, and reward coupons — built with plain HTML, CSS and JS. No backend, no build step. All data lives in `localStorage` on the device it's opened on.

## Host it on GitHub Pages

1. Create a new GitHub repository (e.g. `mentorledger`).
2. Upload all files in this folder **as-is, keeping the folder structure**:
   ```
   index.html
   styles.css
   app.js
   manifest.json
   sw.js
   icons/icon-192.png
   icons/icon-512.png
   icons/icon-512-maskable.png
   icons/apple-touch-icon.png
   ```
3. Go to **Settings → Pages** in the repo.
4. Under "Build and deployment", set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
5. Wait a minute, then open the URL GitHub gives you (something like `https://yourusername.github.io/mentorledger/`).

That's it — no other setup needed. Everything runs client-side.

## Install to your phone's home screen

**Android (Chrome):**
Open the link → tap the **⋮** menu → **Add to Home screen** / **Install app**.

**iPhone (Safari):**
Open the link → tap the **Share** icon → **Add to Home Screen**.

Once installed, it opens full-screen like a native app and works with **no internet connection** — the service worker caches the app shell on first visit.

## Using the app

- First launch creates the **admin profile** (pre-filled with the name "Prasanth" — the photo can be changed any time from the profile icon, top right).
- **15 sample students with Tamil Nadu names**, sample classes, and sample coupons are loaded automatically so you can see how everything looks. Reload or wipe them from **Profile → Reload sample data / Erase all data**.
- **Dashboard** — total students trained, hours completed, and how many students passed all 3 / 2 / 1 coding questions (based on each student's best result).
- **Students** (bottom tab) — a **read-only** roster: tap a student to see their hours, class count and class history.
- **Stipend** — ₹100 per 1-hour slot by default, with a running total, monthly breakdown, and a full class-by-class ledger. Read-only.
- **Rewards & Coupons** (bottom tab) — a **read-only** view of Amazon / Flipkart / Meesho / Grocery coupons: code, value, and redeemed status.
- **Admin mode** — turn it on from **Profile → Admin mode** (a switch). This unlocks the **Admin** tab, where you can:
  - Add, edit or delete students
  - Log, edit or delete **classes/slots** — one class is one hour/slot with **up to 15 students** marked together, each with their own questions-passed result (0–3)
  - Add, mark used, or delete reward coupons
  - Change your trainer name and the stipend rate per slot
  Turn the switch off again to go back to the read-only view.
- **Profile** (top-right avatar) — change your photo, toggle Admin mode, switch appearance (auto/light/dark), and export/import a JSON backup of everything.

## Backing up your data

Since data is stored only on the device, use **Profile → Export backup (.json)** occasionally, especially before switching phones or clearing browser data. **Import backup** restores it, on this or any other device/browser.

## Notes

- No external requests are made — fonts and icons are all local/system, so it works with zero connectivity beyond the very first page load.
- Photos are auto-compressed and stored as part of the local data.
- Because storage is per-browser, installing the same link in two different browsers (or two phones) creates two separate, independent datasets — use export/import to move data between them.