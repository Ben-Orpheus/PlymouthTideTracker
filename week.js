// week.js — Plymouth AUV Tide Tracker · Weekly Planning View

'use strict';

let weekData = {};   // { "YYYY-MM-DD": [{t, v}, ...] }
let site   = null;
let draft  = 37;
let margin = 4;

const NOAA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  site = CONFIG.sites.find(s => s.active) || CONFIG.sites[0];
  document.getElementById('siteName').textContent  = `${site.name} · ${site.location}`;
  document.getElementById('stationInfo').textContent =
    `NOAA Station ${site.noaaStation} · ${site.noaaStationName}`;

  loadSettings();
  bindControls();
  tickClock();
  setInterval(tickClock, 15000);
  fetchWeekData();
  setInterval(fetchWeekData, CONFIG.refreshIntervalMs);
});

// ── Clock ─────────────────────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent =
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (Object.keys(weekData).length) renderWeek();
}

// ── Settings (shared with daily page via localStorage) ────────────────────────
function loadSettings() {
  draft  = CONFIG.defaultDraft;
  margin = CONFIG.defaultSafetyMargin;
  syncUI();
}

function saveSettings() {
  // Settings are intentionally not persisted — each load starts from config defaults.
}

function syncUI() {
  document.getElementById('draftNum').value   = draft;
  document.getElementById('draftRange').value = draft;
  document.getElementById('marginNum').value   = margin;
  document.getElementById('marginRange').value = margin;
  const totalIn = draft + margin;
  document.getElementById('minDepthCalc').textContent =
    `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in  (${(totalIn / 12).toFixed(2)} ft)`;
}

function bindControls() {
  function setDraft(v) {
    draft = Math.max(1, Math.min(120, parseInt(v, 10) || CONFIG.defaultDraft));
    syncUI(); saveSettings(); renderWeek();
  }
  function setMargin(v) {
    margin = Math.max(0, Math.min(24, parseInt(v, 10) || 0));
    syncUI(); saveSettings(); renderWeek();
  }
  document.getElementById('draftNum').addEventListener('change',   e => setDraft(e.target.value));
  document.getElementById('draftRange').addEventListener('input',  e => setDraft(e.target.value));
  document.getElementById('marginNum').addEventListener('change',  e => setMargin(e.target.value));
  document.getElementById('marginRange').addEventListener('input', e => setMargin(e.target.value));
}

// ── Calculations ──────────────────────────────────────────────────────────────
function minNoaaHeight() { return (draft + margin) / 12 - site.siteOffset; }

function calcWindows(points) {
  const minH = minNoaaHeight();
  const windows = [];
  let start = null;
  for (const pt of points) {
    const t = pt.t.slice(11);
    if (parseFloat(pt.v) >= minH) {
      if (start === null) start = t;
    } else {
      if (start !== null) { windows.push({ start, end: t }); start = null; }
    }
  }
  if (start !== null) windows.push({ start, end: '23:54' });
  return windows;
}

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtDuration(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
}

// ── NOAA fetch (7 days in one request) ───────────────────────────────────────
async function fetchWeekData() {
  const today = new Date();
  const start = fmtDate(today);
  const end   = fmtDate(addDays(today, 6));
  const url   = `${NOAA_API}?begin_date=${start}&end_date=${end}` +
    `&station=${site.noaaStation}&product=predictions&datum=MLLW` +
    `&time_zone=lst_ldt&interval=6&units=english` +
    `&application=PlymouthAUVTideTracker&format=json`;
  try {
    const json = await fetch(url).then(r => r.json());
    if (json.error) throw new Error(json.error.message);
    weekData = {};
    for (const pt of (json.predictions || [])) {
      const d = pt.t.slice(0, 10);
      (weekData[d] = weekData[d] || []).push(pt);
    }
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('lastUpdated').textContent = `Updated ${t}`;
    document.getElementById('lastUpdated').style.color = '';
    renderWeek();
  } catch (err) {
    document.getElementById('lastUpdated').textContent = `⚠ Fetch failed — ${err.message}`;
    document.getElementById('lastUpdated').style.color = '#ff2d55';
  }
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(date) {
  return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// ── Hourly tick marks (called once, reused for every bar) ────────────────────
function buildTicks() {
  let html = '';
  for (let h = 1; h < 24; h++) {
    const pct   = (h / 24 * 100).toFixed(3);
    const major = h % 3 === 0;
    html += `<div class="tick${major ? ' tick-major' : ''}" style="left:${pct}%"></div>`;
  }
  return html;
}
const TICK_HTML = buildTicks();

// ── Render ────────────────────────────────────────────────────────────────────
function renderWeek() {
  const today    = new Date();
  const todayISO = isoDate(today);
  const nowMins  = today.getHours() * 60 + today.getMinutes();
  const nowPct   = (nowMins / 1440 * 100).toFixed(2);

  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d       = addDays(today, i);
    const iso     = isoDate(d);
    const points  = weekData[iso] || [];
    const windows = points.length ? calcWindows(points) : [];
    const isToday = iso === todayISO;

    // Go-window segments as % positions across the 24-hour bar
    const segs = windows.map(w => {
      const l  = (toMins(w.start) / 1440 * 100).toFixed(2);
      const wd = ((toMins(w.end) - toMins(w.start)) / 1440 * 100).toFixed(2);
      return `<div class="go-seg" style="left:${l}%;width:${wd}%"></div>`;
    }).join('');

    // Summary: list each window's exact time range
    let summary;
    if (!points.length) {
      summary = '<span class="sum-nodata">No data</span>';
    } else if (!windows.length) {
      summary = '<span class="sum-nogo">No windows</span>';
    } else {
      summary = windows.map(w => `<div class="win-range">${w.start} – ${w.end}</div>`).join('');
    }

    rows.push(`
      <div class="week-row${isToday ? ' today' : ''}">
        <div class="day-label">
          <span class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span class="day-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
        <div class="timeline-wrap">
          <div class="timeline-bar">
            ${segs}
            ${TICK_HTML}
            ${isToday ? `<div class="now-line" style="left:${nowPct}%"></div>` : ''}
          </div>
        </div>
        <div class="day-summary">${summary}</div>
      </div>`);
  }

  document.getElementById('weekRows').innerHTML = rows.join('');
}
