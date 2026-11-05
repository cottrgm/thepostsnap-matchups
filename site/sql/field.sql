-- "On the field": where passes are thrown (target spot from the play-by-play "caught at / thrown to"
-- yard line) and where runs go (rush left / middle / right), per play, with the same filters as the
-- live playcalling chart. Air yards = line of scrimmage minus the target spot, the same rule as
-- web_zones_base, extended so catches in the end zone (yard line 00) count too.

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

create or replace function public.web_field(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language sql stable set search_path to 'public' as $$
  with pl as (
    select p.* from public.pc_plays(p_team, p_season, p_side, p_opp, p_last, p_fbs, p_nogarbage) p
    where p.kind in ('P','R') and p.down between 1 and 4
  ),
  pass as (
    select p.*, s.m, upper(btrim(s.m[1])) spot_ab, s.m[2]::int spot_num,
      case when (case when p_side = 'Offense' then p_team else p.opponent end) = g.t1 then g.t1_ab else g.t2_ab end own_ab
    from pl p
    join public.mv_game_ab g on g.game_id = p.game_id
    cross join lateral (select public.spot_of(p.play_text) m) s
    where p.kind = 'P'
  ),
  pass2 as (
    select p.*, case when p.m is null then null when p.spot_ab = p.own_ab then 100 - p.spot_num else p.spot_num end tgt
    from pass p
  ),
  pts as (
    select jsonb_build_array(
      case when p.tgt is null then null else p.yards_to_goal - p.tgt end,          -- 0 air yards
      public.field_dir(p.play_text, true),                                          -- 1 L/M/R
      case when p.play_type ilike '%interception%' then 'X'
           when p.completion then 'C' else 'I' end,                                 -- 2 result
      (p.play_type ilike '%touchdown%' or p.play_text ilike '%touchdown%')::int,    -- 3 TD
      p.yards_gained, round(p.ppa, 2), p.success::int,                              -- 4 yds, 5 epa, 6 success
      public.field_recv(p.play_text),                                               -- 7 receiver
      p.week, p.opponent, p.period, p.clock_secs, p.down, p.distance, p.yards_to_goal, -- 8..14
      p.play_text, p.team_score || '-' || p.opp_score) j                            -- 15 text, 16 score
    from pass2 p
    where p.tgt is null or (p.yards_to_goal - p.tgt) between -15 and 75
  ),
  runs as (
    select jsonb_build_array(
      public.field_dir(p.play_text, false), p.yards_gained, round(p.ppa, 2), p.success::int,  -- 0 dir, 1 yds, 2 epa, 3 success
      coalesce(public.field_rusher(p.play_text), ''), p.qb_run::int,                         -- 4 rusher, 5 qb run
      (p.play_type ilike '%touchdown%' or p.play_text ilike '%touchdown%')::int,              -- 6 TD
      p.week, p.opponent, p.period, p.clock_secs, p.down, p.distance, p.yards_to_goal,        -- 7..13
      p.play_text, p.team_score || '-' || p.opp_score) j                                      -- 14 text, 15 score
    from pl p where p.kind = 'R'
  )
  select jsonb_build_object('team', p_team, 'season', p_season, 'side', p_side,
    'passes', coalesce((select jsonb_agg(j) from pts), '[]'),
    'runs', coalesce((select jsonb_agg(j) from runs), '[]'),
    'nat', coalesce((select jsonb_object_agg(n.zone, jsonb_build_object('share', n.share, 'n', n.plays, 'cmp', n.comp, 'sr', n.sr, 'epa', n.epa, 'ypp', n.ypp, 'expl', n.expl, 'stuff', n.stuff))
                     from public.mv_field_nat n where n.season = p_season), '{}'))
$$;

-- national averages by zone: passes by depth band x direction, runs by lane (FBS offenses vs FBS defenses)
drop materialized view if exists public.mv_field_nat;
create materialized view public.mv_field_nat as
with fbs as (select season, team from public.v_fbs_teams),
pass as (
  select c.season, c.yards_to_goal - case when upper(btrim(s.m[1])) = (case when c.offense = g.t1 then g.t1_ab else g.t2_ab end) then 100 - s.m[2]::int else s.m[2]::int end air,
    public.field_dir(c.play_text, true) dir, f.completion, f.success, c.ppa, c.yards_gained
  from public.cfb_plays c
  join public.cfb_play_flags f on f.play_id = c.play_id
  join public.mv_game_ab g on g.game_id = c.game_id
  join fbs o on o.season = c.season and o.team = c.offense
  join fbs d on d.season = c.season and d.team = c.defense
  cross join lateral (select public.spot_of(c.play_text) m) s
  where f.kind = 'P' and c.down between 1 and 4 and s.m is not null and s.m[2]::int between 0 and 50
),
pz as (
  select season, case when air < 0 then 'B' when air <= 9 then 'S' when air <= 19 then 'I' else 'D' end || dir zone, completion, success, ppa, yards_gained
  from pass where dir is not null and air between -15 and 75
),
pt as (select season, count(*) n from pz group by season),
runs as (
  select c.season, 'R' || public.field_dir(c.play_text, false) zone, f.success, c.ppa, c.yards_gained
  from public.cfb_plays c join public.cfb_play_flags f on f.play_id = c.play_id
  join fbs o on o.season = c.season and o.team = c.offense
  join fbs d on d.season = c.season and d.team = c.defense
  where f.kind = 'R' and c.down between 1 and 4 and public.field_dir(c.play_text, false) is not null
),
rt as (select season, count(*) n from runs group by season)
select z.season, z.zone, count(*) plays, round(count(*)::numeric / max(t.n), 4) share,
  round(avg(z.completion::int), 4) comp, round(avg(z.success::int), 4) sr, round(avg(z.ppa), 3) epa, round(avg(z.yards_gained), 2) ypp,
  null::numeric expl, null::numeric stuff
from pz z join pt t on t.season = z.season group by z.season, z.zone
union all
select r.season, r.zone, count(*), round(count(*)::numeric / max(t.n), 4), null, round(avg(r.success::int), 4), round(avg(r.ppa), 3),
  round(avg(r.yards_gained), 2), round(avg((r.yards_gained >= 12)::int), 4), round(avg((r.yards_gained <= 0)::int), 4)
from runs r join rt t on t.season = r.season group by r.season, r.zone;
create unique index if not exists mv_field_nat_pk on public.mv_field_nat(season, zone);

grant execute on function public.web_field(text,int,text,text,int,boolean,boolean) to service_role;
