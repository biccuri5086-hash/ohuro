-- G0-1: 事前登録（ウェイティングリスト）。Issue #9
-- 方針:
--  - アプリ本体のアカウント（auth.users）と分離するため専用スキーマ waitlist に置く
--  - waitlist スキーマは Supabase の Data API（PostgREST）に公開しない。anon / authenticated には一切の権限を与えない
--  - 全テーブルで RLS を有効化し、ポリシーは作らない（既定拒否）。サーバーは service_role（BYPASSRLS）で直接接続する
--  - 氏名・住所・電話番号・写真は保存しない（DATA_HANDLING.md）

create schema if not exists waitlist;
revoke all on schema waitlist from public;

-- 事前登録者
create table waitlist.signups (
  id uuid primary key default gen_random_uuid(),
  -- 入力されたメールアドレス（送信用）
  email text not null check (char_length(email) between 3 and 254),
  -- 重複判定用（前後空白除去・小文字化）。同一アドレスは1件
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- 同意（リリース通知の受信）。文面はバージョンで管理
  consented_at timestamptz not null,
  consent_version text not null check (char_length(consent_version) between 1 and 32),
  -- 広告宣伝メール（リリース通知以外のお知らせ）への任意同意。リリース通知の同意とは区別する
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  unsubscribed_at timestamptz,
  -- 流入元（UTM）。utm_content を広告クリエイティブ識別子として使う
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  utm_content text check (char_length(utm_content) <= 100),
  -- テスト登録は集計から除外する
  is_test boolean not null default false,
  -- 確認メールの悪用対策（再送回数の管理）
  confirmation_sent_count integer not null default 0 check (confirmation_sent_count >= 0),
  last_confirmation_sent_at timestamptz,
  -- 任意アンケート（G0-5）
  survey jsonb check (survey is null or jsonb_typeof(survey) = 'object'),
  survey_version text check (char_length(survey_version) <= 32),
  survey_answered_at timestamptz,
  constraint signups_email_normalized_key unique (email_normalized),
  constraint signups_marketing_consistency check (marketing_opt_in = (marketing_opt_in_at is not null))
);
alter table waitlist.signups enable row level security;

-- 確認・登録解除用トークン（平文は保存せず SHA-256 のハッシュのみ）
create table waitlist.tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  signup_id uuid not null references waitlist.signups (id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'unsubscribe')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);
create index tokens_signup_id_idx on waitlist.tokens (signup_id);
alter table waitlist.tokens enable row level security;

-- ファーストパーティの計測イベント（個人を特定する情報は入れない）
create table waitlist.events (
  id bigint generated always as identity primary key,
  name text not null check (name in ('lp_view', 'form_view', 'form_submit', 'signup_created', 'signup_confirmed')),
  -- ブラウザのタブ単位のランダムID（sessionStorage）。重複除外に使う
  session_id text check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  utm_content text check (char_length(utm_content) <= 100),
  is_test boolean not null default false,
  occurred_at timestamptz not null default now()
);
create index events_name_occurred_idx on waitlist.events (name, occurred_at);
alter table waitlist.events enable row level security;

-- レート制限（固定ウィンドウ）。キーは IP 等のハッシュ値のみ
create table waitlist.rate_limits (
  key text not null check (char_length(key) between 1 and 128),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);
alter table waitlist.rate_limits enable row level security;

-- 集計用ビュー: 確認済み・未解除・テスト以外の登録を広告別に数える
create view waitlist.signup_summary_by_creative
with (security_invoker = true) as
select
  coalesce(utm_source, '(none)') as utm_source,
  coalesce(utm_campaign, '(none)') as utm_campaign,
  coalesce(utm_content, '(none)') as utm_content,
  count(*) as signups_total,
  count(*) filter (where confirmed_at is not null) as signups_confirmed,
  count(*) filter (where confirmed_at is not null and unsubscribed_at is null) as signups_confirmed_active
from waitlist.signups
where not is_test
group by 1, 2, 3;

-- 権限: サーバー（service_role）のみ。anon / authenticated には付与しない
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema waitlist from anon';
    execute 'revoke all on all tables in schema waitlist from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema waitlist from authenticated';
    execute 'revoke all on all tables in schema waitlist from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema waitlist to service_role';
    execute 'grant select, insert, update, delete on all tables in schema waitlist to service_role';
    execute 'grant usage, select on all sequences in schema waitlist to service_role';
  end if;
end
$$;
