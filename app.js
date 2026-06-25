// app.js — Plymouth AUV Tide Tracker

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let tidePoints = [];    // [{t:"YYYY-MM-DD HH:MM", v:"X.XX"}, ...] from NOAA
let site       = null;  // active site from CONFIG
let draft      = 38;    // vehicle draft, inches
let margin     = 4;     // safety margin, inches
let wxState    = null;  // current weather (null = not yet loaded)
/*
  wxState = {
    windKnots:     number | null,
    windGustKnots: number | null,
    windDir:       string,
    shortDesc:     string,
    alerts:        [{event, headline}],
    noGoReasons:   string[],   // non-empty = weather is blocking
  }
*/

const NOAA_TIDE_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const WX_API        = 'https://api.weather.gov';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  site = CONFIG.sites.find(s => s.active) || CONFIG.sites[0];
  document.getElementById('siteName').textContent = `${site.name} · ${site.location}`;
  document.getElementById('stationInfo').textContent =
    `NOAA Station ${site.noaaStation} · ${site.noaaStationName}`;

  loadVehicleSettings();
  bindVehicleControls();
  startClock();
  fetchTideData();
  fetchWeather();
  setInterval(fetchTideData, CONFIG.refreshIntervalMs);
  setInterval(fetchWeather,  CONFIG.weather.refreshIntervalMs);
  window.addEventListener('resize', () => { if (tidePoints.length) drawChart(); });

  // Clear the weather grid-point cache on exit so the next session fetches fresh data.
  // Vehicle settings (draft/margin) are intentionally kept.
  window.addEventListener('pagehide', () => {
    try {
      localStorage.removeItem(`wxgrid_${CONFIG.weather.lat}_${CONFIG.weather.lon}`);
    } catch (_) {}
  });
});

// ── Vehicle settings ──────────────────────────────────────────────────────────
function loadVehicleSettings() {
  const saved = JSON.parse(localStorage.getItem('auvSettings') || '{}');
  draft  = saved.draft  ?? CONFIG.defaultDraft;
  margin = saved.margin ?? CONFIG.defaultSafetyMargin;
  syncVehicleUI();
}

function saveVehicleSettings() {
  localStorage.setItem('auvSettings', JSON.stringify({ draft, margin }));
}

function syncVehicleUI() {
  document.getElementById('draftNum').value   = draft;
  document.getElementById('draftRange').value = draft;
  document.getElementById('marginNum').value   = margin;
  document.getElementById('marginRange').value = margin;
  updateMinDepthDisplay();
}

function bindVehicleControls() {
  function setDraft(v) {
    draft = Math.max(1, Math.min(120, parseInt(v, 10) || CONFIG.defaultDraft));
    syncVehicleUI(); saveVehicleSettings(); refreshDisplay();
  }
  function setMargin(v) {
    margin = Math.max(0, Math.min(24, parseInt(v, 10) || 0));
    syncVehicleUI(); saveVehicleSettings(); refreshDisplay();
  }
  document.getElementById('draftNum').addEventListener('change',  e => setDraft(e.target.value));
  document.getElementById('draftRange').addEventListener('input', e => setDraft(e.target.value));
  document.getElementById('marginNum').addEventListener('change',  e => setMargin(e.target.value));
  document.getElementById('marginRange').addEventListener('input', e => setMargin(e.target.value));
}

function updateMinDepthDisplay() {
  const totalIn = draft + margin;
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn % 12;
  document.getElementById('minDepthCalc').textContent =
    `${ft} ft ${inches} in  (${(totalIn / 12).toFixed(2)} ft)`;
  document.getElementById('requiredDepth').textContent = `${(totalIn / 12).toFixed(1)} ft`;
}

// ── Tide calculations ─────────────────────────────────────────────────────────
function minDepthFt()    { return (draft + margin) / 12; }
function minNoaaHeight() { return minDepthFt() - site.siteOffset; }
function toSiteDepth(h)  { return h + site.siteOffset; }

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function currentNoaaHeight() {
  if (!tidePoints.length) return null;
  const hhmm = nowHHMM();
  let best = null;
  for (const pt of tidePoints) {
    if (pt.t.slice(11) <= hhmm) best = parseFloat(pt.v);
    else break;
  }
  return best;
}

