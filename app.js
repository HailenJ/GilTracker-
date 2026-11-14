(async () => {
'use strict';
// ================= data files =================
// Game data and the strategy pack live in /data so each can update on its own (the game data nightly via GitHub Actions).
async function loadJSON(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
let D, STRAT;
try { [D, STRAT] = await Promise.all([loadJSON('data/game.json'), loadJSON('data/strategies.json').catch(() => ({ plays: [], sources: {}, events: [] }))]); }
catch (e) { document.getElementById('boot').innerHTML = '<p>Couldn’t load game data. Check your connection and reload.</p>'; return; }
document.getElementById('boot').remove();
const ICONS = D.i || {};
const NAMES = D.n, MARK = new Set(D.m), CATS = D.c, GALL = D.gf || {}, GATH = D.g, BOOKS = D.b, WORLDS = D.w || {};
// Gathering entries: [jobs bitmask, level, expansions bitmask, zones, timed windows, has regular nodes, locked flags].
// locked: 1 = only on legendary nodes (needs a folklore tome bought with gatherer scrips), 2 = needs a quest.
const isLocked = g => !!(g && g[6]) && !S.folk;
// Can *you* gather this right now (level, zone reached by your story, not locked)?
function canGather(id) {
  const g = GALL[id]; if (!g) return false;
  if (g[3] && !S.folk) return false;
  if (!(g[2] & exMask())) return false;
  return GJOBS.some(([, , bit], i) => (g[0] & bit) && S.gOn[i] && g[1] <= (+S.gLv[i] || 0));
}
// Vendor items: [price, expansions where an NPC sells it (bitmask, 0 = unknown), needs an unlock, [[npc, place], ...]].
// Items sold only by seasonal-event shops are excluded when the data is built.
const VINFO = {}; const VEND = {};
Object.entries(D.v || {}).forEach(([k, v]) => { if (Array.isArray(v)) { VINFO[k] = v; VEND[k] = v[0]; } else { VEND[k] = v; VINFO[k] = [v, 0, 0, []]; } });
const vendorOk = id => { const v = VINFO[id]; return !!v && !v[2] && !!(v[1] & exMask()); }; // reachable, no unlock needed
const vendorWhere = id => { const v = VINFO[id]; return v && v[3] && v[3].length ? v[3].map(([n, p]) => `${n} (${p})`).join(' or ') : ''; };
const WORLD_ID = {}; Object.entries(WORLDS).forEach(([id, n]) => WORLD_ID[n.toLowerCase()] = +id);
// recipe tuple: [rid, ct, lvl, stars, res, amt, canHq, book, spec, ui, ing, group, sellable, reqCms, reqCtl, sugCms]
const JOBS = ['CRP','BSM','ARM','GSM','LTW','WVR','ALC','CUL'];
const JOBNAMES = ['Carpenter','Blacksmith','Armorer','Goldsmith','Leatherworker','Weaver','Alchemist','Culinarian'];
const GJOBS = [['MIN','Miner',1],['BTN','Botanist',2],['FSH','Fisher',4]];
const EXP = ['A Realm Reborn','Heavensward','Stormblood','Shadowbringers','Endwalker','Dawntrail'];
const EXS = ['ARR','HW','SB','ShB','EW','DT'];
const $ = id => document.getElementById(id);
const nm = id => NAMES[id] || ('Item ' + id);
const fmt = n => (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString();
const fmtK = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e4) return s + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return s + Math.round(a).toLocaleString();
};
// Item icons are hotlinked from XIVAPI's asset service (it supports hotlinking and caches with ETags).
function iconUrl(id) {
  const ic = ICONS[id]; if (!ic) return '';
  const pad = n => String(n).padStart(6, '0');
  return `https://v2.xivapi.com/api/asset?path=ui/icon/${pad(Math.floor(ic / 1000) * 1000)}/${pad(ic)}_hr1.tex&format=webp`;
}
const iconImg = (id, cls = 'ico') => { const u = iconUrl(id); return u ? `<img class="${cls}" src="${u}" alt="" loading="lazy" decoding="async" width="40" height="40" onerror="this.style.visibility='hidden'">` : `<span class="${cls} noico"></span>`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ago = ms => {
  if (!ms) return 'never';
  const h = (Date.now() - ms) / 3600000;
  if (h < 1) return 'under an hour ago';
  if (h < 48) return Math.round(h) + 'h ago';
  return Math.round(h / 24) + ' days ago';
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

// indexes
const BY_RESULT = new Map(); D.r.forEach(r => { const a = BY_RESULT.get(r[4]) || []; a.push(r); BY_RESULT.set(r[4], a); });
const BY_RID = new Map(D.r.map(r => [r[0], r]));
const MARK_NAMES = D.m.filter(id => NAMES[id]).map(id => [id, NAMES[id].toLowerCase()]);

// ================= settings & prefs =================
const SK = 'gl3-settings', PK = 'gl3-prefs';
const DEF = {
  world: 'Exodus', dc: 'Primal', jobLv: [80,80,80,80,80,80,80,80], jobOn: [1,1,1,1,1,1,1,1],
  gLv: [97,96,100], gOn: [1,1,1], ex: [1,1,1,0,0,0], cms: 0, ctl: 0, books: [],
  retainers: 2, retNames: '', taxBuy: 5, taxSell: 5, hq: true, stars: false,
  theme: 'system', hideOdd: true, msq: 4, souls: [0, 6, 7], gcRank: 9, folk: false, combatLv: 0, cdw: null, chk: null, ucLog: [], queue: null, alerts: {}, inv: {}, myL: {}, compPrev: {}, pace: { craft: 1.0, gather: 0.3, fish: 1.5, trip: 5, npc: 2 }, curCh: 'purpleC', lastPlan: 0, watch: [], listed: [], goal: 16000000, gilLog: [], sales: [], batch: [],
};
const DEFP = {
  tab: 'best', craftMode: 'sell', gatherMode: 'sell', scripGoal: 1500, autoWatch: false, craftChips: ['craftgear'], craftQ: '', craftSort: 'daily', craftMinVel: 0.5, craftMinLvl: 50, craftMaxSupply: 0,
  craftSub: true, craftGatherFree: false, craftStatsOnly: false, craftShowAll: false,
  gatherChips: ['MIN','BTN','FSH'], gatherQ: '', gatherSort: 'daily', gatherMinVel: 0.5, gatherTimed: false, gatherZones: true, gatherMaxSupply: 0,
  flipMode: 'vendor', flipQ: '', sessMin: 60, sessBudget: 500000, flipSort: 'daily', flipMinRoi: 20, budget: 1000000, maxItems: 20,
};
let S = Object.assign({}, DEF, store.get(SK) || {});
let P = Object.assign({}, DEFP, store.get(PK) || {});
if (!store.get(SK)) { // carry over the previous version's settings
  const old = store.get('gil-ledger-settings-v2');
  if (old) {
    if (old.world) S.world = old.world; if (old.dc) S.dc = old.dc;
    if (Array.isArray(old.jobLv)) S.jobLv = old.jobLv.map(v => +v || 80);
    if (old.taxBuy != null) S.taxBuy = +old.taxBuy; if (old.taxSell != null) S.taxSell = +old.taxSell;
    if (old.hq != null) S.hq = !!old.hq; if (old.stars != null) S.stars = !!old.stars;
  }
}
const saveS = () => store.set(SK, S);
const saveP = () => store.set(PK, P);
const taxB = () => 1 + (+S.taxBuy || 0) / 100;
const taxS = () => 1 - (+S.taxSell || 0) / 100;
const lvls = () => JOBS.map((_, i) => S.jobOn[i] ? (+S.jobLv[i] || 0) : -1);
const MSQ = ['A Realm Reborn: in progress', 'A Realm Reborn: finished', 'Heavensward: in progress', 'Heavensward: finished', 'Stormblood: in progress', 'Stormblood: finished',
  'Shadowbringers: in progress', 'Shadowbringers: finished', 'Endwalker: in progress', 'Endwalker: finished', 'Dawntrail: in progress', 'Dawntrail: finished'];
const msqStage = () => (S.msq == null ? 4 : +S.msq);
const msqEx = () => Math.floor(msqStage() / 2);                 // newest expansion whose zones you can reach
const exMask = () => { let m = 0; for (let i = 0; i <= msqEx(); i++) m |= 1 << i; return m; };
const expDone = e => msqStage() >= 2 * e + 1;                    // finished that expansion's story
const expStarted = e => msqStage() >= 2 * e;
const retainerSet = () => new Set(String(S.retNames || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

// ================= tabs =================
const TABS = ['best','crafts','gather','flips','watch','goal'];
function showTab(t) {
  P.tab = t; saveP();
  TABS.forEach(x => { $('tab-' + x).setAttribute('aria-selected', String(x === t)); $('v-' + x).hidden = x !== t; });
  $('batchFab').hidden = !(t === 'crafts' && batch.size);
  if (t === 'goal') renderGoal();
  if (t === 'watch') renderWatch();
  if (typeof dirty !== 'undefined') renderIfDirty(t);
  const v = $('v-' + t); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  window.scrollTo({ top: 0 });
}
TABS.forEach(t => $('tab-' + t).addEventListener('click', () => showTab(t)));
document.querySelector('.tabs').addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = TABS.indexOf(P.tab), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
  showTab(TABS[n]); $('tab-' + TABS[n]).focus();
});
function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'dark' || S.theme === 'light') r.dataset.theme = S.theme; else delete r.dataset.theme;
  const dark = S.theme === 'dark' || (S.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0d1226' : '#f3f5fa');
}
function updatePill() { $('wherePill').textContent = `${S.world} · ${S.dc}`; }

// ================= Universalis =================
const STAT = ['averagePriceNQ','averagePriceHQ','averagePrice','minPriceNQ','minPriceHQ','minPrice','nqSaleVelocity','hqSaleVelocity','regularSaleVelocity','unitsForSale','lastUploadTime'];
const SHORT = { averagePriceNQ: 'aN', averagePriceHQ: 'aH', averagePrice: 'a', minPriceNQ: 'mN', minPriceHQ: 'mH', minPrice: 'm', nqSaleVelocity: 'vN', hqSaleVelocity: 'vH', regularSaleVelocity: 'v', unitsForSale: 'u', lastUploadTime: 't' };
async function fetchMarket(scope, ids, { listings = 0, entries = 200, listingFields = null, onBatch = () => {}, chunk = 50 } = {}) {
  const out = {};
  const fields = STAT.map(f => 'items.' + f).concat((listingFields || []).map(f => 'items.listings.' + f)).join(',');
  const queue = [];
  for (let i = 0; i < ids.length; i += chunk) {
    let b = ids.slice(i, i + chunk);
    if (b.length === 1) b = b[0] === 2 ? [2, 3] : [b[0], 2]; // keep the multi-item response shape
    queue.push(b);
  }
  const total = queue.length; let failed = 0, badScope = false, lastMsg = '';
  async function getBatch(b) {
    const url = `https://universalis.app/api/v2/${encodeURIComponent(scope)}/${b.join(',')}?listings=${listings}&entries=${entries}&fields=${fields}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(Math.min(8000, 1000 * Math.pow(1.8, attempt)) + Math.random() * 400);
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 404 || res.status === 400) { badScope = true; return null; }
        if (!res.ok) { lastMsg = 'error ' + res.status; continue; }
        return await res.json();
      } catch (e) { lastMsg = e.message || 'network error'; }
    }
    return null;
  }
  async function worker() {
    while (queue.length && !badScope) {
      const b = queue.shift();
      const j = await getBatch(b);
      if (badScope) break;
      if (!j) failed++;
      else for (const [id, v] of Object.entries(j.items || {})) {
        const o = {};
        STAT.forEach(k => { if (v[k]) o[SHORT[k]] = v[k]; });
        if (listingFields && Array.isArray(v.listings)) o.L = v.listings.map(l => [l.pricePerUnit, l.hq ? 1 : 0, l.quantity, l.worldName || l.retainerName || '', Array.isArray(l.materia) ? l.materia.length : 0]);
        out[id] = o;
      }
      onBatch();
      await sleep(250);
    }
  }
  await Promise.all([worker(), worker()]);
  if (badScope) throw new Error(`Universalis doesn’t recognise “${scope}”. Check the world and data center in Settings.`);
  if (failed && failed >= total) throw new Error('Couldn’t reach Universalis. It may be busy; wait a minute and try again.' + (lastMsg ? ' (' + lastMsg + ')' : ''));
  Object.defineProperty(out, '_failed', { value: failed, enumerable: false });
  return out;
}
// Aggregated endpoint: cached on Universalis's side, so it's much faster than the full market endpoint.
const homeId = () => WORLD_ID[String(S.world).toLowerCase()] || 0;
const msTime = v => !v ? 0 : v < 1e12 ? v * 1000 : v;
async function fetchAgg(ids, onBatch = () => {}) {
  const out = {}, queue = [];
  for (let i = 0; i < ids.length; i += 100) queue.push(ids.slice(i, i + 100));
  const total = queue.length, home = homeId(); let failed = 0, badScope = false, lastMsg = '';
  const g = (o, ...p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
  async function getBatch(b) {
    const url = `https://universalis.app/api/v2/aggregated/${encodeURIComponent(S.world)}/${b.join(',')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(Math.min(8000, 900 * Math.pow(1.8, attempt)) + Math.random() * 300);
      try {
        const res = await fetch(url);
        if (res.status === 404 || res.status === 400) { badScope = true; return null; }
        if (!res.ok) { lastMsg = 'error ' + res.status; continue; }
        return await res.json();
      } catch (e) { lastMsg = e.message || 'network error'; }
    }
    return null;
  }
  async function worker() {
    while (queue.length && !badScope) {
      const j = await getBatch(queue.shift());
      if (badScope) break;
      if (!j) failed++;
      else for (const r of j.results || []) {
        const o = {};
        const put = (k, v) => { if (v) o[k] = v; };
        for (const [q, s] of [['nq', 'N'], ['hq', 'H']]) {
          const x = r[q]; if (!x) continue;
          put('m' + s, g(x, 'minListing', 'world', 'price'));
          put('x' + s, g(x, 'minListing', 'dc', 'price'));
          put('w' + s, g(x, 'minListing', 'dc', 'worldId'));
          put('a' + s, g(x, 'averageSalePrice', 'world', 'price'));
          put('v' + s, g(x, 'dailySaleVelocity', 'world', 'quantity'));
          put('r' + s, g(x, 'recentPurchase', 'world', 'price'));
          put('d' + s, g(x, 'averageSalePrice', 'dc', 'price'));
          put('g' + s, g(x, 'averageSalePrice', 'region', 'price'));
        }
        const ups = r.worldUploadTimes || [];
        const mine = ups.find(u => u.worldId === home);
        put('t', msTime(mine ? mine.timestamp : ups.reduce((m, u) => Math.max(m, u.timestamp || 0), 0)));
        out[r.itemId] = o;
      }
      onBatch();
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (badScope) throw new Error(`Universalis doesn’t recognise “${S.world}”. Check your world in Settings.`);
  if (failed && failed >= total) throw new Error('Couldn’t reach Universalis. It may be busy; wait a minute and try again.' + (lastMsg ? ' (' + lastMsg + ')' : ''));
  Object.defineProperty(out, '_failed', { value: failed, enumerable: false });
  return out;
}
async function fetchHistory(id) {
  const url = `https://universalis.app/api/v2/history/${encodeURIComponent(S.world)}/${id}?entriesToReturn=999&entriesWithin=2592000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('history ' + res.status);
  const j = await res.json();
  return (j.entries || []).map(e => [e.pricePerUnit, e.hq ? 1 : 0, e.quantity, e.timestamp]);
}
// stats for a quality
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Fair price = the middle of several independent estimates (this world's average and last sale,
// the data center's and region's averages), so one freak sale or one silly listing can't drag it.
function stat(p, hq) {
  p = p || {};
  const q = hq ? 'H' : 'N';
  const avg = p['a' + q] || 0, min = p['m' + q] || 0, vel = p['v' + q] || 0;
  const last = p['r' + q] || 0, dcAvg = p['d' + q] || 0, regAvg = p['g' + q] || 0;
  const refs = [avg, last, dcAvg, regAvg].filter(v => v > 0);
  const wide = median([dcAvg, regAvg].filter(v => v > 0));
  const spike = !!(avg && wide && avg > wide * 2.5);       // this world's recent average is way above the wider market
  const fair = spike ? wide : median(refs);                // on a spike, trust the wider market instead
  const inflated = !!(min && fair && min > fair * 3);      // cheapest listing is far above what it actually sells for
  const noSales = !refs.length;
  const price = noSales ? 0 : (min && !inflated ? Math.min(fair, min) : fair);
  const units = p.u == null ? null : p.u;
  const supply = units == null ? null : vel > 0 ? units / vel : (units > 0 ? Infinity : 0);
  const stale = p.t ? (Date.now() - p.t) > 72 * 3600000 : true;
  return { avg, min, vel, price, fair, last, dcAvg, regAvg, spike, inflated, noSales, units, supply, t: p.t || 0, stale };
}
const suspicious = s => s.spike || s.noSales;
const nrefsOf = s => [s.avg, s.last, s.dcAvg, s.regAvg].filter(v => v > 0).length;
function suggest(s) {
  if (s.inflated || (!s.min && s.fair)) return s.fair ? { price: Math.round(s.fair), dip: false, inflated: s.inflated } : null;
  if (!s.min && !s.avg) return null;
  const price = s.min ? Math.max(1, s.min - 1) : Math.round(s.avg);
  const dip = s.min && s.avg && s.min < s.avg * 0.7;
  return { price, dip };
}
function progressFor(prefix) {
  let total = 1, done = 0;
  return {
    start(t, msg) { total = Math.max(1, t); done = 0; $(prefix + 'Prog').style.width = '0'; status(prefix, msg); },
    tick() { done++; $(prefix + 'Prog').style.width = Math.min(100, 100 * done / total) + '%'; status(prefix, `Fetching prices… ${done} of ${total}`); },
  };
}
function failNote(...maps) { const f = maps.reduce((s, m) => s + ((m && m._failed) || 0), 0); return f ? ` ${f} group${f > 1 ? 's' : ''} of prices didn’t load (Universalis was busy), so some items are missing. Scan again to fill them in.` : ''; }
function status(prefix, msg, err) { const el = $(prefix + 'Status'); el.textContent = msg || ''; el.classList.toggle('err', !!err); }
const batches = n => Math.ceil(n / 50);

// ================= cards =================
function card({ id, tags = [], kpis = [], badge, badgeCls = 'pos', onOpen, cls = '', starId }) {
  const el = document.createElement('div');
  el.className = 'item ' + cls; el.tabIndex = 0; el.setAttribute('role', 'button');
  el.setAttribute('aria-label', nm(id) + ', open details');
  const sid = starId ?? id, starred = S.watch.includes(sid);
  el.innerHTML = `<div class="ihead">${iconImg(id)}<div class="itext"><div class="t"><div class="nm">${esc(nm(id))}</div>${badge != null ? `<div class="badge ${badgeCls}">${esc(badge)}</div>` : ''}</div>
    ${(() => { const o = outcomeOf(sid); const all = o === 'staple' ? [['sells well for you', 'good']].concat(tags) : o === 'under' || o === 'stuck' ? [[o === 'stuck' ? 'sat unsold for you' : 'sold low for you', 'warn']].concat(tags) : tags; return all.length ? `<div class="meta">${all.map(t => `<span class="${t[1] || ''}">${esc(t[0])}</span>`).join('')}</div>` : ''; })()}</div></div>
    ${sparkFor(id, false) || sparkFor(id, true) ? `<div class="csp">${sparkFor(id, true) || sparkFor(id, false)}</div>` : ''}
    ${kpis.length ? `<div class="kpis">${kpis.slice(0, 3).map(k => `<div class="kpi"><small>${esc(k[0])}</small><b class="${k[2] || ''}">${esc(k[1])}</b></div>`).join('')}</div>` : ''}
    <button class="star" aria-label="${starred ? 'Remove from' : 'Add to'} watchlist" aria-pressed="${starred}">${icon(starred ? 'i-star-f' : 'i-star')}</button>`;
  el.querySelector('.star').addEventListener('click', e => { e.stopPropagation(); toggleWatch(sid); const on = S.watch.includes(sid); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.innerHTML = icon(on ? 'i-star-f' : 'i-star'); e.currentTarget.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' watchlist'); });
  el.addEventListener('click', onOpen);
  el.addEventListener('keydown', e => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } });
  return el;
}
// Render lists 24 at a time; "Show more" adds the next page (keeps phones fast).
const PAGE = 24;
function paginate(el, list, make) {
  el.innerHTML = '';
  let shown = 0;
  const more = document.createElement('button'); more.className = 'btn ghost more';
  const step = () => {
    const frag = document.createDocumentFragment();
    list.slice(shown, shown + PAGE).forEach(x => frag.append(make(x)));
    shown = Math.min(list.length, shown + PAGE);
    el.insertBefore(frag, more.isConnected ? more : null);
    if (shown >= list.length) more.remove(); else { more.textContent = `Show more (${(list.length - shown).toLocaleString()} left)`; if (!more.isConnected) el.append(more); }
  };
  more.addEventListener('click', step);
  step();
}
function emptyState(el, title, body) { el.innerHTML = `<div class="empty"><b>${esc(title)}</b>${esc(body)}</div>`; }
function skeleton(el, n = 6) { el.innerHTML = Array.from({ length: n }, () => '<div class="skel"></div>').join(''); }
function toggleWatch(id) {
  const i = S.watch.indexOf(id);
  if (i >= 0) { S.watch.splice(i, 1); toast('Removed from watchlist'); } else { S.watch.push(id); toast('Added to watchlist'); }
  saveS();
}
function supplyLabel(s) { if (s.units == null) return '—'; if (!s.units) return 'none listed'; if (!isFinite(s.supply)) return 'not selling'; return s.supply < 1 ? '<1 day' : Math.round(s.supply) + ' days'; }

// ================= CRAFTS =================
const FURN = ['Furnishing','Tabletop','Outdoor Furnishing','Table','Wall-mounted','Rug','Roof','Exterior Wall','Interior Wall','Ceiling Light','Flooring','Fence','Window','Door','Roof Decoration','Exterior Wall Decoration','Placard','Gardening'];
const MATS = ['Reagent','Metal','Stone','Cloth','Leather','Lumber','Ingredient','Part','Catalyst','Bone'];
const catName = r => CATS[r[9]] || '';
// Newest items: the game numbers items in release order, so the top few percent of IDs are the latest patch.
const NEW_PATCH = D.r.reduce((m, r) => (r[12] && r[17] > m ? r[17] : m), 0); // the game's own patch number on each recipe
const PRESETS = [
  { id: 'craftgear', label: 'Crafter & gatherer gear', test: r => r[11] === 1 },
  { id: 'combat', label: 'Combat gear', test: r => r[11] === 2 },
  { id: 'furniture', label: 'Furniture', test: r => FURN.includes(catName(r)) },
  { id: 'food', label: 'Food', test: r => catName(r) === 'Meal' },
  { id: 'medicine', label: 'Potions', test: r => catName(r) === 'Medicine' },
  { id: 'materials', label: 'Materials', test: r => MATS.includes(catName(r)) },
  { id: 'newest', label: 'Newest items', test: r => r[17] >= NEW_PATCH },
  { id: 'glamour', label: 'Glamour gear', test: r => r[11] === 2 && r[2] <= 70 },
  { id: 'other', label: 'Dyes, minions & more', test: r => r[11] === 0 && !FURN.includes(catName(r)) && !MATS.includes(catName(r)) && !['Meal','Medicine'].includes(catName(r)) },
];
function chipGroup(el, items, selected, onChange, single = false) {
  el.innerHTML = '';
  items.forEach(([id, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.setAttribute('aria-pressed', String(selected().includes(id)));
    b.addEventListener('click', () => {
      let cur = selected().slice();
      if (single) cur = [id]; else cur = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
      onChange(cur);
      el.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', String(cur.includes(items[i][0]))));
    });
    el.append(b);
  });
}
function craftable(r, lv = lvls()) {
  if (lv[r[1]] < 0 || r[2] > lv[r[1]]) return false;
  if (!S.stars && r[3] > 0) return false;
  if (r[7] && !S.books.includes(r[7])) return false;
  if (r[16]) return false;                                         // needs a special quest
  if (r[8] && !(S.souls || []).includes(r[1])) return false;        // needs that job's Soul of the Crafter
  return true;
}
function craftCandidates() {
  const lv = lvls(), minLvl = +P.craftMinLvl || 1;
  return D.r.filter(r => r[12] && craftable(r, lv) && r[2] >= minLvl);
}
function closure(recs) {
  const lv = lvls(), seen = new Set(), stack = [];
  recs.forEach(r => r[10].forEach(([id]) => stack.push([id, 0])));
  while (stack.length) {
    const [id, d] = stack.pop();
    if (seen.has(id)) continue; seen.add(id);
    if (d >= 4) continue;
    for (const sr of BY_RESULT.get(id) || []) if (craftable(sr, lv)) sr[10].forEach(([s]) => stack.push([s, d + 1]));
  }
  return [...seen];
}
let craftResults = [];
let memo = new Map();
function buyWorldName(id) {
  const q = AGG && AGG.data[id]; if (!q) return '';
  const w = q.xN ? q.wN : q.wH; return w ? (WORLDS[w] || '') : '';
}
function buyUnit(id) {
  const q = AGG && AGG.data[id]; if (!q) return null;
  const p = q.xN || q.xH || q.mN || q.aN || 0;
  return p ? p * taxB() : null;
}
function unitCost(id, depth = 0, visiting = new Set()) {
  if (memo.has(id)) return memo.get(id);
  const opts = [];
  const b = buyUnit(id); if (b != null) opts.push({ cost: b, src: 'buy' });
  if (VEND[id] && vendorOk(id)) opts.push({ cost: VEND[id] * 0.999, src: 'vendor' }); // reachable NPCs only; tiny nudge so ties prefer NPCs
  if (P.craftGatherFree && canGather(id)) opts.push({ cost: 0, src: 'gather' });
  if (P.craftSub && depth < 4 && !visiting.has(id)) {
    visiting.add(id); const lv = lvls();
    for (const sr of BY_RESULT.get(id) || []) {
      if (!craftable(sr, lv)) continue;
      let sum = 0, ok = true;
      for (const [s, n] of sr[10]) { const c = unitCost(s, depth + 1, visiting); if (c.cost == null) { ok = false; break; } sum += c.cost * n; }
      if (ok) opts.push({ cost: sum / (sr[5] || 1), src: 'craft', rec: sr });
    }
    visiting.delete(id);
  }
  opts.sort((a, b) => a.cost - b.cost);
  const best = opts[0] || { cost: null, src: 'missing' };
  if (depth === 0 || best.src !== 'missing') memo.set(id, best);
  return best;
}
function computeCrafts() {
  craftResults = [];
  if (!AGG) return;
  memo = new Map();
  const hqOn = S.hq, fee = taxS(), statsSet = (+S.cms > 0 && +S.ctl > 0);
  craftResults = AGG.rids.map(rid => BY_RID.get(rid)).filter(Boolean).map(r => {
    const [rid, ct, lvl, st, res, amt, canHq, book, spec, ui, ing, group, , reqCms, reqCtl, sugCms] = r;
    const statOk0 = statsSet ? (+S.cms >= Math.max(sugCms || 0, reqCms || 0) && +S.ctl >= (reqCtl || 0)) : null;
    const hq = hqOn && !!canHq && statOk0 !== false; // low stats: price it as NQ
    const s = stat(AGG.data[res], hq);
    let cost = 0, missing = 0;
    const lines = ing.map(([id, n]) => { const c = unitCost(id); if (c.cost == null) missing++; else cost += c.cost * n; return { id, n, c }; });
    cost /= (amt || 1);
    const profit = s.price * fee - cost;
    const statOk = statOk0;
    // Would the raw materials sell for more than the finished item?
    let matSell = 0, matOk = true;
    for (const [id, n] of ing) { const f = stat(AGG.data[id], false).fair; if (!f || !MARK.has(id)) { matOk = false; break; } matSell += f * n * fee; }
    const sellMats = matOk && matSell > s.price * fee * (amt || 1) * 1.05;
    const qc = group > 0 ? 1 : Math.max(1, Math.ceil(sessionQty(s.vel) / (amt || 1)));
    const minutes = planMinutes(planCrafts([[r, qc]]), [[r, qc]]) / qc; // per craft, with shopping spread over a realistic batch
    const gph = minutes > 0 ? profit * (amt || 1) / minutes * 60 : 0;
    return { kind: 'craft', r, rid, ct, lvl, st, res, amt, hq, spec, group, book, s, price: s.price, vel: s.vel, supply: s.supply, cost, profit,
      roi: cost > 0 ? profit / cost : 0, daily: profit * s.vel, missing, lines, statOk, hqAssumed: hq && statOk0 == null, sellMats, matSell: matSell / (amt || 1), minutes, gph };
  });
}
function craftFiltered() {
  const q = P.craftQ.trim().toLowerCase(), minVel = +P.craftMinVel || 0;
  const tests = PRESETS.filter(p => P.craftChips.includes(p.id)).map(p => p.test);
  const list = craftResults.filter(x => {
    if (tests.length && !tests.some(t => t(x.r))) return false;
    if (q && !nm(x.res).toLowerCase().includes(q)) return false;
    if (P.craftStatsOnly && x.statOk === false) return false;
    if (!P.craftShowAll && x.sellMats) return false;
    if (S.hideOdd !== false && !P.craftShowAll && suspicious(x.s)) return false;
    if (P.craftShowAll) return true;
    return !x.missing && x.price > 0 && x.profit > 0 && x.vel >= minVel;
  });
  const k = P.craftSort;
  list.sort((a, b) => b[k] - a[k]);
  return list;
}
// ---- Scrip farm: collectables priced per scrip (data comes from the game's collectable shop tables) ----
const CS = (D.cs || []).map(([id, lmin, lmax, lo, mid, hi, cur, rl, rm, rh]) => ({ id, lmin, lmax, th: [lo, mid, hi], cur, rw: [rl, rm, rh] }));
const CUR_NAME = { 2: 'Purple crafter', 4: 'Purple gatherer', 6: 'Orange crafter', 7: 'Orange gatherer' };
// Turn-in tier unlocks follow the expansion: 50–60 Heavensward, 61–70 Stormblood, 71–80 Shadowbringers, 81–90 Endwalker, 91+ Dawntrail.
const tierEx = lvl => lvl <= 60 ? 1 : lvl <= 70 ? 2 : lvl <= 80 ? 3 : lvl <= 90 ? 4 : 5;
function scripFarm() {
  if (!AGG) return [];
  const lv = lvls();
  const out = [];
  for (const c of CS) {
    if (c.cur !== 2 && c.cur !== 6) continue;                       // crafter scrips
    const rec = (BY_RESULT.get(c.id) || []).find(r => lv[r[1]] >= 0 && r[2] <= lv[r[1]]);
    if (!rec) continue;
    if (!expStarted(tierEx(c.lmax))) continue;                       // appraiser tier not reachable yet
    if (c.cur === 6 && !expStarted(5)) continue;
    let cost = 0, missing = 0;
    for (const [id, n] of rec[10]) { const u = unitCost(id); if (u.cost == null) missing++; else cost += u.cost * n; }
    const easy = lv[rec[1]] - rec[2] >= 10;                         // Trained Eye range: max collectability in one step
    const scrips = c.rw[2];
    out.push({ kind: 'scrip', id: c.id, rec, ct: rec[1], lvl: rec[2], cur: c.cur, th: c.th, rw: c.rw, cost, missing, easy, scrips,
      perScrip: scrips ? cost / scrips : Infinity, perHour: scrips * 60 / (T.craft + 0.2) });
  }
  return out.filter(x => !x.missing).sort((a, b) => a.perScrip - b.perScrip || b.scrips - a.scrips);
}
function renderScripFarm() {
  const el = $('craftList');
  const list = scripFarm();
  const top = list[0], goal = +P.scripGoal || 0;
  $('craftSummary').textContent = list.length ? `${list.length} collectables you can farm · cheapest per scrip first` + (top && goal ? ` · goal ${fmt(goal)}: ${Math.ceil(goal / top.scrips)} × ${nm(top.id)}, ~${Math.round(Math.ceil(goal / top.scrips) * (T.craft + 0.2))} min, ~${fmtK(Math.ceil(goal / top.scrips) * top.cost)} gil` : '') : '';
  if (!list.length) return emptyState(el, 'Nothing to farm yet', 'Refresh prices first, and check your crafter levels and story progress in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[JOBS[x.ct] + ' ' + x.lvl, 'gold'], [CUR_NAME[x.cur] + ' scrips'], [x.easy ? 'Trained Eye' : `needs ${x.th[2]}+`, x.easy ? 'good' : 'warn']],
    badge: `${x.perScrip < 10 ? x.perScrip.toFixed(1) : fmtK(x.perScrip)} gil/scrip`, badgeCls: 'gold',
    kpis: [['Materials', fmtK(x.cost)], ['Scrips', `${x.rw[2]}`], ['Per hour', fmtK(x.perHour)]], onOpen: () => openScrip(x) }));
}
// ---- crafting simulator (Teamcraft's open-source simulator + a small rotation search) ----
function simCraft(r) {
  const t = (D.rlt || {})[r[18]]; if (!t || !r[20]) return null;
  return { id: String(r[0]), job: 8 + r[1], rlvl: r[18], durability: r[19], quality: r[21], progress: r[20], lvl: r[2], stars: r[3], hq: r[6] ? 1 : 0,
    ingredients: [], conditionsFlag: t[4], progressDivider: t[0], qualityDivider: t[1], progressModifier: t[2], qualityModifier: t[3], expert: false };
}
function simulate(r) {
  if (!window.GLSolver || !window.TCSim) return { error: 'The simulator didn’t load. Reload the page.' };
  if (!(+S.cms > 0 && +S.ctl > 0 && +S.cp > 0)) return { error: 'Add your Craftsmanship, Control and CP in Settings first.' };
  const craft = simCraft(r); if (!craft) return { error: 'No simulator data for this recipe.' };
  const lv = +S.jobLv[r[1]] || 80;
  try { return GLSolver.solve(craft, { cms: +S.cms, ctl: +S.ctl, cp: +S.cp, level: lv, specialist: (S.souls || []).includes(r[1]), levels: S.jobLv.map(v => +v || 1) }); }
  catch (e) { return { error: 'The simulator hit a problem with this recipe.' }; }
}
function macroBlocks(lines) { // in-game macros hold 15 lines; split and add a chime at the end of each
  const out = []; for (let i = 0; i < lines.length; i += 14) { const part = lines.slice(i, i + 14); out.push(part.concat(`/echo Macro ${out.length + 1} done <se.${out.length + 1}>`).join('\n')); } return out;
}
function simSection(r, collectTarget) {
  const box = document.createElement('div'); box.className = 'section';
  box.innerHTML = `<h4>Can you HQ it?</h4><button class="btn small" data-sim>Run the crafting simulator</button><div class="simout"></div>`;
  box.querySelector('[data-sim]').addEventListener('click', e => {
    const b = e.currentTarget, out = box.querySelector('.simout'); b.disabled = true; b.textContent = 'Simulating…';
    setTimeout(() => {
      const res = simulate(r); b.disabled = false; b.textContent = 'Run it again';
      if (res.error) { out.innerHTML = `<p class="stale" style="font-size:14px">${esc(res.error)}</p>`; return; }
      if (!res.ok) { out.innerHTML = '<p class="stale" style="font-size:14px">No rotation finished this craft with your stats. It may need better gear.</p>'; return; }
      const coll = Math.floor(res.quality / 10);
      const verdict = collectTarget ? (coll >= collectTarget ? `Reaches ${coll} collectability; you need ${collectTarget}.` : `Reaches ${coll} collectability, short of ${collectTarget}. Better gear or food needed.`)
        : res.maxed ? 'Yes: this rotation reaches full quality, a guaranteed HQ.' : `About a ${res.hqPercent}% HQ chance with this rotation.`;
      const blocks = macroBlocks(res.macro);
      out.innerHTML = `<p class="${(collectTarget ? coll >= collectTarget : res.maxed) ? 'pos' : 'stale'}" style="font-size:15px;font-weight:600;margin:10px 0 6px">${esc(verdict)}</p>
        <p class="muted" style="font-size:13px;margin:0 0 8px">${res.steps.length} steps, simulated with normal conditions using your stats from Settings. Try it with a Trial Synthesis.</p>
        ${blocks.map((m, i) => `<div class="macrohead"><b>Macro ${i + 1}</b><button class="btn small ghost" data-copy="${i}">Copy</button></div><pre class="macro">${esc(m)}</pre>`).join('')}`;
      out.querySelectorAll('[data-copy]').forEach(c => c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(blocks[+c.dataset.copy]); toast('Macro copied'); } catch (err) { toast('Select the macro and copy it'); } }));
    }, 30);
  });
  return box;
}
function openScrip(x) {
  openDetail(x.id, { kind: 'item', id: x.id });
  const P1 = planSteps([[x.rec, 1]], null);
  const box = document.createElement('div');
  box.innerHTML = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Turn in at any Collectable Appraiser</div><b>${x.rw[2]} ${CUR_NAME[x.cur].toLowerCase()} scrips</b>
    <div class="muted" style="font-size:14px">${x.th[0]}+ → ${x.rw[0]} · ${x.th[1]}+ → ${x.rw[1]} · ${x.th[2]}+ → ${x.rw[2]} · about ${x.perScrip.toFixed(1)} gil per scrip</div></div>
    <div class="section" style="margin-top:0"><h4>How to make one</h4>${P1.html}</div>
    <div class="section"><h4>Macro</h4><pre class="macro">${x.easy ? '/ac "Trained Eye" &lt;wait.3&gt;\n/ac Veneration &lt;wait.2&gt;\n/ac Groundwork &lt;wait.3&gt;\n/ac Groundwork &lt;wait.3&gt;\n/ac "Careful Synthesis" &lt;wait.3&gt;' : 'This recipe is within 10 levels of yours, so Trained Eye won’t work.\nUse your normal collectable rotation and check the bar reaches ' + x.th[2] + '.'}</pre>
    <p class="muted" style="font-size:13px">Find it under Crafting Log → Special Recipes → Collectables. Try a Trial Synthesis first.</p></div>`;
  $('detailBody').prepend(box);
  box.append(simSection(x.rec, x.th[2]));
}
const LEVES = (D.lv || []).map(([leve, name, job, lvl, gil, item, count, rep, place, allow]) => ({ leve, name, job, lvl, gil, item, count, rep, place, allow }));
const leveEx = lvl => lvl <= 50 ? 0 : lvl <= 58 ? 1 : lvl <= 68 ? 2 : lvl <= 78 ? 3 : lvl <= 88 ? 4 : 5;
function leveList() {
  if (!AGG) return [];
  const lv = lvls(), out = [];
  for (const L of LEVES) {
    if (lv[L.job] < L.lvl || !expStarted(leveEx(L.lvl))) continue;
    const rec = (BY_RESULT.get(L.item) || []).find(r => craftable(r, lv)); if (!rec) continue;
    const u = unitCost(L.item); if (u.cost == null) continue;
    const turnIns = L.count * (L.rep + 1), cost = u.cost * turnIns, canHq = !!rec[6];
    const profit = L.gil - cost, hqProfit = L.gil * 2 - cost;
    out.push({ ...L, rec, cost, canHq, profit, hqProfit, best: canHq ? hqProfit : profit, turnIns });
  }
  return out.sort((a, b) => b.best - a.best);
}
function renderLeves() {
  const el = $('craftList'), list = leveList().filter(x => x.best > 0);
  $('craftSummary').textContent = list.length ? `${list.length} leves that make money · best per allowance first` : '';
  if (!list.length) return emptyState(el, 'No profitable leves found', 'Refresh prices first, and check your crafter levels and story progress.');
  paginate(el, list, x => card({ id: x.item, tags: [[JOBS[x.job] + ' ' + x.lvl, 'gold'], [x.place], [`${x.turnIns} to hand in`]].concat(x.canHq ? [['HQ doubles the gil', 'good']] : []),
    badge: `+${fmtK(x.best)}/allowance`, badgeCls: 'pos', kpis: [['Reward', fmtK(x.canHq ? x.gil * 2 : x.gil)], ['Cost', fmtK(x.cost)], ['Leve', x.name.length > 14 ? x.name.slice(0, 13) + '…' : x.name]],
    onOpen: () => { openDetail(x.item, { kind: 'item', id: x.item }); const P1 = planSteps([[x.rec, Math.ceil(x.turnIns / (x.rec[5] || 1))]], null); const b = document.createElement('div');
      b.innerHTML = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Leve: ${esc(x.name)} (${esc(x.place)})</div><b>Keep ~${fmt(x.best)} gil</b><div class="muted" style="font-size:14px">Reward ${fmt(x.gil)}${x.canHq ? ` (×2 = ${fmt(x.gil * 2)} for HQ)` : ''} · materials ~${fmt(x.cost)} · hand in ${x.turnIns}</div></div><div class="section" style="margin-top:0"><h4>Make the turn-ins</h4>${P1.html}</div>`;
      $('detailBody').prepend(b); } }));
}
// ---- Sell Grand Company turn-in items ----
// The game's supply table lists which items each job is asked for at each level. Players leveling
// buy these every day, and HQ copies double their seals and EXP, so HQ copies are what sell.
const GCS = (D.gcs || []).map(([id, job, lmin, lmax, cnt]) => ({ id, job, lmin, lmax, cnt }));
const GC_JOB = j => j < 8 ? JOBS[j] : ['MIN', 'BTN', 'FSH'][j - 8];
let gcHot = { at: 0, map: {} }; // item -> { d24, avg }
function gcDemand() {
  if (!AGG) return [];
  const lv = lvls(), fee = taxS(), seen = new Map();
  for (const g of GCS) {
    let cost, src, hq = false, rec = null;
    if (g.job < 8) {
      rec = (BY_RESULT.get(g.id) || []).find(r => craftable(r, lv)); if (!rec) continue;
      const u = unitCost(g.id); if (u.cost == null) continue;
      cost = u.cost; src = 'craft'; hq = !!rec[6];
    } else {
      if (!canGather(g.id)) continue;
      cost = 0; src = 'gather';
    }
    const s = stat(AGG.data[g.id], hq); if (!s.price || s.stale || (S.hideOdd !== false && suspicious(s))) continue;
    const profit = s.price * fee - cost; if (profit <= 0) continue;
    const prev = seen.get(g.id);
    const hot = gcHot.map[g.id];
    const x = { kind: 'gcd', id: g.id, res: g.id, job: g.job, lmin: g.lmin, lmax: g.lmax, cnt: g.cnt, rec, src, hq, s, cost, profit, vel: s.vel, price: s.price,
      daily: profit * Math.min(s.vel, 10), stack: profit * g.cnt, hot: hot && hot.d24 >= Math.max(3, hot.avg * 2.5) ? hot : null, h: hot };
    if (!prev || x.daily > prev.daily) seen.set(g.id, x);
  }
  return [...seen.values()].sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.daily - a.daily);
}
async function checkGcHot() {
  const btn = $('gcdCheck'), list = gcDemand().slice(0, 100); if (!list.length) return toast('Refresh prices first');
  btn.disabled = true; btn.textContent = 'Checking sales…';
  try {
    const ids = list.map(x => x.id), out = {};
    for (let i = 0; i < ids.length; i += 50) {
      let b = ids.slice(i, i + 50); if (b.length === 1) b = [b[0], 2];
      const res = await fetch(`https://universalis.app/api/v2/history/${encodeURIComponent(S.world)}/${b.join(',')}?entriesToReturn=200&entriesWithin=604800`);
      if (!res.ok) continue;
      const j = await res.json(), now = Date.now() / 1000;
      for (const [id, v] of Object.entries(j.items || {})) {
        const E = v.entries || [], u = e => e.quantity || 1;
        const d24 = E.filter(e => e.timestamp >= now - 86400).reduce((s, e) => s + u(e), 0);
        const wk = E.filter(e => e.timestamp < now - 86400).reduce((s, e) => s + u(e), 0) / 6;
        out[id] = { d24, avg: wk };
      }
    }
    gcHot = { at: Date.now(), map: out };
    const n = Object.values(out).filter(h => h.d24 >= Math.max(3, h.avg * 2.5)).length;
    $('gcdNote').textContent = n ? `${n} item${n > 1 ? 's are' : ' is'} selling unusually fast today (likely on today’s request lists).` : 'Nothing is spiking right now; regular demand still applies.';
    renderCrafts();
  } catch (e) { toast('Couldn’t check sales right now'); }
  finally { btn.disabled = false; btn.textContent = 'Check today’s demand'; }
}
function renderGcDemand() {
  const el = $('craftList'), list = gcDemand();
  $('craftSummary').textContent = list.length ? `${list.length} turn-in items you can make or gather` + (gcHot.at ? ` · demand checked ${ago(gcHot.at)}` : '') : '';
  if (!list.length) return emptyState(el, 'Nothing to sell yet', 'Refresh prices first, and check your crafter and gatherer levels in Settings.');
  paginate(el, list, x => {
    const tags = [[`${GC_JOB(x.job)} turn-in, Lv ${x.lmin === x.lmax ? x.lmin : x.lmin + '–' + x.lmax}`, 'gold']];
    if (x.hot) tags.push([`hot: ${x.hot.d24} sold today (usually ~${x.hot.avg.toFixed(1)}/day)`, 'good']);
    if (x.cnt > 1) tags.push([`sell in stacks of ${x.cnt}`]);
    tags.push([x.src === 'craft' ? (x.hq ? 'make it HQ' : 'craft') : 'gather']);
    return card({ id: x.id, tags, badge: '+' + fmtK(x.profit), badgeCls: 'pos',
      kpis: [['Sells' + (x.hq ? ' (HQ)' : ''), fmtK(x.price)], ['Cost', x.src === 'gather' ? 'free' : fmtK(x.cost)], ['Sold/day', x.vel.toFixed(1)]],
      onOpen: () => {
        if (x.rec) { const cx = craftResults.find(c => c.res === x.id); openDetail(x.id, cx || { kind: 'item', id: x.id }); }
        else { const gx = gatherResults.find(g => g.id === x.id); openDetail(x.id, gx || { kind: 'item', id: x.id }); }
        const b = document.createElement('div');
        b.innerHTML = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Grand Company ${x.src === 'craft' ? 'supply' : 'provisioning'} item</div><b>Players at ${GC_JOB(x.job)} level ${x.lmin}${x.lmax > x.lmin ? '–' + x.lmax : ''} need ${x.cnt > 1 ? x.cnt + ' of these' : 'this'}</b>
          <div class="muted" style="font-size:14px">${x.hq ? 'HQ doubles their seals and EXP, so list HQ copies. ' : ''}${x.cnt > 1 ? `List in stacks of ${x.cnt} so one purchase covers a turn-in. ` : ''}Requests reset at the daily reset.${x.h ? ` Sold ${x.h.d24} in the last 24 hours vs ~${x.h.avg.toFixed(1)} a day this week.` : ''}</div></div>`;
        $('detailBody').prepend(b);
      } });
  });
}
// ---- Free Company workshop demand ----
const FCW = D.fc || {}; // item -> [total needed across projects, number of projects, sample projects]
function fcwList() {
  if (!AGG) return [];
  const lv = lvls(), fee = taxS(), out = [];
  for (const [k, f] of Object.entries(FCW)) {
    const id = +k, rec = (BY_RESULT.get(id) || []).find(r => craftable(r, lv)), gat = canGather(id);
    if (!rec && !gat) continue;
    const s = stat(AGG.data[id], false); if (!s.price || s.stale || (S.hideOdd !== false && suspicious(s))) continue;
    let cost = 0, src = 'gather';
    if (!gat) { const u = unitCost(id); if (u.cost == null) continue; cost = u.cost; src = 'craft'; }
    const profit = s.price * fee - cost; if (profit <= 0) continue;
    out.push({ kind: 'fcw', id, res: id, rec, src, s, cost, profit, price: s.price, vel: s.vel, daily: profit * Math.min(s.vel, 20), need: f[0], projects: f[1], sample: f[2] });
  }
  return out.sort((a, b) => b.daily - a.daily);
}
function renderFcw() {
  const el = $('craftList'), list = fcwList();
  $('craftSummary').textContent = list.length ? `${list.length} workshop materials you can make or gather` : '';
  if (!list.length) return emptyState(el, 'Nothing to sell yet', 'Refresh prices first, and check your levels in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[`used in ${x.projects} workshop project${x.projects > 1 ? 's' : ''}`, 'gold'], [x.src === 'gather' ? 'gather it' : (x.rec ? JOBS[x.rec[1]] + ' ' + x.rec[2] : 'craft')], [x.vel.toFixed(1) + '/day']],
    badge: '+' + fmtK(x.profit), badgeCls: 'pos', kpis: [['Sells', fmtK(x.price)], ['Cost', x.src === 'gather' ? 'free' : fmtK(x.cost)], ['Per day', fmtK(x.daily), 'gold']],
    onOpen: () => {
      const cx = craftResults.find(c => c.res === x.id), gx = gatherResults.find(g => g.id === x.id);
      openDetail(x.id, cx || gx || { kind: 'item', id: x.id });
      const b = document.createElement('div');
      b.innerHTML = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Free Company workshop material</div><b>Needed in ${x.projects} project${x.projects > 1 ? 's' : ''}, ${fmt(x.need)} in total</b>
        <div class="muted" style="font-size:14px">Used in builds like ${x.sample.map(esc).join(', ')}. Workshops buy these in bulk, so list in larger stacks (for example 99) as well as smaller ones.</div></div>`;
      $('detailBody').prepend(b);
    } }));
}
function renderCrafts() {
  if ($('craftMode').children.length) syncCraftMode();
  if (P.craftMode === 'scrip') return renderScripFarm();
  if (P.craftMode === 'leve') return renderLeves();
  if (P.craftMode === 'gcd') return renderGcDemand();
  if (P.craftMode === 'fcw') return renderFcw();
  const el = $('craftList');
  if (!AGG) { $('craftSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices. It checks crafting, gathering and flips together, usually in under a minute.'); }
  const list = craftFiltered();
  $('craftSummary').textContent = `${list.length.toLocaleString()} profitable crafts · prices from ${ago(AGG.at)}`;
  if (!list.length) return emptyState(el, 'Nothing profitable here', 'Lower the minimum sales per day, add more item types, or turn on “Show losses” under Filters.');
  paginate(el, list, x => {
    const tags = [[JOBS[x.ct] + ' ' + x.lvl, 'gold'], [x.vel.toFixed(1) + '/day']];
    if (x.cost > 0) tags.push([Math.round(x.roi * 100) + '% ROI']);
    if (x.hq) tags.push(['HQ']); if (x.st) tags.push(['★'.repeat(x.st)]); if (x.amt > 1) tags.push(['×' + x.amt]);
    if (x.missing) tags.push(['missing prices', 'bad']);
    if (FCW[x.res]) tags.push(['FC workshop demand', 'gold']);
    if (x.gph > 0) tags.push([fmtK(x.gph) + '/hr']);
    if (x.sellMats) tags.push(['materials worth more', 'warn']);
    if (x.statOk === false) tags.push(['NQ price (stats low)', 'warn']);
    if (x.s.spike) tags.push(['price spike', 'warn']); if (x.s.inflated) tags.push(['listings overpriced', 'warn']);
    if (x.s.stale) tags.push(['stale', 'warn']);
    return card({ id: x.res, tags, cls: batch.has(x.rid) ? 'inbatch' : '', badge: (x.profit > 0 ? '+' : '') + fmtK(x.profit), badgeCls: x.profit > 0 ? 'pos' : 'neg',
      kpis: [['Sells', fmtK(x.price)], ['Cost', fmtK(x.cost)], ['Per day', fmtK(x.daily), 'gold']], onOpen: () => openDetail(x.res, x) });
  });
}

// ================= BATCH =================
let batch = new Map(S.batch || []);
function saveBatch() { S.batch = [...batch]; saveS(); $('batchCount').textContent = batch.size; $('batchFab').hidden = !(P.tab === 'crafts' && batch.size); }
function inBatchToggle(x) {
  if (batch.has(x.rid)) { batch.delete(x.rid); toast('Removed from batch'); } else { batch.set(x.rid, 1); rememberPrediction(x.res); toast('Added to batch'); }
  saveBatch(); renderCrafts();
}
// ---- material plans ----
const sessionQty = vel => Math.max(1, Math.min(20, Math.round((vel || 0) * 1.5)));
const T = { fishUnit: 1.5, setup: 3, craft: 1.0, sub: 0.8, gatherUnit: 0.3, vendorItem: 0.5, mbItem: 0.4, list: 0.3, trip: 5, vendorTrip: 2 }; // minutes
function applyPace() {
  const p = Object.assign({ craft: 1.0, gather: 0.3, fish: 1.5, trip: 5, npc: 2 }, S.pace || {});
  T.craft = p.craft; T.sub = p.craft * 0.8; T.gatherUnit = p.gather; T.fishUnit = p.fish; T.trip = p.trip; T.vendorTrip = p.npc;
}
applyPace();
function expand(id, qty, acc, depth = 1) {
  if (acc.inv) { const have = acc.inv.get(id) || 0; if (have > 0) { const use = Math.min(have, qty); acc.inv.set(id, have - use); acc.used.set(id, (acc.used.get(id) || 0) + use); qty -= use; if (qty <= 0) return; } }
  const c = memo.get(id) || unitCost(id);
  if (c.src === 'craft' && depth < 6) {
    const crafts = Math.ceil(qty / (c.rec[5] || 1));
    const e = acc.craft.get(c.rec[0]) || { rec: c.rec, crafts: 0, depth }; e.crafts += crafts; e.depth = Math.max(e.depth, depth); acc.craft.set(c.rec[0], e);
    for (const [s, n] of c.rec[10]) expand(s, n * crafts, acc, depth + 1);
  } else {
    const m = acc[{ gather: 'gather', buy: 'buy', vendor: 'vendor' }[c.src] || 'missing'];
    m.set(id, (m.get(id) || 0) + qty);
  }
}
function planCrafts(entries, useInv) {
  const acc = { vendor: new Map(), buy: new Map(), gather: new Map(), craft: new Map(), missing: new Map(), used: new Map(),
    inv: useInv ? new Map(Object.entries(S.inv || {}).map(([k, v]) => [+k, +v])) : null };
  for (const [r, crafts] of entries) for (const [id, n] of r[10]) expand(id, n * crafts, acc, 1);
  return acc;
}
function planMinutes(acc, finals) {
  let m = acc.vendor.size * T.vendorItem + acc.buy.size * T.mbItem;
  acc.gather.forEach(q => { m += q * T.gatherUnit; });
  acc.craft.forEach(e => { m += e.crafts * T.sub; });
  finals.forEach(([r, crafts]) => { m += crafts * (T.craft + T.list); });
  return m;
}
const garland = id => `https://www.garlandtools.org/db/#item/${id}`;
function gatherHint(id) {
  const g = GATH[id]; if (!g) return 'check Garland Tools for where';
  const jobs = GJOBS.filter(([, , bit]) => g[0] & bit).map(j => j[1]).join(' or ');
  const t = g[4].length ? ` · timed ${g[4].map(([a, d]) => etFmt(a) + '–' + etFmt((a + d) % 1440)).join(', ')} ET${g[5] ? ' (also regular nodes)' : ''}` : '';
  return `${jobs} ${g[1]}${g[3].length ? ' · ' + g[3].join(' or ') : ''}${t}`;
}
// Step-by-step shopping and crafting instructions for a set of crafts.
function planSteps(entries, sellAt) {
  const acc = planCrafts(entries, true);
  let spend = 0, n = 0; const html = [], text = [];
  const step = (title, rows, note) => {
    if (!rows.length) return; n++;
    html.push(`<div class="pstep"><div class="pnum">${n}</div><div class="pbody"><b>${esc(title)}</b>${note ? `<div class="muted pnote">${note}</div>` : ''}<ul>${rows.map(r => `<li>${r.html}</li>`).join('')}</ul></div></div>`);
    text.push(`${n}. ${title}`); rows.forEach(r => text.push('   • ' + r.text));
  };
  const u = [...acc.used.entries()].map(([id, q]) => ({ html: `${q} × ${esc(nm(id))} <span class="muted">· from your inventory</span>`, text: `${q} × ${nm(id)} (you have it)` }));
  if (u.length) { n++; html.push(`<div class="pstep"><div class="pnum">✓</div><div class="pbody"><b>Already have</b><ul>${u.map(r => `<li>${r.html}</li>`).join('')}</ul></div></div>`); n--; text.push('Already have:'); u.forEach(r => text.push('   • ' + r.text)); }
  const v = [...acc.vendor.entries()].map(([id, q]) => { const c = VEND[id] * q, w = vendorWhere(id); spend += c;
    return { c, html: `${q} × ${esc(nm(id))} <span class="muted">· ${fmt(VEND[id])} each${w ? ' · ' + esc(w) : ''}</span>${w ? '' : ` <a href="${garland(id)}" target="_blank" rel="noopener">where</a>`}`, text: `${q} × ${nm(id)} (${fmt(VEND[id])} each${w ? ', ' + w : ''})` }; }).sort((a, b) => b.c - a.c);
  step('Buy from NPC vendors', v, '');
  // Group market buys by cheapest world so you can do them in as few World Visits as possible (home world first).
  const groups = new Map();
  [...acc.buy.entries()].forEach(([id, q]) => { const u = buyUnit(id) || 0, w = buyWorldName(id) || S.world; spend += u * q;
    const g = groups.get(w) || []; g.push({ c: u * q, html: `${q} × ${esc(nm(id))} <span class="muted">· ~${fmt(u)} each</span>`, text: `${q} × ${nm(id)} (~${fmt(u)} each)` }); groups.set(w, g); });
  const worlds = [...groups.keys()].sort((a, b) => (a.toLowerCase() === String(S.world).toLowerCase() ? -1 : b.toLowerCase() === String(S.world).toLowerCase() ? 1 : groups.get(b).length - groups.get(a).length));
  const b = [];
  worlds.forEach(w => { b.push({ html: `<span class="wsub">On ${esc(w)}${w.toLowerCase() === String(S.world).toLowerCase() ? ' (home)' : ''}</span>`, text: `On ${w}:` }); groups.get(w).sort((x, y) => y.c - x.c).forEach(r => b.push(r)); });
  step(`Buy on the market board (${S.dc})`, b, worlds.length ? `${worlds.length} world${worlds.length > 1 ? 's' : ''} to visit. Prices include tax.` : '');
  const g = [...acc.gather.entries()].map(([id, q]) => ({ html: `${q} × ${esc(nm(id))} <span class="muted">· ${esc(gatherHint(id))}</span>`, text: `${q} × ${nm(id)} (${gatherHint(id)})` }));
  step('Gather yourself', g);
  const c = [...acc.craft.values()].sort((a, b) => b.depth - a.depth).map(e => ({ html: `${e.crafts} × ${esc(nm(e.rec[4]))} <span class="muted">· ${JOBNAMES[e.rec[1]]}</span>`, text: `${e.crafts} × ${nm(e.rec[4])} (${JOBNAMES[e.rec[1]]})` }));
  step('Craft these parts first', c, 'In this order, deepest parts first.');
  step('Craft', entries.map(([r, q]) => ({ html: `${q} × ${esc(nm(r[4]))} <span class="muted">· ${JOBNAMES[r[1]]}${r[5] > 1 ? ` · makes ${q * r[5]}` : ''}</span>`, text: `${q} × ${nm(r[4])} (${JOBNAMES[r[1]]})` })));
  if (sellAt) step('List it', entries.map(([r]) => ({ html: `${esc(nm(r[4]))} <span class="muted">· list at ${fmt(sellAt(r))} each</span>`, text: `${nm(r[4])}: list at ${fmt(sellAt(r))} each` })));
  const miss = [...acc.missing.entries()].map(([id, q]) => ({ html: `${q} × ${esc(nm(id))} <span class="muted">· no price found</span>`, text: `${q} × ${nm(id)} (no price found)` }));
  if (miss.length) step('Check these in game', miss, 'No current price data for these.');
  return { html: `<div class="psteps">${html.join('')}</div>`, text: text.join('\n'), spend, minutes: planMinutes(acc, entries) };
}
let listText = '';
function slots() { const total = (+S.retainers || 0) * 20; return { total, free: Math.max(0, total - S.listed.length) }; }
function renderBatch() {
  const sl = slots();
  $('slotNote').textContent = sl.total ? `${S.retainers} retainers give you ${sl.total} listing slots; ${S.listed.length} are marked as in use, so ${sl.free} are free.` : 'Set your number of retainers in Settings to cap batches to your free listing slots.';
  const wrap = $('batchItems'), out = $('batchList'); wrap.innerHTML = ''; out.innerHTML = '';
  if (!batch.size) { wrap.innerHTML = '<div class="empty"><b>Batch is empty</b>Add crafts from results, or fill from the top results above.</div>'; listText = ''; return; }
  const byRid = new Map(craftResults.map(x => [x.rid, x]));
  let income = 0, profit = 0, n = 0; const entries = [];
  const h = document.createElement('h4'); h.textContent = 'Crafts'; wrap.append(h);
  for (const [rid, qty] of batch) {
    const x = byRid.get(rid); if (!x) continue; n++; entries.push([x.r, qty]);
    const row = document.createElement('div'); row.className = 'row'; row.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap';
    row.innerHTML = `<input type="number" min="1" value="${qty}" inputmode="numeric" style="width:72px;flex:none" aria-label="Crafts of ${esc(nm(x.res))}">
      ${iconImg(x.res, 'ico sm')}<div style="flex:1;min-width:0"><b>${esc(nm(x.res))}</b><div class="muted" style="font-size:13px">${JOBS[x.ct]} · ${qty * x.amt} made · ~${fmtK(x.profit * x.amt * qty)} profit</div></div>
      <button class="del" aria-label="Remove ${esc(nm(x.res))}">×</button>`;
    row.querySelector('input').addEventListener('change', e => { batch.set(rid, Math.max(1, +e.target.value || 1)); saveBatch(); renderBatch(); });
    row.querySelector('.del').addEventListener('click', () => { batch.delete(rid); saveBatch(); renderBatch(); renderCrafts(); });
    wrap.append(row);
    income += x.price * x.amt * qty; profit += x.profit * x.amt * qty;
  }
  if (sl.total && n > sl.free) { const w = document.createElement('div'); w.className = 'callout warn'; w.style.marginTop = '10px'; w.textContent = `That's ${n} different items but only ${sl.free} free listing slots.`; wrap.append(w); }
  const sellAt = r => { const x = byRid.get(r[0]); const g = x && suggest(x.s); return g ? g.price : (x ? x.price : 0); };
  const P1 = planSteps(entries, sellAt);
  const tot = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Spend about</div><b>${fmt(P1.spend)} gil</b><div class="muted" style="font-size:14px;margin-top:4px">Sells for ~${fmt(income)} · ~${fmt(profit)} profit after fees · about ${Math.round(P1.minutes)} min of play (~${fmtK(profit / Math.max(1, P1.minutes) * 60)}/hr)</div></div>`;
  out.innerHTML = '<h4>Your plan</h4>' + tot + P1.html;
  renderListPlan(entries, byRid);
  listText = P1.text + `\n\nSpend about ${fmt(P1.spend)} gil. Sells for about ${fmt(income)}, roughly ${fmt(profit)} profit after fees.`;
  // Teamcraft import link: base64("itemId,recipeId,quantity;...")
  try { $('tcExport').href = 'https://ffxivteamcraft.com/import/' + btoa(entries.map(([r, q]) => `${r[4]},${r[0]},${q * (r[5] || 1)}`).join(';')); } catch (e) {}
  renderInv();
}
// Pick the set of crafts that earns the most within your budget AND your free listing slots.
// Each craft is scored by realistic profit (what the market can absorb in ~3 days) against how much
// of each limit it uses up, then taken greedily; units never exceed what the market can absorb.
// Spread the finished items across your retainers' 20 listing slots, most valuable first.
function renderListPlan(entries, byRid) {
  const el = $('listPlan'); if (!el) return;
  const n = Math.max(1, +S.retainers || 1), used = new Array(n).fill(0), plan = Array.from({ length: n }, () => []);
  const goods = entries.map(([r, q]) => { const x = byRid.get(r[0]); return { id: r[4], units: q * (r[5] || 1), value: x ? x.price * q * (r[5] || 1) : 0, stack: x && x.group > 0 ? 1 : Math.max(1, q * (r[5] || 1)) }; }).sort((a, b) => b.value - a.value);
  let k = 0;
  for (const g of goods) {
    const listings = g.stack === 1 ? g.units : 1; // gear lists one per slot, stackables in one stack
    for (let i = 0; i < listings; i++) { let tries = 0; while (used[k % n] >= 20 && tries++ < n) k++; if (used[k % n] >= 20) break; plan[k % n].push(g.stack === 1 ? `1 × ${nm(g.id)}` : `${g.units} × ${nm(g.id)}`); used[k % n]++; k++; }
  }
  el.innerHTML = `<h4>Listing plan</h4>` + plan.map((p, i) => p.length ? `<div class="kv" style="margin-bottom:8px"><div><b>Retainer ${i + 1}</b> <span class="muted">(${used[i]}/20 slots)</span></div><div></div>${p.map(s => `<div style="grid-column:1/-1;font-size:14px">${esc(s)}</div>`).join('')}</div>` : '').join('');
}
function renderInv() {
  const el = $('invList'); if (!el) return;
  const ent = Object.entries(S.inv || {}).filter(([, q]) => q > 0);
  el.innerHTML = ent.length ? ent.map(([id, q]) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap">${iconImg(+id, 'ico xs')}<span style="flex:1">${esc(nm(+id))}</span><input type="number" min="0" value="${q}" data-id="${id}" style="width:80px" inputmode="numeric" aria-label="How many ${esc(nm(+id))}"><button class="del" data-del="${id}" aria-label="Remove">×</button></div>`).join('') : '<p class="muted" style="margin:0;font-size:14px">Nothing added yet.</p>';
  el.querySelectorAll('input[data-id]').forEach(i => i.addEventListener('change', () => { S.inv[i.dataset.id] = Math.max(0, +i.value || 0); saveS(); renderBatch(); }));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { delete S.inv[b.dataset.del]; saveS(); renderBatch(); }));
}
const NAME_ID = new Map(); Object.entries(NAMES).forEach(([id, n]) => { const k = n.toLowerCase(); if (!NAME_ID.has(k)) NAME_ID.set(k, +id); });
function parseInv(text) {
  let added = 0; const miss = [];
  text.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(line => {
    let m = line.match(/^(.*?)[\s:]*[x×]\s*(\d+)$/i) || line.match(/^(\d+)\s*[x×]?\s+(.*)$/i) || line.match(/^(.*?)\s+(\d+)$/);
    let name, q;
    if (!m) { name = line; q = 1; } else if (/^\d+$/.test(m[1])) { q = +m[1]; name = m[2]; } else { name = m[1]; q = +m[2]; }
    const id = NAME_ID.get(name.trim().toLowerCase());
    if (id) { S.inv[id] = (S.inv[id] || 0) + q; added++; } else miss.push(name.trim());
  });
  saveS(); return { added, miss };
}
function autofill() {
  const budget = +P.budget || 0; let slotsLeft = +P.maxItems || 20;
  const sl = slots(); if (sl.total) slotsLeft = Math.min(slotsLeft, sl.free || slotsLeft);
  const cands = craftFiltered().filter(x => !x.missing && x.profit > 0 && !x.sellMats && confOf(x).level !== 'Low').slice(0, 300).map(x => {
    const m = marketFor(x.res, x.hq, x.s), rate = m.yourRate;
    const units = x.group > 0 ? 1 : Math.min(99, Math.max(1, Math.round(rate * 3)));
    const crafts = Math.max(1, Math.ceil(units / (x.amt || 1)));
    const cost = x.cost * x.amt * crafts, value = x.profit * Math.min(units, Math.max(1, rate * 3));
    return { x, crafts, cost, value };
  }).filter(c => c.cost > 0 && c.value > 0);
  const slotsTotal = slotsLeft || 1;
  cands.forEach(c => { c.score = c.value / (c.cost / Math.max(1, budget) + 1 / slotsTotal); });
  cands.sort((a, b) => b.score - a.score);
  batch = new Map(); let spent = 0;
  for (const c of cands) {
    if (batch.size >= slotsTotal) break;
    if (spent + c.cost > budget) continue;
    batch.set(c.x.rid, c.crafts); spent += c.cost;
  }
  saveBatch(); renderBatch(); renderCrafts();
  toast(batch.size ? `Picked ${batch.size} crafts · ~${fmtK(spent)} to buy` : 'Nothing fit that budget');
}
$('batchFab').addEventListener('click', () => { renderBatch(); openSheet('batchSheet'); });
$('autofill').addEventListener('click', autofill);
// ---- share a plan as a link (and import one from a link) ----
async function shareText(title, text, url) {
  try { if (navigator.share) { await navigator.share({ title, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + (url ? '\n' + url : '')); toast('Copied. Paste it anywhere to share.'); } catch (e) { toast('Couldn’t share from here'); }
}
$('shareBatch').addEventListener('click', () => {
  const code = btoa(JSON.stringify([...batch]));
  shareText('Gil Ledger plan', listText, location.href.split('#')[0] + '#b=' + code);
});
(function importBatchFromLink() {
  const m = location.hash.match(/#b=([A-Za-z0-9+/=]+)/); if (!m) return;
  try { const arr = JSON.parse(atob(m[1])); if (Array.isArray(arr) && arr.length) { batch = new Map(arr.map(([r, q]) => [+r, +q])); saveBatch(); toast(`Loaded a shared batch of ${arr.length} crafts`); } } catch (e) {}
  history.replaceState(null, '', location.pathname + location.search);
})();
// ---- craft queue: step through a batch one craft at a time ----
function buildQueue() {
  const byRid = new Map(craftResults.map(x => [x.rid, x]));
  const entries = [...batch].map(([rid, q]) => [BY_RID.get(rid), q]).filter(e => e[0]);
  const acc = planCrafts(entries, true);
  const steps = [...acc.craft.values()].sort((a, b) => b.depth - a.depth).map(e => ({ rid: e.rec[0], id: e.rec[4], job: e.rec[1], n: e.crafts, done: 0, part: true }))
    .concat(entries.map(([r, q]) => ({ rid: r[0], id: r[4], job: r[1], n: q, done: 0, part: false })));
  S.queue = { steps, started: Date.now(), at: Date.now() }; saveS();
}
function renderQueue() {
  const Q = S.queue; if (!Q) return;
  const body = $('detailBody'); $('detailTitle').textContent = 'Crafting queue'; $('detailIcon').innerHTML = ''; $('detailTags').innerHTML = '';
  const total = Q.steps.reduce((s, x) => s + x.n, 0), done = Q.steps.reduce((s, x) => s + x.done, 0);
  const cur = Q.steps.find(x => x.done < x.n);
  const mins = Math.round((Date.now() - Q.started) / 60000);
  body.innerHTML = `<div class="callout"><div class="muted" style="font-size:13px">${done} of ${total} crafts · ${mins} min so far</div><b>${cur ? `Next: ${esc(nm(cur.id))} (${JOBNAMES[cur.job]})` : 'All done! List your items.'}</b>
    <div class="qbar"><i style="width:${total ? 100 * done / total : 0}%"></i></div></div>
    <div class="section"><ol class="queue">${Q.steps.map((x, i) => `<li class="${x.done >= x.n ? 'qdone' : x === cur ? 'qcur' : ''}"><div class="row" style="flex-wrap:nowrap">${iconImg(x.id, 'ico sm')}<div style="flex:1;min-width:0"><b>${esc(nm(x.id))}</b><div class="muted" style="font-size:13px">${JOBNAMES[x.job]}${x.part ? ' · part' : ''} · ${x.done}/${x.n}</div></div>
      <button class="btn small" data-q="${i}" data-d="-1" aria-label="One less">−</button><button class="btn small primary" data-q="${i}" data-d="1" aria-label="One more done">+1</button></div></li>`).join('')}</ol></div>
    <div class="actions"><button class="btn" id="qReset">Start over</button><button class="btn" id="qEnd">Finish</button></div>`;
  body.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { const s = Q.steps[+b.dataset.q]; s.done = Math.max(0, Math.min(s.n, s.done + +b.dataset.d)); saveS(); renderQueue(); if (Q.steps.every(x => x.done >= x.n)) toast('Batch crafted! Time to list.'); }));
  $('qReset').onclick = () => { buildQueue(); renderQueue(); };
  $('qEnd').onclick = () => { S.queue = null; saveS(); closeSheet($('detail')); };
}
$('queueGo').addEventListener('click', () => { if (!batch.size) return toast('Add crafts to the batch first'); if (!S.queue) buildQueue(); closeSheet($('batchSheet')); renderQueue(); openSheet('detail'); });
bindSuggest($('invAdd'), $('invSuggest'), id => { $('invAdd').value = ''; S.inv = S.inv || {}; S.inv[id] = (S.inv[id] || 0) + 1; saveS(); renderBatch(); toast(`Added ${nm(id)}. Set how many below.`); });
$('invParse').addEventListener('click', () => { S.inv = S.inv || {}; const r = parseInv($('invPaste').value); $('invPaste').value = ''; renderBatch();
  toast(r.miss.length ? `Added ${r.added}; couldn’t match: ${r.miss.slice(0, 3).join(', ')}` : `Added ${r.added} item${r.added === 1 ? '' : 's'}`); });
$('budget').addEventListener('change', e => { P.budget = +e.target.value || 0; saveP(); });
$('maxItems').addEventListener('change', e => { P.maxItems = +e.target.value || 20; saveP(); });
$('copyBatch').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(listText); toast('Shopping list copied'); } catch (e) { toast('Couldn’t copy. Select the list and copy it.'); }
});
$('clearBatch').addEventListener('click', () => { batch.clear(); saveBatch(); renderBatch(); renderCrafts(); });

// ================= SHARED PRICE SCAN =================
// Prices are stored as arrays (about half the size of objects), unpacked on load.
const PK_KEYS = ['mN','xN','wN','aN','vN','mH','xH','wH','aH','vH','t','rN','dN','gN','rH','dH','gH'];
function packAgg(a) { const data = {}; for (const [id, o] of Object.entries(a.data)) { const v = PK_KEYS.map(k => o[k] || 0); while (v.length && !v[v.length - 1]) v.pop(); data[id] = v; } return Object.assign({}, a, { data }); }
function unpackAgg(a) {
  if (!a || !a.data) return null;
  const data = {};
  for (const [id, v] of Object.entries(a.data)) { if (!Array.isArray(v)) { data[id] = v; continue; } const o = {}; PK_KEYS.forEach((k, i) => { if (v[i]) o[k] = v[i]; }); data[id] = o; }
  return Object.assign({}, a, { data });
}
let AGG = unpackAgg(store.get('gl5-agg')) || unpackAgg(store.get('gl4-agg')); // {at, fullAt, world, rids, gids, vids, data}
store.del('gl4-agg');
if (AGG && String(AGG.world).toLowerCase() !== String(S.world).toLowerCase()) AGG = null;
let scanning = null;
const DAY = 86400000;
const isDead = p => !p || !(p.vN || p.vH || p.mN || p.mH || p.xN || p.xH);
function scanIds() {
  const recs = craftCandidates();
  const rids = recs.map(r => r[0]);
  const craftIds = new Set(); recs.forEach(r => craftIds.add(r[4]));
  closure(recs).forEach(id => craftIds.add(id));
  const lv = lvls(), csRecs = CS.map(c => (BY_RESULT.get(c.id) || []).find(r => lv[r[1]] >= 0 && r[2] <= lv[r[1]])).filter(Boolean);
  closure(csRecs).forEach(id => craftIds.add(id));
  const lvRecs = LEVES.map(L => (BY_RESULT.get(L.item) || []).find(r => craftable(r, lv))).filter(Boolean);
  closure(lvRecs).forEach(id => craftIds.add(id)); lvRecs.forEach(r => craftIds.add(r[4]));
  const gcRecs = (D.gcs || []).map(g => { craftIds.add(g[0]); return g[1] < 8 ? (BY_RESULT.get(g[0]) || []).find(r => craftable(r, lv)) : null; }).filter(Boolean);
  closure(gcRecs).forEach(id => craftIds.add(id));
  (D.rt || []).forEach(v => craftIds.add(v[0]));
  (D.mt || []).forEach(id => craftIds.add(id));
  Object.keys(D.fc || {}).forEach(k => craftIds.add(+k));
  Object.values(D.ar || {}).forEach(v => v[0].forEach(o => craftIds.add(o)));
  closure(Object.keys(D.fc || {}).map(k => (BY_RESULT.get(+k) || []).find(r => craftable(r, lv))).filter(Boolean)).forEach(id => craftIds.add(id));
  const gids = Object.keys(GATH).map(Number), vids = Object.keys(VEND).map(Number);
  const all = new Set([...craftIds, ...gids, ...vids, ...S.watch, ...S.listed, ...Object.keys(S.alerts || {}).map(Number), ...EXCH.map(e => e[1])]);
  const ids = [...all].filter(id => MARK.has(id));
  const full = !AGG || !AGG.fullAt || Date.now() - AGG.fullAt > DAY;
  const fetchIds = full ? ids : ids.filter(id => !(id in AGG.data) || !isDead(AGG.data[id]));
  return { rids, gids, vids, ids, fetchIds, full };
}
const SCAN_PREFIXES = ['best','craft','gather','flip'];
async function scanAll() {
  if (scanning) return scanning;
  const plan = scanIds();
  const total = Math.ceil(plan.fetchIds.length / 100);
  let done = 0;
  const setAll = (msg, pct, err) => SCAN_PREFIXES.forEach(p => { status(p, msg, err); if (pct != null) $(p + 'Prog').style.width = pct + '%'; });
  SCAN_PREFIXES.forEach(p => { $(p + 'Scan').disabled = true; });
  setAll(`Checking ${plan.fetchIds.length.toLocaleString()} items…`, 0);
  if (!AGG) { skeleton($('craftList')); skeleton($('gatherList')); skeleton($('flipList')); }
  scanning = (async () => {
    try {
      const fresh = await fetchAgg(plan.fetchIds, () => { done++; setAll(`Checking prices… ${Math.round(100 * done / total)}%`, 100 * done / total); });
      const data = {};
      if (!plan.full && AGG) plan.ids.forEach(id => { if (AGG.data[id]) data[id] = AGG.data[id]; });
      Object.assign(data, fresh);
      Object.defineProperty(data, '_failed', { value: fresh._failed || 0, enumerable: false });
      AGG = { at: Date.now(), fullAt: plan.full ? Date.now() : AGG.fullAt, world: S.world, rids: plan.rids, gids: plan.gids, vids: plan.vids, data };
      computeAll();
      setAll('Double-checking the top picks against 30 days of real sales…', 100);
      const C = bestCandidates();
      const vids = [...new Set(Object.values(C).flat().map(x => x.res ?? x.id).concat(S.watch, S.listed).filter(id => MARK.has(id)))].slice(0, 100);
      try { AGG.verify = vids.length ? await fetchVerify(vids) : {}; } catch (e) { AGG.verify = null; }
      const saved = store.set('gl5-agg', packAgg(AGG));
      renderAllViews();
      const f = data._failed ? ` ${data._failed} of ${total} groups didn’t load, so a few items are missing. Refresh again to fill them in.` : '';
      setAll(`Prices updated just now.` + f + (saved ? '' : ' (Too large to save for next time.)'));
      checkAlerts(true);
      return true;
    } catch (e) { setAll(e.message, null, true); renderAllViews(); return false; }
    finally { SCAN_PREFIXES.forEach(p => { $(p + 'Scan').disabled = false; }); scanning = null; }
  })();
  return scanning;
}
const VIEW_RENDER = { best: () => renderBest(), crafts: () => renderCrafts(), gather: () => renderGather(), flips: () => renderFlips() };
const dirty = new Set();
function renderAllViews() { Object.keys(VIEW_RENDER).forEach(k => dirty.add(k)); renderIfDirty(P.tab); }
function renderIfDirty(t) { if (dirty.has(t) && VIEW_RENDER[t]) { dirty.delete(t); VIEW_RENDER[t](); } }
['craftScan','gatherScan','flipScan'].forEach(id => $(id).addEventListener('click', () => scanAll().then(ok => ok && toast('Prices updated'))));

// ================= Eorzea time =================
const ET_MS = 175000 / 60; // real ms per Eorzea minute
const etNow = () => Math.floor(Date.now() / ET_MS) % 1440;
const etFmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const realMin = etMin => Math.max(1, Math.round(etMin * ET_MS / 60000));
function timedState(windows) {
  if (!windows || !windows.length) return null;
  const et = etNow(); let best = null;
  for (const [s, d] of windows) {
    const into = (et - s + 1440) % 1440;
    if (into < d) return { up: true, left: d - into, sort: -1 };
    const until = (s - et + 1440) % 1440;
    if (!best || until < best.until) best = { up: false, until, sort: until };
  }
  return best;
}
const timedLabel = t => !t ? '' : t.up ? `Up now · ${realMin(t.left)}m left` : `Up in ${realMin(t.until)}m`;

// ================= GATHER =================
let gatherResults = [];
function computeGather() {
  gatherResults = [];
  if (!AGG) return;
  const fee = taxS();
  gatherResults = AGG.gids.filter(id => GATH[id] && !isLocked(GATH[id]) && GJOBS.some(([, , bit], i) => (GATH[id][0] & bit) && S.gOn[i] && GATH[id][1] <= (+S.gLv[i] || 0))).map(id => {
    const g = GATH[id], s = stat(AGG.data[id], false);
    const jobs = GJOBS.filter(([, , bit]) => g[0] & bit).map(j => j[0]);
    const q = sessionQty(s.vel), unit = (g[0] & 4) && !(g[0] & 3) ? T.fishUnit : T.gatherUnit;
    const minutes = (T.setup + q * unit + T.list) / q; // per unit, including getting to the node
    return { kind: 'gather', id, g, jobs, s, price: s.price, vel: s.vel, supply: s.supply, profit: s.price * fee, daily: s.price * fee * s.vel, minutes, gph: s.price * fee / minutes * 60 };
  });
}
function gatherFiltered() {
  const q = P.gatherQ.trim().toLowerCase(), minVel = +P.gatherMinVel || 0, mask = exMask();
  const list = gatherResults.filter(x => {
    if (!x.jobs.some(j => P.gatherChips.includes(j))) return false;
    if (q && !nm(x.id).toLowerCase().includes(q)) return false;
    if (P.gatherTimed && !x.g[4].length) return false;
    if (P.gatherZones && !(x.g[2] & mask)) return false;
    if (S.hideOdd !== false && suspicious(x.s)) return false;
    return x.price > 0 && x.vel >= minVel;
  });
  list.forEach(x => { x.t = timedState(x.g[4]); x.next = x.t ? x.t.sort : 1e9; });
  const k = P.gatherSort;
  list.sort((a, b) => k === 'next' ? (a.next - b.next) || (b.daily - a.daily) : (b[k] - a[k]));
  return list;
}
const GCOL = D.gcol || {};
function gatherScrips() {
  const out = [], mask = exMask();
  for (const c of CS) {
    if (c.cur !== 4 && c.cur !== 7) continue;
    const g = GCOL[c.id]; if (!g || isLocked(g)) continue;
    const jobs = GJOBS.filter(([, , bit], i) => (g[0] & bit) && S.gOn[i] && g[1] <= (+S.gLv[i] || 0)).map(j => j[0]);
    if (!jobs.length || !jobs.some(j => P.gatherChips.includes(j))) continue;
    if (!(g[2] & mask) || !expStarted(tierEx(c.lmax)) || (c.cur === 7 && !expStarted(5))) continue;
    const fish = (g[0] & 4) && !(g[0] & 3);
    const perItem = fish ? T.fishUnit * 1.5 : (T.setup + 6 * 0.5) / 6; // collectables take longer than normal gathering
    const t = timedState(g[4]);
    out.push({ id: c.id, g, jobs, cur: c.cur, th: c.th, rw: c.rw, perHour: c.rw[2] * 60 / perItem, t, fish });
  }
  return out.sort((a, b) => (b.t && b.t.up ? 1 : 0) - (a.t && a.t.up ? 1 : 0) || b.perHour - a.perHour);
}
function renderGatherScrips() {
  const el = $('gatherList'), list = gatherScrips(), top = list[0], goal = +P.scripGoal || 0;
  $('gatherSummary').textContent = list.length ? `${list.length} collectables you can gather · ET ${etFmt(etNow())}` + (top && goal ? ` · goal ${fmt(goal)}: ~${Math.ceil(goal / top.rw[2])} × ${nm(top.id)}, ~${Math.round(goal / top.perHour * 60)} min` : '') : '';
  if (!list.length) return emptyState(el, 'Nothing to gather for scrips yet', 'Check your gatherer levels and story progress in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[x.jobs.join('/') + ' ' + x.g[1], 'gold'], [CUR_NAME[x.cur] + ' scrips']].concat(x.g[3].length ? [[x.g[3][0]]] : []).concat(x.t ? [[timedLabel(x.t), x.t.up ? 'good' : '']] : []),
    badge: `~${fmtK(x.perHour)} scrips/hr`, badgeCls: 'gold', kpis: [['Scrips each', String(x.rw[2])], ['Need', `${x.th[2]}+`], ['Low tier', `${x.th[0]}+ → ${x.rw[0]}`]],
    onOpen: () => { $('detailTitle').textContent = nm(x.id); $('detailIcon').innerHTML = iconImg(x.id, 'ico lg'); $('detailTags').innerHTML = '';
      $('detailBody').innerHTML = `<div class="callout"><div class="muted" style="font-size:13px">Turn in at any Collectable Appraiser</div><b>${x.rw[2]} ${CUR_NAME[x.cur].toLowerCase()} scrips</b><div class="muted" style="font-size:14px">${x.th[0]}+ → ${x.rw[0]} · ${x.th[1]}+ → ${x.rw[1]} · ${x.th[2]}+ → ${x.rw[2]}</div></div>
        <div class="section"><h4>Where</h4><div class="kv"><div>Gatherer</div><div class="v">${x.jobs.join(' / ')} · level ${x.g[1]}</div>${x.g[3].length ? `<div>Zones</div><div class="v">${x.g[3].map(esc).join('<br>')}</div>` : ''}${x.g[4].length ? `<div>Timed (ET)</div><div class="v">${x.g[4].map(([a, d]) => etFmt(a) + '–' + etFmt((a + d) % 1440)).join('<br>')}</div><div>Right now</div><div class="v">${timedLabel(x.t)}</div>` : ''}</div>
        <p class="muted" style="font-size:14px">${x.fish ? 'Turn on Collect before casting so the catch counts as a collectable.' : 'Pick the collectable in the node and use the collectable actions until you pass ' + x.th[2] + '.'}</p></div>
        <div class="links"><a href="${garland(x.id)}" target="_blank" rel="noopener">Garland Tools</a></div>`; openSheet('detail'); } }));
}
// Group profitable materials by zone, so one trip covers several good nodes.
function zoneRanking() {
  const Z = new Map();
  for (const x of gatherResults) {
    if (!x.jobs.some(j => j !== 'FSH' && P.gatherChips.includes(j)) || x.price <= 0 || x.vel < 0.5 || (S.hideOdd !== false && suspicious(x.s)) || x.s.stale) continue;
    const q = sessionQty(x.vel), value = x.profit * q;
    for (const z of x.g[3]) { const e = Z.get(z) || { zone: z, items: [], jobs: new Set() }; e.items.push({ x, q, value }); x.jobs.filter(j => j !== 'FSH').forEach(j => e.jobs.add(j)); Z.set(z, e); }
  }
  const out = [...Z.values()].map(e => { e.items.sort((a, b) => b.value - a.value); e.top = e.items.slice(0, 8); e.total = e.top.reduce((s, i) => s + i.value, 0); return e; });
  return out.filter(e => e.top.length >= 2).sort((a, b) => b.total - a.total);
}
function renderZones() {
  const el = $('gatherList');
  if (!AGG) { $('gatherSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const Zs = zoneRanking();
  $('gatherSummary').textContent = Zs.length ? `Mining & Botany: ${Zs.length} zones with 2+ good materials · ET ${etFmt(etNow())} · best first` : '';
  if (!Zs.length) return emptyState(el, 'No zones stand out right now', 'Lower the minimum sales per day under Filters, or refresh later.');
  el.innerHTML = '';
  Zs.slice(0, 12).forEach((z, i) => {
    const d = document.createElement('div'); d.className = 'pick zone';
    d.innerHTML = `<div class="pickhead"><span class="n">${i + 1}</span><b>${esc(z.zone)}</b><span class="earn">~${fmtK(z.total)}</span></div>
      <p class="sum" style="margin-left:36px">${[...z.jobs].join(' + ')} · ${z.items.length} good material${z.items.length > 1 ? 's' : ''} · value of a ~3-day haul</p>
      <ul class="zlist">${z.top.map(({ x, q, value }) => { const t = timedState(x.g[4]); return `<li data-id="${x.id}">${iconImg(x.id, 'ico xs')}<span style="flex:1;min-width:0">${esc(nm(x.id))} <span class="muted">· ${x.jobs.join('/')} ${x.g[1]} · ${fmtK(x.price)} · ~${q}${t ? ' · ' + timedLabel(t) : ''}</span></span><b class="pos">${fmtK(value)}</b></li>`; }).join('')}</ul>`;
    d.querySelectorAll('[data-id]').forEach(li => li.addEventListener('click', () => { const x = gatherResults.find(g => g.id === +li.dataset.id); openDetail(x.id, x); }));
    el.append(d);
  });
}
// ---- Gather → craft: things you can make entirely from what you gather yourself ----
// Each chain expands a recipe down to raw materials, using only materials you can gather (or craft from gathered ones).
// It compares selling the finished item with simply selling the raw materials, and estimates gil per hour of your time.
function chainFor(r, lv, depth = 0, seen = new Set()) {
  const acc = { gather: new Map(), crafts: [], ok: true };
  for (const [id, n] of r[10]) {
    if (!expandLeaf(id, n, acc, lv, depth + 1, seen)) return null;
  }
  return acc;
}
function expandLeaf(id, qty, acc, lv, depth, seen) {
  if (canGather(id)) { acc.gather.set(id, (acc.gather.get(id) || 0) + qty); return true; }
  if (depth > 4 || seen.has(id)) return false;
  const sub = (BY_RESULT.get(id) || []).find(rc => craftable(rc, lv)); if (!sub) return false;
  const crafts = Math.ceil(qty / (sub[5] || 1)); seen.add(id);
  for (const [s, n] of sub[10]) { if (!expandLeaf(s, n * crafts, acc, lv, depth + 1, seen)) { seen.delete(id); return false; } }
  seen.delete(id);
  acc.crafts.push({ rec: sub, crafts, depth });
  return true;
}
function gatherChains() {
  if (!AGG) return [];
  const lv = lvls(), fee = taxS(), out = [];
  for (const r of D.r) {
    if (!r[12] || !craftable(r, lv)) continue;
    const s = stat(AGG.data[r[4]], false);
    if (!s.price || s.vel < 0.5 || s.stale || (S.hideOdd !== false && suspicious(s))) continue;
    const ch = chainFor(r, lv); if (!ch || ch.gather.size > 6) continue;
    let rawValue = 0, gmins = 0;
    for (const [id, q] of ch.gather) {
      const g = GALL[id] || [0], fish = (g[0] & 4) && !(g[0] & 3);
      rawValue += stat((AGG.data[id]) || {}, false).fair * q * fee;
      gmins += q * (fish ? T.fishUnit : T.gatherUnit);
    }
    const minutes = ch.gather.size * T.setup + gmins + ch.crafts.reduce((a, c) => a + c.crafts * T.sub, 0) + T.craft + T.list;
    const value = s.price * fee * (r[5] || 1);
    out.push({ kind: 'chain', r, id: r[4], res: r[4], s, ch, value, rawValue, adds: value - rawValue, minutes, gph: value / minutes * 60, vel: s.vel, price: s.price });
  }
  return out.filter(x => x.adds > 0).sort((a, b) => b.gph * Math.min(1, b.vel) - a.gph * Math.min(1, a.vel));
}
function renderChains() {
  const el = $('gatherList');
  if (!AGG) { $('gatherSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const list = gatherChains();
  $('gatherSummary').textContent = list.length ? `${list.length} things you can make from only what you gather, where crafting beats selling the raw materials` : '';
  if (!list.length) return emptyState(el, 'Nothing found yet', 'Check your crafter and gatherer levels and story progress in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[JOBS[x.r[1]] + ' ' + x.r[2], 'gold'], ['all from your gathering', 'good']].concat(FCW[x.id] ? [['FC workshop demand', 'gold']] : []).concat([ [`${x.ch.gather.size} material${x.ch.gather.size > 1 ? 's' : ''}`]]).concat(x.ch.crafts.length ? [[`${x.ch.crafts.length} part${x.ch.crafts.length > 1 ? 's' : ''} to craft first`]] : []),
    badge: `${fmtK(x.gph)}/hr`, badgeCls: 'gold', kpis: [['Sells for', fmtK(x.value)], ['Raw mats worth', fmtK(x.rawValue)], ['Crafting adds', '+' + fmtK(x.adds), 'pos']],
    onOpen: () => openChain(x) }));
}
function openChain(x) {
  const cx = craftResults.find(c => c.res === x.id);
  openDetail(x.id, cx || { kind: 'item', id: x.id });
  const g = [...x.ch.gather.entries()].map(([id, q]) => `<li>${q} × ${esc(nm(id))} <span class="muted">· ${esc(gatherHint(id))}</span></li>`).join('');
  const c = x.ch.crafts.slice().sort((a, b) => b.depth - a.depth).map(e => `<li>${e.crafts} × ${esc(nm(e.rec[4]))} <span class="muted">· ${JOBNAMES[e.rec[1]]}</span></li>`).join('');
  const sug = suggest(x.s);
  const b = document.createElement('div');
  b.innerHTML = `<div class="callout" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Made entirely from your own gathering</div><b>~${fmtK(x.gph)} gil an hour</b>
    <div class="muted" style="font-size:14px">Sells for ~${fmt(x.value)} after fees. Selling the raw materials instead would bring ~${fmt(x.rawValue)}, so crafting adds ~${fmt(x.adds)}. About ${Math.round(x.minutes)} min from first node to listing.</div></div>
    <div class="section" style="margin-top:0"><h4>How to do it</h4><div class="psteps">
      <div class="pstep"><div class="pnum">1</div><div class="pbody"><b>Gather</b><ul>${g}</ul></div></div>
      ${c ? `<div class="pstep"><div class="pnum">2</div><div class="pbody"><b>Craft these parts first</b><ul>${c}</ul></div></div>` : ''}
      <div class="pstep"><div class="pnum">${c ? 3 : 2}</div><div class="pbody"><b>Craft</b><ul><li>1 × ${esc(nm(x.id))} <span class="muted">· ${JOBNAMES[x.r[1]]}</span></li></ul></div></div>
      <div class="pstep"><div class="pnum">${c ? 4 : 3}</div><div class="pbody"><b>List it</b><ul><li>${sug ? 'At about ' + fmt(sug.price) + ' each' : 'Near the cheapest listing'}</li></ul></div></div></div></div>`;
  $('detailBody').prepend(b);
}
function renderMateria() {
  const el = $('flipList');
  if (!AGG) { $('flipSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const kind = n => /Craftsman/.test(n) ? 'Crafter' : /Gatherer/.test(n) ? 'Gatherer' : 'Combat';
  const list = (D.mt || []).map(id => { const s = stat(AGG.data[id], false); return { id, s, price: s.price, vel: s.vel, daily: s.price * taxS() * s.vel, kind: kind(nm(id)) }; })
    .filter(x => x.price > 0 && !x.s.stale).sort((a, b) => b.daily - a.daily);
  $('flipSummary').textContent = `${list.length} materia with recent prices · most gil per day first`;
  if (!list.length) return emptyState(el, 'No materia prices yet', 'Refresh prices first.');
  paginate(el, list, x => card({ id: x.id, tags: [[x.kind, x.kind === 'Combat' ? '' : 'gold'], [x.vel.toFixed(1) + '/day']], badge: fmtK(x.price), badgeCls: 'pos',
    kpis: [['Sells', fmtK(x.price)], ['Sold/day', x.vel.toFixed(1)], ['Per day', fmtK(x.daily), 'gold']], onOpen: () => openDetail(x.id, { kind: 'item', id: x.id }) }));
}
// ---- Aetherial reduction: ephemeral-node collectables → aethersand (+ crystals and clusters) ----
// Mapping from FFXIV Teamcraft's community data. Yields vary per reduction, so this ranks by what one aethersand sells for.
const AR = D.ar || {};
const isCrystal = id => id >= 2 && id <= 19;
function reductionList() {
  if (!AGG) return [];
  const mask = exMask(), out = [];
  for (const [k, v] of Object.entries(AR)) {
    const id = +k, [outs, g] = v;
    if (g[6] && !S.folk) continue;
    if (!(g[2] & mask)) continue;
    const jobs = GJOBS.filter(([, , bit], i) => (g[0] & bit) && S.gOn[i] && g[1] <= (+S.gLv[i] || 0)).map(j => j[0]); if (!jobs.length) continue;
    const sand = outs.find(o => !isCrystal(o)); if (!sand) continue;
    const s = stat(AGG.data[sand], false); if (!s.price || s.stale) continue;
    const bonus = outs.filter(isCrystal).map(o => ({ id: o, s: stat(AGG.data[o], false) }));
    const t2 = timedState(g[4]);
    out.push({ kind: 'reduce', id, g, jobs, sand, s, bonus, price: s.price, vel: s.vel, t: t2, daily: s.price * taxS() * Math.min(s.vel, 10) });
  }
  return out.sort((a, b) => (b.t && b.t.up ? 1 : 0) - (a.t && a.t.up ? 1 : 0) || b.daily - a.daily);
}
function renderReduction() {
  const el = $('gatherList');
  if (!AGG) { $('gatherSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const list = reductionList();
  $('gatherSummary').textContent = list.length ? `${list.length} ephemeral-node collectables you can gather and reduce · ET ${etFmt(etNow())} · nodes up now first` : '';
  if (!list.length) return emptyState(el, 'Nothing to reduce yet', 'Ephemeral nodes are in Heavensward and later zones. Check your gatherer levels and story progress in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[x.jobs.join('/') + ' ' + x.g[1], 'gold'], [`→ ${nm(x.sand)}`]].concat(x.t ? [[timedLabel(x.t), x.t.up ? 'good' : '']] : []).concat(x.g[3].length ? [[x.g[3][0]]] : []),
    badge: `${fmtK(x.price)} a sand`, badgeCls: 'pos', kpis: [['Sand sells', fmtK(x.price)], ['Sand sold/day', x.vel.toFixed(1)], ['Bonus', x.bonus.map(b => nm(b.id).replace(/ (Crystal|Cluster)$/, m => m === ' Crystal' ? ' cryst.' : ' clust.')).join(', ') || '—']],
    onOpen: () => {
      $('detailTitle').textContent = nm(x.id); $('detailIcon').innerHTML = iconImg(x.id, 'ico lg'); $('detailTags').innerHTML = '';
      $('detailBody').innerHTML = `<div class="callout"><div class="muted" style="font-size:13px">Gather as a collectable, then use Aetherial Reduction on it</div><b>Reduces into ${esc(nm(x.sand))}</b>
        <div class="muted" style="font-size:14px">Plus ${x.bonus.map(b => esc(nm(b.id)) + (b.s.price ? ` (~${fmt(b.s.price)} each)` : '')).join(' and ')} as a bonus. ${esc(nm(x.sand))} sells for about ${fmt(x.price)} on ${esc(S.world)}, ${x.vel.toFixed(1)} a day. How many you get varies per reduction.</div></div>
        <div class="section"><h4>Where and when</h4><div class="kv"><div>Gatherer</div><div class="v">${x.jobs.join(' / ')} · level ${x.g[1]}</div>${x.g[3].length ? `<div>Zones</div><div class="v">${x.g[3].map(esc).join('<br>')}</div>` : ''}${x.g[4].length ? `<div>Ephemeral windows (ET)</div><div class="v">${x.g[4].map(([a, d]) => etFmt(a) + '–' + etFmt((a + d) % 1440)).join('<br>')}</div><div>Right now</div><div class="v ${x.t && x.t.up ? 'pos' : ''}">${timedLabel(x.t)}</div>` : ''}</div></div>
        <div class="section"><h4>How to do it</h4><ol class="psteps2"><li>Go to the zone while the ephemeral node is up and gather the item with Collect on.</li><li>Open Aetherial Reduction from your gatherer actions and reduce the collectables.</li><li>Sell the aethersand; keep or sell the crystals and clusters.</li></ol></div>
        <div class="links"><a href="${garland(x.id)}" target="_blank" rel="noopener">Garland Tools</a><a href="${garland(x.sand)}" target="_blank" rel="noopener">${esc(nm(x.sand))}</a></div>`;
      openSheet('detail');
    } }));
}
function renderGather() {
  if (P.gatherMode === 'reduce') return renderReduction();
  if (P.gatherMode === 'chain') return renderChains();
  if (P.gatherMode === 'zone') return renderZones();
  if (P.gatherMode === 'scrip') { if (!AGG) { $('gatherSummary').textContent = ''; } return renderGatherScrips(); }
  const el = $('gatherList');
  if (!AGG) { $('gatherSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices. It checks everything at once, usually in under a minute.'); }
  const list = gatherFiltered();
  $('gatherSummary').textContent = `${list.length.toLocaleString()} materials · ET ${etFmt(etNow())} · prices from ${ago(AGG.at)}`;
  if (!list.length) return emptyState(el, 'Nothing here yet', 'Lower the minimum sales per day, or turn off “Only zones I’ve unlocked” under Filters.');
  paginate(el, list, x => {
    const tags = [[x.jobs.join('/') + ' ' + x.g[1], 'gold']];
    if (x.t) tags.push([timedLabel(x.t), x.t.up ? 'good' : '']);
    const exNames = EXS.filter((_, i) => x.g[2] & (1 << i)); if (exNames.length) tags.push([exNames.join('/')]);
    if (x.gph > 0) tags.push([fmtK(x.gph) + '/hr']);
    if (x.s.spike) tags.push(['price spike', 'warn']); if (x.s.inflated) tags.push(['listings overpriced', 'warn']);
    if (x.s.stale) tags.push(['stale', 'warn']);
    return card({ id: x.id, tags, badge: fmtK(x.daily) + '/day', badgeCls: 'gold',
      kpis: [['Sells', fmtK(x.price)], ['Sold/day', x.vel.toFixed(1)], ['Lowest', x.s.min ? fmtK(x.s.min) : 'none']], onOpen: () => openDetail(x.id, x) });
  });
}
$('routeGo').addEventListener('click', () => {
  const out = $('routeOut');
  if (!AGG) { out.innerHTML = '<div class="empty">Refresh prices first.</div>'; return; }
  const mask = exMask(), now = Date.now(), horizon = now + 60 * 60000, etMs = ET_MS;
  const ev = [];
  for (const x of gatherResults) {
    if (!x.g[4].length || !(x.g[2] & mask) || x.price <= 0 || x.vel < 0.5 || (S.hideOdd !== false && suspicious(x.s))) continue;
    const q = sessionQty(x.vel), value = x.price * taxS() * q;
    const etNowAbs = Math.floor(now / etMs);
    for (const [s, d] of x.g[4]) {
      for (let k = -1; k < 2; k++) {
        const dayStart = (Math.floor(etNowAbs / 1440) + k) * 1440;
        const st = (dayStart + s) * etMs, en = st + d * etMs;
        if (en > now && st < horizon) ev.push({ x, st, en, value, q });
      }
    }
  }
  ev.sort((a, b) => a.st - b.st);
  const per = x => ((x.g[0] & 4) && !(x.g[0] & 3) ? T.fishUnit : T.gatherUnit);
  const route = []; let cur = now;
  // Greedy: at each point take the most valuable node you can still reach before its window closes.
  while (route.length < 8) {
    const opts = ev.filter(e => !route.some(r => r.x.id === e.x.id) && Math.max(cur, e.st) + 90000 < e.en);
    if (!opts.length) break;
    opts.sort((a, b) => (b.value / (Math.max(cur, b.st) - cur + 180000)) - (a.value / (Math.max(cur, a.st) - cur + 180000)));
    const e = opts[0], start = Math.max(cur, e.st), dur = (1.5 + e.q * per(e.x)) * 60000;
    route.push(Object.assign({}, e, { at: start })); cur = start + dur;
    if (cur > horizon) break;
  }
  route.sort((a, b) => a.at - b.at);
  if (!route.length) { out.innerHTML = '<div class="empty">No worthwhile timed nodes in the next hour.</div>'; return; }
  const total = route.reduce((s, r) => s + r.value, 0);
  out.innerHTML = `<div class="pick"><div class="pickhead"><span class="n">⏱</span><b>Your route</b><span class="earn">+${fmtK(total)}</span></div>
    <ol class="route">${route.map(r => `<li><b>${new Date(r.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b> · ${esc(nm(r.x.id))} <span class="muted">· ${esc(r.x.jobs.join('/'))} ${r.x.g[1]}${r.x.g[3].length ? ' · ' + esc(r.x.g[3][0]) : ''} · gather ~${r.q} · ~${fmtK(r.value)}</span></li>`).join('')}</ol>
    <p class="muted" style="font-size:13px;margin:6px 0 0">Times are your local clock. Each window lasts a few real minutes, so be there on time.</p></div>`;
});
setInterval(() => { if (document.hidden || !AGG) return; if (P.tab === 'gather') renderGather(); if (P.tab === 'best') renderBest(); }, 30000);

// ================= FLIPS =================
let flipResults = [];
const FLIP_HELP = {
  vendor: 'Items NPC vendors sell that go for more on your world’s market board. Tap one to see where to buy it.',
  world: 'Items listed cheaper on another world in your data center than they sell for on your world. Uses every item from the price check.',
  cur: 'What your scrips, tomestones and seals are worth in gil: the best things to buy with them and sell. Some need unlocks or ranks.',
  vent: 'Targeted retainer ventures ranked by what the haul sells for. Quantity depends on your retainer’s gear; this assumes the top amount.',
  materia: 'What materia sells for on your world. Extract materia from crafting and gathering gear at 100% spiritbond, keep what you meld, and sell the rest. Sorted by what sells most.',
  desynth: 'Rough guide: cheap gear whose recipe materials sell for much more. Desynthesis returns some of these materials at random, so check the yields link before buying a stack.',
};
const CUR = [['purpleC', 'Purple crafter scrips'], ['purpleG', 'Purple gatherer scrips'], ['orangeC', 'Orange crafter scrips'], ['orangeG', 'Orange gatherer scrips'], ['poetics', 'Poetics'], ['sky', 'Skybuilders’ scrips'], ['gc', 'GC seals']];
const EXCH = D.x || [];
function currencyFlips(cur) {
  if (!AGG) return [];
  const fee = taxS();
  const can = { orangeC: expStarted(5), orangeG: expStarted(5), sky: expDone(1), poetics: true, purpleC: true, purpleG: true, gc: true };
  if (!can[cur]) return [];
  return EXCH.filter(e => e[0] === cur && !(cur === 'gc' && (e[4] || 0) > (+S.gcRank || 0))).map(([c, id, cost, q]) => {
    const s = stat(AGG.data[id], false), each = s.price * fee;
    return { kind: 'cur', id, s, cost, q, price: s.price, vel: s.vel, profit: each * q, perUnit: each * q / cost, roi: 0, daily: each * Math.min(q, s.vel) , gph: 0 };
  }).filter(x => x.price > 0);
}
function computeFlips() { flipResults = P.flipMode === 'cur' ? currencyFlips(S.curCh || 'purpleC') : flipsFor(P.flipMode); }
function flipsFor(mode) {
  let out = [];
  if (!AGG) return out;
  const fee = taxS(), home = homeId();
  if (mode === 'vendor') {
    const mask = exMask();
    out = AGG.vids.filter(id => VEND[id]).map(id => {
      const vi = VINFO[id] || [0, 0, 0, []], reach = vi[1] ? !!(vi[1] & mask) : null; // null = location unknown
      if (reach === false) return null;
      const s = stat(AGG.data[id], false), cost = VEND[id], profit = s.price * fee - cost;
      const minutes = (T.vendorTrip + T.list) / sessionQty(s.vel) + 0.1;
      return { kind: 'vendor', id, s, cost, price: s.price, vel: s.vel, profit, roi: cost ? profit / cost : 0, daily: profit * s.vel, minutes, gph: profit / minutes * 60, unlock: !!vi[2], whereKnown: reach === true, where: vendorWhere(id) };
    }).filter(Boolean);
  } else {
    for (const [k, p] of Object.entries(AGG.data)) {
      const id = +k; let best = null;
      for (const q of ['N', 'H']) {
        const x = p['x' + q], w = p['w' + q];
        if (!x || !w || w === home) continue;
        const s = stat(p, q === 'H'), cost = x * taxB(), profit = s.price * fee - cost;
        const minutes = (T.trip + T.list) / sessionQty(s.vel) + 0.3;
        if (!best || profit > best.profit) best = { kind: 'world', id, s, hq: q === 'H', buyWorld: WORLDS[w] || ('world ' + w), buyWorldId: w, buyEach: x, cost, price: s.price, vel: s.vel, profit, roi: cost ? profit / cost : 0, daily: profit * s.vel, minutes, gph: profit / minutes * 60 };
      }
      if (best) out.push(best);
    }
  }
  return out;
}
function flipFiltered() {
  const q = P.flipQ.trim().toLowerCase(), minRoi = (+P.flipMinRoi || 0) / 100;
  const list = flipResults.filter(x => (!q || nm(x.id).toLowerCase().includes(q)) && x.price > 0 && x.profit > 0 && x.roi >= minRoi && x.vel >= 0.2 && !(S.hideOdd !== false && suspicious(x.s)));
  const k = P.flipSort; list.sort((a, b) => b[k] - a[k]);
  return list;
}
function renderFlips() {
  $('flipHelp').textContent = FLIP_HELP[P.flipMode];
  $('tripBox').hidden = P.flipMode !== 'world' || !AGG;
  $('curChips').hidden = P.flipMode !== 'cur';
  if (P.flipMode === 'cur') return renderCurrency();
  if (P.flipMode === 'vent') return renderVentures();
  if (P.flipMode === 'desynth') return renderDesynth();
  if (P.flipMode === 'materia') return renderMateria();
  const el = $('flipList');
  if (!AGG) { $('flipSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices. It checks everything at once, usually in under a minute.'); }
  const list = flipFiltered();
  $('flipSummary').textContent = `${list.length.toLocaleString()} flips · prices from ${ago(AGG.at)}`;
  if (!list.length) return emptyState(el, 'No flips at these settings', 'Lower the minimum ROI, or refresh later as prices move.');
  paginate(el, list, x => {
    const tags = x.kind === 'vendor' ? [[x.where ? x.where.split(' or ')[0] : 'NPC vendor', 'gold']] : [[x.buyWorld, 'gold']];
    if (x.kind === 'vendor' && x.unlock) tags.push(['needs a quest/rank', 'warn']); if (x.kind === 'vendor' && !x.whereKnown) tags.push(['vendor location unknown', 'warn']);
    tags.push([x.vel.toFixed(1) + '/day'], [Math.round(x.roi * 100) + '% ROI']);
    if (x.gph > 0) tags.push([fmtK(x.gph) + '/hr']);
    if (x.hq) tags.push(['HQ']); if (x.s.stale) tags.push(['stale', 'warn']);
    if (x.s.spike) tags.push(['price spike', 'warn']); if (x.s.inflated) tags.push(['listings overpriced', 'warn']);
    return card({ id: x.id, tags, badge: '+' + fmtK(x.profit),
      kpis: [['Buy', fmtK(x.kind === 'vendor' ? x.cost : x.buyEach)], ['Sells', fmtK(x.price)], ['Per day', fmtK(x.daily), 'gold']], onOpen: () => openDetail(x.id, x) });
  });
}

// Group cheap listings by world so one World Visit covers several buys.
$('tripPlan').addEventListener('click', async () => {
  const btn = $('tripPlan'), out = $('tripOut');
  const top = flipFiltered().slice(0, 60); if (!top.length) { out.innerHTML = '<div class="empty">No cross-world flips to plan right now.</div>'; return; }
  btn.disabled = true; btn.textContent = 'Checking every world…'; out.innerHTML = '';
  try {
    const live = await fetchMarket(S.dc, top.map(x => x.id), { listings: 40, entries: 0, listingFields: ['pricePerUnit', 'hq', 'quantity', 'worldName'] });
    const fee = taxS(), home = String(S.world).toLowerCase(), trips = new Map();
    for (const x of top) {
      const L = ((live[x.id] || {}).L || []).filter(l => String(l[3]).toLowerCase() !== home).sort((a, b) => a[0] - b[0]);
      const mk = marketFor(x.id, x.hq, x.s), cap = Math.max(1, Math.round(Math.max(mk.yourRate, x.s.vel / 2) * 3));
      let left = cap;
      for (const [price, hq, qty, world] of L) {
        if (left <= 0) break;
        const s = stat((AGG.data[x.id]) || {}, !!hq), profit = s.price * fee - price * taxB();
        if (profit <= 0 || profit / (price * taxB()) < 0.2) continue;
        const take = Math.min(qty, left); left -= take;
        const tr = trips.get(world) || { world, items: [], profit: 0, spend: 0 };
        tr.items.push({ id: x.id, qty: take, price, sell: s.price, profit: profit * take, hq });
        tr.profit += profit * take; tr.spend += price * taxB() * take; trips.set(world, tr);
      }
    }
    trips.forEach(tr => { tr.items.sort((a, b) => b.profit - a.profit); tr.items = tr.items.slice(0, 12); tr.profit = tr.items.reduce((s, i) => s + i.profit, 0); tr.spend = tr.items.reduce((s, i) => s + i.price * taxB() * i.qty, 0); });
    const list = [...trips.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
    if (!list.length) { out.innerHTML = '<div class="empty">No trip is worth it right now.</div>'; return; }
    out.innerHTML = list.map(tr => { const min = T.trip + tr.items.length * 0.6;
      return `<div class="pick" style="margin-top:10px"><div class="pickhead"><span class="n">✈︎</span><b>${esc(tr.world)}</b><span class="earn">+${fmtK(tr.profit)}</span></div>
      <p class="sum" style="margin-left:0">${tr.items.length} item${tr.items.length > 1 ? 's' : ''} · spend ~${fmtK(tr.spend)} · ~${Math.round(min)} min · ~${fmtK(tr.profit / min * 60)}/hr</p>
      <ul class="triplist">${tr.items.map(i => `<li>Buy ${i.qty} × ${esc(nm(i.id))}${i.hq ? ' (HQ)' : ''} at ${fmt(i.price)} → list for ~${fmt(i.sell)}</li>`).join('')}</ul></div>`; }).join('');
  } catch (e) { out.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  finally { btn.disabled = false; btn.textContent = 'Plan world-visit trips'; }
});
function renderVentures() {
  const el = $('flipList');
  if (!AGG) { $('flipSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const lvOf = { MIN: +S.gLv[0] || 0, BTN: +S.gLv[1] || 0, FSH: +S.gLv[2] || 0, Combat: +S.combatLv || 0 };
  const list = (D.rt || []).map(([id, typ, lvl, q0, q4, mins]) => { const s = stat(AGG.data[id], false), v = s.price * taxS() * q4; return { id, typ, lvl, q0, q4, mins, s, v, perHour: mins ? v / (mins / 60) : 0 }; })
    .filter(x => x.lvl <= lvOf[x.typ] && x.s.price > 0 && x.s.vel >= 0.5 && !(S.hideOdd !== false && suspicious(x.s))).sort((a, b) => b.v - a.v);
  $('flipSummary').textContent = `${list.length} ventures your retainers can run` + (S.combatLv ? '' : ' · set a combat retainer level in Settings to include hunting');
  if (!list.length) return emptyState(el, 'No ventures found', 'Check your gatherer levels in Settings.');
  paginate(el, list, x => card({ id: x.id, tags: [[`${x.typ === 'Combat' ? 'Combat' : x.typ} retainer ${x.lvl}+`, 'gold'], [`${x.q0}–${x.q4} per venture`], [x.s.vel.toFixed(1) + '/day']],
    badge: `~${fmtK(x.v)}`, badgeCls: 'pos', kpis: [['Sells', fmtK(x.s.price)], ['Takes', `${Math.round(x.mins / 60)}h`], ['Per hour', fmtK(x.perHour)]], onOpen: () => openDetail(x.id, { kind: 'item', id: x.id }) }));
}
function renderDesynth() {
  const el = $('flipList');
  if (!AGG) { $('flipSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const DS = new Set(D.ds || []), fee = taxS();
  const list = craftResults.filter(x => DS.has(x.res) && x.group > 0 && x.s.min > 0 && x.vel >= 0.3).map(x => {
    let mats = 0, ok = true; for (const [id, n] of x.r[10]) { const f = stat(AGG.data[id], false).fair; if (!f) { ok = false; break; } mats += f * n * fee; }
    return ok ? Object.assign({}, x, { buy: x.s.min * taxB(), mats, ratio: mats / (x.s.min * taxB()) }) : null;
  }).filter(x => x && x.ratio >= 1.5).sort((a, b) => b.ratio - a.ratio);
  $('flipSummary').textContent = `${list.length} rough candidates`;
  if (!list.length) return emptyState(el, 'No good candidates right now', 'Gear is priced close to its materials at the moment.');
  paginate(el, list, x => card({ id: x.res, tags: [[`desynth with ${JOBNAMES[x.ct]}`, 'gold'], ['rough estimate', 'warn']], badge: `${x.ratio.toFixed(1)}× materials`, badgeCls: 'gold',
    kpis: [['Buy', fmtK(x.buy)], ['Recipe mats', fmtK(x.mats)], ['Sold/day', x.vel.toFixed(1)]],
    onOpen: () => { openDetail(x.res, x); const b = document.createElement('div'); b.innerHTML = `<div class="callout warn" style="margin-bottom:14px"><b style="font-size:16px">Check yields before buying a stack</b><div class="muted" style="font-size:14px">Desynthesis gives random materials. <a href="${garland(x.res)}" target="_blank" rel="noopener">See reported results on Garland Tools</a>.</div></div>`; $('detailBody').prepend(b); } }));
}
function renderCurrency() {
  const el = $('flipList');
  if (!AGG) { $('flipSummary').textContent = ''; return emptyState(el, 'No prices yet', 'Tap Refresh prices first.'); }
  const label = (CUR.find(c => c[0] === (S.curCh || 'purpleC')) || [])[1] || '';
  const list = flipResults.filter(x => x.vel >= 0.3 && !(S.hideOdd !== false && suspicious(x.s))).sort((a, b) => b.perUnit - a.perUnit);
  $('flipSummary').textContent = `${list.length} items for ${label} · best first`;
  if (!list.length) return emptyState(el, 'Nothing here for you yet', (S.curCh || '').startsWith('orange') ? 'Orange scrips open up in Dawntrail. Update your story progress in Settings when you get there.' : 'Try another currency, or refresh later.');
  paginate(el, list, x => card({ id: x.id, tags: [[`${x.cost} ${label.toLowerCase()}${x.q > 1 ? ` → ${x.q}` : ''}`, 'gold'], [x.vel.toFixed(1) + '/day']].concat(x.s.stale ? [['stale', 'warn']] : []),
    badge: `${x.perUnit >= 100 ? fmtK(x.perUnit) : x.perUnit.toFixed(1)} gil each`, badgeCls: 'gold',
    kpis: [['Spend', String(x.cost)], ['Sells', fmtK(x.price)], ['You get', fmtK(x.profit)]], onOpen: () => openDetail(x.id, { kind: 'item', id: x.id }) }));
}
// ================= WATCH =================
let WR = store.get('gl3-watch'); // {sell, at}
function bindSuggest(input, listEl, onPick) {
  let items = [], active = -1;
  const close = () => { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const draw = () => {
    listEl.innerHTML = items.map(([id], i) => `<li role="option" id="${listEl.id}-${i}" aria-selected="${i === active}" data-i="${i}">${iconImg(id, 'ico xs')}${esc(nm(id))}</li>`).join('');
    listEl.hidden = !items.length; input.setAttribute('aria-expanded', String(!!items.length));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${listEl.id}-${active}`); else input.removeAttribute('aria-activedescendant');
  };
  input.addEventListener('input', debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { items = []; return close(); }
    const starts = [], has = [];
    for (const e of MARK_NAMES) { if (e[1].startsWith(q)) starts.push(e); else if (e[1].includes(q)) has.push(e); if (starts.length >= 8) break; }
    items = starts.concat(has).slice(0, 8); active = -1; draw();
  }, 120));
  input.addEventListener('keydown', e => {
    if (listEl.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { onPick(items[active][0]); close(); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  listEl.addEventListener('mousedown', e => e.preventDefault());
  listEl.addEventListener('click', e => { const li = e.target.closest('li'); if (li) { onPick(items[+li.dataset.i][0]); close(); } });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
bindSuggest($('watchAdd'), $('watchSuggest'), id => {
  $('watchAdd').value = '';
  if (!S.watch.includes(id)) { S.watch.push(id); saveS(); }
  toast(`${nm(id)} added to watchlist`); renderWatch();
});
$('watchScan').addEventListener('click', () => checkListings(true));
// Remember your listings, flag sudden competition, and log sales automatically when a listing disappears.
async function trackListings() {
  const mine = retainerSet(); if (!mine.size) return;
  S.myL = S.myL || {}; S.compPrev = S.compPrev || {}; S.surge = {};
  const gone = [];
  for (const id of S.listed) {
    const p = WR.sell[id]; if (!p || !p.L) continue;
    const my = p.L.filter(l => mine.has(String(l[3]).toLowerCase())), others = p.L.length - my.length;
    const prev = S.compPrev[id];
    { const st = listingState(id); if (st.state === 'under') { const last = (S.ucLog || []).filter(e => e.id === id).pop(); if (!last || Date.now() - last.t > 3 * 3600000) { S.ucLog = (S.ucLog || []).concat({ id, t: Date.now() }).slice(-300); } } }
    if (prev != null && others >= prev + 3 && others >= prev * 1.5) { S.surge[id] = others - prev; toast(`Competition surge on ${nm(id)} (+${others - prev} listings)`); }
    S.compPrev[id] = others;
    if (my.length) { const b = my.reduce((a, c) => a[0] <= c[0] ? a : c); S.myL[id] = { price: b[0], qty: my.reduce((s, l) => s + (l[2] || 1), 0), seen: Date.now() }; }
    else if (S.myL[id]) gone.push(id);
  }
  if (gone.length) {
    try {
      const H = await fetchVerifyRaw(gone);
      let logged = 0;
      for (const id of gone) {
        const m = S.myL[id], en = H[id] || [];
        const hit = en.filter(e => e.timestamp * 1000 >= m.seen - 6 * 3600000 && Math.abs(e.pricePerUnit - m.price) <= Math.max(1, m.price * 0.01));
        if (hit.length) {
          const qty = hit.reduce((s, e) => s + (e.quantity || 1), 0);
          S.sales.push({ t: Date.now(), id, qty, each: m.price, cost: costOf(id), auto: true });
          S.listed = S.listed.filter(x => x !== id); delete S.myL[id]; logged++;
        }
      }
      if (logged) toast(`Logged ${logged} sale${logged > 1 ? 's' : ''} automatically`);
    } catch (e) {}
  }
  saveS(); renderWatch();
}
async function fetchVerifyRaw(ids) {
  const out = {}; let b = ids.slice(0, 100); if (b.length === 1) b = [b[0], 2];
  const res = await fetch(`https://universalis.app/api/v2/history/${encodeURIComponent(S.world)}/${b.join(',')}?entriesToReturn=60&entriesWithin=604800`);
  if (!res.ok) return out;
  const j = await res.json();
  for (const [id, v] of Object.entries(j.items || {})) out[id] = v.entries || [];
  return out;
}
async function checkListings(fromWatch) {
  const ids = [...new Set(S.listed.concat(S.watch))].filter(id => MARK.has(id));
  if (!ids.length) return status('watch', 'Add items to your watchlist, or mark items as listed from their details.', true);
  const pr = progressFor('watch'); pr.start(batches(ids.length), `Checking ${ids.length} item${ids.length === 1 ? '' : 's'}…`);
  $('watchScan').disabled = true;
  try {
    const sell = await fetchMarket(S.world, ids, { listings: 100, entries: 200, listingFields: ['pricePerUnit','hq','quantity','retainerName'], onBatch: pr.tick });
    WR = { sell, at: Date.now() }; store.set('gl3-watch', WR); checkAlerts(true);
    await trackListings();
    renderWatch(); status('watch', `Checked ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
    const u = listingStates().filter(x => x.state === 'under').length;
    if (fromWatch) toast(u ? `${u} listing${u > 1 ? 's' : ''} undercut` : 'All checked');
  } catch (e) { status('watch', e.message, true); }
  finally { $('watchScan').disabled = false; }
}
function listingState(id) {
  const p = WR && WR.sell[id]; if (!p || !p.L) return { id, state: 'unknown' };
  const mine = retainerSet();
  if (!mine.size) return { id, state: 'noret' };
  const L = p.L, my = L.filter(l => mine.has(String(l[3]).toLowerCase()));
  if (!my.length) return { id, state: 'gone' };
  const myBest = my.reduce((a, b) => a[0] <= b[0] ? a : b);
  const others = L.filter(l => !mine.has(String(l[3]).toLowerCase()) && l[1] === myBest[1]);
  const low = others.length ? others.reduce((a, b) => a[0] <= b[0] ? a : b) : null;
  const s = stat(p, !!myBest[1]);
  const nearLow = low ? others.filter(l => l[0] <= low[0] * 1.15).length : 0, slow = (s.vel || 0) < 1;
  if (low && low[0] < myBest[0]) return { id, state: 'under', mine: myBest[0], low: low[0], by: myBest[0] - low[0], relist: nearLow >= 3 && slow ? low[0] : Math.max(1, low[0] - 1), matchAdvice: nearLow >= 3 && slow, surge: (S.surge || {})[id] || 0, dip: s.avg && low[0] < s.avg * 0.7, hq: !!myBest[1] };
  return { id, state: 'cheapest', mine: myBest[0], next: low ? low[0] : null, hq: !!myBest[1], surge: (S.surge || {})[id] || 0 };
}
const listingStates = () => S.listed.map(listingState);
function ucTiming(el) {
  const L = S.ucLog || []; if (L.length < 5) return;
  const h = Array(8).fill(0); L.forEach(e => { h[Math.floor(new Date(e.t).getHours() / 3)]++; });
  const top = h.indexOf(Math.max(...h)), f = x => new Date(2000, 0, 1, x).toLocaleTimeString(undefined, { hour: 'numeric' });
  const b = document.createElement('div'); b.className = 'callout'; b.style.marginBottom = '14px';
  b.innerHTML = `<div class="muted" style="font-size:13px">⏰ When you get undercut</div><div>Most undercuts show up around <b style="font-size:16px">${f(top * 3)}–${f((top * 3 + 3) % 24)}</b> your time. Check listings then.</div>`;
  el.append(b);
}
function renderWatch() {
  $('retainerNote').textContent = retainerSet().size ? `Matching listings from: ${S.retNames}` : 'Add your retainer names in Settings so undercut checks can find your listings.';
  const le = $('listedList'), we = $('watchList');
  const ab = $('watchAlerts'); if (ab) { ab.innerHTML = ''; alertBanner(ab); crashBanner(ab); ucTiming(ab); }
  if (!S.listed.length) emptyState(le, 'No listings tracked', 'Open any item and tap “I listed this” to track it here.');
  else {
    le.innerHTML = '';
    for (const st of listingStates()) {
      const id = st.id, tags = []; let kpis = [], badge = null, badgeCls = 'pos';
      if (st.state === 'under') { badge = 'Undercut'; badgeCls = 'neg'; tags.push(['by ' + fmt(st.by), 'bad']); { const c = costOf(id); if (c && st.relist < c / taxS()) tags.push(['relist would be below your cost', 'bad']); } if (st.matchAdvice) tags.push(['match, don’t undercut', 'warn']); if (st.surge) tags.push([`competition surge +${st.surge}`, 'warn']); if (st.dip) tags.push(['prices dipped', 'warn']); kpis = [['Yours', fmtK(st.mine)], ['Lowest', fmtK(st.low)], [st.matchAdvice ? 'Match at' : 'Relist at', fmtK(st.relist), 'pos']]; }
      else if (st.state === 'cheapest') { badge = 'Cheapest'; tags.push(['you’re lowest', 'good']); if (st.surge) tags.push([`competition surge +${st.surge}`, 'warn']); kpis = [['Yours', fmtK(st.mine)], ['Next', st.next ? fmtK(st.next) : '—']]; }
      else if (st.state === 'gone') tags.push(['Not found: sold, or not refreshed yet', 'warn']);
      else if (st.state === 'noret') tags.push(['Add retainer names in Settings', 'warn']);
      else tags.push(['Tap Check listings']);
      const el = card({ id, tags, kpis, badge, badgeCls, onOpen: () => openDetail(id, { kind: 'item', id }) });
      if (st.state === 'gone') {
        const b = document.createElement('div'); b.className = 'row'; b.style.marginTop = '10px';
        b.innerHTML = '<button class="btn small">Log as sold</button><button class="btn small ghost">Stop tracking</button>';
        b.children[0].addEventListener('click', e => { e.stopPropagation(); prefillSale(id); });
        b.children[1].addEventListener('click', e => { e.stopPropagation(); toggleListed(id); renderWatch(); });
        el.append(b);
      }
      le.append(el);
    }
  }
  if (!S.watch.length) emptyState(we, 'Watchlist is empty', 'Star items anywhere, or search above to add them.');
  else {
    we.innerHTML = '';
    for (const id of S.watch) {
      const p = WR && WR.sell[id];
      const hq = false, s = stat(p, hq), sh = stat(p, true);
      const best = sh.price > s.price ? sh : s;
      we.append(card({ id, tags: p ? (best.stale ? [['stale price', 'warn']] : []) : [['Tap Check listings']],
        kpis: p ? [['Price', fmtK(best.price)], ['Sales/day', (s.vel + sh.vel).toFixed(1)], ['Supply', supplyLabel(best)]] : [],
        onOpen: () => openDetail(id, { kind: 'item', id }) }));
    }
  }
}
// ---- learning from your own results ----
// Each time you list, batch or sell something, remember what the app expected, then compare with what happened.
function rememberPrediction(id) {
  const p = AGG && AGG.data[id]; if (!p) return;
  const s = stat(p, !!(p.aH && p.aH > (p.aN || 0))), g = suggest(s);
  S.pred = S.pred || {}; S.pred[id] = { at: Date.now(), price: g ? g.price : Math.round(s.price || 0), vel: s.vel || 0 };
}
function outcomes() {
  const by = new Map();
  for (const x of S.sales || []) { const e = by.get(x.id) || { id: x.id, n: 0, gil: 0, units: 0, last: 0 }; e.n++; e.units += x.qty; e.gil += x.qty * x.each; e.last = Math.max(e.last, x.t); by.set(x.id, e); }
  const res = [];
  for (const e of by.values()) {
    const pr = (S.pred || {})[e.id], avg = e.gil / Math.max(1, e.units), ratio = pr && pr.price ? avg / pr.price : null;
    const cost = costOf(e.id), margin = cost != null ? avg * taxS() - cost : null;
    const kind = e.n >= 2 && (ratio == null || ratio >= 0.9) && (margin == null || margin > 0) ? 'staple' : ratio != null && ratio < 0.75 ? 'under' : 'ok';
    res.push(Object.assign(e, { avg, ratio, margin, kind }));
  }
  // Listings that sat a week with no sale count against an item.
  for (const id of S.listed || []) { const at = (S.listedAt || {})[id]; if (at && Date.now() - at > 7 * 86400000 && !by.has(id)) res.push({ id, n: 0, kind: 'stuck', since: at }); }
  return res;
}
function outcomeOf(id) { const o = outcomes().find(x => x.id === id); return o ? o.kind : null; }
function toggleListed(id) {
  const i = S.listed.indexOf(id);
  S.listedAt = S.listedAt || {};
  if (i >= 0) { S.listed.splice(i, 1); delete S.listedAt[id]; toast('No longer tracking this listing'); } else { S.listed.push(id); S.listedAt[id] = Date.now(); rememberPrediction(id); toast('Tracking your listing'); }
  saveS();
}

// ================= GOAL & SALES =================
function costOf(id) {
  const c = craftResults.find(x => x.res === id); if (c && !c.missing) return c.cost;
  if (GATH[id]) return 0;
  const f = flipResults.find(x => x.id === id); if (f) return f.cost;
  return null;
}
function renderGoal() {
  const goal = +S.goal || 0, log = S.gilLog.slice().sort((a, b) => a.t - b.t), last = log[log.length - 1];
  $('goalTarget').value = goal || '';
  const now = last ? last.gil : 0, pct = goal ? Math.min(1, now / goal) : 0;
  const r = 66, c = 2 * Math.PI * r;
  $('goalRing').innerHTML = `<svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--line)" stroke-width="12"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--gold)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
    <div class="lbl"><b>${Math.round(pct * 100)}%</b><small>of goal</small></div>`;
  $('goalNow').textContent = last ? fmt(now) + ' gil' : 'Log your gil';
  $('goalOf').textContent = goal ? `${fmt(Math.max(0, goal - now))} to go of ${fmtK(goal)}` : 'Set a goal below';
  let pace = 'Log your gil every few days to see your pace and a finish date.';
  if (log.length >= 2) {
    const cutoff = Date.now() - 60 * 86400000;
    const first = log.find(e => e.t >= cutoff) || log[0];
    const days = (last.t - first.t) / 86400000;
    if (days >= 0.5) {
      const rate = (last.gil - first.gil) / days;
      if (rate > 0 && now < goal) {
        const left = (goal - now) / rate, when = new Date(Date.now() + left * 86400000);
        pace = `Saving about ${fmtK(rate)} a day. At this pace you’ll reach your goal around ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} (${Math.ceil(left)} days).`;
      } else if (now >= goal) pace = 'You’ve hit your goal. Time to enter the lottery!';
      else pace = `Your gil went down by about ${fmtK(-rate)} a day recently.`;
    }
  }
  // Forecasts from your sales log and from repeating your session plan daily.
  const fee = taxS(), since = Date.now() - 14 * 86400000;
  const recent = S.sales.filter(x => x.t >= since), salesProfit = recent.reduce((s, x) => s + (x.cost == null ? x.qty * x.each * fee : x.qty * (x.each * fee - x.cost)), 0);
  const firstT = recent.length ? Math.min(...recent.map(x => x.t)) : Date.now();
  const spanDays = Math.max(1, (Date.now() - firstT) / 86400000);
  const lines = [pace];
  const dateIn = d => new Date(Date.now() + d * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (goal > now && recent.length >= 2) { const r = salesProfit / spanDays; if (r > 0) lines.push(`From your sales log: about ${fmtK(r)} profit a day → ${dateIn((goal - now) / r)}.`); }
  if (goal > now && S.lastPlan > 0) lines.push(`Playing your last session plan once a day (~${fmtK(S.lastPlan)}) → ${dateIn((goal - now) / S.lastPlan)}.`);
  $('goalPace').innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join('');
  $('goalTable').innerHTML = log.length ? '<tr><th>Date</th><th>Gil</th><th></th></tr>' + log.slice().reverse().map(e =>
    `<tr><td>${new Date(e.t).toLocaleDateString()}</td><td>${fmt(e.gil)}</td><td><button class="del" data-t="${e.t}" aria-label="Delete entry">×</button></td></tr>`).join('') : '<tr><td class="muted">No entries yet</td></tr>';
  $('goalTable').querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { S.gilLog = S.gilLog.filter(e => e.t !== +b.dataset.t); saveS(); renderGoal(); }));
  renderSales(); renderWeekly(); renderLottery();
}
$('goalLog').addEventListener('click', () => {
  const v = +$('goalInput').value; if (!(v >= 0) || $('goalInput').value === '') return toast('Enter how much gil you have');
  S.gilLog.push({ t: Date.now(), gil: v }); saveS(); $('goalInput').value = ''; renderGoal(); toast('Gil logged');
});
$('goalTarget').addEventListener('change', e => { S.goal = +e.target.value || 0; saveS(); renderGoal(); });
document.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => { S.goal = +b.dataset.goal; saveS(); renderGoal(); }));
let saleId = null;
bindSuggest($('saleItem'), $('saleSuggest'), id => { saleId = id; $('saleItem').value = nm(id); $('salePrice').focus(); });
$('saleItem').addEventListener('input', () => { saleId = null; });
function prefillSale(id) {
  showTab('goal'); saleId = id; $('saleItem').value = nm(id);
  const st = listingState(id); if (st.mine) $('salePrice').value = st.mine;
  $('saleItem').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('saleAdd').addEventListener('click', () => {
  const qty = +$('saleQty').value || 1, each = +$('salePrice').value;
  if (!saleId) return toast('Pick the item from the list');
  if (!(each > 0)) return toast('Enter the price each');
  if (!(S.pred || {})[saleId]) rememberPrediction(saleId);
  S.sales.push({ t: Date.now(), id: saleId, qty, each, cost: costOf(saleId) });
  if (S.listed.includes(saleId)) S.listed.splice(S.listed.indexOf(saleId), 1);
  saveS(); saleId = null; $('saleItem').value = ''; $('salePrice').value = ''; $('saleQty').value = 1;
  renderSales(); toast('Sale logged');
});
// ---- resets (weekly: Tuesday 08:00 UTC, daily: 15:00 UTC) ----
function nextWeekly(now = Date.now()) { const d = new Date(now); const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8)); let add = (2 - r.getUTCDay() + 7) % 7; r.setUTCDate(r.getUTCDate() + add); if (r.getTime() <= now) r.setUTCDate(r.getUTCDate() + 7); return r.getTime(); }
function nextDaily(now = Date.now()) { const d = new Date(now); const r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15); return r > now ? r : r + 86400000; }
const until = ms => { const m = Math.max(0, Math.round((ms - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor(m % 1440 / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const CD = [['Zhloe Aliapoh', 'Idyllshire', 3], ['M’naago', 'Rhalgr’s Reach', 5], ['Kurenai', 'The Ruby Sea', 4], ['Adkiragh', 'Idyllshire', 5], ['Kai-Shirr', 'Eulmore', 7], ['Ehll Tou', 'The Firmament', 7],
  ['Count Charlemend', 'The Firmament', 7], ['Ameliance', 'Old Sharlayan', 9], ['Anden', 'Il Mheg', 9], ['Margrat', 'New Nest of Wings', 9], ['Nitowikwe', 'Shaaloani', 11], ['Tiisol Ja', 'Tuliyollal', 11]];
const DAILY = [['gc', 'Grand Company expert deliveries (seals)'], ['vent', 'Collect and resend retainer ventures'], ['mb', 'Check listings for undercuts']];
function renderWeekly() {
  const el = $('weekly'); if (!el) return;
  const wk = nextWeekly(), dy = nextDaily();
  if (!S.cdw || S.cdw.wk !== wk) S.cdw = { wk, c: {} };
  if (!S.chk || S.chk.dy !== dy) S.chk = { dy, d: {} };
  const avail = CD.filter(c => msqStage() >= c[2]), used = Object.values(S.cdw.c).reduce((s, v) => s + v, 0);
  el.innerHTML = `<div class="grid2"><div><div class="muted" style="font-size:12px;font-weight:600">Weekly reset</div><div style="font-size:20px;font-weight:700">${until(wk)}</div></div><div><div class="muted" style="font-size:12px;font-weight:600">Daily reset</div><div style="font-size:20px;font-weight:700">${until(dy)}</div></div></div>
    <div><b>Custom Deliveries</b> <span class="muted">${used}/12 this week (up to 6 per client)</span>${avail.map(([n, p]) => { const v = S.cdw.c[n] || 0; return `<div class="row" style="flex-wrap:nowrap;padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:0">${esc(n)} <span class="muted" style="font-size:13px">· ${esc(p)}</span></div><button class="btn small" data-cd="${esc(n)}" data-d="-1" aria-label="One less">−</button><b style="width:28px;text-align:center">${v}</b><button class="btn small" data-cd="${esc(n)}" data-d="1" aria-label="One more">+</button></div>`; }).join('')}
    ${avail.length < CD.length ? `<p class="muted" style="font-size:13px;margin:6px 0 0">${CD.length - avail.length} more clients unlock as your story progresses.</p>` : ''}</div>
    <div><b>Daily</b>${DAILY.map(([k, l]) => `<label class="check" style="display:flex;gap:10px;padding:6px 0"><input type="checkbox" data-dk="${k}" ${S.chk.d[k] ? 'checked' : ''} style="width:18px;height:18px">${esc(l)}</label>`).join('')}
    <p class="muted" style="font-size:13px;margin:4px 0 0">Leve allowances refill twice a day; the Leves view in Crafts shows the best ones to spend them on.</p></div>`;
  el.querySelectorAll('[data-cd]').forEach(b => b.addEventListener('click', () => { const n = b.dataset.cd, v = Math.max(0, Math.min(6, (S.cdw.c[n] || 0) + +b.dataset.d)); const tot = Object.entries(S.cdw.c).reduce((s, [k, x]) => s + (k === n ? 0 : x), 0); if (tot + v > 12) return toast('That’s the 12-a-week limit'); S.cdw.c[n] = v; saveS(); renderWeekly(); }));
  el.querySelectorAll('[data-dk]').forEach(c => c.addEventListener('change', () => { S.chk.d[c.dataset.dk] = c.checked; saveS(); }));
  saveS();
}
// ---- housing lottery: 9-day cycle (5 entry, 4 results), switching at daily reset; estimated from a known cycle ----
const LOTTO_ANCHOR = Date.UTC(2025, 2, 8, 15); // an entry period start (8 Mar 2025, 15:00 UTC)
function renderLottery() {
  const el = $('lottery'); if (!el) return;
  const cyc = 9 * 86400000, now = Date.now(), k = Math.floor((now - LOTTO_ANCHOR) / cyc), start = LOTTO_ANCHOR + k * cyc, entryEnd = start + 5 * 86400000, end = start + cyc;
  const entry = now < entryEnd, fmtD = ms => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const last = S.gilLog.slice().sort((a, b) => a.t - b.t).pop(), have = last ? last.gil : 0;
  el.innerHTML = `<div class="kv"><div>Right now</div><div class="v ${entry ? 'pos' : ''}">${entry ? 'Entry period' : 'Results period'}</div>
    <div>${entry ? 'Entries close' : 'Next entry period'}</div><div class="v">${entry ? fmtD(entryEnd) + ' (' + until(entryEnd) + ')' : fmtD(end) + ' (' + until(end) + ')'}</div>
    <div>Medium plot</div><div class="v">~16–20M</div><div>You have</div><div class="v ${have >= 16e6 ? 'pos' : ''}">${last ? fmt(have) : 'log your gil'}</div></div>
    <p class="muted" style="font-size:13.5px;margin:10px 0 0">${have >= 16e6 ? 'You can afford some medium plots. Check placards during an entry period.' : last ? `About ${fmtK(Math.max(0, 16e6 - have))} to go for the cheaper medium plots.` : ''} Dates are estimated from the regular 9-day cycle; confirm on a plot placard in game. Have the full price ready to enter.</p>`;
}
function catOf(id) {
  const r = (BY_RESULT.get(id) || [])[0];
  if (r) return r[11] === 1 ? 'Crafter & gatherer gear' : r[11] === 2 ? 'Combat gear' : (CATS[r[9]] || 'Crafted');
  if (GATH[id]) return 'Gathered'; if (VEND[id]) return 'Vendor flips'; return 'Other';
}
function renderSales() {
  const fee = taxS(), week = Date.now() - 7 * 86400000;
  const rev = x => x.qty * x.each * fee, prof = x => x.cost == null ? null : x.qty * (x.each * fee - x.cost);
  const wk = S.sales.filter(x => x.t >= week);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  $('salesStats').innerHTML = [['This week', fmtK(sum(wk, rev))], ['All time', fmtK(sum(S.sales, rev))], ['Est. profit', fmtK(sum(S.sales, prof))]]
    .map(([a, b]) => `<div><div class="muted" style="font-size:12px;font-weight:600">${a}</div><div style="font-size:20px;font-weight:700" class="num">${b}</div></div>`).join('');
  const by = new Map();
  S.sales.forEach(x => { const e = by.get(x.id) || { rev: 0, prof: 0, n: 0 }; e.rev += rev(x); e.prof += prof(x) || 0; e.n += x.qty; by.set(x.id, e); });
  const top = [...by.entries()].sort((a, b) => b[1].prof - a[1].prof).slice(0, 8);
  $('salesTables').innerHTML = !S.sales.length ? '<p class="muted">No sales logged yet.</p>' :
    `<h4 style="margin:12px 0 6px">Top earners</h4><table class="table"><tr><th>Item</th><th>Sold</th><th>Profit</th></tr>${top.map(([id, e]) => `<tr><td>${esc(nm(id))}</td><td>${e.n}</td><td>${fmtK(e.prof)}</td></tr>`).join('')}</table>
     <h4 style="margin:16px 0 6px">What’s working for you</h4>${(() => { const o = outcomes(); if (!o.length) return '<p class="muted" style="font-size:14px">Log sales and mark listings, and the app will learn what sells for you.</p>';
       const lab = { staple: 'Sells well', under: 'Sold below expected', stuck: 'Sat unsold a week', ok: 'Sold' };
       return `<table class="table"><tr><th>Item</th><th>Result</th><th>vs expected</th></tr>${o.slice(0, 12).map(x => `<tr><td>${esc(nm(x.id))}</td><td>${lab[x.kind]}</td><td>${x.ratio != null ? Math.round(x.ratio * 100) + '%' : '—'}</td></tr>`).join('')}</table>`; })()}
     <h4 style="margin:16px 0 6px">By category</h4><table class="table"><tr><th>Category</th><th>Sales</th><th>Profit</th></tr>${(() => { const m = new Map(); S.sales.forEach(x => { const k = catOf(x.id), e = m.get(k) || { n: 0, p: 0 }; e.n += x.qty; e.p += prof(x) || 0; m.set(k, e); }); return [...m.entries()].sort((a, b) => b[1].p - a[1].p).map(([k, e]) => `<tr><td>${esc(k)}</td><td>${e.n}</td><td>${fmtK(e.p)}</td></tr>`).join(''); })()}</table>
     <h4 style="margin:16px 0 6px">Recent</h4><table class="table"><tr><th>Item</th><th>Qty × each</th><th></th></tr>${S.sales.slice().reverse().slice(0, 20).map(x => `<tr><td>${esc(nm(x.id))}<div class="muted" style="font-size:12px">${new Date(x.t).toLocaleDateString()}</div></td><td>${x.qty} × ${fmt(x.each)}</td><td><button class="del" data-t="${x.t}" aria-label="Delete sale">×</button></td></tr>`).join('')}</table>`;
  $('salesTables').querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { S.sales = S.sales.filter(x => x.t !== +b.dataset.t); saveS(); renderSales(); }));
}

// ================= DETAIL SHEET =================
function closeSheet(d) { if (typeof d.close === 'function') d.close(); else { d.removeAttribute('open'); d.dispatchEvent(new Event('close')); } }
function openSheet(id) { const d = $(id); if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
document.querySelectorAll('dialog.sheet').forEach(d => {
  const head = d.querySelector('.sheethead'); let y0 = null, dy = 0;
  head.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; d.style.transition = 'none'; }, { passive: true });
  head.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); d.style.transform = `translateY(${dy}px)`; }, { passive: true });
  head.addEventListener('touchend', () => { d.style.transition = 'transform .2s ease-out'; if (dy > 90) closeSheet(d); d.style.transform = ''; y0 = null; });
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) closeSheet(d); });
});
function anyStats(id) {
  for (const src of [AGG && AGG.data, WR && WR.sell]) if (src && src[id]) return src[id];
  return null;
}
function openDetail(id, x) {
  x = x || { kind: 'item', id };
  $('detailTitle').textContent = nm(id); $('detailIcon').innerHTML = iconImg(id, 'ico lg');
  const p = anyStats(id);
  const hq = x.hq != null ? x.hq : false;
  const s = x.s || stat(p, hq);
  const tags = [];
  if (x.kind === 'craft') tags.push([JOBS[x.ct] + ' ' + x.lvl, 'gold']);
  if (x.kind === 'gather') tags.push([x.jobs.join('/') + ' ' + x.g[1], 'gold']);
  if (hq) tags.push(['HQ']);
  if (s.stale && p) tags.push(['stale price', 'warn']);
  $('detailTags').innerHTML = tags.map(t => `<span class="tag ${t[1] || ''}">${esc(t[0])}</span>`).join('');
  const sug = suggest(s);
  let h = '';
  if (sug) h += `<div class="callout ${sug.dip ? 'warn' : ''}"><div class="muted" style="font-size:13px">Suggested list price</div><b>${fmt(sug.price)} gil</b>
    <div class="muted" style="font-size:14px;margin-top:2px">${sug.inflated ? 'Current listings are far above what this actually sells for, so this is the typical sale price instead. Don’t trust those listings.' : sug.dip ? 'Heads up: the cheapest listing is well below the usual price. Someone may be dumping; consider waiting.' : 'One gil under the cheapest listing on ' + esc(S.world) + '.'}</div></div>`;
  else h += `<div class="callout"><div class="muted" style="font-size:14px">No price data yet. Scan from a tab, or check the market history below.</div></div>`;
  h += `<div class="section"><h4>Market on ${esc(S.world)}</h4><div class="kv">
    <div>Fair price (blended)</div><div class="v">${fmt(s.fair)}</div>
    <div>Recent average sale</div><div class="v ${s.spike ? 'stale' : ''}">${fmt(s.avg)}${s.spike ? ' ⚠︎' : ''}</div>
    <div>Data center average</div><div class="v">${fmt(s.dcAvg)}</div>
    <div>Cheapest listing</div><div class="v">${s.min ? fmt(s.min) : 'none'}</div>
    <div>Sales per day (7 days)</div><div class="v">${s.vel ? s.vel.toFixed(1) : '0'}</div>
    <div>Units for sale</div><div class="v" id="liveUnits">…</div>
    <div>Days of supply</div><div class="v" id="liveSupply">…</div>
    <div>Last updated</div><div class="v">${ago(s.t)}</div></div></div>`;
  if (x.kind === 'craft') {
    h += `<div class="section"><h4>Profit</h4><div class="kv"><div>Sells for</div><div class="v">${fmt(x.price)}</div><div>Material cost</div><div class="v">${fmt(x.cost)}</div>
      <div>Profit each, after fees</div><div class="v ${x.profit > 0 ? 'pos' : 'neg'}">${fmt(x.profit)}</div><div>ROI</div><div class="v">${x.cost > 0 ? Math.round(x.roi * 100) + '%' : '—'}</div></div></div>`;
    h += `<div class="section"><h4>Materials per craft</h4><div class="kv"><div class="h">Material</div><div class="h" style="text-align:right">Each</div>${x.lines.map(l =>
      `<div>${l.n} × ${esc(nm(l.id))}</div><div class="v">${l.c.cost == null ? (MARK.has(l.id) ? 'no listings' : 'not on market') : fmt(l.c.cost)}<div class="muted" style="font-size:12px;font-weight:400">${l.c.src === 'craft' ? 'Craft (' + JOBS[l.c.rec[1]] + ')' : l.c.src === 'gather' ? 'Gather' : l.c.src === 'buy' ? 'Buy' : ''}</div></div>`).join('')}</div></div>`;
    if (x.sellMats) h += `<div class="callout warn" style="margin-top:14px"><b style="font-size:16px">Better idea: sell the materials</b><div class="muted" style="font-size:14px">The materials would sell for about ${fmt(x.matSell)} on ${esc(S.world)}, more than this item earns (${fmt(x.price * taxS())} after fees).</div></div>`;
    const P1 = planSteps([[x.r, 1]], () => (suggest(x.s) || {}).price || x.price);
    h += `<div class="section"><h4>How to make one</h4><p class="muted" style="margin:0 0 8px;font-size:14px">About ${Math.round(P1.minutes)} min · ~${fmtK(x.gph)} gil/hr · materials ~${fmt(P1.spend)}</p>${P1.html}</div>`;
    if (x.hqAssumed) h += `<p class="muted" style="font-size:13.5px">Priced as HQ. Add your stats in Settings so the app can tell when you’d only make NQ.</p>`;
    h += `<div id="simHere"></div>`;
    if (x.statOk != null) h += `<div class="section"><h4>Stat check (rough)</h4><p style="margin:0" class="${x.statOk ? 'pos' : 'stale'}">${x.statOk ? 'Your stats meet this recipe’s suggested and required Craftsmanship and Control.' : 'Your stats are below this recipe’s suggested or required values; HQ may be hard.'}</p></div>`;
  }
  if (x.kind === 'gather' && x.g && x.g[6]) h += `<p class="stale" style="font-size:14px">${x.g[6] & 1 ? 'Only on legendary nodes: you need the matching folklore tome (bought with gatherer scrips).' : 'Needs a quest before you can gather it.'}</p>`;
  if (x.kind === 'gather') {
    const g = x.g, t = timedState(g[4]);
    h += `<div class="section"><h4>Where to gather</h4><div class="kv"><div>Gatherer</div><div class="v">${x.jobs.join(' / ')} · level ${g[1]}</div>
      <div>Expansion</div><div class="v">${EXP.filter((_, i) => g[2] & (1 << i)).join(', ') || '—'}</div>
      ${g[3].length ? `<div>Zones</div><div class="v">${g[3].map(esc).join('<br>')}</div>` : ''}
      ${g[4].length ? `<div>Timed windows (ET)</div><div class="v">${g[4].map(([a, d]) => etFmt(a) + '–' + etFmt((a + d) % 1440)).join('<br>')}</div><div>Right now</div><div class="v ${t && t.up ? 'pos' : ''}">${timedLabel(t)}</div>` : ''}
    </div></div>`;
  }
  if (x.kind === 'vendor') h += `<div class="section"><h4>Flip</h4><div class="kv"><div>Vendor price</div><div class="v">${fmt(x.cost)}</div><div>Profit each, after fees</div><div class="v pos">${fmt(x.profit)}</div>${x.where ? `<div>Sold by</div><div class="v" style="font-weight:400">${esc(x.where).replace(/ or /g, '<br>')}</div>` : ''}</div>${x.unlock ? '<p class="stale" style="font-size:14px">This vendor needs a quest or rank before it sells this.</p>' : ''}</div>`;
  if (x.kind === 'world') h += `<div class="section"><h4>Flip</h4><div class="kv"><div>Buy on</div><div class="v">${esc(x.buyWorld)}</div><div>Cheapest there</div><div class="v">${fmt(x.buyEach)} each</div><div>Profit each, after fees</div><div class="v pos">${fmt(x.profit)}</div></div></div>`;
  h += `<div class="section"><h4>Selling it</h4><div class="kv" id="sellBox"><div>Checking competition…</div><div></div></div></div>`;
  const al = (S.alerts || {})[id] || {};
  h += `<div class="section"><h4>Melded or plain?</h4><button class="btn small" id="meldCheck">Compare melded vs plain listings</button><div id="meldOut" class="muted" style="margin-top:8px;font-size:14px"></div></div>`;
  h += `<div class="section"><h4>Price alert</h4><div class="grid2"><label class="field"><span>Tell me below</span><input type="number" id="alBelow" min="0" inputmode="numeric" value="${al.below || ''}" placeholder="e.g. 8000"></label><label class="field"><span>Tell me above</span><input type="number" id="alAbove" min="0" inputmode="numeric" value="${al.above || ''}" placeholder="e.g. 15000"></label></div><button class="btn small" id="alSave" style="margin-top:8px">Save alert</button></div>`;
  h += `<div class="section"><h4>Last 30 days</h4><div id="histBox" class="muted">Loading sales history…</div></div>`;
  h += `<div class="actions" id="detailActions"></div>
    <div class="links"><a href="https://universalis.app/market/${id}" target="_blank" rel="noopener">Universalis</a><a href="https://www.garlandtools.org/db/#item/${id}" target="_blank" rel="noopener">Garland Tools</a></div>`;
  $('detailBody').innerHTML = h;
  const act = $('detailActions');
  const mk = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', fn); act.append(b); return b; };
  if (x.kind === 'craft') { const b = mk(batch.has(x.rid) ? 'Remove from batch' : 'Add to batch', () => { inBatchToggle(x); b.textContent = batch.has(x.rid) ? 'Remove from batch' : 'Add to batch'; }, 'primary'); }
  const wb = mk(S.watch.includes(id) ? 'Unstar' : 'Star', () => { toggleWatch(id); wb.textContent = S.watch.includes(id) ? 'Unstar' : 'Star'; rerender(); });
  const lb = mk(S.listed.includes(id) ? 'Stop tracking listing' : 'I listed this', () => { toggleListed(id); lb.textContent = S.listed.includes(id) ? 'Stop tracking listing' : 'I listed this'; });
  mk('Log a sale', () => { closeSheet($('detail')); prefillSale(id); });
  $('meldCheck').addEventListener('click', async () => {
    const o = $('meldOut'); o.textContent = 'Checking…';
    try {
      const m = await fetchMarket(S.world, [id], { listings: 60, entries: 0, listingFields: ['pricePerUnit', 'hq', 'quantity', 'retainerName', 'materia'] });
      const L = (m[id] && m[id].L) || [], plain = L.filter(l => !l[4]).map(l => l[0]), meld = L.filter(l => l[4] > 0).map(l => l[0]);
      if (!meld.length || !plain.length) { o.textContent = meld.length ? 'Every listing is melded, so there’s nothing to compare.' : 'No melded copies listed right now.'; return; }
      const a = median(plain), b = median(meld), d = (b - a) / a;
      o.innerHTML = `Plain copies list around <b>${fmt(a)}</b>, melded around <b>${fmt(b)}</b> (${d >= 0 ? '+' : ''}${Math.round(d * 100)}%). ${d > 0.25 ? 'Melding could pay if your materia costs less than the difference. Listings only, so check that melded ones actually sell.' : 'Melding doesn’t add much value here.'}`;
    } catch (e) { o.textContent = 'Couldn’t check right now.'; }
  });
  $('alSave').addEventListener('click', () => {
    const below = +$('alBelow').value || 0, above = +$('alAbove').value || 0;
    S.alerts = S.alerts || {};
    if (below || above) { S.alerts[id] = { below, above }; if (!S.watch.includes(id)) S.watch.push(id); toast('Alert saved'); }
    else { delete S.alerts[id]; toast('Alert removed'); }
    saveS(); checkAlerts();
  });
  if (x.kind === 'craft' && $('simHere')) $('simHere').replaceWith(simSection(x.r));
  openSheet('detail');
  loadHistory(id, hq);
  loadLive(id, hq, s, x);
}
async function loadLive(id, hq, s0, x) {
  try {
    const m = await fetchMarket(S.world, [id], { listings: 40, entries: 0, listingFields: ['pricePerUnit', 'hq', 'quantity'] });
    if ($('detailTitle').textContent !== nm(id)) return;
    const p = m[id] || {}, units = p.u || 0, vel = s0.vel;
    liveCache[id] = p.L || [];
    $('liveUnits').textContent = fmt(units);
    $('liveSupply').textContent = supplyLabel({ units, supply: vel > 0 ? units / vel : (units ? Infinity : 0) });
    const mk = marketFor(id, hq, s0), c = confOf(x && x.s ? x : { id, s: s0, hq });
    $('sellBox').innerHTML = `<div>Competing listings near the lowest</div><div class="v">${mk.competitors ?? '—'}</div>
      <div>You’d likely sell</div><div class="v">${mk.yourRate.toFixed(1)} a day</div>
      <div>Time to sell one</div><div class="v">${daysTxt(mk.daysFor(1))}</div>
      <div>Time to sell 5</div><div class="v">${daysTxt(mk.daysFor(5))}</div>
      ${mk.trend != null ? `<div>Price trend (week vs month)</div><div class="v ${mk.trend < -0.08 ? 'neg' : mk.trend > 0.08 ? 'pos' : ''}">${trendTxt(mk.trend)}</div>` : ''}
      <div>How to price it</div><div class="v" style="font-weight:400;text-align:left;grid-column:1/-1">${esc(listAdvice(id, hq, s0).how)}</div>
      <div>Confidence</div><div class="v">${c.level}<div class="muted" style="font-size:12px;font-weight:400">${esc(c.why)}</div></div>`;
  } catch (e) { if ($('liveUnits')) { $('liveUnits').textContent = '—'; $('liveSupply').textContent = '—'; $('sellBox').innerHTML = '<div class="muted">Couldn’t check listings right now.</div><div></div>'; } }
}
async function loadHistory(id, hq) {
  const box = $('histBox');
  try {
    const all = await fetchHistory(id);
    if ($('detailTitle').textContent !== nm(id)) return;
    let E = all.filter(e => !!e[1] === hq); if (E.length < 3) E = all;
    const m0 = median(E.map(e => e[0])); const odd = E.filter(e => e[0] > m0 * 3 || e[0] < m0 / 3).length;
    E = E.filter(e => e[0] <= m0 * 3 && e[0] >= m0 / 3);
    if (!E.length) { box.textContent = `No sales on ${S.world} in the last 30 days.`; return; }
    const now = Date.now() / 1000, wk = now - 7 * 86400;
    const avg = a => { const q = a.reduce((s, e) => s + e[2], 0); return q ? a.reduce((s, e) => s + e[0] * e[2], 0) / q : 0; };
    const recent = E.filter(e => e[3] >= wk), older = E.filter(e => e[3] < wk);
    const a7 = avg(recent), aOld = avg(older);
    const trend = a7 && aOld ? (a7 - aOld) / aOld : null;
    const dayQ = Array(7).fill(0), hourQ = Array(8).fill(0);
    E.forEach(e => { const d = new Date(e[3] * 1000); dayQ[d.getDay()] += e[2]; hourQ[Math.floor(d.getHours() / 3)] += e[2]; });
    const maxD = Math.max(...dayQ) || 1, bestD = dayQ.indexOf(Math.max(...dayQ)), bestH = hourQ.indexOf(Math.max(...hourQ));
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const hourLbl = i => { const f = h => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }); return f(i * 3) + '–' + f((i * 3 + 3) % 24); };
    const units = E.reduce((s, e) => s + e[2], 0);
    const arrow = trend == null ? '' : trend > 0.05 ? `<span class="pos">▲ ${Math.round(trend * 100)}%</span>` : trend < -0.05 ? `<span class="neg">▼ ${Math.round(-trend * 100)}%</span>` : '<span>steady</span>';
    box.classList.remove('muted');
    const buckets = Array(15).fill(0).map((_, i) => median(E.filter(e => e[3] >= now - (30 - 2 * i) * 86400 && e[3] < now - (28 - 2 * i) * 86400).map(e => e[0])));
    box.innerHTML = `${spark(buckets, 300, 54) ? `<div class="dspark">${spark(buckets, 300, 54)}</div>` : ''}<div class="kv"><div>Typical price (median)</div><div class="v">${fmt(median(E.map(e => e[0])))}</div>${odd ? `<div>Odd sales ignored</div><div class="v stale">${odd}</div>` : ''}<div>Average this week</div><div class="v">${fmt(a7 || aOld)} ${arrow}</div>
      <div>Average the 3 weeks before</div><div class="v">${aOld ? fmt(aOld) : '—'}</div>
      <div>Sold in 30 days</div><div class="v">${fmt(units)} units</div>
      <div>Best day</div><div class="v">${days[bestD]}</div><div>Busiest hours (your time)</div><div class="v">${hourLbl(bestH)}</div></div>
      <div class="row" style="margin:10px 0 4px"><button class="btn small" id="calAdd">Add “list it” to my calendar</button></div>
      <div class="bars" aria-hidden="true">${dayQ.map((q, i) => `<div class="${i === bestD ? 'top' : ''}" style="height:${Math.max(4, 100 * q / maxD)}%"></div>`).join('')}</div>
      <div class="barlbl" aria-hidden="true">${days.map(d => `<span>${d}</span>`).join('')}</div>`;
    $('calAdd').addEventListener('click', () => {
      const d = new Date(); d.setHours(bestH * 3, 0, 0, 0);
      let add = (bestD - d.getDay() + 7) % 7; if (add === 0 && d < new Date()) add = 7; d.setDate(d.getDate() + add);
      const f = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const end = new Date(d.getTime() + 30 * 60000);
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gil Ledger//EN', 'BEGIN:VEVENT', `UID:${Date.now()}@gil-ledger`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`,
        `SUMMARY:List ${nm(id)} on the market board`, `DESCRIPTION:Busiest time for ${nm(id)} on ${S.world}.`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Time to list', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'list-' + id + '.ics'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(`Calendar event for ${days[bestD]} ${hourLbl(bestH)}`);
    });
  } catch (e) {
    if ($('detailTitle').textContent === nm(id)) box.textContent = 'Couldn’t load sales history right now.';
  }
}
function rerender() { if (P.tab === 'best') renderBest(); else if (P.tab === 'crafts') renderCrafts(); else if (P.tab === 'gather') renderGather(); else if (P.tab === 'flips') renderFlips(); else if (P.tab === 'watch') renderWatch(); }
$('detail').addEventListener('close', rerender);

// ================= BEST PICKS =================
const dumped = s => s.min && s.avg && s.min < s.avg * 0.5;

// ---- 30-day sales check for Best candidates ----
// Robust summary of real sales: drop sales more than 3x away from the median, then re-measure.
// Live market picture for an item: your realistic sales rate, time to sell, trend and confidence.
function marketFor(id, hq, s) {
  const V = AGG && AGG.verify && AGG.verify[id], v = V && V[hq ? 'H' : 'N'];
  const L = (V && V.L ? V.L : (liveCache[id] || [])).filter(l => !!l[1] === !!hq).sort((a, b) => a[0] - b[0]);
  const perDay = v ? v.perDay : (s ? s.vel : 0);
  const low = L.length ? L[0][0] : 0;
  const tier = L.filter(l => l[0] <= low * 1.15).length;   // listings close enough to the lowest to compete with you
  const known = !!(V && V.L) || !!liveCache[id];
  const yourRate = known ? perDay / (tier + 1) : perDay / 2; // unknown competition: assume one rival
  return { perDay, competitors: known ? tier : null, yourRate, daysFor: q => yourRate > 0 ? q / yourRate : Infinity, trend: v ? v.trend : null, v };
}
function listAdvice(id, hq, s) {
  const mk = marketFor(id, hq, s);
  const L = (liveCache[id] || (AGG && AGG.verify && AGG.verify[id] && AGG.verify[id].L) || []).filter(l => !!l[1] === !!hq).sort((a, b) => a[0] - b[0]);
  const low = L.length ? L[0][0] : s.min;
  let r;
  if (s.inflated || !low) r = { price: Math.round(s.fair || s.price || 0), how: 'Listings look overpriced, so list near the typical sale price.' };
  else if ((mk.competitors || 0) >= 3 && mk.perDay < 1) r = { price: low, how: `Match ${fmt(low)} instead of undercutting. It sells slowly and ${mk.competitors} sellers are already there, so undercutting just starts a price war.` };
  else r = { price: Math.max(1, low - 1), how: `Undercut by 1 gil to ${fmt(low - 1)}; it moves fast enough that being cheapest pays.` };
  return floorGuard(id, r);
}
// Never suggest listing below what it cost you to make or buy.
function floorGuard(id, r) {
  const c = costOf(id);
  if (c && r.price < c / taxS()) { r.below = true; r.how += ` Careful: that's below your cost (~${fmt(c)}), so you'd lose money. Hold, or list at ${fmt(Math.ceil(c / taxS()))} or more and wait.`; }
  return r;
}
function confOf(x) {
  const id = x.res ?? x.id, s = x.s;
  const V = AGG && AGG.verify && AGG.verify[id], v = V && V[x.hq ? 'H' : 'N'];
  let score = 0;
  if (v) { if (v.n >= 10) score += 2; else if (v.n >= 4) score += 1; if (v.spread < 0.35) score += 1; if (s.t && Date.now() - s.t < 24 * 3600000) score += 1;
    return { level: score >= 3 ? 'High' : score >= 2 ? 'Medium' : 'Low', why: `${v.n} sales in 30 days` }; }
  if (s.vel >= 1) score++; if (!s.stale) score++; if (nrefsOf(s) >= 3) score++;
  if (suspicious(s)) score = 0;
  return { level: score >= 3 ? 'Medium' : 'Low', why: 'not yet checked against sales history' };
}
function spark(vals, w = 120, h = 28) {
  const pts = vals.map((v, i) => [i, v]).filter(p => p[1] > 0); if (pts.length < 3) return '';
  const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), n = vals.length - 1 || 1;
  const xy = pts.map(([i, v]) => `${(i / n * (w - 4) + 2).toFixed(1)},${(h - 3 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (h - 6)).toFixed(1)}`);
  const up = ys[ys.length - 1] >= ys[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${xy.join(' ')}" fill="none" stroke="${up ? 'var(--good)' : 'var(--bad)'}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function sparkFor(id, hq) { const v = AGG && AGG.verify && AGG.verify[id] && AGG.verify[id][hq ? 'H' : 'N']; return v && v.sp ? spark(v.sp) : ''; }
const trendTxt = tr => tr == null ? '' : tr > 0.08 ? `▲ ${Math.round(tr * 100)}%` : tr < -0.08 ? `▼ ${Math.round(-tr * 100)}%` : 'steady';
const daysTxt = d => !isFinite(d) ? 'slow' : d < 0.5 ? 'under a day' : d < 1.5 ? 'about a day' : `about ${Math.round(d)} days`;
const liveCache = {};
function robustSales(entries, hq) {
  const E = entries.filter(e => !!e.hq === hq);
  if (!E.length) return null;
  const m0 = median(E.map(e => e.pricePerUnit));
  const keep = E.filter(e => e.pricePerUnit <= m0 * 3 && e.pricePerUnit >= m0 / 3);
  const units = keep.reduce((s, e) => s + (e.quantity || 1), 0);
  const now = Date.now() / 1000, wk = now - 7 * 86400;
  const p7 = keep.filter(e => e.timestamp >= wk).map(e => e.pricePerUnit), pOld = keep.filter(e => e.timestamp < wk).map(e => e.pricePerUnit);
  const m7 = median(p7), mOld = median(pOld);
  const sorted = keep.map(e => e.pricePerUnit).sort((a, b) => a - b), q = f => sorted[Math.floor(f * (sorted.length - 1))] || 0;
  const med = median(sorted);
  const sp = Array(15).fill(0).map((_, i) => median(keep.filter(e => e.timestamp >= now - (30 - 2 * i) * 86400 && e.timestamp < now - (28 - 2 * i) * 86400).map(e => e.pricePerUnit)));
  return { n: keep.length, odd: E.length - keep.length, med, perDay: units / 30, sp,
    trend: m7 && mOld && p7.length >= 2 && pOld.length >= 2 ? (m7 - mOld) / mOld : null, spread: med ? (q(0.75) - q(0.25)) / med : 1 };
}
async function fetchVerify(ids) {
  const out = {}, queue = [];
  for (let i = 0; i < ids.length; i += 50) { let b = ids.slice(i, i + 50); if (b.length === 1) b = b[0] === 2 ? [2, 3] : [b[0], 2]; queue.push(b); }
  try {
    const live = await fetchMarket(S.world, ids, { listings: 40, entries: 0, listingFields: ['pricePerUnit', 'hq', 'quantity'] });
    for (const [id, p] of Object.entries(live)) { out[id] = out[id] || {}; out[id].L = p.L || []; }
  } catch (e) {}
  await Promise.all(queue.map(async b => {
    const url = `https://universalis.app/api/v2/history/${encodeURIComponent(S.world)}/${b.join(',')}?entriesToReturn=150&entriesWithin=2592000`;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(900 * attempt);
      try {
        const res = await fetch(url); if (!res.ok) continue;
        const j = await res.json();
        for (const [id, v] of Object.entries(j.items || {})) {
          const en = v.entries || [];
          out[id] = Object.assign(out[id] || {}, { N: robustSales(en, false), H: robustSales(en, true) });
        }
        return;
      } catch (e) {}
    }
  }));
  return out;
}
function bestCandidates() {
  const mask = exMask(), ok = s => !s.stale && !suspicious(s) && !dumped(s);
  return {
    crafts: craftResults.filter(x => !x.missing && !x.sellMats && x.profit >= 1500 && x.roi >= 0.3 && x.vel >= 0.5 && x.statOk !== false && ok(x.s)).sort((a, b) => b.daily - a.daily).slice(0, 15),
    gather: gatherResults.filter(x => x.price >= 50 && x.vel >= 1 && (x.g[2] & mask) && ok(x.s)).sort((a, b) => b.daily - a.daily).slice(0, 15),
    vendor: flipsFor('vendor').filter(x => x.whereKnown && !x.unlock && x.profit >= 800 && x.roi >= 0.5 && x.vel >= 0.5 && ok(x.s)).sort((a, b) => b.daily - a.daily).slice(0, 15),
    world: flipsFor('world').filter(x => x.profit >= 2000 && x.roi >= 0.3 && x.vel >= 0.5 && ok(x.s) && x.buyEach < x.s.fair * 0.9).sort((a, b) => b.daily - a.daily).slice(0, 15),
  };
}
function bestPicks() {
  if (!AGG) return null;
  const C = bestCandidates(), V = AGG.verify;
  const fee = taxS(), MIN = { crafts: 1500, gather: 0, vendor: 800, world: 2000 }, GPH = { crafts: 30000, gather: 20000, vendor: 30000, world: 30000 };
  const out = {};
  for (const [k, list] of Object.entries(C)) {
    out[k] = list.map(x => {
      const id = x.res ?? x.id;
      if (!V) return Object.assign({}, x, { ver: null, conf: confOf(x) });
      const v = V[id] && V[id][x.hq ? 'H' : 'N'];
      if (!v || v.n < 3) return null; // fewer than 3 real sales in 30 days: not dependable
      const s = x.s, sell = s.min && !s.inflated && s.min <= v.med * 1.5 ? Math.min(v.med, s.min) : v.med;
      const cost = k === 'gather' ? 0 : x.cost;
      const profit = sell * fee - cost;
      const mk = marketFor(id, x.hq, s);
      const realistic = profit * mk.yourRate;
      const gph = x.minutes ? profit * (x.kind === 'craft' ? (x.amt || 1) : 1) / x.minutes * 60 : 0;
      const conf = confOf(x);
      if (profit < MIN[k] || (cost > 0 && profit / cost < 0.3) || mk.yourRate < (k === 'gather' ? 0.5 : 0.15) || conf.level === 'Low' || gph < GPH[k]) return null;
      const tf = mk.trend == null ? 1 : mk.trend < -0.15 ? 0.7 : mk.trend > 0.1 ? 1.1 : 1;
      return Object.assign({}, x, { price: sell, profit, daily: realistic, vel: mk.yourRate, roi: cost ? profit / cost : 0, ver: v, mk, conf, gph,
        score: realistic * tf * (conf.level === 'High' ? 1 : 0.8) * ({ staple: 1.2, under: 0.6, stuck: 0.5 }[outcomeOf(id)] || 1), mine: outcomeOf(id) });
    }).filter(Boolean).sort((a, b) => (b.score ?? b.daily) - (a.score ?? a.daily)).slice(0, 3);
  }
  return out;
}
function pickCard(n, x, lines, buttons, start) {
  const el = document.createElement('div'); el.className = 'pick' + (start ? ' start' : '');
  const [summary, ...rest] = lines;
  el.innerHTML = (start ? '<div class="startflag">Start here</div>' : '') +
    `<div class="pickhead"><span class="n">${n}</span>${iconImg(x.id ?? x.res, 'ico sm')}<b>${esc(nm(x.id ?? x.res))}</b><span class="earn">+${fmtK(x.profit)}</span></div>
     <p class="sum">${summary}${x.ver ? `<br><span class="verified">✓ ${x.ver.n} real sales in 30 days, typically ${fmtK(x.ver.med)}${x.ver.odd ? ` · ${x.ver.odd} odd sale${x.ver.odd > 1 ? 's' : ''} ignored` : ''}</span>` : ''}</p>
     ${x.conf ? `<div class="pchips"><span class="pc ${x.conf.level.toLowerCase()}">${x.conf.level} confidence</span>${x.mk ? `<span class="pc">you’d sell ~${x.mk.yourRate.toFixed(1)}/day</span><span class="pc">first sells in ${daysTxt(x.mk.daysFor(1))}</span>${x.mk.trend != null ? `<span class="pc ${x.mk.trend < -0.08 ? 'down' : x.mk.trend > 0.08 ? 'up' : ''}">${trendTxt(x.mk.trend)}</span>` : ''}` : ''}${x.gph ? `<span class="pc">~${fmtK(x.gph)}/hr</span>` : ''}</div>` : ''}
     ${sparkFor(x.id ?? x.res, x.hq) ? `<div class="psp">${sparkFor(x.id ?? x.res, x.hq)}<span class="muted">30 days</span></div>` : ''}
     <details class="how"><summary>How to do it</summary>${rest.map(l => l.startsWith('<div') ? l : `<p>${l}</p>`).join('')}</details>
     <div class="row pickbtns"></div>`;
  const row = el.querySelector('.pickbtns');
  buttons.forEach(([label, fn, cls]) => { const b = document.createElement(fn.href ? 'a' : 'button'); b.className = 'btn small ' + (cls || ''); b.textContent = label;
    if (fn.href) { b.href = fn.href; b.target = '_blank'; b.rel = 'noopener'; } else b.addEventListener('click', () => fn(b)); row.append(b); });
  return el;
}
function bestSection(title, sub, picks, render, emptyMsg) {
  const sec = document.createElement('section'); sec.className = 'bestsec';
  sec.innerHTML = `<div class="sechead"><h3>${esc(title)}</h3><span class="muted">${esc(sub)}</span></div>`;
  if (!picks.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = emptyMsg; sec.append(e); }
  else picks.forEach((x, i) => sec.append(render(x, i)));
  return sec;
}
function alertHits() {
  const hits = [];
  for (const [k, a] of Object.entries(S.alerts || {})) {
    const id = +k, p = (WR && WR.sell[id]) || (AGG && AGG.data[id]); if (!p) continue;
    const low = Math.min(...[p.mN, p.mH].filter(v => v > 0)), s = stat(p, false);
    if (a.below && isFinite(low) && low <= a.below) hits.push({ id, msg: `${nm(id)} is listed at ${fmt(low)} (your alert: below ${fmt(a.below)})` });
    if (a.above && s.fair && s.fair >= a.above) hits.push({ id, msg: `${nm(id)} is selling around ${fmt(s.fair)} (your alert: above ${fmt(a.above)})` });
  }
  return hits;
}
function checkAlerts(notify) {
  const hits = alertHits();
  $('tab-watch').classList.toggle('dot', hits.length > 0);
  dirty.add('best'); if (P.tab === 'best') renderIfDirty('best');
  if (notify && hits.length) toast(`🔔 ${hits.length} price alert${hits.length > 1 ? 's' : ''} triggered`);
  return hits;
}
function crashes() {
  const V = (AGG && AGG.verify) || {}, out = [];
  for (const id of new Set(S.watch.concat(S.listed))) { const v = V[id] && (V[id].N || V[id].H); if (v && v.trend != null && v.trend < -0.25 && v.n >= 4) out.push({ id, tr: v.trend }); }
  return out.sort((a, b) => a.tr - b.tr);
}
function crashBanner(el) {
  const c = crashes(); if (!c.length) return;
  const b = document.createElement('div'); b.className = 'callout warn'; b.style.marginBottom = '14px';
  b.innerHTML = `<div class="muted" style="font-size:13px">📉 Prices falling fast</div>` + c.map(x => `<div class="alertrow" data-id="${x.id}">${esc(nm(x.id))} · down ${Math.round(-x.tr * 100)}% this week. Consider selling now or holding off on crafting more.</div>`).join('');
  b.querySelectorAll('.alertrow').forEach(r => r.addEventListener('click', () => openDetail(+r.dataset.id, { kind: 'item', id: +r.dataset.id })));
  el.append(b);
}
function alertBanner(el) {
  const hits = alertHits(); if (!hits.length) return;
  const b = document.createElement('div'); b.className = 'callout alert'; b.style.marginBottom = '14px';
  b.innerHTML = `<div class="muted" style="font-size:13px">🔔 Price alerts</div>` + hits.map(h => `<div class="alertrow" data-id="${h.id}">${esc(h.msg)}</div>`).join('');
  b.querySelectorAll('.alertrow').forEach(r => r.addEventListener('click', () => openDetail(+r.dataset.id, { kind: 'item', id: +r.dataset.id })));
  el.append(b);
}
// ================= PLAYBOOK (researched strategies, not price guesses) =================
// Each entry is a method that current guides recommend. Figures are what those sources report,
// attributed and dated; the app's own live numbers are only used for the matching tools.
const SRC = {
  xp: ['XIV Profitability: every gil method ranked (updated Nov 1, 2026)', 'https://xivprofitability.com/guides/how-to-make-gil-ffxiv'],
  ts: ['TimeSaver: gil per hour methods, Patch 7.5x', 'https://timesaver.gg/blog/ffxiv-how-to-make-gil-fast'],
  tsn: ['TimeSaver: gil without crafting or gathering, Patch 7.55', 'https://timesaver.gg/blog/ffxiv-make-gil-without-crafting-gathering'],
  mg: ['MMOGAH: 2026 efficient gil methods', 'https://www.mmogah.com/news/ffxiv/2026-efficient-gil-making-methods-in-ffxiv-no-crafting-required'],
  gcw: ['FFXIV Online Wiki: Grand Company', 'https://ffxiv.consolegameswiki.com/wiki/GC'],
  forum: ['Official forums: players buying and reselling GC turn-in items', 'https://forum.square-enix.com/ffxiv/threads/405284'],
  ui: ['Official UI guide: checking supply and provisioning requests', 'https://na.finalfantasyxiv.com/uiguide/faq/faq-other/gc_smissions.html'],
  ge: ['Gamer Escape: Supply and Provisioning Missions', 'https://ffxiv.gamerescape.com/wiki/Supply_and_Provisioning_Mission'],
  prima: ['Prima Games: Grand Company ranks and seal caps', 'https://primagames.com/tips/final-fantasy-xiv-grand-company-ranks-guide-2022'],
  cq: ['Conquest Capped: gil farming, Patch 7.4', 'https://conquestcapped.com/guides/ffxiv/gil-farming/'],
};
Object.entries(STRAT.sources || {}).forEach(([k, v]) => { SRC[k] = [v.label, v.url]; });
const EXTRA_TOOLS = {
  chain: ['Open Gather → craft', () => { P.gatherMode = 'chain'; saveP(); showTab('gather'); renderGather(); }],
  fcw: ['Open Crafts → FC workshop', () => { P.craftMode = 'fcw'; saveP(); showTab('crafts'); renderCrafts(); }],
  reduce: ['Open Gather → Reduction', () => { P.gatherMode = 'reduce'; saveP(); showTab('gather'); renderGather(); }],
  materia: ['See materia prices', () => { P.flipMode = 'materia'; saveP(); showTab('flips'); renderFlips(); }],
};
const goTo = (tab, set) => () => { if (set) set(); saveP(); showTab(tab); if (typeof computeFlips === 'function') { computeFlips(); } renderAllViews(); };
const PLAYS = [
  { id: 'gcsell', title: 'Sell Grand Company turn-in items', kind: 'Daily · steady demand',
    fit: () => ({ ok: true, why: 'Your level-80 crafters and high gatherers can make most of the turn-in items players need.' }),
    sum: 'Players leveling crafters and gatherers buy the items their Grand Company asks for every day. Make or gather those items, especially HQ, and sell them.',
    steps: ['Open Crafts → GC turn-ins. It lists every item the game’s supply tables ask for that you can make or gather, priced against your costs.',
      'Tap “Check today’s demand”: items selling far faster than usual today are likely on today’s request lists.',
      'Make crafted items HQ. Buyers want HQ because it doubles their seals and EXP.',
      'List in the quantity a turn-in needs (the card shows it), so one purchase covers someone’s whole request.',
      'Relist after the daily reset, when new requests go out.'],
    reported: 'Players on the official forums describe buying stacks for turn-ins and listing the rest in turn-in quantities, saying they always sell. They note each level range only has about a dozen possible items, so the same items come up again and again. HQ turn-ins pay double seals and EXP.',
    src: ['forum', 'gcw', 'ui'], tool: ['Open Crafts → GC turn-ins', goTo('crafts', () => { P.craftMode = 'gcd'; })] },
  { id: 'gc', title: 'Do your own Grand Company turn-ins', kind: 'Daily · 10 min',
    fit: () => ({ ok: true, why: 'You have crafters and gatherers for the daily requests.' }),
    sum: 'Turn in today’s requested crafted and gathered items for seals and EXP. HQ turn-ins pay double. Then turn seals into things that sell.',
    steps: ['Open Timers → Missions (or talk to your Personnel Officer) to see today’s Supply and Provisioning requests. There’s one per crafter and gatherer, and it resets daily.',
      'Make or buy each item, in HQ when possible: HQ doubles both the seals and the EXP.',
      'Once you’re Sergeant Second Class, use Expert Delivery to trade unneeded gear for seals.',
      'Spend seals on whatever is worth the most gil right now (the GC seals list in Flips → Currencies), or on Ventures for your retainers.',
      'Watch your seal cap: it rises with rank, up to 90,000 at Captain. Seals over the cap are wasted.'],
    reported: 'These missions pay seals and EXP, not gil directly. The gil comes from what the seals buy.',
    src: ['gcw', 'ge', 'prima', 'xp'], tool: ['Check today’s turn-ins', () => { const c = $('gcCard'); if (c) { c.open = true; c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }], gcHelper: true },
  { id: 'craft', title: 'Craft what sells, timed to patches', kind: 'Active · biggest ceiling',
    fit: () => { const m = Math.max(...S.jobLv.filter((_, i) => S.jobOn[i])); return m >= 50 ? { ok: true, why: `Your crafters are up to level ${m}.` } : { ok: false, why: 'Needs crafters around level 50+.' }; },
    sum: 'Craft items with a good margin that also sell every day. Demand peaks right after a patch.',
    steps: ['Pick items with both a healthy margin and steady daily sales, not just a big margin.', 'Make them HQ when you can; HQ usually sells for more.', 'Don’t list more than about a day’s worth of sales at once.', 'Raid food and potions sell every week; housing, glamour and new-patch items spike around updates.'],
    reported: 'Sources put experienced crafters at roughly 1–5 million gil an hour, and say rates swing heavily with your server and the patch cycle.',
    src: ['xp', 'ts'], tool: ['Open Crafts', goTo('crafts', () => { P.craftMode = 'sell'; })] },
  { id: 'gather', title: 'Timed nodes and old-world materials', kind: 'Active · no startup cost',
    fit: () => (Math.max(+S.gLv[0] || 0, +S.gLv[1] || 0) >= 50 ? { ok: true, why: `Miner ${S.gLv[0]}, Botanist ${S.gLv[1]}.` } : { ok: false, why: 'Needs Miner or Botanist around 50+.' }),
    sum: 'Everything you gather is pure profit. Timed nodes stay valuable because supply is limited, and older-expansion materials sell because few people gather them now.',
    steps: ['Favor items that sell many units a day over rare expensive ones: a 1,500-gil item selling 30 a day beats a 20,000-gil one selling weekly.', 'Stay in one zone and work several good nodes per trip.', 'Plan timed nodes around their Eorzea-time windows.'],
    reported: 'Sources put gathering at roughly 0.5–2 million gil an hour for a reasonably geared gatherer.',
    src: ['xp'], tool: ['Open Gather → Best zones', goTo('gather', () => { P.gatherMode = 'zone'; })] },
  { id: 'vent', title: 'Retainer venture loop', kind: 'Passive · a few minutes a day',
    fit: () => ((+S.retainers || 0) > 0 ? { ok: true, why: `You have ${S.retainers} retainer${S.retainers > 1 ? 's' : ''}.` } : { ok: false, why: 'Set your number of retainers in Settings.' }),
    sum: 'Expert Delivery gives seals, seals buy Ventures, retainers bring back items, and you sell the haul.',
    steps: ['Trade unneeded gear through Expert Delivery for seals.', 'Buy Ventures with seals.', 'Send gathering retainers on targeted ventures for items that actually sell, and avoid hauls that would flood the market.', 'Collect and resend daily.'],
    reported: 'One source estimates about 2–3 million gil a week, mostly passive.',
    src: ['xp'], tool: ['Open Flips → Ventures', goTo('flips', () => { P.flipMode = 'vent'; })] },
  { id: 'scrip', title: 'Scrips from collectables and Custom Deliveries', kind: 'Weekly + farmable',
    fit: () => ({ ok: true, why: 'You’ve unlocked collectables and have Zhloe’s deliveries.' }),
    sum: 'Earn crafter and gatherer scrips from collectables and weekly Custom Deliveries, then trade them for items that sell.',
    steps: ['Do your weekly Custom Deliveries.', 'Farm low-level collectables: many tiers pay the same scrips for far less effort.', 'Spend scrips on exchange items that sell well on your world.'],
    reported: 'Guides recommend scrips-to-materials as a reliable, low-crafting gil source, especially high-level materials from the scrip vendor.',
    src: ['mg', 'xp'], tool: ['Open Crafts → Scrip farm', goTo('crafts', () => { P.craftMode = 'scrip'; })] },
  { id: 'sky', title: 'Ishgardian Restoration', kind: 'Active · you have it unlocked',
    fit: () => (expDone(1) ? { ok: true, why: 'You have the Firmament.' } : { ok: false, why: 'Needs Heavensward finished.' }),
    sum: 'Firmament turn-ins pay Skybuilders’ Scrips, which buy items at Enie’s exchange that you can resell.',
    steps: ['Craft or gather Restoration turn-ins.', 'Spend Skybuilders’ Scrips on the exchange items that sell best right now.'],
    reported: 'Listed by current guides as a scrip-to-gil route alongside Island Sanctuary.',
    src: ['xp'], tool: ['See what the scrips are worth', goTo('flips', () => { P.flipMode = 'cur'; S.curCh = 'sky'; saveS(); })] },
  { id: 'vendor', title: 'Vendor flips', kind: 'Low effort · needs some gil',
    fit: () => ({ ok: true, why: 'Only needs gil to invest.' }),
    sum: 'Some NPC items resell on the market board for far more than vendors charge.',
    steps: ['Skip seasonal and reputation-locked vendors; the app already filters these out.', 'Pick items that sell several a day, and list a few at a time.'],
    reported: 'Guides list NPC-to-market flipping as one of the strongest earners without crafting or gathering.',
    src: ['xp'], tool: ['Open Flips → Vendor items', goTo('flips', () => { P.flipMode = 'vendor'; })] },
  { id: 'world', title: 'Cross-world arbitrage', kind: 'Low effort · needs gil',
    fit: () => ({ ok: true, why: 'Any world on your data center.' }),
    sum: 'Buy items listed cheaper on another world in your data center and sell them on your home world.',
    steps: ['Set a high profit floor (around 10,000 gil per item) so the trip is worth it.', 'Check sales per day on your home world, where you’ll sell.', 'Group buys into one World Visit.'],
    reported: 'Guides recommend a higher profit floor than for other flips because of travel time.',
    src: ['xp'], tool: ['Plan world-visit trips', goTo('flips', () => { P.flipMode = 'world'; })] },
  { id: 'maps', title: 'Treasure maps with a party', kind: 'Active · social',
    fit: () => (expStarted(5) ? { ok: true, why: 'You can reach current-tier map zones.' } : { ok: false, why: 'Current-tier maps (the big earners) need Dawntrail zones; older maps pay much less.' }),
    sum: 'Join a map party. Everyone brings a map so portals chain, and the drops sell well.',
    steps: ['Gather one map a day, or buy maps cheaply on the market board.', 'Run with a full party so maps chain into portals.'],
    reported: 'Sources report roughly 1–2 million gil per chain of five current-tier (Dawntrail) maps, with heavy RNG.',
    src: ['ts', 'tsn'], tool: null },
  { id: 'daily', title: 'Dailies that pay gil directly', kind: 'Daily · predictable',
    fit: () => ({ ok: true, why: 'Available to everyone.' }),
    sum: 'Duty roulettes, hunt bills and the weekly Challenge Log pay gil straight into your pocket.',
    steps: ['Run daily roulettes on jobs you’re leveling.', 'Do hunt bills.', 'Finish Challenge Log entries; many complete through normal play.'],
    reported: 'One source estimates about 55,000 gil a week from completing 30 Challenge Log entries.',
    src: ['mg', 'xp'], tool: null },
  { id: 'doman', title: 'Doman Enclave donations', kind: 'Weekly',
    fit: () => (expDone(2) ? { ok: true, why: 'Stormblood finished.' } : { ok: false, why: 'Unlocks later in Stormblood’s story.' }),
    sum: 'Donate eligible items at the Doman Enclave instead of selling them to an NPC. Donations pay more than vendors.',
    steps: ['Save eligible items (like Allagan pieces from Wondrous Tails).', 'Donate them at the Enclave up to the weekly budget.'],
    reported: 'One source says donating doubles the NPC value, e.g. a 10,000-gil Allagan piece becomes 20,000.',
    src: ['mg'], tool: null },
  { id: 'bicolor', title: 'Bicolor Gemstone vouchers from FATEs', kind: 'Active · combat',
    fit: () => (expStarted(3) ? { ok: true, why: 'You can reach Shadowbringers+ FATEs.' } : { ok: false, why: 'Needs Shadowbringers zones.' }),
    sum: 'FATEs in newer zones pay Bicolor Gemstones; trade 100 for a voucher and sell it.',
    steps: ['Do FATEs in Shadowbringers or later zones.', 'Trade gemstones for vouchers or other sellable items.'],
    reported: 'A Patch 7.4 guide reports vouchers selling for about 150,000–180,000 gil each.',
    src: ['cq'], tool: null },
];
(STRAT.plays || []).forEach(sp => {
  const p = PLAYS.find(x => x.id === sp.id);
  if (p) Object.assign(p, { title: sp.title, kind: sp.kind, sum: sp.sum, steps: sp.steps, reported: sp.reported, src: sp.src });
  else PLAYS.push(Object.assign({ fit: () => ({ ok: true, why: '' }), tool: EXTRA_TOOLS[sp.id] || null }, sp));
});
{ const order = (STRAT.plays || []).map(p => p.id); PLAYS.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999)); }
// Value of one seal, from what seals buy and actually sell (median of the best few, to stay conservative).
function sealValue() {
  const L = currencyFlips('gc').filter(x => x.vel >= 1 && !suspicious(x.s)).sort((a, b) => b.perUnit - a.perUnit).slice(0, 5).map(x => x.perUnit);
  return L.length ? median(L) : 0;
}
function gcHelperHtml() {
  const rows = (S.gcToday || []);
  return `<details class="card" id="gcCard" style="margin-top:10px;background:var(--bg2)"><summary><b>Today’s turn-ins: buy, craft or skip?</b></summary>
    <p class="muted" style="font-size:14px;margin:8px 0">Add each requested item and the seals the game shows for it. The app prices an HQ copy and compares the cost per seal with what a seal is worth in gil.</p>
    <div class="suggest"><label class="field"><span>Add a requested item</span><input type="search" id="gcAdd" placeholder="Search item" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="gcSuggest" aria-autocomplete="list"></label><ul id="gcSuggest" role="listbox" hidden></ul></div>
    <div id="gcRows">${rows.length ? '' : '<p class="muted" style="font-size:14px;margin:8px 0 0">Nothing added yet.</p>'}</div></details>`;
}
function renderGcRows() {
  const el = $('gcRows'); if (!el) return;
  const rows = S.gcToday || [];
  if (!rows.length) { el.innerHTML = '<p class="muted" style="font-size:14px;margin:8px 0 0">Nothing added yet.</p>'; return; }
  const sv = AGG ? sealValue() : 0;
  el.innerHTML = (sv ? `<p class="muted" style="font-size:13.5px;margin:8px 0">A seal is worth about <b>${sv.toFixed(1)} gil</b> right now, based on the GC items that sell best on ${esc(S.world)}.</p>` : '<p class="muted" style="font-size:13.5px;margin:8px 0">Refresh prices to compare against seal value.</p>') +
    rows.map((r, i) => {
      const p = AGG && AGG.data[r.id], hqBuy = p && (p.xH || p.mH), craft = (BY_RESULT.get(r.id) || []).some(rc => craftable(rc)) ? unitCost(r.id).cost : null;
      const opts = [hqBuy ? ['buy HQ', hqBuy * taxB()] : null, craft != null ? ['craft', craft] : null].filter(Boolean).sort((a, b) => a[1] - b[1]);
      const best = opts[0], seals = (+r.seals || 0) * 2 * (r.qty || 1); // HQ doubles the seals
      const perSeal = best && seals ? best[1] * (r.qty || 1) / seals : null;
      const verdict = !best ? 'No price yet' : !seals ? 'Enter the seals shown' : sv && perSeal < sv * 0.8 ? `Worth it: ${best[0]} for ~${fmt(best[1] * (r.qty || 1))}, about ${perSeal.toFixed(1)} gil per seal` : sv ? `Only for EXP: costs ${perSeal.toFixed(1)} gil per seal, more than a seal is worth` : `${best[0]} for ~${fmt(best[1] * (r.qty || 1))}`;
      return `<div class="row" style="flex-wrap:nowrap;padding:8px 0;border-top:1px solid var(--line)">${iconImg(r.id, 'ico sm')}<div style="flex:1;min-width:0"><b>${esc(nm(r.id))}</b>${r.qty > 1 ? ` ×${r.qty}` : ''}<div class="muted" style="font-size:13px">${esc(verdict)}</div></div>
        <input type="number" min="0" value="${r.seals || ''}" placeholder="seals" data-gs="${i}" style="width:84px" inputmode="numeric" aria-label="Seals shown"><button class="del" data-gd="${i}" aria-label="Remove">×</button></div>`;
    }).join('');
  el.querySelectorAll('[data-gs]').forEach(inp => inp.addEventListener('change', () => { S.gcToday[+inp.dataset.gs].seals = +inp.value || 0; saveS(); renderGcRows(); }));
  el.querySelectorAll('[data-gd]').forEach(b => b.addEventListener('click', () => { S.gcToday.splice(+b.dataset.gd, 1); saveS(); renderGcRows(); }));
}
function renderPlaybook() {
  const el = $('playbook'); if (!el) return;
  // Today's turn-ins reset with the daily reset.
  const dy = nextDaily(); if (!S.gcDay || S.gcDay !== dy) { S.gcDay = dy; S.gcToday = []; saveS(); }
  const openIds = [...el.querySelectorAll('details.play[open]')].map(d => d.dataset.p), gcOpen = !!($('gcCard') && $('gcCard').open);
  const list = PLAYS.map(p => Object.assign({ f: p.fit() }, p)).sort((a, b) => (b.f.ok ? 1 : 0) - (a.f.ok ? 1 : 0));
  el.innerHTML = list.map(p => `<details class="play${p.f.ok ? '' : ' notyet'}" data-p="${p.id}"><summary><div class="phead"><b>${esc(p.title)}</b><span class="pfit ${p.f.ok ? 'ok' : ''}">${p.f.ok ? 'Good fit' : 'Not yet'}</span></div><div class="muted psum">${esc(p.kind)} · ${esc(p.sum)}</div></summary>
    <p class="muted" style="font-size:13.5px;margin:6px 0">${esc(p.f.why)}</p>
    <ol class="psteps2">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="callout" style="margin-top:10px"><div class="muted" style="font-size:12.5px;font-weight:600">What the sources report</div><div style="font-size:14.5px">${esc(p.reported)}</div>
      <div class="srcs">${p.src.map(k => `<a href="${SRC[k][1]}" target="_blank" rel="noopener">${esc(SRC[k][0])}</a>`).join('')}</div></div>
    ${p.gcHelper ? gcHelperHtml() : ''}
    ${p.tool ? `<button class="btn small primary" data-tool="${p.id}" style="margin-top:10px">${esc(p.tool[0])}</button>` : ''}</details>`).join('');
  el.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => PLAYS.find(p => p.id === b.dataset.tool).tool[1]()));
  openIds.forEach(id => { const d = el.querySelector(`details.play[data-p="${id}"]`); if (d) d.open = true; }); if (gcOpen && $('gcCard')) $('gcCard').open = true;
  if ($('gcAdd')) { bindSuggest($('gcAdd'), $('gcSuggest'), id => { $('gcAdd').value = ''; S.gcToday = (S.gcToday || []).concat({ id, seals: 0, qty: 1 }); saveS(); renderGcRows(); toast('Now enter the seals the game shows'); }); renderGcRows(); }
}
function upcoming(days = 45) {
  const now = Date.now();
  return (STRAT.events || []).map(e => Object.assign({}, e, { s: Date.parse(e.start + 'T15:00:00Z'), e2: Date.parse(e.end + 'T23:59:00Z') }))
    .filter(e => e.e2 >= now && e.s - now <= days * 86400000).sort((a, b) => a.s - b.s);
}
function ledgerTasks() {
  const T2 = [], dy = nextDaily();
  // GC turn-in demand: only meaningful after the daily reset
  const hot = Object.entries(gcHot.map || {}).filter(([, h]) => h.d24 >= Math.max(3, h.avg * 2.5)).map(([id]) => +id).slice(0, 3);
  T2.push({ k: 'gcd', text: hot.length ? `List today’s hot GC turn-in items: ${hot.map(nm).join(', ')}` : 'Check today’s GC turn-in demand and list what’s hot', go: () => { P.craftMode = 'gcd'; saveP(); showTab('crafts'); renderCrafts(); } });
  const under = AGG && S.listed.length ? listingStates().filter(s => s.state === 'under') : [];
  if (S.listed.length) T2.push({ k: 'relist', text: under.length ? `Relist ${under.length} undercut item${under.length > 1 ? 's' : ''}` : 'Check your listings for undercuts', go: () => showTab('watch') });
  const staples = outcomes().filter(o => o.kind === 'staple').map(o => o.id).filter(id => !S.listed.includes(id)).slice(0, 3);
  if (staples.length) T2.push({ k: 'staple', text: `Restock what sells well for you: ${staples.map(nm).join(', ')}`, go: () => openDetail(staples[0], craftResults.find(c => c.res === staples[0]) || { kind: 'item', id: staples[0] }) });
  T2.push({ k: 'vent', text: 'Collect and resend retainer ventures' });
  if (!S.cdw || Object.values(S.cdw.c || {}).reduce((s, v) => s + v, 0) < 12) T2.push({ k: 'cd', text: 'Do this week’s Custom Deliveries', go: () => showTab('goal') });
  return T2;
}
function renderLedger() {
  const el = $('ledger'); if (!el) return;
  const dy = nextDaily(); if (!S.ledger || S.ledger.dy !== dy) S.ledger = { dy, done: {} };
  const tasks = ledgerTasks(), done = tasks.filter(t => S.ledger.done[t.k]).length, pct = tasks.length ? done / tasks.length : 0;
  const ev = upcoming(), d = new Date();
  const C = 2 * Math.PI * 22;
  el.innerHTML = `<div class="ledhead"><div><h2>${d.toLocaleDateString(undefined, { weekday: 'long' })}</h2><div class="muted leddate">${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, resets in ${until(dy)}</div></div>
      <div class="seal" role="img" aria-label="${done} of ${tasks.length} done"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" class="sealbg"/><circle cx="26" cy="26" r="22" class="sealfg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct)}"/></svg><span>${done}/${tasks.length}</span></div></div>
    <ol class="tasks">${tasks.map(t => `<li class="${S.ledger.done[t.k] ? 'done' : ''}"><label><input type="checkbox" data-k="${t.k}" ${S.ledger.done[t.k] ? 'checked' : ''}><span>${esc(t.text)}</span></label>${t.go ? `<button class="btn small ghost" data-go="${t.k}">Open</button>` : ''}</li>`).join('')}</ol>
    ${ev.length ? `<div class="events">${ev.map(e => `<div class="ev"><b>${esc(e.title)}</b> <span class="muted">${new Date(e.s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${e.end !== e.start ? '–' + new Date(e.e2).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}${e.confirmed ? '' : ', not yet confirmed'}</span><p>${esc(e.advice)}</p><div class="srcs">${(e.src || []).filter(k => SRC[k]).map(k => `<a href="${SRC[k][1]}" target="_blank" rel="noopener">${esc(SRC[k][0])}</a>`).join('')}</div></div>`).join('')}</div>` : ''}`;
  el.querySelectorAll('[data-k]').forEach(c => c.addEventListener('change', () => { S.ledger.done[c.dataset.k] = c.checked; saveS(); renderLedger(); }));
  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => tasks.find(t => t.k === b.dataset.go).go()));
  if ($('pbDate')) $('pbDate').textContent = STRAT.researched ? `researched ${new Date(STRAT.researched + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
}
function renderBest() {
  renderLedger();
  renderPlaybook();
  const out = $('bestOut'); if (!out) return;
  out.innerHTML = '';
  alertBanner(out); crashBanner(out);
  const goal = +S.goal || 0, last = S.gilLog.slice().sort((a, b) => a.t - b.t).pop();
  if (last && goal) {
    const g = document.createElement('div'); g.className = 'callout'; g.style.marginBottom = '14px';
    g.innerHTML = `<div class="muted" style="font-size:13px">House fund</div><b>${Math.round(100 * Math.min(1, last.gil / goal))}% there</b><div class="muted" style="font-size:14px">${fmt(last.gil)} of ${fmtK(goal)} · log new totals in the Goal tab</div>`;
    out.append(g);
  }
  const P0 = bestPicks();
  if (!P0) { out.insertAdjacentHTML('beforeend', '<div class="empty"><b>Ready when you are</b>Tap the button above. It usually takes under a minute. You’ll get a short list of the easiest wins, with exactly what to do for each.</div>'); return; }
  const tops = [P0.crafts[0], P0.gather[0], P0.vendor[0], P0.world[0]].filter(Boolean);
  const star = tops.length ? tops.reduce((a, b) => (b.daily > a.daily ? b : a)) : null;
  const sugg = s => { const g = suggest(s); return g ? fmt(g.price) : fmt(s.price); };
  const W = esc(S.world);
  out.append(bestSection('Craft and sell', 'Make it, list it, keep the difference.', P0.crafts, (x, i) => pickCard(i + 1, x, [
    `${JOBNAMES[x.ct]} · costs ${fmtK(x.cost)} · sells ${fmtK(x.price)} · ~${x.vel.toFixed(1)}/day`,
    `<b>What:</b> Craft it with your ${JOBNAMES[x.ct]} (recipe level ${x.lvl})${x.hq ? ', aiming for HQ' : ''}${x.amt > 1 ? `; each craft makes ${x.amt}` : ''}.`,
    `<b>Money:</b> Materials cost about ${fmt(x.cost)}. It sells for about ${fmt(x.price)}, so you keep about <span class="pos">${fmt(x.profit)}</span> each after fees.`,
    `<b>Why:</b> About ${x.vel.toFixed(1)} sell per day on ${W}.`,
    planSteps([[x.r, 1]], () => (suggest(x.s) || {}).price || Math.round(x.price)).html],
    [[batch.has(x.rid) ? 'In batch ✓' : 'Add to batch', b => { inBatchToggle(x); b.textContent = batch.has(x.rid) ? 'In batch ✓' : 'Add to batch'; }, 'primary'], ['Details', () => openDetail(x.res, x)]], x === star),
    'No craft clears the bar right now (good profit and sells daily). Check back after the next refresh.'));
  const bz = zoneRanking()[0];
  out.append(bestSection('Gather and sell', bz ? `Best zone right now: ${bz.zone} (${bz.top.length} good materials, see Gather → Best zones).` : 'Free to make. Just your time.', P0.gather, (x, i) => {
    const t = timedState(x.g[4]);
    const where = x.g[3].length ? ` in ${x.g[3].map(esc).join(' or ')}` : '';
    return pickCard(i + 1, x, [
      `${x.jobs.join('/')} ${x.g[1]} · sells ${fmtK(x.price)} · ~${x.vel.toFixed(1)}/day${t ? ' · ' + (t.up ? '<span class="pos">up now</span>' : 'up in ' + realMin(t.until) + 'm') : ''}`,
      `<b>What:</b> Gather it with your ${x.jobs.map(j => GJOBS.find(g => g[0] === j)[1]).join(' or ')} (level ${x.g[1]})${where}.`,
      t ? `<b>When:</b> ${t.up ? `<span class="pos">Its node is up now</span> for about ${realMin(t.left)} more minutes.` : `Its timed node appears in about ${realMin(t.until)} minutes.`}${x.g[5] ? ' Regular nodes have it too.' : ''}` : '',
      `<b>Money:</b> Sells for about ${fmt(x.price)} each, and about ${x.vel.toFixed(1)} sell per day on ${W}.`,
      `<b>Steps:</b> Gather a stack, then list it for ${sugg(x.s)} each.`].filter(Boolean),
      [['Details', () => openDetail(x.id, x)], ['Where exactly', { href: `https://www.garlandtools.org/db/#item/${x.id}` }]], x === star);
  }, 'Nothing worth gathering right now in the zones you can reach.'));
  out.append(bestSection('Buy from an NPC, resell', 'No crafting needed.', P0.vendor, (x, i) => pickCard(i + 1, x, [
    `Vendor ${fmt(x.cost)} · sells ${fmtK(x.price)} · ~${x.vel.toFixed(1)}/day`,
    `<b>What:</b> Buy it from ${x.where ? esc(x.where) : 'an NPC vendor'} for ${fmt(x.cost)} each.`,
    `<b>Money:</b> It sells for about ${fmt(x.price)}, so you keep about <span class="pos">${fmt(x.profit)}</span> each after fees.`,
    `<b>Why:</b> About ${x.vel.toFixed(1)} sell per day on ${W}.`,
    `<b>Steps:</b> Tap Which vendor to see who sells it, buy a few, then list them for ${sugg(x.s)}.`],
    [['Which vendor', { href: `https://www.garlandtools.org/db/#item/${x.id}` }, 'primary'], ['Details', () => openDetail(x.id, x)]], x === star),
    'No vendor flips clear the bar right now.'));
  out.append(bestSection('Buy on another world', `Cheaper elsewhere on ${S.dc}.`, P0.world, (x, i) => pickCard(i + 1, x, [
    `${esc(x.buyWorld)} ${fmtK(x.buyEach)} → ${W} ${fmtK(x.price)} · ~${x.vel.toFixed(1)}/day`,
    `<b>What:</b> Visit ${esc(x.buyWorld)} and buy it for ${fmt(x.buyEach)} each${x.hq ? ' (HQ)' : ''}.`,
    `<b>Money:</b> It sells for about ${fmt(x.price)} on ${W}, so you keep about <span class="pos">${fmt(x.profit)}</span> each after fees.`,
    `<b>Why:</b> About ${x.vel.toFixed(1)} sell per day on ${W}.`,
    `<b>Steps:</b> World Visit to ${esc(x.buyWorld)}, buy from the market board, return home, list for ${sugg(x.s)}.`],
    [['Details', () => openDetail(x.id, x)]], x === star),
    'No cross-world deals worth the trip right now.'));
  const ls = document.createElement('section'); ls.className = 'bestsec';
  ls.innerHTML = `<h3>Your listings</h3><p class="muted">${S.listed.length ? `You’re tracking ${S.listed.length} listing${S.listed.length > 1 ? 's' : ''}.` : 'Open any item and tap “I listed this” to have undercuts checked here.'}</p>`;
  if (S.listed.length) {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Check for undercuts';
    b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Checking…'; await checkListings(); b.disabled = false;
      const u = listingStates().filter(s => s.state === 'under').length;
      b.textContent = u ? `${u} undercut: open Watch` : 'All good: you’re cheapest';
      if (u) b.onclick = () => showTab('watch'); });
    ls.append(b);
  }
  out.append(ls);
  const n = P0.crafts.length + P0.gather.length + P0.vendor.length + P0.world.length;
  $('bestSummary').textContent = star ? `${n} picks · start with ${nm(star.id ?? star.res)} · prices ${ago(AGG.at)}` : `${n} picks · prices ${ago(AGG.at)}`;
}
$('sessMin').value = P.sessMin; $('sessBudget').value = P.sessBudget;
$('sessMin').addEventListener('change', e => { P.sessMin = +e.target.value || 60; saveP(); });
$('sessBudget').addEventListener('change', e => { P.sessBudget = +e.target.value || 0; saveP(); });
function planSession(minutes, budget) {
  const C = [], fee = taxS(), ok = x => !x.s.stale && !suspicious(x.s) && confOf(x).level !== 'Low';
  craftResults.filter(x => !x.missing && x.profit > 0 && !x.sellMats && x.minutes > 0 && ok(x)).forEach(x => {
    const mk = marketFor(x.res, x.hq, x.s), cap = x.group > 0 ? 1 : Math.max(1, Math.ceil(Math.max(1, Math.round(mk.yourRate * 3)) / (x.amt || 1)));
    C.push({ kind: 'craft', x, unitMin: x.minutes, unitProfit: x.profit * (x.amt || 1), unitCost: x.cost * (x.amt || 1), cap });
  });
  gatherResults.filter(x => x.price > 0 && (x.g[2] & exMask()) && ok(x)).forEach(x => { const mk = marketFor(x.id, false, x.s); C.push({ kind: 'gather', x, unitMin: x.minutes, unitProfit: x.profit, unitCost: 0, cap: Math.max(1, Math.round(mk.yourRate * 3)) }); });
  flipsFor('vendor').filter(x => x.whereKnown && !x.unlock && x.profit > 0 && ok(x)).forEach(x => { const mk = marketFor(x.id, false, x.s); C.push({ kind: 'vendor', x, unitMin: x.minutes, unitProfit: x.profit, unitCost: x.cost, cap: Math.max(1, Math.round(mk.yourRate * 3)) }); });
  C.forEach(c => { c.rate = c.unitProfit / c.unitMin; });
  C.sort((a, b) => b.rate - a.rate);
  let tLeft = minutes, bLeft = budget; const pick = [];
  for (const c of C) {
    if (pick.length >= 12 || tLeft < 1) break;
    let n = Math.min(c.cap, Math.floor(tLeft / c.unitMin), c.unitCost > 0 ? Math.floor(bLeft / c.unitCost) : Infinity);
    if (n < 1) continue;
    pick.push(Object.assign({ n }, c)); tLeft -= n * c.unitMin; bLeft -= n * c.unitCost;
  }
  return { pick, used: minutes - tLeft, spend: budget - bLeft, profit: pick.reduce((s, p) => s + p.n * p.unitProfit, 0) };
}
$('sessGo').addEventListener('click', () => {
  const out = $('sessOut');
  if (!AGG) { out.innerHTML = '<div class="empty" style="margin-top:10px">Tap “Find my best moneymakers” first so I have prices.</div>'; return; }
  const p = planSession(+P.sessMin || 60, +P.sessBudget || 0);
  if (!p.pick.length) { out.innerHTML = '<div class="empty" style="margin-top:10px">Nothing fits that time and budget right now.</div>'; return; }
  S.lastPlan = p.profit; saveS();
  const icon = { craft: '🔨', gather: '🌿', vendor: '🛒' };
  const crafts = p.pick.filter(c => c.kind === 'craft').map(c => [c.x.r, c.n]);
  const steps = crafts.length ? planSteps(crafts, r => { const c = p.pick.find(k => k.kind === 'craft' && k.x.rid === r[0]); return c ? listAdvice(c.x.res, c.x.hq, c.x.s).price : 0; }) : null;
  out.innerHTML = `<div class="callout" style="margin-top:12px"><div class="muted" style="font-size:13px">This plan earns about</div><b>${fmt(p.profit)} gil</b><div class="muted" style="font-size:14px">${Math.round(p.used)} of ${P.sessMin} min · spend ~${fmtK(p.spend)} · ~${fmtK(p.profit / Math.max(1, p.used) * 60)}/hr</div>${(+P.sessMin || 60) - p.used > 10 ? `<div class="muted" style="font-size:13.5px;margin-top:6px">That’s everything worth doing right now without flooding the market. Use the spare ${Math.round((+P.sessMin || 60) - p.used)} min for your Firmament or Custom Deliveries.</div>` : ''}</div>
    <ol class="route" style="margin-top:12px">${p.pick.map(c => `<li>${icon[c.kind]} <b>${c.kind === 'craft' ? `Craft ${c.n} × ${esc(nm(c.x.res))}` : c.kind === 'gather' ? `Gather ${c.n} × ${esc(nm(c.x.id))}` : `Buy ${c.n} × ${esc(nm(c.x.id))} from an NPC`}</b> <span class="muted">· ~${Math.round(c.n * c.unitMin)} min · +${fmtK(c.n * c.unitProfit)}${c.kind === 'gather' ? ' · ' + esc(gatherHint(c.x.id)) : ''}</span></li>`).join('')}</ol>
    ${steps ? `<h4 style="margin:14px 0 8px">Crafting shopping plan</h4>${steps.html}` : ''}<button class="btn block" id="sessShare" style="margin-top:12px">Share this plan</button>`;
  $('sessShare').addEventListener('click', () => shareText('My FFXIV session plan', `Session plan (~${fmt(p.profit)} gil in ${Math.round(p.used)} min):\n` + p.pick.map(c => '• ' + (c.kind === 'craft' ? `Craft ${c.n} × ${nm(c.x.res)}` : c.kind === 'gather' ? `Gather ${c.n} × ${nm(c.x.id)}` : `Buy ${c.n} × ${nm(c.x.id)} from an NPC`)).join('\n') + (steps ? '\n\n' + steps.text : '')));
});
$('bestScan').addEventListener('click', async () => { const ok = await scanAll(); if (ok) { toast('Your picks are ready'); $('bestOut').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

// ================= SETTINGS =================
function buildSettings() {
  $('sWorld').value = S.world; $('sDc').value = S.dc;
  chipGroup($('sTheme'), [['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']], () => [S.theme || 'system'], cur => { S.theme = cur[0]; saveS(); applyTheme(); }, true);
  const jobRow = (label, on, lv, onOn, onLv) => {
    const d = document.createElement('div'); d.className = 'job';
    d.innerHTML = `<label><input type="checkbox" ${on ? 'checked' : ''} style="width:18px;height:18px;vertical-align:-3px;margin-right:8px">${esc(label)}</label><input type="number" min="1" max="100" value="${lv}" inputmode="numeric" aria-label="${esc(label)} level">`;
    d.querySelector('input[type=checkbox]').addEventListener('change', e => onOn(e.target.checked));
    d.querySelector('input[type=number]').addEventListener('change', e => onLv(+e.target.value || 1));
    return d;
  };
  $('sCrafters').innerHTML = ''; JOBNAMES.forEach((n, i) => $('sCrafters').append(jobRow(n, S.jobOn[i], S.jobLv[i], v => { S.jobOn[i] = v ? 1 : 0; saveS(); }, v => { S.jobLv[i] = v; saveS(); })));
  $('sGatherers').innerHTML = ''; GJOBS.forEach(([, n], i) => $('sGatherers').append(jobRow(n, S.gOn[i], S.gLv[i], v => { S.gOn[i] = v ? 1 : 0; saveS(); }, v => { S.gLv[i] = v; saveS(); })));
  $('sMsq').innerHTML = MSQ.map((m, i) => `<option value="${i}" ${i === msqStage() ? 'selected' : ''}>${esc(m)}</option>`).join('');
  $('sMsq').onchange = e => { S.msq = +e.target.value; saveS(); toast('Story progress saved'); };
  chipGroup($('sSouls'), JOBNAMES.map((n, i) => [i, n]), () => S.souls || [], cur => { S.souls = cur; saveS(); });
  const GCR = ['Private Third Class', 'Private Second Class', 'Private First Class', 'Corporal', 'Sergeant Third Class', 'Sergeant Second Class', 'Sergeant First Class', 'Chief Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain'];
  $('sGc').innerHTML = GCR.map((n, i) => `<option value="${i + 1}" ${i + 1 === (+S.gcRank || 9) ? 'selected' : ''}>${n}</option>`).join('');
  $('sGc').onchange = e => { S.gcRank = +e.target.value; saveS(); };
  $('sFolk').checked = !!S.folk;
  $('sCms').value = S.cms || ''; $('sCtl').value = S.ctl || ''; $('sCp').value = S.cp || '';
  const pc = Object.assign({ craft: 1.0, gather: 0.3, fish: 1.5, trip: 5, npc: 2 }, S.pace || {});
  $('pCraft').value = pc.craft; $('pGather').value = pc.gather; $('pFish').value = pc.fish; $('pTrip').value = pc.trip; $('pNpc').value = pc.npc;
  $('sCombatLv').value = S.combatLv || 0; $('sRetainers').value = S.retainers; $('sTaxBuy').value = S.taxBuy; $('sTaxSell').value = S.taxSell; $('sRetNames').value = S.retNames;
  $('sHq').checked = S.hq; $('sStars').checked = S.stars; $('sHideOdd').checked = S.hideOdd !== false;
  // books grouped by series
  const groups = new Map();
  Object.entries(BOOKS).forEach(([id, n]) => { const key = n.replace(/\s+[IVX]+$/, ''); const a = groups.get(key) || []; a.push([+id, n]); groups.set(key, a); });
  $('sBooks').innerHTML = '';
  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, list]) => {
    const det = document.createElement('details');
    const owned = list.filter(([id]) => S.books.includes(id)).length;
    det.innerHTML = `<summary>${esc(key)} <span class="muted" style="font-weight:400">(${owned}/${list.length})</span></summary>` +
      list.map(([id, n]) => `<label><input type="checkbox" value="${id}" ${S.books.includes(id) ? 'checked' : ''}>${esc(n)}</label>`).join('');
    det.addEventListener('change', e => {
      const id = +e.target.value; if (!id) return;
      S.books = e.target.checked ? [...new Set(S.books.concat(id))] : S.books.filter(b => b !== id); saveS();
      det.querySelector('summary span').textContent = `(${list.filter(([i]) => S.books.includes(i)).length}/${list.length})`;
    });
    $('sBooks').append(det);
  });
}
const bindS = (id, key, fn = v => v) => $(id).addEventListener('change', e => { S[key] = fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); saveS(); updatePill(); });
bindS('sWorld', 'world', v => v.trim() || 'Exodus'); bindS('sDc', 'dc', v => v.trim() || 'Primal');
bindS('sCms', 'cms', v => +v || 0); bindS('sCtl', 'ctl', v => +v || 0); bindS('sCp', 'cp', v => +v || 0);
bindS('sRetainers', 'retainers', v => Math.max(0, +v || 0)); bindS('sCombatLv', 'combatLv', v => Math.max(0, +v || 0)); bindS('sTaxBuy', 'taxBuy', v => +v || 0); bindS('sTaxSell', 'taxSell', v => +v || 0);
bindS('sRetNames', 'retNames', v => v); bindS('sHq', 'hq'); bindS('sStars', 'stars'); bindS('sHideOdd', 'hideOdd'); bindS('sFolk', 'folk');
[['pCraft', 'craft'], ['pGather', 'gather'], ['pFish', 'fish'], ['pTrip', 'trip'], ['pNpc', 'npc']].forEach(([el, k]) => $(el).addEventListener('change', e => {
  S.pace = Object.assign({ craft: 1.0, gather: 0.3, fish: 1.5, trip: 5, npc: 2 }, S.pace || {}); S.pace[k] = Math.max(0.05, +e.target.value || S.pace[k]); saveS(); applyPace();
}));
$('calGo').addEventListener('click', () => {
  const n = +$('calN').value, m = +$('calM').value; if (!(n > 0 && m > 0)) return toast('Enter crafts and minutes');
  S.pace = Object.assign({ craft: 1.0, gather: 0.3, fish: 1.5, trip: 5, npc: 2 }, S.pace || {}); S.pace.craft = Math.round(m / n * 100) / 100; saveS(); applyPace();
  $('pCraft').value = S.pace.craft; toast(`Craft pace set to ${S.pace.craft} min`);
});
$('openSettings').addEventListener('click', () => { buildSettings(); openSheet('settings'); });
$('settings').addEventListener('close', () => { if (AGG && String(AGG.world).toLowerCase() !== String(S.world).toLowerCase()) { AGG = null; toast('World changed: refresh prices'); } computeAll(); rerender(); renderBest(); });
$('backupCopy').addEventListener('click', async () => {
  const data = JSON.stringify({ v: 3, S, P });
  try { await navigator.clipboard.writeText(data); toast('Backup copied. Paste it somewhere safe.'); } catch (e) { $('restoreBox').hidden = false; $('restoreText').value = data; $('restoreText').select(); toast('Copy the text in the box'); }
});
$('backupShow').addEventListener('click', () => { $('restoreBox').hidden = !$('restoreBox').hidden; });
$('restoreGo').addEventListener('click', () => {
  try {
    const d = JSON.parse($('restoreText').value);
    if (!d || !d.S) throw new Error('bad');
    store.set(SK, Object.assign({}, DEF, d.S)); if (d.P) store.set(PK, Object.assign({}, DEFP, d.P));
    toast('Restored. Reloading…'); setTimeout(() => location.reload(), 700);
  } catch (e) { toast('That doesn’t look like a Gil Ledger backup'); }
});

