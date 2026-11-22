// All the Joes — main app (hash-routed single page, no build step).
import * as api from './api.js';

// ---------- constants ----------
const CATS = [
  { k: 'decor', name: 'Decor & Coziness', short: 'Decor', emoji: '🛋️', hint: 'Ambiance, comfort, lighting, vibe' },
  { k: 'service', name: 'Service', short: 'Service', emoji: '🤵', hint: 'Friendly, attentive, timing' },
  { k: 'bath', name: 'Bathroom', short: 'Bath', emoji: '🚻', hint: 'Clean, spacious, air flow, good smell' },
  { k: 'food', name: 'Food Quality', short: 'Food', emoji: '🍝', hint: 'Good ingredients, high quality prep' },
  { k: 'xmas', name: 'Christmas Spirit', short: 'Xmas', emoji: '🎄', hint: 'Tertiary · lights, the tree, holiday cheer', optional: true },
];
const CORE = CATS.filter(c => !c.optional).map(c => c.k);
const DEFAULT_W = { food: 0.4, decor: 0.2, service: 0.15, bath: 0.15, xmas: 0.1 };
const CACHE = 'joes.cache.v1';

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = v => (v == null || isNaN(v) ? '–' : Number(v).toFixed(1));
const grade = v => v == null ? '–' : v >= 9 ? 'A' : v >= 8 ? 'B' : v >= 7 ? 'C' : v >= 6 ? 'D' : 'F';
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const initial = n => esc(String(n).trim().charAt(0).toUpperCase() || '?');
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const visitId = (loc, date) => `${loc}_${date}`;
const parseVisit = id => { const i = id.lastIndexOf('_'); return { loc: id.slice(0, i), date: id.slice(i + 1) }; };
const prettyDate = d => {
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: dt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
};
// Christmas Spirit defaults to N/A outside roughly Nov 15 – Jan 10 (can be toggled).
const inXmasSeason = d => { const [, m, day] = d.split('-').map(Number); return (m === 11 && day >= 15) || m === 12 || (m === 1 && day <= 10); };

function overall(scores, W) {
  const ks = Object.keys(W).filter(k => scores[k] != null);
  const tw = ks.reduce((t, k) => t + W[k], 0);
  return tw ? ks.reduce((t, k) => t + W[k] * scores[k], 0) / tw : null;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- state ----------
const S = {
  data: (() => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } })(),
  loading: false,
  error: null,
  rankBy: 'overall',
  draft: null, // rate-screen working copy
  newVisit: { loc: null, date: today() },
  busy: false,
};

async function refresh(quiet) {
  S.loading = true;
  if (!quiet) render();
  try {
    S.data = await api.loadData();
    S.error = null;
    try { localStorage.setItem(CACHE, JSON.stringify(S.data)); } catch { /* cache is best effort */ }
  } catch (e) {
    S.error = e.message;
  }
  S.loading = false;
  render();
}