function calcWindows() {
  const minH = minNoaaHeight();
  const windows = [];
  let start = null;
  for (const pt of tidePoints) {
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

function nextEvent(windows) {
  const hhmm = nowHHMM();
  const h = currentNoaaHeight();
  const tideOk = h !== null && h >= minNoaaHeight();
  const wxOk   = !wxState || wxState.noGoReasons.length === 0;
  const isGo   = tideOk && wxOk;
  if (isGo) {
    for (const w of windows) {
      if (w.start <= hhmm && w.end > hhmm) return { type: 'close', time: w.end };
    }
  } else {
    for (const w of windows) {
      if (w.start > hhmm) return { type: 'open', time: w.start };
    }
  }
  return null;
}

function fmtDuration(startHHMM, endHHMM) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  let m = (eh * 60 + em) - (sh * 60 + sm);
  if (m < 0) m += 1440;
  return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
}

function fmtDepth(ft) {
  if (ft === null) return '—';
  const sign = ft < 0 ? '−' : '';
  return `${sign}${Math.abs(ft).toFixed(1)} ft`;
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('clockDisplay').textContent =
      now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false });
    const today = now.toLocaleDateString('en-US',
      { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    document.getElementById('dateDisplay').textContent = today;
    if (tidePoints.length) refreshDisplay();
  }
  tick();
  setInterval(tick, 15000);
}

// ── NOAA Tide Fetch ───────────────────────────────────────────────────────────
async function fetchTideData() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const url = `${NOAA_TIDE_API}?begin_date=${d}&end_date=${d}` +
    `&station=${site.noaaStation}&product=predictions&datum=MLLW` +
    `&time_zone=lst_ldt&interval=6&units=english` +
    `&application=PlymouthAUVTideTracker&format=json`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'NOAA API error');
    tidePoints = json.predictions || [];
    const t = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    document.getElementById('lastUpdated').textContent = `Tide data updated ${t}`;
    document.getElementById('lastUpdated').style.color = '';
    refreshDisplay();
    drawChart();
  } catch (err) {
    document.getElementById('lastUpdated').textContent = `⚠ Tide fetch failed — ${err.message}`;
    document.getElementById('lastUpdated').style.color = '#ff2d55';
    console.error('Tide fetch error:', err);
  }
}

// ── NOAA Weather Fetch ────────────────────────────────────────────────────────
async function fetchWeather() {
  const wx = CONFIG.weather;

  document.getElementById('wxWind').textContent = '…';
  document.getElementById('wxGust').textContent = '…';
  document.getElementById('wxCond').textContent = '…';
  document.getElementById('wxAlerts').innerHTML  = '';

  try {
    // Resolve NWS gridpoint for our coordinates.
    // Cached in localStorage for 7 days — avoids a round-trip on every load.
    // No custom headers: adding User-Agent triggers a CORS preflight that NWS rejects.
    const cacheKey = `wxgrid_${wx.lat}_${wx.lon}`;
    let grid = null;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts) < 7 * 24 * 60 * 60 * 1000) {
        grid = cached;
      }
    } catch (_) {}

    if (!grid) {
      const r = await fetch(`${WX_API}/points/${wx.lat},${wx.lon}`);
      if (!r.ok) throw new Error(`Grid lookup failed (${r.status})`);
      const j = await r.json();
      grid = {
        forecastHourly: j.properties.forecastHourly,
        zone:           j.properties.forecastZone.split('/').pop(),
        ts:             Date.now()
      };
      try { localStorage.setItem(cacheKey, JSON.stringify(grid)); } catch (_) {}
    }

    // Fetch alerts and hourly forecast independently — one failure won't block the other
    const [alertResult, hourlyResult] = await Promise.allSettled([
      fetch(`${WX_API}/alerts/active?zone=${grid.zone},${wx.marineZone}`).then(r => r.json()),
      fetch(grid.forecastHourly).then(r => r.json())
    ]);

    const alerts = alertResult.status === 'fulfilled'
      ? (alertResult.value.features || [])
          .map(f => f.properties)
          .filter(p => wx.noGoAlerts.includes(p.event))
      : [];

    let windKnots = null, gustKnots = null, windDir = '—', shortDesc = '—';
    if (hourlyResult.status === 'fulfilled') {
      const period = (hourlyResult.value.properties?.periods || [])[0] || {};
      windKnots = parseMphToKnots(period.windSpeed);
      gustKnots = parseMphToKnots(period.windGust);
      windDir   = period.windDirection || '—';
      shortDesc = period.shortForecast  || '—';
    }

    const noGoReasons = [];
    if (windKnots !== null && windKnots >= wx.maxWindKnots) {
      noGoReasons.push(`Wind ${Math.round(windKnots)} kts (limit ${wx.maxWindKnots} kts)`);
    }
    alerts.forEach(a => noGoReasons.push(a.event));

    wxState = { windKnots, windGustKnots: gustKnots, windDir, shortDesc, alerts, noGoReasons };
    updateWeatherPanel();
    refreshDisplay();

  } catch (err) {
    console.error('Weather fetch error:', err);
    wxState = null;
    document.getElementById('wxWind').textContent = '—';
    document.getElementById('wxGust').textContent = '—';
    document.getElementById('wxCond').textContent = '—';
    document.getElementById('wxAlerts').innerHTML =
      `<span class="wx-error">⚠ ${err.message}</span>`;
  }
}

