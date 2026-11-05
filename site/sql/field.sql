-- "On the field": where passes are thrown (target spot from the play-by-play "caught at / thrown to"
-- yard line) and where runs go (rush left / middle / right), with national ranks for every zone.
-- Air yards = line of scrimmage minus the target spot (same rule as web_zones_base), extended so
-- catches in the end zone (yard line 00) count too. Pass zones: Behind LOS / Short 0-9 /
-- Intermediate 10-19 / Deep 20+ by Left / Middle / Right; run lanes: Left / Middle / Right.

create or replace function public.field_recv(t text) returns text language sql immutable parallel safe as $$
  select btrim((regexp_match(t, 'pass (?:complete|incomplete)[a-z ]*? to (?:#[0-9]+ )?([A-Za-z.'' -]+?)(?: caught| thrown| for|,|\.|$)'))[1])
$$;
create or replace function public.field_rusher(t text) returns text language sql immutable parallel safe as $$
  select btrim((regexp_match(t, '(?:#[0-9]+ )([A-Za-z.''-]+(?: [A-Za-z.''-]+)?(?: (?:Jr|Sr|II|III|IV)\.?)?) (?:rush|run|scramble)'))[1])
$$;
create or replace function public.field_dir(t text, is_pass boolean) returns text language sql immutable parallel safe as $$
  select case when is_pass then
      case when t ~* 'pass (complete|incomplete)[a-z ]* left' then 'L' when t ~* 'pass (complete|incomplete)[a-z ]* right' then 'R'
           when t ~* 'pass (complete|incomplete)[a-z ]* middle' then 'M' end
    else
      case when t ~* '(rush|run)[a-z ]*? left' then 'L' when t ~* '(rush|run)[a-z ]*? right' then 'R'
           when t ~* '(rush|run)[a-z ]*? (middle|up the middle)' then 'M' end end
$$;
create or replace function public.field_band(air int) returns text language sql immutable parallel safe as $$
  select case when air is null then null when air < 0 then 'B' when air <= 9 then 'S' when air <= 19 then 'I' else 'D' end
$$;

-- every FBS-vs-FBS pass and run with its zone, once per season (base for team ranks and national averages)
drop materialized view if exists public.mv_field_team cascade;
create materialized view public.mv_field_team as
with fbs as (select season, team from public.v_fbs_teams),
base as (
  select c.season, c.offense, c.defense, f.kind, f.completion, f.success, c.ppa, c.yards_gained,
    case when f.kind = 'P' then
      public.field_band(c.yards_to_goal - case when upper(btrim(s.m[1])) = (case when c.offense = g.t1 then g.t1_ab else g.t2_ab end)
                                               then 100 - s.m[2]::int else s.m[2]::int end) || public.field_dir(c.play_text, true)
    else 'R' || public.field_dir(c.play_text, false) end zone,
    case when f.kind = 'P' then c.yards_to_goal - case when upper(btrim(s.m[1])) = (case when c.offense = g.t1 then g.t1_ab else g.t2_ab end)
                                               then 100 - s.m[2]::int else s.m[2]::int end end air
  from public.cfb_plays c
  join public.cfb_play_flags f on f.play_id = c.play_id
  join public.mv_game_ab g on g.game_id = c.game_id
  join fbs o on o.season = c.season and o.team = c.offense
  join fbs d on d.season = c.season and d.team = c.defense
  cross join lateral (select case when f.kind = 'P' then public.spot_of(c.play_text) end m) s
  where f.kind in ('P','R') and c.down between 1 and 4
    and (f.kind = 'R' or (s.m is not null and s.m[2]::int between 0 and 50))
),
z as (select * from base where zone is not null and length(zone) = 2 and (air is null or air between -15 and 75)),
sides as (
  select season, offense team, 'Offense' side, kind, zone, completion, success, ppa, yards_gained from z
  union all
  select season, defense, 'Defense', kind, zone, completion, success, ppa, yards_gained from z
)
select season, team, side, zone, count(*) plays,
  sum(completion::int) cmp_n, sum(success::int) sr_n, sum(ppa) epa_s, sum(yards_gained) yds_s,
  sum((yards_gained >= 12)::int) expl_n, sum((yards_gained <= 0)::int) stuff_n,
  sum(count(*)) over (partition by season, team, side, left(zone, 1) = 'R') tot
from sides group by season, team, side, zone;
create unique index if not exists mv_field_team_pk on public.mv_field_team(season, team, side, zone);