// ---------- derived model ----------
function model() {
  const d = S.data || { locations: [], weights: [], ratings: [], photos: [] };
  const W = {};
  (d.weights || []).forEach(w => { const n = num(w.weight); if (w.key && n != null) W[String(w.key).trim()] = n; });
  CATS.forEach(c => { if (W[c.k] == null) W[c.k] = DEFAULT_W[c.k]; });

  const locs = (d.locations || []).filter(l => l.location_id).map(l => ({ id: String(l.location_id).trim(), name: String(l.name || l.location_id), area: String(l.area || '') }));
  const locById = Object.fromEntries(locs.map(l => [l.id, l]));

  const visits = {};
  const getVisit = (id, loc) => {
    if (!visits[id]) {
      const p = parseVisit(id);
      visits[id] = { id, loc: loc || p.loc, date: p.date, ratings: {}, photos: [] };
      if (!locById[visits[id].loc]) { // rating for a location not in the list
        const l = { id: visits[id].loc, name: visits[id].loc, area: '' };
        locs.push(l); locById[l.id] = l;
      }
    }
    return visits[id];
  };
  (d.ratings || []).forEach(r => {
    if (!r.visit_id || !r.person) return;
    const v = getVisit(String(r.visit_id), r.location_id && String(r.location_id));
    const scores = {};
    CATS.forEach(c => { scores[c.k] = num(r[c.k]); });
    v.ratings[String(r.person).trim().toLowerCase()] = { person: String(r.person).trim(), scores, comment: String(r.comment || ''), at: r.submitted_at };
  });
  (d.photos || []).forEach(p => {
    if (!p.visit_id || !p.url) return;
    getVisit(String(p.visit_id), p.location_id && String(p.location_id)).photos.push(p);
  });

  const list = Object.values(visits).map(v => {
    v.ratings = Object.values(v.ratings);
    v.avg = {};
    CATS.forEach(c => { v.avg[c.k] = mean(v.ratings.map(r => r.scores[c.k]).filter(x => x != null)); });
    v.overall = v.ratings.length ? overall(v.avg, W) : null;
    v.location = locById[v.loc];
    return v;
  }).sort((a, b) => b.date.localeCompare(a.date));

  locs.forEach(l => {
    l.visits = list.filter(v => v.loc === l.id && v.overall != null);
    l.score = mean(l.visits.map(v => v.overall));
    l.avg = {};
    CATS.forEach(c => { l.avg[c.k] = mean(l.visits.map(v => v.avg[c.k]).filter(x => x != null)); });
    l.last = l.visits[0];
  });

  const people = [...new Set((d.ratings || []).map(r => String(r.person || '').trim()).filter(Boolean))];
  return { W, locs, locById, visits: list, visitById: Object.fromEntries(list.map(v => [v.id, v])), people };
}

// ---------- shared fragments ----------
const tabbar = active => `
  <nav class="tabbar">
    <a href="#/" class="${active === 'home' ? 'on' : ''}"><span class="ico">⌂</span>Joes</a>
    <a href="#/new" class="${active === 'new' ? 'on' : ''}"><span class="ico">✎</span>Rate</a>
    <a href="#/reports" class="${active === 'reports' ? 'on' : ''}"><span class="ico">☰</span>Reports</a>
    <a href="#/ranks" class="${active === 'ranks' ? 'on' : ''}"><span class="ico">♛</span>Ranks</a>
  </nav>`;

function banners() {
  let h = '';
  if (api.isDemo()) h += `<div class="banner">Demo mode · sample data on this phone only · <a href="#/settings" style="color:#fff">connect sheet</a></div>`;
  if (S.error && /wrong passcode/i.test(S.error)) {
    // Retrying with the same stored passcode can't succeed, so send them to re-enter it.
    h += `<div class="banner err">${esc(S.error)} <button data-go="#/settings">Re-enter passcode</button></div>`;
  } else if (S.error) {
    h += `<div class="banner err">${esc(S.error)} <button data-act="refresh">Retry</button></div>`;
  }
  return h;
}

const pct = w => `${Math.round(w * 100)}%`;
const badge = l => l.score == null
  ? `<div class="badge todo">?</div>`
  : `<div class="badge">${f1(l.score)}<small>${grade(l.score)}</small></div>`;