function parseMphToKnots(str) {
  if (!str) return null;
  const nums = (str.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  return Math.max(...nums) * 0.868976;  // take highest value in ranges like "15 to 20 mph"
}

function updateWeatherPanel() {
  if (!wxState) return;
  const { windKnots, windGustKnots, windDir, shortDesc, alerts, noGoReasons } = wxState;
  const wx = CONFIG.weather;

  // Wind display — color red if at/over limit
  const windEl = document.getElementById('wxWind');
  const windStr = windKnots !== null ? `${Math.round(windKnots)} kts` : '—';
  windEl.textContent = windStr;
  windEl.style.color = (windKnots !== null && windKnots >= wx.maxWindKnots)
    ? 'var(--nogo-red)' : '';

  document.getElementById('wxWindDir').textContent =
    (windDir && windDir !== '—') ? `from ${windDir}` : '—';

  const gustEl = document.getElementById('wxGust');
  gustEl.textContent = windGustKnots !== null
    ? `${Math.round(windGustKnots)} kts`
    : (windKnots !== null ? 'None' : '—');
  gustEl.style.color = '';

  document.getElementById('wxCond').textContent = shortDesc;

  // Alert badges
  const alertsEl = document.getElementById('wxAlerts');
  if (alerts.length === 0) {
    alertsEl.innerHTML = '<span class="wx-clear">No Marine Advisories</span>';
  } else {
    alertsEl.innerHTML = alerts.map(a =>
      `<span class="wx-alert-badge">${a.event}</span>`
    ).join('');
  }
}

// ── Display refresh ───────────────────────────────────────────────────────────
function refreshDisplay() {
  const h     = currentNoaaHeight();
  const depth = h !== null ? toSiteDepth(h) : null;
  const minD  = minDepthFt();

  const tideOk = depth !== null && depth >= minD;
  const wxOk   = !wxState || wxState.noGoReasons.length === 0;
  const isGo   = tideOk && wxOk;

  // ── Status indicator ───────────────────────────────────────────────────────
  document.getElementById('statusIndicator').className =
    `status-indicator ${isGo ? 'go' : 'nogo'}`;
  document.getElementById('statusLabel').textContent = isGo ? 'GO' : 'NO GO';

  // Reason line — only shown when No-Go
  const reasons = [];
  if (!tideOk && depth !== null) reasons.push(`Depth ${fmtDepth(depth)} — below ${fmtDepth(minD)} min`);
  if (!tideOk && depth === null) reasons.push('Tide data loading…');
  if (!wxOk) reasons.push(...wxState.noGoReasons);
  document.getElementById('statusReason').textContent = reasons.join('  ·  ');

  // ── Stats cards ────────────────────────────────────────────────────────────
  document.getElementById('currentDepth').textContent = fmtDepth(depth);

  const clearEl = document.getElementById('clearance');
  if (depth !== null) {
    const c = depth - minD;
    clearEl.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(1)} ft`;
    clearEl.style.color = c >= 0 ? 'var(--go-green)' : 'var(--nogo-red)';
  } else {
    clearEl.textContent = '—';
    clearEl.style.color = '';
  }

  // ── Next event ─────────────────────────────────────────────────────────────
  const windows = calcWindows();
  const evt = nextEvent(windows);
  if (evt) {
    document.getElementById('nextEventLabel').textContent = evt.type === 'open' ? 'Opens At' : 'Closes At';
    document.getElementById('nextEvent').textContent = evt.time;
  } else {
    document.getElementById('nextEventLabel').textContent = 'Next Change';
    document.getElementById('nextEvent').textContent = '—';
  }

  renderWindows(windows);
  drawChart();
}

function renderWindows(windows) {
  const list = document.getElementById('windowsList');
  const hhmm = nowHHMM();

  if (!tidePoints.length) {
    list.innerHTML = '<div class="msg loading">Fetching tide data from NOAA…</div>';
    return;
  }
  if (!windows.length) {
    list.innerHTML = '<div class="msg no-windows">No testing windows today — tide stays below minimum depth</div>';
    return;
  }

  list.innerHTML = windows.map(w => {
    const isCurrent = w.start <= hhmm && w.end > hhmm;
    const isPast    = w.end <= hhmm;
    const duration  = fmtDuration(w.start, w.end);
    return `
      <div class="window-row${isCurrent ? ' current' : ''}${isPast ? ' past' : ''}">
        <div class="window-dot"></div>
        <div class="window-times">${w.start}<span class="sep">—</span>${w.end}</div>
        <div class="window-dur">${duration}</div>
        ${isCurrent ? '<div class="badge-now">NOW</div>' : ''}
      </div>`;
  }).join('');
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function drawChart() {
  if (!tidePoints.length) return;

  const canvas = document.getElementById('tideChart');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.clientWidth;
  const H      = canvas.clientHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD = { top: 16, right: 20, bottom: 42, left: 54 };
  const pw  = W - PAD.left - PAD.right;
  const ph  = H - PAD.top  - PAD.bottom;

  const depths = tidePoints.map(p => toSiteDepth(parseFloat(p.v)));
  const maxD = Math.ceil(Math.max(...depths) + 0.5);
  const minD_chart = Math.min(0, Math.floor(Math.min(...depths) - 0.25));
  const rangeD = maxD - minD_chart;

  const threshDepth = minDepthFt();

  function cx(idx) { return PAD.left + (idx / (tidePoints.length - 1)) * pw; }
  function cy(d)   { return PAD.top  + (1 - (d - minD_chart) / rangeD) * ph; }

  const pts = tidePoints.map((p, i) => ({
    x: cx(i),
    y: cy(toSiteDepth(parseFloat(p.v))),
    d: toSiteDepth(parseFloat(p.v))
  }));

  const threshY = cy(threshDepth);
  const zeroY   = cy(0);

  ctx.fillStyle = '#0d1120';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#1a2040';
  ctx.lineWidth = 1;
  for (let d = Math.ceil(minD_chart); d <= maxD; d += 2) {
    const y = cy(d);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + pw, y); ctx.stroke();
  }
  for (let h = 0; h <= 24; h += 4) {
    const x = cx(Math.round((h / 24) * (tidePoints.length - 1)));
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + ph); ctx.stroke();
  }
  if (minD_chart < 0) {
    ctx.strokeStyle = '#2a3560'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(PAD.left + pw, zeroY); ctx.stroke();
  }

  // Red fill
  ctx.beginPath();
  ctx.moveTo(pts[0].x, zeroY);
  pts.forEach(p => ctx.lineTo(p.x, Math.min(p.y, zeroY)));
  ctx.lineTo(pts[pts.length-1].x, zeroY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(192, 40, 60, 0.65)';
  ctx.fill();

  // Green fill (above threshold)
  if (threshY > PAD.top) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, pw, threshY - PAD.top);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, zeroY);
    pts.forEach(p => ctx.lineTo(p.x, Math.min(p.y, zeroY)));
    ctx.lineTo(pts[pts.length-1].x, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 190, 100, 0.65)';
    ctx.fill();
    ctx.restore();
  }

  // Tide curve
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i-1], curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Threshold line
  ctx.setLineDash([10, 5]);
  ctx.strokeStyle = '#ffc800'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD.left, threshY); ctx.lineTo(PAD.left + pw, threshY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffc800'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`Min ${threshDepth.toFixed(1)} ft`, PAD.left + 4, threshY - 5);

  // Current time marker
  const now     = new Date();
  const fracDay = (now.getHours() * 60 + now.getMinutes()) / 1440;
  const nowX    = PAD.left + fracDay * pw;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nowX, PAD.top); ctx.lineTo(nowX, PAD.top + ph); ctx.stroke();

  const nowIdx = fracDay * (tidePoints.length - 1);
  if (nowIdx >= 0 && nowIdx < pts.length) {
    const lo = Math.floor(nowIdx), hi = Math.min(lo + 1, pts.length - 1);
    const t  = nowIdx - lo;
    const curY = pts[lo].y + t * (pts[hi].y - pts[lo].y);
    const curD = pts[lo].d + t * (pts[hi].d - pts[lo].d);
    ctx.beginPath();
    ctx.arc(nowX, curY, 6, 0, Math.PI * 2);
    ctx.fillStyle = curD >= threshDepth ? '#00e87a' : '#ff2d55';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#253060'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + ph);
  ctx.lineTo(PAD.left + pw, PAD.top + ph); ctx.stroke();

  ctx.fillStyle = '#8090c0'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
  for (let d = Math.ceil(minD_chart); d <= maxD; d += 2)
    ctx.fillText(`${d}`, PAD.left - 6, cy(d) + 4);

  ctx.save();
  ctx.fillStyle = '#6070a0'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
  ctx.translate(13, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('Depth (ft)', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#8090c0'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
  const hourLabels = { 0:'Midnight', 4:'4am', 8:'8am', 12:'Noon', 16:'4pm', 20:'8pm' };
  for (const [h, label] of Object.entries(hourLabels)) {
    const x = cx(Math.round((h / 24) * (tidePoints.length - 1)));
    ctx.fillText(label, x, H - 10);
  }
}
