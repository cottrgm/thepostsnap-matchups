-- Deeper numbers for The Post-Snap: drives, pressure, coverage, yards after catch, 3rd and 4th
-- down, tempo and special teams, per team and side, with national ranks. Everything comes from
-- the play-by-play text and play types in public.cfb_plays (CollegeFootballData).

-- ---------- text parsing ----------
create or replace function public.ex_name(t text, pat text) returns text language sql immutable parallel safe as $$
  select btrim((regexp_match(t, pat || '#?[0-9]* ?([A-Za-z.''-]+(?: [A-Za-z.''-]+)?(?: (?:Jr|Sr|II|III|IV)\.?)?)'))[1])
$$;
create or replace function public.ex_passer(t text) returns text language sql immutable parallel safe as $$
  select btrim((regexp_match(t, '#[0-9]+ ([A-Za-z.''-]+(?: [A-Za-z.''-]+)?(?: (?:Jr|Sr|II|III|IV)\.?)?) (?:pass|sacked)'))[1])
$$;
-- tacklers: names inside the first parenthetical that starts with a jersey number (not holder / long snapper)
create or replace function public.ex_tacklers(t text) returns text[] language sql immutable parallel safe as $$
  select coalesce(array_agg(btrim(n[1])), '{}') from
    (select (regexp_match(t, '\((#[0-9]+ [^)]*)\)'))[1] g) s
    cross join lateral regexp_matches(coalesce(case when s.g ~ '(H:|LS:)' then null else s.g end, ''), '#[0-9]+ ([A-Za-z.''-]+(?: [A-Za-z.''-]+)?(?: (?:Jr|Sr|II|III|IV)\.?)?)', 'g') n
$$;