// ---------- screens ----------
function screenSetup() {
  const m = model();
  const name = api.getName();
  return `<div class="page no-tabs">
    <h1 class="script">All the Joes</h1>
    <div class="sub">The Bay Area Original Joe's Tour</div>
    <hr class="rule">
    <p class="center">Welcome! Tell us who you are so your scores are labeled.</p>
    <label class="lbl">Your name</label>
    <input class="input" id="nameInput" value="${esc(name)}" placeholder="e.g. Mom" autocomplete="given-name" maxlength="40">
    ${m.people.length ? `<div class="choices" style="margin-top:10px">${m.people.map(p => `<button class="choice" data-act="pickName" data-name="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
    ${api.isDemo() ? '' : `<label class="lbl">Family passcode</label>
    <input class="input" id="passInput" type="password" value="${esc(api.getPasscode())}" autocomplete="off">`}
    <div class="btn-stack"><button class="btn" data-act="saveSetup">Let's Eat</button></div>
  </div>`;
}

function screenHome() {
  const m = model();
  const visited = m.locs.filter(l => l.score != null).length;
  const t = today();
  const live = m.visits.filter(v => v.date === t);
  const sorted = [...m.locs].sort((a, b) => (b.last?.date || '').localeCompare(a.last?.date || ''));
  return `<div class="page">
    <div class="topbar"><button class="icon-btn" data-act="refresh" aria-label="Refresh">${S.loading ? '<span class="spin">↻</span>' : '↻'}</button><button class="icon-btn" data-go="#/settings" aria-label="Settings">⚙︎</button></div>
    ${banners()}
    <h1 class="script">All the Joes</h1>
    <div class="sub">The Bay Area Original Joe's Tour</div>
    <hr class="rule">
    <div class="row"><span class="name">Joes Visited</span><span class="dots"></span><span class="val">${visited} of ${m.locs.length}</span></div>
    <div class="progress"><div style="width:${m.locs.length ? (visited / m.locs.length) * 100 : 0}%"></div></div>
    ${live.map(v => `<div class="live" data-go="#/wrap/${encodeURIComponent(v.id)}"><span class="dot"></span><div style="flex:1"><b>Happening today · ${esc(v.location?.name)}</b><div class="small muted">${v.ratings.length} rated so far · tap to join</div></div><span>›</span></div>`).join('')}
    <div class="section-head">Locations</div>
    ${sorted.length ? sorted.map(l => `
      <div class="loc" data-act="openLoc" data-loc="${esc(l.id)}">
        ${badge(l)}
        <div class="meta"><b>${esc(l.name)}</b><i>${esc(l.area)}${l.last ? ` · last ${esc(prettyDate(l.last.date))}` : ''}${l.visits.length > 1 ? ` · ${l.visits.length} visits` : ''}</i></div>
        ${l.score != null ? '<span class="pill">✓ Rated</span>' : '<span class="pill gold">To visit</span>'}
      </div>`).join('') : `<div class="empty">${S.loading ? 'Loading…' : 'No locations yet. Add them in the Locations tab of the Google Sheet.'}</div>`}
    <div class="btn-stack"><a class="btn" href="#/new">★ Start a Visit</a></div>
  </div>${tabbar('home')}`;
}

function screenNew() {
  const m = model();
  const nv = S.newVisit;
  return `<div class="page">
    <h2 class="script">Start a Visit</h2>
    <div class="sub">Everyone picks the same Joe's &amp; date to rate together</div>
    <label class="lbl">Which Joe's?</label>
    <div class="loc-pick">${m.locs.map(l => `<button class="${nv.loc === l.id ? 'on' : ''}" data-act="pickLoc" data-loc="${esc(l.id)}"><b>${esc(l.name)}</b><i>${esc(l.area)}${l.score != null ? ` · ${f1(l.score)} so far` : ''}</i></button>`).join('')}</div>
    <label class="lbl">Date</label>
    <input class="input" type="date" id="dateInput" value="${esc(nv.date)}" max="${today()}">
    <div class="btn-stack"><button class="btn" data-act="startVisit" ${nv.loc ? '' : 'disabled'}>Start Rating</button></div>
  </div>${tabbar('new')}`;
}

function ensureDraft(id, m) {
  if (S.draft && S.draft.id === id) return S.draft;
  const me = api.getName().toLowerCase();
  const existing = m.visitById[id]?.ratings.find(r => r.person.toLowerCase() === me);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('joes.draft.' + id)); } catch { /* none */ }
  const { date } = parseVisit(id);
  const scores = saved?.scores || (existing ? { ...existing.scores } : { decor: null, service: null, bath: null, food: null, xmas: inXmasSeason(date) ? null : null });
  S.draft = {
    id,
    scores,
    xmasNA: saved ? saved.xmasNA : existing ? existing.scores.xmas == null : !inXmasSeason(date),
    comment: saved?.comment ?? existing?.comment ?? '',
    files: [],
    isEdit: !!existing,
    showMissing: false,
  };
  return S.draft;
}
const saveDraftLocal = () => {
  const d = S.draft;
  if (!d) return;
  try { localStorage.setItem('joes.draft.' + d.id, JSON.stringify({ scores: d.scores, xmasNA: d.xmasNA, comment: d.comment })); } catch { /* ignore */ }
};

