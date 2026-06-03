// app.js — Plymouth AUV Tide Tracker

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let tidePoints = [];    // [{t:"YYYY-MM-DD HH:MM", v:"X.XX"}, ...] from NOAA
let site = null;        // active site from CONFIG
let draft = 37;         // vehicle draft, inches
let margin = 4;         // safety margin, inches

const NOAA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

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
  setInterval(fetchTideData, CONFIG.refreshIntervalMs);
  window.addEventListener('resize', () => { if (tidePoints.length) drawChart(); });
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
}

// ── Calculations ──────────────────────────────────────────────────────────────
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
  const isGo = h !== null && h >= minNoaaHeight();
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
  const abs = Math.abs(ft);
  return `${sign}${abs.toFixed(1)} ft`;
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('clockDisplay').textContent =
      now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false });
    const today = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    document.getElementById('dateDisplay').textContent = today;
    if (tidePoints.length) refreshDisplay();
  }
  tick();
  setInterval(tick, 15000);
}

// ── NOAA Fetch ────────────────────────────────────────────────────────────────
async function fetchTideData() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const url = `${NOAA_API}?begin_date=${d}&end_date=${d}` +
    `&station=${site.noaaStation}&product=predictions&datum=MLLW` +
    `&time_zone=lst_ldt&interval=6&units=english` +
    `&application=PlymouthAUVTideTracker&format=json`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'NOAA API error');
    tidePoints = json.predictions || [];
    const t = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    document.getElementById('lastUpdated').textContent = `Tide data updated ${t}`;
    document.getElementById('lastUpdated').style.color = '';
    refreshDisplay();
    drawChart();
  } catch (err) {
    document.getElementById('lastUpdated').textContent = `⚠ Data fetch failed — ${err.message}`;
    document.getElementById('lastUpdated').style.color = '#ff2d55';
    console.error('NOAA fetch error:', err);
  }
}

