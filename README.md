# Plymouth AUV Tide Tracker

A real-time tide status display for AUV (Autonomous Underwater Vehicle) testing operations at Plymouth Boat Yard, Cordage Park, Plymouth, Massachusetts.

**Live site:** https://ben-orpheus.github.io/PlymouthTideTracker/

---

## What It Does

The app pulls live tide predictions from the NOAA CO-OPS API (Station 8446166 — Plymouth, MA), applies a measured depth offset specific to the test slip, and tells your team whether water depth is sufficient to safely deploy a vehicle right now.

**Daily Status page** (`index.html`) — designed for TV display
- Large green / red GO / NO GO indicator
- Current water depth at the test slip
- Clearance above vehicle draft
- Today's full list of open testing windows with times
- 24-hour tide chart color-coded by go / no-go

**Weekly Planning page** (`week.html`) — designed for laptop use
- 7-day horizontal timeline view
- Each day shows a color bar: green = open water, dark = too shallow
- Hourly tick marks for precise time reading
- Exact window times listed per day (e.g. `06:15 – 09:45`)

---

## How Depth Is Calculated

NOAA reports tide heights relative to the MLLW (Mean Lower Low Water) datum — not actual water depth at your slip. A one-time measured **site offset** bridges the gap:

```
depth_at_slip = NOAA_tide_height + siteOffset
```

The offset for the Plymouth Boat Yard slip was measured on 2026-06-03:
- NOAA predicted **7.86 ft** at 15:45
- Actual measured depth was **5.50 ft**
- `siteOffset = 5.50 − 7.86 = −2.36 ft`

Cross-checked against the measured high-water mark (6 ft 8 in) — within 2.2 inches. ✓

---

## Configuration

All site and vehicle parameters live in **`config.js`**. This is the only file that normally needs editing.

### Update the site offset

After taking a new depth measurement, compute:
```
newOffset = measuredDepthFt − noaaPredictedHeightFt
```
Then update `siteOffset` in `config.js`. See `DEVELOPMENT.md` for how to find NOAA's predicted height for a specific past time.

### Change the default vehicle draft

Edit `defaultDraft` (inches) and `defaultSafetyMargin` (inches) in `config.js`. These are the starting values; users can override them in the app and the values persist in their browser via localStorage.

---

## Deploying Updates

1. Edit files locally in `C:\Users\wolfg\Projects\PlymouthTideTracker\`
2. Open Git Bash in that folder and run:
   ```
   git add -A
   git commit -m "describe your change"
   git push origin main
   ```
3. GitHub Pages automatically rebuilds. Live in ~1–2 minutes.

The TV display and all team laptops see the update immediately on next page refresh.

---

## Repository Structure

```
PlymouthTideTracker/
├── index.html        Daily status page (TV display)
├── week.html         Weekly planning page (laptop)
├── app.js            Daily page logic — NOAA fetch, chart, go/no-go
├── week.js           Weekly page logic — 7-day fetch, timeline bars
├── config.js         Site configuration, offsets, vehicle defaults
├── style.css         Shared styles for both pages
├── .nojekyll         Tells GitHub Pages to skip Jekyll processing
├── README.md         This file
├── CHANGELOG.md      Version history
└── DEVELOPMENT.md    Guide for developers extending the project
```

---

## Requirements

None. The app is plain HTML, CSS, and JavaScript — no build tools, no dependencies, no server. It runs entirely in the browser and fetches data directly from the NOAA public API.

The NOAA CO-OPS API is free and requires no authentication.