function catsHtml(d, W) {
  return CATS.map(c => {
    const na = c.optional && d.xmasNA;
    const v = na ? null : d.scores[c.k];
    const missing = d.showMissing && !c.optional && v == null;
    return `<div class="cat${c.optional ? ' tertiary' : ''}${missing ? ' missing' : ''}">
      <div class="cat-top"><div><b>${c.emoji} ${c.name}</b> <span class="w">${pct(W[c.k])}</span></div><span class="score">${na ? '<span class="na-tag">N/A</span>' : v ?? ''}</span></div>
      <div class="hint">${na ? 'Off-season · skipped, other weights scale up to 100%' : missing ? '<span style="color:var(--red)">Tap a score</span>' : c.hint}</div>
      <div class="dots10${na ? ' off' : ''}">${Array.from({ length: 10 }, (_, i) => `<button data-act="score" data-k="${c.k}" data-v="${i + 1}" class="${v != null && i + 1 <= v ? 'on' : ''}" aria-label="${c.name} ${i + 1}">${i + 1}</button>`).join('')}</div>
      ${c.optional ? `<button class="na-btn${na ? ' on' : ''}" data-act="toggleNA">${na ? '✓ ' : ''}N/A · Off-season</button>` : ''}
    </div>`;
  }).join('');
}

function myScore(d, W) {
  const s = { ...d.scores };
  if (d.xmasNA) s.xmas = null;
  return CORE.every(k => s[k] != null) ? overall(s, W) : null;
}

function screenRate(id) {
  const m = model();
  const { loc, date } = parseVisit(id);
  const l = m.locById[loc];
  if (!l && !S.loading) return `<div class="page">${banners()}<div class="empty">Unknown location.<br><a href="#/new">Start a visit</a></div></div>${tabbar('new')}`;
  const d = ensureDraft(id, m);
  const v = m.visitById[id];
  const me = api.getName();
  const others = (v?.ratings || []).filter(r => r.person.toLowerCase() !== me.toLowerCase());
  return `<div class="page">
    <div class="topbar"><button class="back" data-go="#/">‹ Home</button><button class="icon-btn" data-act="share" aria-label="Share">⤴︎</button></div>
    ${banners()}
    <div class="sub">${d.isEdit ? 'Editing your card' : 'Now rating'}</div>
    <h2 class="script">${esc(l?.name || loc)}</h2>
    <div class="sub">${esc(prettyDate(date))}</div>
    <div class="who">
      <div class="me${d.isEdit ? ' done' : ''}">${initial(me)}</div>
      ${others.map(r => `<div class="done" title="${esc(r.person)}">${initial(r.person)}</div>`).join('')}
    </div>
    <div class="center small muted">Rating as <b>${esc(me)}</b>${others.length ? ` · ${others.map(r => esc(r.person)).join(', ')} done` : ''}</div>
    <div id="cats">${catsHtml(d, m.W)}</div>
    <div class="section-head">Comments</div>
    <textarea class="note" id="comment" maxlength="2000" placeholder="What stood out? Best dish? Bathroom horror stories?">${esc(d.comment)}</textarea>
    <div class="section-head">Photos</div>
    <div class="photo-row" id="photoRow">${photoRowHtml(d, v)}</div>
    <div class="row" style="margin-top:16px"><span class="name">Your Score</span><span class="dots"></span><span class="val" id="myOverall" style="color:var(--red);font-size:20px">${f1(myScore(d, m.W))}</span></div>
    <div class="btn-stack">
      <button class="btn" data-act="submit" id="submitBtn" ${S.busy ? 'disabled' : ''}>${S.busy ? esc(S.busy) : d.isEdit ? 'Update My Card' : 'Submit My Card'}</button>
      ${v && v.ratings.length ? `<button class="btn ghost" data-go="#/wrap/${encodeURIComponent(id)}">See the Wrap-Up</button>` : ''}
    </div>
  </div>${tabbar('new')}`;
}

function photoRowHtml(d, v) {
  const mine = (v?.photos || []).filter(p => String(p.person).toLowerCase() === api.getName().toLowerCase());
  return mine.map(p => `<div class="thumb" style="background-image:url('${esc(p.url)}')"></div>`).join('') +
    d.files.map((f, i) => `<div class="thumb" style="background-image:url('${f.preview}')"><button data-act="removeFile" data-i="${i}" aria-label="Remove">✕</button></div>`).join('') +
    `<label class="add-photo" aria-label="Add photos">＋<input type="file" accept="image/*" multiple id="fileInput"></label>`;
}

