# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2026-06-04

### Added
- **Weekly Planning tab** (`week.html` / `week.js`) — 7-day horizontal timeline view
- Hourly tick marks on each day's timeline bar (minor every 1 hour, major every 3 hours)
- Exact window time ranges displayed per day (e.g. `06:15 – 09:45`)
- Tab navigation between Daily Status and Weekly Planning pages
- 24-hour axis labels (0, 3, 6, 9, 12, 15, 18, 21, 24)
- Current time marker (white vertical line) on today's bar in weekly view
- All 7 days fetched from NOAA in a single API call for efficiency
- Vehicle settings (draft / margin) shared between pages via localStorage

---

## [1.0.0] — 2026-06-03

### Added
- **Daily Status page** (`index.html`) — live go / no-go indicator for TV display
- Large green / red status light with GO / NO GO label
- Current water depth, required depth, and clearance stats
- Today's testing windows list with start/end times and duration
- 24-hour tide chart (canvas) — green above minimum depth, red below
- Vehicle draft and safety margin settings (adjustable sliders + number inputs)
- Settings persist across page loads via localStorage
- Auto-refresh tide data from NOAA every 5 minutes
- Clock display updated every 15 seconds
- Calibrated site offset for Plymouth Boat Yard test slip: −2.36 ft
  (NOAA 7.86 ft predicted → 5.50 ft measured at 15:45 on 2026-06-03)
- Default vehicle: 37 in draft, 4 in safety margin (41 in / 3.42 ft minimum)
- NOAA Station 8446166 — Plymouth, MA
- Hosted on GitHub Pages: https://ben-orpheus.github.io/PlymouthTideTracker/

### Infrastructure
- `.nojekyll` file added to bypass GitHub Pages Jekyll processing
- Pure static site — no build tools, no frameworks, no backend
