-- Live playcalling chart + tendencies for The Post-Snap.
-- Everything is computed from public.cfb_play_flags (one row per scrimmage play) joined to
-- public.cfb_plays (clock, score, play text). Unfiltered chart rows come straight from the
-- existing season tables so they match the downloadable image exactly.

-- ---------- row definitions (same as mv_nat_playcalling) ----------
create table if not exists public.pc_label_def(sec text, ord int, label text primary key, parent text);
truncate public.pc_label_def;
insert into public.pc_label_def values
 ('Overview',10,'Dropbacks (Pass + Sack)','ALL'),('Overview',11,'Designed Runs','ALL'),('Overview',12,'QB Runs & Scrambles','ALL'),
 ('Overview',13,'Sacks','ALL'),('Overview',14,'Explosive Plays','ALL'),('Overview',15,'Negative Plays','ALL'),
 ('Situation',20,'1st Down','ALL'),('Situation',21,'2nd Down','ALL'),('Situation',22,'3rd / 4th Down','ALL'),
 ('Situation',23,'Standard Downs','ALL'),('Situation',24,'Passing Downs','ALL'),('Situation',25,'Red Zone','ALL'),
 ('Situation',26,'Goal to Go','ALL'),('Situation',27,'Shotgun','ALL'),('Situation',28,'No Huddle','ALL'),
 ('Passing',30,'Early-Down Dropback','DROP'),('Passing',31,'Late-Down Dropback','DROP'),('Passing',32,'Standard-Down Dropback','DROP'),
 ('Passing',33,'Passing-Down Dropback','DROP'),('Passing',34,'Completions','DROP'),('Passing',35,'Explosive Pass (15+)','DROP'),
 ('Passing',36,'Sack Rate','DROP'),('Passing',37,'Red-Zone Dropback','DROP'),('Passing',38,'Short Target','DROP'),('Passing',39,'Deep Target','DROP'),
 ('Rushing',50,'QB Run (incl. Scramble)','RUN'),('Rushing',51,'RB / Other Run','RUN'),('Rushing',52,'Early-Down Run','RUN'),
 ('Rushing',53,'Late-Down Run','RUN'),('Rushing',54,'Explosive Run (12+)','RUN'),('Rushing',55,'Opportunity Run (4+)','RUN'),
 ('Rushing',56,'Stuffed Run (0 or less)','RUN'),('Rushing',57,'Short-Yardage Run','RUN'),('Rushing',58,'Red-Zone Run','RUN');

create or replace function public.pc_member(p_label text, kind text, qb_run boolean, explosive boolean, yards int, down int, distance int,
  standard_down boolean, early_down boolean, red_zone boolean, goal_to_go boolean, shotgun boolean, no_huddle boolean, completion boolean, pass_depth text)
returns boolean language sql immutable as $$
  select case p_label
    when 'All Plays' then true
    when 'Dropbacks (Pass + Sack)' then kind in ('P','S') when 'Designed Runs' then kind = 'R'
    when 'QB Runs & Scrambles' then qb_run when 'Sacks' then kind = 'S' when 'Explosive Plays' then explosive
    when 'Negative Plays' then yards < 0 when '1st Down' then down = 1 when '2nd Down' then down = 2 when '3rd / 4th Down' then down >= 3
    when 'Standard Downs' then standard_down when 'Passing Downs' then not standard_down when 'Red Zone' then red_zone
    when 'Goal to Go' then goal_to_go when 'Shotgun' then shotgun when 'No Huddle' then no_huddle
    when 'Early-Down Dropback' then early_down and kind in ('P','S') when 'Late-Down Dropback' then not early_down and kind in ('P','S')
    when 'Standard-Down Dropback' then standard_down and kind in ('P','S') when 'Passing-Down Dropback' then not standard_down and kind in ('P','S')
    when 'Completions' then completion and kind in ('P','S') when 'Explosive Pass (15+)' then explosive and kind in ('P','S')
    when 'Sack Rate' then kind = 'S' when 'Red-Zone Dropback' then red_zone and kind in ('P','S')
    when 'Short Target' then pass_depth = 'Short' and kind in ('P','S') when 'Deep Target' then pass_depth = 'Deep' and kind in ('P','S')
    when 'QB Run (incl. Scramble)' then qb_run and kind = 'R' when 'RB / Other Run' then not qb_run and kind = 'R'
    when 'Early-Down Run' then early_down and kind = 'R' when 'Late-Down Run' then not early_down and kind = 'R'
    when 'Explosive Run (12+)' then explosive and kind = 'R' when 'Opportunity Run (4+)' then yards >= 4 and kind = 'R'
    when 'Stuffed Run (0 or less)' then yards <= 0 and kind = 'R' when 'Short-Yardage Run' then down >= 3 and distance <= 2 and kind = 'R'
    when 'Red-Zone Run' then red_zone and kind = 'R'
    else false end
