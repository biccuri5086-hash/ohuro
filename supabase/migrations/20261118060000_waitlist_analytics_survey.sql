-- G0-5: 計測の集計ビューと任意アンケート用トークン。Issue #13

-- アンケート回答用トークン（確認完了時に発行、1回限り）
alter table waitlist.tokens drop constraint if exists tokens_purpose_check;
alter table waitlist.tokens add constraint tokens_purpose_check check (purpose in ('confirm', 'unsubscribe', 'survey'));

-- 広告（utm_content）別のファネル。重複除外ルール（EXPERIMENT_PLAN.md 4章）:
--  - ブラウザ側のイベントは「イベント名ごとの異なる session_id の数」で数える（同じタブでの再表示は1回）
--  - session_id がないイベントは数えない
--  - 登録・確認はサーバー側で1登録につき1回だけ記録される
--  - テスト（is_test）は除外する
create view waitlist.funnel_by_creative
with (security_invoker = true) as
with client_events as (
  select
    coalesce(utm_content, '(none)') as utm_content,
    count(distinct session_id) filter (where name = 'lp_view') as lp_sessions,
    count(distinct session_id) filter (where name = 'form_view') as form_view_sessions,
    count(distinct session_id) filter (where name = 'form_submit') as form_submit_sessions
  from waitlist.events
  where not is_test and session_id is not null and name in ('lp_view', 'form_view', 'form_submit')
  group by 1
),
server_events as (
  select
    coalesce(utm_content, '(none)') as utm_content,
    count(*) filter (where name = 'signup_created') as signups_created,
    count(*) filter (where name = 'signup_confirmed') as signups_confirmed
  from waitlist.events
  where not is_test and name in ('signup_created', 'signup_confirmed')
  group by 1
)
select
  coalesce(c.utm_content, s.utm_content) as utm_content,
  coalesce(c.lp_sessions, 0) as lp_sessions,
  coalesce(c.form_view_sessions, 0) as form_view_sessions,
  coalesce(c.form_submit_sessions, 0) as form_submit_sessions,
  coalesce(s.signups_created, 0) as signups_created,
  coalesce(s.signups_confirmed, 0) as signups_confirmed
from client_events c
full outer join server_events s on s.utm_content = c.utm_content;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on waitlist.funnel_by_creative to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on waitlist.funnel_by_creative from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on waitlist.funnel_by_creative from authenticated';
  end if;
end
$$;
