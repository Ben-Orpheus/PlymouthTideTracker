# Developer Guide — Plymouth AUV Tide Tracker

This document is written for a developer picking up this project. It covers the architecture, the depth math, how the NOAA API is used, and step-by-step instructions for every likely future extension.

---

## Design Philosophy

The app is intentionally simple: plain HTML, CSS, and JavaScript with no build tools, no frameworks, and no backend server. Every file can be opened and edited in any text editor. The NOAA API is called directly from the browser. This keeps the project accessible to anyone on the team, not just developers.

**Do not introduce a build system or framework unless there is a compelling reason.** The simplicity is a feature.

---

## File Reference

| File | Purpose |
|---|---|
| `config.js` | All site-specific configuration. The only file that needs editing for new sites, vehicles, or offset updates. Loaded before app scripts. |
| `index.html` | Daily status page structure. No logic — just the DOM skeleton. |
| `app.js` | All logic for the daily page: NOAA fetch, depth math, window calculation, canvas chart, DOM updates. |
| `week.html` | Weekly planning page structure. |
| `week.js` | All logic for the weekly page: 7-day NOAA fetch, window calculation, timeline bar rendering. |
| `style.css` | Shared styles for both pages. CSS custom properties (variables) at the top control all colors. |
| `.nojekyll` | Empty file. Tells GitHub Pages not to run Jekyll. Required — without it the site 404s. |

---

## Core Concept: The Site Offset

NOAA measures tide height relative to **MLLW (Mean Lower Low Water)** — a datum, not the seafloor. Your boat slip has its own floor depth that sits at some elevation above (or below) MLLW. The offset bridges them:

```
actual_depth_at_slip = NOAA_tide_height + siteOffset
```

Because the slip floor is above MLLW, the offset is negative:
```
siteOffset = measuredDepth − NOAAHeight
           = 5.50 − 7.863
           = −2.36 ft
```

The **minimum NOAA height** needed for a given vehicle becomes:
```
minNOAAHeight = (vehicleDraft + safetyMargin) − siteOffset
              = 3.42 − (−2.36)
              = 5.78 ft
```

The app finds all contiguous 6-minute intervals where `NOAAHeight ≥ minNOAAHeight`. Those are the testing windows.

---

## The NOAA CO-OPS API

Base URL: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`

### Parameters used

| Parameter | Value | Notes |
|---|---|---|
| `station` | `8446166` | Plymouth, MA gauge |
| `product` | `predictions` | Predicted tide (not observed) |
| `datum` | `MLLW` | Datum for heights |
| `time_zone` | `lst_ldt` | Local standard/daylight time |
| `interval` | `6` | 6-minute intervals (240 points/day) |
| `units` | `english` | Feet |
| `format` | `json` | |
| `application` | `PlymouthAUVTideTracker` | Identifies the app to NOAA |

### Response format
```json
{
  "predictions": [
    { "t": "2026-06-04 00:00", "v": "4.234" },
    { "t": "2026-06-04 00:06", "v": "4.312" }
  ]
}
```

### Looking up a historical prediction (for offset calibration)

To find what NOAA predicted at a specific past time, fetch that day's data and look up the nearest 6-minute interval:

```
https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
  ?begin_date=20260603
  &end_date=20260603
  &station=8446166
  &product=predictions
  &datum=MLLW
  &time_zone=lst_ldt
  &interval=6
  &units=english
  &format=json
```

Paste this URL in a browser, then find the entry closest to your measurement time. Interpolate between the two nearest 6-minute marks if needed.

### Finding a NOAA station for a new site

Go to https://tidesandcurrents.noaa.gov/map/ and click the nearest tide gauge to your location. The station ID appears in the URL (e.g. `station=8446166`). Choose a gauge that is the same body of water as your test site — not separated by a causeway or narrow inlet, which can create its own tidal lag.

---

## How to Add a New Testing Site

### Step 1 — Measure the offset

1. Note the exact time you take a depth measurement at the new site.
2. Fetch the NOAA prediction for that time (see above).
3. `siteOffset = measuredDepthFt − NOAAHeightFt`

Take 2–3 measurements at different tide stages if possible and average them.

### Step 2 — Add the site to `config.js`

```javascript
sites: [
  {
    id:              "plymouth_boatyard",
    name:            "Plymouth Boat Yard",
    location:        "Cordage Park, Plymouth, MA",
    noaaStation:     "8446166",
    noaaStationName: "Plymouth, MA",
    siteOffset:      -2.36,
    highWaterMark:   6.667,
    calibrationDate: "2026-06-03",
    active:          true       // ← currently displayed
  },
  {
    id:              "new_site_id",
    name:            "New Site Name",
    location:        "Description, Plymouth, MA",
    noaaStation:     "XXXXXXX",  // ← from NOAA map
    noaaStationName: "Nearest gauge name",
    siteOffset:      -0.00,      // ← your measured offset
    highWaterMark:   0.0,        // ← measured max depth at this site
    calibrationDate: "YYYY-MM-DD",
    active:          false       // ← set to true to switch to this site
  }
]
```

**To activate a site:** set `active: true` on the one you want and `active: false` on the others. The app picks the first site with `active: true`.

### Step 3 — Add a site selector UI (future work)

Currently both pages do:
```javascript
site = CONFIG.sites.find(s => s.active) || CONFIG.sites[0];
```

To let users switch sites in the browser, replace this with a `<select>` dropdown in the settings panel, storing the selected site ID in localStorage. The calculation functions in `app.js` and `week.js` already use the `site` variable throughout — just update `site` when the user switches and call `fetchTideData()` again.

---

## How to Add Multi-Vehicle Support

### Current state

A single global draft (inches) and safety margin (inches) are stored in localStorage and shared between pages. Any user who changes them changes it for everyone on that browser.

### Recommended approach

**Step 1 — Add a vehicles array to `config.js`:**

```javascript
vehicles: [
  { id: "auv_default",  name: "Default AUV",   draftIn: 37, marginIn: 4 },
  { id: "auv_shallow",  name: "Shallow AUV",   draftIn: 24, marginIn: 4 },
  { id: "auv_deep",     name: "Deep AUV",      draftIn: 48, marginIn: 6 }
]
```

**Step 2 — Add a vehicle selector to the settings panel in both `index.html` and `week.html`:**

```html
<div class="setting-item">
  <label for="vehicleSelect">Vehicle</label>
  <select id="vehicleSelect"></select>