$$;

-- ---------- tendency buckets ----------
create table if not exists public.pc_bucket_def(grp text, key text, label text, ord int, primary key (grp, key));
truncate public.pc_bucket_def;
insert into public.pc_bucket_def values
 ('dd','1L','1st & 10+',1),('dd','1S','1st & under 10',2),('dd','2S','2nd & 1-3',3),('dd','2M','2nd & 4-6',4),('dd','2L','2nd & 7+',5),
 ('dd','3S','3rd & 1-3',6),('dd','3M','3rd & 4-6',7),('dd','3L','3rd & 7+',8),('dd','4S','4th & 1-2',9),('dd','4L','4th & 3+',10),
 ('field','bu','Backed up (own 1-10)',1),('field','own','Own territory (own 11-49)',2),('field','plus','Plus territory (opp 21-50)',3),
 ('field','rz','Red zone (opp 11-20)',4),('field','gl','Inside the 10',5),
 ('state','l9','Leading by 9+',1),('state','l1','Leading by 1-8',2),('state','t0','Tied',3),('state','t1','Trailing by 1-8',4),('state','t9','Trailing by 9+',5),
 ('qtr','q1','1st quarter',1),('qtr','q2','2nd quarter',2),('qtr','q3','3rd quarter',3),('qtr','q4','4th quarter',4),('qtr','ot','Overtime',5),
 ('qtr','two','Final 2:00 of a half',6),
 ('form','gun','Shotgun',1),('form','uc','Under center',2),('form','nh','No huddle',3),('form','hd','Huddle',4);

-- one play can fall in several buckets of the same group (final 2:00 is also Q2/Q4; formation and tempo share a group)
create or replace function public.pc_buckets(down int, distance int, ytg int, margin int, period int, clock_secs int, shotgun boolean, no_huddle boolean)
returns table(grp text, key text) language sql immutable as $$
  select 'dd', case when down = 1 then case when distance >= 10 then '1L' else '1S' end
                    when down in (2,3) then down::text || case when distance <= 3 then 'S' when distance <= 6 then 'M' else 'L' end
                    when down = 4 then case when distance <= 2 then '4S' else '4L' end end
  where down between 1 and 4
  union all select 'field', case when ytg >= 90 then 'bu' when ytg >= 51 then 'own' when ytg >= 21 then 'plus' when ytg >= 11 then 'rz' else 'gl' end where ytg is not null
  union all select 'state', case when margin >= 9 then 'l9' when margin >= 1 then 'l1' when margin = 0 then 't0' when margin >= -8 then 't1' else 't9' end where margin is not null
  union all select 'qtr', case when period between 1 and 4 then 'q' || period else 'ot' end where period is not null
  union all select 'qtr', 'two' where period in (2,4) and clock_secs <= 120
  union all select 'form', case when shotgun then 'gun' else 'uc' end where shotgun is not null
  union all select 'form', case when no_huddle then 'nh' else 'hd' end where no_huddle is not null
$$;

