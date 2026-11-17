import { describe, expect, it } from "vitest";
import { checkMigrationNames, checkMigrationSql } from "../../scripts/harness/migration-check.mjs";

describe("migration-check", () => {
  it("RLS を有効化したテーブル作成は通る", () => {
    const sql = `create table public.bath_logs (id uuid primary key);
alter table public.bath_logs enable row level security;`;
    expect(checkMigrationSql(sql)).toEqual([]);
  });
  it("スキーマ省略・引用符付きでも RLS 有効化を対応付ける", () => {
    const sql = `create table if not exists "pets" (id int);\nalter table "public"."pets" enable row level security;`;
    expect(checkMigrationSql(sql)).toEqual([]);
  });
  it("RLS 未有効化のテーブルを検出する", () => {
    expect(checkMigrationSql("create table coins (id int);")[0]).toContain("RLS");
  });
  it("コメントアウトされた RLS 有効化は数えない", () => {
    const sql = "create table coins (id int);\n-- alter table coins enable row level security;";
    expect(checkMigrationSql(sql)).toHaveLength(1);
  });
  it("RLS の無効化を禁止する", () => {
    expect(checkMigrationSql("alter table coins disable row level security;").join()).toContain("無効化");
  });
  it("search_path 未固定の SECURITY DEFINER を検出する", () => {
    const bad = "create function f() returns int language sql security definer as $$ select 1 $$;";
    expect(checkMigrationSql(bad).join()).toContain("search_path");
    expect(checkMigrationSql(bad.replace("as $$", "set search_path = '' as $$"))).toEqual([]);
  });
  it("anon への全権限付与を禁止する", () => {
    expect(checkMigrationSql("grant all on table public.coins to anon;").join()).toContain("anon");
  });
  it("破壊的操作は承認番号が必要", () => {
    expect(checkMigrationSql("drop table public.old;").join()).toContain("approved-destructive");
    expect(checkMigrationSql("-- approved-destructive: D-012\ndrop table public.old;")).toEqual([]);
  });
  it("ファイル名形式と重複を検査する", () => {
    expect(checkMigrationNames(["20261117000000_init.sql", "20261118000000_add_pets.sql"])).toEqual([]);
    expect(checkMigrationNames(["init.sql"])).toHaveLength(1);
    expect(checkMigrationNames(["20261117000000_a.sql", "20261117000000_b.sql"])).toHaveLength(1);
  });
});