// ── Display refresh ───────────────────────────────────────────────────────────
function refreshDisplay() {
  const h = currentNoaaHeight();
  const depth = h !== null ? toSiteDepth(h) : null;
  const minD  = minDepthFt();
  const isGo  = depth !== null && depth >= minD;

  // Status indicator
  const indicator = document.getElementById('statusIndicator');
  const label     = document.getElementById('statusLabel');
  indicator.className = `status-indicator ${isGo ? 'go' : 'nogo'}`;
  label.textContent   = isGo ? 'GO' : 'NO GO';

  // Stats
  document.getElementById('currentDepth').textContent = fmtDepth(depth);
  document.getElementById('requiredDepth').textContent = fmtDepth(minD);

  const clearEl = document.getElementById('clearance');
  if (depth !== null) {
    const c = depth - minD;
    clearEl.textContent = `${c >= 0 ? '+' : ''}${c.toFixed(1)} ft`;
    clearEl.style.color = c >= 0 ? 'var(--go-green)' : 'var(--nogo-red)';
  } else {
    clearEl.textContent = '—';
    clearEl.style.color = '';
  }

  // Next event
  const windows = calcWindows();
  const evt = nextEvent(windows);
  if (evt) {
    document.getElementById('nextEventLabel').textContent = evt.type === 'open' ? 'Opens At' : 'Closes At';
    document.getElementById('nextEvent').textContent = evt.time;
  } else {
    document.getElementById('nextEventLabel').textContent = 'Next Change';
    document.getElementById('nextEvent').textContent = '—';
  }

  // Windows list
  renderWindows(windows);

  // Redraw chart threshold
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

  list.innerHTML = windows.map((w, i) => {
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
  const pw  = W - PAD.left - PAD.right;   // plot width
  const ph  = H - PAD.top  - PAD.bottom;  // plot height

  // Y scale: site depth (ft), always include 0
  const depths = tidePoints.map(p => toSiteDepth(parseFloat(p.v)));
  const maxD = Math.ceil(Math.max(...depths) + 0.5);
  const minD_chart = Math.min(0, Math.floor(Math.min(...depths) - 0.25));
  const rangeD = maxD - minD_chart;

  const threshDepth = minDepthFt();
  const minH = minNoaaHeight();

  function cx(idx) {
    return PAD.left + (idx / (tidePoints.length - 1)) * pw;
  }
  function cy(d) {
    return PAD.top + (1 - (d - minD_chart) / rangeD) * ph;
  }

  const pts = tidePoints.map((p, i) => ({
    x: cx(i),
    y: cy(toSiteDepth(parseFloat(p.v))),
    d: toSiteDepth(parseFloat(p.v))
  }));

  const threshY = cy(threshDepth);
  const zeroY   = cy(0);

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d1120';
  ctx.fillRect(0, 0, W, H);

  // ── Plot background grid ─────────────────────────────────────────────────
  ctx.strokeStyle = '#1a2040';
  ctx.lineWidth = 1;
  // Horizontal grid every 2 ft
  for (let d = Math.ceil(minD_chart); d <= maxD; d += 2) {
    const y = cy(d);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + pw, y); ctx.stroke();
  }
  // Vertical grid every 4 hours
  for (let h = 0; h <= 24; h += 4) {
    const idx = Math.round((h / 24) * (tidePoints.length - 1));
    const x = cx(idx);
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + ph); ctx.stroke();
  }

  // Zero line
  if (minD_chart < 0) {
    ctx.strokeStyle = '#2a3560';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(PAD.left + pw, zeroY); ctx.stroke();
  }

  // ── Tide fill ────────────────────────────────────────────────────────────
  // Red fill: full area
  ctx.beginPath();
  ctx.moveTo(pts[0].x, zeroY);
  pts.forEach(p => ctx.lineTo(p.x, Math.min(p.y, zeroY)));  // clamp to zero
  ctx.lineTo(pts[pts.length - 1].x, zeroY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(192, 40, 60, 0.65)';
  ctx.fill();

  // Green fill: above threshold (clip to threshold area)
  if (threshY > PAD.top) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, pw, threshY - PAD.top);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, zeroY);
    pts.forEach(p => ctx.lineTo(p.x, Math.min(p.y, zeroY)));
    ctx.lineTo(pts[pts.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 190, 100, 0.65)';
    ctx.fill();
    ctx.restore();
  }

  // ── Tide curve line ──────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    // Smooth with bezier
    const prev = pts[i-1], curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── Minimum depth threshold line ─────────────────────────────────────────
  ctx.setLineDash([10, 5]);
  ctx.strokeStyle = '#ffc800';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD.left, threshY); ctx.lineTo(PAD.left + pw, threshY); ctx.stroke();
  ctx.setLineDash([]);

  // Threshold label
  ctx.fillStyle = '#ffc800';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`Min ${threshDepth.toFixed(1)} ft`, PAD.left + 4, threshY - 5);

  // ── Current time marker ──────────────────────────────────────────────────
  const now     = new Date();
  const fracDay = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const nowIdx  = fracDay * (tidePoints.length - 1);
  const nowX    = PAD.left + fracDay * pw;

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nowX, PAD.top); ctx.lineTo(nowX, PAD.top + ph); ctx.stroke();

  // Dot at current depth
  if (nowIdx >= 0 && nowIdx < pts.length) {
    const lo = Math.floor(nowIdx), hi = Math.min(lo + 1, pts.length - 1);
    const t  = nowIdx - lo;
    const curY = pts[lo].y + t * (pts[hi].y - pts[lo].y);
    const curD = pts[lo].d + t * (pts[hi].d - pts[lo].d);
    ctx.beginPath();
    ctx.arc(nowX, curY, 6, 0, Math.PI * 2);
    ctx.fillStyle = curD >= threshDepth ? '#00e87a' : '#ff2d55';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Axes ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#253060';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + ph);
  ctx.lineTo(PAD.left + pw, PAD.top + ph);
  ctx.stroke();

  // Y axis labels (site depth)
  ctx.fillStyle = '#8090c0';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'right';
  for (let d = Math.ceil(minD_chart); d <= maxD; d += 2) {
    ctx.fillText(`${d}`, PAD.left - 6, cy(d) + 4);
  }
  // Y axis title
  ctx.save();
  ctx.fillStyle = '#6070a0';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.translate(13, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Depth (ft)', 0, 0);
  ctx.restore();

  // X axis labels (hours)
  ctx.fillStyle = '#8090c0';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  const hourLabels = {
    0: 'Midnight', 4: '4am', 8: '8am', 12: 'Noon', 16: '4pm', 20: '8pm', 24: ''
  };
  for (const [h, label] of Object.entries(hourLabels)) {
    if (!label) continue;
    const idx = Math.round((h / 24) * (tidePoints.length - 1));
    ctx.fillText(label, cx(idx), H - 10);
  }
}
