// config.js — Plymouth AUV Tide Tracker
// Edit this file to add sites, adjust offsets, or change vehicle defaults.

const CONFIG = {

  // ── Testing sites ───────────────────────────────────────────────────────────
  // Add more sites here as you expand to new locations.
  // Only the first site with active:true is used; site selection coming later.
  sites: [
    {
      id:               "plymouth_boatyard",
      name:             "Plymouth Boat Yard",
      location:         "Cordage Park, Plymouth, MA",
      noaaStation:      "8446166",           // NOAA Plymouth, MA gauge
      noaaStationName:  "Plymouth, MA",

      // ── Measured offset ───────────────────────────────────────────────────
      // Converts NOAA MLLW tide height to actual water depth at this site:
      //   siteDepth = noaaHeight + siteOffset
      //
      // Calibration 2026-06-03:
      //   NOAA predicted 7.863 ft at 15:45 → measured 5.50 ft at slip
      //   siteOffset = 5.50 − 7.863 = −2.36 ft
      //
      // Cross-check: PM high tide (8.847 ft NOAA) → 6 ft 5.8 in predicted
      //              Measured high-water mark: 6 ft 8 in  (Δ = 2.2 in ✓)
      siteOffset:       -2.36,               // feet  — update as more data collected

      highWaterMark:    6.667,               // feet (6 ft 8 in) — measured max depth reference
      calibrationDate:  "2026-06-03",
      active:           true
    }
    // Future sites go here, e.g.:
    // { id: "site_2", name: "...", noaaStation: "...", siteOffset: 0, active: false }
  ],

  // ── Default vehicle settings ────────────────────────────────────────────────
  // Users can adjust these in the app; values persist in localStorage.
  defaultDraft:        37,   // inches
  defaultSafetyMargin: 4,    // inches

  // ── Display ─────────────────────────────────────────────────────────────────
  units: "feet",

  // How often to refresh tide data from NOAA (milliseconds)
  refreshIntervalMs: 5 * 60 * 1000,   // 5 minutes

  // ── Weather conditions ───────────────────────────────────────────────────────
  // Pulls from NOAA Weather.gov API (free, no key required).
  weather: {
    // Coordinates for Plymouth Harbor / Cordage Park
    lat: 41.9584,
    lon: -70.6673,

    // NOAA marine forecast zone covering Cape Cod Bay (Plymouth's body of water)
    // Full zone list: https://www.weather.gov/mtr/MarineZones
    marineZone: 'ANZ232',

    // Sustained wind threshold in knots — at or above this = No-Go
    maxWindKnots: 20,

    // How often to refresh weather data
    refreshIntervalMs: 30 * 60 * 1000,  // 30 minutes

    // Marine alert event names that trigger a No-Go condition.
    // Add or remove entries here to tune which alerts block operations.
    noGoAlerts: [
      'Small Craft Advisory',
      'Special Marine Warning',
      'Gale Warning',
      'Gale Watch',
      'Storm Warning',
      'Storm Watch',
      'Hurricane Warning',
      'Hurricane Watch',
      'Tropical Storm Warning',
      'Tropical Storm Watch',
      'Dense Fog Advisory'
    ]
  }
};