</div>
```

**Step 3 — In both `app.js` and `week.js`, populate and respond to the selector:**

```javascript
// Populate dropdown
const sel = document.getElementById('vehicleSelect');
CONFIG.vehicles.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v.id;
  opt.textContent = v.name;
  sel.appendChild(opt);
});

// On change, load that vehicle's settings into draft/margin
sel.addEventListener('change', () => {
  const v = CONFIG.vehicles.find(v => v.id === sel.value);
  if (v) { draft = v.draftIn; margin = v.marginIn; syncUI(); refreshDisplay(); }
});
```

**Step 4 — Persist the selected vehicle ID in localStorage** alongside draft/margin so the choice survives a page reload.

The depth math functions (`minDepthFt()`, `minNoaaHeight()`) require no changes — they already read from `draft` and `margin`.

---

## How to Refine the Site Offset Over Time

The more measurements you take, the more accurate the offset becomes. The recommended workflow:

1. Whenever you're at the slip, note the time and measure water depth.
2. Look up the NOAA prediction for that time (see "Looking up a historical prediction" above).
3. Compute `offset = measured − noaa`.
4. Average all your offset measurements and update `siteOffset` in `config.js`.
5. Commit and push.

If you collect several measurements, you can detect drift — for example, if the slip is silting up, the offset will gradually become less negative over months/years.

A future enhancement would be to store the raw measurement array in `config.js` and have the app compute the average automatically, making updates as simple as adding one line:

```javascript
// Potential future structure in config.js:
calibrationPoints: [
  { date: "2026-06-03", time: "15:45", measuredFt: 5.500, noaaFt: 7.863 },
  { date: "2026-06-10", time: "09:20", measuredFt: 3.750, noaaFt: 6.113 },
  // add rows here — app computes average offset automatically
]
```

The computed offset would then be:
```javascript
siteOffset = average(calibrationPoints.map(p => p.measuredFt - p.noaaFt));
```

---

## Timezone Note

The NOAA API returns times in `lst_ldt` — the station's local time (Eastern time for Plymouth, MA). The app compares these times to the browser's local clock. If someone accesses the site from a significantly different timezone, the "current window" detection could be off.

For a team operating locally in Plymouth, MA, this is never an issue. If remote access becomes important, the fix is to convert `new Date()` to Eastern time before extracting hours/minutes:

```javascript
function nowEasternHHMM() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}
```

Replace the `nowHHMM()` function in both `app.js` and `week.js` with this.

---

## Deployment Workflow

```
Edit files locally
    ↓
git add -A
git commit -m "description"
git push origin main
    ↓
GitHub Actions runs "pages build and deployment" (~1 min)
    ↓
Live at https://ben-orpheus.github.io/PlymouthTideTracker/
```

To monitor the deployment: https://github.com/Ben-Orpheus/PlymouthTideTracker/actions

**Important:** The `.nojekyll` file must remain in the repository root. If it is removed, GitHub Pages will try to run Jekyll and fail.

---

## Future Roadmap

Features that have been discussed but not yet implemented, roughly in order of priority:

1. **Site selector UI** — dropdown to switch between multiple test sites without editing `config.js`
2. **Multi-vehicle selector** — named vehicles with saved drafts, switchable in the browser
3. **Calibration log in `config.js`** — store raw measurements, auto-compute offset average
4. **Per-site calibration history** — each site tracks its own measurement array
5. **Push notifications** — alert team members when a window is opening soon
6. **Tidal current data** — add current speed/direction from NOAA where available
7. **Custom domain** — replace `ben-orpheus.github.io/PlymouthTideTracker/` with a team domain