function screenWrap(id) {
  const m = model();
  const v = m.visitById[id];
  const { loc, date } = parseVisit(id);
  const l = m.locById[loc];
  if (!v || !v.ratings.length) {
    return `<div class="page">${banners()}
      <div class="topbar"><button class="back" data-go="#/">‹ Home</button><button class="icon-btn" data-act="refresh">${S.loading ? '<span class="spin">↻</span>' : '↻'}</button></div>
      <h2 class="script">${esc(l?.name || loc)}</h2><div class="sub">${esc(prettyDate(date))}</div>
      <div class="empty">${S.loading ? 'Loading…' : 'No scores yet for this visit.'}</div>
      <a class="btn" href="#/rate/${encodeURIComponent(id)}">Rate This Visit</a>
    </div>${tabbar('reports')}`;
  }
  const people = v.ratings;
  const me = api.getName().toLowerCase();
  const iRated = people.some(r => r.person.toLowerCase() === me);
  const usedCats = CATS.filter(c => v.avg[c.k] != null);
  const ranked = m.locs.filter(x => x.score != null).sort((a, b) => b.score - a.score);
  const rankPos = ranked.findIndex(x => x.id === loc) + 1;
  const personO = people.map(r => [r.person, overall(r.scores, m.W)]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
  const tw = usedCats.reduce((t, c) => t + m.W[c.k], 0);
  const comments = people.filter(r => r.comment.trim());
  return `<div class="page">
    <div class="topbar"><button class="back" data-go="#/reports">‹ Reports</button><div><button class="icon-btn" data-act="share" aria-label="Share">⤴︎</button><button class="icon-btn" data-act="refresh" aria-label="Refresh">${S.loading ? '<span class="spin">↻</span>' : '↻'}</button></div></div>
    ${banners()}
    <h2 class="script">Report Card</h2>
    <div class="sub">Original Joe's · ${esc(l?.name || loc)}</div>
    <div class="card">
      ${v.overall >= 8 ? '<div class="stamp">Honor Roll</div>' : v.overall < 6 ? '<div class="stamp red">Detention</div>' : ''}
      <div class="sub" style="text-align:left;padding-right:110px">Visited ${esc(prettyDate(date))} · ${people.length} ${people.length === 1 ? 'rater' : 'raters'}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 2px"><span class="script" style="font-size:56px;line-height:1">${grade(v.overall)}</span><span style="font-size:26px;font-weight:700">${f1(v.overall)} / 10</span></div>
      <div class="math">${usedCats.map(c => `${pct(m.W[c.k] / tw)}×${f1(v.avg[c.k])}`).join(' + ')}</div>
      <div style="margin-top:10px">${CATS.map(c => `<div class="grade-row"><b>${c.emoji} ${c.short}</b><div class="bar"><div style="width:${(v.avg[c.k] || 0) * 10}%"></div></div><span class="num">${v.avg[c.k] == null ? 'N/A' : f1(v.avg[c.k])}</span><span class="grade">${v.avg[c.k] == null ? '' : grade(v.avg[c.k])}</span></div>`).join('')}</div>
      ${v.photos.length ? `<div class="photos">${v.photos.map(p => `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="background-image:url('${esc(p.url)}')" aria-label="Photo by ${esc(p.person)}"></a>`).join('')}</div>` : ''}
      ${comments.map(r => `<div class="quote">"${esc(r.comment)}"<em>— ${esc(r.person)}</em></div>`).join('')}
    </div>
    <div class="section-head">Everyone's Scores</div>
    <div class="table-wrap"><table class="grid">
      <tr><th></th>${people.map(r => `<th title="${esc(r.person)}">${esc(r.person)}</th>`).join('')}<th>Avg</th></tr>
      ${CATS.map(c => {
        const vals = people.map(r => r.scores[c.k]);
        const real = vals.filter(x => x != null);
        const mx = Math.max(...real), mn = Math.min(...real);
        return `<tr><td>${c.emoji} ${c.short}</td>${vals.map(x => `<td>${x == null ? '<span class="muted">–</span>' : `<span class="${mx !== mn && x === mx ? 'hi' : mx !== mn && x === mn ? 'lo' : ''}">${x}</span>`}</td>`).join('')}<td class="avg">${f1(v.avg[c.k])}</td></tr>`;
      }).join('')}
      <tr><td>Overall</td>${people.map(r => `<td><b>${f1(overall(r.scores, m.W))}</b></td>`).join('')}<td class="avg">${f1(v.overall)}</td></tr>
    </table></div>
    ${personO.length > 1 ? `<div class="section-head">Superlatives</div>
      <div class="row"><span class="name">Toughest Critic</span><span class="dots"></span><span class="val">${esc(personO[0][0])} (${f1(personO[0][1])})</span></div>
      <div class="row"><span class="name">Biggest Fan</span><span class="dots"></span><span class="val">${esc(personO.at(-1)[0])} (${f1(personO.at(-1)[1])})</span></div>` : ''}
    ${rankPos ? `<div class="row"><span class="name">${esc(l?.name || '')} Rank</span><span class="dots"></span><span class="val">#${rankPos} of ${ranked.length}</span></div>` : ''}
    <div class="btn-stack">
      <a class="btn" href="#/rate/${encodeURIComponent(id)}">${iRated ? 'Edit My Scores / Add Photos' : 'Add My Scores'}</a>
    </div>
  </div>${tabbar('reports')}`;
}

function screenReports() {
  const m = model();
  const list = m.visits.filter(v => v.ratings.length);
  return `<div class="page">
    ${banners()}
    <h2 class="script">Report Cards</h2>
    <div class="sub">Every visit, newest first</div>
    <hr class="rule">
    ${list.length ? list.map(v => `
      <div class="visit-item" data-go="#/wrap/${encodeURIComponent(v.id)}">
        <div class="badge">${f1(v.overall)}<small>${grade(v.overall)}</small></div>
        <div class="meta"><b>${esc(v.location?.name || v.loc)}</b><i>${esc(prettyDate(v.date))} · ${v.ratings.length} ${v.ratings.length === 1 ? 'rater' : 'raters'}${v.photos.length ? ` · ${v.photos.length} 📷` : ''}${v.avg.xmas == null ? ' · 🎄 N/A' : ''}</i></div>
        <span>›</span>
      </div>`).join('') : `<div class="empty">${S.loading ? 'Loading…' : 'No visits yet. Start one from the Rate tab!'}</div>`}
  </div>${tabbar('reports')}`;
}

function screenRanks() {
  const m = model();
  const by = S.rankBy;
  const val = l => (by === 'overall' ? l.score : l.avg[by]);
  const rated = m.locs.filter(l => val(l) != null).sort((a, b) => val(b) - val(a));
  const unrated = m.locs.filter(l => val(l) == null);
  const best = l => { const c = CATS.filter(c => l.avg[c.k] != null).sort((a, b) => l.avg[b.k] - l.avg[a.k])[0]; return c ? `${c.emoji} ${c.short}` : ''; };
  return `<div class="page">
    ${banners()}
    <h2 class="script">The Rankings</h2>
    <div class="sub">Best Joe's so far</div>
    <div class="chips">
      <button class="${by === 'overall' ? 'on' : ''}" data-act="rankBy" data-k="overall">Overall</button>
      ${CATS.map(c => `<button class="${by === c.k ? 'on' : ''}" data-act="rankBy" data-k="${c.k}">${c.emoji} ${c.short}</button>`).join('')}
    </div>
    ${rated.map((l, i) => `<div class="rank" data-act="openLoc" data-loc="${esc(l.id)}"><span class="n">${i + 1}</span><div class="meta"><b>${esc(l.name)}</b><i>${esc(l.area)} · ${l.visits.length} ${l.visits.length === 1 ? 'visit' : 'visits'}${by === 'overall' && best(l) ? ` · best at ${best(l)}` : ''}</i></div><span class="s">${f1(val(l))}</span></div>`).join('')}
    ${unrated.map(l => `<div class="rank dim" data-act="openLoc" data-loc="${esc(l.id)}"><span class="n">–</span><div class="meta"><b>${esc(l.name)}</b><i>${l.score == null ? 'Not visited yet' : 'No Christmas scores yet'}</i></div><span class="s">?</span></div>`).join('')}
    <div class="boxed">
      <div class="sub">Weighting</div>
      ${[...CATS].sort((a, b) => m.W[b.k] - m.W[a.k]).map(c => `<div class="row"><span class="name">${c.emoji} ${c.name}</span><span class="dots"></span><span class="val">${pct(m.W[c.k])}</span></div>`).join('')}
      <div class="small muted" style="margin-top:6px">Christmas N/A off-season: the rest scale up to 100%. A Joe's with several visits uses the average.</div>
    </div>
  </div>${tabbar('ranks')}`;
}

function screenSettings() {
  return `<div class="page">
    <div class="topbar"><button class="back" data-go="#/">‹ Home</button><span></span></div>
    <h2 class="script">Settings</h2>
    ${S.error ? `<div class="banner err">${esc(S.error)}</div>` : ''}
    <label class="lbl">Your name</label>
    <input class="input" id="nameInput" value="${esc(api.getName())}" maxlength="40">
    <label class="lbl">Family passcode</label>
    <input class="input" id="passInput" type="password" value="${esc(api.getPasscode())}" autocomplete="off">
    <label class="lbl">Google Sheet web app URL</label>
    <input class="input" id="backendInput" value="${esc(localStorage.getItem('joes.backend') || '')}" placeholder="${api.SCRIPT_URL.startsWith('https') ? 'Using the built-in URL' : 'https://script.google.com/macros/s/…/exec'}" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="small muted" style="margin-top:6px">${api.isDemo() ? 'Not connected — the app is in demo mode with sample data stored only on this phone.' : 'Connected to the Google Sheet.'}</div>
    <div class="btn-stack">
      <button class="btn" data-act="saveSettings">Save &amp; Test Connection</button>
      ${api.isDemo() ? '<button class="btn ghost" data-act="resetDemo">Reset Demo Data</button>' : ''}
    </div>
    <p class="small muted center" style="margin-top:28px">Tip: in Safari tap Share → Add to Home Screen to use All the Joes like an app.</p>
  </div>${tabbar('')}`;
}

// ---------- render & routing ----------
function route() {
  const [p = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { p, arg: arg ? decodeURIComponent(arg) : '' };
}

function render() {
  const { p, arg } = route();
  const app = $('#app');
  const y = window.scrollY;
  const keepScroll = app.dataset.route === location.hash;
  if (!api.getName() || (!api.isDemo() && !api.getPasscode() && p !== 'settings')) {
    app.innerHTML = screenSetup();
  } else {
    app.innerHTML =
      p === 'new' ? screenNew() :
      p === 'rate' && arg ? screenRate(arg) :
      p === 'wrap' && arg ? screenWrap(arg) :
      p === 'reports' ? screenReports() :
      p === 'ranks' ? screenRanks() :
      p === 'settings' ? screenSettings() :
      screenHome();
  }
  app.dataset.route = location.hash;
  window.scrollTo(0, keepScroll ? y : 0);
}

window.addEventListener('hashchange', () => {
  const { p, arg } = route();
  if (!(p === 'rate' && S.draft?.id === arg)) S.draft = null;
  render();
});

// ---------- actions ----------
async function share() {
  const { arg } = route();
  const m = model();
  const name = m.locById[parseVisit(arg).loc]?.name || "Original Joe's";
  const url = `${location.origin}${location.pathname}#/rate/${encodeURIComponent(arg)}`;
  const data = { title: 'All the Joes', text: `Rate ${name} with us!`, url };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(url); toast('Link copied'); }
  } catch { /* user cancelled */ }
}