// ================= FILTER BINDINGS =================
function bindP(id, key, ev, fn, after) {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = !!P[key]; else el.value = P[key];
  el.addEventListener(ev, () => { P[key] = fn(el.type === 'checkbox' ? el.checked : el.value); saveP(); after(); });
}
const num = v => +v || 0, str = v => v;
const reCraft = () => { computeCrafts(); renderCrafts(); };
bindP('craftQ', 'craftQ', 'input', str, debounce(renderCrafts, 150));
bindP('craftSort', 'craftSort', 'change', str, renderCrafts);
bindP('craftMinVel', 'craftMinVel', 'input', num, debounce(renderCrafts, 200));
bindP('craftMinLvl', 'craftMinLvl', 'change', num, () => toast('Refresh prices to include the new levels'));
bindP('craftSub', 'craftSub', 'change', Boolean, reCraft);
bindP('craftGatherFree', 'craftGatherFree', 'change', Boolean, reCraft);
bindP('craftStatsOnly', 'craftStatsOnly', 'change', Boolean, renderCrafts);
bindP('craftShowAll', 'craftShowAll', 'change', Boolean, renderCrafts);
$('gcdCheck').addEventListener('click', checkGcHot);
bindP('scripGoal', 'scripGoal', 'input', num, debounce(renderCrafts, 200));
bindP('gScripGoal', 'scripGoal', 'input', num, debounce(() => renderGather(), 200));
bindP('gatherQ', 'gatherQ', 'input', str, debounce(renderGather, 150));
bindP('gatherSort', 'gatherSort', 'change', str, renderGather);
bindP('gatherMinVel', 'gatherMinVel', 'input', num, debounce(renderGather, 200));
bindP('gatherTimed', 'gatherTimed', 'change', Boolean, renderGather);
bindP('gatherZones', 'gatherZones', 'change', Boolean, renderGather);
bindP('flipQ', 'flipQ', 'input', str, debounce(renderFlips, 150));
bindP('autoWatch', 'autoWatch', 'change', Boolean, () => toast(P.autoWatch ? 'Auto-check on' : 'Auto-check off'));
setInterval(() => { if (P.autoWatch && !document.hidden && navigator.onLine !== false && (S.listed.length || S.watch.length)) checkListings(false); }, 10 * 60000);
bindP('flipSort', 'flipSort', 'change', str, renderFlips);
bindP('flipMinRoi', 'flipMinRoi', 'input', num, debounce(renderFlips, 200));
$('budget').value = P.budget; $('maxItems').value = P.maxItems;
chipGroup($('craftChips'), PRESETS.map(p => [p.id, p.label]), () => P.craftChips, cur => { P.craftChips = cur; saveP(); renderCrafts(); });
function syncCraftMode() { const s = P.craftMode !== 'sell'; const modes = ['sell', 'gcd', 'fcw', 'scrip', 'leve']; document.querySelectorAll('#craftMode .chip').forEach((c, i) => c.setAttribute('aria-pressed', String(modes[i] === (P.craftMode || 'sell')))); $('scripHelp').textContent = P.craftMode === 'fcw' ? 'Materials Free Company workshops need for airships, submarines and house builds. These projects use them by the hundreds, so they sell steadily. Shows what you can craft or gather, priced against your costs.' : P.craftMode === 'gcd' ? 'Items Grand Company supply missions ask players for. Players leveling crafters and gatherers buy these every day, HQ especially. Tap “Check today’s demand” to see which are selling unusually fast right now.' : P.craftMode === 'leve' ? 'Crafting leves ranked by gil you keep per allowance after making the item. HQ turn-ins pay more. Uses your crafter levels and story progress.' : 'Collectables you can craft and turn in for scrips, cheapest per scrip first. Priced live; adapts to your crafter levels and story progress.'; $('craftChips').hidden = s; $('scripHelp').hidden = !s; $('scripGoalRow').hidden = P.craftMode !== 'scrip'; $('gcdBox').hidden = P.craftMode !== 'gcd'; document.querySelectorAll('#v-crafts .filters, #v-crafts details.more').forEach(e => e.hidden = s); }
chipGroup($('craftMode'), [['sell', 'Craft to sell'], ['gcd', 'GC turn-ins'], ['fcw', 'FC workshop'], ['scrip', 'Scrip farm'], ['leve', 'Leves']], () => [P.craftMode || 'sell'], cur => { P.craftMode = cur[0]; saveP(); syncCraftMode(); renderCrafts(); }, true);
syncCraftMode();
chipGroup($('gatherChips'), GJOBS.map(([k, n]) => [k, n]), () => P.gatherChips, cur => { P.gatherChips = cur; saveP(); renderGather(); });
chipGroup($('gatherMode'), [['sell', 'Gather to sell'], ['chain', 'Gather → craft'], ['reduce', 'Reduction'], ['zone', 'Best zones'], ['scrip', 'Scrip farm']], () => [P.gatherMode || 'sell'], cur => { P.gatherMode = cur[0]; saveP(); $('gScripGoalRow').hidden = P.gatherMode !== 'scrip'; renderGather(); }, true);
$('gScripGoalRow').hidden = P.gatherMode !== 'scrip'; $('gScripGoal').value = P.scripGoal;
chipGroup($('flipModes'), [['vendor', 'Vendor items'], ['world', 'Other worlds'], ['cur', 'Currencies'], ['materia', 'Materia'], ['vent', 'Ventures'], ['desynth', 'Desynth']], () => [P.flipMode], cur => { P.flipMode = cur[0]; saveP(); computeFlips(); renderFlips(); }, true);
chipGroup($('curChips'), CUR, () => [S.curCh || 'purpleC'], cur => { S.curCh = cur[0]; saveS(); computeFlips(); renderFlips(); }, true);

// ================= OFFLINE =================
function syncOnline() { $('offline').hidden = navigator.onLine !== false; }
window.addEventListener('online', () => { syncOnline(); toast('Back online'); });
window.addEventListener('offline', syncOnline);
syncOnline();
// ================= INIT =================
function computeAll() { computeCrafts(); computeGather(); computeFlips(); }
updatePill(); saveBatch(); applyTheme();
['gl3-crafts','gl3-gather','gl3-flips'].forEach(k => store.del(k)); // old, slower scan caches
showTab(TABS.includes(P.tab) ? P.tab : 'best');
if (AGG) {
  SCAN_PREFIXES.forEach(p => status(p, `Prices from ${ago(AGG.at)}. Refresh for the latest.`));
  if (VIEW_RENDER[P.tab]) skeleton($({ best: 'bestOut', crafts: 'craftList', gather: 'gatherList', flips: 'flipList' }[P.tab]), 4);
}
// Let the page paint first, then do the number crunching.
requestAnimationFrame(() => setTimeout(() => { computeAll(); renderAllViews(); if (P.tab === 'watch') renderWatch(); checkAlerts(); }, 0));
})();