-- ---------- one team's plays, filtered ----------
create or replace function public.pc_plays(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns table(play_id text, game_id bigint, week int, opponent text, period int, clock_secs int, down int, distance int, yards_to_goal int,
  yards_gained int, kind text, play_type text, ppa numeric, completion boolean, qb_run boolean, success boolean, explosive boolean,
  standard_down boolean, early_down boolean, red_zone boolean, goal_to_go boolean, shotgun boolean, no_huddle boolean, pass_depth text,
  team_score int, opp_score int, play_text text, garbage boolean)
language plpgsql stable set search_path to 'public' as $$
#variable_conflict use_column
begin
  return query
  with base as (
    select f.play_id, f.game_id, f.week, case when p_side = 'Offense' then f.defense else f.offense end as opp, f.period, c.clock_secs, f.down, f.distance,
      f.yards_to_goal, f.yards_gained, f.kind, f.play_type, f.ppa, f.completion, f.qb_run, f.success, f.explosive, f.standard_down, f.early_down,
      f.red_zone, f.goal_to_go, f.shotgun, f.no_huddle, f.pass_depth,
      case when p_side = 'Offense' then c.offense_score else c.defense_score end as ts,
      case when p_side = 'Offense' then c.defense_score else c.offense_score end as os,
      c.play_text
    from cfb_play_flags f join cfb_plays c on c.play_id = f.play_id
    where f.season = p_season and p_side = 'Offense' and f.offense = p_team
    union all
    select f.play_id, f.game_id, f.week, f.offense, f.period, c.clock_secs, f.down, f.distance,
      f.yards_to_goal, f.yards_gained, f.kind, f.play_type, f.ppa, f.completion, f.qb_run, f.success, f.explosive, f.standard_down, f.early_down,
      f.red_zone, f.goal_to_go, f.shotgun, f.no_huddle, f.pass_depth,
      c.defense_score, c.offense_score, c.play_text
    from cfb_play_flags f join cfb_plays c on c.play_id = f.play_id
    where f.season = p_season and p_side = 'Defense' and f.defense = p_team
  ), g as (
    select b.game_id from base b group by b.game_id order by max(b.week) desc limit coalesce(p_last, 100)
  )
  select b.play_id, b.game_id, b.week, b.opp, b.period, b.clock_secs, b.down, b.distance, b.yards_to_goal, b.yards_gained, b.kind, b.play_type,
    b.ppa, b.completion, b.qb_run, b.success, b.explosive, b.standard_down, b.early_down, b.red_zone, b.goal_to_go, b.shotgun, b.no_huddle,
    b.pass_depth, b.ts, b.os, b.play_text,
    -- garbage time (Connelly): Q2 lead > 38, Q3 > 28, Q4 > 22
    coalesce((b.period = 2 and abs(b.ts - b.os) > 38) or (b.period = 3 and abs(b.ts - b.os) > 28) or (b.period = 4 and abs(b.ts - b.os) > 22), false)
  from base b
  where b.game_id in (select g.game_id from g)
    and (p_opp is null or b.opp = p_opp)
    and (not p_fbs or b.opp in (select t.team from v_fbs_teams t where t.season = p_season))
    and (not p_nogarbage or not coalesce((b.period = 2 and abs(b.ts - b.os) > 38) or (b.period = 3 and abs(b.ts - b.os) > 28) or (b.period = 4 and abs(b.ts - b.os) > 22), false));
end $$;

-- ---------- national tendency averages (season, all FBS-vs-FBS plays) ----------
drop materialized view if exists public.mv_tendency_nat;
create materialized view public.mv_tendency_nat as
  select f.season, b.grp, b.key, count(*) plays,
    avg((f.kind in ('P','S'))::int)::numeric(6,4) pass_rate,
    avg(f.success::int)::numeric(6,4) sr, avg(f.ppa)::numeric(8,4) epa
  from cfb_play_flags f join cfb_plays c on c.play_id = f.play_id
  join v_fbs_teams o on o.season = f.season and o.team = f.offense
  join v_fbs_teams d on d.season = f.season and d.team = f.defense
  cross join lateral public.pc_buckets(f.down, f.distance, f.yards_to_goal, c.offense_score - c.defense_score, f.period, c.clock_secs, f.shotgun, f.no_huddle) b
  where f.kind in ('P','S','R')
  group by f.season, b.grp, b.key;
create unique index if not exists mv_tendency_nat_pk on public.mv_tendency_nat(season, grp, key);

-- ---------- the live chart ----------
create or replace function public.web_pc_live(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare v_filtered boolean := p_opp is not null or p_last is not null or p_fbs or p_nogarbage; v_rows jsonb; v_games jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('week', w, 'opponent', o, 'game_id', gid) order by w), '[]') into v_games
  from (select max(week) w, max(opponent) o, game_id gid from public.pc_plays(p_team, p_season, p_side) group by game_id) s;

  if not v_filtered then
    select jsonb_agg(to_jsonb(r) order by r.ord) into v_rows from (
      select c.section, c.label, c.plays, c.usage, c.success_rate, c.epa_per_play, c.sr_rank, c.epa_rank, c.perf_pool, c.fbs_median_usage,
             w.usage_rank, w.teams_in_pool, w.fbs_median_sr, w.fbs_median_epa, coalesce(d.ord, -1) ord
      from public.web_playcalling_chart_rows(p_team, p_season, p_side) c
      left join public.web_playcalling(p_team) w on w.season = p_season and w.side = p_side and w.label = c.label
      left join public.pc_label_def d on d.label = c.label) r;
  else
    with pl as (select * from public.pc_plays(p_team, p_season, p_side, p_opp, p_last, p_fbs, p_nogarbage)),
    den as (select count(*) n_all, count(*) filter (where kind in ('P','S')) n_drop, count(*) filter (where kind = 'R') n_run,
                   count(*) filter (where shotgun is not null) n_form from pl),
    labs as (select 'Overview' sec, -1 ord, 'All Plays' label, 'ALL' parent union all select * from public.pc_label_def),
    agg as (
      select l.sec, l.ord, l.label, l.parent,
        count(p.*) filter (where public.pc_member(l.label, p.kind, p.qb_run, p.explosive, p.yards_gained, p.down, p.distance, p.standard_down, p.early_down,
          p.red_zone, p.goal_to_go, p.shotgun, p.no_huddle, p.completion, p.pass_depth)) plays,
        avg(p.success::int) filter (where public.pc_member(l.label, p.kind, p.qb_run, p.explosive, p.yards_gained, p.down, p.distance, p.standard_down, p.early_down,
          p.red_zone, p.goal_to_go, p.shotgun, p.no_huddle, p.completion, p.pass_depth)) sr,
        avg(p.ppa) filter (where public.pc_member(l.label, p.kind, p.qb_run, p.explosive, p.yards_gained, p.down, p.distance, p.standard_down, p.early_down,
          p.red_zone, p.goal_to_go, p.shotgun, p.no_huddle, p.completion, p.pass_depth)) epa
      from labs l cross join pl p group by l.sec, l.ord, l.label, l.parent),
    season as (select * from public.mv_playcalling_ranked m where m.season = p_season and m.side = p_side)
    select jsonb_agg(jsonb_build_object(
        'section', a.sec, 'label', a.label, 'plays', a.plays,
        'usage', case when a.label = 'All Plays' then null
                      when a.label in ('Shotgun','No Huddle') then round(a.plays::numeric / nullif(d.n_form, 0), 4)
                      else round(a.plays::numeric / nullif(case a.parent when 'ALL' then d.n_all when 'DROP' then d.n_drop else d.n_run end, 0), 4) end,
        'success_rate', round(a.sr, 4), 'epa_per_play', round(a.epa, 4),
        'fbs_median_usage', med.fbs_median_usage, 'fbs_median_sr', med.fbs_median_sr, 'fbs_median_epa', med.fbs_median_epa,
        -- where this filtered number would rank against every FBS team's full season
        'sr_rank', case when a.label = 'All Plays' or a.plays < 3 or a.label in ('Explosive Plays','Explosive Pass (15+)','Explosive Run (12+)','Stuffed Run (0 or less)','Sacks','Sack Rate') then null
                        else 1 + (select count(*) from season s where s.label = a.label and s.sr_rank is not null and s.team <> p_team and
                                  case when p_side = 'Offense' then s.success_rate > round(a.sr, 4) else s.success_rate < round(a.sr, 4) end) end,
        'epa_rank', case when a.label = 'All Plays' or a.plays < 3 then null
                         else 1 + (select count(*) from season s where s.label = a.label and s.epa_rank is not null and s.team <> p_team and
                                   case when p_side = 'Offense' then s.epa_per_play > round(a.epa, 4) else s.epa_per_play < round(a.epa, 4) end) end,
        'perf_pool', med.perf_pool, 'teams_in_pool', med.teams_in_pool, 'ord', a.ord) order by
          case a.sec when 'Overview' then 0 when 'Situation' then 1 when 'Passing' then 2 else 3 end, a.ord)
    into v_rows
    from agg a cross join den d
    left join lateral (select max(s.fbs_median_usage) fbs_median_usage, max(s.fbs_median_sr) fbs_median_sr, max(s.fbs_median_epa) fbs_median_epa,
                              max(s.perf_pool) perf_pool, max(s.teams_in_pool) teams_in_pool from season s where s.label = a.label) med on true;
  end if;
  return jsonb_build_object('team', p_team, 'season', p_season, 'side', p_side, 'filtered', v_filtered, 'games', v_games, 'rows', coalesce(v_rows, '[]'));