async function submit() {
  const d = S.draft;
  const m = model();
  const { loc, date } = parseVisit(d.id);
  d.comment = $('#comment')?.value ?? d.comment;
  if (!CORE.every(k => d.scores[k] != null)) {
    d.showMissing = true;
    $('#cats').innerHTML = catsHtml(d, m.W);
    document.querySelector('.cat.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Score all four main categories first');
    return;
  }
  const me = api.getName();
  const files = [...d.files];
  try {
    S.busy = 'Saving scores…'; render();
    await api.submitRating({
      visit_id: d.id, location_id: loc, visit_date: date, person: me,
      decor: d.scores.decor, service: d.scores.service, bath: d.scores.bath, food: d.scores.food,
      xmas: d.xmasNA ? null : d.scores.xmas, comment: d.comment,
    });
    localStorage.removeItem('joes.draft.' + d.id);
    for (let i = 0; i < files.length; i++) {
      S.busy = `Uploading photo ${i + 1} of ${files.length}…`; render();
      await api.submitPhoto(files[i].file, { visit_id: d.id, location_id: loc, person: me, caption: '' });
      d.files = d.files.filter(f => f !== files[i]);
    }
    S.busy = false;
    S.draft = null;
    toast('Saved! 🍝');
    location.hash = `#/wrap/${encodeURIComponent(d.id)}`;
    refresh(true);
  } catch (e) {
    S.busy = false;
    render();
    toast('Not saved: ' + e.message);
  }
}

