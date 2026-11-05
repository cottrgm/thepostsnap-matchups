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
    var W = 940, LBL = 300, PAD = 92, RIGHT = W - PAD, TRACK = RIGHT - LBL;
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
      var vtxt = (r.value === null ? '–' : valFmt(r.value));
      g.appendChild(el('text', { x: LBL - 14 + TRACK + PAD - 8, y: y + 4, 'text-anchor': 'end', class: 'num' },
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
    var rows = state.data.playcalling
      .filter(function (r) { return r.season === state.season && r.side === s.side; })
      .sort(function (a, b) { return a.sort_order - b.sort_order; })
      .map(function (r) {
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
  var PC_NO_SR = { 'Explosive Plays': 1, 'Explosive Pass (15+)': 1, 'Explosive Run (12+)': 1, 'Stuffed Run (0 or less)': 1, 'Sacks': 1, 'Sack Rate': 1 };
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
  function refreshPC() { buildPCChart(); buildTend(); }

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
  function ydLine(ytg) { if (ytg == null) return ''; if (ytg === 50) return '50'; return ytg > 50 ? 'Own ' + (100 - ytg) : 'Opp ' + ytg; }
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
          ' · ' + (list.length ? Math.round(100 * good / list.length) : 0) + '% successful' + (side === 'Defense' ? ' for the offense' : '') + '.'));
        var t = h('table', 'pltab'), hr = h('tr');
        ['Wk', 'Opponent', 'Q', 'Clock', 'Down', 'Ball on', 'Score', 'Yds', 'EPA', 'Play'].forEach(function (x) { hr.appendChild(h('th', null, x)); });
        var th = h('thead'); th.appendChild(hr); t.appendChild(th);
        var tb = h('tbody');
        list.forEach(function (p) {
          var r = h('tr', p.success ? 'ok' : 'no');
          [p.week, p.opponent, p.q > 4 ? 'OT' : p.q, clk(p.clock), p.down ? ord(p.down) + ' & ' + p.dist : '', ydLine(p.ytg), p.score, p.yds, sgn(p.epa)].forEach(function (v, i) {
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

    var CW = 168, CH = 88, GX = 46, GY = 40, W = GX * 2 + CW * 3, H = GY + CH * 4 + 74;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, role: 'img' });
    var POS = hex2rgb(css('--neg')), NEGC = hex2rgb(css('--pos')), MID = hex2rgb(css('--mid'));
    var turf = css('--plane');

    svg.appendChild(el('rect', { x: GX, y: GY, width: CW * 3, height: CH * 4, fill: turf, stroke: css('--axis'), 'stroke-width': 1.5 }));

    for (var b = 0; b < 4; b++) {
      for (var d = 0; d < 3; d++) {
        var r = byKey[BANDS[b] + '|' + DIRS[d]];
        var x = GX + d * CW, y = GY + b * CH;
        var fill = turf, t;
        if (r && r.epa_per_att !== null) {
          t = Math.max(-1, Math.min(1, r.epa_per_att / lim));
          fill = rgb(t >= 0 ? lerp(MID, POS, t) : lerp(MID, NEGC, -t));
        }
        svg.appendChild(el('rect', { x: x + 1, y: y + 1, width: CW - 2, height: CH - 2, fill: fill }));
        var cx = x + CW / 2;
        if (r) {
          svg.appendChild(el('text', { x: cx, y: y + CH / 2 - 6, 'text-anchor': 'middle', class: 'lbl', 'font-size': 19, 'font-weight': 600 }, sgn(r.epa_per_att)));
          svg.appendChild(el('text', { x: cx, y: y + CH / 2 + 14, 'text-anchor': 'middle', class: 'num' },
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
      svg.appendChild(el('text', { x: GX - 10, y: GY + b * CH + CH / 2 + 4, 'text-anchor': 'end', class: 'num' }, BANDS[b].replace(/ \(.*/, '')));
    }
    DIRS.forEach(function (dn, i) {
      svg.appendChild(el('text', { x: GX + i * CW + CW / 2, y: GY - 12, 'text-anchor': 'middle', class: 'lbl' }, dn));
    });
    var losY = GY + CH * 3;
    svg.appendChild(el('line', { x1: GX, x2: GX + CW * 3, y1: losY, y2: losY, stroke: css('--ink'), 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }));
    svg.appendChild(el('text', { x: GX + CW * 3 + 8, y: losY + 4, class: 'ax' }, 'LOS'));

    var ly = GY + CH * 4 + 30, lw = 210, lx = W / 2 - lw / 2;
    for (var i = 0; i <= 40; i++) {
      var tt = -1 + (i / 40) * 2;
      svg.appendChild(el('rect', { x: lx + (i / 41) * lw, y: ly, width: lw / 40 + 1, height: 9, fill: rgb(tt >= 0 ? lerp(MID, POS, tt) : lerp(MID, NEGC, -tt)) }));
    }
    svg.appendChild(el('text', { x: lx - 8, y: ly + 8, 'text-anchor': 'end', class: 'ax' }, sgn(-lim)));
    svg.appendChild(el('text', { x: lx + lw + 8, y: ly + 8, class: 'ax' }, sgn(lim)));
    svg.appendChild(el('text', { x: W / 2, y: ly + 26, 'text-anchor': 'middle', class: 'ax' }, 'EPA per attempt'));
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
    return fetch('api/board?season=' + season + '&side=' + encodeURIComponent(side))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
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
      g.appendChild(el('text', { x: W - 8, y: y + 4, 'text-anchor': 'end', class: 'num' },
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
        gg.appendChild(el('text', { x: W - 8, y: y + 4, 'text-anchor': 'end', class: 'num' }, sgn(cm, 1)));
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
        { head: 'Player', key: 'athlete', num: false, cell: function (r) { return h('td', 'tm', r.athlete); } },
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
     Views. The team page is one thing; a weekly slate and league-wide
     tables are another shape entirely, so they get their own screens
     behind a switcher rather than being bolted on as more panels.
     ===================================================================== */
  var VIEWS = [
    { id: 'team',    label: 'Team',    el: 'viewTeam' },
    { id: 'games',   label: 'Games',   el: 'viewGames' },
    { id: 'league',  label: 'League',  el: 'viewLeague' },
    { id: 'coaches', label: 'Coaches', el: 'viewCoaches' },
    { id: 'box',     label: null,      el: 'viewBox' }
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
    if (id === 'team') { q.set('team', state.team); }
    else if (id === 'box') { q.set('view', 'box'); q.set('game', vstate.boxGame); }
    else { q.set('view', id); if (id === 'games' && vstate.week) q.set('week', vstate.week); }
    history.replaceState(null, '', '?' + q.toString());
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);

    if (id === 'games') buildGames();
    if (id === 'league') buildLeague();
    if (id === 'coaches') buildCoaches();
    if (id === 'box') buildBox();
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
        tr.onclick = function () { vstate.boxGame = rows[i].game_id; setView('box'); };
      });
      cnt.textContent = rows.length + ' game' + (rows.length === 1 ? '' : 's');
      var withEdge = rows.filter(function (g) { return g.edge !== null; });
      var big = withEdge.filter(function (g) { return Math.abs(g.edge) >= 3; }).length;
      note.innerHTML = 'Projected margin is SP+ difference plus <b>2.2</b> points of home field, nothing else &mdash; ' +
        'a deliberately simple model you can check by hand. Market margin is the median closing line across every book in the feed. ' +
        (withEdge.length
          ? '<b>' + big + '</b> of ' + withEdge.length + ' games this week differ by three points or more. '
          : '') +
        'Click any row for the box score. This is a description of the data, not a betting recommendation.';
    }
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
      { head: 'Player', key: 'athlete', num: false, cell: function (p) { return h('td', 'tm', p.athlete); } },
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
    if (!vstate.leagueSort) { vstate.leagueSort = v.cols[0][0]; vstate.leagueAsc = (v.id === 'pace'); }

    var key = v.id + '|' + state.season + '|' + (v.sided ? side : '');
    var tb = document.getElementById('leagueTable');
    var note = document.getElementById('leagueNote');
    if (vstate.leagueData[key]) return paint(vstate.leagueData[key]);
    tb.innerHTML = ''; note.textContent = 'Loading…';
    fetch('api/league?season=' + state.season + '&what=' + v.id + (v.sided ? '&side=' + side : ''))
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
          if (kk === '_pos') { vstate.leagueSort = v.cols[0][0]; vstate.leagueAsc = (v.id === 'pace'); buildLeague(); return; }
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
    buildHero(); buildRatings(); buildMarket(); buildRank(); buildAdjusted();
    buildField(); buildSit(); buildTrend(); buildPlayers(); buildLimits();
    buildFresh(); buildH2H(); buildConf(); buildBoard(); buildPCChart(); buildTend();
    document.getElementById('loading').hidden = true;
    document.getElementById('content').hidden = false;
    wireCollapse();
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
    fetch('api/teams').then(function (r) { return r.json(); }).then(function (list) {
      state.teams = list;
      var dl = document.getElementById('teamList');
      list.forEach(function (t) {
        var o = document.createElement('option'); o.value = t.team;
        o.label = t.conference || ''; dl.appendChild(o);
      });
      var inp = document.getElementById('teamInput');
      var qs = new URLSearchParams(location.search).get('team');
      var start = qs && list.some(function (t) { return t.team === qs; }) ? qs
        : (list.some(function (t) { return t.team === 'Auburn'; }) ? 'Auburn' : list[0].team);
      inp.value = start;
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        var hit = list.filter(function (t) { return t.team.toLowerCase() === v.toLowerCase(); })[0];
        if (hit) loadTeam(hit.team); else inp.value = state.team;
      });
      document.getElementById('seasonSel').addEventListener('change', function (e) {
        state.season = +e.target.value;
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
      if (qp.get('game')) { vstate.boxGame = +qp.get('game'); wantView = 'box'; }
      if (qp.get('week')) vstate.week = +qp.get('week');
      loadTeam(start, wantView);
    }).catch(function (e) {
      document.getElementById('loading').textContent = 'Could not reach the data service.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