end $$;

-- ---------- tendencies ----------
create or replace function public.web_tendencies(p_team text, p_season int, p_side text, p_opp text default null, p_last int default null,
  p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language sql stable set search_path to 'public' as $$
  with pl as (select * from public.pc_plays(p_team, p_season, p_side, p_opp, p_last, p_fbs, p_nogarbage) where kind in ('P','S','R')),
  tagged as (select p.*, b.grp, b.key from pl p
    cross join lateral public.pc_buckets(p.down, p.distance, p.yards_to_goal,
      case when p_side = 'Offense' then p.team_score - p.opp_score else p.opp_score - p.team_score end, p.period, p.clock_secs, p.shotgun, p.no_huddle) b),
  agg as (select grp, key, count(*) plays, avg((kind in ('P','S'))::int) pass_rate, avg(success::int) sr, avg(ppa) epa,
                 avg(yards_gained) ypp from tagged group by grp, key)
  select jsonb_build_object('team', p_team, 'season', p_season, 'side', p_side, 'plays', (select count(*) from pl),
    'groups', jsonb_agg(jsonb_build_object('grp', d.grp, 'key', d.key, 'label', d.label, 'ord', d.ord,
      'plays', coalesce(a.plays, 0), 'pass_rate', round(a.pass_rate, 4), 'sr', round(a.sr, 4), 'epa', round(a.epa, 4), 'ypp', round(a.ypp, 2),
      'nat_pass_rate', n.pass_rate, 'nat_sr', n.sr, 'nat_epa', n.epa) order by d.grp, d.ord))
  from public.pc_bucket_def d
  left join agg a on a.grp = d.grp and a.key = d.key
  left join public.mv_tendency_nat n on n.season = p_season and n.grp = d.grp and n.key = d.key
$$;

-- ---------- the plays behind a row or a tendency cell ----------
create or replace function public.web_pc_play_list(p_team text, p_season int, p_side text, p_label text default null, p_bucket text default null,
  p_opp text default null, p_last int default null, p_fbs boolean default false, p_nogarbage boolean default false)
returns jsonb language sql stable set search_path to 'public' as $$
  with pl as (select * from public.pc_plays(p_team, p_season, p_side, p_opp, p_last, p_fbs, p_nogarbage)),
  hit as (
    select p.* from pl p
    where (p_label is null or (public.pc_member(p_label, p.kind, p.qb_run, p.explosive, p.yards_gained, p.down, p.distance, p.standard_down, p.early_down,
            p.red_zone, p.goal_to_go, p.shotgun, p.no_huddle, p.completion, p.pass_depth)
          and (case (select parent from public.pc_label_def where label = p_label) when 'DROP' then p.kind in ('P','S') when 'RUN' then p.kind = 'R' else true end)))
      and (p_bucket is null or (p.kind in ('P','S','R') and exists (select 1 from public.pc_buckets(p.down, p.distance, p.yards_to_goal,
            case when p_side = 'Offense' then p.team_score - p.opp_score else p.opp_score - p.team_score end, p.period, p.clock_secs, p.shotgun, p.no_huddle) b
            where b.grp || ':' || b.key = p_bucket)))
  )
  select jsonb_build_object('n', (select count(*) from hit), 'plays', coalesce((select jsonb_agg(jsonb_build_object(
      'week', h.week, 'opponent', h.opponent, 'q', h.period, 'clock', h.clock_secs, 'down', h.down, 'dist', h.distance, 'ytg', h.yards_to_goal,
      'kind', h.kind, 'type', h.play_type, 'yds', h.yards_gained, 'success', h.success, 'epa', round(h.ppa, 2),
      'score', h.team_score || '-' || h.opp_score, 'text', h.play_text, 'garbage', h.garbage)
      order by h.week, h.period, h.clock_secs desc) from (select * from hit order by week, period, clock_secs desc limit 500) h), '[]'))
$$;

grant execute on function public.web_pc_live(text,int,text,text,int,boolean,boolean), public.web_tendencies(text,int,text,text,int,boolean,boolean),
  public.web_pc_play_list(text,int,text,text,text,text,int,boolean,boolean) to service_role;