document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const m = () => model();

  if (act === 'refresh') refresh();
  else if (act === 'pickName') $('#nameInput').value = el.dataset.name;
  else if (act === 'saveSetup') {
    const n = $('#nameInput').value.trim();
    if (!n) return toast('Enter your name');
    api.setName(n);
    if ($('#passInput')) {
      if (!$('#passInput').value.trim()) return toast('Enter the family passcode');
      api.setPasscode($('#passInput').value);
    }
    render();
    refresh(true);
  }
  else if (act === 'openLoc') {
    const l = m().locById[el.dataset.loc];
    if (l?.last) location.hash = `#/wrap/${encodeURIComponent(l.last.id)}`;
    else { S.newVisit.loc = el.dataset.loc; location.hash = '#/new'; }
  }
  else if (act === 'pickLoc') { S.newVisit.loc = el.dataset.loc; S.newVisit.date = $('#dateInput').value || today(); render(); }
  else if (act === 'startVisit') {
    const date = $('#dateInput').value || today();
    S.newVisit.date = date;
    location.hash = `#/rate/${encodeURIComponent(visitId(S.newVisit.loc, date))}`;
  }
  else if (act === 'score' || act === 'toggleNA') {
    const d = S.draft;
    if (act === 'score') { d.scores[el.dataset.k] = Number(el.dataset.v); if (el.dataset.k === 'xmas') d.xmasNA = false; }
    else d.xmasNA = !d.xmasNA;
    saveDraftLocal();
    const W = m().W;
    $('#cats').innerHTML = catsHtml(d, W);
    $('#myOverall').textContent = f1(myScore(d, W));
  }
  else if (act === 'removeFile') {
    const d = S.draft;
    URL.revokeObjectURL(d.files[+el.dataset.i]?.preview);
    d.files.splice(+el.dataset.i, 1);
    $('#photoRow').innerHTML = photoRowHtml(d, m().visitById[d.id]);
  }
  else if (act === 'submit') submit();
  else if (act === 'share') share();
  else if (act === 'rankBy') { S.rankBy = el.dataset.k; render(); }
  else if (act === 'saveSettings') {
    const n = $('#nameInput').value.trim();
    if (n) api.setName(n);
    api.setPasscode($('#passInput').value);
    api.setBackend($('#backendInput').value);
    S.data = null;
    localStorage.removeItem(CACHE);
    await refresh();
    toast(S.error ? 'Connection failed' : api.isDemo() ? 'Saved · demo mode' : 'Connected to the Google Sheet ✓');
  }
  else if (act === 'resetDemo') { api.resetDemo(); await refresh(); toast('Demo data reset'); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'comment' && S.draft) { S.draft.comment = e.target.value; saveDraftLocal(); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'fileInput' && S.draft) {
    const d = S.draft;
    [...e.target.files].forEach(file => d.files.push({ file, preview: URL.createObjectURL(file) }));
    $('#photoRow').innerHTML = photoRowHtml(d, model().visitById[d.id]);
  }
  if (e.target.id === 'dateInput') S.newVisit.date = e.target.value;
});

// Refresh when coming back to the app (e.g. after others submit).
document.addEventListener('visibilitychange', () => { if (!document.hidden && api.getName()) refresh(true); });

render();
if (api.getName()) refresh(true);
