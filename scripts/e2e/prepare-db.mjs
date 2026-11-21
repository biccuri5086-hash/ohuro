#!/usr/bin/env node
// E2E 用のデータベース（ohuro_e2e）を作り直し、Supabase のロールを再現してマイグレーションを適用する。
// TEST_DATABASE_URL（ローカルの PostgreSQL のスーパーユーザー）にのみ接続する。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL が未設定です");
const admin = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(admin.hostname)) throw new Error("E2E はローカルの PostgreSQL にのみ接続できます");

const NAME = "ohuro_e2e";
const root = postgres(admin.toString(), { max: 1, onnotice: () => {} });
await root.unsafe(`drop database if exists ${NAME} with (force)`);
await root.unsafe(`create database ${NAME}`);
for (const [role, attrs] of [
  ["anon", "nologin noinherit"],
  ["authenticated", "nologin noinherit"],
  ["service_role", "nologin noinherit bypassrls"],
]) {
  const exists = await root`select 1 from pg_roles where rolname = ${role}`;
  if (exists.length === 0) await root.unsafe(`create role ${role} ${attrs}`);
}
await root.end();

const dbUrl = new URL(admin.toString());
dbUrl.pathname = `/${NAME}`;
const sql = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} });
const dir = join(process.cwd(), "supabase", "migrations");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await sql.unsafe(readFileSync(join(dir, f), "utf8"));
}
await sql.end();
console.log(`E2E database ${NAME} prepared`);