create or replace function public.web_field(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language sql stable set search_path to 'public' as $$
  with pl as (
    select p.* from public.pc_plays(p_team, p_season, p_side, p_opp, p_last, p_fbs, p_nogarbage) p
    where p.kind in ('P','R') and p.down between 1 and 4
  ),
  pass as (
    select p.*, case when s.m is null or s.m[2]::int not between 0 and 50 then null
                     when upper(btrim(s.m[1])) = (case when (case when p_side = 'Offense' then p_team else p.opponent end) = g.t1 then g.t1_ab else g.t2_ab end)
                       then p.yards_to_goal - (100 - s.m[2]::int) else p.yards_to_goal - s.m[2]::int end air
    from pl p
    left join public.mv_game_ab g on g.game_id = p.game_id
    cross join lateral (select public.spot_of(p.play_text) m) s
    where p.kind = 'P'
  ),
  pz as (
    select p.*, public.field_dir(p.play_text, true) dir,
      case when p.air between -15 and 75 then public.field_band(p.air) || public.field_dir(p.play_text, true) end zone
    from pass p where p.air is null or p.air between -15 and 75
  ),
  rz as (select p.*, public.field_dir(p.play_text, false) dir, 'R' || public.field_dir(p.play_text, false) zone from pl p where p.kind = 'R'),
  -- this team's zones (with the filters)
  zs as (
    select zone, count(*) plays, avg(completion::int) cmp, avg(success::int) sr, avg(ppa) epa, avg(yards_gained) ypp,
      avg((yards_gained >= 12)::int) expl, avg((yards_gained <= 0)::int) stuff, left(zone, 1) = 'R' is_run
    from (select zone, completion, success, ppa, yards_gained from pz where zone is not null and length(zone) = 2
          union all select zone, null, success, ppa, yards_gained from rz where zone is not null and length(zone) = 2) u
    group by zone
  ),
  zt as (select z.*, z.plays::numeric / nullif(sum(z.plays) over (partition by z.is_run), 0) share from zs z),
  -- every other FBS team's full season, same side
  pool as (
    select t.zone, t.team, t.plays, t.plays::numeric / nullif(t.tot, 0) share, t.cmp_n::numeric / t.plays cmp, t.sr_n::numeric / t.plays sr,
      t.epa_s / t.plays epa, t.yds_s::numeric / t.plays ypp, t.expl_n::numeric / t.plays expl, t.stuff_n::numeric / t.plays stuff
    from public.mv_field_team t where t.season = p_season and t.side = p_side and t.team <> p_team and t.plays >= 5
  ),
  nat as (
    select t.zone, sum(t.plays) plays, sum(t.plays)::numeric / nullif(sum(sum(t.plays)) over (partition by left(t.zone, 1) = 'R'), 0) share,
      sum(t.cmp_n)::numeric / sum(t.plays) cmp, sum(t.sr_n)::numeric / sum(t.plays) sr, sum(t.epa_s) / sum(t.plays) epa,
      sum(t.yds_s)::numeric / sum(t.plays) ypp, sum(t.expl_n)::numeric / sum(t.plays) expl, sum(t.stuff_n)::numeric / sum(t.plays) stuff
    from public.mv_field_team t where t.season = p_season and t.side = 'Offense' group by t.zone
  ),
  ranked as (
    select z.zone, jsonb_build_object(
      'n', z.plays, 'share', round(z.share, 4), 'cmp', round(z.cmp, 4), 'sr', round(z.sr, 4), 'epa', round(z.epa, 3), 'ypp', round(z.ypp, 2),
      'expl', round(z.expl, 4), 'stuff', round(z.stuff, 4),
      'pool', (select count(*) + 1 from pool p where p.zone = z.zone),
      -- share: #1 = goes there most often (no better or worse); results: #1 = best, from this side's point of view
      'rk_share', 1 + (select count(*) from pool p where p.zone = z.zone and p.share > z.share),
      'rk_cmp',   case when z.is_run then null else 1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.cmp > z.cmp else p.cmp < z.cmp end) end,
      'rk_sr',    1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.sr > z.sr else p.sr < z.sr end),
      'rk_epa',   1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.epa > z.epa else p.epa < z.epa end),
      'rk_ypp',   1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.ypp > z.ypp else p.ypp < z.ypp end),
      'rk_expl',  1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.expl > z.expl else p.expl < z.expl end),
      'rk_stuff', case when not z.is_run then null else 1 + (select count(*) from pool p where p.zone = z.zone and case when p_side = 'Offense' then p.stuff < z.stuff else p.stuff > z.stuff end) end,
      'nat', (select jsonb_build_object('share', round(n.share, 4), 'cmp', round(n.cmp, 4), 'sr', round(n.sr, 4), 'epa', round(n.epa, 3),
                                        'ypp', round(n.ypp, 2), 'expl', round(n.expl, 4), 'stuff', round(n.stuff, 4)) from nat n where n.zone = z.zone)) j
    from zt z
  )
  select jsonb_build_object('team', p_team, 'season', p_season, 'side', p_side,
    'zones', coalesce((select jsonb_object_agg(zone, j) from ranked), '{}'),
    'passes', coalesce((select jsonb_agg(jsonb_build_array(
        p.air, p.dir, case when p.play_type ilike '%interception%' then 'X' when p.completion then 'C' else 'I' end,
        (p.play_type ilike '%touchdown%' or p.play_text ilike '%touchdown%')::int, p.yards_gained, round(p.ppa, 2), p.success::int,
        public.field_recv(p.play_text), p.week, p.opponent, p.period, p.clock_secs, p.down, p.distance, p.yards_to_goal,
        p.play_text, p.team_score || '-' || p.opp_score, p.zone)) from pz p), '[]'),
    'runs', coalesce((select jsonb_agg(jsonb_build_array(
        p.dir, p.yards_gained, round(p.ppa, 2), p.success::int, coalesce(public.field_rusher(p.play_text), ''), p.qb_run::int,
        (p.play_type ilike '%touchdown%' or p.play_text ilike '%touchdown%')::int, p.week, p.opponent, p.period, p.clock_secs,
        p.down, p.distance, p.yards_to_goal, p.play_text, p.team_score || '-' || p.opp_score)) from rz p), '[]'))
$$;

grant execute on function public.web_field(text,int,text,text,int,boolean,boolean) to service_role;
