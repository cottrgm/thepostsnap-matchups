(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var state = {
    team: null, season: null, data: null, teams: [],
    rankTab: 0, zoneTab: 0, sitTab: 0, sitSide: 0, adjSide: 0,
    plTab: 0, plSort: null, plAsc: false, players: null,
    pcSide: 0, pcSeq: 0
  };

  function el(t, a, txt) {
    var n = document.createElementNS(NS, t);
    for (var k in a) if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]);
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }
  function h(t, cls, txt) {
    var n = document.createElement(t);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  }
  function pct(v, d) { return v === null || v === undefined || isNaN(v) ? '–' : (v * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function num(v, d) { return v === null || v === undefined || isNaN(v) ? '–' : (+v).toFixed(d === undefined ? 2 : d); }
  function sgn(v, d) { if (v === null || v === undefined || isNaN(v)) return '–'; var s = (+v).toFixed(d === undefined ? 2 : d); return +v > 0 ? '+' + s : s; }
  function css(name) { return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(name).trim(); }

  /* ---- tooltip ---- */
  var tip = document.getElementById('tip');
  function bindTip(node, html) {
    node.addEventListener('mouseenter', function (e) { tip.innerHTML = html; tip.hidden = false; move(e); });
    node.addEventListener('mousemove', move);
    node.addEventListener('mouseleave', function () { tip.hidden = true; });
    function move(e) {
      var pad = 14, w = tip.offsetWidth, ht = tip.offsetHeight;
      var x = e.clientX + pad, y = e.clientY + pad;
      if (x + w > innerWidth - 8) x = e.clientX - w - pad;
      if (y + ht > innerHeight - 8) y = e.clientY - ht - pad;
      tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
    }
  }

  /* ---- segmented control ---- */
  function segs(host, labels, active, onPick) {
    host.innerHTML = '';
    labels.forEach(function (lab, i) {
      var b = h('button', null, lab);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === active ? 'true' : 'false');
      b.onclick = function () { onPick(i); };
      host.appendChild(b);
    });
  }

  /* ---- diverging rank bars ---- */
  function rankChart(rows, valFmt) {
    var W = 940, LBL = 250, PAD = 170, RIGHT = W - PAD, TRACK = RIGHT - LBL;
    var ROW = 25, TOP = 34, H = TOP + rows.length * ROW + 34;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    var mid = LBL + TRACK / 2;
    var POS = css('--pos'), NEG = css('--neg');

    [-0.5, -0.25, 0, 0.25, 0.5].forEach(function (t) {
      var x = mid + t * TRACK;
      svg.appendChild(el('line', { x1: x, x2: x, y1: TOP - 12, y2: TOP + rows.length * ROW, class: t === 0 ? 'base' : 'gl' }));
      svg.appendChild(el('text', { x: x, y: TOP + rows.length * ROW + 18, 'text-anchor': 'middle', class: 'ax' },
        t === 0 ? 'FBS median' : (t > 0 ? '+' : '') + Math.round(t * 100) + ' pct'));
    });
    svg.appendChild(el('text', { x: mid - TRACK / 2, y: TOP - 20, 'text-anchor': 'start', class: 'ax' }, 'last in FBS'));
    svg.appendChild(el('text', { x: mid + TRACK / 2, y: TOP - 20, 'text-anchor': 'end', class: 'ax' }, 'best in FBS'));

    rows.forEach(function (r, i) {
      var y = TOP + i * ROW + ROW / 2;
      var g = el('g', {});
      g.appendChild(el('text', { x: LBL - 14, y: y + 4, 'text-anchor': 'end', class: 'lbl' }, r.label));
      var vtxt = (r.value === null ? '–' : r.fmtRate ? pct(r.value, 1) : valFmt(r.value));
      g.appendChild(el('text', { x: RIGHT + 14, y: y + 4, 'text-anchor': 'start', class: 'num' },
        r.rank ? vtxt + '  ·  #' + r.rank + '/' + r.pool : vtxt));
      if (r.p === null) {
        g.appendChild(el('text', { x: mid, y: y + 4, 'text-anchor': 'middle', class: 'ax' }, 'not ranked'));
      } else {
        var d = r.p - 0.5, w = Math.abs(d) * TRACK, x = d >= 0 ? mid : mid - w;
        var rect = el('rect', { x: x, y: y - 7, width: Math.max(w, 1.5), height: 14, rx: 3, fill: d >= 0 ? POS : NEG });
        g.appendChild(rect);
      }
      var hit = el('rect', { x: 0, y: y - ROW / 2, width: W, height: ROW, class: 'hit' });
      bindTip(hit, '<b>' + r.label + '</b><br>' + r.metric + ': ' + vtxt +
        (r.rank ? '<br>Rank <b>' + r.rank + '</b> of ' + r.pool + ' FBS teams' : '<br><span class="tv">not ranked — too few plays</span>') +
        (r.plays ? '<br><span class="tv">' + r.plays + ' plays</span>' : ''));
      g.appendChild(hit);
      svg.appendChild(g);
    });
    return svg;
  }

  function buildRank() {
    var host = document.getElementById('rankChart');
    var specs = [
      { side: 'Offense', metric: 'Success rate', key: 'success_rate', rk: 'sr_rank', fmt: function (v) { return pct(v); } },
      { side: 'Offense', metric: 'EPA per play', key: 'epa_per_play', rk: 'epa_rank', fmt: function (v) { return sgn(v); } },
      { side: 'Defense', metric: 'Success rate allowed', key: 'success_rate', rk: 'sr_rank', fmt: function (v) { return pct(v); } },
      { side: 'Defense', metric: 'EPA allowed', key: 'epa_per_play', rk: 'epa_rank', fmt: function (v) { return sgn(v); } }
    ];
    segs(document.getElementById('rankTabs'), ['Offense · success rate', 'Offense · EPA', 'Defense · success rate', 'Defense · EPA'],
      state.rankTab, function (i) { state.rankTab = i; buildRank(); });
    var s = specs[state.rankTab];
    /* Rows that are outcomes rather than play calls: success rate is fixed by definition (every sack fails,
       every explosive play succeeds), so on the success-rate views they are ranked on how often they happen.
       1 = higher is better for the offense, -1 = lower is better; flipped for the defense. */
    var OUTCOME = { 'Sacks': -1, 'Sack Rate': -1, 'Negative Plays': -1, 'Stuffed Run (0 or less)': -1,
      'Explosive Plays': 1, 'Explosive Pass (15+)': 1, 'Explosive Run (12+)': 1 };
    var rows = state.data.playcalling
      .filter(function (r) { return r.season === state.season && r.side === s.side; })
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .map(function (r) {
        if (s.key === 'success_rate' && OUTCOME[r.label] && r.usage_rank && r.teams_in_pool > 1) {
          var dir = OUTCOME[r.label] * (s.side === 'Offense' ? 1 : -1), pl = r.teams_in_pool;
          var rk = dir > 0 ? r.usage_rank : pl + 1 - r.usage_rank;
          return { label: /rate/i.test(r.label) ? r.label : r.label + ' (rate)', value: r.usage, rank: rk, pool: pl, p: (pl - rk) / (pl - 1), plays: r.plays,
            metric: (r.label === 'Sack Rate' ? 'Share of dropbacks' : /Run/.test(r.label) ? 'Share of runs' : /Pass/.test(r.label) ? 'Share of dropbacks' : 'Share of plays') +
              ' (FBS median ' + pct(r.fbs_median_usage, 1) + '; ' + (dir > 0 ? 'more' : 'fewer') + ' is better here)', fmtRate: true };
        }
        var rank = r[s.rk], pool = r.perf_pool;
        var p = (rank && pool > 1) ? (pool - rank) / (pool - 1) : null;
        return { label: r.label, value: r[s.key], rank: rank, pool: pool, p: p, plays: r.plays, metric: s.metric };
      });
    host.innerHTML = '';
    if (!rows.length) { host.appendChild(h('p', 'ax', 'No data for this season.')); return; }
    host.appendChild(rankChart(rows, s.fmt));
  }

  /* ---- the playcalling chart, live ----
     Same rows, colors and ranks as the downloadable sheet, drawn as a table so every row can be
     filtered, sorted and opened to the plays behind it. Unfiltered numbers come from the same
     season tables as the image; filtered ones are rebuilt from the play-by-play on request. */
  var PC_DEF = {
    'All Plays': 'Every scrimmage play: dropbacks (passes and sacks) plus designed runs.',
    'Dropbacks (Pass + Sack)': 'Share of plays that were a pass attempt or a sack.',
    'Designed Runs': 'Share of plays that were a called run (scrambles count as dropbacks only when the play started as a pass).',
    'QB Runs & Scrambles': 'Runs by the quarterback, designed or scrambles, as a share of all plays.',
    'Sacks': 'Sacks as a share of all plays.',
    'Explosive Plays': 'Runs of 12+ yards and passes of 15+ yards, as a share of all plays.',
    'Negative Plays': 'Plays that lost yardage.',
    '1st Down': 'Plays on 1st down.', '2nd Down': 'Plays on 2nd down.', '3rd / 4th Down': 'Plays on 3rd and 4th down.',
    'Standard Downs': '1st down, 2nd and 7 or less, 3rd/4th and 4 or less: downs where the offense can do anything.',
    'Passing Downs': '2nd and 8+, 3rd/4th and 5+: downs where the defense expects a pass.',
    'Red Zone': 'Plays snapped inside the opponent 20.', 'Goal to Go': 'Plays where the line to gain is the goal line.',
    'Shotgun': 'Plays from shotgun or pistol, as a share of plays where the formation was recorded.',
    'No Huddle': 'Plays run without a huddle, as a share of plays where tempo was recorded.',
    'Early-Down Dropback': 'Dropbacks on 1st and 2nd down, as a share of all dropbacks.',
    'Late-Down Dropback': 'Dropbacks on 3rd and 4th down, as a share of all dropbacks.',
    'Standard-Down Dropback': 'Dropbacks on standard downs, as a share of all dropbacks.',
    'Passing-Down Dropback': 'Dropbacks on passing downs, as a share of all dropbacks.',
    'Completions': 'Completed passes as a share of dropbacks.', 'Explosive Pass (15+)': 'Completions of 15+ yards as a share of dropbacks.',
    'Sack Rate': 'Sacks as a share of dropbacks.', 'Red-Zone Dropback': 'Dropbacks inside the opponent 20, as a share of all dropbacks.',
    'Short Target': 'Throws under 10 yards past the line, as a share of dropbacks.', 'Deep Target': 'Throws 20+ yards past the line, as a share of dropbacks.',
    'QB Run (incl. Scramble)': 'Quarterback carries as a share of runs.', 'RB / Other Run': 'Carries by anyone but the quarterback, as a share of runs.',
    'Early-Down Run': 'Runs on 1st and 2nd down, as a share of runs.', 'Late-Down Run': 'Runs on 3rd and 4th down, as a share of runs.',
    'Explosive Run (12+)': 'Runs of 12+ yards, as a share of runs.', 'Opportunity Run (4+)': 'Runs that gained 4+ yards: the line did its job.',
    'Stuffed Run (0 or less)': 'Runs stopped at or behind the line.', 'Short-Yardage Run': 'Runs on 3rd or 4th and 2 or less, as a share of runs.',
    'Red-Zone Run': 'Runs inside the opponent 20, as a share of runs.'
  };
  var PC_NO_SR = { 'Negative Plays': 1, 'Explosive Plays': 1, 'Explosive Pass (15+)': 1, 'Explosive Run (12+)': 1, 'Stuffed Run (0 or less)': 1, 'Sacks': 1, 'Sack Rate': 1 };
  if (!state.pcf) state.pcf = { opp: '', last: '', fbs: false, ng: false };
  state.pcSort = state.pcSort || null; state.pcAsc = false; state.tdSide = state.tdSide || 0;

  function isDarkTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  /* rank shading: same endpoints as the sheet (soft red -> neutral -> soft blue) */
  function shade(p) {
    var d = isDarkTheme();
    var bad = hex2rgb(d ? '#9a3a2e' : '#e69a8e'), mid = hex2rgb(d ? '#1e2735' : '#eef1f6'), good = hex2rgb(d ? '#2f56b8' : '#8aa6ea');
    if (p === null || p === undefined) return rgb(mid);
    var t = 0.12 + 0.76 * p;
    return t < 0.5 ? rgb(lerp(bad, mid, t / 0.5)) : rgb(lerp(mid, good, (t - 0.5) / 0.5));
  }
  function pcQuery(side, extra) {
    var f = state.pcf, q = 'team=' + encodeURIComponent(state.team) + '&season=' + state.season + '&side=' + side;
    if (f.opp) q += '&opp=' + encodeURIComponent(f.opp);
    if (f.last) q += '&last=' + f.last;
    if (f.fbs) q += '&fbs=1';
    if (f.ng) q += '&ng=1';
    return q + (extra || '');
  }
  function pcFilterText() {
    var f = state.pcf, bits = [];
    if (f.opp) bits.push('vs ' + f.opp);
    if (f.last) bits.push('last ' + f.last + ' games');
    if (f.fbs) bits.push('FBS opponents only');
    if (f.ng) bits.push('garbage time removed');
    return bits.join(' · ');
  }

  /* filter bar shared by the chart and the tendencies panel */
  function pcFilters(host, games, onChange) {
    host = document.getElementById('gFilters') || host;
    host.innerHTML = '';
    var opp = h('select'); opp.appendChild(new Option('All opponents', ''));
    (games || []).forEach(function (g) { opp.appendChild(new Option('Wk ' + g.week + ' · ' + g.opponent, g.opponent)); });
    opp.value = state.pcf.opp;
    var last = h('select');
    [['', 'Whole season'], ['3', 'Last 3 games'], ['5', 'Last 5 games']].forEach(function (o) { last.appendChild(new Option(o[1], o[0])); });
    last.value = state.pcf.last;
    function lab(t, ctl) { var l = h('label', 'ctl'); l.appendChild(h('span', null, t)); l.appendChild(ctl); return l; }
    function chk(t, key) {
      var l = h('label', 'pcchk'), c = h('input'); c.type = 'checkbox'; c.checked = !!state.pcf[key];
      c.onchange = function () { state.pcf[key] = c.checked; onChange(); };
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + t)); return l;
    }
    opp.onchange = function () { state.pcf.opp = opp.value; onChange(); };
    last.onchange = function () { state.pcf.last = last.value; onChange(); };
    host.appendChild(lab('Opponent', opp)); host.appendChild(lab('Games', last));
    host.appendChild(chk('FBS opponents only', 'fbs')); host.appendChild(chk('Remove garbage time', 'ng'));
    if (state.pcf.opp || state.pcf.last || state.pcf.fbs || state.pcf.ng) {
      var reset = h('button', 'pcreset', 'Clear filters');
      reset.onclick = function () { state.pcf = { opp: '', last: '', fbs: false, ng: false }; onChange(); };
      host.appendChild(reset);
    }
  }
  /* ---- team page: tabs, one filter bar, one offense/defense switch, shareable links ----
     The team page is split into tabs. The live sections (playcalling chart, tendencies, field,
     deeper numbers) share one filter bar and one offense/defense switch, and only load when
     their tab is open. The address bar always holds the current view, so a link reopens it. */
  var TEAM_TABS = [
    { id: 'overview', label: 'Overview', nums: ['01', '21', '20', '02', '03', '07', '16'] },
    { id: 'playcalling', label: 'Playcalling', nums: ['12', '13', '23', '24', '06'] },
    { id: 'field', label: 'On the field', nums: ['14', '05'] },
    { id: 'units', label: 'Players & units', nums: ['15', '22', '17', '08'] },
    { id: 'matchups', label: 'Matchups', nums: ['19'] },
    { id: 'compare', label: 'Compare', nums: ['09', '18', '11', '10', '04'] }
  ];
  var LIVE = {
    '12': function () { buildPCChart(); }, '13': function () { buildTend(); },
    '14': function () { buildFieldLive(); }, '15': function () { buildExtras(); }
  };
  /* the matchup board, framed inside the team page: this team against its next opponent */
  function buildTeamMatchups() {
    var host = document.getElementById('muBody'); if (!host) return;
    var b = SC_BOARD_NAME[state.team] || state.team, t = document.documentElement.getAttribute('data-theme') || '';
    var src = '/matchups?embed=1&a=' + encodeURIComponent(b) + (t ? '&theme=' + t : '');
    var full = document.getElementById('muFull'); if (full) full.href = '/matchups';
    var fr = host.querySelector('iframe');
    if (fr && fr.dataset.team === b) return;
    host.innerHTML = '';
    fr = document.createElement('iframe');
    fr.className = 'muframe'; fr.title = 'Matchup board for ' + state.team; fr.loading = 'lazy'; fr.dataset.team = b; fr.src = src;
    host.appendChild(fr);
  }
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.psNeedView) { muView(); return; }
    if (e.origin !== location.origin || !e.data || !e.data.psMatchupsHeight) return;
    var fr = document.querySelector('#muBody iframe'); if (fr && e.source === fr.contentWindow) { fr.style.height = Math.max(600, e.data.psMatchupsHeight + 4) + 'px'; muView(); }
  });
  /* tell the framed board which part of it is on screen, so its player sheet opens where the reader is looking */
  var muQueued = false;
  function muView() {
    var fr = document.querySelector('#muBody iframe');
    if (!fr || !fr.contentWindow || fr.closest('[hidden]')) return;
    var r = fr.getBoundingClientRect(), bar = document.getElementById('teamBar');
    var top = Math.max(0, bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0);
    var from = Math.max(r.top, top), to = Math.min(innerHeight, r.bottom);
    fr.contentWindow.postMessage({ psView: { top: Math.max(0, from - r.top), h: Math.max(0, to - from) } }, location.origin);
  }
  function muQueue() { if (muQueued) return; muQueued = true; setTimeout(function () { muQueued = false; muView(); }, 60); }
  window.addEventListener('scroll', muQueue, { passive: true });
  window.addEventListener('resize', muQueue);
  var LAZY = { '22': function () { buildPressure(); }, '23': function () { buildSitu(); }, '24': function () { buildFourth(); }, '20': function () { buildAdj(); }, '21': function () { buildTrend(); }, '19': function () { buildTeamMatchups(); }, '16': function () { buildATS(); }, '17': function () { buildTeamTalent(); }, '18': function () { buildYoY(); } };
  state.teamTab = state.teamTab || 'overview'; state.gSide = state.gSide || 0;
  state.liveKey = 0; state.liveDone = {};

  /* read a shared link: ?team=Auburn&tab=field&side=d&opp=Georgia&last=3&fbs=1&ng=1 */
  (function readLink() {
    var q = new URLSearchParams(location.search);
    if (q.get('tab') && TEAM_TABS.some(function (t) { return t.id === q.get('tab'); })) state.teamTab = q.get('tab');
    if (q.get('side') === 'd') state.gSide = 1;
    state.pcf = { opp: q.get('opp') || '', last: q.get('last') === '3' || q.get('last') === '5' ? q.get('last') : '', fbs: q.get('fbs') === '1', ng: q.get('ng') === '1' };
    state.pcfTeam = q.get('team') || null;
    state.pcSide = state.tdSide = state.fdSide = state.exSide = state.gSide;
  })();

  function teamParams(q) {
    q.set('team', state.team);
    if (state.teamTab !== 'overview') q.set('tab', state.teamTab);
    if (state.gSide) q.set('side', 'd');
    var f = state.pcf || {};
    if (f.opp) q.set('opp', f.opp); if (f.last) q.set('last', f.last); if (f.fbs) q.set('fbs', '1'); if (f.ng) q.set('ng', '1');
    return q;
  }
  function syncLink() {
    if (vstate.view !== 'team') return;
    history.replaceState(null, '', '?' + teamParams(new URLSearchParams()).toString());
  }

  function panelsByNum() {
    var map = {};
    [].forEach.call(document.querySelectorAll('#viewTeam main > section.panel'), function (p) {
      var n = p.querySelector('.phead .num'); if (!n) return;
      if (!p.dataset.num) p.dataset.num = n.textContent.trim();
      map[p.dataset.num] = p;
    });
    return map;
  }
  function buildTeamTabs() {
    var host = document.getElementById('teamTabs'); if (!host) return;
    try { p5Hero(); } catch (e) { /* the hero extras never block the tabs */ }
    var vn = document.getElementById('viewNav');
    var topNav = document.querySelector('header.nav');
    if (vn && topNav && innerWidth > 640) { vn.style.top = topNav.offsetHeight + 'px'; document.documentElement.style.setProperty('--navh', topNav.offsetHeight + vn.offsetHeight + 'px'); }
    host.innerHTML = '';
    TEAM_TABS.forEach(function (t) {
      var b = h('button', null, t.label);
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t.id === state.teamTab ? 'true' : 'false');
      b.onclick = function () { setTeamTab(t.id); };
      host.appendChild(b);
    });
    segs(document.getElementById('gSide'), ['Offense', 'Defense'], state.gSide, function (i) {
      state.gSide = i; state.pcSide = state.tdSide = state.fdSide = state.exSide = i; state.zoneTab = i;
      state.fdSel = null; refreshPC(); buildField();
      buildTeamTabs();
    });
  }
  function setTeamTab(id, opts) {
    state.teamTab = id;
    var tab = TEAM_TABS.filter(function (t) { return t.id === id; })[0] || TEAM_TABS[0];
    var map = panelsByNum(), main = document.getElementById('main');
    Object.keys(map).forEach(function (k) { map[k].hidden = tab.nums.indexOf(k) < 0; });
    /* show this tab's sections in its own order, numbered from 01 */
    tab.nums.forEach(function (k, i) { var p = map[k]; if (!p) return; main.appendChild(p); p.querySelector('.phead .num').textContent = (i < 9 ? '0' : '') + (i + 1); });
    var live = tab.nums.some(function (k) { return LIVE[k]; });
    document.getElementById('teamCtl').hidden = !live;
    buildTeamTabs();
    buildVisibleLive();
    syncLink();
    if (!(opts && opts.keepScroll)) { var bar = document.getElementById('teamBar'); if (bar && window.scrollY > bar.offsetTop) window.scrollTo(0, bar.offsetTop - 60); }
  }
  function buildVisibleLive() {
    var tab = TEAM_TABS.filter(function (t) { return t.id === state.teamTab; })[0] || TEAM_TABS[0];
    tab.nums.forEach(function (k) {
      var fn = LIVE[k] || LAZY[k]; if (!fn) return;
      if (state.pcfTeam !== state.team) { state.pcf.opp = ''; state.pcfTeam = state.team; }
      var key = state.team + '|' + state.season + '|' + state.liveKey;
      if (state.liveDone[k] === key) return;
      state.liveDone[k] = key; fn();
    });
  }
  function refreshPC() { state.liveKey++; buildVisibleLive(); syncLink(); }

  /* ---- light / dark switch (follows the device until chosen) ---- */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var b = document.getElementById('themeBtn');
    if (b) { b.textContent = t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Auto'; b.title = 'Theme: ' + b.textContent + ' (tap to change)'; }
  }
  (function wireTheme() {
    var saved = null; try { saved = localStorage.getItem('ps.theme'); } catch (e) {}
    applyTheme(saved);
    var b = document.getElementById('themeBtn'); if (!b) return;
    b.onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme'), next = !cur ? 'light' : cur === 'light' ? 'dark' : null;
      applyTheme(next); try { if (next) localStorage.setItem('ps.theme', next); else localStorage.removeItem('ps.theme'); } catch (e) {}
      var muf = document.querySelector('#muBody iframe'); if (muf && muf.contentWindow) muf.contentWindow.postMessage({ psTheme: next || '' }, location.origin);
      /* charts that draw their own colors */
      state.liveKey++; state.liveDone = {}; buildVisibleLive();
      if (window.__tlRescan) { [].forEach.call(document.querySelectorAll('img.tlogo'), function (i) { i.remove(); }); window.__tlRescan(); }
    };
  })();

  /* ---- "data through" stamp in the header ---- */
  function buildStamp() {
    var host = document.getElementById('dataStamp'); if (!host || !state.data) return;
    var f = state.data.freshness; if (!f || !f.max_week) { host.textContent = ''; return; }
    var when = f.last_load ? new Date(f.last_load).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    host.textContent = 'Data through week ' + f.max_week + (when ? ' · ' + when : '');
  }

  /* ---- save any section as an image ---- */
  var h2cLoading = null;
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve();
    if (!h2cLoading) h2cLoading = new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = ok; s.onerror = function () { h2cLoading = null; bad(new Error('could not load the image tool')); }; document.head.appendChild(s);
    });
    return h2cLoading;
  }
  function addShareButtons() {
    [].forEach.call(document.querySelectorAll('#viewTeam main > section.panel > .phead'), function (head) {
      if (head.querySelector('.shareimg') || head.parentNode.hasAttribute('data-noshare')) return;
      var b = h('button', 'shareimg', 'Save image');
      b.type = 'button'; b.title = 'Download this section as a PNG';
      b.onclick = function (ev) {
        ev.stopPropagation();
        var panel = head.parentNode, title = (head.querySelector('h2') || {}).textContent || 'section';
        b.textContent = 'Saving…';
        loadH2C().then(function () {
          panel.classList.add('snapping');
          var bg = getComputedStyle(document.querySelector('.viz-root')).getPropertyValue('--surface-1').trim() || '#ffffff';
          return window.html2canvas(panel, { backgroundColor: bg, scale: 2, useCORS: true, logging: false,
            ignoreElements: function (el) { return el.classList && (el.classList.contains('shareimg') || el.tagName === 'SELECT'); } });
        }).then(function (canvas) {
          panel.classList.remove('snapping');
          var ctx = canvas.getContext('2d'); ctx.font = '600 22px "IBM Plex Sans", sans-serif'; ctx.fillStyle = 'rgba(120,130,145,.9)'; ctx.textAlign = 'right';
          ctx.fillText('thepostsnap.com · ' + state.team + ' ' + state.season + (pcFilterText() ? ' · ' + pcFilterText() : ''), canvas.width - 24, canvas.height - 18);
          var a = document.createElement('a');
          a.download = (state.team + ' ' + title).replace(/[^A-Za-z0-9 &-]+/g, '').replace(/\s+/g, ' ').trim() + '.png';
          a.href = canvas.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
          b.textContent = 'Save image';
        }).catch(function (e) { panel.classList.remove('snapping'); b.textContent = 'Could not save'; setTimeout(function () { b.textContent = 'Save image'; }, 2500); console.error(e); });
      };
      head.appendChild(b);
    });
  }

  /* ---- glossary: every number on the site in plain words ---- */
  var GLOSS = [
    ['Ratings', 'SP+', 'Bill Connelly\'s tempo- and opponent-adjusted team rating, in points per game better than an average FBS team. Higher is better on offense; lower is better on defense.'],
    ['Ratings', 'Elo', 'A running power rating that moves after every game based on the result and how surprising it was. Around 1500 is average.'],
    ['Ratings', 'FPI', 'ESPN\'s Football Power Index: expected point margin against an average team on a neutral field.'],
    ['Ratings', 'Projected margin', 'Our line for a game: the SP+ gap between the two teams plus a flat home-field edge. Compare it with the market spread.'],
    ['Ratings', 'Edge', 'Projected margin minus the market spread. A big edge means our number and the betting market disagree.'],
    ['Efficiency', 'EPA (expected points added)', 'How much a play changed the number of points the offense can expect to score on the drive, given down, distance and field position. Averaged per play. It comes from CollegeFootballData\'s Predicted Points Added. On defensive views it is still the opposing offense\'s EPA, so negative is good for the defense.'],
    ['Efficiency', 'Dropbacks', 'Pass attempts plus sacks. Sacks are charged to the passing game, not to rushing the way a box score does.'],
    ['Efficiency', 'Line yards', 'The share of a run credited to the blocking rather than the ball carrier.'],
    ['Efficiency', 'Open field yards', 'Rushing yards gained more than ten yards past the line of scrimmage.'],
    ['Efficiency', 'Success rate', 'Share of plays that kept the offense on schedule: 50% of the yards needed on 1st down, 70% on 2nd, 100% on 3rd or 4th.'],
    ['Efficiency', 'Explosive play', 'A run of 12 or more yards, or a pass of 15 or more (the zone map uses 12+ for both).'],
    ['Efficiency', 'Stuffed run', 'A run that gains zero yards or loses yardage.'],
    ['Efficiency', 'Havoc', 'Plays where the defense wrecks the down: tackles for loss, sacks, interceptions, passes broken up and forced fumbles, as a share of plays.'],
    ['Efficiency', 'Garbage time', 'Snaps when the game is out of reach: a lead of more than 38 points in the 2nd quarter, 28 in the 3rd, or 22 in the 4th. "Remove garbage time" drops them.'],
    ['Efficiency', 'Opponent adjusted', 'A team\'s number compared with what each opponent normally allows (or gains), so a big day against a bad defense counts for less.'],
    ['Playcalling', 'Run / pass rate', 'Share of called plays that were runs or passes. Sacks and scrambles count as passes, because a pass was called.'],
    ['Playcalling', 'Standard / passing downs', 'Passing downs are 2nd and 8 or longer, 3rd or 4th and 5 or longer. Everything else is a standard down.'],
    ['Playcalling', 'Tendency vs national', 'How much more or less often a team calls something than the average FBS team in the same down and distance.'],
    ['Playcalling', 'Tempo', 'Seconds of game clock used per offensive snap within a drive. Fewer seconds is faster.'],
    ['Playcalling', '4th-down aggressiveness', 'How often a team goes for it on 4th down, minus the national go rate in the same distance and field-position bucket. Positive means bolder than average, not necessarily right.'],
    ['On the field', 'Air yards', 'How far past the line of scrimmage the ball was caught or thrown to, read from the play-by-play spot. Negative means behind the line.'],
    ['On the field', 'Pass zones', 'Behind the line, Short (0-9 yards), Intermediate (10-19) and Deep (20+), each split Left, Middle and Right.'],
    ['On the field', 'Run lanes', 'Left, middle or right, as written in the play-by-play.'],
    ['On the field', 'Target share', 'Share of a team\'s targeted passes that went to a receiver or a zone.'],
    ['On the field', 'YAC', 'Yards after the catch: total gain minus the air yards on completions.'],
    ['Players & units', 'Pressure', 'Sacks plus plays where the play-by-play says the passer was hurried. Hurries are not always logged, so this undercounts.'],
    ['Players & units', 'PFF snaps', 'Snap counts by player from Pro Football Focus, used for the talent index and the matchup board.'],
    ['Players & units', 'Talent index', 'Recruiting ratings of the players who actually take the snaps, weighted by playing time, so a roster full of stars on the bench does not count.'],
    ['Players & units', 'Starting 11 / Two-Deep / Three-Deep', 'The talent index measured over a team\'s 11 (Starting 11), 22 (Two-Deep) or 33 (Three-Deep) most-used players on offense or on defense, ranked by snaps.'],
    ['Players & units', 'Not available', 'A player out for the season, injured with no snaps in recent weeks, or gone to the transfer portal. He is removed from projections for future games.'],
    ['Drives', 'Points per drive', 'Points scored per offensive possession, not counting end-of-half kneels.'],
    ['Drives', 'Available yards', 'Yards gained on a drive divided by the yards that were available from where it started to the end zone.'],
    ['Drives', 'Red zone', 'Inside the opponent\'s 20-yard line. Touchdown rate counts trips that ended in a touchdown.'],
    ['Ranks', 'National rank', 'Where a number sits among all FBS teams in the same season and on the same side of the ball. #1 is always best from that team\'s point of view, except for "how often" numbers, where #1 just means most often.'],
    ['Ranks', 'CFP / AP rank', 'The latest College Football Playoff ranking, or the AP poll before the first CFP ranking, shown beside team names.'],
    ['Betting', 'ATS', 'Against the spread: whether a team beat the betting line, not just the opponent.'],
    ['Betting', 'Cover margin', 'Final margin minus what the closing line expected. Positive means they beat the number.'],
    ['Betting', 'Over / under', 'Whether the combined score went over or under the market total.']
  ];
  function buildGlossary() {
    var body = document.getElementById('glossBody'), q = document.getElementById('glossQ'), cnt = document.getElementById('glossCount');
    if (!body) return;
    function paint() {
      var term = (q.value || '').trim().toLowerCase(), groups = {}, order = [], n = 0;
      GLOSS.forEach(function (g) {
        if (term && (g[1] + ' ' + g[2] + ' ' + g[0]).toLowerCase().indexOf(term) < 0) return;
        if (!groups[g[0]]) { groups[g[0]] = []; order.push(g[0]); }
        groups[g[0]].push(g); n++;
      });
      body.innerHTML = '';
      order.forEach(function (k) {
        body.appendChild(h('h2', 'glossgroup', k));
        var grid = h('div', 'gloss');
        groups[k].forEach(function (g) { var c = h('div', 'gterm'); c.appendChild(h('h3', null, g[1])); c.appendChild(h('p', null, g[2])); grid.appendChild(c); });
        body.appendChild(grid);
      });
      if (!n) body.appendChild(h('p', 'ax', 'No term matches "' + q.value + '".'));
      cnt.textContent = n + ' of ' + GLOSS.length + ' terms';
    }
    if (!q.dataset.wired) { q.dataset.wired = '1'; q.addEventListener('input', paint); }
    paint();
  }


  function buildPCChart() {
    var host = document.getElementById('pcChart');
    if (!host) return;
    if (state.pcfTeam !== state.team) { state.pcf.opp = ''; state.pcfTeam = state.team; }
    var sides = ['Offense', 'Defense'];
    var side = sides[state.pcSide] || 'Offense';
    segs(document.getElementById('pcSideTabs'), sides, state.pcSide, function (i) { state.pcSide = i; buildPCChart(); });
    var dl = document.getElementById('chartDl');
    if (dl) {
      dl.href = 'api/chart?team=' + encodeURIComponent(state.team) + '&season=' + state.season + '&side=' + side + '&theme=' + (isDarkTheme() ? 'dark' : 'light');
      dl.textContent = 'Download the season sheet as an image →';
    }
    var seq = ++state.pcSeq;
    if (!host.firstChild) host.appendChild(h('p', 'ax', 'Loading the chart…'));
    host.style.opacity = '.55';
    fetch('api/pc?' + pcQuery(side))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (seq !== state.pcSeq) return; host.style.opacity = ''; drawPC(host, j, side); })
      .catch(function (e) { if (seq !== state.pcSeq) return; host.style.opacity = ''; host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load the chart. ' + e.message)); });
  }

  function drawPC(host, j, side) {
    pcFilters(document.getElementById('pcFilters'), j.games, refreshPC);
    var rows = (j.rows || []).slice();
    if (!rows.length || !rows.some(function (r) { return r.plays; })) {
      host.innerHTML = ''; document.getElementById('pcNote').textContent = '';
      host.appendChild(h('p', 'ax', 'No plays match these filters (' + (pcFilterText() || 'none') + '). Try a wider window or clear the filters.'));
      return;
    }
    var ft = pcFilterText();
    document.getElementById('pcNote').textContent = (ft ? 'Filtered: ' + ft + '. Ranks show where that number would place against every FBS team\'s full season. ' : '') +
      'Usage = share of plays (or of dropbacks / runs inside those sections). Rel. usage = percentage points above or below the FBS median. ' +
      'SR and EPA/play are shaded by FBS rank: blue is better, red is worse' + (side === 'Defense' ? ' (for a defense, lower is better)' : '') +
      '. Untinted = no meaningful rank. Tap any row to see the plays.';
    var cols = [
      { k: 'label', t: 'Play type', num: false },
      { k: 'usage', t: 'Usage', num: true },
      { k: 'rel', t: 'Rel. usage', num: true },
      { k: 'success_rate', t: 'SR', num: true },
      { k: 'epa_per_play', t: 'EPA/play', num: true },
      { k: 'plays', t: 'Plays', num: true }
    ];
    rows.forEach(function (r) { r.rel = (r.usage != null && r.fbs_median_usage != null) ? (r.usage - r.fbs_median_usage) * 100 : null; });
    if (state.pcSort) {
      var k = state.pcSort, dir = state.pcAsc ? 1 : -1;
      rows.sort(function (a, b) {
        var x = a[k], y = b[k];
        if (k === 'success_rate') { if (PC_NO_SR[a.label]) x = null; if (PC_NO_SR[b.label]) y = null; }
        if (k === 'label') return dir * String(x).localeCompare(String(y));
        if (x == null) return 1; if (y == null) return -1;
        return dir * (x - y);
      });
    }
    var t = h('table', 'pctab sortable'), thead = h('thead'), tr = h('tr');
    if (!state.pcSort) tr.appendChild(h('th', null, 'Section'));
    cols.forEach(function (c) {
      var th = h('th', state.pcSort === c.k ? 'sorted' + (state.pcAsc ? ' asc' : '') : null, c.t);
      th.onclick = function () {
        if (state.pcSort === c.k) { if (state.pcAsc === !c.num) { state.pcSort = null; } else state.pcAsc = !state.pcAsc; }
        else { state.pcSort = c.k; state.pcAsc = !c.num; }
        drawPC(host, j, side);
      };
      tr.appendChild(th);
    });
    if (state.pcSort) tr.insertBefore(h('th', null, 'Section'), tr.children[1]);
    thead.appendChild(tr); t.appendChild(thead);
    var tb = h('tbody'), seen = {};
    var maxRel = 30;
    rows.forEach(function (r) {
      var row = h('tr', 'clickable');
      var first = !state.pcSort && !seen[r.section]; seen[r.section] = 1;
      if (first) row.classList.add('sect');
      var sec = h('td', 'pcsec', (state.pcSort || first) ? r.section : '');
      var lab = h('td', 'pclab', r.label);
      if (!state.pcSort) row.appendChild(sec);
      row.appendChild(lab);
      if (state.pcSort) row.appendChild(sec);
      /* usage bar */
      var u = h('td', 'pcbar');
      if (r.usage != null) {
        var w = Math.max(0, Math.min(1, r.usage)) * 100;
        u.innerHTML = '<span class="pcb"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="pcv">' + pct(r.usage) + '</span>';
      } else u.textContent = '–';
      row.appendChild(u);
      /* rel usage */
      var rl = h('td', 'pcrel');
      if (r.rel != null) {
        var m = Math.min(Math.abs(r.rel) / maxRel, 1) * 50;
        rl.innerHTML = '<span class="pcd"><i class="' + (r.rel >= 0 ? 'p' : 'n') + '" style="width:' + m.toFixed(1) + '%;' + (r.rel >= 0 ? 'left:50%' : 'right:50%') + '"></i></span><span class="pcv">' + (Math.abs(r.rel) < 0.5 ? '0' : sgn(r.rel, 0)) + '</span>';
      } else rl.textContent = '';
      row.appendChild(rl);
      function cell(v, rank, fmt) {
        var c = h('td', 'pcshade', v == null ? '' : fmt(v));
        var p = (rank && r.perf_pool > 1) ? 1 - (rank - 1) / (r.perf_pool - 1) : null;
        c.style.background = shade(p);
        return c;
      }
      row.appendChild(cell(r.success_rate, PC_NO_SR[r.label] ? null : r.sr_rank, function (v) { return num(v, 2); }));
      row.appendChild(cell(r.epa_per_play, r.epa_rank, function (v) { return num(v, 2); }));
      row.appendChild(h('td', 'nd', r.plays == null ? '–' : String(r.plays)));
      var tipHtml = '<b>' + r.label + '</b><br>' + (PC_DEF[r.label] || '') +
        (r.usage != null ? '<br>Usage ' + pct(r.usage, 1) + (r.fbs_median_usage != null ? ' · FBS median ' + pct(r.fbs_median_usage, 1) : '') +
          (r.usage_rank ? ' · #' + r.usage_rank + ' of ' + r.teams_in_pool : '') : '') +
        '<br>Success rate ' + pct(r.success_rate, 1) + (r.sr_rank && !PC_NO_SR[r.label] ? ' · #' + r.sr_rank + ' of ' + r.perf_pool : '') +
        (r.fbs_median_sr != null ? ' (median ' + pct(r.fbs_median_sr, 1) + ')' : '') +
        '<br>EPA/play ' + sgn(r.epa_per_play) + (r.epa_rank ? ' · #' + r.epa_rank + ' of ' + r.perf_pool : '') +
        (r.fbs_median_epa != null ? ' (median ' + sgn(r.fbs_median_epa) + ')' : '') + '<br><span class="tv">Tap to see the plays</span>';
      bindTip(row, tipHtml);
      row.onclick = function () { openPlays(side, { label: r.label }, r.label); };
      tb.appendChild(row);
    });
    t.appendChild(tb);
    host.innerHTML = '';
    var wrap = h('div', 'tablewrap'); wrap.appendChild(t); host.appendChild(wrap);
  }

  /* ---- tendencies: what they do by situation ---- */
  var TD_GROUPS = [['dd', 'Down & distance'], ['field', 'Field position'], ['state', 'Score'], ['qtr', 'Quarter & clock'], ['form', 'Formation & tempo']];
  function buildTend() {
    var host = document.getElementById('tdChart');
    if (!host) return;
    var sides = ['Offense', 'Defense'];
    var side = sides[state.tdSide] || 'Offense';
    segs(document.getElementById('tdSideTabs'), ['Their offense', 'What their defense faces'], state.tdSide, function (i) { state.tdSide = i; buildTend(); });
    var seq = state.tdSeq = (state.tdSeq || 0) + 1;
    if (!host.firstChild) host.appendChild(h('p', 'ax', 'Loading tendencies…'));
    host.style.opacity = '.55';
    Promise.all([
      fetch('api/tendencies?' + pcQuery(side)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('api/pc?' + pcQuery(side)).then(function (r) { return r.ok ? r.json() : { games: [] }; })
    ]).then(function (res) {
      if (seq !== state.tdSeq) return; host.style.opacity = '';
      pcFilters(document.getElementById('tdFilters'), res[1].games, refreshPC);
      drawTend(host, res[0], side);
    }).catch(function (e) { if (seq !== state.tdSeq) return; host.style.opacity = ''; host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load tendencies. ' + e.message)); });
  }
  function drawTend(host, j, side) {
    var ft = pcFilterText();
    var who = side === 'Offense' ? state.team : state.team + '\'s opponents';
    document.getElementById('tdNote').innerHTML = (ft ? '<b>Filtered:</b> ' + ft + '. ' : '') + j.plays + ' plays. ' +
      'Pass rate = dropbacks (passes and sacks) as a share of runs plus dropbacks. The tick on each bar is the FBS average in the same situation; ' +
      'a <b>lean</b> tag means ' + who + ' pass or run at least 15 points more than average there (10+ plays). ' +
      'SR and EPA are shaded against the FBS average for that situation' + (side === 'Defense' ? ', from the defense\'s point of view (blue = held below average)' : '') + '. Tap a row to see the plays.';
    if (!j.plays) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'No plays match these filters. Try a wider window or clear the filters.')); return; }
    var by = {};
    (j.groups || []).forEach(function (g) { (by[g.grp] = by[g.grp] || []).push(g); });
    host.innerHTML = '';
    var grid = h('div', 'tdgrid');
    TD_GROUPS.forEach(function (gp) {
      var list = (by[gp[0]] || []).filter(function (g) { return g.plays > 0 || gp[0] !== 'qtr' || g.key !== 'ot'; });
      var card = h('div', 'tdcard');
      card.appendChild(h('h3', null, gp[1]));
      var t = h('table', 'tdtab'), th = h('tr');
      ['Situation', 'Plays', 'Pass rate vs FBS', 'SR', 'EPA', 'Yds/play'].forEach(function (x) { th.appendChild(h('th', null, x)); });
      var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
      var tb = h('tbody');
      list.forEach(function (g) {
        var r = h('tr', g.plays ? 'clickable' : 'nd');
        var lean = '';
        if (g.plays >= 10 && g.pass_rate != null && g.nat_pass_rate != null) {
          var d = g.pass_rate - g.nat_pass_rate;
          if (d >= 0.15) lean = '<span class="lean p">leans pass</span>'; else if (d <= -0.15) lean = '<span class="lean r">leans run</span>';
        }
        var c0 = h('td', 'pclab'); c0.innerHTML = g.label + ' ' + lean; r.appendChild(c0);
        r.appendChild(h('td', 'nd', String(g.plays)));
        var pb = h('td', 'pcbar');
        if (g.pass_rate != null) {
          pb.innerHTML = '<span class="pcb tdb"><i style="width:' + (g.pass_rate * 100).toFixed(1) + '%"></i>' +
            (g.nat_pass_rate != null ? '<b style="left:' + (g.nat_pass_rate * 100).toFixed(1) + '%"></b>' : '') + '</span><span class="pcv">' + pct(g.pass_rate) + ' pass</span>';
        } else pb.textContent = '–';
        r.appendChild(pb);
        function rel(v, nat, scale, fmt) {
          var c = h('td', 'pcshade', v == null ? '–' : fmt(v));
          if (v != null && nat != null && g.plays >= 5) {
            var diff = (v - nat) / scale; if (side === 'Defense') diff = -diff;
            c.style.background = shade(Math.max(0, Math.min(1, 0.5 + diff / 2)));
          } else c.style.background = shade(null);
          return c;
        }
        r.appendChild(rel(g.sr, g.nat_sr, 0.15, function (v) { return pct(v); }));
        r.appendChild(rel(g.epa, g.nat_epa, 0.30, function (v) { return sgn(v); }));
        r.appendChild(h('td', 'nd', g.ypp == null ? '–' : num(g.ypp, 1)));
        if (g.plays) {
          bindTip(r, '<b>' + gp[1] + ': ' + g.label + '</b><br>' + g.plays + ' plays · pass ' + pct(g.pass_rate, 1) + ' (FBS ' + pct(g.nat_pass_rate, 1) + ')' +
            '<br>Success rate ' + pct(g.sr, 1) + ' (FBS ' + pct(g.nat_sr, 1) + ')<br>EPA/play ' + sgn(g.epa) + ' (FBS ' + sgn(g.nat_epa) + ')' +
            '<br><span class="tv">Tap to see the plays</span>');
          r.onclick = function () { openPlays(side, { bucket: g.grp + ':' + g.key }, gp[1] + ': ' + g.label); };
        }
        tb.appendChild(r);
      });
      t.appendChild(tb);
      var w = h('div', 'tablewrap'); w.appendChild(t); card.appendChild(w);
      grid.appendChild(card);
    });
    host.appendChild(grid);
  }

  /* ---- the plays behind any row or cell ---- */
  function ydLine(ytg, def) { if (ytg == null) return ''; if (ytg === 50) return '50'; var own = ytg > 50; if (def) own = !own; return (own ? 'Own ' : 'Opp ') + (ytg > 50 ? 100 - ytg : ytg); }
  function clk(s) { if (s == null) return ''; var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function ord(n) { return ['', '1st', '2nd', '3rd', '4th'][n] || n + 'th'; }
  function openPlays(side, sel, title) {
    var dlg = document.getElementById('pcSheet');
    var body = document.getElementById('pcSheetBody');
    document.getElementById('pcSheetTitle').textContent = state.team + ' ' + (side === 'Offense' ? 'offense' : 'defense') + ' · ' + title;
    document.getElementById('pcSheetSub').textContent = pcFilterText() || (state.season + ' season, every game');
    body.innerHTML = '<p class="ax">Loading plays…</p>';
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    var extra = sel.label ? '&label=' + encodeURIComponent(sel.label) : '&bucket=' + encodeURIComponent(sel.bucket);
    fetch('api/pcplays?' + pcQuery(side, extra))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var list = j.plays || [];
        body.innerHTML = '';
        var good = list.filter(function (p) { return p.success; }).length;
        body.appendChild(h('p', 'tblnote', j.n + ' plays' + (j.n > list.length ? ' (showing the first ' + list.length + ')' : '') +
          ' · ' + (list.length ? Math.round(100 * good / list.length) : 0) + '% successful' + (side === 'Defense' ? ' for the offense' : '') + '. ' + (side === 'Defense' ? 'Blue edge = the defense won the play; red = the offense did. Ball on is from ' + state.team + '\'s side of the field.' : 'Blue edge = successful play; red = unsuccessful.')));
        var t = h('table', 'pltab'), hr = h('tr');
        ['Wk', 'Opponent', 'Q', 'Clock', 'Down', 'Ball on', 'Score', 'Yds', 'EPA', 'Play'].forEach(function (x) { hr.appendChild(h('th', null, x)); });
        var th = h('thead'); th.appendChild(hr); t.appendChild(th);
        var tb = h('tbody');
        list.forEach(function (p) {
          var r = h('tr', (side === 'Defense' ? !p.success : p.success) ? 'ok' : 'no');
          [p.week, p.opponent, p.q > 4 ? 'OT' : p.q, clk(p.clock), p.down ? ord(p.down) + ' & ' + p.dist : '', ydLine(p.ytg, side === 'Defense'), p.score, p.yds, sgn(p.epa)].forEach(function (v, i) {
            r.appendChild(h('td', i === 1 ? 'tm' : null, v == null ? '' : String(v)));
          });
          var tx = h('td', 'pltext', p.text || p.type || ''); if (p.garbage) tx.appendChild(h('span', 'gb', ' garbage time'));
          r.appendChild(tx);
          tb.appendChild(r);
        });
        t.appendChild(tb);
        var w = h('div', 'tablewrap tall'); w.appendChild(t); body.appendChild(w);
      })
      .catch(function (e) { body.innerHTML = ''; body.appendChild(h('p', 'ax', 'Could not load the plays. ' + e.message)); });
  }
  (function wireSheet() {
    var dlg = document.getElementById('pcSheet');
    if (!dlg || dlg.dataset.wired) return; dlg.dataset.wired = '1';
    document.getElementById('pcSheetClose').onclick = function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
    dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg.close) dlg.close(); });
  })();

  /* ---- on the field: where passes are thrown and runs go, drawn to scale on a field ----
     Offense moves up the page. The line of scrimmage is the blue line; every yard line is
     measured from it. Lanes follow the college hashes (60 ft in from each sideline): left of
     the left hash, between the hashes, right of the right hash. */
  var FZ = { B: [-10, 0, 'Behind the line'], S: [0, 10, 'Short (0-9)'], I: [10, 20, 'Intermediate (10-19)'], D: [20, 50, 'Deep (20+)'] };
  var FL = { L: 'Left', M: 'Middle', R: 'Right' };
  var FW = 53.33, HASH_L = 20, HASH_R = 33.33, K = 11.25;          /* yards; px per yard */
  var FTOP = 52, FMAX = 50, FMIN = -10;                              /* draw from 50 past the line to 10 behind */
  state.fdMode = state.fdMode || 0; state.fdSide = state.fdSide || 0; state.fdColor = state.fdColor || 0; state.fdSel = null;
  function fy(yd) { return FTOP + (FMAX - Math.max(FMIN, Math.min(FMAX, yd))) * K; }
  function fx(yd) { return 30 + yd * K; }
  function laneX(d) { return d === 'L' ? [0, HASH_L] : d === 'M' ? [HASH_L, HASH_R] : [HASH_R, FW]; }
  function jitter(seed) { var x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function rankTxt(rk, pool) { return rk ? '#' + rk + (pool ? ' of ' + pool : '') : '–'; }

  function buildFieldLive() {
    var host = document.getElementById('fdChart');
    if (!host) return;
    var sides = ['Offense', 'Defense'];
    var side = sides[state.fdSide] || 'Offense';
    segs(document.getElementById('fdModeTabs'), ['Pass targets', 'Runs'], state.fdMode, function (i) { state.fdMode = i; state.fdColor = 0; state.fdSel = null; drawFieldLive(); });
    segs(document.getElementById('fdSideTabs'), ['Their offense', 'What their defense allows'], state.fdSide, function (i) { state.fdSide = i; state.fdSel = null; buildFieldLive(); });
    var seq = state.fdSeq = (state.fdSeq || 0) + 1;
    if (!host.firstChild) host.appendChild(h('p', 'ax', 'Loading the field…'));
    host.style.opacity = '.55';
    /* one game picked: also load that opponent's season on the other side of the ball */
    var oppName = state.pcf.opp, oppSide = side === 'Offense' ? 'Defense' : 'Offense';
    Promise.all([
      fetch('api/field?' + pcQuery(side)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('api/pc?' + pcQuery(side)).then(function (r) { return r.ok ? r.json() : { games: [] }; }),
      oppName ? fetch('api/field?team=' + encodeURIComponent(oppName) + '&season=' + state.season + '&side=' + oppSide + (state.pcf.ng ? '&ng=1' : ''))
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (res) {
      if (seq !== state.fdSeq) return; host.style.opacity = '';
      pcFilters(document.getElementById('fdFilters'), res[1].games, refreshPC);
      state.fdGames = res[1].games || [];
      state.fdData = res[0]; state.fdData.sideName = side;
      var oz = res[2] && res[2].zones && Object.keys(res[2].zones).length ? res[2] : null;
      state.fdOpp = oppName ? { name: oppName, side: oppSide, j: oz } : null;
      if (!state.fdOpp || !oz) state.fdShade = 0;
      else if (state.fdShadeFor !== oppName) { state.fdShade = 1; state.fdShadeFor = oppName; if (!state.fdColor) state.fdColor = 1; }
      drawFieldLive();
    }).catch(function (e) { if (seq !== state.fdSeq) return; host.style.opacity = ''; host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load the field. ' + e.message)); });
  }

  function drawFieldLive() {
    var host = document.getElementById('fdChart'), j = state.fdData;
    if (!host || !j) return;
    var side = j.sideName, runs = state.fdMode === 1, Z = j.zones || {};
    var colorOpts = runs ? [['share', 'Share of runs'], ['epa', 'EPA per run'], ['sr', 'Success rate'], ['expl', 'Explosive rate (12+)'], ['stuff', 'Stuff rate (0 or less)']]
                         : [['share', 'Share of targets'], ['epa', 'EPA per target'], ['sr', 'Success rate'], ['cmp', 'Completion %'], ['ypp', 'Yards per target']];
    segs(document.getElementById('fdColorTabs'), colorOpts.map(function (c) { return c[1]; }), state.fdColor, function (i) { state.fdColor = i; drawFieldLive(); });
    var metric = colorOpts[state.fdColor][0];
    /* keep the Pass targets / Runs switch in step with what is drawn */
    segs(document.getElementById('fdModeTabs'), ['Pass targets', 'Runs'], state.fdMode, function (i) { state.fdMode = i; state.fdColor = 0; state.fdSel = null; drawFieldLive(); });
    var d = isDarkTheme();
    var O = state.fdOpp && state.fdOpp.j ? state.fdOpp : null, OZ = O ? (O.j.zones || {}) : {};
    var oTag = O ? O.name + (O.side === 'Defense' ? ' D' : ' O') : '';
    var ZS = O && state.fdShade ? OZ : Z;        /* the zones whose numbers color the field */
    var W = Math.round(fx(FW) + 30), H = Math.round(fy(FMIN) + 40);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'fdsvg', role: 'img', 'aria-label': (runs ? 'Run lanes' : 'Pass targets') + ' on a football field' });
    /* turf and markings */
    var yardLabs = [];
    var turfA = d ? '#1d4a2c' : '#3f8a4f', turfB = d ? '#1a4428' : '#3a8149', line = d ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.9)';
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 6, fill: d ? '#173d24' : '#357a44' }));
    for (var yd = FMIN; yd < FMAX; yd += 5) {
      svg.appendChild(el('rect', { x: fx(0), y: fy(yd + 5), width: FW * K, height: 5 * K, fill: ((yd + 10) / 5) % 2 ? turfA : turfB }));
    }
    svg.appendChild(el('rect', { x: fx(0), y: fy(FMAX), width: FW * K, height: (FMAX - FMIN) * K, fill: 'none', stroke: line, 'stroke-width': 3 }));
    for (yd = FMIN; yd <= FMAX; yd++) {
      var y = fy(yd);
      if (yd % 5 === 0) {
        svg.appendChild(el('line', { x1: fx(0), x2: fx(FW), y1: y, y2: y, stroke: line, 'stroke-width': yd % 10 === 0 ? 2 : 1.2 }));
        if (yd % 10 === 0 && yd !== 0) {
          var lab = (yd > 0 ? '+' : '') + yd;
          yardLabs.push([fx(9), y - 5, lab], [fx(FW - 9), y - 5, lab]);
        }
      } else {
        [0.6, HASH_L, HASH_R, FW - 0.6].forEach(function (hx) {
          svg.appendChild(el('line', { x1: fx(hx) - 5, x2: fx(hx) + 5, y1: y, y2: y, stroke: line, 'stroke-width': 1 }));
        });
      }
    }
    /* line of scrimmage */
    svg.appendChild(el('line', { x1: fx(0), x2: fx(FW), y1: fy(0), y2: fy(0), stroke: d ? '#7aa2ff' : '#1f4fbf', 'stroke-width': 4 }));
    svg.appendChild(el('text', { x: fx(FW) + 14, y: fy(0) + 4, class: 'fdlos', 'text-anchor': 'middle', transform: 'rotate(-90 ' + (fx(FW) + 14) + ' ' + (fy(0) + 4) + ')' }, 'LOS'));
    svg.appendChild(el('text', { x: fx(FW / 2), y: FTOP - 18, class: 'fdlos', 'text-anchor': 'middle' }, side === 'Offense' ? 'OFFENSE MOVES THIS WAY ↑' : 'OPPONENT OFFENSE MOVES THIS WAY ↑'));

    /* zones */
    var zoneKeys = runs ? ['RL', 'RM', 'RR'] : ['DL', 'DM', 'DR', 'IL', 'IM', 'IR', 'SL', 'SM', 'SR', 'BL', 'BM', 'BR'];
    var maxShare = 0; zoneKeys.forEach(function (k) { if (ZS[k] && ZS[k].share > maxShare) maxShare = ZS[k].share; });
    var zoneBox = {}, labG = {};
    zoneKeys.forEach(function (k) {
      var z = ZS[k], lane = laneX(k[1]);
      var y0 = runs ? fy(FMAX) : fy(FZ[k[0]][1]), y1 = runs ? fy(FMIN) : fy(FZ[k[0]][0]);
      var fill, op;
      if (!z) { fill = 'transparent'; op = 0; }
      else if (metric === 'share') { fill = d ? '#7aa2ff' : '#1f4fbf'; op = 0.08 + 0.55 * (z.share / (maxShare || 1)); }
      else { var rk = z['rk_' + metric]; var p = rk && z.pool > 1 ? 1 - (rk - 1) / (z.pool - 1) : null; fill = shade(p); op = p === null ? 0.12 : 0.55; }
      var r = el('rect', { x: fx(lane[0]) + 2, y: y0 + 2, width: (lane[1] - lane[0]) * K - 4, height: y1 - y0 - 4, rx: 4, fill: fill, 'fill-opacity': op,
        stroke: state.fdSel === k ? (d ? '#fff' : '#151b26') : 'rgba(255,255,255,.35)', 'stroke-width': state.fdSel === k ? 3 : 1, class: 'fdzone' });
      zoneBox[k] = { x: fx(lane[0]), y: y0, w: (lane[1] - lane[0]) * K, h: y1 - y0 };
      svg.appendChild(r);
    });

    /* dots: every target / every run */
    var pts = runs ? (j.runs || []) : (j.passes || []);
    pts.forEach(function (p, i) {
      var dir = runs ? p[0] : p[1], yd = runs ? p[1] : p[0];
      if (!dir || yd === null || yd === undefined) return;
      var lane = laneX(dir), x = fx(lane[0] + 1 + jitter(i + 1) * (lane[1] - lane[0] - 2)), y = fy(yd + (jitter(i + 7) - 0.5) * 0.8);
      var c, fum = runs ? p[16] : p[18];
      var redX = function () { return el('path', { d: 'M' + (x - 5) + ' ' + (y - 5) + 'L' + (x + 5) + ' ' + (y + 5) + 'M' + (x + 5) + ' ' + (y - 5) + 'L' + (x - 5) + ' ' + (y + 5), stroke: '#ff5a4a', 'stroke-width': 3, 'stroke-linecap': 'round' }); };
      if (fum) {
        c = redX();
      } else if (runs) {
        var col = p[1] <= 0 ? (d ? '#ff8a78' : '#c0392b') : p[1] >= 12 ? '#f4c542' : '#ffffff';
        c = el('circle', { cx: x, cy: y, r: 4.2, fill: col, 'fill-opacity': .9, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .8 });
        if (p[6]) c.setAttribute('stroke', '#f4c542'), c.setAttribute('stroke-width', 2.4);
      } else if (p[2] === 'X') {
        c = redX();
      } else {
        c = el('circle', { cx: x, cy: y, r: 4.6, fill: p[2] === 'C' ? '#ffffff' : 'none', stroke: p[3] ? '#f4c542' : (p[2] === 'C' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.85)'), 'stroke-width': p[3] ? 2.6 : 1.4 });
      }
      c.setAttribute('class', 'fddot');
      var who = runs ? (p[4] || '') : (p[7] || '');
      var t = runs ? (who + ' · ' + p[1] + ' yds · Wk ' + p[7] + ' ' + p[8]) : ((who ? who + ' · ' : '') + (p[0] != null ? p[0] + ' air yds · ' : '') + (p[2] === 'C' ? 'complete, ' + p[4] + ' yds' : p[2] === 'X' ? 'intercepted' : 'incomplete') + ' · Wk ' + p[8] + ' ' + p[9]);
      c.appendChild(el('title', {}, t + (runs ? (p[6] ? ' · TD' : '') : (p[3] ? ' · TD' : '')) + (fum === 2 ? ' · FUMBLE, lost' : fum === 1 ? ' · fumble, recovered by the offense' : '')));
      svg.appendChild(c);
    });

    /* yard numbers above the dots, haloed in turf color so a dot never hides them */
    yardLabs.forEach(function (t) {
      svg.appendChild(el('text', { x: t[0], y: t[1], class: 'fdnum', 'text-anchor': 'middle', stroke: turfB, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, t[2]));
    });
    /* zone labels on top of the dots */
    function zval(z) { return metric === 'share' ? pct(z.share) : metric === 'epa' ? sgn(z.epa) : metric === 'ypp' ? num(z.ypp, 1) : pct(z[metric]); }
    zoneKeys.forEach(function (k) {
      var z = Z[k], oz = O ? OZ[k] : null; if (!z && !oz) return;
      var lane = laneX(k[1]), cx = fx((lane[0] + lane[1]) / 2);
      var cy = runs ? fy(FMAX) + 34 : (fy(FZ[k[0]][1]) + fy(FZ[k[0]][0])) / 2;
      var g = el('g', { class: 'fdlab' }), lines = [];
      if (z) { var rk = metric === 'share' ? z.rk_share : z['rk_' + metric]; lines.push([zval(z), (O ? state.team + ' · ' : '') + (rk ? '#' + rk + ' FBS · ' : '') + z.n + (runs ? ' runs' : ' tgts')]); }
      if (oz) { var ork = metric === 'share' ? oz.rk_share : oz['rk_' + metric]; lines.push([zval(oz), oTag + ' season' + (ork ? ' · #' + ork + ' FBS' : '')]); }
      var longest = 0; lines.forEach(function (l) { longest = Math.max(longest, l[1].length); });
      var bw = Math.max(88, Math.round(longest * 6.6 + 18)), bh = lines.length * 38 + 2, top = cy - bh / 2;
      g.appendChild(el('rect', { x: cx - bw / 2, y: top, width: bw, height: bh, rx: 5, class: 'fdlabbg' }));
      lines.forEach(function (l, i) {
        if (i) g.appendChild(el('line', { x1: cx - bw / 2 + 8, x2: cx + bw / 2 - 8, y1: top + i * 38 + 1, y2: top + i * 38 + 1, stroke: 'rgba(255,255,255,.25)' }));
        g.appendChild(el('text', { x: cx, y: top + i * 38 + 19, 'text-anchor': 'middle', class: 'fdlabv' }, l[0]));
        g.appendChild(el('text', { x: cx, y: top + i * 38 + 34, 'text-anchor': 'middle', class: 'fdlabr' }, l[1]));
      });
      /* labels stay out of the way of the dots: one shows only for the zone under the pointer */
      g.style.pointerEvents = 'none'; g.style.display = 'none';
      labG[k] = g; svg.appendChild(g);
    });
    function zoneAt(ev) {
      var m = svg.getScreenCTM(); if (!m) return null;
      var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; pt = pt.matrixTransform(m.inverse());
      for (var zk in zoneBox) { var b = zoneBox[zk]; if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return zk; }
      return null;
    }
    var hoverK = null;
    function showLab(k) {
      if (k === hoverK) return; hoverK = k;
      Object.keys(labG).forEach(function (z) { labG[z].style.display = z === k ? '' : 'none'; });
    }
    svg.addEventListener('mousemove', function (ev) { showLab(zoneAt(ev)); });
    svg.addEventListener('mouseleave', function () { showLab(null); });
    svg.addEventListener('click', function (ev) { var k = zoneAt(ev); if (!k || !Z[k]) return; state.fdSel = state.fdSel === k ? null : k; drawFieldLive(); });

    host.innerHTML = '';
    fieldGameStrip(host);
    if (O) {
      var sh = h('div', 'fdshade');
      sh.appendChild(h('span', 'fdshadel', 'Shade zones by'));
      var sg = h('div', 'segs'); sh.appendChild(sg);
      segs(sg, [state.team + ' in this game', oTag + ', ' + state.season + ' season'], state.fdShade ? 1 : 0, function (i) { state.fdShade = i; drawFieldLive(); });
      host.appendChild(sh);
    } else if (state.fdOpp) {
      host.appendChild(h('p', 'fdshade ax', 'No zone data for ' + state.fdOpp.name + ' (FBS teams only), so their ' + (state.fdOpp.side === 'Defense' ? 'defense' : 'offense') + ' cannot be shown next to this game.'));
    }
    var wrap = h('div', 'fdwrap');
    var left = h('div', 'fdfield'); left.appendChild(svg);
    var right = h('div', 'fdside');
    wrap.appendChild(left); wrap.appendChild(right);
    host.appendChild(wrap);
    drawFieldDetail(right, j, runs, side);
    var unit = runs ? 'runs' : 'targets';
    var oNote = O ? (state.fdShade ? '<b>Zones are shaded by ' + oTag + ' over the whole ' + state.season + ' season</b>; the dots are this game. ' : '') +
      'The ' + O.name + ' numbers are ' + (O.side === 'Defense' ? 'what its defense allowed' : 'what its offense did') + ' in each zone all season; for them, blue = better for ' + O.name + '. ' : '';
    document.getElementById('fdNote').innerHTML = (pcFilterText() ? '<b>Filtered:</b> ' + pcFilterText() + '. ' : '') + oNote +
      (runs ? 'Each dot is a run, placed by how many yards it gained, in the lane the play-by-play lists (left, middle, right). White = gain, red = stuffed at or behind the line, gold = 12+ yards; gold ring = touchdown; red X = fumble (hover it to see whether it was lost). '
            : 'Each dot is a pass target at the spot it was caught or thrown to, measured from the line of scrimmage, in the direction the play-by-play lists. Filled = complete, hollow = incomplete, red X = interception or fumble after the catch, gold ring = touchdown. Passes with no recorded spot are left off. ') +
      'Zones are colored by ' + colorOpts[state.fdColor][1].toLowerCase() + (metric === 'share' ? '' : ' against every FBS team (blue = better' + (side === 'Defense' ? ' for the defense' : '') + ', red = worse)') +
      '; the #rank on each zone is national, among ' + ((Z[zoneKeys[0]] || {}).pool || 'all') + ' FBS teams' + (pcFilterText() ? ' (where this filtered number would place against every team\'s full season)' : '') +
      '. Share ranks: #1 = goes there most often. Hover a zone to see its number and rank; tap it (outlined) for every number and the plays in the table.';
  }

  function drawFieldDetail(host, j, runs, side) {
    var Z = j.zones || {}, keys = runs ? ['RL', 'RM', 'RR'] : ['DL', 'DM', 'DR', 'IL', 'IM', 'IR', 'SL', 'SM', 'SR', 'BL', 'BM', 'BR'];
    var name = function (k) { return runs ? FL[k[1]] + ' lane' : FZ[k[0]][2] + ' · ' + FL[k[1]]; };
    var shortName = function (k) { return runs ? FL[k[1]] : FZ[k[0]][2].replace(/ \(.*\)/, '').replace('Behind the line', 'Behind') + ' · ' + FL[k[1]]; };
    var rows = runs ? [['n', 'Runs', null], ['share', 'Share of runs', 'rk_share'], ['ypp', 'Yards per carry', 'rk_ypp'], ['sr', 'Success rate', 'rk_sr'],
                      ['epa', 'EPA per run', 'rk_epa'], ['expl', 'Explosive (12+)', 'rk_expl'], ['stuff', 'Stuffed (0 or less)', 'rk_stuff']]
                    : [['n', 'Targets', null], ['share', 'Share of targets', 'rk_share'], ['cmp', 'Completion %', 'rk_cmp'], ['ypp', 'Yards per target', 'rk_ypp'],
                      ['sr', 'Success rate', 'rk_sr'], ['epa', 'EPA per target', 'rk_epa'], ['expl', 'Gains of 12+', 'rk_expl']];
    function fmtv(k, v) { if (v === null || v === undefined) return '–'; return k === 'n' ? String(v) : k === 'epa' ? sgn(v) : k === 'ypp' ? num(v, 1) : pct(v, 1); }
    host.innerHTML = '';
    var k = state.fdSel;
    var O = state.fdOpp && state.fdOpp.j ? state.fdOpp : null, OZ = O ? (O.j.zones || {}) : {};
    var oTag = O ? O.name + (O.side === 'Defense' ? ' D' : ' O') : '';
    function oCell(oz) {
      var c = h('td', 'pcshade');
      if (!oz) { c.textContent = '–'; return c; }
      c.innerHTML = sgn(oz.epa) + ' <span class="fdrk">#' + oz.rk_epa + '</span>';
      if (oz.rk_epa && oz.pool > 1) c.style.background = shade(1 - (oz.rk_epa - 1) / (oz.pool - 1));
      c.title = oTag + ' over the season: EPA ' + (O.side === 'Defense' ? 'allowed' : 'per play') + ' here, national rank #' + oz.rk_epa + ' of ' + oz.pool + ' (#1 = best for ' + O.name + ')';
      return c;
    }
    if (!k || !Z[k]) {
      host.appendChild(h('h3', 'fdh', runs ? 'Every lane' : 'Every zone'));
      var t = h('table', 'fdtab'), tr = h('tr');
      (O ? [runs ? 'Lane' : 'Zone', runs ? 'Runs' : 'Tgts', 'EPA', oTag + ' EPA'] : [runs ? 'Lane' : 'Zone', runs ? 'Runs' : 'Targets', 'Share', runs ? 'YPC' : 'Comp', 'EPA']).forEach(function (x) { tr.appendChild(h('th', null, x)); });
      var th = h('thead'); th.appendChild(tr); t.appendChild(th);
      var tb = h('tbody');
      keys.forEach(function (kk) {
        var z = Z[kk]; if (!z) return;
        var r = h('tr', 'clickable');
        r.appendChild(h('td', 'pclab', O ? shortName(kk) : name(kk)));
        r.appendChild(h('td', 'nd', String(z.n)));
        if (!O) {
          var c1 = h('td'); c1.innerHTML = pct(z.share) + ' <span class="fdrk">#' + z.rk_share + '</span>'; r.appendChild(c1);
          var c2 = h('td'); c2.innerHTML = (runs ? num(z.ypp, 1) + ' <span class="fdrk">#' + z.rk_ypp + '</span>' : pct(z.cmp) + ' <span class="fdrk">#' + z.rk_cmp + '</span>'); r.appendChild(c2);
        }
        var c3 = h('td'); c3.innerHTML = sgn(z.epa) + ' <span class="fdrk">#' + z.rk_epa + '</span>'; r.appendChild(c3);
        if (O) r.appendChild(oCell(OZ[kk]));
        r.onclick = function () { state.fdSel = kk; drawFieldLive(); };
        tb.appendChild(r);
      });
      t.appendChild(tb);
      var w = h('div', 'tablewrap'); w.appendChild(t); host.appendChild(w);
      host.appendChild(h('p', 'tblnote', '#rank = national rank among FBS teams. ' + (O ? 'The ' + oTag + ' column is ' + O.name + '\'s whole season ' + (O.side === 'Defense' ? 'on defense (EPA allowed; #1 = toughest)' : 'on offense (#1 = most productive)') + '. ' : '') + 'Tap a zone on the field or a row here for the full breakdown.'));
      return;
    }
    var z = Z[k];
    host.appendChild(h('h3', 'fdh', name(k)));
    var t2 = h('table', 'fdtab'), tr2 = h('tr');
    var oz2 = O ? OZ[k] : null;
    ['', state.team + (side === 'Defense' ? ' allows' : ''), 'FBS avg', 'National rank'].concat(oz2 ? [oTag + ', season', 'Rank'] : []).forEach(function (x) { tr2.appendChild(h('th', null, x)); });
    var th2 = h('thead'); th2.appendChild(tr2); t2.appendChild(th2);
    var tb2 = h('tbody');
    rows.forEach(function (rw) {
      var r = h('tr');
      r.appendChild(h('td', 'pclab', rw[1]));
      r.appendChild(h('td', null, fmtv(rw[0], z[rw[0]])));
      r.appendChild(h('td', 'nd', rw[0] === 'n' ? '' : fmtv(rw[0], z.nat ? z.nat[rw[0]] : null)));
      var rc = h('td', 'pcshade', rw[2] ? rankTxt(z[rw[2]], z.pool) : '');
      if (rw[2] && rw[2] !== 'rk_share' && z[rw[2]] && z.pool > 1) rc.style.background = shade(1 - (z[rw[2]] - 1) / (z.pool - 1));
      else rc.style.background = 'transparent';
      r.appendChild(rc);
      if (oz2) {
        r.appendChild(h('td', null, fmtv(rw[0], oz2[rw[0]])));
        var oc = h('td', 'pcshade', rw[2] ? rankTxt(oz2[rw[2]], oz2.pool) : '');
        if (rw[2] && rw[2] !== 'rk_share' && oz2[rw[2]] && oz2.pool > 1) oc.style.background = shade(1 - (oz2[rw[2]] - 1) / (oz2.pool - 1));
        else oc.style.background = 'transparent';
        r.appendChild(oc);
      }
      tb2.appendChild(r);
    });
    t2.appendChild(tb2);
    var w2 = h('div', 'tablewrap'); w2.appendChild(t2); host.appendChild(w2);
    /* who gets the ball here */
    var list = runs ? (j.runs || []).filter(function (p) { return 'R' + p[0] === k; }) : (j.passes || []).filter(function (p) { return p[17] === k; });
    var by = {};
    list.forEach(function (p) { var who = runs ? p[4] : p[7]; if (!who) return; var b = by[who] = by[who] || { n: 0, y: 0, c: 0 }; b.n++; b.y += runs ? p[1] : (p[2] === 'C' ? p[4] : 0); if (!runs && p[2] === 'C') b.c++; });
    var top = Object.keys(by).sort(function (a, b) { return by[b].n - by[a].n; }).slice(0, 5);
    if (top.length) {
      host.appendChild(h('p', 'fdsub', runs ? 'Who carries it here' : 'Who is targeted here'));
      var ul = h('ul', 'fdtop');
      top.forEach(function (n) { var b = by[n]; ul.appendChild(h('li', null, n + ' — ' + b.n + (runs ? ' carries, ' + b.y + ' yds' : ' targets, ' + b.c + ' catches, ' + b.y + ' yds'))); });
      host.appendChild(ul);
    }
    var btns = h('div', 'fdbtns');
    var open = h('button', 'pcreset', 'See all ' + list.length + ' plays');
    open.onclick = function () { showFieldPlays(name(k), list, runs, side); };
    var back = h('button', 'pcreset', runs ? 'All lanes' : 'All zones');
    back.onclick = function () { state.fdSel = null; drawFieldLive(); };
    btns.appendChild(open); btns.appendChild(back); host.appendChild(btns);
  }

  /* pick a game: the whole season, or one opponent at a time (same filter as the bar above) */
  function fieldGameStrip(host) {
    var games = (state.fdGames || []).slice().sort(function (a, b) { return a.week - b.week; });
    if (!games.length) return;
    var bar = h('div', 'fdgames'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Show one game');
    function chip(wk, label, opp) {
      var on = (state.pcf.opp || '') === opp && (opp || !state.pcf.last);
      var b = h('button', 'fdg' + (on ? ' on' : ''));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (wk) b.appendChild(h('span', 'fdgwk', wk));
      b.appendChild(h('span', 'fdgopp', label));
      b.onclick = function () { if (on) return; state.pcf.opp = opp; if (opp) state.pcf.last = ''; state.fdSel = null; refreshPC(); };
      bar.appendChild(b);
    }
    chip('', 'Whole season', '');
    games.forEach(function (g) { chip('Wk ' + g.week, g.opponent, g.opponent); });
    host.appendChild(bar);
  }

  function showFieldPlays(title, list, runs, side) {
    var dlg = document.getElementById('pcSheet'), body = document.getElementById('pcSheetBody');
    document.getElementById('pcSheetTitle').textContent = state.team + ' ' + (side === 'Offense' ? 'offense' : 'defense') + ' · ' + title;
    document.getElementById('pcSheetSub').textContent = pcFilterText() || (state.season + ' season, every game');
    body.innerHTML = '';
    var t = h('table', 'pltab'), hr = h('tr');
    ['Wk', 'Opponent', 'Q', 'Clock', 'Down', 'Ball on', 'Score', runs ? 'Yds' : 'Air', 'Yds', 'EPA', 'Play'].forEach(function (x) { hr.appendChild(h('th', null, x)); });
    var th = h('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = h('tbody');
    list.slice().sort(function (a, b) { return runs ? (a[7] - b[7] || a[9] - b[9] || b[10] - a[10]) : (a[8] - b[8] || a[10] - b[10] || b[11] - a[11]); }).forEach(function (p) {
      var ok = runs ? p[3] : p[6];
      var r = h('tr', (side === 'Defense' ? !ok : ok) ? 'ok' : 'no');
      var cells = runs ? [p[7], p[8], p[9] > 4 ? 'OT' : p[9], clk(p[10]), ord(p[11]) + ' & ' + p[12], ydLine(p[13], side === 'Defense'), p[15], '', p[1], sgn(p[2])]
                       : [p[8], p[9], p[10] > 4 ? 'OT' : p[10], clk(p[11]), ord(p[12]) + ' & ' + p[13], ydLine(p[14], side === 'Defense'), p[16], p[0], p[4], sgn(p[5])];
      cells.forEach(function (v, i) { r.appendChild(h('td', i === 1 ? 'tm' : null, v == null ? '' : String(v))); });
      r.appendChild(h('td', 'pltext', runs ? p[14] : p[15]));
      tb.appendChild(r);
    });
    t.appendChild(tb);
    body.appendChild(h('p', 'tblnote', list.length + ' plays. ' + (side === 'Defense' ? 'Blue edge = the defense won the play; red = the offense did.' : 'Blue edge = successful play; red = unsuccessful.')));
    var w = h('div', 'tablewrap tall'); w.appendChild(t); body.appendChild(w);
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }

  /* ---- deeper numbers: receivers, pressure, defenders, drives, 3rd/4th down, tempo, special teams ----
     Every team number carries its national rank among FBS teams; with a filter on, the rank is
     where that number would place against every team's full season. */
  state.exTab = state.exTab || 0; state.exSide = state.exSide || 0;
  var EX_TABS = [
    ['recv', 'Receivers & YAC'], ['pressure', 'Pressure & QB'], ['def', 'Defenders'], ['drives', 'Drives & tempo'],
    ['downs', '3rd & 4th down'], ['special', 'Special teams']
  ];
  function exFmt(k, v) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    if (/rate|pct|fg40|three_out|rz_td|third|fourth_go|fourth_conv/.test(k)) return pct(v, 1);
    if (k === 'fourth_aggr') return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts';
    if (/^epa/.test(k)) return sgn(v);
    if (k === 'start_pos' || k === 'ko_start') return 'Own ' + Math.round(v);
    if (k === 'sec_per_snap') return num(v, 1) + ' s';
    if (k === 'net_punt') return num(v, 1) + ' yds';
    if (k === 'yac_per_catch') return num(v, 1) + ' yds';
    return num(v, 2);
  }
  function exCards(host, M, keys, side) {
    var grid = h('div', 'excards');
    keys.forEach(function (k) {
      var m = M[k]; if (!m) return;
      var c = h('div', 'excard');
      c.appendChild(h('p', 'exl', m.label));
      c.appendChild(h('p', 'exv', exFmt(k, m.v)));
      var r = h('p', 'exr');
      var neutral = m.dir === 0 || m.dir === 2;
      r.innerHTML = (m.rank ? '<b>#' + m.rank + '</b> of ' + m.pool + (neutral ? (m.dir === 2 ? ' (#1 = fastest)' : ' (#1 = most)') : '') : 'no rank') +
        ' · FBS ' + exFmt(k, m.nat) + (m.n && m.grp !== 'special' && m.grp !== 'tempo' ? ' · ' + m.n + (m.grp === 'drives' ? ' drives' : m.grp === 'fourth' ? ' 4th downs' : m.grp === 'recv' ? ' catches' : ' plays') : '');
      c.appendChild(r);
      if (m.rank && m.pool > 1 && !neutral) c.style.boxShadow = 'inset 4px 0 0 ' + shade(1 - (m.rank - 1) / (m.pool - 1));
      grid.appendChild(c);
    });
    host.appendChild(grid);
  }
  function exTable(host, cols, rows, opts) {
    opts = opts || {};
    var key = 'exSort_' + (opts.id || ''), st = state[key] || { k: opts.sort || null, asc: false };
    if (st.k) rows = rows.slice().sort(function (a, b) {
      var x = a[st.k], y = b[st.k]; if (typeof x === 'string') return (st.asc ? 1 : -1) * String(x).localeCompare(String(y));
      if (x == null) return 1; if (y == null) return -1; return (st.asc ? 1 : -1) * (x - y);
    });
    var t = h('table', 'extab sortable'), tr = h('tr');
    cols.forEach(function (c) {
      var th = h('th', st.k === c[0] ? 'sorted' + (st.asc ? ' asc' : '') : null, c[1]);
      if (c[3] !== false) th.onclick = function () { state[key] = { k: c[0], asc: st.k === c[0] ? !st.asc : typeof rows[0] === 'object' && typeof (rows[0] || {})[c[0]] === 'string' }; opts.redraw(); };
      if (c[4]) th.title = c[4];
      tr.appendChild(th);
    });
    var th0 = h('thead'); th0.appendChild(tr); t.appendChild(th0);
    var tb = h('tbody');
    rows.slice(0, opts.limit || 500).forEach(function (r) {
      var row = h('tr');
      cols.forEach(function (c, i) { row.appendChild(h('td', i === 0 ? 'pclab' : null, c[2](r))); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    var w = h('div', 'tablewrap' + (opts.tall ? ' tall' : '')); w.appendChild(t); host.appendChild(w);
  }

  function buildExtras() {
    var host = document.getElementById('exChart');
    if (!host) return;
    var side = ['Offense', 'Defense'][state.exSide] || 'Offense';
    segs(document.getElementById('exSideTabs'), ['Their offense', 'Their defense'], state.exSide, function (i) { state.exSide = i; buildExtras(); });
    segs(document.getElementById('exTabs'), EX_TABS.map(function (x) { return x[1]; }), state.exTab, function (i) { state.exTab = i; drawExtras(); });
    var seq = state.exSeq = (state.exSeq || 0) + 1;
    if (!host.firstChild) host.appendChild(h('p', 'ax', 'Loading…'));
    host.style.opacity = '.55';
    Promise.all([
      fetch('api/extras?' + pcQuery(side)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('api/pc?' + pcQuery(side)).then(function (r) { return r.ok ? r.json() : { games: [] }; })
    ]).then(function (res) {
      if (seq !== state.exSeq) return; host.style.opacity = '';
      pcFilters(document.getElementById('exFilters'), res[1].games, refreshPC);
      state.exData = res[0]; state.exData.sideName = side;
      drawExtras();
    }).catch(function (e) { if (seq !== state.exSeq) return; host.style.opacity = ''; host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load these numbers. ' + e.message)); });
  }

  function drawExtras() {
    var host = document.getElementById('exChart'), j = state.exData;
    if (!host || !j) return;
    segs(document.getElementById('exTabs'), EX_TABS.map(function (x) { return x[1]; }), state.exTab, function (i) { state.exTab = i; drawExtras(); });
    var tab = EX_TABS[state.exTab][0], side = j.sideName, M = j.metrics || {}, off = side === 'Offense';
    var us = state.team, them = off ? 'opponents' : state.team;
    host.innerHTML = '';
    var note = '';
    if (tab === 'recv') {
      exCards(host, M, ['yac_per_catch']);
      host.appendChild(h('h3', 'exh', off ? state.team + ' receivers' : 'Receivers against ' + state.team));
      var tot = (j.receivers || []).reduce(function (s, r) { return s + r.tg; }, 0);
      exTable(host, [
        ['who', 'Receiver', function (r) { return r.who; }],
        ['tg', 'Targets', function (r) { return r.tg + ' (' + pct(r.tg / (tot || 1)) + ')'; }, true, 'Targets, and share of the team\'s targets'],
        ['rec', 'Catches', function (r) { return r.rec + ' (' + pct(r.rec / r.tg) + ')'; }],
        ['yds', 'Yards', function (r) { return r.yds == null ? 0 : r.yds; }],
        ['ypt', 'Yds/target', function (r) { return num((r.yds || 0) / r.tg, 1); }],
        ['yacpc', 'YAC/catch', function (r) { return r.yac_n ? num(r.yac / r.yac_n, 1) : '–'; }, true, 'Yards after the catch: yards gained beyond the catch spot'],
        ['adot', 'Avg depth', function (r) { return r.adot == null ? '–' : num(r.adot, 1); }, true, 'Average target depth past the line of scrimmage'],
        ['epa', 'EPA/target', function (r) { return sgn(r.epa); }],
        ['td', 'TD', function (r) { return r.td; }]
      ], (j.receivers || []).map(function (r) { r.ypt = (r.yds || 0) / r.tg; r.yacpc = r.yac_n ? r.yac / r.yac_n : null; return r; }), { id: 'recv', sort: 'tg', redraw: drawExtras });
      note = 'Targets come from the play-by-play ("pass ... to"). Yards after catch = yards gained minus the catch spot\'s distance past the line; catches with no recorded spot are left out of YAC and depth.';
    } else if (tab === 'pressure') {
      exCards(host, M, ['pressure_rate', 'sack_rate', 'epa_clean', 'epa_pressured']);
      host.appendChild(h('h3', 'exh', off ? state.team + ' quarterbacks' : 'Quarterbacks against ' + state.team));
      exTable(host, [
        ['who', 'Passer', function (r) { return r.who; }],
        ['n', 'Dropbacks', function (r) { return r.n; }],
        ['pr', 'Pressured', function (r) { return pct(r.pr, 1); }, true, 'Hurried or sacked, per dropback'],
        ['sacks', 'Sacks', function (r) { return r.sacks; }],
        ['epa_clean', 'EPA clean', function (r) { return sgn(r.epa_clean); }],
        ['epa_pr', 'EPA pressured', function (r) { return sgn(r.epa_pr); }]
      ], j.passers || [], { id: 'qb', sort: 'n', redraw: drawExtras });
      note = 'Pressure = a sack or a play where the play-by-play says the quarterback was hurried. Scorers do not log every hurry, so pressure rates read low across the board; the ranks compare like with like.';
    } else if (tab === 'def') {
      exCards(host, M, ['pbu_rate', 'int_rate', 'tfl_rate', 'opp_rate', 'pressure_rate', 'sack_rate']);
      host.appendChild(h('h3', 'exh', off ? 'Defenders who made plays against ' + state.team : state.team + ' defenders'));
      exTable(host, [
        ['who', 'Defender', function (r) { return r.who; }],
        ['tk', 'Tackles', function (r) { return r.tk; }, true, 'Every defender named on the tackle, so shared tackles count for each'],
        ['tfl', 'TFL (runs)', function (r) { return r.tfl; }],
        ['sk', 'Sacks', function (r) { return r.sk; }],
        ['hur', 'Hurries', function (r) { return r.hur; }],
        ['pbu', 'PBU', function (r) { return r.pbu; }, true, 'Passes broken up'],
        ['int', 'INT', function (r) { return r.int; }]
      ], j.defenders || [], { id: 'def', sort: 'tk', redraw: drawExtras, tall: true });
      note = (off ? 'Rates are what defenses did against ' + state.team + '; lower is better for the offense. ' : '') +
        'Names come from the play-by-play: the tacklers in parentheses, "hurried by", "broken up by", "intercepted by". TFL counts runs stopped behind the line; sacks are separate.';
    } else if (tab === 'drives') {
      exCards(host, M, ['ppd', 'start_pos', 'three_out', 'rz_td', 'to_rate', 'sec_per_snap']);
      host.appendChild(h('h3', 'exh', off ? state.team + ' drives' : 'Opponent drives against ' + state.team));
      exTable(host, [
        ['week', 'Wk', function (r) { return r.week; }],
        ['opp', 'Opponent', function (r) { return r.opp; }],
        ['q', 'Q', function (r) { return r.q > 4 ? 'OT' : r.q; }],
        ['start', 'Start', function (r) { return r.start == null ? '–' : (r.start > 50 ? 'Opp ' + (100 - r.start) : 'Own ' + r.start); }],
        ['plays', 'Plays', function (r) { return r.plays; }],
        ['yds', 'Yards', function (r) { return r.yds; }],
        ['result', 'Result', function (r) { return r.result; }],
        ['pts', 'Pts', function (r) { return r.pts; }]
      ], j.drives || [], { id: 'drv', redraw: drawExtras, tall: true });
      note = 'A drive is every snap in a row by one offense, starting after a kickoff, punt, turnover or the start of a half. Points count a touchdown as 7 and a field goal as 3. Tempo = game-clock seconds between snaps within a drive; the clock stops on incompletions and out-of-bounds plays, so compare teams, not raw seconds.';
    } else if (tab === 'downs') {
      exCards(host, M, ['third_conv', 'third_s', 'third_m', 'third_l', 'third_xl', 'fourth_go', 'fourth_aggr', 'fourth_conv']);
      host.appendChild(h('h3', 'exh', '4th-down decisions by situation'));
      var BL = { '1': '4th & 1', '2-3': '4th & 2-3', '4-6': '4th & 4-6', '7+': '4th & 7+' }, FLD = { own: 'own territory', mid: 'midfield (opp 41 to own 40)', fringe: 'opp 26-40', fg: 'opp 25 and in' };
      exTable(host, [
        ['b', 'Situation', function (r) { var p = r.b.split('|'); return BL[p[0]] + ', ' + FLD[p[1]]; }],
        ['n', '4th downs', function (r) { return r.n; }],
        ['go', 'Went for it', function (r) { return pct(r.go); }],
        ['nat', 'FBS went for it', function (r) { return pct(r.nat); }],
        ['conv', 'Converted', function (r) { return r.conv == null ? '–' : pct(r.conv); }]
      ], (j.fourth || []).map(function (r) { r.diff = r.go - (r.nat || 0); return r; }), { id: 'fourth', redraw: drawExtras });
      note = 'Conversion = gained the yards needed on that down. Aggressiveness compares how often they went for it with how often FBS teams went for it in the same distance and field position, so a team that faces lots of 4th-and-1 is not credited for it. It is a measure of tendency, not of whether each call was right.';
    } else if (tab === 'special') {
      exCards(host, M, ['net_punt', 'fg_pct', 'fg40', 'ko_start']);
      host.appendChild(h('h3', 'exh', off ? state.team + ' field goals by distance' : 'Opponent field goals against ' + state.team));
      exTable(host, [
        ['b', 'Distance', function (r) { return r.b; }, false],
        ['att', 'Attempts', function (r) { return r.att; }],
        ['made', 'Made', function (r) { return r.made; }],
        ['pct', 'Pct', function (r) { return pct(r.made / r.att); }]
      ], (j.fg || []).map(function (r) { r.pct = r.made / r.att; return r; }), { id: 'fg', redraw: drawExtras });
      note = off ? 'Their units: net punt = punt distance minus return yards (touchbacks cost 20). Kickoff start = where their offense starts after receiving a kickoff.'
                 : 'What opponents did against them: opponents\' net punting, field goals, and where opponents start after ' + state.team + ' kicks off (lower is better for ' + state.team + ').';
    }
    document.getElementById('exNote').innerHTML = (pcFilterText() ? '<b>Filtered:</b> ' + pcFilterText() + '. Ranks show where these numbers would place against every FBS team\'s full season. ' : '') +
      'The colored edge on each number is its national rank (blue = better' + (off ? '' : ' for the defense') + ', red = worse). ' + note;
  }

  /* ---- collapsible panels ----
     Each header toggles its own panel and remembers the choice, so a reader
     who only cares about two of twelve sections keeps that layout. */
  function wireCollapse() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('ps.collapsed') || '{}') || {}; }
    catch (e) { saved = {}; }

    function persist() {
      try { localStorage.setItem('ps.collapsed', JSON.stringify(saved)); } catch (e) { /* private mode */ }
    }

    [].forEach.call(document.querySelectorAll('.panel > .phead'), function (head) {
      if (head.dataset.collapseWired) return;
      head.dataset.collapseWired = '1';
      var panel = head.parentNode;
      var h2 = head.querySelector('h2');
      var key = (h2 && h2.textContent.trim()) || '';
      if (!key) return;

      if (saved[key]) panel.classList.add('collapsed');
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.setAttribute('aria-expanded', panel.classList.contains('collapsed') ? 'false' : 'true');

      function toggle() {
        var nowCollapsed = panel.classList.toggle('collapsed');
        head.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
        if (nowCollapsed) saved[key] = 1; else delete saved[key];
        persist();
      }
      head.addEventListener('click', function (ev) {
        /* let links and controls inside a header behave normally */
        if (ev.target.closest('a,button,input,select,label')) return;
        toggle();
      });
      head.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
    });
  }

  /* ---- passing field ---- */
  var BANDS = ['Deep (20+)', 'Intermediate (10-19)', 'Short (0-9)', 'Behind LOS'];
  var DIRS = ['Left', 'Middle', 'Right'];
  function lerp(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
  function hex2rgb(x) { x = x.replace('#', ''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  function rgb(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }

  function buildField() {
    var host = document.getElementById('fieldChart');
    segs(document.getElementById('zoneTabs'), ['Their passing offense', 'What they allowed'], state.zoneTab,
      function (i) { state.zoneTab = i; buildField(); });
    var side = state.zoneTab === 0 ? 'Offense' : 'Defense';
    var rows = state.data.zones.filter(function (r) { return r.season === state.season && r.side === side; });
    var m = state.data.meta.filter(function (r) { return r.season === state.season; })[0];
    var note = document.getElementById('zoneNote');
    host.innerHTML = '';
    if (!rows.length) {
      note.textContent = 'Target depth from the line of scrimmage, by direction — wherever the feed records where the ball was thrown.';
      host.appendChild(h('p', 'ax', 'No charted passing games for ' + state.team + ' in ' + state.season +
        '. Air yards exist only where the play description names a catch or target spot, and ' +
        (m ? '0 of ' + m.games + (m.games === 1 ? ' game' : ' games') : 'no game') +
        ' this season carries it.'));
      return;
    }
    var byKey = {};
    rows.forEach(function (r) { byKey[r.depth_band + '|' + r.direction] = r; });
    var lim = 0;
    rows.forEach(function (r) { if (r.epa_per_att !== null) lim = Math.max(lim, Math.abs(r.epa_per_att)); });
    lim = Math.max(lim, 0.35);

    var CW = 168, CH = 88, GX = 118, GY = 40, W = GX + CW * 3 + 52, H = GY + CH * 4 + 74;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    var POS = hex2rgb(css('--neg')), NEGC = hex2rgb(css('--pos')), MID = hex2rgb(css('--mid'));
    var turf = css('--plane');

    svg.appendChild(el('rect', { x: GX, y: GY, width: CW * 3, height: CH * 4, fill: turf, stroke: css('--axis'), 'stroke-width': 1.5 }));

    for (var b = 0; b < 4; b++) {
      for (var d = 0; d < 3; d++) {
        var r = byKey[BANDS[b] + '|' + DIRS[d]];
        var x = GX + d * CW, y = GY + b * CH;
        var fill = turf, t, fc = null;
        if (r && r.epa_per_att !== null) {
          t = Math.max(-1, Math.min(1, r.epa_per_att / lim));
          fc = t >= 0 ? lerp(MID, POS, t) : lerp(MID, NEGC, -t);
          fill = rgb(fc);
        }
        /* ink chosen from the cell's own brightness, so text reads on every shade in both themes */
        var lum = fc ? (0.2126 * fc[0] + 0.7152 * fc[1] + 0.0722 * fc[2]) / 255 : null;
        var ink = lum === null ? null : lum < 0.6 ? '#ffffff' : '#111827';
        var ink2 = lum === null ? null : lum < 0.6 ? 'rgba(255,255,255,.95)' : '#1f2937';
        svg.appendChild(el('rect', { x: x + 1, y: y + 1, width: CW - 2, height: CH - 2, fill: fill }));
        var cx = x + CW / 2;
        if (r) {
          svg.appendChild(el('text', { x: cx, y: y + CH / 2 - 5, 'text-anchor': 'middle', class: 'lbl', style: (ink ? 'fill:' + ink + ';' : '') + 'font-size:21px;font-weight:700' }, sgn(r.epa_per_att)));
          svg.appendChild(el('text', { x: cx, y: y + CH / 2 + 17, 'text-anchor': 'middle', class: 'num', style: (ink2 ? 'fill:' + ink2 + ';' : '') + 'font-size:14.5px;font-weight:500' },
            r.attempts + ' att · ' + pct(r.comp_pct) + ' comp'));
          var hit = el('rect', { x: x, y: y, width: CW, height: CH, class: 'hit' });
          bindTip(hit, '<b>' + BANDS[b] + ' · ' + DIRS[d] + '</b><br>' +
            'EPA per attempt: <b>' + sgn(r.epa_per_att) + '</b><br>' +
            r.completions + ' of ' + r.attempts + ' (' + pct(r.comp_pct) + ')<br>' +
            'Success rate ' + pct(r.success_rate) + ' · ' + num(r.yards_per_att, 1) + ' yds/att' +
            (r.ints ? '<br>' + r.ints + ' interception' + (r.ints > 1 ? 's' : '') : ''));
          svg.appendChild(hit);
        } else {
          svg.appendChild(el('text', { x: cx, y: y + CH / 2 + 4, 'text-anchor': 'middle', class: 'ax' }, 'no attempts'));
        }
        if (d) svg.appendChild(el('line', { x1: x, x2: x, y1: GY, y2: GY + CH * 4, stroke: css('--surface-1'), 'stroke-width': 2 }));
      }
      if (b) svg.appendChild(el('line', { x1: GX, x2: GX + CW * 3, y1: GY + b * CH, y2: GY + b * CH, stroke: css('--surface-1'), 'stroke-width': 2 }));
      var bl = BANDS[b].match(/^(.*?)(?: \((.*)\))?$/);
      svg.appendChild(el('text', { x: GX - 12, y: GY + b * CH + CH / 2 + (bl[2] ? -2 : 5), 'text-anchor': 'end', class: 'lbl', style: 'font-size:15px;font-weight:600' }, bl[1]));
      if (bl[2]) svg.appendChild(el('text', { x: GX - 12, y: GY + b * CH + CH / 2 + 16, 'text-anchor': 'end', class: 'ax', style: 'font-size:12.5px' }, bl[2] + ' yds'));
    }
    DIRS.forEach(function (dn, i) {
      svg.appendChild(el('text', { x: GX + i * CW + CW / 2, y: GY - 12, 'text-anchor': 'middle', class: 'lbl', style: 'font-size:15px;font-weight:600' }, dn));
    });
    var losY = GY + CH * 3;
    svg.appendChild(el('line', { x1: GX, x2: GX + CW * 3, y1: losY, y2: losY, stroke: css('--ink'), 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }));
    svg.appendChild(el('text', { x: GX + CW * 3 + 8, y: losY + 4, class: 'ax', style: 'font-size:13px' }, 'LOS'));

    var ly = GY + CH * 4 + 30, lw = 210, lx = W / 2 - lw / 2;
    for (var i = 0; i <= 40; i++) {
      var tt = -1 + (i / 40) * 2;
      svg.appendChild(el('rect', { x: lx + (i / 41) * lw, y: ly, width: lw / 40 + 1, height: 9, fill: rgb(tt >= 0 ? lerp(MID, POS, tt) : lerp(MID, NEGC, -tt)) }));
    }
    svg.appendChild(el('text', { x: lx - 8, y: ly + 9, 'text-anchor': 'end', class: 'ax', style: 'font-size:13px' }, sgn(-lim)));
    svg.appendChild(el('text', { x: lx + lw + 8, y: ly + 9, class: 'ax', style: 'font-size:13px' }, sgn(lim)));
    svg.appendChild(el('text', { x: W / 2, y: ly + 28, 'text-anchor': 'middle', class: 'ax', style: 'font-size:13px' }, 'EPA per attempt'));
    host.appendChild(svg);

    note.innerHTML = 'Target depth from the line of scrimmage, by direction. Cell color is EPA per attempt — <b>red means the passing offense gained ground</b>, blue means it lost ground. ' +
      (m ? 'Charted in <b>' + m.charted + ' of ' + m.games + '</b> games this season' + (m.opponents ? ' (' + m.opponents + ')' : '') + '. ' : '') +
      'Interceptions carry no target spot and are not shown here.';
  }

  /* ---- grouped bars: down & distance ---- */
  function groupedBars(rows, fmt) {
    var W = 940, LBL = 250, PAD = 60, RIGHT = W - PAD, TRACK = RIGHT - LBL;
    var GROUP = 46, TOP = 20, H = TOP + rows.length * GROUP + 40;
    var max = 0;
    rows.forEach(function (r) { r.vals.forEach(function (v) { if (v.v !== null) max = Math.max(max, v.v); }); });
    max = Math.ceil(max * 10) / 10 || 1;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    for (var t = 0; t <= max + 1e-9; t += (max > 0.5 ? 0.2 : 0.1)) {
      var x = LBL + (t / max) * TRACK;
      svg.appendChild(el('line', { x1: x, x2: x, y1: TOP, y2: TOP + rows.length * GROUP, class: t === 0 ? 'base' : 'gl' }));
      svg.appendChild(el('text', { x: x, y: TOP + rows.length * GROUP + 18, 'text-anchor': 'middle', class: 'ax' }, fmt(t)));
    }
    rows.forEach(function (r, i) {
      var y0 = TOP + i * GROUP;
      svg.appendChild(el('text', { x: LBL - 14, y: y0 + GROUP / 2 + 4, 'text-anchor': 'end', class: 'lbl' }, r.label));
      r.vals.forEach(function (v, j) {
        var bh = 15, y = y0 + 6 + j * (bh + 2);
        if (v.v === null) {
          svg.appendChild(el('text', { x: LBL + 6, y: y + bh - 3, class: 'ax' }, 'no plays'));
          return;
        }
        var w = Math.max((v.v / max) * TRACK, 1.5);
        svg.appendChild(el('rect', { x: LBL, y: y, width: w, height: bh, rx: 3, fill: v.color }));
        svg.appendChild(el('text', { x: LBL + w + 7, y: y + bh - 3, class: 'num' }, fmt(v.v)));
        var hit = el('rect', { x: LBL, y: y - 1, width: TRACK, height: bh + 2, class: 'hit' });
        var un = v.unit || 'play';
        bindTip(hit, '<b>' + r.label + '</b><br>' + v.name + ': <b>' + fmt(v.v) + '</b>' +
          (v.plays ? '<br><span class="tv">' + v.plays + ' ' + un + (v.plays === 1 ? '' : 's') + '</span>' : ''));
        svg.appendChild(hit);
      });
    });
    return svg;
  }

  /* Each metric names its own denominator, so a run success rate is counted
     against runs and a dropback rate against dropbacks — never against every
     snap in the bucket, which would quietly understate both. The situational
     payload carries plays and pass rate rather than the two counts, and every
     scrimmage snap is one or the other, so the split recovers exactly. */
  function den(row, which) {
    if (!row) return 0;
    var plays = +row.plays;
    if (which === 'plays') return plays;
    var drops = Math.round(plays * (+row.pass_rate || 0));
    return which === 'dropbacks' ? drops : plays - drops;
  }
  var SIT_METRICS = [
    { key: 'pass_rate',   name: 'Pass rate',        den: 'plays',     unit: 'play' },
    { key: 'sr_all',      name: 'Success rate',     den: 'plays',     unit: 'play' },
    { key: 'sr_run',      name: 'Run success',      den: 'runs',      unit: 'run' },
    { key: 'sr_pass',     name: 'Dropback success', den: 'dropbacks', unit: 'dropback' }
  ];

  function buildSit() {
    var host = document.getElementById('sitChart');
    var side = state.sitSide === 1 ? 'Defense' : 'Offense';
    segs(document.getElementById('sitSideTabs'), ['Offense', 'Defense'], state.sitSide,
      function (i) { state.sitSide = i; buildSit(); });
    segs(document.getElementById('sitTabs'), SIT_METRICS.map(function (m) { return m.name; }), state.sitTab,
      function (i) { state.sitTab = i; buildSit(); });
    var s = SIT_METRICS[state.sitTab];

    document.getElementById('sitNote').textContent = side === 'Offense'
      ? 'What they called down by down, and how often it worked. The snap count sits in every label, because a rate off three plays is not a tendency.'
      : 'What opponents called against them down by down, and how often it worked. Lower is better on every bar here except pass rate, which is a tendency.';

    var seasons = state.data.seasons;
    var prev = seasons.length > 1 ? seasons[seasons.indexOf(state.season) - 1] : null;
    var pick = function (season) {
      var o = {};
      state.data.situational.filter(function (r) { return r.season === season && r.side === side && r.dimension === 'Down & Distance'; })
        .forEach(function (r) { o[r.bucket] = r; });
      return o;
    };
    var cur = pick(state.season), old = prev !== null && prev !== undefined ? pick(prev) : null;
    var buckets = state.data.situational
      .filter(function (r) { return r.side === side && r.dimension === 'Down & Distance'; })
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .map(function (r) { return r.bucket; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var C1 = css('--s1'), C2 = css('--s2');
    var label = s.name + (side === 'Defense' ? ' allowed' : '');
    var rows = buckets.map(function (b) {
      var c = cur[b], o = old ? old[b] : null;
      var n = den(c, s.den);
      var vals = [];
      vals.push({ v: c ? c[s.key] : null, name: label + ' ' + state.season, color: C2, plays: n, unit: s.unit });
      if (old) vals.push({ v: o ? o[s.key] : null, name: label + ' ' + prev, color: C1, plays: den(o, s.den), unit: s.unit });
      return { label: b + (c ? '  ·  ' + n + ' ' + s.unit + (n === 1 ? '' : 's') : ''), vals: vals };
    });
    host.innerHTML = '';
    var lg = h('div', 'legend');
    lg.appendChild(mkKey(C2, String(state.season)));
    if (old) lg.appendChild(mkKey(C1, String(prev)));
    host.appendChild(lg);
    host.appendChild(groupedBars(rows, function (v) { return pct(v); }));
    if (s.key === 'pass_rate') {
      var n2 = h('p', 'tblnote');
      n2.innerHTML = 'Run rate is the mirror of this bar — every scrimmage snap is a run or a dropback, ' +
        'so a 40% pass rate is a 60% run rate. Pick <b>Run success</b> to see how the runs actually did.';
      host.appendChild(n2);
    }
  }
  function mkKey(color, label) {
    var s = h('span', 'lk'); var i = h('i'); i.style.background = color;
    s.appendChild(i); s.appendChild(document.createTextNode(label)); return s;
  }

  /* ---- game trend ---- */
  function buildTrend() {
    var host = document.getElementById('trendChart');
    var gl = state.data.gamelog.filter(function (r) { return r.season === state.season; }).sort(function (a, b) { return a.week - b.week; });
    var dp = {};
    state.data.defopp.filter(function (r) { return r.season === state.season; }).forEach(function (r) { dp[r.week] = r; });
    host.innerHTML = '';
    if (gl.length < 1) { host.appendChild(h('p', 'ax', 'No games yet this season.')); return; }
    var W = 940, L = 58, R = 24, T = 26, B = 62, PW = W - L - R, H = 300, PH = H - T - B;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    var lo = 0, hi = 0.8;
    var C1 = css('--s1'), C2 = css('--s2'), SUR = css('--surface-1');
    for (var t = lo; t <= hi + 1e-9; t += 0.2) {
      var y = T + PH - ((t - lo) / (hi - lo)) * PH;
      svg.appendChild(el('line', { x1: L, x2: L + PW, y1: y, y2: y, class: t === lo ? 'base' : 'gl' }));
      svg.appendChild(el('text', { x: L - 10, y: y + 4, 'text-anchor': 'end', class: 'ax' }, pct(t)));
    }
    var n = gl.length;
    var X = function (i) { return n === 1 ? L + PW / 2 : L + (i / (n - 1)) * PW; };
    var Y = function (v) { return T + PH - ((v - lo) / (hi - lo)) * PH; };
    var series = [
      { name: 'Their offense', color: C1, get: function (g) { return g.sr_all; } },
      { name: 'What they allowed', color: C2, get: function (g, i) { var d = dp[g.week]; return d ? d.sr_allowed : null; } }
    ];
    series.forEach(function (s) {
      var pts = gl.map(function (g, i) { var v = s.get(g, i); return v === null || v === undefined ? null : [X(i), Y(v)]; });
      var dstr = '', open = false;
      pts.forEach(function (p) { if (!p) { open = false; return; } dstr += (open ? 'L' : 'M') + p[0] + ' ' + p[1] + ' '; open = true; });
      if (dstr) svg.appendChild(el('path', { d: dstr.trim(), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      pts.forEach(function (p, i) {
        if (!p) return;
        svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 5, fill: s.color, stroke: SUR, 'stroke-width': 2 }));
      });
    });
    gl.forEach(function (g, i) {
      var d = dp[g.week];
      svg.appendChild(el('text', { x: X(i), y: T + PH + 20, 'text-anchor': 'middle', class: 'ax' }, g.opponent.length > 12 ? g.opponent.slice(0, 11) + '…' : g.opponent));
      svg.appendChild(el('text', { x: X(i), y: T + PH + 34, 'text-anchor': 'middle', class: 'ax' }, 'wk ' + g.week));
      var hit = el('rect', { x: X(i) - (n === 1 ? 60 : PW / (2 * (n - 1))), y: T, width: n === 1 ? 120 : PW / (n - 1), height: PH, class: 'hit' });
      bindTip(hit, '<b>' + g.opponent + '</b> · week ' + g.week + '<br>' +
        'Offense: ' + pct(g.sr_all) + ' SR, ' + sgn(g.epa_all) + ' EPA on ' + g.plays + ' plays<br>' +
        (d ? 'Allowed: ' + pct(d.sr_allowed) + ' SR, ' + sgn(d.epa_allowed) + ' EPA on ' + d.plays_faced + ' plays' : ''));
      svg.appendChild(hit);
    });
    var lg = h('div', 'legend');
    series.forEach(function (s) { lg.appendChild(mkKey(s.color, s.name)); });
    host.appendChild(lg);
    host.appendChild(svg);

    /* table */
    var tb = document.getElementById('gameTable');
    tb.innerHTML = '';
    /* the market's number and the conditions, keyed by week */
    var ctx = {};
    (state.data.expectation || []).filter(function (r) { return r.season === state.season; })
      .forEach(function (r) { ctx[r.week] = r; });

    var head = ['Wk', 'Opponent', 'Plays', 'Pass %', 'SR', 'EPA', 'Expl %', 'Yds',
      'SR allowed', 'EPA allowed', 'Yds allowed', 'Line', 'Cover', 'Temp'];
    var tr = h('tr'); head.forEach(function (x) { tr.appendChild(h('th', null, x)); });
    var th = document.createElement('thead'); th.appendChild(tr); tb.appendChild(th);
    var tbody = document.createElement('tbody');
    gl.forEach(function (g) {
      var d = dp[g.week] || {}, c = ctx[g.week] || {};
      var r = h('tr');
      [g.week, g.opponent, g.plays, pct(g.pass_rate), pct(g.sr_all), sgn(g.epa_all), pct(g.explosive_rate), g.yards,
        pct(d.sr_allowed), sgn(d.epa_allowed), d.yards_allowed === undefined ? '–' : d.yards_allowed,
        c.expected_margin === null || c.expected_margin === undefined ? '–' : sgn(c.expected_margin, 1),
        c.cover_margin === null || c.cover_margin === undefined ? '–' : sgn(c.cover_margin, 1),
        c.temperature === null || c.temperature === undefined ? '–' : num(c.temperature, 0) + '°']
        .forEach(function (v, i) {
          var td = h('td', null, v === null || v === undefined ? '–' : String(v));
          if (i === 12 && c.cover_margin !== null && c.cover_margin !== undefined) {
            td.style.color = +c.cover_margin >= 0 ? css('--pos') : css('--neg');
          }
          r.appendChild(td);
        });
      tbody.appendChild(r);
    });
    tb.appendChild(tbody);
  }

  /* ---- hero + readout ---- */
  function ord(n) {
    if (!n) return '';
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function buildHero() {
    var hl = {};
    state.data.headline.filter(function (r) { return r.season === state.season; })
      .forEach(function (r) { hl[r.side] = r; });
    var gl = state.data.gamelog.filter(function (r) { return r.season === state.season; });
    var off = hl.Offense, def = hl.Defense;
    var conf = (state.data.conference || '').trim();

    var eb = document.getElementById('heroEyebrow');
    eb.innerHTML = '';
    [String(state.season) + ' season', conf, gl.length + ' game' + (gl.length === 1 ? '' : 's')]
      .filter(Boolean).forEach(function (t, i) {
        if (i) { var d = h('span', 'dot'); eb.appendChild(d); }
        eb.appendChild(document.createTextNode(t));
      });
    document.getElementById('heroTeam').textContent = state.team;

    var lede = document.getElementById('heroLede');
    if (off && def) {
      var better = off.sr_rank <= def.sr_rank ? 'offense' : 'defense';
      lede.innerHTML = 'Through ' + gl.length + ' game' + (gl.length === 1 ? '' : 's') +
        ', the offense succeeds on <b>' + pct(off.sr, 1) + '</b> of its snaps — <b>' + ord(off.sr_rank) +
        '</b> of ' + off.pool + ' — while the defense holds opponents to <b>' + pct(def.sr, 1) +
        '</b>, <b>' + ord(def.sr_rank) + '</b>. The ' + better + ' is doing the heavier lifting.';
    } else {
      lede.textContent = 'Not enough snaps logged this season to rank this team nationally.';
    }

    var host = document.getElementById('tiles');
    host.innerHTML = '';
    var plays = gl.reduce(function (a, g) { return a + g.plays; }, 0);
    var tiles = [
      { k: 'Games', v: String(gl.length), r: plays ? plays.toLocaleString() + ' snaps' : '' },
      off ? { k: 'Success rate', v: pct(off.sr, 1), r: ord(off.sr_rank) + ' of ' + off.pool, good: off.sr_rank <= off.pool / 2 } : null,
      off ? { k: 'EPA / play', v: sgn(off.epa), r: ord(off.epa_rank) + ' of ' + off.pool, good: off.epa_rank <= off.pool / 2 } : null,
      def ? { k: 'SR allowed', v: pct(def.sr, 1), r: ord(def.sr_rank) + ' of ' + def.pool, good: def.sr_rank <= def.pool / 2 } : null,
      def ? { k: 'EPA allowed', v: sgn(def.epa), r: ord(def.epa_rank) + ' of ' + def.pool, good: def.epa_rank <= def.pool / 2 } : null
    ].filter(Boolean);
    tiles.forEach(function (t) {
      var d = h('div', 'tile');
      d.appendChild(h('span', 'k', t.k));
      d.appendChild(h('span', 'v', t.v));
      if (t.r) d.appendChild(h('span', 'r' + (t.good === true ? ' up' : t.good === false ? ' dn' : ''), t.r));
      host.appendChild(d);
    });
  }

  /* ---- limits note ---- */
  function buildLimits() {
    var m = state.data.meta.filter(function (r) { return r.season === state.season; })[0];
    var gl = state.data.gamelog.filter(function (r) { return r.season === state.season; });
    var bits = [];
    if (m) bits.push('Passing charts cover <b>' + m.charted + ' of ' + m.games + '</b> games this season — air yards exist only where the feed writes a catch or target spot into the play text.');
    if (gl.length && gl.length < 4) bits.push('Only <b>' + gl.length + ' game' + (gl.length === 1 ? '' : 's') + '</b> so far, so every rate here carries a wide margin of error and a rank says more about the schedule than the team.');
    bits.push('A handful of plays are logged without a down and cannot be bucketed, so run counts sit about 2% under official box scores. Rates are unaffected.');
    document.getElementById('footLimits').innerHTML = bits.join(' ');
  }

  /* ---- how fresh is the play log ---- */
  function buildFresh() {
    var host = document.getElementById('footFresh');
    var f = state.data.freshness;
    if (!f || !f.last_load) { host.textContent = ''; return; }
    var when = new Date(f.last_load);
    var hours = (Date.now() - when.getTime()) / 3600000;
    var stamp = when.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    host.innerHTML = 'Play log currently runs through <b>week ' + f.max_week + '</b> of ' + f.season +
      ' — ' + Number(f.games).toLocaleString() + ' games, last pulled ' + stamp + '. ' +
      (hours > 30
        ? '<b>That is more than a day old, so the loader is behind.</b>'
        : 'A game played today may not appear until the next pull.');
  }

  /* =====================================================================
     League-wide layer: head to head, conferences, and the full FBS board.
     One payload per (season, side) feeds all three, so a rank quoted in
     one panel can never disagree with the same rank in another.
     ===================================================================== */

  var P0 = function (v) { return pct(v, 0); };
  var P1 = function (v) { return pct(v, 1); };
  var S2 = function (v) { return sgn(v, 2); };
  var N0 = function (v) { return num(v, 0); };
  var N1 = function (v) { return num(v, 1); };
  var N2 = function (v) { return num(v, 2); };
  var N3 = function (v) { return num(v, 3); };

  /* dir: +1 higher is better for an offense, -1 lower is better,
     0 a tendency with no good or bad side. Defense flips the sign. */
  var METRICS = [
    { key: 'sr_all',              short: 'SR',        label: 'Success rate',      fmt: P1, dir: 1 },
    { key: 'epa_all',             short: 'EPA',       label: 'EPA per play',      fmt: S2, dir: 1 },
    { key: 'explosive_rate',      short: 'Expl %',    label: 'Explosive rate',    fmt: P1, dir: 1 },
    { key: 'pass_rate',           short: 'Pass %',    label: 'Pass rate',         fmt: P0, dir: 0 },
    { key: 'plays_per_game',      short: 'Plays/G',   label: 'Plays per game',    fmt: N1, dir: 0 },
    { key: 'sr_pass',             short: 'Drop SR',   label: 'Dropback SR',       fmt: P1, dir: 1 },
    { key: 'epa_pass',            short: 'Drop EPA',  label: 'Dropback EPA',      fmt: S2, dir: 1 },
    { key: 'completion_rate',     short: 'Comp %',    label: 'Completion rate',   fmt: P1, dir: 1 },
    { key: 'explosive_pass_rate', short: 'Expl pass', label: 'Explosive pass',    fmt: P1, dir: 1 },
    { key: 'sack_rate',           short: 'Sack %',    label: 'Sack rate',         fmt: P1, dir: -1 },
    { key: 'sr_run',              short: 'Run SR',    label: 'Run SR',            fmt: P1, dir: 1 },
    { key: 'epa_run',             short: 'Run EPA',   label: 'Run EPA',           fmt: S2, dir: 1 },
    { key: 'explosive_run_rate',  short: 'Expl run',  label: 'Explosive run',     fmt: P1, dir: 1 },
    { key: 'stuff_rate',          short: 'Stuff %',   label: 'Run stuffed',       fmt: P1, dir: -1 },
    { key: 'sr_early',            short: 'Early SR',  label: 'Early-down SR',     fmt: P1, dir: 1 },
    { key: 'sr_late',             short: 'Late SR',   label: 'Late-down SR',      fmt: P1, dir: 1 },
    { key: 'sr_standard',         short: 'Std SR',    label: 'Standard-down SR',  fmt: P1, dir: 1 },
    { key: 'sr_passdown',         short: 'Pass-dn SR',label: 'Passing-down SR',   fmt: P1, dir: 1 },
    { key: 'sr_redzone',          short: 'RZ SR',     label: 'Red-zone SR',       fmt: P1, dir: 1 },

    /* ratings — whole-team numbers, so flip:false keeps them pointing the same
       way on the defensive view; only the SP+ side split actually inverts */
    { key: 'r_sp_overall',  short: 'SP+',     label: 'SP+ overall',  fmt: N1, dir: 1, flip: false },
    { key: 'r_sp_side',     short: 'SP+ O/D', label: 'SP+ this side', fmt: N1, dir: 1 },
    { key: 'r_fpi',         short: 'FPI',     label: 'FPI',          fmt: N1, dir: 1, flip: false },
    { key: 'r_elo',         short: 'Elo',     label: 'Elo',          fmt: N0, dir: 1, flip: false },
    { key: 'r_srs',         short: 'SRS',     label: 'SRS',          fmt: N1, dir: 1, flip: false },

    /* opponent-adjusted */
    { key: 'a_epa',         short: 'Adj EPA',  label: 'Adjusted EPA',          fmt: N3, dir: 1 },
    { key: 'a_success',     short: 'Adj SR',   label: 'Adjusted success rate', fmt: P1, dir: 1 },
    { key: 'a_explosive',   short: 'Adj expl', label: 'Adjusted explosiveness',fmt: N2, dir: 1 },
    { key: 'a_rush_epa',    short: 'Adj run',  label: 'Adjusted rushing EPA',  fmt: N3, dir: 1 },
    { key: 'a_pass_epa',    short: 'Adj pass', label: 'Adjusted passing EPA',  fmt: N3, dir: 1 },
    { key: 'a_line_yards',  short: 'Line yds', label: 'Line yards',            fmt: N2, dir: 1 },

    /* havoc — plays a defense wrecks behind the line or in the air. Read from
       the offense's side these are plays wrecked against it, so dir is -1 and
       the usual defensive flip turns it the right way up. Passes defensed are
       not in the play feed, so this is TFL + sacks + takeaways, and says so. */
    { key: 'x_havoc',        short: 'Havoc',     label: 'Havoc rate',           fmt: P1, dir: -1 },
    { key: 'x_havoc_rush',   short: 'Run havoc', label: 'Runs stopped behind LOS', fmt: P1, dir: -1 },
    { key: 'x_havoc_pass',   short: 'Pass havoc',label: 'Sacks + picks per dropback', fmt: P1, dir: -1 },
    { key: 'x_tfl',          short: 'TFL',       label: 'Runs for loss',        fmt: N0, dir: -1 },
    { key: 'x_sacks',        short: 'Sacks',     label: 'Sacks',                fmt: N0, dir: -1 },
    { key: 'x_ints',         short: 'INT',       label: 'Interceptions',        fmt: N0, dir: -1 },

    /* the run game broken into the parts the line owns and the parts it doesn't */
    { key: 'x_line_yards',   short: 'Line yds',  label: 'Line yards per carry', fmt: N2, dir: 1 },
    { key: 'x_second_level', short: '2nd level', label: 'Second-level yards',   fmt: N2, dir: 1 },
    { key: 'x_open_field',   short: 'Open field',label: 'Open-field yards',     fmt: N2, dir: 1 },
    { key: 'x_stuff',        short: 'Stuff %',   label: 'Runs stuffed at or behind LOS', fmt: P1, dir: -1 },
    { key: 'x_power',        short: 'Power %',   label: 'Short-yardage conversion', fmt: P0, dir: 1 },

    /* standard downs vs passing downs */
    { key: 'x_std_rate',     short: 'Std %',     label: 'Share of standard downs', fmt: P0, dir: 1 },
    { key: 'x_std_succ',     short: 'Std SR',    label: 'Standard-down success', fmt: P1, dir: 1 },
    { key: 'x_std_ppa',      short: 'Std EPA',   label: 'Standard-down EPA',    fmt: S2, dir: 1 },
    { key: 'x_std_expl',     short: 'Std expl',  label: 'Standard-down explosiveness', fmt: N2, dir: 1 },
    { key: 'x_pd_succ',      short: 'Pass-dn SR',label: 'Passing-down success', fmt: P1, dir: 1 },
    { key: 'x_pd_ppa',       short: 'Pass-dn EPA',label:'Passing-down EPA',     fmt: S2, dir: 1 },
    { key: 'x_pd_expl',      short: 'Pass-dn expl',label:'Passing-down explosiveness', fmt: N2, dir: 1 },

    /* tendencies — no good or bad side, just what a team likes to do */
    { key: 'x_pass_d1',      short: '1st dn pass', label: 'Pass rate, first down', fmt: P0, dir: 0 },
    { key: 'x_pass_rz',      short: 'RZ pass',   label: 'Pass rate, red zone',  fmt: P0, dir: 0 },

    /* drives: how much of the field in front of them a team actually takes */
    { key: 'y_avail_pct',    short: 'Avail yds %', label: 'Share of available yards gained', fmt: P1, dir: 1 },
    { key: 'y_start',        short: 'Start',     label: 'Average starting field position', fmt: N1, dir: 1 },
    { key: 'y_drives',       short: 'Drives',    label: 'Drives counted',       fmt: N0, dir: 0 },

    /* luck — whole-team records, so they do not invert on the defensive view */
    { key: 'k_deserved',     short: 'Deserved W',label: 'Deserved wins',        fmt: N2, dir: 1, flip: false },
    { key: 'k_diff',         short: 'Diff',      label: 'Actual minus deserved wins', fmt: S2, dir: 0, flip: false },
    { key: 'k_close_w',      short: 'Close W',   label: 'One-score wins',       fmt: N0, dir: 1, flip: false },
    { key: 'k_close_pct',    short: 'Close %',   label: 'One-score win rate',   fmt: P0, dir: 0, flip: false },
    { key: 'k_fum',          short: 'Fum rec %', label: 'Share of fumbles recovered', fmt: P1, dir: 0, flip: false },
    { key: 'k_int',          short: 'INT rate',  label: 'Picks per opponent dropback', fmt: P1, dir: 0, flip: false },
    { key: 'k_tom',          short: 'TO margin', label: 'Turnover margin',      fmt: N0, dir: 1, flip: false }
  ];
  var MBY = {}; METRICS.forEach(function (m) { MBY[m.key] = m; });

  var COLSETS = [
    { name: 'Overall',   keys: ['sr_all', 'epa_all', 'explosive_rate', 'pass_rate', 'plays_per_game'] },
    { name: 'Passing',   keys: ['sr_pass', 'epa_pass', 'completion_rate', 'explosive_pass_rate', 'sack_rate'] },
    { name: 'Rushing',   keys: ['sr_run', 'epa_run', 'explosive_run_rate', 'stuff_rate'] },
    { name: 'Situation', keys: ['sr_early', 'sr_late', 'sr_standard', 'sr_passdown', 'sr_redzone'] },
    { name: 'Ratings',   keys: ['r_sp_overall', 'r_sp_side', 'r_fpi', 'r_elo', 'r_srs'] },
    { name: 'Adjusted',  keys: ['a_epa', 'a_success', 'a_explosive', 'a_rush_epa', 'a_pass_epa', 'a_line_yards'] },
    { name: 'Havoc',     keys: ['x_havoc', 'x_havoc_rush', 'x_havoc_pass', 'x_tfl', 'x_sacks', 'x_ints'] },
    { name: 'Run game',  keys: ['x_line_yards', 'x_second_level', 'x_open_field', 'x_stuff', 'x_power'] },
    { name: 'Downs',     keys: ['x_std_rate', 'x_std_succ', 'x_std_ppa', 'x_pd_succ', 'x_pd_ppa', 'x_pd_expl'] },
    { name: 'Tendencies',keys: ['pass_rate', 'x_pass_d1', 'x_pass_rz', 'plays_per_game'] },
    { name: 'Drives',    keys: ['y_avail_pct', 'y_start', 'y_drives'] },
    { name: 'Luck',      keys: ['k_deserved', 'k_diff', 'k_close_w', 'k_close_pct', 'k_fum', 'k_int', 'k_tom'] }
  ];
  var H2H_KEYS = ['sr_all', 'epa_all', 'explosive_rate', 'sr_run', 'sr_pass', 'epa_run', 'epa_pass',
    'sr_early', 'sr_passdown', 'sr_redzone', 'completion_rate', 'sack_rate', 'stuff_rate', 'pass_rate', 'plays_per_game'];

  var board = {
    cache: {}, seq: 0,
    side: 0, vs: null,
    confSide: 0, confSet: 0, confSort: 'sr_all', confAsc: false,
    side2: 0, set: 0, sort: 'sr_all', metric: 'sr_all', asc: false, q: '', conf: ''
  };
  var SIDES = ['Offense', 'Defense'];

  /* A rating like Elo or SP+ overall describes the whole team, so it does not
     invert when you switch to the defensive view the way a rate does. */
  function dirOf(m, side) {
    if (m.flip === false) return m.dir;
    return side === 'Defense' ? -m.dir : m.dir;
  }
  /* first click on a column should put the best team on top, whichever way
     "best" runs for that statistic on that side of the ball */
  function firstAsc(key, side, isNum) {
    if (!isNum) return true;
    var m = MBY[key];
    if (!m) return false;
    return dirOf(m, side) === -1;
  }

  function loadBoard(season, side) {
    var k = season + '|' + side;
    if (board.cache[k]) return Promise.resolve(board.cache[k]);
    /* one request per season and side, however many sections ask at once */
    board.pend = board.pend || {};
    if (!board.pend[k]) board.pend[k] = fetch('api/board?season=' + season + '&side=' + encodeURIComponent(side))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function (e) { delete board.pend[k]; throw e; });
    return board.pend[k]
      .then(function (j) {
        var numeric = ['games', 'plays'].concat(METRICS.map(function (m) { return m.key; }));
        function coerce(row) {
          numeric.forEach(function (c) {
            row[c] = (row[c] === null || row[c] === undefined) ? null : +row[c];
          });
          return row;
        }
        j.teams.forEach(function (r) { coerce(r); r._rk = {}; r._pc = {}; r._pool = {}; });
        j.conferences.forEach(function (r) { coerce(r); r.teams = +r.teams; });

        /* Ratings and adjusted metrics arrive as their own arrays. Folding the
           side-appropriate value onto each team row under a fixed key lets the
           ranking, tinting and sorting below treat them like any other column
           instead of needing a parallel code path. */
        var n_ = function (v) { return (v === null || v === undefined) ? null : +v; };
        var rmap = {}, amap = {}, off = side === 'Offense';
        (j.ratings || []).forEach(function (r) { rmap[r.team] = r; });
        (j.adjusted || []).forEach(function (r) { amap[r.team] = r; });
        j.teams.forEach(function (r) {
          var rt = rmap[r.team] || {}, ad = amap[r.team] || {};
          r.r_sp_overall = n_(rt.sp_overall);
          r.r_sp_side    = n_(off ? rt.sp_offense : rt.sp_defense);
          r.r_fpi        = n_(rt.fpi);
          r.r_elo        = n_(rt.elo);
          r.r_srs        = n_(rt.srs);
          r.a_epa        = n_(off ? ad.epa : ad.epa_allowed);
          r.a_success    = n_(off ? ad.success : ad.success_allowed);
          r.a_explosive  = n_(off ? ad.explosiveness : ad.explosiveness_allowed);
          r.a_rush_epa   = n_(off ? ad.rushing_epa : ad.rushing_epa_allowed);
          r.a_pass_epa   = n_(off ? ad.passing_epa : ad.passing_epa_allowed);
          r.a_line_yards = n_(off ? ad.line_yards : ad.line_yards_allowed);
        });

        /* The havoc/run-game/downs pack, the drive pack and the luck pack come
           back as their own arrays too. web_team_adv and web_available_yards
           are already asked for this side, so their numbers fold on as-is;
           luck is a whole-team record and carries flip:false above. */
        var xmap = {}, ymap = {}, kmap = {};
        (j.adv || []).forEach(function (r) { xmap[r.team] = r; });
        (j.drives || []).forEach(function (r) { ymap[r.team] = r; });
        (j.luck || []).forEach(function (r) { kmap[r.team] = r; });
        j.teams.forEach(function (r) {
          var x = xmap[r.team] || {}, y = ymap[r.team] || {}, k = kmap[r.team] || {};
          r.x_havoc        = n_(x.havoc);
          r.x_havoc_rush   = n_(x.havoc_rush);
          r.x_havoc_pass   = n_(x.havoc_pass);
          r.x_tfl          = n_(x.tfl);
          r.x_sacks        = n_(x.sacks);
          r.x_ints         = n_(x.ints);
          r.x_line_yards   = n_(x.line_yards);
          r.x_second_level = n_(x.second_level_yards);
          r.x_open_field   = n_(x.open_field_yards);
          r.x_stuff        = n_(x.stuff_rate);
          r.x_power        = n_(x.power_succ);
          r.x_std_rate     = n_(x.std_rate);
          r.x_std_succ     = n_(x.std_succ);
          r.x_std_ppa      = n_(x.std_ppa);
          r.x_std_expl     = n_(x.std_expl);
          r.x_pd_succ      = n_(x.pd_succ);
          r.x_pd_ppa       = n_(x.pd_ppa);
          r.x_pd_expl      = n_(x.pd_expl);
          r.x_pass_d1      = n_(x.pass_rate_d1);
          r.x_pass_rz      = n_(x.pass_rate_rz);
          r.y_avail_pct    = n_(y.available_pct);
          r.y_start        = n_(y.avg_start_field);
          r.y_drives       = n_(y.drives);
          r.k_deserved     = n_(k.deserved_wins);
          r.k_diff         = n_(k.luck_diff);
          r.k_close_w      = n_(k.close_wins);
          r.k_close_pct    = (k.close_games ? +k.close_wins / +k.close_games : null);
          r.k_fum          = n_(k.fum_rec_pct);
          r.k_int          = n_(k.int_rate);
          r.k_tom          = n_(k.to_margin);
          r.k_record       = (k.wins === undefined) ? null : (k.wins + '-' + k.losses);
        });
        j.hasAdjusted = (j.adjusted || []).length > 0;

        /* web_conferences aggregates the original packs on the server, play by
           play. The packs added above are not in it, so the conference row gets
           the plain average of its member schools instead — a per-team figure,
           which the note on that panel says out loud rather than passing it off
           as a pooled rate. */
        var EXTRA = ['x_havoc', 'x_havoc_rush', 'x_havoc_pass', 'x_tfl', 'x_sacks', 'x_ints',
          'x_line_yards', 'x_second_level', 'x_open_field', 'x_stuff', 'x_power',
          'x_std_rate', 'x_std_succ', 'x_std_ppa', 'x_std_expl', 'x_pd_succ', 'x_pd_ppa', 'x_pd_expl',
          'x_pass_d1', 'x_pass_rz', 'y_avail_pct', 'y_start', 'y_drives',
          'k_deserved', 'k_diff', 'k_close_w', 'k_close_pct', 'k_fum', 'k_int', 'k_tom'];
        var byConf = {};
        j.teams.forEach(function (r) {
          var c = (r.conference || '').trim();
          if (!byConf[c]) byConf[c] = [];
          byConf[c].push(r);
        });
        j.conferences.forEach(function (cr) {
          var mem = byConf[(cr.conference || '').trim()] || [];
          EXTRA.forEach(function (k) {
            var v = mem.map(function (r) { return r[k]; })
              .filter(function (x) { return x !== null && x !== undefined && !isNaN(x); });
            cr[k] = v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
          });
        });
        /* competition ranks (1, 2, 2, 4) with ties sharing a number */
        METRICS.forEach(function (m) {
          var d = dirOf(m, side) || 1;
          var vals = j.teams.filter(function (r) { return r[m.key] !== null; });
          vals.sort(function (a, b) { return (b[m.key] - a[m.key]) * d; });
          var last = null, lastRank = 0;
          vals.forEach(function (r, i) {
            if (last !== null && r[m.key] === last) { r._rk[m.key] = lastRank; }
            else { r._rk[m.key] = i + 1; lastRank = i + 1; last = r[m.key]; }
            r._pool[m.key] = vals.length;
            r._pc[m.key] = vals.length > 1 ? (vals.length - r._rk[m.key]) / (vals.length - 1) : 0.5;
          });
        });
        /* FBS median row for the conference table */
        var med = { conference: 'FBS median', teams: j.teams.length, _agg: true };
        METRICS.forEach(function (m) {
          var v = j.teams.map(function (r) { return r[m.key]; })
            .filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
          med[m.key] = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
        });
        j.median = med;
        board.cache[k] = j;
        return j;
      });
  }

  function teamRow(bd, name) {
    for (var i = 0; i < bd.teams.length; i++) if (bd.teams[i].team === name) return bd.teams[i];
    return null;
  }
  function tint(pc, neutral) {
    if (neutral || pc === null || pc === undefined) return '';
    var a = Math.abs(pc - 0.5) * 2 * 0.30;
    var c = pc >= 0.5 ? hex2rgb(css('--pos')) : hex2rgb(css('--neg'));
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  }

  function known(name) {
    return !!name && state.teams.some(function (t) { return t.team === name; });
  }
  /* most recent FBS opponent, so the panel arrives with something worth reading */
  function defaultOpponent() {
    var gl = (state.data && state.data.gamelog || [])
      .filter(function (g) { return g.season === state.season && known(g.opponent) && g.opponent !== state.team; })
      .sort(function (a, b) { return b.week - a.week; });
    return gl.length ? gl[0].opponent : null;
  }
  function pickTeam(name) {
    var inp = document.getElementById('teamInput');
    inp.value = name;
    loadTeam(name);
    document.querySelector('.hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- 05 · head to head ---- */
  function buildH2H() {
    var side = SIDES[board.side];
    segs(document.getElementById('h2hTabs'), ['Offense', 'Defense'], board.side,
      function (i) { board.side = i; buildH2H(); });
    var host = document.getElementById('h2hChart');
    var vsIn = document.getElementById('vsInput');
    host.innerHTML = '';
    if (!board.vs || board.vs === state.team) board.vs = defaultOpponent();
    if (vsIn.value !== (board.vs || '')) vsIn.value = board.vs || '';
    if (!board.vs) {
      host.appendChild(h('p', 'ax', 'Pick a second school above to line the two up.'));
      return;
    }
    var names = [state.team, board.vs];
    var seq = ++board.seq;
    loadBoard(state.season, side).then(function (bd) {
      if (seq !== board.seq) return;
      var A = teamRow(bd, names[0]), B = teamRow(bd, names[1]);
      host.innerHTML = '';
      if (!A || !B) { host.appendChild(h('p', 'ax', 'One of those schools has no plays logged in ' + state.season + '.')); return; }

      var lg = h('div', 'legend');
      lg.appendChild(mkKey(css('--s1'), names[0]));
      lg.appendChild(mkKey(css('--s2'), names[1]));
      var k3 = h('span', 'lk muted'); k3.textContent = 'bar length = place in the national order';
      lg.appendChild(k3);
      host.appendChild(lg);

      var rows = H2H_KEYS.map(function (k) { return MBY[k]; });
      var W = 940, MID = 250, GUT = 74, HALF = (W - MID) / 2 - GUT;
      var ROW = 30, TOP = 24, H = TOP + rows.length * ROW + 16;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
      var cx0 = GUT + HALF, cx1 = cx0 + MID;
      var C1 = css('--s1'), C2 = css('--s2');
      svg.appendChild(el('text', { x: GUT, y: TOP - 9, class: 'ax' }, names[0].toUpperCase()));
      svg.appendChild(el('text', { x: W - GUT, y: TOP - 9, 'text-anchor': 'end', class: 'ax' }, names[1].toUpperCase()));

      rows.forEach(function (m, i) {
        var y = TOP + i * ROW + ROW / 2, bh = 15;
        var g = el('g', {});
        g.appendChild(el('text', { x: (cx0 + cx1) / 2, y: y + 4, 'text-anchor': 'middle', class: 'lbl' }, m.label));
        [[A, C1, -1, cx0], [B, C2, 1, cx1]].forEach(function (t) {
          var r = t[0], color = t[1], sgnv = t[2], anchor = t[3];
          var v = r[m.key], pcv = r._pc[m.key];
          var txt = v === null ? '–' : m.fmt(v);
          if (m.dir && r._rk[m.key]) txt += '  #' + r._rk[m.key];
          g.appendChild(el('text', {
            x: sgnv < 0 ? GUT - 8 : W - GUT + 8, y: y + 4,
            'text-anchor': sgnv < 0 ? 'end' : 'start', class: 'num'
          }, txt));
          if (pcv === undefined || pcv === null) return;
          var w = Math.max(pcv * HALF, 1.5);
          g.appendChild(el('rect', {
            x: sgnv < 0 ? anchor - w : anchor, y: y - bh / 2, width: w, height: bh, rx: 3,
            fill: color, opacity: m.dir ? 1 : 0.55
          }));
        });
        var hit = el('rect', { x: 0, y: y - ROW / 2, width: W, height: ROW, class: 'hit' });
        bindTip(hit, '<b>' + m.label + '</b><br>' +
          names[0] + ': <b>' + (A[m.key] === null ? '–' : m.fmt(A[m.key])) + '</b>' +
          (A._rk[m.key] ? ' · ' + ord(A._rk[m.key]) + ' of ' + A._pool[m.key] : '') + '<br>' +
          names[1] + ': <b>' + (B[m.key] === null ? '–' : m.fmt(B[m.key])) + '</b>' +
          (B._rk[m.key] ? ' · ' + ord(B._rk[m.key]) + ' of ' + B._pool[m.key] : '') +
          (m.dir ? '' : '<br><span class="tv">a tendency, not a grade</span>'));
        g.appendChild(hit);
        svg.appendChild(g);
      });
      host.appendChild(svg);
      var note = h('p', 'tblnote');
      note.innerHTML = names[0] + ' ' + (side === 'Offense' ? 'offense' : 'defense') + ' on ' +
        A.plays.toLocaleString() + ' snaps over ' + A.games + ' game' + (A.games === 1 ? '' : 's') + '; ' +
        names[1] + ' on ' + B.plays.toLocaleString() + ' over ' + B.games + '. ' +
        'Pass rate and plays per game are shaded because neither has a better or worse side.';
      host.appendChild(note);
    }).catch(function (e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load the national pool. ' + e.message)); });
  }

  /* ---- shared: sortable table ---- */
  function sortTable(opts) {
    /* opts: host, cols, rows, sortKey, asc, onSort, rowClass, firstCell, tinted */
    var tb = opts.host; tb.innerHTML = '';
    var thead = document.createElement('thead'), tr = h('tr');
    opts.cols.forEach(function (c) {
      var th = h('th', null, c.head);
      if (c.key === opts.sortKey) th.className = 'sorted' + (opts.asc ? ' asc' : '');
      if (c.title) th.title = c.title;
      th.onclick = function () { opts.onSort(c.key, c.num); };
      tr.appendChild(th);
    });
    thead.appendChild(tr); tb.appendChild(thead);
    var tbody = document.createElement('tbody');
    opts.rows.forEach(function (r, i) {
      var tr2 = h('tr');
      if (opts.rowClass) { var rc = opts.rowClass(r, i); if (rc) tr2.className = rc; }
      opts.cols.forEach(function (c) { tr2.appendChild(c.cell(r, i)); });
      tbody.appendChild(tr2);
    });
    tb.appendChild(tbody);
  }
  function cmp(a, b, key, asc, isNum) {
    var x = a[key], y = b[key];
    if (isNum) {
      if (x === null || x === undefined || isNaN(x)) return 1;
      if (y === null || y === undefined || isNaN(y)) return -1;
      return asc ? x - y : y - x;
    }
    x = String(x || ''); y = String(y || '');
    return asc ? x.localeCompare(y) : y.localeCompare(x);
  }

  /* ---- 06 · conferences ---- */
  function buildConf() {
    var side = SIDES[board.confSide];
    segs(document.getElementById('confSideTabs'), ['Offense', 'Defense'], board.confSide,
      function (i) {
        board.confSide = i;
        board.confAsc = firstAsc(board.confSort, SIDES[i], board.confSort !== 'conference');
        buildConf();
      });
    segs(document.getElementById('confSetTabs'), COLSETS.map(function (s) { return s.name; }), board.confSet,
      function (i) { board.confSet = i; buildConf(); });
    var keys = COLSETS[board.confSet].keys;
    if (keys.indexOf(board.confSort) < 0 && ['conference', 'teams'].indexOf(board.confSort) < 0) {
      board.confSort = keys[0];
      board.confAsc = firstAsc(board.confSort, side, true);
    }
    var tb = document.getElementById('confTable');
    var note = document.getElementById('confNote');
    loadBoard(state.season, side).then(function (bd) {
      var myConf = (state.data && state.data.conference || '').trim();
      var rows = bd.conferences.slice();
      rows.sort(function (a, b) { return cmp(a, b, board.confSort, board.confAsc, board.confSort !== 'conference'); });
      rows.push(bd.median);
      var cols = [
        { head: '#', key: '_pos', num: true,
          title: 'Order in this table — click to sort by ' + MBY[keys[0]].label,
          cell: function (r, i) { return h('td', 'rk', r._agg ? '' : String(i + 1)); } },
        { head: 'Conference', key: 'conference', num: false, cell: function (r) { return h('td', 'tm', r.conference); } },
        { head: 'Teams', key: 'teams', num: true, cell: function (r) { return h('td', 'nd', String(r.teams)); } }
      ];
      keys.forEach(function (k) {
        var m = MBY[k];
        cols.push({
          head: m.short, key: k, num: true, title: m.label, cell: function (r) {
            return h('td', null, r[k] === null || r[k] === undefined ? '–' : m.fmt(r[k]));
          }
        });
      });
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: board.confSort, asc: board.confAsc,
        rowClass: function (r) { return r._agg ? 'agg' : (myConf && r.conference === myConf ? 'me' : ''); },
        onSort: function (k, isNum) {
          if (k === '_pos') {
            var d = keys[0];
            if (board.confSort === d) board.confAsc = !board.confAsc;
            else { board.confSort = d; board.confAsc = firstAsc(d, side, true); }
            buildConf();
            return;
          }
          if (board.confSort === k) board.confAsc = !board.confAsc;
          else { board.confSort = k; board.confAsc = firstAsc(k, side, isNum); }
          buildConf();
        }
      });
      var pooled = ['Overall', 'Passing', 'Rushing', 'Situation', 'Ratings', 'Adjusted']
        .indexOf(COLSETS[board.confSet].name) >= 0;
      note.innerHTML = (pooled
        ? 'Pooled from every snap a member school took on ' + (side === 'Offense' ? 'offense' : 'defense') +
          ' in ' + state.season + ', so a big conference does not out-weigh a small one team by team &mdash; it out-weighs it snap by snap. '
        : 'This pack is averaged across the member schools rather than pooled snap by snap, so every school in the ' +
          'conference counts the same regardless of how many plays it has run. ') +
        'The last row is the median FBS <em>team</em>, which is a different thing from the median conference. ' +
        (myConf ? state.team + '’s conference is outlined.' : '');
    }).catch(function (e) { tb.innerHTML = ''; note.textContent = 'Could not load conference data. ' + e.message; });
  }

  /* ---- 07 · the whole FBS ---- */
  function buildBoard() {
    var side = SIDES[board.side2];
    segs(document.getElementById('boardSideTabs'), ['Offense', 'Defense'], board.side2,
      function (i) {
        board.side2 = i;
        board.asc = firstAsc(board.sort, SIDES[i], ['team', 'conference'].indexOf(board.sort) < 0);
        buildBoard();
      });
    segs(document.getElementById('boardSetTabs'), COLSETS.map(function (s) { return s.name; }), board.set,
      function (i) { board.set = i; buildBoard(); });
    var keys = COLSETS[board.set].keys;
    if (keys.indexOf(board.sort) < 0 && ['team', 'conference', 'games'].indexOf(board.sort) < 0) {
      board.sort = keys[0];
      board.asc = firstAsc(board.sort, side, true);
    }
    var tb = document.getElementById('boardTable');
    var note = document.getElementById('boardNote');
    var cnt = document.getElementById('boardCount');

    loadBoard(state.season, side).then(function (bd) {
      var confSel = document.getElementById('boardConf');
      if (!confSel.options.length || confSel.dataset.season !== String(state.season)) {
        confSel.innerHTML = '';
        confSel.dataset.season = String(state.season);
        var all = document.createElement('option'); all.value = ''; all.textContent = 'All of FBS';
        confSel.appendChild(all);
        bd.conferences.map(function (c) { return c.conference; }).sort().forEach(function (c) {
          var o = document.createElement('option'); o.value = c; o.textContent = c; confSel.appendChild(o);
        });
        confSel.value = board.conf;
      }
      var q = board.q.toLowerCase();
      var rows = bd.teams.filter(function (r) {
        if (board.conf && r.conference !== board.conf) return false;
        if (q && r.team.toLowerCase().indexOf(q) < 0 && (r.conference || '').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var isNum = board.sort !== 'team' && board.sort !== 'conference';
      rows.sort(function (a, b) {
        var c = cmp(a, b, board.sort, board.asc, isNum);
        return c !== 0 ? c : a.team.localeCompare(b.team);
      });
      /* The rank column follows a chosen statistic rather than whatever the
         table happens to be ordered by, so sorting alphabetically still shows
         each team's place in that statistic — and clicking Rk puts the ranked
         order back, which is the whole point of having the column. */
      if (MBY[board.sort]) board.metric = board.sort;
      if (keys.indexOf(board.metric) < 0) board.metric = keys[0];
      var rankM = MBY[board.metric];
      var cols = [
        {
          head: rankM.dir ? 'Rk' : '#', key: '_rank', num: true,
          title: (rankM.dir ? 'National rank in ' + rankM.label : 'Order in this list')
            + ' — click to sort by ' + rankM.label,
          cell: function (r, i) {
            if (rankM.dir && r._rk[board.metric]) return h('td', 'rk', String(r._rk[board.metric]));
            return h('td', 'rk', String(i + 1));
          }
        },
        {
          head: 'School', key: 'team', num: false, cell: function (r) {
            var td = h('td', 'tm');
            var b = h('button', null, r.team);
            b.onclick = function () { pickTeam(r.team); };
            td.appendChild(b); return td;
          }
        },
        { head: 'Conference', key: 'conference', num: false, cell: function (r) { return h('td', 'conf', r.conference || '–'); } },
        { head: 'G', key: 'games', num: true, title: 'Games played', cell: function (r) { return h('td', 'nd', String(r.games)); } }
      ];
      keys.forEach(function (k) {
        var m = MBY[k];
        cols.push({
          head: m.short, key: k, num: true, title: m.label + (m.dir ? '' : ' — a tendency, not a grade'),
          cell: function (r) {
            var td = h('td', null, r[k] === null ? '–' : m.fmt(r[k]));
            var bg = tint(r._pc[k], !m.dir);
            if (bg) td.style.background = bg;
            if (m.dir && r._rk[k]) td.title = ord(r._rk[k]) + ' of ' + r._pool[k];
            return td;
          }
        });
      });
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: board.sort, asc: board.asc,
        rowClass: function (r) { return r.team === state.team ? 'me' : ''; },
        onSort: function (k, num) {
          if (k === '_rank') {
            /* back to the ranked order, best first; a second click reverses it */
            if (board.sort === board.metric) board.asc = !board.asc;
            else { board.sort = board.metric; board.asc = firstAsc(board.metric, side, true); }
            buildBoard();
            return;
          }
          if (board.sort === k) board.asc = !board.asc;
          else { board.sort = k; board.asc = firstAsc(k, side, num); }
          buildBoard();
        }
      });
      cnt.textContent = rows.length + ' of ' + bd.teams.length + ' teams';
      var qualified = bd.teams.filter(function (r) { return r.qualified; }).length;
      if (COLSETS[board.set].name === 'Adjusted' && !bd.hasAdjusted) {
        note.innerHTML = 'Opponent-adjusted metrics are not published for ' + state.season + ' yet — ' +
          'CollegeFootballData waits until a season has enough results for the adjustment to mean anything, ' +
          'so this tab fills in a few weeks into the year. Every other tab is live. ' +
          'Switch the season above to see the adjusted numbers for a completed year.';
        return;
      }
      if (COLSETS[board.set].name === 'Ratings') {
        note.innerHTML = 'SP+ and FPI are predictive; Elo is a running ledger of results. ' +
          'SP+ O/D follows the Offense / Defense toggle &mdash; on the defensive view it is points allowed, so a low number ranks first. ' +
          'A blank column is a system that has not published for this season yet.';
        return;
      }
      var setName = COLSETS[board.set].name;
      if (setName === 'Havoc') {
        note.innerHTML = 'Havoc counts the snaps a defense wrecks: runs stopped behind the line, sacks, ' +
          'and takeaways, over every scrimmage snap. Passes defensed are not in the play-by-play feed, ' +
          'so they are not in here &mdash; this runs a little lower than havoc figures that include them. ' +
          'On the Offense view these are plays wrecked <em>against</em> that offense, so a low number ranks first.';
        return;
      }
      if (setName === 'Run game') {
        note.innerHTML = 'Line yards credit the carry the way the line earned it &mdash; full credit to four yards, ' +
          'half credit from five to ten, none past that, and a loss charged back at 120%. Second-level and ' +
          'open-field yards are the parts past the line: yards five to ten, and everything beyond ten. ' +
          'Power is third and fourth down with two or fewer to go.';
        return;
      }
      if (setName === 'Downs') {
        note.innerHTML = 'Standard downs are first down, second and seven or less, third or fourth and four or less. ' +
          'Everything else is a passing down, where the defense knows what is coming. ' +
          'The gap between the two columns is usually the more telling number.';
        return;
      }
      if (setName === 'Tendencies') {
        note.innerHTML = 'Tendencies have no good or bad side, so these columns are not tinted &mdash; they are ' +
          'what a team likes to do, not how well it does it. First-down and red-zone pass rates are where ' +
          'identity shows up most clearly.';
        return;
      }
      if (setName === 'Drives') {
        note.innerHTML = 'Available yards is the share of the field in front of a drive that the offense actually takes, ' +
          'so a short field is not rewarded twice. Garbage time and one-snap end-of-half drives are left out. ' +
          'Start is the average yard line a drive begins on.';
        return;
      }
      if (setName === 'Luck') {
        note.innerHTML = 'Deserved wins add up each game&rsquo;s postgame win expectancy &mdash; the record a team ' +
          'earned from how the game actually went. Diff is actual wins minus that. Fumble recovery rate and ' +
          'defensive interception rate are the two things that swing hardest year to year and stick least, ' +
          'so they are shown untinted: they describe luck, not quality. These are whole-team records and do ' +
          'not flip with the Offense / Defense toggle.';
        return;
      }
      note.innerHTML = 'Ranks run 1 to ' + bd.teams.length + ' across every FBS team with a snap logged in ' + state.season +
        (qualified < bd.teams.length ? ' (' + (bd.teams.length - qualified) + ' of them on fewer plays than the site normally ranks, so read those loosely)' : '') +
        '. Ties share a number. On the defensive view the direction is reversed &mdash; a low success rate allowed is a high rank. ' +
        'Click a school to load its page.';
    }).catch(function (e) { tb.innerHTML = ''; note.textContent = 'Could not load the national board. ' + e.message; });
  }

  /* ---- percentile bars: one row per measure, length = place in FBS ---- */
  function pctlBars(rows) {
    var W = 940, LBL = 250, PAD = 150, RIGHT = W - PAD, TRACK = RIGHT - LBL;
    var ROW = 28, TOP = 30, H = TOP + rows.length * ROW + 30;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    var POS = css('--pos'), NEG = css('--neg');

    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var x = LBL + t * TRACK;
      svg.appendChild(el('line', { x1: x, x2: x, y1: TOP - 12, y2: TOP + rows.length * ROW, class: t === 0.5 ? 'base' : 'gl' }));
      svg.appendChild(el('text', { x: x, y: TOP + rows.length * ROW + 18, 'text-anchor': 'middle', class: 'ax' },
        t === 0 ? 'last' : t === 1 ? 'best' : t === 0.5 ? 'median' : ''));
    });

    rows.forEach(function (r, i) {
      var y = TOP + i * ROW + ROW / 2, bh = 14;
      var g = el('g', {});
      g.appendChild(el('text', { x: LBL - 14, y: y + 4, 'text-anchor': 'end', class: 'lbl' }, r.label));
      if (r.p === null || r.p === undefined) {
        g.appendChild(el('text', { x: LBL + 6, y: y + 4, class: 'ax' }, r.empty || 'not published yet'));
      } else {
        var w = Math.max(r.p * TRACK, 2);
        g.appendChild(el('rect', { x: LBL, y: y - bh / 2, width: w, height: bh, rx: 3,
          fill: r.p >= 0.5 ? POS : NEG }));
      }
      g.appendChild(el('text', { x: RIGHT + 12, y: y + 4, 'text-anchor': 'start', class: 'num' },
        (r.value === null || r.value === undefined ? '–' : r.fmt(r.value)) +
        (r.rank ? '   ' + ord(r.rank) + ' of ' + r.pool : '')));
      var hit = el('rect', { x: 0, y: y - ROW / 2, width: W, height: ROW, class: 'hit' });
      bindTip(hit, '<b>' + r.label + '</b><br>' +
        (r.value === null || r.value === undefined ? 'not published for this season' :
          r.fmt(r.value) + (r.rank ? '<br>Rank <b>' + r.rank + '</b> of ' + r.pool : '')) +
        (r.note ? '<br><span class="tv">' + r.note + '</span>' : ''));
      g.appendChild(hit);
      svg.appendChild(g);
    });
    return svg;
  }
  function pctl(rank, pool) {
    if (!rank || !pool || pool < 2) return null;
    return (pool - rank) / (pool - 1);
  }

  /* ---- 01 · the ratings ---- */
  function buildRatings() {
    var host = document.getElementById('ratingChart');
    var note = document.getElementById('ratingNote');
    host.innerHTML = '';
    var r = (state.data.ratings || []).filter(function (x) { return x.season === state.season; })[0];
    if (!r) {
      host.appendChild(h('p', 'ax', 'No published ratings for ' + state.team + ' in ' + state.season + '.'));
      note.textContent = '';
      return;
    }
    var pool = +r.pool || 0;
    var rows = [
      { label: 'SP+ overall', value: r.sp_overall, fmt: N1, rank: r.sp_overall_rank, pool: pool,
        note: 'Predicted points of margin against an average team' },
      { label: 'SP+ offense', value: r.sp_offense, fmt: N1, rank: r.sp_offense_rank, pool: pool,
        note: 'Points this offense would score on an average defense' },
      { label: 'SP+ defense', value: r.sp_defense, fmt: N1, rank: r.sp_defense_rank, pool: pool,
        note: 'Points allowed to an average offense — lower is better' },
      { label: 'FPI', value: r.fpi, fmt: N1, rank: r.fpi_rank, pool: pool },
      { label: 'Elo', value: r.elo, fmt: N0, rank: r.elo_rank, pool: pool,
        note: 'A running ledger of results, not a forecast' },
      { label: 'SRS', value: r.srs, fmt: N1, rank: r.srs_rank, pool: pool }
    ];
    rows.forEach(function (x) { x.p = pctl(x.rank, x.pool); });
    host.appendChild(pctlBars(rows));

    var bits = [];
    if (r.sp_overall_rank && r.elo_rank && Math.abs(r.sp_overall_rank - r.elo_rank) >= 15) {
      bits.push('SP+ has them ' + ord(r.sp_overall_rank) + ' while Elo has them ' + ord(r.elo_rank) +
        ' — a gap that size usually means results and underlying play are telling different stories.');
    }
    if (r.fpi_sos_rank) bits.push('FPI rates the schedule played ' + ord(r.fpi_sos_rank) + ' hardest in the country.');
    if (r.fpi_strength_of_record_rank) bits.push('Strength of record: ' + ord(r.fpi_strength_of_record_rank) + '.');
    note.innerHTML = bits.join(' ') || 'Bar length is place in the national order, not the raw value — the four systems are on different scales.';
  }

  /* ---- 02 · against the number ---- */
  function buildMarket() {
    var host = document.getElementById('mktChart');
    var tb = document.getElementById('mktTable');
    var note = document.getElementById('mktNote');
    host.innerHTML = ''; tb.innerHTML = '';
    var rows = (state.data.expectation || [])
      .filter(function (x) { return x.season === state.season; })
      .sort(function (a, b) { return a.week - b.week; });
    var played = rows.filter(function (x) { return x.played && x.cover_margin !== null; });
    if (!rows.length) {
      host.appendChild(h('p', 'ax', 'No scheduled games on file for ' + state.season + '.'));
      note.textContent = ''; return;
    }

    if (played.length) {
      var W = 940, LBL = 210, PAD = 80, RIGHT = W - PAD, TRACK = RIGHT - LBL;
      var ROW = 30, TOP = 30, H = TOP + played.length * ROW + 34;
      var lim = 0;
      played.forEach(function (g) { lim = Math.max(lim, Math.abs(+g.cover_margin)); });
      lim = Math.max(Math.ceil(lim / 5) * 5, 10);
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
      var mid = LBL + TRACK / 2, POS = css('--pos'), NEG = css('--neg');
      [-1, -0.5, 0, 0.5, 1].forEach(function (t) {
        var x = mid + t * TRACK / 2;
        svg.appendChild(el('line', { x1: x, x2: x, y1: TOP - 12, y2: TOP + played.length * ROW, class: t === 0 ? 'base' : 'gl' }));
        svg.appendChild(el('text', { x: x, y: TOP + played.length * ROW + 18, 'text-anchor': 'middle', class: 'ax' },
          t === 0 ? 'met the number' : (t > 0 ? '+' : '') + Math.round(t * lim)));
      });
      played.forEach(function (g, i) {
        var y = TOP + i * ROW + ROW / 2, cm = +g.cover_margin;
        var gg = el('g', {});
        gg.appendChild(el('text', { x: LBL - 14, y: y + 4, 'text-anchor': 'end', class: 'lbl' },
          (g.is_home ? 'vs ' : 'at ') + g.opponent));
        var d = Math.max(-1, Math.min(1, cm / lim)) / 2, w = Math.abs(d) * TRACK;
        gg.appendChild(el('rect', { x: d >= 0 ? mid : mid - w, y: y - 7, width: Math.max(w, 2), height: 14, rx: 3,
          fill: cm >= 0 ? POS : NEG }));
        gg.appendChild(el('text', { x: RIGHT + 12, y: y + 4, 'text-anchor': 'start', class: 'num' }, sgn(cm, 1)));
        var hit = el('rect', { x: 0, y: y - ROW / 2, width: W, height: ROW, class: 'hit' });
        bindTip(hit, '<b>' + (g.is_home ? 'vs ' : 'at ') + g.opponent + '</b> · week ' + g.week + '<br>' +
          'Final ' + g.points + '–' + g.points_allowed + ' (' + sgn(g.margin, 0) + ')<br>' +
          'Line expected ' + sgn(g.expected_margin, 1) + '<br>' +
          '<b>' + (cm >= 0 ? 'Beat the number by ' : 'Missed it by ') + num(Math.abs(cm), 1) + '</b>' +
          (g.total_vs_line !== null ? '<br>Total ' + g.total_points + ' vs ' + num(g.over_under, 1) +
            ' (' + sgn(g.total_vs_line, 1) + ')' : '') +
          (g.elo_swing !== null ? '<br><span class="tv">Elo ' + sgn(g.elo_swing, 0) + '</span>' : ''));
        gg.appendChild(hit);
        svg.appendChild(gg);
      });
      var lg = h('div', 'legend');
      lg.appendChild(mkKey(POS, 'beat the closing line'));
      lg.appendChild(mkKey(NEG, 'fell short of it'));
      host.appendChild(lg);
      host.appendChild(svg);
    } else {
      host.appendChild(h('p', 'ax', 'No completed games with a closing line yet this season.'));
    }

    var head = ['Wk', 'Opponent', 'Result', 'Margin', 'Line', 'Cover', 'O/U', 'Total', 'Elo', 'Wx'];
    var tr = h('tr'); head.forEach(function (x) { tr.appendChild(h('th', null, x)); });
    var th = document.createElement('thead'); th.appendChild(tr); tb.appendChild(th);
    var tbody = document.createElement('tbody');
    rows.forEach(function (g) {
      var r2 = h('tr');
      if (!g.played) r2.className = 'agg';
      var wx = g.temperature === null ? '–' :
        num(g.temperature, 0) + '°' + (g.weather_condition ? ' ' + g.weather_condition : '');
      [g.week,
       (g.is_home ? 'vs ' : 'at ') + g.opponent,
       g.played ? g.points + '–' + g.points_allowed : 'upcoming',
       g.played ? sgn(g.margin, 0) : '–',
       g.expected_margin === null ? '–' : sgn(g.expected_margin, 1),
       g.cover_margin === null ? '–' : sgn(g.cover_margin, 1),
       g.over_under === null ? '–' : num(g.over_under, 1),
       g.total_points === null ? '–' : String(g.total_points),
       g.elo_swing === null ? '–' : sgn(g.elo_swing, 0),
       wx
      ].forEach(function (v, i) {
        var td = h('td', null, v === null || v === undefined ? '–' : String(v));
        if (i === 5 && g.cover_margin !== null) {
          td.style.color = +g.cover_margin >= 0 ? css('--pos') : css('--neg');
        }
        r2.appendChild(td);
      });
      tbody.appendChild(r2);
    });
    tb.appendChild(tbody);

    var covers = played.filter(function (g) { return +g.cover_margin > 0; }).length;
    var pushes = played.filter(function (g) { return +g.cover_margin === 0; }).length;
    var avg = played.length ? played.reduce(function (a, g) { return a + +g.cover_margin; }, 0) / played.length : null;
    note.innerHTML = played.length
      ? '<b>' + covers + '–' + (played.length - covers - pushes) + (pushes ? '–' + pushes : '') +
        '</b> against the closing spread, by an average of <b>' + sgn(avg, 1) + '</b> points a game. ' +
        'The line is the median across every book in the feed, so a half-point disagreement between sportsbooks does not swing it. ' +
        'Grey rows are games not yet played, shown with the current number.'
      : 'Lines are the median across every book in the feed. Grey rows are games not yet played.';
  }

  /* ---- 04 · adjusted for opponent ---- */
  function buildAdjusted() {
    var host = document.getElementById('adjChart');
    var note = document.getElementById('adjNote');
    segs(document.getElementById('adjTabs'), ['Offense', 'Defense'], state.adjSide,
      function (i) { state.adjSide = i; buildAdjusted(); });
    var offs = state.adjSide === 0;
    host.innerHTML = '';
    var a = (state.data.adjusted || []).filter(function (x) { return x.season === state.season; })[0];
    if (!a) {
      var seasons = (state.data.adjusted || []).map(function (x) { return x.season; }).sort();
      host.appendChild(h('p', 'ax',
        'CollegeFootballData has not published opponent-adjusted metrics for ' + state.season + ' yet — ' +
        'they need a few weeks of results before the adjustment means anything.' +
        (seasons.length ? ' Available for ' + seasons.join(', ') + '; switch the season above to see them.' : '')));
      note.textContent = '';
      return;
    }
    var pool = +a.pool || 0;
    var rows = offs ? [
      { label: 'Adjusted EPA', value: a.epa, fmt: N3, rank: a.epa_rank },
      { label: 'Adjusted success rate', value: a.success, fmt: P1, rank: a.success_rank },
      { label: 'Adjusted explosiveness', value: a.explosiveness, fmt: N2, rank: a.explosiveness_rank },
      { label: 'Adjusted rushing EPA', value: a.rushing_epa, fmt: N3, rank: a.rushing_epa_rank },
      { label: 'Adjusted passing EPA', value: a.passing_epa, fmt: N3, rank: a.passing_epa_rank },
      { label: 'Line yards', value: a.line_yards, fmt: N2, rank: a.line_yards_rank,
        note: 'Yards on a run credited to the blocking, not the back' },
      { label: 'Second level yards', value: a.second_level_yards, fmt: N2, rank: a.second_level_yards_rank,
        note: 'Yards earned between five and ten past the line' },
      { label: 'Open field yards', value: a.open_field_yards, fmt: N2, rank: a.open_field_yards_rank,
        note: 'Everything past ten yards — the back, not the blocking' }
    ] : [
      { label: 'Adjusted EPA allowed', value: a.epa_allowed, fmt: N3, rank: a.epa_allowed_rank },
      { label: 'Adjusted SR allowed', value: a.success_allowed, fmt: P1, rank: a.success_allowed_rank },
      { label: 'Adjusted explosiveness allowed', value: a.explosiveness_allowed, fmt: N2, rank: a.explosiveness_allowed_rank },
      { label: 'Adjusted rushing EPA allowed', value: a.rushing_epa_allowed, fmt: N3, rank: null },
      { label: 'Adjusted passing EPA allowed', value: a.passing_epa_allowed, fmt: N3, rank: null },
      { label: 'Line yards allowed', value: a.line_yards_allowed, fmt: N2, rank: null },
      { label: 'Second level yards allowed', value: a.second_level_yards_allowed, fmt: N2, rank: null },
      { label: 'Open field yards allowed', value: a.open_field_yards_allowed, fmt: N2, rank: null }
    ];
    rows.forEach(function (x) { x.pool = pool; x.p = pctl(x.rank, pool); x.empty = 'not ranked'; });
    host.appendChild(pctlBars(rows));
    note.innerHTML = 'Adjusted for the quality of opponent faced, so these move independently of the raw rates in the panel above. ' +
      'Where a team is well ahead of its raw rank, it has been beating good defenses; well behind, and the schedule has been doing some of the work.';
  }

  /* ---- 08 · who did it ---- */
  var PLAYER_SETS = [
    { name: 'Passing', gate: 'pass_att', cols: [
      ['pass_comp', 'Cmp'], ['pass_att', 'Att'], ['comp_pct', 'Cmp%'], ['pass_yds', 'Yds'],
      ['yards_per_att', 'Y/A'], ['pass_td', 'TD'], ['pass_int', 'INT']] },
    { name: 'Rushing', gate: 'rush_att', cols: [
      ['rush_att', 'Car'], ['rush_yds', 'Yds'], ['yards_per_carry', 'Y/C'],
      ['rush_td', 'TD'], ['rush_long', 'Long']] },
    { name: 'Receiving', gate: 'rec', cols: [
      ['rec', 'Rec'], ['rec_yds', 'Yds'], ['yards_per_catch', 'Y/R'],
      ['rec_td', 'TD'], ['rec_long', 'Long']] },
    { name: 'Defense', gate: 'tackles', cols: [
      ['tackles', 'Tot'], ['tackles_solo', 'Solo'], ['tfl', 'TFL'], ['sacks', 'Sack'],
      ['pass_defended', 'PD'], ['qb_hurries', 'Hur'], ['ints_made', 'INT']] }
  ];

  function buildPlayers() {
    var tb = document.getElementById('plTable');
    var note = document.getElementById('plNote');
    var cnt = document.getElementById('plCount');
    segs(document.getElementById('plTabs'), PLAYER_SETS.map(function (s) { return s.name; }), state.plTab,
      function (i) { state.plTab = i; state.plSort = null; buildPlayers(); });
    var set = PLAYER_SETS[state.plTab];
    if (!state.plSort || (set.cols.concat([['athlete', '']])).every(function (c) { return c[0] !== state.plSort; })) {
      state.plSort = set.cols[1] ? set.cols[1][0] : set.cols[0][0];
      state.plAsc = false;
    }
    var key = state.team + '|' + state.season;
    if (state.players && state.players.key === key) return paint(state.players.rows);
    tb.innerHTML = ''; cnt.textContent = ''; note.textContent = 'Loading the game books…';
    fetch('api/players?team=' + encodeURIComponent(state.team) + '&season=' + state.season)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var rows = (j.players || []).map(function (p) {
          for (var k in p) if (k !== 'athlete' && k !== 'position') p[k] = p[k] === null ? null : +p[k];
          return p;
        });
        state.players = { key: key, rows: rows };
        if (state.team + '|' + state.season === key) paint(rows);
      })
      .catch(function (e) { note.textContent = 'Could not load player stats. ' + e.message; });

    function paint(all) {
      var rows = all.filter(function (p) { return (p[set.gate] || 0) > 0; });
      rows.sort(function (a, b) {
        var c = cmp(a, b, state.plSort, state.plAsc, state.plSort !== 'athlete' && state.plSort !== 'position');
        return c !== 0 ? c : String(a.athlete).localeCompare(String(b.athlete));
      });
      var cols = [
        { head: '#', key: '_pos', num: true,
          title: 'Order in this table — click to sort by ' + set.cols[1][1],
          cell: function (r, i) { return h('td', 'rk', String(i + 1)); } },
        { head: 'Player', key: 'athlete', num: false, cell: function (r) { var td = h('td', 'tm'); td.appendChild(playerLink(r.athlete, r.athlete_id)); return td; } },
        { head: 'Pos', key: 'position', num: false, cell: function (r) { return h('td', 'conf', r.position || '–'); } },
        { head: 'G', key: 'games', num: true, cell: function (r) { return h('td', 'nd', String(r.games)); } }
      ];
      set.cols.forEach(function (c) {
        cols.push({
          head: c[1], key: c[0], num: true, cell: function (r) {
            var v = r[c[0]];
            if (v === null || v === undefined) return h('td', 'nd', '–');
            var txt = c[0] === 'comp_pct' ? pct(v, 1)
              : (c[0].indexOf('yards_per') === 0 ? num(v, 1) : num(v, 0));
            return h('td', null, txt);
          }
        });
      });
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: state.plSort, asc: state.plAsc,
        onSort: function (k, isNum) {
          if (k === '_pos') {
            var d = set.cols[1] ? set.cols[1][0] : set.cols[0][0];
            if (state.plSort === d) state.plAsc = !state.plAsc;
            else { state.plSort = d; state.plAsc = false; }
            buildPlayers();
            return;
          }
          if (state.plSort === k) state.plAsc = !state.plAsc;
          else { state.plSort = k; state.plAsc = !isNum; }
          buildPlayers();
        }
      });
      cnt.textContent = rows.length + ' player' + (rows.length === 1 ? '' : 's');
      note.innerHTML = 'Season totals from the official game books, ' + state.season + '. ' +
        'A player appears in a tab only if he has a snap in that column &mdash; a quarterback with carries shows up under Rushing too.';
    }
  }


  /* =====================================================================
     Phase 5a: schedule-adjusted numbers and week-by-week trends.
     Every offense and defense is re-rated against the strength of what it
     faced (iterated until the ratings settle), so a number earned against
     Georgia counts for more than the same number against an FCS team.
     ===================================================================== */
  var XM = {
    epa: ['EPA per play', 's2'], sr: ['Success rate', 'p1'], expl: ['Explosive play rate', 'p1'],
    epa_pass: ['EPA per dropback', 's2'], epa_run: ['EPA per run', 's2'], ppd: ['Points per drive', 'n2'], havoc: ['Havoc rate', 'p1']
  };
  var XM_ORDER = ['epa', 'sr', 'expl', 'epa_pass', 'epa_run', 'ppd', 'havoc'];
  function xGet(name, params) {
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return scGet('api/x/' + name + '?' + q);
  }
  /* is a higher number better for this side? */
  function xHigherBetter(side, metric) { return (side === 'Offense') === (metric !== 'havoc'); }
  function xRankBg(rk, pool) { return rk && pool > 1 ? shade(1 - (rk - 1) / (pool - 1)) : 'transparent'; }

  function buildAdj() {
    var host = document.getElementById('adjBody'); if (!host) return;
    host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading…'));
    var team = state.team, s = state.season;
    xGet('adj', { team: team, season: s }).then(function (rows) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      if (!rows || !rows.length) { host.appendChild(h('p', 'ax', 'No schedule-adjusted numbers for ' + team + ' in ' + s + ' yet.')); return; }
      var M = { Offense: {}, Defense: {} };
      rows.forEach(function (r) { (M[r.side] || {})[r.metric] = r; });
      var cards = h('div', 'excards');
      ['Offense', 'Defense'].forEach(function (side) {
        var r = M[side].epa; if (!r) return;
        var c = h('div', 'excard');
        c.appendChild(h('p', 'exl', side + ', EPA per play, schedule-adjusted'));
        c.appendChild(h('p', 'exv', '#' + r.adj_rank + ' of ' + r.pool));
        var mv = r.raw_rank - r.adj_rank;
        c.appendChild(h('p', 'exr', 'Raw #' + r.raw_rank + (mv ? ' · ' + (mv > 0 ? 'up ' : 'down ') + Math.abs(mv) + ' once the schedule is counted' : ' · the schedule changes nothing')));
        c.style.boxShadow = 'inset 4px 0 0 ' + xRankBg(r.adj_rank, r.pool);
        cards.appendChild(c);
      });
      host.appendChild(cards);
      var T = tbl(['Measure', 'Offense, raw', 'Offense, adjusted', 'Defense, raw', 'Defense, adjusted']);
      XM_ORDER.forEach(function (k) {
        var tr = h('tr'); tr.appendChild(td('pclab', XM[k][0] + (k === 'havoc' ? ' (forced on D, allowed on O)' : '')));
        ['Offense', 'Defense'].forEach(function (side) {
          var r = M[side][k];
          if (!r) { tr.appendChild(td('nd', '–')); tr.appendChild(td('nd', '–')); return; }
          var a = h('td', 'nd'); a.innerHTML = scFmt(XM[k][1], r.raw) + ' <span class="fdrk">#' + r.raw_rank + '</span>'; tr.appendChild(a);
          var b = h('td', 'nd pcshade'), mv = r.raw_rank - r.adj_rank;
          b.innerHTML = '<b>' + scFmt(XM[k][1], r.adj) + '</b> <span class="fdrk">#' + r.adj_rank + '</span>' +
            (Math.abs(mv) >= 5 ? ' <span class="adjmv ' + (mv > 0 ? 'up' : 'dn') + '">' + (mv > 0 ? '▲' : '▼') + Math.abs(mv) + '</span>' : '');
          b.style.background = xRankBg(r.adj_rank, r.pool);
          b.title = side + ' ' + XM[k][0].toLowerCase() + ': ' + scFmt(XM[k][1], r.raw) + ' as played, ' + scFmt(XM[k][1], r.adj) + ' against an average FBS schedule (FBS average ' + scFmt(XM[k][1], r.nat) + ').';
          tr.appendChild(b);
        });
        T.tb.appendChild(tr);
      });
      host.appendChild(T.wrap);
      host.appendChild(h('p', 'tblnote', 'Adjusted = what the number would be against an average FBS opponent. Each team\'s offense is credited for the defenses it faced and each defense for the offenses it faced, recalculated until the ratings settle (FCS opponents are rated as one pooled team). ▲/▼ = places moved from the raw rank. Ranks among ' + ((M.Offense.epa || {}).pool || 'all') + ' FBS teams; #1 is best on either side of the ball.'));
    }).catch(function (e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }

  state.trSide = state.trSide || 0; state.trMetric = state.trMetric || 'epa';
  function buildTrend() {
    var host = document.getElementById('trendBody'); if (!host) return;
    var team = state.team, s = state.season;
    var ctl = h('div', 'subctl trctl'), sideSeg = h('div', 'segs'), metSeg = h('div', 'segs');
    ctl.appendChild(sideSeg); ctl.appendChild(metSeg);
    host.innerHTML = ''; host.appendChild(ctl);
    var chart = h('div', 'trchart'); host.appendChild(chart);
    var note = h('p', 'tblnote'); host.appendChild(note);
    chart.appendChild(h('p', 'ax', 'Loading…'));
    var keys = ['epa', 'sr', 'expl', 'ppd', 'havoc'];
    segs(sideSeg, ['Offense', 'Defense'], state.trSide, function (i) { state.trSide = i; buildTrend(); });
    segs(metSeg, keys.map(function (k) { return XM[k][0]; }), keys.indexOf(state.trMetric), function (i) { state.trMetric = keys[i]; buildTrend(); });
    xGet('trend', { team: team, season: s }).then(function (j) {
      if (team !== state.team || s !== state.season) return;
      chart.innerHTML = '';
      var side = state.trSide ? 'Defense' : 'Offense', met = state.trMetric, f = XM[met][1];
      var byG = {}; (j.rows || []).forEach(function (r) { if (r[1] === side && r[2] === met) byG[r[0]] = { n: r[3], raw: +r[4], adj: +r[5] }; });
      var games = (j.games || []).filter(function (g) { return byG[g.id]; });
      if (!games.length) { chart.appendChild(h('p', 'ax', 'No games charted yet.')); return; }
      var nat = j.nat ? +j.nat[met] : null, up = xHigherBetter(side, met);
      var W = 900, H = 330, L = 64, R = 60, T = 26, B = 70, n = games.length;
      var vals = []; games.forEach(function (g) { vals.push(byG[g.id].raw, byG[g.id].adj); }); if (nat !== null) vals.push(nat);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.12 || 0.05; lo -= pad; hi += pad;
      function X(i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); }
      function Y(v) { var t = (v - lo) / (hi - lo); if (!up) t = 1 - t; return T + (1 - t) * (H - T - B); }
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'trsvg', role: 'img', 'aria-label': side + ' ' + XM[met][0] + ' by game' });
      for (var k = 0; k <= 4; k++) {
        var v = lo + (hi - lo) * k / 4, y = Y(v);
        svg.appendChild(el('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: css('--line'), 'stroke-width': 1 }));
        svg.appendChild(el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', class: 'ax', style: 'font-size:12px' }, scFmt(f, v)));
      }
      svg.appendChild(el('text', { x: 6, y: T - 8, class: 'ax', style: 'font-size:11.5px;letter-spacing:.06em' }, 'BETTER ↑'));
      if (nat !== null) {
        svg.appendChild(el('line', { x1: L, x2: W - R, y1: Y(nat), y2: Y(nat), stroke: css('--muted'), 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
        svg.appendChild(el('text', { x: W - R, y: Y(nat) - 6, 'text-anchor': 'end', class: 'ax', style: 'font-size:12px' }, 'FBS average ' + scFmt(f, nat)));
      }
      var acc = css('--s1') || '#1f4fbf', rawc = css('--muted');
      var pr = '', pa = '';
      games.forEach(function (g, i) { var d = byG[g.id]; pr += (i ? 'L' : 'M') + X(i) + ' ' + Y(d.raw); pa += (i ? 'L' : 'M') + X(i) + ' ' + Y(d.adj); });
      svg.appendChild(el('path', { d: pr, fill: 'none', stroke: rawc, 'stroke-width': 1.5, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round' }));
      svg.appendChild(el('path', { d: pa, fill: 'none', stroke: acc, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
      games.forEach(function (g, i) {
        var d = byG[g.id], x = X(i);
        svg.appendChild(el('circle', { cx: x, cy: Y(d.raw), r: 4, fill: css('--surface-1'), stroke: rawc, 'stroke-width': 1.5 }));
        svg.appendChild(el('circle', { cx: x, cy: Y(d.adj), r: 5.5, fill: acc, stroke: css('--surface-1'), 'stroke-width': 2 }));
        var res = g.pf == null ? '' : (g.pf > g.pa ? 'W ' : g.pf < g.pa ? 'L ' : 'T ') + g.pf + '-' + g.pa;
        var opp = (g.ha === 'A' ? '@' : g.ha === 'N' ? 'vs ' : '') + (g.opp === 'FCS' ? 'FCS' : g.opp);
        svg.appendChild(el('text', { x: x, y: H - B + 22, 'text-anchor': 'middle', class: 'lbl', style: 'font-size:12.5px;font-weight:600' }, opp.length > 13 ? opp.slice(0, 12) + '…' : opp));
        svg.appendChild(el('text', { x: x, y: H - B + 39, 'text-anchor': 'middle', class: 'ax', style: 'font-size:11.5px' }, 'Wk ' + g.week + (res ? ' · ' + res : '')));
        var hit = el('rect', { x: x - (W - L - R) / Math.max(1, n - 1) / 2, y: T, width: (W - L - R) / Math.max(1, n - 1), height: H - T - B, fill: 'transparent' });
        bindTip(hit, '<b>Wk ' + g.week + ' ' + (g.ha === 'A' ? 'at ' : 'vs ') + g.opp + '</b>' + (res ? ' · ' + res : '') + '<br>' +
          XM[met][0] + ' as played: <b>' + scFmt(f, d.raw) + '</b><br>Adjusted for the opponent: <b>' + scFmt(f, d.adj) + '</b><br>' + d.n + (met === 'ppd' ? ' drives' : ' plays'));
        svg.appendChild(hit);
      });
      chart.appendChild(svg);
      var leg = h('p', 'trleg');
      leg.innerHTML = '<span class="trk adj"></span> Adjusted for the opponent &nbsp; <span class="trk raw"></span> As played &nbsp; <span class="trk nat"></span> FBS average';
      chart.insertBefore(leg, svg);
      var srow = (j.season || []).filter(function (r) { return r.side === side && r.metric === met; })[0];
      note.innerHTML = state.team + ' ' + side.toLowerCase() + ', ' + XM[met][0].replace(/^(?!EPA)./, function (x) { return x.toLowerCase(); }) + ', game by game. ' +
        (srow ? 'Season: <b>' + scFmt(f, srow.adj) + '</b> adjusted (#' + srow.adj_rank + '), ' + scFmt(f, srow.raw) + ' as played (#' + srow.raw_rank + '). ' : '') +
        'The adjusted line removes the strength of each opponent' + (side === 'Offense' ? '\'s defense' : '\'s offense') + ', so a dip against a top unit is not mistaken for a slump. ' +
        (up ? '' : 'Lower is better here, so the chart is flipped: up is always better. ') + 'Hover a game for its numbers.';
    }).catch(function (e) { chart.innerHTML = ''; chart.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }


  /* =====================================================================
     Phase 5b: pressure map, situational playbook, fourth-down decisions,
     scouting-page matchups, the "This week" page, following a team.
     ===================================================================== */
  function p5Cards(host, list) {
    var cards = h('div', 'excards');
    list.forEach(function (x) {
      var c = h('div', 'excard'); c.appendChild(h('p', 'exl', x[0])); c.appendChild(h('p', 'exv', x[1])); if (x[2]) c.appendChild(h('p', 'exr', x[2]));
      if (x[3] && x[4] > 1) c.style.boxShadow = 'inset 4px 0 0 ' + xRankBg(x[3], x[4]);
      cards.appendChild(c);
    });
    host.appendChild(cards);
  }
  function p5Loading(host) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading…')); }
  function p5Fail(host, e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load. ' + (e && e.message ? e.message : e))); }
  function rk(n, pool) { return n ? '#' + n + (pool ? ' of ' + pool : '') : '–'; }

  /* ---------------- pressure map (Players & units) ---------------- */
  var SPOTS = {
    A: ['A gap', 'Between the center and a guard', 366, 186], B: ['B gap', 'Between a guard and a tackle', 290, 186],
    OT: ['Over the tackle', 'Head-up or shaded on a tackle', 218, 186], EDGE: ['Edge', 'Outside the tackle', 136, 186],
    BOX: ['Box (off the ball)', 'Linebacker depth inside the box', 318, 98], SLOT: ['Slot', 'Over a slot receiver', 176, 96],
    WIDE: ['Wide', 'Outside corner', 52, 120], DEEP: ['Deep', 'Safety depth', 430, 40]
  };
  function buildPressure() {
    var host = document.getElementById('prsBody'); if (!host) return;
    p5Loading(host);
    var team = state.team, s = state.season, def = state.gSide === 1;
    xGet('pressure', { team: team, season: s }).then(function (j) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      if (def) drawRush(host, j); else drawProtect(host, j);
    }).catch(function (e) { p5Fail(host, e); });
  }
  function drawRush(host, j) {
    var T = j.team, N = j.nat || {}, S = j.spots || {};
    if (!T) { host.appendChild(h('p', 'ax', 'No PFF pass-rush data for ' + state.team + ' this season.')); return; }
    p5Cards(host, [
      ['Rushers per dropback', num(T.rushers, 2), 'FBS average ' + num(N.rushers, 2)],
      ['Blitzers per dropback', num(T.blitzers, 2), rk(T.blitz_rk, T.pool) + ' most · FBS ' + num(N.blitzers, 2)],
      ['Pressures credited per dropback', pct(T.prate, 0), rk(T.prate_rk, T.pool) + ' · FBS ' + pct(N.prate, 0), T.prate_rk, T.pool],
      ['Pressure per rush snap', pct(T.win, 1), rk(T.win_rk, T.pool) + ' · FBS ' + pct(N.win, 1), T.win_rk, T.pool]
    ]);
    var W = 760, H = 330, d = isDarkTheme();
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'prssvg', role: 'img', 'aria-label': 'Where ' + state.team + '\'s pass rush comes from' });
    var losY = 218, cx = 380;
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 8, fill: d ? '#173d24' : '#3a8149' }));
    svg.appendChild(el('line', { x1: 10, x2: W - 10, y1: losY, y2: losY, stroke: d ? '#7aa2ff' : '#cfe0ff', 'stroke-width': 3 }));
    ['LT', 'LG', 'C', 'RG', 'RT'].forEach(function (lab, i) {
      var x = cx + (i - 2) * 56;
      svg.appendChild(el('rect', { x: x - 20, y: losY + 8, width: 40, height: 26, rx: 5, fill: 'rgba(255,255,255,.22)', stroke: 'rgba(255,255,255,.5)' }));
      svg.appendChild(el('text', { x: x, y: losY + 26, 'text-anchor': 'middle', class: 'prsol' }, lab));
    });
    svg.appendChild(el('circle', { cx: cx, cy: losY + 74, r: 15, fill: 'rgba(255,255,255,.22)', stroke: 'rgba(255,255,255,.5)' }));
    svg.appendChild(el('text', { x: cx, y: losY + 79, 'text-anchor': 'middle', class: 'prsol' }, 'QB'));
    var maxR = 1; Object.keys(S).forEach(function (k) { maxR = Math.max(maxR, S[k].rush); });
    var players = j.players || [];
    Object.keys(SPOTS).forEach(function (k) {
      var sp = SPOTS[k], v = S[k], x = sp[2], y = sp[3];
      if (!v || !v.rush) {
        svg.appendChild(el('circle', { cx: x, cy: y, r: 7, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '3 3' }));
        return;
      }
      var r = 9 + 25 * Math.sqrt(v.rush / maxR), rate = v.prs / v.rush;
      var p = Math.max(0, Math.min(1, 0.5 + (rate - (N.win || 0.08)) / 0.16));
      var c = el('circle', { cx: x, cy: y, r: r, fill: shade(p), 'fill-opacity': .92, stroke: '#fff', 'stroke-width': 1.5 });
      svg.appendChild(c);
      svg.appendChild(el('text', { x: x, y: y - r - 6, 'text-anchor': 'middle', class: 'prslab', stroke: d ? '#173d24' : '#3a8149', 'stroke-width': 4, 'paint-order': 'stroke' }, sp[0]));
      svg.appendChild(el('text', { x: x, y: y + 4, 'text-anchor': 'middle', class: 'prsnum' }, v.prs));
      var who = players.filter(function (pl) { return pl.spot === k; }).slice(0, 5)
        .map(function (pl) { return pl.name + ' (' + pl.pos + '): ' + pl.prs + ' pressures, ' + pl.sk + ' sacks on ' + pl.rush + ' rushes'; }).join('<br>');
      var hit = el('circle', { cx: x, cy: y, r: Math.max(r, 16), fill: 'transparent' });
      bindTip(hit, '<b>' + sp[0] + '</b> · ' + sp[1] + '<br>' + v.rush + ' rush snaps · ' + v.prs + ' pressures · ' + v.sk + ' sacks<br>' +
        pct(rate, 1) + ' pressure per rush (FBS ' + pct(N.win, 1) + ')' + (who ? '<br><br>' + who : ''));
      svg.appendChild(hit);
    });
    svg.appendChild(el('text', { x: W - 16, y: 24, 'text-anchor': 'end', class: 'prslab' }, 'Number = pressures from that spot'));
    svg.appendChild(el('text', { x: W - 16, y: 42, 'text-anchor': 'end', class: 'prssub' }, 'Size = rush snaps · color = pressure rate'));
    svg.appendChild(el('text', { x: W - 16, y: 60, 'text-anchor': 'end', class: 'prssub' }, 'Both sides of the formation combined'));
    var wrap = h('div', 'prswrap'); wrap.appendChild(svg); host.appendChild(wrap);
    var X = tbl(['Rusher', 'Pos', 'Usually lines up', 'Rush snaps', 'Pressures', 'Sacks', 'Pressure rate', 'PFF rush grade']);
    players.slice(0, 14).forEach(function (pl) {
      var tr = h('tr'); tr.appendChild(td('pclab', pl.name)); tr.appendChild(td('nd', pl.pos)); tr.appendChild(td(null, (SPOTS[pl.spot] || [pl.spot])[0]));
      tr.appendChild(td('nd', pl.rush)); tr.appendChild(td('nd', pl.prs)); tr.appendChild(td('nd', num(pl.sk, pl.sk % 1 ? 1 : 0)));
      var rt = h('td', 'nd pcshade', pct(pl.prs / Math.max(1, pl.rush), 1));
      rt.style.background = shade(Math.max(0, Math.min(1, 0.5 + (pl.prs / Math.max(1, pl.rush) - (N.win || 0.08)) / 0.16)));
      tr.appendChild(rt); tr.appendChild(td('nd', pl.grade == null ? '–' : num(pl.grade, 1)));
      X.tb.appendChild(tr);
    });
    host.appendChild(X.wrap);
    host.appendChild(h('p', 'tblnote', 'From PFF\'s charting: every pass-rush snap and pressure (sack, hit or hurry), placed at the spot each player lines up most. Linebackers and defensive backs who rush are blitzers. Two players can share credit for one pressure, so pressure counts run high; the ranks compare like with like. Hover a spot to see who rushes from it.'));
  }
  function drawProtect(host, j) {
    var O = j.ol, P = j.profile || {};
    if (!O) { host.appendChild(h('p', 'ax', 'No PFF blocking grades for ' + state.team + ' this season.')); return; }
    p5Cards(host, [
      ['Offensive line, pass blocking', num(O.pbg, 1), 'PFF grade · ' + rk(O.pbg_rk, O.pool), O.pbg_rk, O.pool],
      ['Offensive line, run blocking', num(O.rbg, 1), 'PFF grade · ' + rk(O.rbg_rk, O.pool), O.rbg_rk, O.pool],
      ['Sacks per dropback', pct(P.sack_rate, 1), 'from the play-by-play']
    ]);
    var X = tbl(['Lineman', 'Pos', 'Pass-block snaps', 'Pass-block grade', 'Run-block snaps', 'Run-block grade']);
    (j.blockers || []).forEach(function (b) {
      var tr = h('tr'); tr.appendChild(td('pclab', b.name)); tr.appendChild(td('nd', b.pos)); tr.appendChild(td('nd', b.pb));
      var g1 = h('td', 'nd pcshade', b.g == null ? '–' : num(b.g, 1)); if (b.g != null) g1.style.background = shade(Math.max(0, Math.min(1, (b.g - 45) / 40)));
      tr.appendChild(g1); tr.appendChild(td('nd', b.rb));
      var g2 = h('td', 'nd pcshade', b.rg == null ? '–' : num(b.rg, 1)); if (b.rg != null) g2.style.background = shade(Math.max(0, Math.min(1, (b.rg - 45) / 40)));
      tr.appendChild(g2); X.tb.appendChild(tr);
    });
    host.appendChild(X.wrap);
    host.appendChild(h('p', 'tblnote', 'PFF grades every block on a 0–100 scale (around 60 is an average starter, 80+ is excellent). Line grades are weighted by snaps. Switch to Defense in the bar above for where this team\'s own pass rush comes from.'));
  }

  /* ---------------- situational playbook (Playcalling) ---------------- */
  var SITS = [['op', 'Opening script', 'first 15 plays of each game'], ['3s', '3rd and short', '1-3 to go'], ['3m', '3rd and medium', '4-6 to go'],
    ['3l', '3rd and long', '7+ to go'], ['rz', 'Red zone', 'inside the 20'], ['gl', 'Goal to go', ''], ['2m', 'Two-minute drill', 'last 2:00 of a half'],
    ['to', 'After a takeaway', 'first play after the defense gets the ball']];
  function buildSitu() {
    var host = document.getElementById('situBody'); if (!host) return;
    p5Loading(host);
    var team = state.team, s = state.season, side = state.gSide === 1 ? 'Defense' : 'Offense';
    xGet('situ', { team: team, season: s, side: side }).then(function (j) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      var R = {}; (j.rows || []).forEach(function (r) { R[r.k] = r; });
      var off = side === 'Offense';
      var X = tbl(['Situation', 'Plays', off ? 'Pass rate' : 'Pass rate faced', 'Success' + (off ? '' : ' allowed'), 'EPA' + (off ? '' : ' allowed'), off ? 'Go-to players' : 'Tell']);
      SITS.forEach(function (sd) {
        var r = R[sd[0]]; if (!r) return;
        var tr = h('tr');
        var l = h('td', 'pclab'); l.appendChild(document.createTextNode(sd[1])); if (sd[2]) l.appendChild(h('span', 'sitsub', sd[2])); tr.appendChild(l);
        tr.appendChild(td('nd', r.n));
        var pr = h('td', 'sitbar'), diff = r.pass_rate - r.nat_pass;
        var bar = h('span', 'sitb'); var fill = h('span', 'sitf'); fill.style.width = Math.round(r.pass_rate * 100) + '%'; bar.appendChild(fill);
        var tick = h('span', 'sitt'); tick.style.left = Math.round(r.nat_pass * 100) + '%'; bar.appendChild(tick);
        pr.appendChild(bar); pr.appendChild(h('span', 'sitv', pct(r.pass_rate) + (Math.abs(diff) >= 0.1 ? (diff > 0 ? ' ▲' : ' ▼') : '')));
        pr.title = 'Pass rate ' + pct(r.pass_rate) + ' against an FBS average of ' + pct(r.nat_pass) + ' in this situation';
        tr.appendChild(pr);
        var c1 = h('td', 'nd pcshade'); c1.innerHTML = pct(r.sr, 0) + ' <span class="fdrk">#' + r.sr_rk + '</span>'; c1.style.background = xRankBg(r.sr_rk, r.pool); tr.appendChild(c1);
        var c2 = h('td', 'nd pcshade'); c2.innerHTML = sgn(r.epa, 2) + ' <span class="fdrk">#' + r.epa_rk + '</span>'; c2.style.background = xRankBg(r.epa_rk, r.pool); tr.appendChild(c2);
        var who = h('td', 'sitwho');
        if (off) {
          var bits = [];
          (r.targets || []).slice(0, 2).forEach(function (x) { bits.push(x[0] + ' ' + x[1] + ' tgt'); });
          (r.runners || []).slice(0, 2).forEach(function (x) { bits.push(x[0] + ' ' + x[1] + ' car'); });
          who.textContent = bits.join(' · ') || '–';
        } else {
          who.textContent = Math.abs(diff) >= 0.1 ? 'Opponents ' + (diff > 0 ? 'throw' : 'run') + ' more than usual here' : '–';
        }
        if (off && r.pred_rk && r.pred_rk <= Math.round(r.pool * 0.15)) { var tg = h('span', 'sittag', 'predictable'); tg.title = 'Among the ' + Math.round(r.pool * 0.15) + ' FBS teams whose run/pass mix here strays furthest from the norm (#' + r.pred_rk + ')'; who.appendChild(tg); }
        tr.appendChild(who);
        X.tb.appendChild(tr);
      });
      host.appendChild(X.wrap);
      host.appendChild(h('p', 'tblnote', (off ? 'What this offense does when the situation narrows the playbook. ' : 'What opponents do against this defense in the same spots, and how it holds up. ') +
        'The bar is the pass rate (sacks count as passes); the tick is the FBS average in the same situation, and ▲/▼ marks a mix 10+ points off it. Success and EPA ranks are national (#1 = best' + (off ? '' : ' defense') + '). "Predictable" = among the most lopsided run/pass mixes in the country in that spot. Go-to players are the most frequent ball carriers (car) and targets (tgt) there.'));
    }).catch(function (e) { p5Fail(host, e); });
  }

  /* ---------------- fourth-down decisions ---------------- */
  function fieldPos(ytg) { return ytg > 50 ? 'own ' + (100 - ytg) : ytg === 50 ? 'midfield' : 'opp ' + ytg; }
  var CALL = { go: 'Go for it', punt: 'Punt', fg: 'Field goal' };
  state.fdAll = state.fdAll || 0;
  function buildFourth() {
    var host = document.getElementById('fourthBody'); if (!host) return;
    p5Loading(host);
    var team = state.team, s = state.season;
    xGet('fourth', { team: team, season: s }).then(function (j) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      var S = j.summary;
      if (!S) { host.appendChild(h('p', 'ax', 'No graded fourth downs for ' + team + ' in ' + s + '.')); return; }
      p5Cards(host, [
        ['Fourth-down decision rank', '#' + S.rank + ' of ' + S.pool, sgn(-S.lost_pg, 2) + ' expected points per game vs the model', S.rank, S.pool],
        ['Agrees with the model', pct(S.agree, 0), S.n + ' fourth downs graded'],
        ['Clear "go" spots taken', S.went + ' of ' + S.clear_go, S.timid + ' kicked when going was clearly better'],
        ['Went for it', S.goes + ' times', S.conv + ' converted' + (S.bold ? ' · ' + S.bold + ' when kicking was clearly better' : '')]
      ]);
      var sg = h('div', 'segs'); host.appendChild(sg);
      segs(sg, ['Calls that differed from the model', 'Every fourth down'], state.fdAll, function (i) { state.fdAll = i; buildFourth(); });
      var X = tbl(['Wk', 'Opponent', 'Qtr', 'Score', 'Situation', 'Call', 'Model', 'Cost', 'Result']);
      var list = (j.calls || []).filter(function (c) { return state.fdAll || (c.choice !== c.best && c.gap >= 0.1); });
      list.forEach(function (c) {
        var tr = h('tr', 'clickable');
        tr.appendChild(td('nd', c.week)); tr.appendChild(td('pclab', c.opp)); tr.appendChild(td('nd', 'Q' + c.q + ' ' + Math.floor(c.clock / 60) + ':' + ('0' + c.clock % 60).slice(-2)));
        tr.appendChild(td('nd', (c.sd > 0 ? 'Up ' : c.sd < 0 ? 'Down ' : 'Tied') + (c.sd ? Math.abs(c.sd) : '')));
        tr.appendChild(td(null, '4th & ' + (c.dist >= c.ytg ? 'goal' : c.dist) + ', ' + fieldPos(c.ytg)));
        tr.appendChild(td(null, CALL[c.choice]));
        var m = h('td', 'pcshade', CALL[c.best] + (c.gap < 0.2 ? ' (close)' : ''));
        tr.appendChild(m);
        var cost = h('td', 'nd pcshade', c.lost > 0.005 ? '−' + num(c.lost, 2) : '0');
        if (c.lost > 0.005) cost.style.background = shade(Math.max(0, 0.5 - c.lost / 2)); tr.appendChild(cost);
        tr.appendChild(td(null, c.choice === 'go' ? (c.conv ? 'Converted' : 'Stopped') : ''));
        tr.title = 'Expected points — go: ' + sgn(c.go, 2) + ' (' + pct(c.pc, 0) + ' to convert) · punt: ' + sgn(c.punt, 2) + (c.fg != null ? ' · field goal: ' + sgn(c.fg, 2) + ' (' + pct(c.pf, 0) + ' make)' : '') + '\n' + (c.text || '');
        tr.onclick = function () { vstate.boxGame = c.game; setView('box'); };
        X.tb.appendChild(tr);
      });
      if (!list.length) host.appendChild(h('p', 'ax', 'Every fourth-down call matched the model.'));
      else host.appendChild(X.wrap);
      host.appendChild(h('p', 'tblnote', 'Each fourth down is valued three ways in expected points: go (conversion odds by distance from every college 3rd and 4th down), punt (net about 40 yards) and field goal (make rate by kick length), using the standard college expected-points curve for field position. Cost = points given up against the best option. End-of-half and blowout situations are left out, since the clock decides those. Hover a row for the numbers behind it; tap it for the box score.'));
    }).catch(function (e) { p5Fail(host, e); });
  }
  function buildFourthLeague() {
    var host = document.getElementById('fourthLeague'); if (!host) return;
    p5Loading(host);
    xGet('fourth_league', { season: state.season }).then(function (j) {
      host.innerHTML = '';
      var X = tbl(['Rk', 'School', 'Head coach', '4th downs', 'Agree', 'Clear go spots taken', 'Kicked, should go', 'Went, should kick', 'Pts lost / game']);
      (j.rows || []).forEach(function (r) {
        var tr = h('tr'); if (r.team === state.team) tr.className = 'me';
        tr.appendChild(td('nd', r.rank));
        var t = h('td', 'tm'); var b = h('button', null, r.team); b.onclick = function () { pickTeam(r.team); }; t.appendChild(b); tr.appendChild(t);
        tr.appendChild(td(null, r.coach || '–')); tr.appendChild(td('nd', r.n)); tr.appendChild(td('nd', pct(r.agree, 0)));
        tr.appendChild(td('nd', r.went + ' of ' + r.clear_go)); tr.appendChild(td('nd', r.timid)); tr.appendChild(td('nd', r.bold));
        var c = h('td', 'nd pcshade', num(r.lost_pg, 2)); c.style.background = xRankBg(r.rank, r.pool); tr.appendChild(c);
        X.tb.appendChild(tr);
      });
      X.wrap.classList.add('tall'); host.appendChild(X.wrap);
      host.appendChild(h('p', 'tblnote', 'Every FBS team\'s ' + state.season + ' fourth downs graded against an expected-points model (go, punt or kick). Ranked by expected points given up per game. A "clear go spot" is one where going for it was worth half a point or more over the next best option.'));
    }).catch(function (e) { p5Fail(host, e); });
  }

  /* ---------------- the Post-Snap number (matchup board model) ---------------- */
  function psModel(D, home, away, neutral) {
    var m = D && D.models && D.models['22']; if (!m) return null;
    var H = SC_BOARD_NAME[home] || home, A = SC_BOARD_NAME[away] || away;
    if (m.rt[H] == null || m.rt[A] == null || m.tal[H] == null || m.tal[A] == null) return null;
    var margin = m.rt[H] - m.rt[A] + D.beta * (m.tal[H] - m.tal[A]) + (neutral ? 0 : m.hfa);
    return { margin: margin, pHome: phi(margin / ((D.bench && D.bench.sigma) || 15.5)) };
  }
  function pickTxt(home, away, mm) { var fav = mm.margin >= 0 ? home : away; return fav + ' by ' + num(Math.abs(mm.margin), 1) + ' (' + pct(mm.margin >= 0 ? mm.pHome : 1 - mm.pHome, 0) + ')'; }
  function lineTxt(home, away, spread) {
    if (spread == null) return 'no line yet';
    if (Math.abs(spread) < 0.01) return 'pick\'em';
    return (spread < 0 ? home : away) + ' −' + num(Math.abs(spread), 1);
  }
  /* open a game's preview from team names and a week */
  function openPreview(week, home, away) {
    scGet('api/games?season=' + state.season + '&week=' + week).then(function (j) {
      var hit = (j.games || []).filter(function (g) { return (g.home_team === home && g.away_team === away) || (g.home_team === away && g.away_team === home); })[0];
      if (!hit) return;
      ['home_sp','away_sp','projected_margin','market_margin','spread','over_under','home_points','away_points'].forEach(function (k) { hit[k] = hit[k] == null ? null : +hit[k]; });
      sc.game = hit; sc.game.week = week; vstate.scoutGame = hit.game_id; vstate.week = week; setView('scout');
    });
  }

  /* ---------------- scouting page additions ---------------- */
  function scExtra(root, A, B, s, g) {
    scGet('api/matchups-data').then(function (D) {
      var mm = psModel(D, B, A, g.neutral_site); if (!mm) return;
      var tiles = document.getElementById('scoutTiles'); if (!tiles) return;
      var d = h('div', 'tile pstile'); d.appendChild(h('span', 'k', 'Post-Snap model')); d.appendChild(h('span', 'v', pickTxt(B, A, mm)));
      d.title = 'The matchup board\'s model: this season\'s results rating plus Two-Deep recruiting talent and home field. Win chance in parentheses.';
      tiles.insertBefore(d, tiles.firstChild);
    }).catch(function () {});
    var p6 = scPanel(root, '06', 'Key matchups', 'Who gets the ball and where, against how the other side defends those spots; the run lanes; and the offensive line against the pass rush.');
    var p7 = scPanel(root, '07', 'Situations', 'Third downs, the red zone, the two-minute drill and the first series after a turnover: the offense\'s habits against what the defense allows.');
    var p8 = scPanel(root, '08', 'Fourth downs', 'How each coaching staff handles fourth down, graded against an expected-points model.');
    var side = function (team, sd) { return 'team=' + encodeURIComponent(team) + '&season=' + s + '&side=' + sd; };
    var dir = 0;
    function draw() {
      var off = dir === 0 ? A : B, def = dir === 0 ? B : A;
      [p6, p7].forEach(function (p) { p.ctl.parentNode.hidden = false; segs(p.ctl, [A + ' offense vs ' + B + ' defense', B + ' offense vs ' + A + ' defense'], dir, function (i) { dir = i; draw(); }); });
      p5Loading(p6.body); p5Loading(p7.body);
      Promise.all([scGet('api/field?' + side(off, 'Offense')), scGet('api/field?' + side(def, 'Defense')),
        xGet('pressure', { team: off, season: s }), xGet('pressure', { team: def, season: s })]).then(function (r) {
        scKeyMatchups(p6.body, off, def, r[0], r[1], r[2], r[3]);
      }).catch(function (e) { p5Fail(p6.body, e); });
      Promise.all([xGet('situ', { team: off, season: s, side: 'Offense' }), xGet('situ', { team: def, season: s, side: 'Defense' })]).then(function (r) {
        scSitu(p7.body, off, def, r[0], r[1]);
      }).catch(function (e) { p5Fail(p7.body, e); });
    }
    draw();
    p5Loading(p8.body);
    Promise.all([xGet('fourth', { team: A, season: s }), xGet('fourth', { team: B, season: s })]).then(function (r) {
      p8.body.innerHTML = '';
      var X = tbl(['', A, B]);
      var a = r[0].summary || {}, b = r[1].summary || {};
      [['Decision rank', function (x) { return x.rank ? '#' + x.rank + ' of ' + x.pool : '–'; }],
       ['Agrees with the model', function (x) { return x.agree != null ? pct(x.agree, 0) : '–'; }],
       ['Clear "go" spots taken', function (x) { return x.clear_go != null ? x.went + ' of ' + x.clear_go : '–'; }],
       ['Went for it / converted', function (x) { return x.goes != null ? x.goes + ' / ' + x.conv : '–'; }],
       ['Expected points lost per game', function (x) { return x.lost_pg != null ? num(x.lost_pg, 2) : '–'; }]].forEach(function (row, i) {
        var tr = h('tr'); tr.appendChild(td('pclab', row[0]));
        [a, b].forEach(function (x) { var c = td('nd', row[1](x)); if (i === 0 && x.rank) { c.className = 'nd pcshade'; c.style.background = xRankBg(x.rank, x.pool); } tr.appendChild(c); });
        X.tb.appendChild(tr);
      });
      p8.body.appendChild(X.wrap);
      p8.body.appendChild(h('p', 'tblnote', 'The full call-by-call list is on each team\'s Playcalling tab.'));
    }).catch(function (e) { p5Fail(p8.body, e); });
  }
  function scKeyMatchups(host, off, def, F, G, PO, PD) {
    host.innerHTML = '';
    var Z = G.zones || {}, OZ = F.zones || {};
    host.appendChild(h('h3', 'fdh', off + '\'s receivers against ' + def + '\'s pass defense'));
    var by = {};
    (F.passes || []).forEach(function (p) {
      var who = p[7]; if (!who || !p[17]) return;
      var b = by[who] = by[who] || { n: 0, c: 0, y: 0, epa: 0, z: {} }; b.n++; if (p[2] === 'C') { b.c++; b.y += p[4] || 0; } b.epa += +p[5] || 0;
      b.z[p[17]] = (b.z[p[17]] || 0) + 1;
    });
    var top = Object.keys(by).sort(function (x, y) { return by[y].n - by[x].n; }).slice(0, 6);
    if (top.length) {
      var X = tbl(['Target', 'Targets', 'Catches · yards', 'EPA / target', 'Favorite spot', def + ' allows there']);
      top.forEach(function (n) {
        var b = by[n], zk = Object.keys(b.z).sort(function (x, y) { return b.z[y] - b.z[x]; })[0], dz = Z[zk];
        var tr = h('tr'); tr.appendChild(td('pclab', n)); tr.appendChild(td('nd', b.n)); tr.appendChild(td('nd', b.c + ' · ' + b.y));
        tr.appendChild(td('nd', sgn(b.epa / b.n, 2)));
        tr.appendChild(td(null, FZ[zk[0]][2].replace(/ \(.*/, '') + ' ' + FL[zk[1]].toLowerCase() + ' (' + pct(b.z[zk] / b.n, 0) + ')'));
        var c = h('td', 'pcshade');
        if (dz) {
          c.innerHTML = sgn(dz.epa, 2) + ' EPA <span class="fdrk">#' + dz.rk_epa + '</span>' + (dz.rk_epa > dz.pool * 0.66 ? ' <span class="sittag good">soft spot</span>' : dz.rk_epa <= dz.pool * 0.2 ? ' <span class="sittag bad">strength</span>' : '');
          c.style.background = shade(1 - (dz.pool - dz.rk_epa) / Math.max(1, dz.pool - 1));
        } else c.textContent = '–';
        tr.appendChild(c); X.tb.appendChild(tr);
      });
      host.appendChild(X.wrap);
    } else host.appendChild(h('p', 'ax', 'No charted targets for ' + off + '.'));
    host.appendChild(h('h3', 'fdh', 'Run lanes'));
    var R = tbl(['Lane', off + ' runs there', 'Yards per carry', 'EPA / run', def + ' allows there']);
    ['RL', 'RM', 'RR'].forEach(function (k) {
      var o = OZ[k], dz = Z[k]; if (!o) return;
      var tr = h('tr'); tr.appendChild(td('pclab', FL[k[1]])); tr.appendChild(td('nd', pct(o.share, 0) + ' (' + o.n + ')'));
      tr.appendChild(td('nd', num(o.ypp, 1))); tr.appendChild(td('nd', sgn(o.epa, 2)));
      var c = h('td', 'pcshade');
      if (dz) { c.innerHTML = num(dz.ypp, 1) + ' YPC, ' + sgn(dz.epa, 2) + ' EPA <span class="fdrk">#' + dz.rk_epa + '</span>'; c.style.background = shade(1 - (dz.pool - dz.rk_epa) / Math.max(1, dz.pool - 1)); } else c.textContent = '–';
      tr.appendChild(c); R.tb.appendChild(tr);
    });
    host.appendChild(R.wrap);
    host.appendChild(h('h3', 'fdh', off + '\'s protection against ' + def + '\'s pass rush'));
    var ol = PO.ol || {}, pr = PD.team || {};
    var P = tbl(['', off + ' offense', def + ' defense']);
    [['Pass blocking / pass rush (PFF)', ol.pbg != null ? num(ol.pbg, 1) + ' grade, ' + rk(ol.pbg_rk, ol.pool) : '–', pr.prate != null ? pct(pr.prate, 0) + ' pressures credited per dropback, ' + rk(pr.prate_rk, pr.pool) : '–'],
     ['Sacks', PO.profile && PO.profile.sack_rate != null ? pct(PO.profile.sack_rate, 1) + ' of dropbacks' : '–', pr.sk != null ? num(pr.sk, 0) + ' sacks' : '–'],
     ['Blitzing', '', pr.blitzers != null ? num(pr.blitzers, 2) + ' blitzers per dropback, ' + rk(pr.blitz_rk, pr.pool) + ' most' : '–']].forEach(function (row) {
      var tr = h('tr'); row.forEach(function (v, i) { tr.appendChild(td(i ? 'nd' : 'pclab', v)); }); P.tb.appendChild(tr);
    });
    host.appendChild(P.wrap);
    host.appendChild(h('p', 'tblnote', 'Zone and lane numbers are season to date. "' + def + ' allows there" ranks the defense nationally in that spot (#1 = toughest); soft spot = bottom third, strength = top fifth. Colors are from ' + off + '\'s side: blue = favorable for the offense, red = a tough spot. Protection and pass rush come from PFF charting.'));
  }
  function scSitu(host, off, def, O, Dd) {
    host.innerHTML = '';
    var RO = {}, RD = {}; (O.rows || []).forEach(function (r) { RO[r.k] = r; }); (Dd.rows || []).forEach(function (r) { RD[r.k] = r; });
    var X = tbl(['Situation', off + ' pass rate', off + ' success', def + ' success allowed', 'Edge', off + ' go-to']);
    SITS.forEach(function (sd) {
      var o = RO[sd[0]], d = RD[sd[0]]; if (!o && !d) return;
      var tr = h('tr'); tr.appendChild(td('pclab', sd[1]));
      tr.appendChild(td('nd', o ? pct(o.pass_rate, 0) + ' (FBS ' + pct(o.nat_pass, 0) + ')' : '–'));
      var a = h('td', 'nd pcshade', o ? pct(o.sr, 0) + ' #' + o.sr_rk : '–'); if (o) a.style.background = xRankBg(o.sr_rk, o.pool); tr.appendChild(a);
      var b = h('td', 'nd pcshade', d ? pct(d.sr, 0) + ' #' + d.sr_rk : '–'); if (d) b.style.background = xRankBg(d.sr_rk, d.pool); tr.appendChild(b);
      var e = '–'; if (o && d) { var gap = (d.sr_rk / d.pool) - (o.sr_rk / o.pool); e = Math.abs(gap) < 0.12 ? 'even' : gap > 0 ? off : def; }
      tr.appendChild(td(null, e));
      var bits = []; if (o) { (o.targets || []).slice(0, 1).forEach(function (x) { bits.push(x[0]); }); (o.runners || []).slice(0, 1).forEach(function (x) { bits.push(x[0]); }); }
      tr.appendChild(td(null, bits.join(', ') || '–'));
      X.tb.appendChild(tr);
    });
    host.appendChild(X.wrap);
    host.appendChild(h('p', 'tblnote', 'Success rates ranked nationally from each unit\'s point of view (#1 = best offense, or best defense). Edge goes to whichever unit ranks clearly higher.'));
  }

  /* ---------------- following a team ---------------- */
  function followTeam() { try { return localStorage.getItem('ps.follow') || ''; } catch (e) { return ''; } }
  function setFollow(t) { try { if (t) localStorage.setItem('ps.follow', t); else localStorage.removeItem('ps.follow'); } catch (e) {} }
  var heroKey = '';
  function p5Hero() {
    var h1 = document.getElementById('heroTeam'); if (!h1 || !state.team) return;
    var btn = document.getElementById('followBtn');
    if (!btn) { btn = h('button', 'followbtn'); btn.id = 'followBtn'; btn.type = 'button'; h1.parentNode.insertBefore(btn, h1.nextSibling); }
    var on = followTeam() === state.team;
    btn.textContent = on ? '★ Following' : '☆ Follow ' + state.team;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'The site opens to ' + state.team + '. Tap to stop following.' : 'Open the site to ' + state.team + ' every time, with its next game on the This week page';
    btn.onclick = function () { setFollow(followTeam() === state.team ? '' : state.team); heroKey = ''; p5Hero(); };
    var key = state.team + '|' + state.season; if (heroKey === key) return; heroKey = key;
    var strip = document.getElementById('heroNext');
    if (!strip) { strip = h('div', 'heronext'); strip.id = 'heroNext'; var tiles = document.getElementById('tiles'); tiles.parentNode.insertBefore(strip, tiles.nextSibling); }
    strip.innerHTML = '';
    scGet('api/matchups-data').then(function (D) {
      if (key !== state.team + '|' + state.season) return;
      var g = nextGame(D, state.team); if (!g) { strip.hidden = true; return null; }
      return kickoffs(g[0]).then(function (K) { return [D, g, K]; });
    }).then(function (x) {
      if (!x || key !== state.team + '|' + state.season) return;
      var D = x[0], g = x[1], K = x[2];
      strip.hidden = false; strip.innerHTML = '';
      var home = siteName(g[2]), away = siteName(g[3]), me = state.team, opp = home === me ? away : home;
      var mm = psModel(D, home, away, !!g[4]);
      strip.appendChild(h('span', 'hnk', 'Next'));
      strip.appendChild(h('span', 'hnv', kickTxt(K[home + '|' + away], g[1]) + ' · ' + (g[4] ? 'vs ' : home === me ? 'vs ' : 'at ') + opp));
      if (mm) strip.appendChild(h('span', 'hnv', 'Post-Snap: ' + pickTxt(home, away, mm)));
      strip.appendChild(h('span', 'hnv', 'Line: ' + lineTxt(home, away, g[5])));
      var b = h('button', 'navlink', 'Preview →'); b.type = 'button'; b.onclick = function () { openPreview(g[0], home, away); }; strip.appendChild(b);
    }).catch(function () { strip.hidden = true; });
  }
  /* kickoff times for a week, keyed home|away (the board's dates are UTC days, so night games would read a day late) */
  function kickoffs(week) {
    return scGet('api/games?season=' + state.season + '&week=' + week).then(function (j) {
      var m = {}; (j.games || []).forEach(function (g) { if (g.start_date) m[g.home_team + '|' + g.away_team] = g.start_date; }); return m;
    }).catch(function () { return {}; });
  }
  function kickTxt(iso, fallback) {
    if (!iso) return new Date(fallback + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function nextGame(D, team) {
    var b = SC_BOARD_NAME[team] || team;
    return (D.schedule || []).filter(function (g) { return g[2] === b || g[3] === b; }).sort(function (x, y) { return x[1] < y[1] ? -1 : 1; })[0] || null;
  }

  /* ---------------- This week ---------------- */
  function buildWeek() {
    var root = document.getElementById('weekBody'); if (!root) return;
    root.innerHTML = '';
    var mine = h('section', 'panel'), games = h('section', 'panel'), dig = h('section', 'panel'), card = h('section', 'panel');
    [mine, games, dig, card].forEach(function (p) { root.appendChild(p); });
    function head(p, n, t, sub) { var hd = h('div', 'phead'); hd.appendChild(h('p', 'num', n)); var d = h('div'); d.appendChild(h('h2', null, t)); if (sub) d.appendChild(h('p', null, sub)); hd.appendChild(d); p.appendChild(hd); var b = h('div'); p.appendChild(b); return b; }
    var mineB = head(mine, '01', 'Your team', null), gamesB = head(games, '02', 'Games to watch', 'The best matchups left this week by the Post-Snap model: both teams good, and close. Tap one for its full preview.'),
      digB = head(dig, '03', 'What changed last week', 'Upsets, the biggest misses by the betting line, the best performances adjusted for the opponent, and how the AP poll moved.'),
      cardB = head(card, '04', 'Model report card', 'How the Post-Snap model has done this season, predicting each week only from games played before it, against the betting line.');
    [mineB, gamesB, digB, cardB].forEach(p5Loading);
    scGet('api/matchups-data').then(function (D) {
      var wk = Math.min.apply(null, (D.schedule || []).map(function (g) { return g[0]; }).concat([99]));
      return kickoffs(wk).then(function (K) { weekKick = K; return [D, wk]; });
    }).then(function (x) {
      var D = x[0], wk = x[1];
      document.getElementById('weekEyebrow').textContent = state.season + ' season · week ' + (wk === 99 ? '–' : wk);
      /* your team */
      mineB.innerHTML = '';
      var f = followTeam();
      if (!f) {
        mineB.appendChild(h('p', 'ax', 'Follow a team with the ☆ Follow button on its page and its next game shows up here, and the site opens to it.'));
      } else {
        var g = nextGame(D, f);
        if (!g) mineB.appendChild(h('p', 'ax', f + ' has no game left on the schedule.'));
        else {
          var home = siteName(g[2]), away = siteName(g[3]), mm = psModel(D, home, away, !!g[4]);
          mineB.appendChild(weekCard(D, g, home, away, mm, true));
        }
      }
      /* games to watch */
      gamesB.innerHTML = '';
      var m = D.models['22'];
      var list = (D.schedule || []).filter(function (g) { return g[0] === wk; }).map(function (g) {
        var home = siteName(g[2]), away = siteName(g[3]), mm = psModel(D, home, away, !!g[4]);
        var q = mm ? (m.rt[g[2]] + m.rt[g[3]]) / 2 - 0.45 * Math.abs(mm.margin) : -99;
        return { g: g, home: home, away: away, mm: mm, q: q };
      }).sort(function (a, b) { return b.q - a.q; });
      var watch = h('div', 'wkgrid');
      list.slice(0, 10).forEach(function (x) { watch.appendChild(weekCard(D, x.g, x.home, x.away, x.mm, false)); });
      gamesB.appendChild(watch);
      var all = h('button', 'navlink', 'Full slate with every line →'); all.type = 'button'; all.onclick = function () { vstate.week = wk; vstate.games = null; setView('games'); };
      gamesB.appendChild(all);
      /* report card */
      drawReport(cardB, D);
    }).catch(function (e) { p5Fail(mineB, e); p5Fail(gamesB, e); p5Fail(cardB, e); });
    xGet('digest', { season: state.season }).then(function (j) { drawDigest(digB, j); }).catch(function (e) { p5Fail(digB, e); });
  }
  var weekKick = {};
  function weekCard(D, g, home, away, mm, big) {
    var c = h('div', 'wkcard' + (big ? ' big' : ''));
    var top = h('p', 'wkwhen', kickTxt(weekKick[home + '|' + away], g[1]) + (g[4] ? ' · neutral site' : ''));
    c.appendChild(top);
    var t = h('p', 'wkteams'); t.appendChild(h('span', null, away)); t.appendChild(h('span', 'scat', g[4] ? ' vs ' : ' at ')); t.appendChild(h('span', null, home)); c.appendChild(t);
    var row = h('div', 'wkrow');
    if (mm) {
      var pk = h('div', 'wkpick'); pk.appendChild(h('span', 'k', 'Post-Snap')); pk.appendChild(h('span', 'v', pickTxt(home, away, mm))); row.appendChild(pk);
    }
    var ln = h('div', 'wkpick'); ln.appendChild(h('span', 'k', 'Line')); ln.appendChild(h('span', 'v', lineTxt(home, away, g[5]))); row.appendChild(ln);
    if (mm && g[5] != null) {
      var edge = mm.margin - (-g[5]);
      var ed = h('div', 'wkpick'); ed.appendChild(h('span', 'k', 'Model vs line')); ed.appendChild(h('span', 'v', Math.abs(edge) < 1 ? 'agree' : (edge > 0 ? home : away) + ' +' + num(Math.abs(edge), 1))); row.appendChild(ed);
    }
    c.appendChild(row);
    var b = h('button', 'navlink', 'Preview →'); b.type = 'button'; b.onclick = function () { openPreview(g[0], home, away); }; c.appendChild(b);
    return c;
  }
  var lastPost = '';
  function drawDigest(host, j) {
    host.innerHTML = '';
    var post = ['Week ' + j.week + ' in college football, by the numbers (thepostsnap.com):'];
    var grid = h('div', 'dggrid');
    function box(title, rows) { var b = h('div', 'dgbox'); b.appendChild(h('h3', 'fdh', title)); var ul = h('ul', 'dglist'); rows.forEach(function (r) { var li = h('li'); li.innerHTML = r; ul.appendChild(li); }); b.appendChild(ul); grid.appendChild(b); }
    var ups = (j.upsets || []).slice(0, 5);
    box('Upsets', ups.length ? ups.map(function (u) { return '<b>' + u.winner + '</b> over ' + u.loser + ' ' + u.score + ' <span class="dgsub">as a ' + num(u.line, 1) + '-point underdog</span>'; }) : ['No favorite lost.']);
    if (ups[0]) post.push('Biggest upset: ' + ups[0].winner + ' over ' + ups[0].loser + ' as a ' + num(ups[0].line, 1) + '-point underdog.');
    box('Beat the line by the most', (j.covers || []).map(function (c) { return '<b>' + c.team + '</b> by ' + num(c.by, 1) + ' <span class="dgsub">' + c.score + '</span>'; }));
    box('Best offense, adjusted for the opponent', (j.best_off || []).map(function (o) { return '<b>' + o.team + '</b> ' + sgn(o.adj, 2) + ' EPA/play <span class="dgsub">vs ' + o.opp + '</span>'; }));
    if (j.best_off && j.best_off[0]) post.push('Best offense: ' + j.best_off[0].team + ' (' + sgn(j.best_off[0].adj, 2) + ' EPA/play adjusted vs ' + j.best_off[0].opp + ').');
    box('Best defense, adjusted for the opponent', (j.best_def || []).map(function (o) { return '<b>' + o.team + '</b> ' + sgn(o.adj, 2) + ' EPA/play allowed <span class="dgsub">vs ' + o.opp + '</span>'; }));
    if (j.best_def && j.best_def[0]) post.push('Best defense: ' + j.best_def[0].team + ' (' + sgn(j.best_def[0].adj, 2) + ' EPA/play allowed, adjusted, vs ' + j.best_def[0].opp + ').');
    var moves = (j.poll || []).map(function (p) { return { t: p.team, r: p.rank, d: p.prev ? p.prev - p.rank : null }; });
    var up = moves.filter(function (m) { return m.d === null || m.d >= 3; }).sort(function (a, b) { return (b.d === null ? 99 : b.d) - (a.d === null ? 99 : a.d); }).slice(0, 5);
    var dn = moves.filter(function (m) { return m.d !== null && m.d <= -3; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 4);
    var pr = up.map(function (m) { return '<b>' + m.t + '</b> ' + (m.d === null ? 'enters at #' + m.r : 'up ' + m.d + ' to #' + m.r); })
      .concat(dn.map(function (m) { return '<b>' + m.t + '</b> down ' + (-m.d) + ' to #' + m.r; }))
      .concat((j.dropped || []).map(function (d) { return '<b>' + d.team + '</b> falls out from #' + d.prev; }));
    box('AP poll movers', pr.length ? pr : ['Little movement this week.']);
    var el2 = (j.elo || []).slice(0, 6).map(function (e) { return '<b>' + e.team + '</b> ' + (e.swing > 0 ? '+' : '') + Math.round(e.swing) + ' <span class="dgsub">Elo ' + Math.round(e.elo) + '</span>'; });
    box('Biggest rating swings (Elo)', el2);
    host.appendChild(grid);
    post.push('Full breakdown: thepostsnap.com');
    lastPost = post.join('\n');
    var cp = h('button', 'pcreset', 'Copy as a post'); cp.type = 'button';
    var pre = h('textarea', 'dgpost'); pre.value = lastPost; pre.readOnly = true; pre.rows = 6;
    cp.onclick = function () {
      var done = function () { cp.textContent = 'Copied'; setTimeout(function () { cp.textContent = 'Copy as a post'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastPost).then(done, function () { pre.select(); });
      else { pre.select(); }
    };
    var pw = h('div', 'dgpostwrap'); pw.appendChild(pre); pw.appendChild(cp); host.appendChild(pw);
    host.appendChild(h('p', 'tblnote', 'Week ' + j.week + ' results; AP poll week ' + j.poll_week + '. Adjusted performances use the same opponent adjustment as the team pages (min. 40 plays).'));
  }
  function drawReport(host, D) {
    host.innerHTML = '';
    var R = D.report || [];
    if (!R.length) { host.appendChild(h('p', 'ax', 'The report card appears after the next weekly update.')); return; }
    var wk = {}, tot = { n: 0, mh: 0, kh: 0, kn: 0, aw: 0, al: 0, me: 0, ke: 0 };
    R.forEach(function (r) {
      var w = wk[r[0]] = wk[r[0]] || { n: 0, mh: 0, kh: 0, kn: 0, aw: 0, al: 0 };
      [w, tot].forEach(function (x) {
        x.n++; if ((r[4] > 0) === (r[6] > 0)) x.mh++;
        if (r[5] != null) { x.kn++; if ((r[5] > 0) === (r[6] > 0)) x.kh++; if (Math.abs(r[4] - r[5]) >= 0.5 && r[6] !== r[5]) { if (((r[4] - r[5]) > 0) === ((r[6] - r[5]) > 0)) x.aw++; else x.al++; } }
      });
      tot.me += Math.abs(r[6] - r[4]); if (r[5] != null) tot.ke += Math.abs(r[6] - r[5]);
    });
    p5Cards(host, [
      ['Picked the winner', pct(tot.mh / tot.n, 0), tot.mh + ' of ' + tot.n + ' games'],
      ['Betting line picked the winner', pct(tot.kh / Math.max(1, tot.kn), 0), tot.kh + ' of ' + tot.kn + ' games'],
      ['Against the spread', tot.aw + '-' + tot.al, pct(tot.aw / Math.max(1, tot.aw + tot.al), 0) + ' when the model disagreed with the line'],
      ['Typical miss', num(tot.me / tot.n, 1) + ' pts', 'line: ' + num(tot.ke / Math.max(1, tot.kn), 1) + ' pts']
    ]);
    var X = tbl(['Week', 'Games', 'Model winners', 'Line winners', 'Model vs spread']);
    Object.keys(wk).map(Number).sort(function (a, b) { return b - a; }).forEach(function (w) {
      var x = wk[w], tr = h('tr');
      tr.appendChild(td('nd', w)); tr.appendChild(td('nd', x.n));
      var a = h('td', 'nd pcshade', pct(x.mh / x.n, 0)); a.style.background = shade(Math.max(0, Math.min(1, (x.mh / x.n - 0.5) / 0.4))); tr.appendChild(a);
      tr.appendChild(td('nd', x.kn ? pct(x.kh / x.kn, 0) : '–'));
      tr.appendChild(td('nd', x.aw + '-' + x.al));
      X.tb.appendChild(tr);
    });
    host.appendChild(X.wrap);
    host.appendChild(h('p', 'tblnote', 'Honest test: each week is predicted from a rating fit only on the games before it (week 3 on, FBS vs FBS). "Against the spread" counts games where the model and the closing line differed by at least half a point, and whether the final margin landed on the model\'s side. The betting market is a tough benchmark and usually wins; this is a record, not a recommendation.'));
  }

  /* =====================================================================
     Views. The team page is one thing; a weekly slate and league-wide
     tables are another shape entirely, so they get their own screens
     behind a switcher rather than being bolted on as more panels.
     ===================================================================== */
  var VIEWS = [
    { id: 'team',    label: 'Team',    el: 'viewTeam' },
    { id: 'week',    label: 'This week', el: 'viewWeek' },
    { id: 'games',   label: 'Games',   el: 'viewGames' },
    { id: 'league',  label: 'League',  el: 'viewLeague' },
    { id: 'odds',    label: 'Playoff odds', el: 'viewOdds' },
    { id: 'coaches', label: 'Coaches', el: 'viewCoaches' },
    { id: 'glossary', label: 'Glossary', el: 'viewGlossary' },
    { id: 'box',     label: null,      el: 'viewBox' },
    { id: 'scout',   label: null,      el: 'viewScout' },
    { id: 'player',  label: null,      el: 'viewPlayer' }
  ];
  var vstate = {
    view: 'team', week: null, gamesConf: '', gamesFilter: 0,
    gamesSort: 'start_date', gamesAsc: true, games: null,
    box: null, boxGame: null, boxTeam: 0, boxStat: 0,
    league: 0, leagueSide: 0, leagueSort: null, leagueAsc: false,
    leagueQ: '', leagueConf: '', leagueData: {},
    coaches: null, coachQ: '', coachSort: 'wins', coachAsc: false
  };

  function setView(id, opts) {
    vstate.view = id;
    VIEWS.forEach(function (v) {
      var n = document.getElementById(v.el);
      if (n) n.hidden = (v.id !== id);
    });
    var nav = document.getElementById('viewNav');
    Array.prototype.forEach.call(nav.children, function (b) {
      b.setAttribute('aria-selected', b.dataset.view === id ? 'true' : 'false');
    });
    var q = new URLSearchParams();
    if (id === 'team') { teamParams(q); }
    else if (id === 'box') { q.set('view', 'box'); q.set('game', vstate.boxGame); }
    else if (id === 'player') { q.set('view', 'player'); q.set('id', vstate.player && vstate.player.id); q.set('team', vstate.player && vstate.player.team); }
    else if (id === 'scout') { q.set('view', 'scout'); q.set('game', vstate.scoutGame); if (vstate.week) q.set('week', vstate.week); }
    else { q.set('view', id); if (id === 'games' && vstate.week) q.set('week', vstate.week); }
    history.replaceState(null, '', '?' + q.toString());
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);

    if (id === 'games') buildGames();
    if (id === 'league') buildLeague();
    if (id === 'coaches') { buildCoaches(); buildFourthLeague(); }
    if (id === 'week') buildWeek();
    if (id === 'odds') buildOdds();
    if (id === 'glossary') buildGlossary();
    if (id === 'box') buildBox();
    if (id === 'scout') buildScout();
    if (id === 'player') buildPlayer();
  }

  function buildNav() {
    var nav = document.getElementById('viewNav');
    nav.innerHTML = '';
    VIEWS.filter(function (v) { return v.label; }).forEach(function (v) {
      var b = h('button', null, v.label);
      b.dataset.view = v.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', v.id === vstate.view ? 'true' : 'false');
      b.onclick = function () { setView(v.id); };
      nav.appendChild(b);
    });
  }

  /* ---- games: the weekly slate ---- */
  function buildGames() {
    var tb = document.getElementById('gamesTable');
    var note = document.getElementById('gamesNote');
    var cnt = document.getElementById('gamesCount');
    var wsel = document.getElementById('weekSel');
    document.getElementById('gamesEyebrow').textContent = state.season + ' season';

    if (!wsel.options.length || wsel.dataset.season !== String(state.season)) {
      wsel.innerHTML = '';
      wsel.dataset.season = String(state.season);
      for (var w = 1; w <= 16; w++) {
        var o = document.createElement('option'); o.value = w; o.textContent = 'Week ' + w;
        wsel.appendChild(o);
      }
      if (!vstate.week) {
        var f = state.data && state.data.freshness;
        vstate.week = f && f.max_week ? Math.min(16, f.max_week + 1) : 1;
      }
      wsel.value = vstate.week;
    }
    segs(document.getElementById('gamesFilterTabs'), ['FBS only', 'Everyone'], vstate.gamesFilter,
      function (i) { vstate.gamesFilter = i; buildGames(); });

    var key = state.season + '|' + vstate.week;
    if (vstate.games && vstate.games.key === key) return paint(vstate.games.rows);
    tb.innerHTML = ''; cnt.textContent = ''; note.textContent = 'Loading the slate…';
    fetch('api/games?season=' + state.season + '&week=' + vstate.week)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var rows = (j.games || []).map(function (g) {
          ['home_sp','away_sp','home_elo','away_elo','projected_margin','market_margin','edge',
           'spread','over_under','actual_margin','home_points','away_points','excitement','temperature']
            .forEach(function (k) { g[k] = g[k] === null || g[k] === undefined ? null : +g[k]; });
          g.kick = g.start_date ? new Date(g.start_date).getTime() : 0;
          return g;
        });
        vstate.games = { key: key, rows: rows };
        if (state.season + '|' + vstate.week === key) paint(rows);
      })
      .catch(function (e) { note.textContent = 'Could not load the slate. ' + e.message; });

    function paint(all) {
      var confSel = document.getElementById('gamesConf');
      if (!confSel.options.length) {
        confSel.innerHTML = '';
        var a0 = document.createElement('option'); a0.value = ''; a0.textContent = 'All conferences';
        confSel.appendChild(a0);
        (state.teams || []).map(function (t) { return t.conference; })
          .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; }).sort()
          .forEach(function (c) {
            var o = document.createElement('option'); o.value = c; o.textContent = c; confSel.appendChild(o);
          });
        confSel.value = vstate.gamesConf;
      }
      var rows = all.filter(function (g) {
        if (vstate.gamesFilter === 0 &&
            !(g.home_classification === 'fbs' && g.away_classification === 'fbs')) return false;
        if (vstate.gamesConf &&
            g.home_conference !== vstate.gamesConf && g.away_conference !== vstate.gamesConf) return false;
        return true;
      });
      var k = vstate.gamesSort;
      rows.sort(function (a, b) {
        var c = cmp(a, b, k === 'start_date' ? 'kick' : k, vstate.gamesAsc,
                    k !== 'home_team' && k !== 'away_team');
        return c !== 0 ? c : (a.kick - b.kick);
      });

      var cols = [
        { head: 'Kick', key: 'start_date', num: true, cell: function (g) {
            if (!g.start_date) return h('td', 'nd', 'TBD');
            var d = new Date(g.start_date);
            return h('td', 'nd', d.toLocaleString(undefined,
              { weekday: 'short', hour: 'numeric', minute: '2-digit' }));
          } },
        { head: 'Matchup', key: 'home_team', num: false, cell: function (g) {
            var td = h('td', 'mtch');
            var away = h('span'); away.textContent = g.away_team;
            var at = h('span', 'rk', g.neutral_site ? '  vs  ' : '  at  ');
            var home = h('b'); home.textContent = g.home_team;
            td.appendChild(away); td.appendChild(at); td.appendChild(home);
            if (g.neutral_site) td.appendChild(h('span', 'rk', '  (N)'));
            return td;
          } },
        { head: 'Away SP+', key: 'away_sp', num: true,
          cell: function (g) { return h('td', null, g.away_sp === null ? '–' : num(g.away_sp, 1)); } },
        { head: 'Home SP+', key: 'home_sp', num: true,
          cell: function (g) { return h('td', null, g.home_sp === null ? '–' : num(g.home_sp, 1)); } },
        { head: 'Projected', key: 'projected_margin', num: true,
          title: 'Projected home margin from SP+ plus home field',
          cell: function (g) { return h('td', null, g.projected_margin === null ? '–' : sgn(g.projected_margin, 1)); } },
        { head: 'Market', key: 'market_margin', num: true,
          title: 'Home margin the closing line implies',
          cell: function (g) { return h('td', null, g.market_margin === null ? '–' : sgn(g.market_margin, 1)); } },
        { head: 'Edge', key: 'edge', num: true,
          title: 'Projection minus market. Positive means the model likes the home team more than the market does.',
          cell: function (g) {
            if (g.edge === null) return h('td', 'nd', '–');
            var td = h('td', Math.abs(g.edge) >= 3 ? (g.edge > 0 ? 'edge-pos' : 'edge-neg') : null, sgn(g.edge, 1));
            return td;
          } },
        { head: 'O/U', key: 'over_under', num: true,
          cell: function (g) { return h('td', 'nd', g.over_under === null ? '–' : num(g.over_under, 1)); } },
        { head: 'Result', key: 'actual_margin', num: true, cell: function (g) {
            if (!g.played) return h('td', 'nd', '–');
            return h('td', null, g.away_points + '–' + g.home_points);
          } }
      ];
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: vstate.gamesSort, asc: vstate.gamesAsc,
        rowClass: function () { return 'clickable'; },
        onSort: function (kk, isNum) {
          if (vstate.gamesSort === kk) vstate.gamesAsc = !vstate.gamesAsc;
          else { vstate.gamesSort = kk; vstate.gamesAsc = (kk === 'start_date' || !isNum); }
          buildGames();
        }
      });
      Array.prototype.forEach.call(tb.querySelectorAll('tbody tr'), function (tr, i) {
        tr.onclick = function () { sc.game = rows[i]; sc.game.week = vstate.week; vstate.scoutGame = rows[i].game_id; setView('scout'); };
      });
      cnt.textContent = rows.length + ' game' + (rows.length === 1 ? '' : 's');
      var withEdge = rows.filter(function (g) { return g.edge !== null; });
      var big = withEdge.filter(function (g) { return Math.abs(g.edge) >= 3; }).length;
      note.innerHTML = 'Projected margin is SP+ difference plus <b>2.2</b> points of home field, nothing else &mdash; ' +
        'a deliberately simple model you can check by hand. Market margin is the median closing line across every book in the feed. ' +
        (withEdge.length
          ? '<b>' + big + '</b> of ' + withEdge.length + ' games this week differ by three points or more. '
          : '') +
        'Click any row to scout the matchup: both teams side by side, with the box score once it is played. This is a description of the data, not a betting recommendation.';
    }
  }

  /* =====================================================================
     Game scouting page: both teams on one screen. Each side of the ball is
     shown as one team's offense against the other's defense, with national
     ranks, plus down-and-distance habits, where the ball goes, talent and
     who is unavailable. Built from the same endpoints as the team page.
     ===================================================================== */
  var SC_BOARD_NAME = { 'Miami (OH)': 'Miami (Ohio)', 'UCF': 'Central Florida', 'App State': 'Appalachian State', 'UL Monroe': 'Louisiana-Monroe',
    'UConn': 'Connecticut', "Hawai'i": 'Hawaii', 'Ole Miss': 'Mississippi', 'NC State': 'North Carolina State', 'San José State': 'San Jose State' };
  /* [key, label, format, direction for the offense: 1 higher is better, -1 lower is better, 0 neutral] */
  var SC_CORE = [
    ['epa_all', 'EPA per play', 's2', 1], ['sr_all', 'Success rate', 'p1', 1], ['explosive_rate', 'Explosive play rate', 'p1', 1],
    ['sr_run', 'Run success rate', 'p1', 1], ['epa_run', 'EPA per run', 's2', 1], ['stuff_rate', 'Runs stuffed at or behind the line', 'p1', -1],
    ['sr_pass', 'Dropback success rate', 'p1', 1], ['epa_pass', 'EPA per dropback', 's2', 1], ['explosive_pass_rate', 'Explosive pass rate', 'p1', 1],
    ['sr_standard', 'Success on standard downs', 'p1', 1], ['sr_passdown', 'Success on passing downs', 'p1', 1], ['sr_redzone', 'Red-zone success rate', 'p1', 1],
    ['pass_rate', 'Pass rate', 'p0', 0], ['plays_per_game', 'Plays per game', 'n1', 0]
  ];
  var SC_EXTRA = ['ppd', 'three_out', 'third_conv', 'rz_td', 'to_rate', 'pressure_rate', 'sack_rate', 'opp_rate', 'tfl_rate', 'yac_per_catch'];
  var SC_ZROWS = [['D', 'Deep 20+'], ['I', '10-19'], ['S', '0-9'], ['B', 'Behind']];
  var sc = { game: null, dir: 0, cache: {} };

  function scGet(url) {
    if (!sc.cache[url]) sc.cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function (e) { delete sc.cache[url]; throw e; });
    return sc.cache[url];
  }
  function scFmt(f, v) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    return f === 'p1' ? pct(v, 1) : f === 'p0' ? pct(v) : f === 's2' ? sgn(v, 2) : f === 'n1' ? num(v, 1) : num(v, 2);
  }
  /* rank of one team's value among every qualified FBS team, from the point of view of that side */
  function scRank(rows, team, key, good) {
    var me = rows.filter(function (r) { return r.team === team; })[0];
    if (!me || me[key] === null || me[key] === undefined) return { v: me ? me[key] : null };
    var pool = rows.filter(function (r) { return r.qualified !== false && r[key] !== null && r[key] !== undefined; });
    if (!good) return { v: me[key], pool: pool.length };
    var better = pool.filter(function (r) { return r.team !== team && (good > 0 ? r[key] > me[key] : r[key] < me[key]); }).length;
    return { v: me[key], rank: better + 1, pool: pool.length + (pool.some(function (r) { return r.team === team; }) ? 0 : 1) };
  }
  function scRankCell(m, fmt) {
    var td = h('td', 'scv');
    td.appendChild(h('span', 'scnum', scFmt(fmt, m.v)));
    if (m.rank) {
      var b = h('span', 'scrk', '#' + m.rank);
      b.title = m.rank + ' of ' + m.pool + ' FBS teams';
      td.appendChild(b);
      td.style.boxShadow = 'inset 4px 0 0 ' + shade(1 - (m.rank - 1) / Math.max(1, m.pool - 1));
    }
    return td;
  }
  /* which side of this matchup has the better national standing */
  function scEdge(o, d) {
    var td = h('td', 'scedge');
    if (!o.rank || !d.rank) { td.textContent = '–'; return td; }
    var po = 1 - (o.rank - 1) / Math.max(1, o.pool - 1), pd = 1 - (d.rank - 1) / Math.max(1, d.pool - 1), e = po - pd;
    var bar = h('span', 'scbar'), fill = h('i');
    fill.style.width = Math.min(50, Math.abs(e) * 50).toFixed(1) + '%';
    fill.style.left = e >= 0 ? '50%' : (50 - Math.min(50, Math.abs(e) * 50)).toFixed(1) + '%';
    fill.className = e >= 0 ? 'o' : 'd';
    bar.appendChild(fill); td.appendChild(bar);
    td.appendChild(h('span', 'sclean', Math.abs(e) < 0.15 ? 'even' : e > 0 ? 'offense' : 'defense'));
    return td;
  }

  function scoutURL(g) { return '?view=scout&game=' + g.game_id + '&week=' + (g.week || vstate.week); }

  function buildScout() {
    var g = sc.game;
    var root = document.getElementById('scoutBody');
    if (!g) {
      var id = vstate.scoutGame;
      if (!id) { setView('games'); return; }
      root.innerHTML = ''; root.appendChild(h('p', 'ax', 'Loading the game…'));
      scGet('api/games?season=' + state.season + '&week=' + (vstate.week || 1)).then(function (j) {
        var hit = (j.games || []).filter(function (x) { return x.game_id === id; })[0];
        if (!hit) { root.innerHTML = ''; root.appendChild(h('p', 'ax', 'That game is not on the week ' + vstate.week + ' slate.')); return; }
        hit.week = vstate.week; sc.game = hit; buildScout();
      }).catch(function (e) { root.innerHTML = ''; root.appendChild(h('p', 'ax', 'Could not load the game. ' + e.message)); });
      return;
    }
    var A = g.away_team, B = g.home_team, s = state.season;
    document.title = A + ' at ' + B + ' · The Post-Snap';
    document.getElementById('scoutEyebrow').textContent = 'Week ' + g.week + ' · ' + s + (g.start_date ? ' · ' + new Date(g.start_date).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') + (g.neutral_site ? ' · neutral site' : '');
    var t = document.getElementById('scoutTitle'); t.innerHTML = '';
    t.appendChild(h('span', null, A)); t.appendChild(h('span', 'scat', g.neutral_site ? ' vs ' : ' at ')); t.appendChild(h('span', null, B));
    var fav = g.projected_margin === null ? null : g.projected_margin >= 0 ? B : A;
    document.getElementById('scoutLede').textContent = g.played
      ? 'Final: ' + A + ' ' + g.away_points + ', ' + B + ' ' + g.home_points + '. Everything below is each team\'s season to date, so it shows what the matchup looked like going in.'
      : (fav ? 'The SP+ projection has ' + fav + ' by ' + num(Math.abs(g.projected_margin), 1) : 'No projection yet') +
        (g.market_margin !== null ? '; the market has ' + (g.market_margin >= 0 ? B : A) + ' by ' + num(Math.abs(g.market_margin), 1) + '.' : '.') +
        ' Below, each side of the ball is one team\'s offense against the other\'s defense, with every number\'s national rank.';
    var tiles = document.getElementById('scoutTiles'); tiles.innerHTML = '';
    [[A + ' SP+', g.away_sp === null ? '–' : num(g.away_sp, 1)], [B + ' SP+', g.home_sp === null ? '–' : num(g.home_sp, 1)],
     ['Projected (home)', g.projected_margin === null ? '–' : sgn(g.projected_margin, 1)], ['Market (home)', g.market_margin === null ? '–' : sgn(g.market_margin, 1)],
     ['Over / under', g.over_under === null ? '–' : num(g.over_under, 1)]].forEach(function (x) {
      var d = h('div', 'tile'); d.appendChild(h('span', 'k', x[0])); d.appendChild(h('span', 'v', x[1])); tiles.appendChild(d);
    });
    var links = document.getElementById('scoutLinks'); links.innerHTML = '';
    [[A, '?team=' + encodeURIComponent(A)], [B, '?team=' + encodeURIComponent(B)]].forEach(function (x) {
      var a = h('a', 'navlink', x[0] + ' team page →'); a.href = x[1]; links.appendChild(a);
    });
    if (g.played) { var bx = h('button', 'navlink', 'Box score →'); bx.type = 'button'; bx.onclick = function () { vstate.boxGame = g.game_id; setView('box'); }; links.appendChild(bx); }
    var mu = h('a', 'navlink', 'Talent matchup →'); mu.href = '/matchups'; links.appendChild(mu);

    root.innerHTML = '';
    var p1 = scPanel(root, '01', 'When ' + A + ' has the ball', A + '\'s offense against ' + B + '\'s defense. The colored edge on each number is its national rank among FBS teams from that unit\'s point of view (blue = better). The last column says which unit has the better national standing on that measure.');
    var p2 = scPanel(root, '02', 'When ' + B + ' has the ball', B + '\'s offense against ' + A + '\'s defense, read the same way.');
    var p3 = scPanel(root, '03', 'Down & distance', 'How often the offense passes in each situation against how often the defense sees a pass there, and how each does. The tick on each bar is the FBS average.');
    var p4 = scPanel(root, '04', 'Where the ball goes', 'Pass targets by depth and direction, and runs by lane. The offense side shows how often it goes there and its EPA rank; the defense side shows its EPA-allowed rank in the same zone.');
    var p5 = scPanel(root, '05', 'Talent and who is out', 'Recruiting talent of the players who actually take the snaps, from the matchup board, with national ranks. Players listed as unavailable are left out of projections.');
    [p1, p2, p3, p4, p5].forEach(function (p) { p.body.appendChild(h('p', 'ax', 'Loading…')); });

    var side = function (team, sd) { return 'team=' + encodeURIComponent(team) + '&season=' + s + '&side=' + sd; };
    Promise.all([scGet('api/board?season=' + s + '&side=Offense'), scGet('api/board?season=' + s + '&side=Defense'),
      scGet('api/extras?' + side(A, 'Offense')), scGet('api/extras?' + side(B, 'Defense')),
      scGet('api/extras?' + side(B, 'Offense')), scGet('api/extras?' + side(A, 'Defense'))])
      .then(function (r) {
        scMatchup(p1.body, A, B, r[0].teams || [], r[1].teams || [], r[2], r[3]);
        scMatchup(p2.body, B, A, r[0].teams || [], r[1].teams || [], r[4], r[5]);
      }).catch(function (e) { [p1, p2].forEach(function (p) { p.body.innerHTML = ''; p.body.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); }); });

    function directional() {
      var off = sc.dir === 0 ? A : B, def = sc.dir === 0 ? B : A;
      [p3, p4].forEach(function (p) {
        segs(p.ctl, [A + ' offense vs ' + B + ' defense', B + ' offense vs ' + A + ' defense'], sc.dir, function (i) { sc.dir = i; directional(); });
      });
      Promise.all([scGet('api/tendencies?' + side(off, 'Offense')), scGet('api/tendencies?' + side(def, 'Defense'))])
        .then(function (r) { scDowns(p3.body, off, def, r[0], r[1]); })
        .catch(function (e) { p3.body.innerHTML = ''; p3.body.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
      Promise.all([scGet('api/field?' + side(off, 'Offense')), scGet('api/field?' + side(def, 'Defense'))])
        .then(function (r) { scZones(p4.body, off, def, r[0].zones || {}, r[1].zones || {}); })
        .catch(function (e) { p4.body.innerHTML = ''; p4.body.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
    }
    directional();

    scExtra(root, A, B, s, g);
    scGet('api/matchups-data').then(function (D) { scTalent(p5.body, A, B, D); })
      .catch(function (e) { p5.body.innerHTML = ''; p5.body.appendChild(h('p', 'ax', 'Could not load the matchup board data. ' + e.message)); });
    if (window.__tlRescan) window.__tlRescan();
  }

  function scNameTh(name, rest) { var c = h('th'); c.appendChild(h('span', null, name)); c.appendChild(document.createTextNode(rest)); return c; }
  function scPanel(root, n, title, note) {
    var sec = h('section', 'panel'), head = h('div', 'phead');
    head.appendChild(h('p', 'num', n));
    var d = h('div'); d.appendChild(h('h2', null, title)); d.appendChild(h('p', null, note)); head.appendChild(d);
    sec.appendChild(head);
    var ctl = h('div', 'segs'); ctl.setAttribute('role', 'tablist');
    var wrap = h('div', 'subctl'); wrap.appendChild(ctl); sec.appendChild(wrap);
    var body = h('div'); sec.appendChild(body); root.appendChild(sec);
    if (n !== '03' && n !== '04') wrap.hidden = true;
    return { body: body, ctl: ctl };
  }

  function scMatchup(host, off, def, offRows, defRows, exO, exD) {
    host.innerHTML = '';
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    th.appendChild(h('th', null, 'Measure')); th.appendChild(scNameTh(off, ' offense')); th.appendChild(scNameTh(def, ' defense')); th.appendChild(h('th', null, 'Edge'));
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody');
    SC_CORE.forEach(function (m) {
      var o = scRank(offRows, off, m[0], m[3]), d = scRank(defRows, def, m[0], -m[3]);
      var tr = h('tr'); tr.appendChild(h('td', 'pclab', m[1]));
      tr.appendChild(scRankCell(o, m[2])); tr.appendChild(scRankCell(d, m[2]));
      tr.appendChild(m[3] ? scEdge(o, d) : h('td', 'scedge nd', 'style'));
      tb.appendChild(tr);
    });
    var MO = (exO && exO.metrics) || {}, MD = (exD && exD.metrics) || {};
    var sep = h('tr', 'sect'); var sc0 = h('td', 'pcsec', 'Drives, pressure, 3rd down'); sc0.colSpan = 4; sep.appendChild(sc0); tb.appendChild(sep);
    SC_EXTRA.forEach(function (k) {
      var mo = MO[k], md = MD[k]; if (!mo && !md) return;
      var neutral = (mo || md).dir === 0 || (mo || md).dir === 2;
      var o = mo ? { v: mo.v, rank: neutral ? null : mo.rank, pool: mo.pool } : { v: null }, d = md ? { v: md.v, rank: neutral ? null : md.rank, pool: md.pool } : { v: null };
      var tr = h('tr'); tr.appendChild(h('td', 'pclab', (mo || md).label));
      var f = /rate|three_out|third_conv|rz_td/.test(k) ? 'p1' : k === 'ppd' ? 'n2' : 'n1';
      tr.appendChild(scRankCell(o, f)); tr.appendChild(scRankCell(d, f)); tr.appendChild(neutral ? h('td', 'scedge nd', '–') : scEdge(o, d));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
    var oWins = 0, dWins = 0;
    [].forEach.call(tb.querySelectorAll('.sclean'), function (x) { if (x.textContent === 'offense') oWins++; else if (x.textContent === 'defense') dWins++; });
    host.appendChild(h('p', 'tblnote', off + '\'s offense ranks better on ' + oWins + ' of these measures, ' + def + '\'s defense on ' + dWins + '; the rest are within 15 percentile points. ' +
      'Season to date, all opponents. Ranks come from every FBS team on the same side of the ball.'));
  }

  function scDowns(host, off, def, jo, jd) {
    host.innerHTML = '';
    var pick = function (j) { var m = {}; (j.groups || []).forEach(function (g) { if (g.grp === 'dd') m[g.key] = g; }); return m; };
    var O = pick(jo), Dd = pick(jd), keys = (jo.groups || []).filter(function (g) { return g.grp === 'dd'; }).map(function (g) { return g.key; });
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    th.appendChild(h('th', null, 'Situation')); th.appendChild(scNameTh(off, ' passes')); th.appendChild(scNameTh(def, ' sees a pass')); th.appendChild(scNameTh(off, ' SR')); th.appendChild(scNameTh(def, ' SR allowed'));
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody');
    function bar(g) {
      var td = h('td', 'pcbar');
      if (!g || g.pass_rate == null) { td.textContent = '–'; return td; }
      td.innerHTML = '<span class="pcb tdb"><i style="width:' + (g.pass_rate * 100).toFixed(1) + '%"></i>' + (g.nat_pass_rate != null ? '<b style="left:' + (g.nat_pass_rate * 100).toFixed(1) + '%"></b>' : '') +
        '</span><span class="pcv">' + pct(g.pass_rate) + '</span> <span class="ax">' + g.plays + '</span>';
      return td;
    }
    function sr(g, defView) {
      var td = h('td', 'scv'); if (!g || g.sr == null) { td.textContent = '–'; return td; }
      td.textContent = pct(g.sr);
      if (g.nat_sr != null && g.plays >= 10) { var d = (g.sr - g.nat_sr) * (defView ? -1 : 1); td.style.boxShadow = 'inset 4px 0 0 ' + shade(Math.max(0, Math.min(1, 0.5 + d * 2.5))); }
      return td;
    }
    keys.forEach(function (k) {
      var a = O[k], b = Dd[k], tr = h('tr');
      tr.appendChild(h('td', 'pclab', (a || b).label));
      tr.appendChild(bar(a)); tr.appendChild(bar(b)); tr.appendChild(sr(a, false)); tr.appendChild(sr(b, true));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
    host.appendChild(h('p', 'tblnote', 'Small grey numbers are plays. Success-rate shading compares with the FBS average in the same situation (blue = better for that unit). For the full breakdown open either team page, Playcalling tab.'));
  }

  function scZones(host, off, def, ZO, ZD) {
    host.innerHTML = '';
    var grid = h('div', 'sczones');
    function board(title, Z, isOff) {
      var card = h('div', 'sczcard'), h3 = h('h3'); h3.appendChild(h('span', null, title[0])); h3.appendChild(document.createTextNode(title[1])); card.appendChild(h3);
      var t = h('table', 'sczt'), hr = h('tr'); hr.appendChild(h('th', null, ''));
      ['Left', 'Middle', 'Right'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); t.appendChild(hr);
      function cell(z) {
        var td = h('td', 'scz'), m = Z[z];
        if (!m || !m.n) { td.textContent = '–'; td.className = 'scz nd'; return td; }
        var rk = m.rk_epa, pool = m.pool || 136;
        td.innerHTML = (isOff ? '<b>' + pct(m.share) + '</b>' : '<b>' + sgn(m.epa, 2) + '</b>') + '<span>' + (rk ? '#' + rk : '') + '</span>';
        td.style.background = rk ? shade(1 - (rk - 1) / Math.max(1, pool - 1)) : '';
        td.title = (isOff ? off + ' offense' : def + ' defense') + ' · ' + m.n + ' plays · EPA ' + sgn(m.epa, 2) + (rk ? ' (#' + rk + ' of ' + pool + ')' : '') + ' · share ' + pct(m.share);
        return td;
      }
      SC_ZROWS.forEach(function (r) {
        var tr = h('tr'); tr.appendChild(h('th', null, r[1]));
        ['L', 'M', 'R'].forEach(function (c) { tr.appendChild(cell(r[0] + c)); }); t.appendChild(tr);
      });
      var rr = h('tr', 'sect'); rr.appendChild(h('th', null, 'Runs'));
      ['L', 'M', 'R'].forEach(function (c) { rr.appendChild(cell('R' + c)); }); t.appendChild(rr);
      card.appendChild(t); grid.appendChild(card);
    }
    board([off, ' offense: share of targets / runs, EPA rank'], ZO, true);
    board([def, ' defense: EPA allowed, rank'], ZD, false);
    host.appendChild(grid);
    host.appendChild(h('p', 'tblnote', 'Cell color is the national EPA rank in that zone from each unit\'s point of view (blue = better). A dark-blue offensive zone meeting a red defensive zone is where the offense should find room. Open the team page, On the field tab, for every play.'));
  }

  function scTalent(host, A, B, D) {
    host.innerHTML = '';
    var nA = SC_BOARD_NAME[A] || A, nB = SC_BOARD_NAME[B] || B, T = D.talent || {};
    if (!T[nA] || !T[nB]) { host.appendChild(h('p', 'ax', 'Talent figures cover FBS teams only.')); return; }
    function val(team, k) { var r = T[team] && T[team][k] && T[team][k].ALL; return r ? r[2] : null; }
    function rank(team, k) {
      var v = val(team, k); if (v === null) return null;
      var n = 0, pool = 0; Object.keys(T).forEach(function (t) { var x = val(t, k); if (x === null) return; pool++; if (x > v) n++; });
      return { v: v, rank: n + 1, pool: pool };
    }
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    ['Unit (most-used players)', A, B, 'Edge'].forEach(function (x) { th.appendChild(h('th', null, x)); });
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody');
    [['O11', 'Offense, Starting 11'], ['O22', 'Offense, Two-Deep'], ['O33', 'Offense, Three-Deep'], ['D11', 'Defense, Starting 11'], ['D22', 'Defense, Two-Deep'], ['D33', 'Defense, Three-Deep']].forEach(function (u) {
      var a = rank(nA, u[0]), b = rank(nB, u[0]); if (!a || !b) return;
      var tr = h('tr'); tr.appendChild(h('td', 'pclab', u[1]));
      tr.appendChild(scRankCell(a, 'n1')); tr.appendChild(scRankCell(b, 'n1'));
      var e = h('td', 'scedge'), d = a.v - b.v;
      if (Math.abs(d) < 1) e.textContent = 'even'; else { e.appendChild(h('span', null, d > 0 ? A : B)); e.appendChild(document.createTextNode(' +' + num(Math.abs(d), 1))); }
      tr.appendChild(e);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
    var out = h('div', 'scout2');
    [[A, nA], [B, nB]].forEach(function (x) {
      var card = h('div', 'sczcard'); card.appendChild(h('h3', null, x[0] + ': not available'));
      var list = (D.players || []).filter(function (p) { return p[0] === x[1] && p[17] && p[20] !== 'idle'; });
      var idle = (D.players || []).filter(function (p) { return p[0] === x[1] && p[17] && p[20] === 'idle'; });
      if (!list.length && !idle.length) card.appendChild(h('p', 'ax', 'Nobody among the regulars is listed out.'));
      list.concat(idle).slice(0, 12).forEach(function (p) {
        var r = h('p', 'scout');
        r.innerHTML = '<b></b> <span class="ax"></span><br><span class="bo"></span> <span class="ax"></span>';
        r.children[0].textContent = p[4]; r.children[1].textContent = p[3];
        r.children[3].textContent = p[17]; r.children[4].textContent = p[18] || '';
        card.appendChild(r);
      });
      out.appendChild(card);
    });
    host.appendChild(out);
    host.appendChild(h('p', 'tblnote', 'Talent is the snap-weighted recruiting percentile of the players who take the snaps (unrated players left out), ranked across FBS. ' +
      ((D.avail && D.avail.through) ? 'Availability: ' + D.avail.through + '. ' : '') + 'The full model, with projections by tier, is on the Matchups page.'));
  }

  /* =====================================================================
     Player pages: national ranks among FBS players, a game log, where his
     targets / throws / carries go (from the play-by-play), and PFF snaps,
     recruiting ratings and availability from the matchup board.
     ===================================================================== */
  var PL_SVC = ['247Sports', '247 Composite', 'On3', 'On3 Industry', 'ESPN', 'Rivals'];
  function plAbbr(name) {
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    if (parts.length < 2) return String(name || '').toLowerCase();
    return (parts[0].charAt(0) + '.' + parts.slice(1).join(' ')).toLowerCase();
  }
  function plKey(s) { return String(s || '').toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/, '').replace(/[^a-z.]/g, ''); }
  function plSame(pbpName, full) { return !!pbpName && plKey(pbpName) === plKey(plAbbr(full)); }

  function openPlayer(id, team) {
    vstate.player = { id: +id, team: team || state.team };
    setView('player');
  }
  function playerLink(name, id, team) {
    if (!id) return document.createTextNode(name);
    var a = h('a', 'plink', name);
    a.href = '?view=player&id=' + id + '&team=' + encodeURIComponent(team || state.team);
    a.onclick = function (e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); openPlayer(id, team); };
    return a;
  }

  function buildPlayer() {
    var P = vstate.player, root = document.getElementById('playerBody');
    if (!P || !P.id) { setView('team'); return; }
    var s = state.season;
    root.innerHTML = ''; root.appendChild(h('p', 'ax', 'Loading the player…'));
    document.getElementById('playerTitle').textContent = '…';
    scGet('api/player?id=' + P.id + '&season=' + s).then(function (j) {
      if (j.error) { root.innerHTML = ''; root.appendChild(h('p', 'ax', 'No ' + s + ' stats for this player. Try another season in the menu above.')); return; }
      paintPlayer(j);
    }).catch(function (e) { root.innerHTML = ''; root.appendChild(h('p', 'ax', 'Could not load the player. ' + e.message)); });
  }

  function plRole(t) {
    if ((t.pass_att || 0) >= 20) return 'qb';
    if ((t.rec || 0) >= Math.max(3, (t.rush_att || 0) / 3)) return 'rec';
    if ((t.rush_att || 0) >= 5) return 'rush';
    if ((t.tackles || 0) > 0 || (t.pass_defended || 0) > 0) return 'def';
    return (t.rec || 0) > 0 ? 'rec' : 'rush';
  }

  function paintPlayer(j) {
    var T = j.totals || {}, role = plRole(T), team = j.team, root = document.getElementById('playerBody');
    document.title = j.athlete + ' · ' + team + ' · The Post-Snap';
    document.getElementById('playerEyebrow').textContent = team + ' · ' + (j.position || '') + ' · ' + j.season + ' · ' + j.games_played + ' games';
    document.getElementById('playerTitle').textContent = j.athlete;
    var tiles = document.getElementById('playerTiles'); tiles.innerHTML = '';
    var R = {}; (j.ranks || []).forEach(function (r) { R[r.k] = r; });
    var TILE = {
      qb: [['Passing yards', 'pass_yds'], ['Yds / att', 'ypa'], ['Pass TD', 'pass_td'], ['Completion', 'cmp_pct'], ['Rushing yards', 'rush_yds']],
      rec: [['Receptions', 'rec'], ['Receiving yards', 'rec_yds'], ['Yds / catch', 'ypr'], ['Rec TD', 'rec_td']],
      rush: [['Rushing yards', 'rush_yds'], ['Yds / carry', 'ypc'], ['Rush TD', 'rush_td'], ['Receiving yards', 'rec_yds']],
      def: [['Tackles', 'tackles'], ['TFL', 'tfl'], ['Sacks', 'sacks'], ['Passes defended', 'pass_defended'], ['INT', 'ints_made']]
    }[role];
    TILE.forEach(function (x) {
      var r = R[x[1]], v = r ? r.v : T[x[1]];
      if (v === null || v === undefined) return;
      var d = h('div', 'tile'); d.appendChild(h('span', 'k', x[0]));
      d.appendChild(h('span', 'v', x[1] === 'cmp_pct' ? pct(v, 1) : /^y/.test(x[1]) ? num(v, 1) : String(Math.round(v * 10) / 10)));
      if (r && r.rank) d.appendChild(h('span', 'r', '#' + r.rank + ' of ' + r.pool + ' FBS'));
      tiles.appendChild(d);
    });
    var links = document.getElementById('playerLinks'); links.innerHTML = '';
    var a = h('a', 'navlink', team + ' team page →'); a.href = '?team=' + encodeURIComponent(team); links.appendChild(a);

    root.innerHTML = '';
    /* 01 national ranks */
    var p1 = scPanel(root, '01', 'Against the country', 'Every counting stat he has, ranked against all FBS players this season. Rate stats need a minimum workload (100 attempts, 50 carries or 20 catches) to be ranked.');
    p1.body.innerHTML = '';
    var grid = h('div', 'excards');
    (j.ranks || []).forEach(function (r) {
      var c = h('div', 'excard'); c.appendChild(h('p', 'exl', r.label));
      c.appendChild(h('p', 'exv', r.k === 'cmp_pct' ? pct(r.v, 1) : /^(ypa|ypc|ypr)$/.test(r.k) ? num(r.v, 1) : String(+r.v)));
      c.appendChild(h('p', 'exr', r.rank ? '#' + r.rank + ' of ' + r.pool + ' FBS players' : 'below the minimum to rank'));
      if (r.rank && r.pool > 1) c.style.boxShadow = 'inset 4px 0 0 ' + shade(1 - (r.rank - 1) / (r.pool - 1));
      grid.appendChild(c);
    });
    p1.body.appendChild(grid);

    /* 02 game log */
    var p2 = scPanel(root, '02', 'Game by game', 'His line in every game this season, from the official game book. Tap a game for the box score.');
    p2.body.innerHTML = '';
    var COLS = {
      qb: [['C/A', function (g) { return g.pass_att ? g.pass_comp + '/' + g.pass_att : '–'; }], ['Pass yds', 'pass_yds'], ['TD', 'pass_td'], ['INT', 'pass_int'], ['Car', 'rush_att'], ['Rush yds', 'rush_yds'], ['Rush TD', 'rush_td']],
      rec: [['Rec', 'rec'], ['Yds', 'rec_yds'], ['TD', 'rec_td'], ['Car', 'rush_att'], ['Rush yds', 'rush_yds']],
      rush: [['Car', 'rush_att'], ['Yds', 'rush_yds'], ['TD', 'rush_td'], ['Rec', 'rec'], ['Rec yds', 'rec_yds']],
      def: [['Tkl', 'tackles'], ['TFL', 'tfl'], ['Sacks', 'sacks'], ['PD', 'pass_defended'], ['INT', 'ints_made']]
    }[role];
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    ['Wk', 'Opponent', 'Result'].concat(COLS.map(function (c) { return c[0]; })).forEach(function (x) { th.appendChild(h('th', null, x)); });
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody');
    (j.games || []).forEach(function (g) {
      var tr = h('tr', 'clickable');
      tr.appendChild(h('td', 'nd', String(g.week)));
      tr.appendChild(h('td', 'pclab', (g.ha === 'A' ? '@ ' : '') + g.opp));
      tr.appendChild(h('td', 'nd', g.pf === null ? '–' : (g.pf > g.pa ? 'W ' : g.pf < g.pa ? 'L ' : 'T ') + g.pf + '-' + g.pa));
      COLS.forEach(function (c) {
        var v = typeof c[1] === 'function' ? c[1](g) : g[c[1]];
        tr.appendChild(h('td', 'nd', v === null || v === undefined ? '–' : String(v)));
      });
      tr.onclick = function () { vstate.boxGame = g.game_id; setView('box'); };
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); p2.body.appendChild(wrap);

    /* 03 where the ball goes */
    var p3 = scPanel(root, '03', role === 'qb' ? 'Where he throws' : role === 'def' ? 'On the field' : role === 'rush' ? 'Where he runs' : 'Where his targets go',
      role === 'qb' ? 'Every throw with a recorded spot, by depth past the line of scrimmage and direction, plus his designed runs and scrambles by lane.'
        : role === 'def' ? 'Play-by-play target and carry maps are drawn for ball carriers and passers.'
        : 'Read from the play-by-play: every target at the spot it was caught or thrown to, and every carry by lane.');
    if (role === 'def') p3.body.parentNode.remove();
    else scGet('api/field?team=' + encodeURIComponent(team) + '&season=' + j.season + '&side=Offense').then(function (F) {
      plField(p3.body, j, role, F);
    }).catch(function (e) { p3.body.innerHTML = ''; p3.body.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });

    /* 04 snaps, recruiting, availability */
    var p4 = scPanel(root, role === 'def' ? '03' : '04', 'Snaps and recruiting', 'PFF snap counts and his recruiting ratings from each service, as used by the talent index and the matchup board.');
    scGet('api/matchups-data').then(function (D) { plBoard(p4.body, j, D); })
      .catch(function (e) { p4.body.innerHTML = ''; p4.body.appendChild(h('p', 'ax', 'Could not load the matchup board data. ' + e.message)); });
    if (window.__tlRescan) window.__tlRescan();
  }

  function plField(host, j, role, F) {
    host.innerHTML = '';
    var name = j.athlete, passes = F.passes || [], runs = F.runs || [];
    var mine = role === 'qb'
      ? passes.filter(function (p) { var m = /#?\d*\s*([A-Za-z.'-]+(?: [A-Za-z.'-]+)?(?: (?:Jr|Sr|II|III|IV)\.?)?) pass/.exec(p[15] || ''); return m && plSame(m[1], name); })
      : passes.filter(function (p) { return plSame(p[7], name); });
    var myRuns = runs.filter(function (r) { return plSame(r[4], name); });
    var Z = {};
    mine.forEach(function (p) {
      var z = p[17]; if (!z) return;
      var o = Z[z] = Z[z] || { n: 0, c: 0, y: 0, e: 0, td: 0 };
      o.n++; if (p[2] === 'C') o.c++; o.y += p[4] || 0; o.e += +p[5] || 0; o.td += p[3] || 0;
    });
    myRuns.forEach(function (r) {
      var z = 'R' + r[0]; if (!r[0]) return;
      var o = Z[z] = Z[z] || { n: 0, c: 0, y: 0, e: 0, td: 0 };
      o.n++; o.y += r[1] || 0; o.e += +r[2] || 0; o.td += r[6] || 0;
    });
    var nPass = mine.filter(function (p) { return p[17]; }).length, nRun = myRuns.filter(function (r) { return r[0]; }).length;
    if (!nPass && !nRun) { host.appendChild(h('p', 'ax', 'No targets or carries with a recorded spot matched his name in the play-by-play.')); return; }
    var card = h('div', 'sczcard'), tbl = h('table', 'sczt'), hr = h('tr'); hr.appendChild(h('th', null, ''));
    ['Left', 'Middle', 'Right'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    var maxN = 0; Object.keys(Z).forEach(function (k) { maxN = Math.max(maxN, Z[k].n); });
    function cell(z, isRun) {
      var td = h('td', 'scz'), o = Z[z];
      if (!o) { td.className = 'scz nd'; td.textContent = '–'; return td; }
      var share = o.n / (isRun ? nRun : nPass);
      td.innerHTML = '<b>' + o.n + '</b><span>' + (isRun ? num(o.y / o.n, 1) + ' ypc' : (o.c + '/' + o.n) + ' · ' + o.y + ' yds') + '</span>';
      var epa = o.e / o.n;
      td.style.background = shade(Math.max(0, Math.min(1, 0.5 + epa * 0.9)));
      td.title = o.n + (isRun ? ' carries' : ' targets') + ' (' + pct(share) + ') · ' + o.y + ' yds · EPA/play ' + sgn(epa, 2) + (o.td ? ' · ' + o.td + ' TD' : '');
      return td;
    }
    SC_ZROWS.forEach(function (r) { var tr = h('tr'); tr.appendChild(h('th', null, r[1])); ['L', 'M', 'R'].forEach(function (c) { tr.appendChild(cell(r[0] + c, false)); }); tbl.appendChild(tr); });
    var rr = h('tr', 'sect'); rr.appendChild(h('th', null, role === 'qb' ? 'His runs' : 'Carries')); ['L', 'M', 'R'].forEach(function (c) { rr.appendChild(cell('R' + c, true)); }); tbl.appendChild(rr);
    card.appendChild(tbl);
    var comp = mine.filter(function (p) { return p[2] === 'C' && p[0] !== null; });
    var air = mine.filter(function (p) { return p[0] !== null; });
    var stats = h('div', 'excards');
    [[role === 'qb' ? 'Throws with a spot' : 'Targets with a spot', String(nPass)],
     ['Average depth (aDOT)', air.length ? num(air.reduce(function (s, p) { return s + p[0]; }, 0) / air.length, 1) + ' yds' : '–'],
     [role === 'qb' ? 'Completion rate' : 'Catch rate', nPass ? pct(mine.filter(function (p) { return p[2] === 'C'; }).length / mine.length, 0) : '–'],
     ['Yards after catch / catch', comp.length ? num(comp.reduce(function (s, p) { return s + ((p[4] || 0) - p[0]); }, 0) / comp.length, 1) + ' yds' : '–'],
     ['EPA per ' + (role === 'qb' ? 'throw' : 'target'), mine.length ? sgn(mine.reduce(function (s, p) { return s + (+p[5] || 0); }, 0) / mine.length, 2) : '–'],
     ['Carries by lane', String(nRun)]].forEach(function (x) {
      var c = h('div', 'excard'); c.appendChild(h('p', 'exl', x[0])); c.appendChild(h('p', 'exv', x[1])); stats.appendChild(c);
    });
    var two = h('div', 'scout2'); two.appendChild(card); two.appendChild(stats); host.appendChild(two);
    host.appendChild(h('p', 'tblnote', 'Each cell shows ' + (role === 'qb' ? 'throws' : 'targets') + ', completions and yards; color is EPA per play (blue = good for the offense). ' +
      'Names are matched to the play-by-play by first initial and last name, so a teammate with the same initial and surname would be counted together. Interceptions and throws with no spot are not placed.'));
  }

  function plBoard(host, j, D) {
    host.innerHTML = '';
    var team = SC_BOARD_NAME[j.team] || j.team, key = plKey(j.athlete), abbr = plKey(plAbbr(j.athlete));
    var rows = (D.players || []).filter(function (p) { return p[0] === team; });
    var hit = rows.filter(function (p) { return plKey(p[4]) === key; })[0] || rows.filter(function (p) { return plKey(plAbbr(p[4])) === abbr; })[0];
    if (!hit) { host.appendChild(h('p', 'ax', 'He is not among the ' + team + ' players the matchup board tracks (the most-used players on each side).')); return; }
    var cards = h('div', 'excards');
    [['Depth-chart slot', hit[3] || '–'], ['Class', hit[5] || '–'], ['PFF snaps this season', hit[15] != null ? hit[15] + ' in ' + hit[16] + ' games' : '–'],
     ['Came from', hit[12] ? hit[12] + ' (transfer)' : (hit[6] === 'T' ? 'Transfer' : 'High school recruit')],
     ['Status', hit[17] || 'Available']].forEach(function (x) {
      var c = h('div', 'excard'); c.appendChild(h('p', 'exl', x[0])); c.appendChild(h('p', 'exv', String(x[1]))); cards.appendChild(c);
    });
    host.appendChild(cards);
    if (hit[17] && hit[18]) host.appendChild(h('p', 'tblnote', hit[18]));
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    ['Service', 'Rating', 'Stars', 'Percentile among FBS players', 'Basis'].forEach(function (x) { th.appendChild(h('th', null, x)); });
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody');
    (hit[10] || []).forEach(function (r, i) {
      var tr = h('tr'); tr.appendChild(h('td', 'pclab', PL_SVC[i] || ''));
      tr.appendChild(h('td', 'nd', r[0] == null ? '–' : String(r[0])));
      tr.appendChild(h('td', 'nd', r[1] == null ? '–' : '★'.repeat(r[1])));
      tr.appendChild(h('td', 'nd', r[3] == null ? '–' : num(r[3], 1)));
      tr.appendChild(h('td', 'nd', { H: 'High school rating', T: 'Transfer rating', U: 'Unrated' }[r[2]] || r[2] || ''));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
    host.appendChild(h('p', 'tblnote', 'Snaps from PFF; ratings from each recruiting service. Matched to the matchup board by name and team.'));
  }

  /* =====================================================================
     Phase 4: betting record, talent and availability, year over year,
     win probability and drive charts, and playoff odds.
     ===================================================================== */
  var SC_SITE_NAME = {}; Object.keys(SC_BOARD_NAME).forEach(function (k) { SC_SITE_NAME[SC_BOARD_NAME[k]] = k; });
  function siteName(b) { return SC_SITE_NAME[b] || b; }
  function tbl(heads) {
    var wrap = h('div', 'tablewrap'), t = h('table', 'sctab'), th = h('tr');
    heads.forEach(function (x) { th.appendChild(h('th', null, x)); });
    var thead = h('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = h('tbody'); t.appendChild(tb); wrap.appendChild(t);
    return { wrap: wrap, tb: tb };
  }
  function td(cls, txt) { return h('td', cls, txt === null || txt === undefined ? '–' : String(txt)); }

  /* ---- against the spread (team page, Overview) ---- */
  function buildATS() {
    var host = document.getElementById('atsBody'); if (!host) return;
    host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading…'));
    var team = state.team, s = state.season;
    scGet('api/ats?team=' + encodeURIComponent(team) + '&season=' + s).then(function (j) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      var S = j.summary;
      if (!S || !(j.games || []).length) { host.appendChild(h('p', 'ax', 'No closing lines on file for ' + team + ' in ' + s + '.')); return; }
      var cards = h('div', 'excards');
      [['Against the spread', S.w + '-' + S.l + (S.p ? '-' + S.p : ''), S.rk ? '#' + S.rk + ' of ' + S.pool + ' by cover rate' : ''],
       ['Beat the line by, per game', sgn(S.avg_cover, 1), '#' + S.rk_margin + ' of ' + S.pool],
       ['Overs / unders', S.o + ' over, ' + S.u + ' under', '']].forEach(function (x, i) {
        var c = h('div', 'excard'); c.appendChild(h('p', 'exl', x[0])); c.appendChild(h('p', 'exv', x[1])); if (x[2]) c.appendChild(h('p', 'exr', x[2]));
        if (i < 2 && S.pool > 1) { var rk = i === 0 ? S.rk : S.rk_margin; c.style.boxShadow = 'inset 4px 0 0 ' + shade(1 - (rk - 1) / (S.pool - 1)); }
        cards.appendChild(c);
      });
      host.appendChild(cards);
      var T = tbl(['Wk', 'Opponent', 'Line', 'Result', 'vs line', 'ATS', 'Total', 'O/U']);
      j.games.forEach(function (g) {
        var tr = h('tr', 'clickable');
        tr.appendChild(td('nd', g.week));
        tr.appendChild(td('pclab', (g.neutral ? 'vs ' : g.home ? '' : '@ ') + g.opp));
        tr.appendChild(td('nd', g.line > 0 ? '+' + num(g.line, 1) : num(g.line, 1)));
        tr.appendChild(td('nd', (g.margin > 0 ? 'W by ' : g.margin < 0 ? 'L by ' : 'T ') + Math.abs(g.margin)));
        var b = td('nd', sgn(g.beat_by, 1)); b.style.boxShadow = 'inset 4px 0 0 ' + shade(Math.max(0, Math.min(1, 0.5 + g.beat_by / 30))); tr.appendChild(b);
        tr.appendChild(td('nd', g.cover > 0 ? 'Covered' : g.cover < 0 ? 'Missed' : 'Push'));
        tr.appendChild(td('nd', g.total + (g.ou_line != null ? ' (' + num(g.ou_line, 1) + ')' : '')));
        tr.appendChild(td('nd', g.ou > 0 ? 'Over' : g.ou < 0 ? 'Under' : g.ou === 0 ? 'Push' : '–'));
        tr.onclick = function () { vstate.boxGame = g.game_id; setView('box'); };
        T.tb.appendChild(tr);
      });
      host.appendChild(T.wrap);
      host.appendChild(h('p', 'tblnote', 'Closing consensus line from the betting feed, from ' + team + '\'s side (negative = favored). "vs line" is the final margin plus the line: positive means they beat the number. Records, not recommendations.'));
    }).catch(function (e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }

  /* ---- talent and who is out (team page, Players & units) ---- */
  function buildTeamTalent() {
    var host = document.getElementById('talBody'); if (!host) return;
    host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading the matchup board data…'));
    var team = state.team;
    scGet('api/matchups-data').then(function (D) {
      if (team !== state.team) return;
      host.innerHTML = '';
      var b = SC_BOARD_NAME[team] || team, T = D.talent || {};
      if (!T[b]) { host.appendChild(h('p', 'ax', 'Talent figures cover the current FBS season only.')); return; }
      function val(t, k, yr) { var src = yr ? D.talent27 : T; var r = src[t] && src[t][k] && src[t][k].ALL; return r ? r[2] : null; }
      function rank(t, k, yr) {
        var v = val(t, k, yr); if (v === null) return null;
        var n = 0, pool = 0; Object.keys(T).forEach(function (x) { var y = val(x, k, yr); if (y === null) return; pool++; if (y > v) n++; });
        return { v: v, rank: n + 1, pool: pool };
      }
      var X = tbl(['Unit (most-used players)', 'This season', '2027 returning']);
      [['O11', 'Offense, Starting 11'], ['O22', 'Offense, Two-Deep'], ['O33', 'Offense, Three-Deep'], ['D11', 'Defense, Starting 11'], ['D22', 'Defense, Two-Deep'], ['D33', 'Defense, Three-Deep']].forEach(function (u) {
        var a = rank(b, u[0]), c = D.talent27 ? rank(b, u[0], 1) : null; if (!a) return;
        var tr = h('tr'); tr.appendChild(h('td', 'pclab', u[1])); tr.appendChild(scRankCell(a, 'n1')); tr.appendChild(c ? scRankCell(c, 'n1') : td('nd', '–'));
        X.tb.appendChild(tr);
      });
      host.appendChild(X.wrap);
      var out = (D.players || []).filter(function (p) { return p[0] === b && p[17]; });
      var card = h('div', 'sczcard'); card.appendChild(h('h3', null, out.length ? out.length + ' regular' + (out.length === 1 ? '' : 's') + ' not available' : 'Everyone available'));
      if (!out.length) card.appendChild(h('p', 'ax', 'Nobody among the most-used players is listed out.'));
      out.sort(function (x, y) { return (x[20] === 'idle') - (y[20] === 'idle') || x[2] - y[2]; }).forEach(function (p) {
        var r = h('p', 'scout');
        r.innerHTML = '<b></b> <span class="ax"></span><br><span class="bo"></span> <span class="ax"></span>';
        r.children[0].textContent = p[4]; r.children[1].textContent = p[3] + (p[15] != null ? ' · ' + p[15] + ' snaps' : '');
        r.children[3].textContent = p[17]; r.children[4].textContent = p[18] || '';
        card.appendChild(r);
      });
      host.appendChild(card);
      host.appendChild(h('p', 'tblnote', 'Talent is the snap-weighted recruiting percentile of the players who take the snaps, ranked across FBS; "2027 returning" drops seniors and anyone listed as leaving. ' +
        ((D.avail && D.avail.through) ? 'Availability: ' + D.avail.through + '. ' : '') + 'Full model on the Matchups page.'));
    }).catch(function (e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load the matchup board data. ' + e.message)); });
  }

  /* ---- year over year (team page, Compare) ---- */
  state.yoySide = state.yoySide || 0;
  function buildYoY() {
    var host = document.getElementById('yoyBody'); if (!host) return;
    var team = state.team, s = state.season, side = state.yoySide ? 'Defense' : 'Offense';
    segs(document.getElementById('yoyTabs'), ['Offense', 'Defense'], state.yoySide, function (i) { state.yoySide = i; buildYoY(); });
    host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading…'));
    Promise.all([scGet('api/board?season=' + (s - 1) + '&side=' + side), scGet('api/board?season=' + s + '&side=' + side)]).then(function (r) {
      if (team !== state.team || s !== state.season) return;
      host.innerHTML = '';
      var prev = r[0].teams || [], cur = r[1].teams || [];
      if (!prev.some(function (x) { return x.team === team; })) { host.appendChild(h('p', 'ax', team + ' has no FBS numbers for ' + (s - 1) + '.')); return; }
      var dir = side === 'Offense' ? 1 : -1;
      var X = tbl(['Measure', String(s - 1), String(s), 'Change']);
      SC_CORE.forEach(function (m) {
        var a = scRank(prev, team, m[0], m[3] * dir), b = scRank(cur, team, m[0], m[3] * dir);
        var tr = h('tr'); tr.appendChild(h('td', 'pclab', m[1])); tr.appendChild(scRankCell(a, m[2])); tr.appendChild(scRankCell(b, m[2]));
        var c = h('td', 'scedge');
        if (a.v != null && b.v != null) {
          var d = b.v - a.v;
          if (m[2] === 'p1' || m[2] === 'p0') c.textContent = (d > 0 ? '+' : '') + (d * 100).toFixed(1) + ' pts';
          else c.textContent = (d > 0 ? '+' : '') + num(d, m[2] === 'n1' ? 1 : 2);
          if (a.rank && b.rank) { var mv = a.rank - b.rank; c.appendChild(h('span', 'scrk', mv === 0 ? 'same rank' : (mv > 0 ? '▲ ' : '▼ ') + Math.abs(mv) + ' spots')); }
          if (m[3]) { var better = d * m[3] * dir > 0; c.style.color = Math.abs(d) < 1e-9 ? '' : better ? 'var(--s1)' : 'var(--s2)'; }
        } else c.textContent = '–';
        tr.appendChild(c); X.tb.appendChild(tr);
      });
      host.appendChild(X.wrap);
      host.appendChild(h('p', 'tblnote', 'Full ' + (s - 1) + ' season against ' + s + ' to date. Ranks are among every FBS team in that season' + (side === 'Defense' ? ', from the defense\'s point of view' : '') + '. Blue change = better.'));
    }).catch(function (e) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }

  /* ---- win probability and drive chart (box score) ---- */
  function buildFlow(j) {
    var wpHost = document.getElementById('boxWP'), drHost = document.getElementById('boxDriveChart');
    if (!wpHost) return;
    var g = j.game || {};
    var sec = [wpHost.closest('section'), drHost.closest('section')];
    if (!g.played) { sec.forEach(function (x) { x.hidden = true; }); return; }
    sec.forEach(function (x) { x.hidden = false; });
    wpHost.innerHTML = ''; drHost.innerHTML = ''; wpHost.appendChild(h('p', 'ax', 'Loading…'));
    scGet('api/flow?game=' + g.game_id).then(function (F) {
      wpHost.innerHTML = '';
      drawWP(wpHost, F); drawDrives(drHost, F);
    }).catch(function (e) { wpHost.innerHTML = ''; wpHost.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }
  function drawWP(host, F) {
    var W = 940, H = 300, L = 46, R = 16, T = 18, B = 34, pw = W - L - R, ph = H - T - B;
    var raw = F.wp || []; if (!raw.length) { host.appendChild(h('p', 'ax', 'No play-by-play for this game.')); return; }
    /* a three-play median drops one-play blips from plays logged out of order */
    var pts = raw.map(function (p, i) {
      var a = raw[Math.max(0, i - 1)][4], b = p[4], c = raw[Math.min(raw.length - 1, i + 1)][4];
      return [p[0], p[1], p[2], p[3], Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))];
    });
    var maxP = Math.max(4, pts[pts.length - 1][0]);
    function x(p) { var el = (Math.min(p[0], 4) - 1) * 900 + (900 - Math.min(900, p[1] || 0)); if (p[0] > 4) el = 3600 + (p[0] - 4) * 300 * 0.5; return L + pw * el / (3600 + (maxP > 4 ? (maxP - 4) * 150 : 0)); }
    function y(v) { return T + ph * (1 - v); }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Win probability through the game' });
    svg.appendChild(el('rect', { x: L, y: T, width: pw, height: ph / 2, fill: css('--s1'), opacity: 0.06 }));
    svg.appendChild(el('rect', { x: L, y: T + ph / 2, width: pw, height: ph / 2, fill: css('--s2'), opacity: 0.06 }));
    [0, .25, .5, .75, 1].forEach(function (v) {
      svg.appendChild(el('line', { x1: L, x2: L + pw, y1: y(v), y2: y(v), stroke: css('--grid'), 'stroke-width': v === .5 ? 1.5 : 1 }));
      var t = el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, style: 'fill:' + css('--muted') }, (v * 100) + '%'); svg.appendChild(t);
    });
    for (var q = 1; q <= 4; q++) {
      var xq = L + pw * ((q - 1) * 900) / (3600 + (maxP > 4 ? (maxP - 4) * 150 : 0));
      if (q > 1) svg.appendChild(el('line', { x1: xq, x2: xq, y1: T, y2: T + ph, stroke: css('--grid') }));
      svg.appendChild(el('text', { x: xq + 6, y: H - 12, 'font-size': 11, style: 'fill:' + css('--muted') }, 'Q' + q));
    }
    var d = '';
    pts.forEach(function (p, i) { d += (i ? 'L' : 'M') + x(p).toFixed(1) + ' ' + y(p[4]).toFixed(1); });
    var fin = F.home_points > F.away_points ? 1 : F.home_points < F.away_points ? 0 : 0.5;
    d += 'L' + (L + pw).toFixed(1) + ' ' + y(fin).toFixed(1);
    svg.appendChild(el('path', { d: d, fill: 'none', stroke: css('--ink'), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    /* team labels sit on top of the line, with a halo in the panel color so the line never runs through the words */
    var halo = ';stroke:' + css('--surface-1') + ';stroke-width:4px;paint-order:stroke;stroke-linejoin:round';
    svg.appendChild(el('text', { x: L + 8, y: T + 14, 'font-size': 12, 'font-weight': 600, style: 'fill:' + css('--s1') + halo }, F.home + ' wins'));
    svg.appendChild(el('text', { x: L + 8, y: T + ph - 6, 'font-size': 12, 'font-weight': 600, style: 'fill:' + css('--s2') + halo }, F.away + ' wins'));
    /* biggest swings */
    var swings = [];
    for (var i = 1; i < pts.length; i++) swings.push([Math.abs(pts[i][4] - pts[i - 1][4]), i]);
    swings.sort(function (a, b) { return b[0] - a[0]; });
    swings.slice(0, 3).forEach(function (s) {
      var p = pts[s[1]]; svg.appendChild(el('circle', { cx: x(p), cy: y(p[4]), r: 4, fill: css('--gold') }));
    });
    var wrap = h('div', 'chartbox'); wrap.appendChild(svg); host.appendChild(wrap);
    var pre = 1 / (1 + Math.exp(-1.702 * (F.pregame_home_margin || 0) / 15.5));
    var lowW = Math.min.apply(null, pts.map(function (p) { return fin === 1 ? p[4] : 1 - p[4]; }));
    host.appendChild(h('p', 'tblnote', 'Pregame, the line made ' + F.home + ' a ' + Math.round(pre * 100) + '% chance. ' +
      (fin !== 0.5 ? 'The winner\'s lowest point was ' + Math.round(lowW * 100) + '%. ' : '') +
      'Gold dots are the three biggest single-play swings. This is our own estimate from score, time left, field position and the pregame line (margin spread of 15.5 points over a full game), not an official win-probability feed.'));
  }
  function drawDrives(host, F) {
    var D = F.drives || []; if (!D.length) return;
    var W = 940, row = 18, L = 150, R = 70, H = D.length * row + 40, pw = W - L - R;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Every drive drawn on the field' });
    function x(ytg) { return L + pw * (100 - ytg) / 100; }
    [0, 20, 40, 50, 60, 80, 100].forEach(function (v) {
      svg.appendChild(el('line', { x1: x(100 - v), x2: x(100 - v), y1: 18, y2: H - 6, stroke: css('--grid'), 'stroke-width': v === 50 ? 1.5 : 1 }));
      svg.appendChild(el('text', { x: x(100 - v), y: 12, 'text-anchor': 'middle', 'font-size': 10, style: 'fill:' + css('--muted') }, v === 0 ? 'Own goal' : v === 100 ? 'End zone' : v <= 50 ? 'Own ' + v : 'Opp ' + (100 - v)));
    });
    svg.appendChild(el('rect', { x: x(20), y: 18, width: x(0) - x(20), height: H - 24, fill: css('--s1'), opacity: 0.06 }));
    D.forEach(function (d, i) {
      var y = 24 + i * row, home = d[0] === F.home, col = home ? css('--s1') : css('--s2');
      var end = d[7] === 'TD' ? 0 : d[3];
      svg.appendChild(el('text', { x: L - 8, y: y + 10, 'text-anchor': 'end', 'font-size': 11, style: 'fill:' + css('--ink-2') }, 'Q' + d[1] + ' ' + (d[0].length > 18 ? d[0].slice(0, 17) + '…' : d[0])));
      var x0 = x(d[2]), x1 = x(end);
      svg.appendChild(el('rect', { x: Math.min(x0, x1), y: y + 2, width: Math.max(2, Math.abs(x1 - x0)), height: row - 6, rx: 2, fill: col, opacity: d[6] > 0 ? 0.95 : 0.45 }));
      svg.appendChild(el('text', { x: W - R + 6, y: y + 10, 'font-size': 11, 'font-weight': d[6] > 0 ? 700 : 400, style: 'fill:' + (d[6] > 0 ? css('--ink') : css('--muted')) }, d[7] + (d[6] > 0 ? ' +' + d[6] : '')));
    });
    var wrap = h('div', 'chartbox'); wrap.appendChild(svg); host.appendChild(wrap);
    host.appendChild(h('p', 'tblnote', 'Each bar runs from where the drive started to where it ended, in order, ' + F.home + ' in blue and ' + F.away + ' in red. Solid bars scored. The shaded strip is the red zone.'));
  }

  /* ---- playoff odds ---- */
  var oddsState = { conf: '', sims: null, running: false };
  var P4 = { SEC: 1, B1G: 1, B12: 1, ACC: 1 }, G6 = { AAC: 1, CUSA: 1, MAC: 1, MWC: 1, PAC: 1, SBC: 1 };
  var CONF_NAME = { SEC: 'SEC', B1G: 'Big Ten', B12: 'Big 12', ACC: 'ACC', AAC: 'American', CUSA: 'Conference USA', MAC: 'MAC', MWC: 'Mountain West', PAC: 'Pac-12', SBC: 'Sun Belt', Ind: 'Independent' };
  function buildOdds() {
    var host = document.getElementById('oddsBody'), note = document.getElementById('oddsNote');
    if (oddsState.sims) return paintOdds();
    if (oddsState.running) return;
    oddsState.running = true;
    host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Loading the schedule…'));
    scGet('api/matchups-data').then(function (D) { runSims(D, 10000, function (res) { oddsState.sims = res; oddsState.running = false; paintOdds(); }, function (p) { host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Simulating the rest of the season… ' + p + '%')); }); })
      .catch(function (e) { oddsState.running = false; host.innerHTML = ''; host.appendChild(h('p', 'ax', 'Could not load. ' + e.message)); });
  }
  function phi(z) { return 1 / (1 + Math.exp(-1.702 * z)); }
  function runSims(D, N, done, progress) {
    var M = D.models['22'], RT = M.rt, HFA = M.hfa, SIG = (D.bench && D.bench.sigma) || 15.5;
    var teams = Object.keys(D.teams), idx = {}; teams.forEach(function (t, i) { idx[t] = i; });
    var conf = teams.map(function (t) { return D.teams[t].conf; });
    var rt = teams.map(function (t) { return RT[t] != null ? RT[t] : -10; });
    var n = teams.length;
    var baseW = new Float64Array(n), baseL = new Float64Array(n), baseCW = new Float64Array(n), baseCL = new Float64Array(n);
    var rem = [];
    (D.sched || []).forEach(function (g) {
      if (g[10] && g[10] !== 'regular') return;
      var hi = idx[g[2]], ai = idx[g[3]];
      if (hi === undefined && ai === undefined) return;
      var cg = hi !== undefined && ai !== undefined && conf[hi] === conf[ai] && conf[hi] !== 'Ind';
      if (g[5] != null) {
        var hw = g[5] > g[6];
        if (hi !== undefined) { if (hw) baseW[hi]++; else baseL[hi]++; if (cg) { if (hw) baseCW[hi]++; else baseCL[hi]++; } }
        if (ai !== undefined) { if (!hw) baseW[ai]++; else baseL[ai]++; if (cg) { if (!hw) baseCW[ai]++; else baseCL[ai]++; } }
      } else {
        var rh = hi !== undefined ? rt[hi] : -22, ra = ai !== undefined ? rt[ai] : -22;
        rem.push([hi === undefined ? -1 : hi, ai === undefined ? -1 : ai, phi((rh - ra + (g[4] ? 0 : HFA)) / SIG), cg ? 1 : 0]);
      }
    });
    var confs = {}; teams.forEach(function (t, i) { if (conf[i] !== 'Ind') (confs[conf[i]] = confs[conf[i]] || []).push(i); });
    /* The simulated committee ranking starts from the real one and moves with results.
       - Every game gets a resume value: a win is worth more against a better opponent, a loss costs less
         against one (weights fitted so the season so far best reproduces the current CFP ranking).
       - Ranked teams start from their current CFP spot (AP before the first CFP ranking); unranked teams
         start from their resume, placed below #25.
       - Each simulated game, conference title game included, then adds or subtracts its resume value. */
    var qual = function (i) { return i < 0 ? 0 : phi((rt[i] - 4) / 5); };
    var winVal = function (opp) { return 1 + 2.5 * qual(opp); }, lossVal = function (opp) { return -(5 - 2 * qual(opp)); };
    var resNow = new Float64Array(n);
    (D.sched || []).forEach(function (g) {
      if ((g[10] && g[10] !== 'regular') || g[5] == null) return;
      var hi = idx[g[2]], ai = idx[g[3]], hI = hi === undefined ? -1 : hi, aI = ai === undefined ? -1 : ai, hw = g[5] > g[6];
      if (hi !== undefined) resNow[hi] += hw ? winVal(aI) : lossVal(aI);
      if (ai !== undefined) resNow[ai] += hw ? lossVal(hI) : winVal(hI);
    });
    var SPOT = 0.8, rankNow = teams.map(function (t) { var p = D.teams[t].polls || {}; return p.cfp || p.ap || null; });
    /* line up the resume scale with the ranking scale on the ranked teams, then slot everyone else below #25 */
    var xs = [], ys = []; teams.forEach(function (t, i) { if (rankNow[i]) { xs.push(resNow[i]); ys.push(-SPOT * rankNow[i]); } });
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / (xs.length || 1), my = ys.reduce(function (a, b) { return a + b; }, 0) / (ys.length || 1);
    var sxy = 0, sxx = 0; xs.forEach(function (x, k) { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) * (x - mx); });
    var slope = sxx ? sxy / sxx : 0.3, icpt = my - slope * mx, floor25 = -SPOT * 25.5;
    var base = teams.map(function (t, i) { return rankNow[i] ? -SPOT * rankNow[i] : Math.min(floor25, icpt + slope * resNow[i]); });
    var out = { winsSum: new Float64Array(n), ccg: new Float64Array(n), champ: new Float64Array(n), cfp: new Float64Array(n), bye: new Float64Array(n), host: new Float64Array(n), N: N };
    var W = new Float64Array(n), L = new Float64Array(n), CW = new Float64Array(n), CL = new Float64Array(n), score = new Float64Array(n), isChamp = new Uint8Array(n), RES = new Float64Array(n);
    var order = []; for (var k = 0; k < n; k++) order.push(k);
    var done_ = 0, CH = 500;
    function chunk() {
      var end = Math.min(N, done_ + CH);
      for (var s = done_; s < end; s++) {
        W.set(baseW); L.set(baseL); CW.set(baseCW); CL.set(baseCL); RES.set(base); isChamp.fill(0);
        for (var r = 0; r < rem.length; r++) {
          var gg = rem[r], hw = Math.random() < gg[2], wi = hw ? gg[0] : gg[1], li = hw ? gg[1] : gg[0];
          if (wi >= 0) { W[wi]++; if (gg[3]) CW[wi]++; RES[wi] += winVal(li); }
          if (li >= 0) { L[li]++; if (gg[3]) CL[li]++; RES[li] += lossVal(wi); }
        }
        for (var c in confs) {
          var mem = confs[c].slice().sort(function (a, b) {
            var pa = CW[a] / Math.max(1, CW[a] + CL[a]), pb = CW[b] / Math.max(1, CW[b] + CL[b]);
            if (pb !== pa) return pb - pa;
            var oa = W[a] / Math.max(1, W[a] + L[a]), ob = W[b] / Math.max(1, W[b] + L[b]);
            if (ob !== oa) return ob - oa;
            return (rt[b] + Math.random() * 6) - (rt[a] + Math.random() * 6);
          });
          var a1 = mem[0], b1 = mem[1]; out.ccg[a1]++; out.ccg[b1]++;
          var win = Math.random() < phi((rt[a1] - rt[b1]) / SIG) ? a1 : b1, lose = win === a1 ? b1 : a1;
          W[win]++; L[lose]++; RES[win] += winVal(lose); RES[lose] += lossVal(win); isChamp[win] = 1; out.champ[win]++;
        }
        for (var i2 = 0; i2 < n; i2++) { score[i2] = RES[i2] + (isChamp[i2] ? 1.5 : 0) + (Math.random() - 0.5) * 3; out.winsSum[i2] += W[i2]; }
        order.sort(function (a, b) { return score[b] - score[a]; });
        var field = [], inF = new Uint8Array(n);
        order.forEach(function (t) { if (isChamp[t] && P4[conf[t]]) { field.push(t); inF[t] = 1; } });
        for (var o = 0; o < n; o++) { var t2 = order[o]; if (G6[conf[t2]]) { if (!inF[t2]) { field.push(t2); inF[t2] = 1; } break; } }
        for (var o2 = 0; o2 < n && field.length < 12; o2++) { var t3 = order[o2]; if (!inF[t3]) { field.push(t3); inF[t3] = 1; } }
        field.forEach(function (t) { out.cfp[t]++; });
        field.sort(function (a, b) { return score[b] - score[a]; });
        for (var sd = 0; sd < 4; sd++) out.bye[field[sd]]++;
        for (var sd2 = 4; sd2 < 8; sd2++) out.host[field[sd2]]++;
      }
      done_ = end;
      if (done_ < N) { progress(Math.round(100 * done_ / N)); setTimeout(chunk, 0); }
      else done({ teams: teams, conf: conf, rt: rt, W: baseW, L: baseL, CW: baseCW, CL: baseCL, out: out, remaining: rem.length });
    }
    chunk();
  }
  function paintOdds() {
    var host = document.getElementById('oddsBody'), R = oddsState.sims, N = R.out.N;
    var sel = document.getElementById('oddsConf');
    if (!sel.options.length) {
      sel.appendChild(new Option('All FBS', ''));
      Object.keys(CONF_NAME).forEach(function (c) { sel.appendChild(new Option(CONF_NAME[c], c)); });
      sel.onchange = function () { oddsState.conf = sel.value; paintOdds(); };
    }
    var rows = R.teams.map(function (t, i) {
      return { team: siteName(t), conf: R.conf[i], rec: R.W[i] + '-' + R.L[i], crec: R.CW[i] + '-' + R.CL[i], rt: R.rt[i],
        wins: R.out.winsSum[i] / N, ccg: R.out.ccg[i] / N, champ: R.out.champ[i] / N, cfp: R.out.cfp[i] / N, bye: R.out.bye[i] / N, host: R.out.host[i] / N };
    }).filter(function (r) { return oddsState.conf ? r.conf === oddsState.conf : r.cfp >= 0.005 || r.champ >= 0.05; });
    rows.sort(function (a, b) { return oddsState.conf ? (b.champ - a.champ) || (b.cfp - a.cfp) : (b.cfp - a.cfp) || (b.champ - a.champ); });
    host.innerHTML = '';
    var X = tbl(['Team', 'Conf', 'Record', 'Conf rec', 'Proj. wins', 'Title game', 'Conf title', 'Playoff', 'First-round bye', 'Hosts a game']);
    function pc(v) { var c = td('scv', v < 0.001 ? '–' : v > 0.995 ? '>99%' : v < 0.01 ? '<1%' : Math.round(v * 100) + '%'); if (v >= 0.01) c.style.boxShadow = 'inset ' + Math.max(4, Math.round(v * 60)) + 'px 0 0 color-mix(in srgb, var(--s1) 28%, transparent)'; return c; }
    rows.forEach(function (r) {
      var tr = h('tr', 'clickable');
      tr.appendChild(h('td', 'pclab', r.team)); tr.appendChild(td('nd', CONF_NAME[r.conf] || r.conf));
      tr.appendChild(td('nd', r.rec)); tr.appendChild(td('nd', r.conf === 'Ind' ? '–' : r.crec)); tr.appendChild(td('nd', num(r.wins, 1)));
      [r.ccg, r.champ, r.cfp, r.bye, r.host].forEach(function (v, i) { tr.appendChild(r.conf === 'Ind' && i < 2 ? td('nd', '–') : pc(v)); });
      tr.onclick = function () { loadTeam(r.team, 'team'); };
      X.tb.appendChild(tr);
    });
    host.appendChild(X.wrap);
    document.getElementById('oddsNote').textContent = 'Based on ' + N.toLocaleString() + ' simulations of the ' + R.remaining + ' regular-season games left, then every conference title game and a 12-team field. ' +
      'Each game is a coin weighted by the matchup board\'s Two-Deep model (talent plus results, ' + 'home field included); title-game spots go to the top two in conference winning percentage. ' +
      'The field follows the 2026 rules: the ACC, Big Ten, Big 12 and SEC champions, the highest-ranked team from the other six conferences, and seven more by ranking. ' +
      'The simulated ranking starts from the current CFP ranking and moves with each result: a win counts more against a strong opponent, a loss costs less against one (weights fitted to how the committee has ranked this season so far), plus a small bonus for a conference title. It approximates the committee; it cannot read its mind. Tiebreakers beyond winning percentage are not modeled. Re-runs every time the page loads.';
    if (window.__tlRescan) window.__tlRescan();
  }

  /* ---- box score ---- */
  var BOX_ROWS = [
    { key: 'points', label: 'Points', fmt: N0 },
    { key: 'yards', label: 'Yards', fmt: N0 },
    { key: 'plays', label: 'Plays', fmt: N0 },
    { key: 'yards_per_play', label: 'Yards / play', fmt: N2 },
    { key: 'success_rate', label: 'Success rate', fmt: P1 },
    { key: 'epa_per_play', label: 'EPA / play', fmt: S2 },
    { key: 'explosive_rate', label: 'Explosive rate', fmt: P1 },
    { key: 'explosiveness', label: 'Explosiveness', fmt: N2 },
    { key: 'success_rate_run', label: 'Run success', fmt: P1 },
    { key: 'success_rate_pass', label: 'Dropback success', fmt: P1 },
    { key: 'dropbacks', label: 'Dropbacks', fmt: N0 },
    { key: 'runs', label: 'Runs', fmt: N0 },
    { key: 'sacks', label: 'Sacks taken', fmt: N0 },
    { key: 'third_down_conv', label: 'Third downs won', fmt: N0 }
  ];
  var BOX_STATS = [
    { name: 'Passing', gate: 'pass_att', cols: [['pass_comp','Cmp'],['pass_att','Att'],['pass_yds','Yds'],['pass_td','TD'],['pass_int','INT']] },
    { name: 'Rushing', gate: 'rush_att', cols: [['rush_att','Car'],['rush_yds','Yds'],['rush_td','TD'],['rush_long','Long']] },
    { name: 'Receiving', gate: 'rec', cols: [['rec','Rec'],['rec_yds','Yds'],['rec_td','TD'],['rec_long','Long']] },
    { name: 'Defense', gate: 'tackles', cols: [['tackles','Tot'],['tackles_solo','Solo'],['tfl','TFL'],['sacks','Sack'],['pass_defended','PD'],['ints_made','INT']] }
  ];

  function buildBox() {
    if (!vstate.boxGame) { setView('games'); return; }
    if (vstate.box && vstate.box.key === vstate.boxGame) return paintBox(vstate.box.data);
    document.getElementById('boxTitle').textContent = 'Loading…';
    document.getElementById('boxLede').textContent = '';
    document.getElementById('boxTiles').innerHTML = '';
    document.getElementById('boxCompare').innerHTML = '';
    document.getElementById('boxDrives').innerHTML = '';
    document.getElementById('boxPlayers').innerHTML = '';
    fetch('api/boxscore?game=' + vstate.boxGame)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        vstate.box = { key: vstate.boxGame, data: j };
        paintBox(j);
      })
      .catch(function (e) {
        document.getElementById('boxTitle').textContent = 'Could not load that game';
        document.getElementById('boxLede').textContent = e.message;
      });
  }

  function paintBox(j) {
    buildFlow(j);
    var g = j.game || {}, ts = j.teams || [];
    var home = ts.filter(function (t) { return t.is_home; })[0];
    var away = ts.filter(function (t) { return !t.is_home; })[0];
    document.getElementById('boxEyebrow').textContent =
      [g.season + ' · week ' + g.week, g.conference_game ? 'conference game' : null,
       g.neutral_site ? 'neutral site' : null].filter(Boolean).join(' · ');
    /* the feed still names a home team for a neutral-site game, so "at" would
       claim a home field nobody had */
    document.getElementById('boxTitle').textContent =
      (away ? away.team : g.away_team) + (g.neutral_site ? ' vs ' : ' at ') + (home ? home.team : g.home_team);

    var lede = document.getElementById('boxLede');
    /* every margin in the feed is stated from the nominal home team, so name
       that team rather than calling it "the home side" */
    var favSide = g.home_team;
    if (g.played) {
      var win = g.actual_margin > 0 ? g.home_team : g.away_team;
      var beat = g.actual_margin - g.market_margin;
      lede.innerHTML = '<b>' + g.away_team + ' ' + g.away_points + ', ' +
        g.home_team + ' ' + g.home_points + '</b> — ' + win + ' by ' + Math.abs(g.actual_margin) + '. ' +
        (g.market_margin !== null
          ? 'The closing line had ' + favSide + ' ' +
            (g.market_margin >= 0 ? 'by ' + num(g.market_margin, 1) : 'getting ' + num(-g.market_margin, 1)) +
            ', so they finished ' +
            (beat >= 0 ? '<b>' + num(beat, 1) + ' better</b> than the number.'
                       : '<b>' + num(-beat, 1) + ' short</b> of it.')
          : '');
    } else {
      lede.innerHTML = 'Not played yet. ' +
        (g.market_margin !== null
          ? 'The market has ' + favSide + ' ' +
            (g.market_margin >= 0 ? 'by <b>' + num(g.market_margin, 1) + '</b>. '
                                  : 'getting <b>' + num(-g.market_margin, 1) + '</b>. ')
          : '') +
        (g.projected_margin !== null
          ? 'SP+ projects ' + favSide + ' ' +
            (g.projected_margin >= 0 ? 'by <b>' + num(g.projected_margin, 1) + '</b>.'
                                     : 'losing by <b>' + num(-g.projected_margin, 1) + '</b>.')
          : '');
    }

    var tiles = document.getElementById('boxTiles');
    tiles.innerHTML = '';
    [{ k: 'Projected', v: g.projected_margin === null ? '–' : sgn(g.projected_margin, 1), r: 'SP+ and home field' },
     { k: 'Market', v: g.market_margin === null ? '–' : sgn(g.market_margin, 1), r: g.lines_count ? g.lines_count + ' books' : '' },
     { k: 'Total', v: g.over_under === null ? '–' : num(g.over_under, 1),
       r: g.played ? 'actual ' + (g.home_points + g.away_points) : '' },
     { k: 'Excitement', v: g.excitement === null || g.excitement === undefined ? '–' : num(g.excitement, 1), r: 'CFBD index' },
     { k: 'Weather', v: g.temperature === null || g.temperature === undefined ? '–' : num(g.temperature, 0) + '°',
       r: g.weather_condition || '' }
    ].forEach(function (t) {
      var d = h('div', 'tile');
      d.appendChild(h('span', 'k', t.k));
      d.appendChild(h('span', 'v', t.v));
      if (t.r) d.appendChild(h('span', 'r', t.r));
      tiles.appendChild(d);
    });

    /* side-by-side comparison bars */
    var host = document.getElementById('boxCompare');
    host.innerHTML = '';
    if (!home || !away) {
      host.appendChild(h('p', 'ax', 'No play-by-play logged for this game yet.'));
    } else {
      var C1 = css('--s1'), C2 = css('--s2');
      var lg = h('div', 'legend');
      lg.appendChild(mkKey(C2, away.team));
      lg.appendChild(mkKey(C1, home.team));
      host.appendChild(lg);
      BOX_ROWS.forEach(function (m) {
        var a = away[m.key] === null || away[m.key] === undefined ? null : +away[m.key];
        var b = home[m.key] === null || home[m.key] === undefined ? null : +home[m.key];
        var row = h('div', 'cmprow');
        var lv = h('span', 'v r', a === null ? '–' : m.fmt(a));
        var rv = h('span', 'v', b === null ? '–' : m.fmt(b));
        var lo = Math.min(a === null ? 0 : a, b === null ? 0 : b, 0);
        var span = (Math.max(a === null ? 0 : a, b === null ? 0 : b) - lo) || 1;
        var sa = a === null ? 0 : (a - lo) / span, sb = b === null ? 0 : (b - lo) / span;
        var barL = h('div', 'cmpbar l'), iL = h('i');
        iL.style.width = Math.max(sa * 100, 2) + '%'; iL.style.background = C2; barL.appendChild(iL);
        var barR = h('div', 'cmpbar'), iR = h('i');
        iR.style.width = Math.max(sb * 100, 2) + '%'; iR.style.background = C1; barR.appendChild(iR);
        row.appendChild(lv); row.appendChild(barL);
        row.appendChild(h('span', 'lab', m.label));
        row.appendChild(barR); row.appendChild(rv);
        host.appendChild(row);
      });
      var n2 = h('p', 'tblnote');
      n2.innerHTML = 'Bars are scaled against the larger of the two, so they show who won each category rather than absolute size. ' +
        '"Third downs won" counts third-down snaps that met the success threshold, which is close to but not identical to a conversion.';
      host.appendChild(n2);
    }

    /* drive chart */
    var dt = document.getElementById('boxDrives');
    dt.innerHTML = '';
    var drives = j.drives || [];
    if (drives.length) {
      var head = ['#', 'Team', 'Qtr', 'Started', 'Snaps', 'Result'];
      var tr = h('tr'); head.forEach(function (x) { tr.appendChild(h('th', null, x)); });
      var th = document.createElement('thead'); th.appendChild(tr); dt.appendChild(th);
      var tbody = document.createElement('tbody');
      drives.forEach(function (d, i) {
        var r = h('tr');
        if (d.garbage) r.className = 'agg';
        var result = d.points >= 7 ? 'Touchdown' : d.points === 3 ? 'Field goal'
          : d.turnovers > 0 ? 'Turnover' : d.reached_40 ? 'Reached the 40, no points' : '—';
        [String(i + 1), d.team, 'Q' + d.start_period,
         'own ' + d.start_own_yardline, String(d.snaps), result]
          .forEach(function (v, ci) {
            var td = h('td', ci === 0 ? 'rk' : null, v);
            if (ci === 5 && d.points > 0) td.style.color = css('--pos');
            if (ci === 5 && d.turnovers > 0) td.style.color = css('--neg');
            r.appendChild(td);
          });
        tbody.appendChild(r);
      });
      dt.appendChild(tbody);
    }

    /* player box */
    var teams = [away ? away.team : g.away_team, home ? home.team : g.home_team];
    segs(document.getElementById('boxTeamTabs'), teams, vstate.boxTeam,
      function (i) { vstate.boxTeam = i; paintBox(j); });
    segs(document.getElementById('boxStatTabs'), BOX_STATS.map(function (s) { return s.name; }), vstate.boxStat,
      function (i) { vstate.boxStat = i; paintBox(j); });
    var set = BOX_STATS[vstate.boxStat];
    var want = teams[vstate.boxTeam];
    var prows = (j.players || []).filter(function (p) {
      return p.team === want && (+p[set.gate] || 0) > 0;
    }).map(function (p) {
      var o = {}; for (var kk in p) o[kk] = (kk === 'team' || kk === 'athlete' || kk === 'position')
        ? p[kk] : (p[kk] === null ? null : +p[kk]);
      return o;
    });
    prows.sort(function (a, b) { return (b[set.cols[1][0]] || 0) - (a[set.cols[1][0]] || 0); });
    var pcols = [
      { head: 'Player', key: 'athlete', num: false, cell: function (p) { var td = h('td', 'tm'); td.appendChild(playerLink(p.athlete, p.athlete_id, p.team)); return td; } },
      { head: 'Pos', key: 'position', num: false, cell: function (p) { return h('td', 'conf', p.position || '–'); } }
    ];
    set.cols.forEach(function (c) {
      pcols.push({ head: c[1], key: c[0], num: true, cell: function (p) {
        return h('td', p[c[0]] === null ? 'nd' : null, p[c[0]] === null ? '–' : num(p[c[0]], 0));
      } });
    });
    sortTable({ host: document.getElementById('boxPlayers'), cols: pcols, rows: prows,
      sortKey: set.cols[1][0], asc: false, onSort: function () {} });
  }

  /* ---- league: five factors, pace, strength of schedule ---- */
  var LEAGUE_VIEWS = [
    { id: 'five-factors', label: 'Five Factors', sided: true,
      lede: 'The five things that decide football games: how often you stay on schedule, how big the good plays are, where your drives begin, what you do with the trips that reach scoring range, and who keeps the ball.',
      cols: [
        ['success_rate', 'Success', P1, 'success_rate_rank'],
        ['explosiveness', 'Explosive', N2, 'explosiveness_rank'],
        ['field_position', 'Field pos', N1, 'field_position_rank'],
        ['points_per_opp', 'Pts/opp', N2, 'points_per_opp_rank'],
        ['turnovers', 'Turnovers', N0, 'turnovers_rank'],
        ['drives', 'Drives', N0, null]
      ] },
    { id: 'pace', label: 'Pace', sided: false,
      lede: 'Seconds between snaps, with the situations that distort tempo taken out — garbage time, the clock-killing end of each half, and any gap that spans a change of possession.',
      cols: [
        ['sec_per_play_adj', 'Sec/play', N2, 'pace_rank'],
        ['sec_per_play', 'Unadjusted', N2, null],
        ['snaps_clean', 'Timed snaps', N0, null],
        ['garbage_snaps', 'Garbage', N0, null]
      ] },
    { id: 'sos', label: 'Strength of schedule', sided: false,
      lede: 'Who has actually played somebody. Each number is the average SP+ of the opponents on that part of the schedule, so a high figure means a hard slate.',
      cols: [
        ['sos_played', 'Played', N2, 'sos_played_rank'],
        ['sos_remaining', 'Remaining', N2, 'sos_remaining_rank'],
        ['sos_full', 'Full season', N2, 'sos_full_rank'],
        ['best_opponent', 'Best faced', N2, null],
        ['games_played', 'G', N0, null]
      ] },
    { id: 'adjusted', label: 'Schedule-adjusted', sided: true,
      url: function (side) { return 'api/x/adj_league?season=' + state.season + '&side=' + side; },
      lede: 'Every offense and defense re-rated against an average FBS schedule: credit for facing good units, a discount for padding stats against weak ones. #1 is best on either side of the ball.',
      cols: [
        ['epa', 'EPA/play', S2, 'rank'],
        ['sr', 'Success', P1, 'sr_rank'],
        ['expl', 'Explosive', P1, 'expl_rank'],
        ['epa_pass', 'Pass EPA', S2, 'epa_pass_rank'],
        ['epa_run', 'Run EPA', S2, 'epa_run_rank'],
        ['ppd', 'Pts/drive', N2, 'ppd_rank'],
        ['havoc', 'Havoc', P1, 'havoc_rank'],
        ['raw_rank', 'Raw rank', N0, null],
        ['move', 'Moved', N0, null]
      ] }
  ];

  function buildLeague() {
    var v = LEAGUE_VIEWS[vstate.league];
    var side = vstate.leagueSide === 1 ? 'Defense' : 'Offense';
    segs(document.getElementById('leagueTabs'), LEAGUE_VIEWS.map(function (x) { return x.label; }), vstate.league,
      function (i) { vstate.league = i; vstate.leagueSort = null; buildLeague(); });
    var sideHost = document.getElementById('leagueSideTabs');
    if (v.sided) {
      segs(sideHost, ['Offense', 'Defense'], vstate.leagueSide,
        function (i) { vstate.leagueSide = i; buildLeague(); });
    } else { sideHost.innerHTML = ''; }

    document.getElementById('leagueTitle').textContent = v.label;
    document.getElementById('leagueLede').textContent = v.lede;
    document.getElementById('leagueEyebrow').textContent = state.season + ' season';
    if (!vstate.leagueSort) { vstate.leagueSort = v.cols[0][0]; vstate.leagueAsc = (v.id === 'pace' || (v.id === 'adjusted' && vstate.leagueSide === 1)); }

    var key = v.id + '|' + state.season + '|' + (v.sided ? side : '');
    var tb = document.getElementById('leagueTable');
    var note = document.getElementById('leagueNote');
    if (vstate.leagueData[key]) return paint(vstate.leagueData[key]);
    tb.innerHTML = ''; note.textContent = 'Loading…';
    fetch(v.url ? v.url(side) : 'api/league?season=' + state.season + '&what=' + v.id + (v.sided ? '&side=' + side : ''))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var rows = (j.rows || []).map(function (r) {
          var o = {}; for (var kk in r) o[kk] = (typeof r[kk] === 'string' && isNaN(+r[kk])) || r[kk] === null
            ? r[kk] : (kk === 'team' || kk === 'conference' || kk === 'side' ? r[kk] : +r[kk]);
          return o;
        });
        vstate.leagueData[key] = rows;
        paint(rows);
      })
      .catch(function (e) { note.textContent = 'Could not load. ' + e.message; });

    function paint(all) {
      var confSel = document.getElementById('leagueConf');
      if (!confSel.options.length) {
        var a0 = document.createElement('option'); a0.value = ''; a0.textContent = 'All of FBS';
        confSel.appendChild(a0);
        (state.teams || []).map(function (t) { return t.conference; })
          .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; }).sort()
          .forEach(function (c) {
            var o = document.createElement('option'); o.value = c; o.textContent = c; confSel.appendChild(o);
          });
      }
      var confOf = {};
      (state.teams || []).forEach(function (t) { confOf[t.team] = t.conference; });
      var q = vstate.leagueQ.toLowerCase();
      var dropped = 0;
      var rows = all.filter(function (r) {
        /* a pace figure off a handful of timed snaps is noise, not a league
           leader — nulling its rank was not enough, it still sorted to the top */
        if (v.id === 'pace' && !r.qualified) { dropped++; return false; }
        var c = r.conference || confOf[r.team] || '';
        if (vstate.leagueConf && c !== vstate.leagueConf) return false;
        if (q && r.team.toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      rows.sort(function (a, b) {
        var c = cmp(a, b, vstate.leagueSort, vstate.leagueAsc, vstate.leagueSort !== 'team');
        return c !== 0 ? c : String(a.team).localeCompare(String(b.team));
      });
      var rankKey = (v.cols.filter(function (c) { return c[0] === vstate.leagueSort; })[0] || [])[3];
      var cols = [
        { head: rankKey ? 'Rk' : '#', key: '_pos', num: true,
          title: 'Click to sort by ' + v.cols[0][1],
          cell: function (r, i) {
            return h('td', 'rk', rankKey && r[rankKey] ? String(r[rankKey]) : String(i + 1));
          } },
        { head: 'School', key: 'team', num: false, cell: function (r) {
            var td = h('td', 'tm');
            var b = h('button', null, r.team);
            b.onclick = function () { pickTeam(r.team); };
            td.appendChild(b); return td;
          } },
        { head: 'Conference', key: 'conference', num: false,
          cell: function (r) { return h('td', 'conf', r.conference || confOf[r.team] || '–'); } }
      ];
      v.cols.forEach(function (c) {
        cols.push({ head: c[1], key: c[0], num: true, cell: function (r) {
          var val = r[c[0]];
          var td = h('td', val === null || val === undefined ? 'nd' : null,
                     val === null || val === undefined ? '–' : c[2](val));
          if (c[3] && r[c[3]] && r.pool) {
            td.title = ord(r[c[3]]) + ' of ' + r.pool;
            var bg = tint((r.pool - r[c[3]]) / Math.max(r.pool - 1, 1), false);
            if (bg) td.style.background = bg;
          }
          return td;
        } });
      });
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: vstate.leagueSort, asc: vstate.leagueAsc,
        rowClass: function (r) { return r.team === state.team ? 'me' : ''; },
        onSort: function (kk, isNum) {
          if (kk === '_pos') { vstate.leagueSort = v.cols[0][0]; vstate.leagueAsc = (v.id === 'pace' || (v.id === 'adjusted' && vstate.leagueSide === 1)); buildLeague(); return; }
          if (vstate.leagueSort === kk) vstate.leagueAsc = !vstate.leagueAsc;
          else { vstate.leagueSort = kk; vstate.leagueAsc = !isNum || (v.id === 'pace' && kk.indexOf('sec_') === 0); }
          buildLeague();
        }
      });
      document.getElementById('leagueCount').textContent =
        rows.length + ' of ' + (all.length - dropped) + ' teams';
      note.innerHTML = v.id === 'pace'
        ? 'Lower seconds per snap is faster. The clock is not recorded on every play, so a team needs at least 60 timed snaps to appear here &mdash; <b>'
          + dropped + '</b> ' + (dropped === 1 ? 'team is' : 'teams are') + ' held back this season for a thin sample rather than being ranked off a handful of gaps.'
        : v.id === 'sos'
          ? 'Opponent strength is SP+, so the scale is points against an average team. A blank remaining column means the schedule is finished.'
          : 'Drives are reconstructed from the play log because the feed has no drive endpoint, so field position and points per opportunity are computed here rather than supplied. On the defensive view every column is read the other way: a low number is a good defense.';
    }
  }

  /* ---- coaches ---- */
  function buildCoaches() {
    var tb = document.getElementById('coachTable');
    var note = document.getElementById('coachNote');
    if (vstate.coaches) return paint(vstate.coaches);
    tb.innerHTML = ''; note.textContent = 'Loading…';
    fetch('api/coaches?min=24')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        vstate.coaches = (j.coaches || []).map(function (c) {
          ['seasons','schools','games','wins','losses','ties','win_pct','wins_per_season',
           'top25_finishes','best_finish','first_season','last_season']
            .forEach(function (k) { c[k] = c[k] === null ? null : +c[k]; });
          return c;
        });
        paint(vstate.coaches);
      })
      .catch(function (e) { note.textContent = 'Could not load coaches. ' + e.message; });

    function paint(all) {
      var q = vstate.coachQ.toLowerCase();
      var rows = all.filter(function (c) {
        return !q || (c.coach || '').toLowerCase().indexOf(q) >= 0
          || (c.teams || '').toLowerCase().indexOf(q) >= 0;
      });
      rows.sort(function (a, b) {
        var c = cmp(a, b, vstate.coachSort, vstate.coachAsc,
                    vstate.coachSort !== 'coach' && vstate.coachSort !== 'current_team');
        return c !== 0 ? c : String(a.coach).localeCompare(String(b.coach));
      });
      var cols = [
        { head: '#', key: '_pos', num: true, title: 'Click to sort by wins',
          cell: function (r, i) { return h('td', 'rk', String(i + 1)); } },
        { head: 'Coach', key: 'coach', num: false, cell: function (r) { return h('td', 'tm', r.coach); } },
        { head: 'Most recent', key: 'current_team', num: false,
          cell: function (r) { return h('td', 'conf', r.current_team || '–'); } },
        { head: 'Seasons', key: 'seasons', num: true, cell: function (r) { return h('td', 'nd', String(r.seasons)); } },
        { head: 'Schools', key: 'schools', num: true, cell: function (r) {
            var td = h('td', 'nd', String(r.schools)); td.title = r.teams || ''; return td; } },
        { head: 'W', key: 'wins', num: true, cell: function (r) { return h('td', null, String(r.wins)); } },
        { head: 'L', key: 'losses', num: true, cell: function (r) { return h('td', null, String(r.losses)); } },
        { head: 'Win %', key: 'win_pct', num: true,
          cell: function (r) { return h('td', null, r.win_pct === null ? '–' : pct(r.win_pct, 1)); } },
        { head: 'Top 25', key: 'top25_finishes', num: true, title: 'Seasons finishing in the final top 25',
          cell: function (r) { return h('td', 'nd', String(r.top25_finishes)); } },
        { head: 'Best', key: 'best_finish', num: true, title: 'Best final ranking',
          cell: function (r) { return h('td', 'nd', r.best_finish === null ? '–' : String(r.best_finish)); } },
        { head: 'From', key: 'first_season', num: true, cell: function (r) { return h('td', 'nd', String(r.first_season)); } },
        { head: 'To', key: 'last_season', num: true, cell: function (r) { return h('td', 'nd', String(r.last_season)); } }
      ];
      sortTable({
        host: tb, cols: cols, rows: rows, sortKey: vstate.coachSort, asc: vstate.coachAsc,
        onSort: function (kk, isNum) {
          if (kk === '_pos') { vstate.coachSort = 'wins'; vstate.coachAsc = false; buildCoaches(); return; }
          if (vstate.coachSort === kk) vstate.coachAsc = !vstate.coachAsc;
          else { vstate.coachSort = kk; vstate.coachAsc = !isNum; }
          buildCoaches();
        }
      });
      document.getElementById('coachCount').textContent = rows.length + ' coaches';
      note.innerHTML = 'Records cover 2000 onward, which is as far back as the coaching feed goes — a career that started earlier is ' +
        'shown only from 2000. "Best" is the highest final ranking in any season. Hover the schools count to see which ones.';
    }
  }

  /* ---- data ---- */
  function render() {
    window.__psSeason = state.season;
    buildHero(); buildRatings(); buildMarket(); buildRank(); buildAdjusted();
    buildField(); buildSit(); buildTrend(); buildPlayers(); buildLimits();
    buildFresh(); buildH2H(); buildConf(); buildBoard();
    state.liveDone = {}; buildStamp();
    document.getElementById('loading').hidden = true;
    document.getElementById('content').hidden = false;
    wireCollapse(); addShareButtons();
    setTeamTab(state.teamTab, { keepScroll: true });
  }

  function loadTeam(team, wantView) {
    document.getElementById('loading').hidden = false;
    document.getElementById('content').hidden = true;
    fetch('api/team?team=' + encodeURIComponent(team))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        state.data = j; state.team = team; board.vs = null; state.players = null;
        var sel = document.getElementById('seasonSel');
        sel.innerHTML = '';
        j.seasons.forEach(function (s) {
          var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
        });
        if (j.seasons.indexOf(state.season) < 0) state.season = j.seasons[j.seasons.length - 1];
        sel.value = state.season;
        document.title = team + ' · The Post-Snap';
        render();
        setView(wantView && VIEWS.some(function (v) { return v.id === wantView; })
          ? wantView : 'team');
      })
      .catch(function (e) {
        document.getElementById('loading').innerHTML = 'Could not load ' + team + '. ' + e.message;
      });
  }

  function init() {
    fetch('api/teams?v=polls').then(function (r) { return r.json(); }).then(function (list) {
      state.teams = list;
      /* current CFP / AP / Coaches ranks, shown beside team names on the Games and League pages */
      var ranks = {};
      list.forEach(function (t) { if (t.cfp || t.ap || t.coaches) ranks[t.team] = { cfp: t.cfp, ap: t.ap, coaches: t.coaches }; });
      window.TEAM_RANKS = ranks;
      window.TEAM_RANKS_SEASON = list.length ? list[0].poll_season : null;
      window.TEAM_RANKS_WEEK = list.length ? list[0].poll_week : null;
      if (window.__tlRescan) window.__tlRescan();
      var dl = document.getElementById('teamList');
      list.forEach(function (t) {
        var o = document.createElement('option'); o.value = t.team;
        o.label = t.conference || ''; dl.appendChild(o);
      });
      var inp = document.getElementById('teamInput');
      var qs = new URLSearchParams(location.search).get('team');
      var fw = followTeam();
      var start = qs && list.some(function (t) { return t.team === qs; }) ? qs
        : fw && list.some(function (t) { return t.team === fw; }) ? fw
        : (list.some(function (t) { return t.team === 'Auburn'; }) ? 'Auburn' : list[0].team);
      inp.value = start;
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        var hit = list.filter(function (t) { return t.team.toLowerCase() === v.toLowerCase(); })[0];
        if (hit) loadTeam(hit.team); else inp.value = state.team;
      });
      document.getElementById('seasonSel').addEventListener('change', function (e) {
        state.season = +e.target.value;
        window.__psSeason = state.season;
        board.vs = null; state.players = null;
        /* every league-wide cache is keyed on season */
        vstate.games = null; vstate.leagueData = {}; vstate.week = null;
        render();
        if (vstate.view !== 'team') setView(vstate.view, { keepScroll: true });
      });

      var vsIn = document.getElementById('vsInput');
      vsIn.addEventListener('change', function () {
        var v = vsIn.value.trim();
        var hit = list.filter(function (t) { return t.team.toLowerCase() === v.toLowerCase(); })[0];
        if (hit && hit.team !== state.team) { board.vs = hit.team; buildH2H(); }
        else { vsIn.value = board.vs || ''; }
      });

      var srch = document.getElementById('boardSearch');
      var t = null;
      srch.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { board.q = srch.value.trim(); buildBoard(); }, 140);
      });
      document.getElementById('boardConf').addEventListener('change', function (e) {
        board.conf = e.target.value; buildBoard();
      });

      /* ---- the other views ---- */
      buildNav();
      document.getElementById('weekSel').addEventListener('change', function (e) {
        vstate.week = +e.target.value; vstate.games = null; buildGames();
      });
      document.getElementById('gamesConf').addEventListener('change', function (e) {
        vstate.gamesConf = e.target.value; buildGames();
      });
      var lq = document.getElementById('leagueSearch'), lt = null;
      lq.addEventListener('input', function () {
        clearTimeout(lt);
        lt = setTimeout(function () { vstate.leagueQ = lq.value.trim(); buildLeague(); }, 140);
      });
      document.getElementById('leagueConf').addEventListener('change', function (e) {
        vstate.leagueConf = e.target.value; buildLeague();
      });
      var cq = document.getElementById('coachSearch'), ct = null;
      cq.addEventListener('input', function () {
        clearTimeout(ct);
        ct = setTimeout(function () { vstate.coachQ = cq.value.trim(); buildCoaches(); }, 140);
      });

      var qp = new URLSearchParams(location.search);
      var wantView = qp.get('view');
      if (wantView === 'player' && qp.get('id')) vstate.player = { id: +qp.get('id'), team: qp.get('team') };
      if (qp.get('game')) { if (wantView === 'scout') vstate.scoutGame = +qp.get('game'); else { vstate.boxGame = +qp.get('game'); wantView = 'box'; } }
      if (qp.get('week')) vstate.week = +qp.get('week');
      loadTeam(start, wantView);
    }).catch(function (e) {
      document.getElementById('loading').textContent = 'Could not reach the data service.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
/* ---- team logos ---- */
window.TEAM_LOGOS = {"Air Force":2005,"Akron":2006,"Alabama":333,"App State":2026,"Arizona":12,"Arizona State":9,"Arkansas":8,"Arkansas State":2032,"Army":349,"Auburn":2,"Ball State":2050,"Baylor":239,"Boise State":68,"Boston College":103,"Bowling Green":189,"Bucknell":2083,"Buffalo":2084,"BYU":252,"California":25,"Central Michigan":2117,"Charlotte":2429,"Cincinnati":2132,"Clemson":228,"Coastal Carolina":324,"Colorado":38,"Colorado State":36,"Delaware":48,"Duke":150,"East Carolina":151,"Eastern Michigan":2199,"Florida":57,"Florida Atlantic":2226,"Florida International":2229,"Florida State":52,"Fresno State":278,"Georgia":61,"Georgia Southern":290,"Georgia State":2247,"Georgia Tech":59,"Hawai'i":62,"Houston":248,"Illinois":356,"Indiana":84,"Iowa":2294,"Iowa State":66,"Jacksonville State":55,"James Madison":256,"Kansas":2305,"Kansas State":2306,"Kennesaw State":338,"Kent State":2309,"Kentucky":96,"Liberty":2335,"Louisiana":309,"Louisiana Tech":2348,"Louisville":97,"LSU":99,"Marshall":276,"Maryland":120,"Massachusetts":113,"Memphis":235,"Miami":2390,"Miami (OH)":193,"Michigan":130,"Michigan State":127,"Middle Tennessee":2393,"Minnesota":135,"Mississippi State":344,"Missouri":142,"Missouri State":2623,"Navy":2426,"NC State":152,"Nebraska":158,"Nevada":2440,"New Mexico":167,"New Mexico State":166,"North Carolina":153,"North Dakota State":2449,"North Texas":249,"Northern Illinois":2459,"Northwestern":77,"Notre Dame":87,"Ohio":195,"Ohio State":194,"Oklahoma":201,"Oklahoma State":197,"Old Dominion":295,"Ole Miss":145,"Oregon":2483,"Oregon State":204,"Penn State":213,"Pittsburgh":221,"Purdue":2509,"Rice":242,"Rutgers":164,"Sacramento State":16,"Sam Houston":2534,"San Diego State":21,"San Jos\u00e9 State":23,"SMU":2567,"South Alabama":6,"South Carolina":2579,"South Florida":58,"Southern Miss":2572,"Stanford":24,"Syracuse":183,"TCU":2628,"Temple":218,"Tennessee":2633,"Texas":251,"Texas A&M":245,"Texas State":326,"Texas Tech":2641,"Toledo":2649,"Troy":2653,"Tulane":2655,"Tulsa":202,"UAB":5,"UCF":2116,"UCLA":26,"UConn":41,"UL Monroe":2433,"UNLV":2439,"USC":30,"Utah":254,"Utah State":328,"UTEP":2638,"UTSA":2636,"Vanderbilt":238,"Virginia":258,"Virginia Tech":259,"Wake Forest":154,"Washington":264,"Washington State":265,"West Virginia":277,"Western Kentucky":98,"Western Michigan":2711,"Wisconsin":275,"Wyoming":2751};
/* Team logos (everywhere) and current poll ranks (Games and League pages). Any element whose
   own text is an exact FBS team name gets the team's logo in front of it; inside the Games and
   League views it also gets the team's current CFP rank (AP when there is no CFP ranking yet).
   Runs on everything the app renders, now and later. Logos: ESPN's team logo CDN. */
(function () {
  var IDS = window.TEAM_LOGOS || {};
  var SKIP = { OPTION: 1, SELECT: 1, TEXTAREA: 1, TITLE: 1, SCRIPT: 1, STYLE: 1, INPUT: 1, svg: 1, text: 1, tspan: 1 };
  var RANK_SCOPE = '#viewGames, #viewLeague, #viewScout';
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : !!(dark && dark.matches);
  }
  function url(id, d) {
    return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500' + (d ? '-dark' : '') + '/' + id + '.png&h=96&w=96';
  }
  function isMark(n) { return n && n.nodeType === 1 && n.classList && (n.classList.contains('tlogo') || n.classList.contains('prk')); }
  function rankFor(name) {
    var R = window.TEAM_RANKS || {};
    if (!R[name] || window.__psSeason !== window.TEAM_RANKS_SEASON) return null;
    var r = R[name], useCfp = Object.keys(R).some(function (k) { return R[k].cfp; });
    var n = useCfp ? r.cfp : r.ap;
    if (!n) return null;
    var bits = [];
    if (r.cfp) bits.push('CFP #' + r.cfp); if (r.ap) bits.push('AP #' + r.ap); if (r.coaches) bits.push('Coaches #' + r.coaches);
    return { n: n, title: bits.join(' · ') + (window.TEAM_RANKS_WEEK ? ' (week ' + window.TEAM_RANKS_WEEK + ')' : '') };
  }
  function decorate(el) {
    if (SKIP[el.tagName] || el.closest('svg, select, [data-no-logo]')) return;
    var c = el.firstChild;
    while (isMark(c)) c = c.nextSibling;
    if (!c || c.nodeType !== 3) return;
    /* "vs Baylor", "@ Georgia", "at Florida": the logo goes after the prefix */
    var pm = /^(\s*(?:vs\.?|@|at)\s+)(\S[^]*)$/.exec(c.nodeValue);
    if (pm && IDS[pm[2].trim()] && el.tagName !== 'SPAN') {
      var rest = c.splitText(pm[1].length), wrapSpan = document.createElement('span');
      el.replaceChild(wrapSpan, rest); wrapSpan.appendChild(rest); decorate(wrapSpan); return;
    }
    var name = c.nodeValue.trim();
    var id = IDS[name];
    if (!id) return;
    var hasLogo = false, hasRank = false;
    for (var n = el.firstChild; n !== c; n = n.nextSibling) {
      if (n.classList.contains('tlogo')) hasLogo = true; else if (n.classList.contains('prk')) hasRank = true;
    }
    if (!hasLogo) {
      var img = document.createElement('img');
      img.className = 'tlogo'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.width = 20; img.height = 20; img.dataset.id = id;
      img.src = url(id, isDark());
      img.onerror = function () {
        if (this.dataset.fallback) { this.remove(); return; }
        this.dataset.fallback = '1'; this.src = url(this.dataset.id, false);
      };
      el.insertBefore(img, el.firstChild);
    }
    if (!hasRank && el.closest(RANK_SCOPE)) {
      var rk = rankFor(name);
      if (rk) {
        var s = document.createElement('span');
        s.className = 'prk'; s.textContent = rk.n; s.title = rk.title;
        el.insertBefore(s, c);
      }
    }
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    decorate(root);
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) decorate(all[i]);
  }
  window.__tlRescan = function () { scan(document.body); };
  /* the poll ranks only apply to the current season: rescan whenever the page's season is set */
  var psSeason = window.__psSeason, rescanQueued = false;
  try {
    Object.defineProperty(window, '__psSeason', { configurable: true,
      get: function () { return psSeason; },
      set: function (v) { var changed = v !== psSeason; psSeason = v;
        if (changed && !rescanQueued) { rescanQueued = true; setTimeout(function () { rescanQueued = false; scan(document.body); }, 0); } } });
  } catch (e) { /* older browsers: ranks still appear on the next render */ }
  var pending = [], queued = false;
  function flush() {
    queued = false;
    var list = pending; pending = [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].isConnected) scan(list[i]);
  }
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { if (m.target.parentNode) pending.push(m.target.parentNode); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (isMark(n)) continue;
        pending.push(n.nodeType === 3 ? n.parentNode : n);
      }
    }
    if (pending.length && !queued) { queued = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document.body);
  function swapTheme() {
    var d = isDark(), imgs = document.querySelectorAll('img.tlogo');
    for (var i = 0; i < imgs.length; i++) { imgs[i].removeAttribute('data-fallback'); imgs[i].src = url(imgs[i].dataset.id, d); }
  }
  if (dark && dark.addEventListener) dark.addEventListener('change', swapTheme);
})();
