// DB 結合テストの共通処理。
// TEST_DATABASE_URL（スーパーユーザー権限の接続先）に使い捨てのデータベースを作り、
// Supabase と同じロール（anon / authenticated / service_role）を用意してマイグレーションを適用する。
// 本番・開発の Supabase には接続しない（TEST_DATABASE_URL に localhost / 127.0.0.1 以外は拒否）。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

export type Sql = postgres.Sql;

function adminUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error("TEST_DATABASE_URL が未設定です（例: postgres://ohuro_dev:ohuro_dev@127.0.0.1:5432/postgres）");
  }
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("DB テストはローカルの PostgreSQL にのみ接続できます");
  }
  return url;
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export async function createTestDatabase(): Promise<{ sql: Sql; url: string; drop: () => Promise<void> }> {
  const admin = adminUrl();
  const name = `ohuro_test_${randomBytes(6).toString("hex")}`;
  const root = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  await root.unsafe(`create database ${name}`);
  // Supabase の標準ロールを再現（クラスタ共通。既にあれば作らない）
  for (const [role, attrs] of [
    ["anon", "nologin noinherit"],
    ["authenticated", "nologin noinherit"],
    ["service_role", "nologin noinherit bypassrls"],
  ] as const) {
    const exists = await root`select 1 from pg_roles where rolname = ${role}`;
    if (exists.length === 0) await root.unsafe(`create role ${role} ${attrs}`);
  }
  await root.end();

  const dbUrl = new URL(admin.toString());
  dbUrl.pathname = `/${name}`;
  const sql = postgres(dbUrl.toString(), { max: 4, onnotice: () => {} });
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  const drop = async () => {
    await sql.end();
    const r = postgres(admin.toString(), { max: 1, onnotice: () => {} });
    await r.unsafe(`drop database if exists ${name} with (force)`);
    await r.end();
  };
  return { sql, url: dbUrl.toString(), drop };
}

/** 指定ロールに切り替えて実行し、トランザクションを必ず巻き戻す */
export async function asRole<T>(sql: Sql, role: "anon" | "authenticated" | "service_role", fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result: T | undefined;
  let error: unknown;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      try {
        result = await fn(tx);
      } catch (e) {
        error = e;
      }
      throw new RollbackSignal();
    })
    .catch((e) => {
      if (!(e instanceof RollbackSignal)) throw e;
    });
  if (error) throw error;
  return result as T;
}

class RollbackSignal extends Error {}