-- ---------- every play of a season, in order, with drives ----------
create or replace function public.ex_plays(p_season int, p_team text default null, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns table(play_id text, game_id bigint, week int, offense text, defense text, period int, clock_secs int, down int, distance int,
  ytg int, yards int, play_type text, t text, ppa numeric, os int, ds int, seq numeric, drive_no bigint, drive_start int,
  drive_plays bigint, gap int, garbage boolean, is_scrim boolean)
language sql stable set search_path to 'public' as $$
  with g0 as (
    select c.game_id, max(c.week) wk, max(case when c.offense = p_team then c.defense else c.offense end) opp
    from cfb_plays c where c.season = p_season and (p_team is null or c.offense = p_team or c.defense = p_team)
    group by c.game_id
  ),
  g as (
    select g0.game_id from g0
    where (p_opp is null or g0.opp = p_opp)
      and (not p_fbs or p_team is null or g0.opp in (select f.team from v_fbs_teams f where f.season = p_season))
    order by g0.wk desc limit coalesce(p_last, 1000)
  ),
  p as (
    select c.*, c.play_id::numeric seq0,
      c.play_type in ('Rush','Rushing Touchdown','Pass Reception','Pass Incompletion','Passing Touchdown','Sack','Pass Interception Return',
                      'Interception','Interception Return Touchdown','Fumble Recovery (Own)','Fumble Recovery (Opponent)','Fumble','Safety',
                      'Fumble Return Touchdown','Pass Completion') scrim
    from cfb_plays c
    where c.season = p_season and c.game_id in (select g.game_id from g)
      and c.play_type not in ('Timeout','End Period','End of Game','End of Half','End of Regulation','Penalty','Uncategorized')
      and c.play_type not ilike 'two point%' and c.play_type <> 'Defensive 2pt Conversion'
  ),
  o as (
    select p.*,
      lag(p.offense) over w prev_off, lag(p.period) over w prev_per, lag(p.clock_secs) over w prev_clock, lag(p.scrim) over w prev_scrim,
      lag(p.play_type) over w prev_type
    from p window w as (partition by p.game_id order by p.seq0)
  ),
  d as (
    select o.*, sum(case when o.prev_off is distinct from o.offense or o.play_type ilike 'kickoff%' or o.prev_type in ('Kickoff','Punt','Punt Return','Field Goal Good','Field Goal Missed','Blocked Field Goal')
                           or (o.period in (3,5) and o.prev_per in (2,4)) then 1 else 0 end) over (partition by o.game_id order by o.seq0) dn
    from o
  )
  select d.play_id, d.game_id, d.week, d.offense, d.defense, d.period, d.clock_secs, d.down, d.distance, d.yards_to_goal, d.yards_gained,
    d.play_type, d.play_text, d.ppa, d.offense_score, d.defense_score, d.seq0, d.dn,
    first_value(case when d.scrim then d.yards_to_goal end) over (partition by d.game_id, d.dn order by case when d.scrim then 0 else 1 end, d.seq0),
    count(*) filter (where d.scrim) over (partition by d.game_id, d.dn),
    case when d.scrim and d.prev_scrim and d.prev_off = d.offense and d.prev_per = d.period and d.prev_clock - d.clock_secs between 1 and 60
         then d.prev_clock - d.clock_secs end,
    coalesce((d.period = 2 and abs(d.offense_score - d.defense_score) > 38) or (d.period = 3 and abs(d.offense_score - d.defense_score) > 28)
             or (d.period = 4 and abs(d.offense_score - d.defense_score) > 22), false),
    d.scrim
  from d
  where not p_nogarbage or not coalesce((d.period = 2 and abs(d.offense_score - d.defense_score) > 38) or (d.period = 3 and abs(d.offense_score - d.defense_score) > 28)
             or (d.period = 4 and abs(d.offense_score - d.defense_score) > 22), false)
$$;

-- ---------- 4th down: the national go rate in each situation (distance x field position) ----------
create or replace function public.ex_fourth_bucket(dist int, ytg int) returns text language sql immutable parallel safe as $$
  select case when dist <= 1 then '1' when dist <= 3 then '2-3' when dist <= 6 then '4-6' else '7+' end || '|' ||
         case when ytg > 60 then 'own' when ytg > 40 then 'mid' when ytg > 25 then 'fringe' else 'fg' end
$$;

drop materialized view if exists public.mv_fourth_nat cascade;
create materialized view public.mv_fourth_nat as
  select e.season_, public.ex_fourth_bucket(e.distance, e.ytg) bucket, avg(e.is_scrim::int)::numeric(6,4) go_rate, count(*) n
  from (select 2026 season_, x.* from public.ex_plays(2026) x union all select 2025, y.* from public.ex_plays(2025) y) e
  where e.down = 4 and (e.is_scrim or e.play_type in ('Punt','Punt Return','Field Goal Good','Field Goal Missed','Blocked Field Goal','Punt Return Touchdown'))
  group by 1, 2;
alter materialized view public.mv_fourth_nat rename column season_ to season;
create unique index if not exists mv_fourth_nat_pk on public.mv_fourth_nat(season, bucket);

-- ---------- the metrics, for one team (with filters) or every team (no team, no filters) ----------
create or replace function public.ex_metrics(p_season int, p_team text default null, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns table(team text, side text, metric text, value numeric, n bigint)
language sql stable set search_path to 'public' as $$
  with e as (select * from public.ex_plays(p_season, p_team, p_opp, p_last, p_fbs, p_nogarbage)),
  f as (
    select e.*,
      (e.play_type in ('Pass Reception','Pass Incompletion','Passing Touchdown','Pass Interception Return','Interception','Interception Return Touchdown','Sack','Pass Completion')
        or (e.play_type ilike 'fumble%' and e.t ~* 'sacked')) dropback,
      (e.play_type = 'Sack' or e.t ~* 'sacked') sack,
      e.t ~* '(hurried|pressured) by' hurried,
      e.t ~* 'broken up by' pbu,
      e.play_type ilike '%intercept%' intc,
      (e.play_type in ('Rush','Rushing Touchdown') or (e.play_type ilike 'fumble%' and e.t ~* ' (rush|run) ')) rush,
      (e.play_type ilike '%touchdown%') td
    from e
  ),
  -- yards after catch needs the catch spot (same rule as the field view)
  yac as (
    select f.offense, f.defense, f.yards - (f.ytg - case when upper(btrim(s.m[1])) = (case when f.offense = g.t1 then g.t1_ab else g.t2_ab end)
                                                       then 100 - s.m[2]::int else s.m[2]::int end) yac
    from f join mv_game_ab g on g.game_id = f.game_id
    cross join lateral (select public.spot_of(f.t) m) s
    where f.play_type in ('Pass Reception','Passing Touchdown','Pass Completion') and s.m is not null and s.m[2]::int between 0 and 50
  ),
  drv as (
    select f.game_id, f.drive_no, max(f.offense) offense, max(f.defense) defense, max(f.drive_start) start, max(f.drive_plays) plays,
      min(f.ytg) filter (where f.is_scrim) best_ytg,
      bool_or(f.td and f.play_type in ('Rushing Touchdown','Passing Touchdown')) off_td,
      bool_or(f.play_type = 'Field Goal Good') fg,
      bool_or(f.play_type in ('Punt','Punt Return','Punt Return Touchdown','Blocked Punt Touchdown')) punt,
      bool_or(f.intc or f.play_type in ('Fumble Recovery (Opponent)','Fumble Return Touchdown')) turnover,
      (array_agg(f.play_type order by f.seq desc))[1] last_type
    from f where f.drive_plays > 0 group by f.game_id, f.drive_no
  ),
  ft as (
    select f.offense, f.defense, f.distance, f.ytg, f.is_scrim, f.yards, public.ex_fourth_bucket(f.distance, f.ytg) b
    from f where f.down = 4 and (f.is_scrim or f.play_type in ('Punt','Punt Return','Field Goal Good','Field Goal Missed','Blocked Field Goal','Punt Return Touchdown'))
  ),
  natft as (
    select n.bucket, n.go_rate from public.mv_fourth_nat n where n.season = p_season
  ),
  sides as (select 'Offense' side union all select 'Defense')
  -- one row per team, side, metric
  select tm, side, metric, v, n from (
    select case when s.side = 'Offense' then f.offense else f.defense end tm, s.side,
      avg((f.hurried or f.sack)::int) filter (where f.dropback) pressure_rate,
      avg(f.sack::int) filter (where f.dropback) sack_rate,
      avg(f.ppa) filter (where f.dropback and not (f.hurried or f.sack)) epa_clean,
      avg(f.ppa) filter (where f.dropback and (f.hurried or f.sack)) epa_pressured,
      avg(f.pbu::int) filter (where f.dropback and not f.sack) pbu_rate,
      avg(f.intc::int) filter (where f.dropback and not f.sack) int_rate,
      avg((f.yards < 0)::int) filter (where f.rush) tfl_rate,
      avg((f.yards >= 4)::int) filter (where f.rush) opp_rate,
      avg((f.yards >= f.distance)::int) filter (where f.down = 3 and f.is_scrim) third_conv,
      avg((f.yards >= f.distance)::int) filter (where f.down = 3 and f.is_scrim and f.distance <= 3) third_s,
      avg((f.yards >= f.distance)::int) filter (where f.down = 3 and f.is_scrim and f.distance between 4 and 6) third_m,
      avg((f.yards >= f.distance)::int) filter (where f.down = 3 and f.is_scrim and f.distance between 7 and 10) third_l,
      avg((f.yards >= f.distance)::int) filter (where f.down = 3 and f.is_scrim and f.distance >= 11) third_xl,
      count(*) filter (where f.down = 3 and f.is_scrim) n3,
      avg(f.gap) sec_per_snap,
      count(*) filter (where f.dropback) n_db, count(*) filter (where f.rush) n_rush
    from f cross join sides s
    group by 1, 2
  ) a cross join lateral (values
    ('pressure_rate', a.pressure_rate, a.n_db), ('sack_rate', a.sack_rate, a.n_db), ('epa_clean', a.epa_clean, a.n_db), ('epa_pressured', a.epa_pressured, a.n_db),
    ('pbu_rate', a.pbu_rate, a.n_db), ('int_rate', a.int_rate, a.n_db), ('tfl_rate', a.tfl_rate, a.n_rush), ('opp_rate', a.opp_rate, a.n_rush),
    ('third_conv', a.third_conv, a.n3), ('third_s', a.third_s, a.n3), ('third_m', a.third_m, a.n3), ('third_l', a.third_l, a.n3), ('third_xl', a.third_xl, a.n3),
    ('sec_per_snap', a.sec_per_snap, null)
  ) v(metric, v, n)
  where a.tm is not null and (p_team is null or a.tm = p_team)
  union all
  select case when s.side = 'Offense' then y.offense else y.defense end, s.side, 'yac_per_catch', avg(y.yac), count(*)
  from yac y cross join sides s where (p_team is null or (case when s.side = 'Offense' then y.offense else y.defense end) = p_team)
  group by 1, 2
  union all
  select tm, side, metric, v, n from (
    select case when s.side = 'Offense' then d.offense else d.defense end tm, s.side,
      avg(case when d.off_td then 7 when d.fg then 3 else 0 end) ppd, avg(100 - d.start) start_pos,
      avg((d.plays <= 3 and d.punt)::int) three_out, avg(d.off_td::int) filter (where d.best_ytg <= 20) rz_td,
      avg(d.turnover::int) to_rate, count(*) n
    from drv d cross join sides s group by 1, 2
  ) dd cross join lateral (values ('ppd', dd.ppd), ('start_pos', dd.start_pos), ('three_out', dd.three_out), ('rz_td', dd.rz_td), ('to_rate', dd.to_rate)) v(metric, v)
  where dd.tm is not null and (p_team is null or dd.tm = p_team)
  union all
  select tm, side, metric, v, n from (
    select case when s.side = 'Offense' then x.offense else x.defense end tm, s.side,
      avg(x.is_scrim::int) go_rate, avg((x.yards >= x.distance)::int) filter (where x.is_scrim) conv,
      avg(x.is_scrim::int - coalesce(nf.go_rate, 0)) aggr, count(*) n
    from ft x left join natft nf on nf.bucket = x.b cross join sides s group by 1, 2
  ) q cross join lateral (values ('fourth_go', q.go_rate), ('fourth_conv', q.conv), ('fourth_aggr', q.aggr)) v(metric, v)
  where q.tm is not null and (p_team is null or q.tm = p_team)
  union all
  -- special teams: net punt (the punting team), field goals (the kicking team), start after kickoffs (the receiving team)
  select tm, side, metric, v, n from (
    select case when s.side = 'Offense' then f.offense else f.defense end tm, s.side,
      avg( coalesce((regexp_match(f.t, 'punt (\d+) yards?'))[1]::int, 0)
         - coalesce((regexp_match(f.t, 'return (\d+) yards?'))[1]::int, 0)
         + coalesce((regexp_match(f.t, 'return for loss of (\d+) yards?'))[1]::int, 0)
         - case when f.t ~* 'touchback' then 20 else 0 end) filter (where f.play_type in ('Punt','Punt Return') and f.t ~* 'punt \d+ yard') net_punt,
      avg((f.play_type = 'Field Goal Good')::int) filter (where f.play_type in ('Field Goal Good','Field Goal Missed','Blocked Field Goal')) fg_pct,
      avg((f.play_type = 'Field Goal Good')::int) filter (where f.play_type in ('Field Goal Good','Field Goal Missed','Blocked Field Goal')
          and coalesce((regexp_match(f.t, 'from (\d+) yards?'))[1]::int, 0) >= 40) fg40,
      count(*) filter (where f.play_type in ('Punt','Punt Return')) n
    from f cross join sides s group by 1, 2
  ) st cross join lateral (values ('net_punt', st.net_punt), ('fg_pct', st.fg_pct), ('fg40', st.fg40)) v(metric, v)
  where st.tm is not null and (p_team is null or st.tm = p_team)
  union all
  select case when s.side = 'Offense' then d.offense else d.defense end, s.side, 'ko_start', avg(100 - d.start), count(*)
  from drv d cross join sides s
  where exists (select 1 from f k where k.game_id = d.game_id and k.drive_no = d.drive_no - 1 and k.play_type ilike 'kickoff%')
    and (p_team is null or (case when s.side = 'Offense' then d.offense else d.defense end) = p_team)
  group by 1, 2
$$;

-- ---------- every FBS team's full-season numbers (for national ranks) ----------
drop materialized view if exists public.mv_team_extras;
create materialized view public.mv_team_extras as
  select 2026 season, m.* from public.ex_metrics(2026) m where m.team in (select team from public.v_fbs_teams where season = 2026)
  union all
  select 2025, m.* from public.ex_metrics(2025) m where m.team in (select team from public.v_fbs_teams where season = 2025);
create unique index if not exists mv_team_extras_pk on public.mv_team_extras(season, team, side, metric);

-- direction: 1 = higher is better for an offense, -1 = lower is better, 0 = no better/worse (#1 = highest), 2 = no better/worse (#1 = lowest)
create table if not exists public.ex_metric_def(metric text primary key, dir int, label text, grp text, ord int);
truncate public.ex_metric_def;
insert into public.ex_metric_def values
 ('yac_per_catch', 1, 'Yards after catch per catch', 'recv', 1),
 ('pressure_rate', -1, 'Pressure rate (hurries + sacks per dropback)', 'pressure', 1), ('sack_rate', -1, 'Sack rate', 'pressure', 2),
 ('epa_clean', 1, 'EPA per dropback, clean pocket', 'pressure', 3), ('epa_pressured', 1, 'EPA per dropback, under pressure', 'pressure', 4),
 ('pbu_rate', -1, 'Passes broken up (per attempt)', 'coverage', 1), ('int_rate', -1, 'Interception rate', 'coverage', 2),
 ('tfl_rate', -1, 'Runs for a loss', 'run', 1), ('opp_rate', 1, 'Runs of 4+ yards', 'run', 2),
 ('ppd', 1, 'Points per drive', 'drives', 1), ('start_pos', 1, 'Average starting yard line', 'drives', 2), ('three_out', -1, 'Three-and-outs', 'drives', 3),
 ('rz_td', 1, 'Touchdowns on red-zone trips', 'drives', 4), ('to_rate', -1, 'Drives ending in a turnover', 'drives', 5),
 ('third_conv', 1, '3rd-down conversion rate', 'third', 1), ('third_s', 1, '3rd & 1-3', 'third', 2), ('third_m', 1, '3rd & 4-6', 'third', 3),
 ('third_l', 1, '3rd & 7-10', 'third', 4), ('third_xl', 1, '3rd & 11+', 'third', 5),
 ('fourth_go', 0, 'Go-for-it rate on 4th down', 'fourth', 1), ('fourth_aggr', 0, 'Aggressiveness vs FBS in the same spots', 'fourth', 2),
 ('fourth_conv', 1, '4th-down conversion rate', 'fourth', 3),
 ('sec_per_snap', 2, 'Seconds between snaps on a drive', 'tempo', 1),
 ('net_punt', 1, 'Net punt', 'special', 1), ('fg_pct', 1, 'Field goal %', 'special', 2), ('fg40', 1, 'Field goal % from 40+', 'special', 3),
 ('ko_start', 1, 'Starting yard line after kickoffs', 'special', 4);

create or replace function public.web_extras(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with mine as (
    select m.metric, m.value, m.n from public.ex_metrics(p_season, p_team, p_opp, p_last, p_fbs, p_nogarbage) m where m.side = p_side
  ),
  pool as (select t.metric, t.team, t.value from public.mv_team_extras t where t.season = p_season and t.side = p_side and t.team <> p_team and t.value is not null),
  nat as (select t.metric, avg(t.value) v from public.mv_team_extras t where t.season = p_season and t.side = 'Offense' group by t.metric),
  m as (
    select d.metric, d.label, d.grp, d.ord, x.value, x.n,
      case when p_side = 'Defense' and abs(d.dir) = 1 then -d.dir else d.dir end dir
    from public.ex_metric_def d left join mine x on x.metric = d.metric
  ),
  metrics as (
    select jsonb_object_agg(m.metric, jsonb_build_object('label', m.label, 'grp', m.grp, 'ord', m.ord, 'v', round(m.value, 4), 'n', m.n, 'dir', m.dir,
      'nat', round((select n.v from nat n where n.metric = m.metric), 4),
      'pool', (select count(*) + 1 from pool p where p.metric = m.metric),
      'rank', case when m.value is null then null else 1 + (select count(*) from pool p where p.metric = m.metric and
                case when m.dir in (1, 0) then p.value > m.value else p.value < m.value end) end)) j
    from m
  ),
  e as (select * from public.ex_plays(p_season, p_team, p_opp, p_last, p_fbs, p_nogarbage)),
  mineplays as (select e.* from e where (p_side = 'Offense' and e.offense = p_team) or (p_side = 'Defense' and e.defense = p_team)),
  pass as (
    select x.*, x.play_type in ('Pass Reception','Passing Touchdown','Pass Completion') cmp,
      case when s.m is null or s.m[2]::int not between 0 and 50 then null
           when upper(btrim(s.m[1])) = (case when x.offense = g.t1 then g.t1_ab else g.t2_ab end) then x.ytg - (100 - s.m[2]::int) else x.ytg - s.m[2]::int end air
    from mineplays x left join mv_game_ab g on g.game_id = x.game_id cross join lateral (select public.spot_of(x.t) m) s
    where x.play_type in ('Pass Reception','Pass Incompletion','Passing Touchdown','Pass Interception Return','Interception','Interception Return Touchdown','Pass Completion')
  ),
  recv as (
    select public.field_recv(p.t) who, count(*) tg, count(*) filter (where p.cmp) rec, sum(p.yards) filter (where p.cmp) yds,
      sum(p.yards - p.air) filter (where p.cmp and p.air is not null) yac, count(*) filter (where p.cmp and p.air is not null) yac_n,
      avg(p.air) adot, avg(p.ppa) epa, count(*) filter (where p.play_type ilike '%touchdown%' and p.cmp) td
    from pass p where public.field_recv(p.t) is not null group by 1
  ),
  db as (
    select x.*, (x.play_type = 'Sack' or x.t ~* 'sacked') sk, x.t ~* '(hurried|pressured) by' hu
    from mineplays x
    where x.play_type in ('Pass Reception','Pass Incompletion','Passing Touchdown','Pass Interception Return','Interception','Interception Return Touchdown','Sack','Pass Completion')
       or (x.play_type ilike 'fumble%' and x.t ~* 'sacked')
  ),
  qb as (
    select public.ex_passer(d.t) who, count(*) n, avg((d.sk or d.hu)::int) pr, count(*) filter (where d.sk) sacks,
      avg(d.ppa) filter (where not (d.sk or d.hu)) epa_clean, avg(d.ppa) filter (where d.sk or d.hu) epa_pr
    from db d where public.ex_passer(d.t) is not null group by 1
  ),
  dfx as (
    select who, sum(hur) hur, sum(sk) sk, sum(pbu) pbu, sum(it) it, sum(tfl) tfl, sum(tk) tk from (
      select public.ex_name(x.t, '(?:hurried|pressured) by ') who, 1 hur, 0 sk, 0 pbu, 0 it, 0 tfl, 0 tk from mineplays x where x.t ~* '(hurried|pressured) by'
      union all select (public.ex_tacklers(x.t))[1], 0, 1, 0, 0, 0, 0 from mineplays x where x.play_type = 'Sack' or x.t ~* 'sacked for'
      union all select public.ex_name(x.t, 'broken up by '), 0, 0, 1, 0, 0, 0 from mineplays x where x.t ~* 'broken up by'
      union all select public.ex_name(x.t, 'intercepted by '), 0, 0, 0, 1, 0, 0 from mineplays x where x.play_type ilike '%intercept%'
      union all select n, 0, 0, 0, 0, 1, 0 from mineplays x cross join lateral unnest(public.ex_tacklers(x.t)) n
        where x.play_type in ('Rush','Rushing Touchdown') and x.yards < 0
      union all select n, 0, 0, 0, 0, 0, 1 from mineplays x cross join lateral unnest(public.ex_tacklers(x.t)) n
        where x.is_scrim and x.play_type not in ('Pass Incompletion','Sack')
    ) u where who is not null and who <> '' group by who
  ),
  drv as (
    select x.game_id, x.drive_no, max(x.week) week, max(case when p_side = 'Offense' then x.defense else x.offense end) opp, min(x.period) q,
      max(x.drive_start) start, max(x.drive_plays) plays, min(x.ytg) filter (where x.is_scrim) end_ytg,
      bool_or(x.play_type in ('Rushing Touchdown','Passing Touchdown')) td, bool_or(x.play_type = 'Field Goal Good') fg,
      (array_agg(x.play_type order by x.seq desc))[1] last_type
    from e x where x.drive_plays > 0 and ((p_side = 'Offense' and x.offense = p_team) or (p_side = 'Defense' and x.defense = p_team))
    group by x.game_id, x.drive_no
  ),
  fourth as (
    select public.ex_fourth_bucket(x.distance, x.ytg) b, count(*) n, avg(x.is_scrim::int) go, avg((x.yards >= x.distance)::int) filter (where x.is_scrim) conv
    from mineplays x where x.down = 4 and (x.is_scrim or x.play_type in ('Punt','Punt Return','Field Goal Good','Field Goal Missed','Blocked Field Goal','Punt Return Touchdown'))
    group by 1
  ),
  fg as (
    select case when d < 30 then 'Under 30' when d < 40 then '30-39' when d < 50 then '40-49' else '50+' end b, min(d) o, count(*) att,
      count(*) filter (where good) made
    from (select coalesce((regexp_match(x.t, 'from (\d+) yards?'))[1]::int, (regexp_match(x.t, '(\d+) (?:yd|yard) (?:FG|field)'))[1]::int) d, x.play_type = 'Field Goal Good' good
          from mineplays x where x.play_type in ('Field Goal Good','Field Goal Missed','Blocked Field Goal')) z
    where d is not null group by 1
  )
  select jsonb_build_object('team', p_team, 'season', p_season, 'side', p_side,
    'metrics', (select j from metrics),
    'receivers', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'tg', tg, 'rec', rec, 'yds', yds, 'yac', yac, 'yac_n', yac_n,
        'adot', round(adot, 1), 'epa', round(epa, 2), 'td', td) order by tg desc) from recv where tg >= 2), '[]'),
    'passers', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'n', n, 'pr', round(pr, 3), 'sacks', sacks, 'epa_clean', round(epa_clean, 2), 'epa_pr', round(epa_pr, 2)) order by n desc) from qb where n >= 5), '[]'),
    'defenders', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'hur', hur, 'sk', sk, 'pbu', pbu, 'int', it, 'tfl', tfl, 'tk', tk)
        order by (hur + 2 * sk + pbu + 2 * it + tfl) desc, tk desc) from (select * from dfx order by (hur + 2 * sk + pbu + 2 * it + tfl) desc, tk desc limit 40) z), '[]'),
    'drives', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'opp', opp, 'q', q, 'start', 100 - start, 'plays', plays,
        'yds', start - coalesce(end_ytg, start), 'pts', case when td then 7 when fg then 3 else 0 end,
        'result', case when td then 'Touchdown' when fg then 'Field goal' when last_type in ('Punt','Punt Return','Punt Return Touchdown','Blocked Punt Touchdown') then 'Punt'
                       when last_type in ('Field Goal Missed','Blocked Field Goal') then 'Missed FG'
                       when last_type ilike '%intercept%' then 'Interception' when last_type ilike 'fumble recovery (opponent)%' or last_type = 'Fumble Return Touchdown' then 'Fumble'
                       when last_type = 'Safety' then 'Safety' else 'Downs / end of half' end) order by week, q, drive_no) from drv), '[]'),
    'fourth', coalesce((select jsonb_agg(jsonb_build_object('b', f.b, 'n', f.n, 'go', round(f.go, 3), 'conv', round(f.conv, 3), 'nat', n.go_rate) order by f.b)
        from fourth f left join public.mv_fourth_nat n on n.season = p_season and n.bucket = f.b), '[]'),
    'fg', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'att', att, 'made', made) order by o) from fg), '[]'))
$$;
grant execute on function public.web_extras(text,int,text,text,int,boolean,boolean) to service_role;
