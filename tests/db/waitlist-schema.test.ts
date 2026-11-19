import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase, type Sql } from "./helpers";

let sql: Sql;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ sql, drop } = await createTestDatabase());
});
afterAll(async () => {
  await drop?.();
});

const TABLES = ["signups", "tokens", "events", "rate_limits"] as const;
const hash = (c: string) => c.repeat(64);

async function insertSignup(tx: Sql | Parameters<Parameters<typeof asRole>[2]>[0], email: string, extra: Record<string, unknown> = {}) {
  const row = {
    email,
    email_normalized: email.trim().toLowerCase(),
    consented_at: new Date(),
    consent_version: "2026-11-17",
    ...extra,
  };
  const [r] = await tx`insert into waitlist.signups ${tx(row)} returning id`;
  return r!.id as string;
}

describe("waitlist スキーマ（G0-1）", () => {
  it("全テーブルで RLS が有効", async () => {
    const rows = await sql`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'waitlist' and c.relkind = 'r'`;
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("waitlist スキーマにポリシーが1つもない（既定拒否）", async () => {
    const rows = await sql`select count(*)::int as n from pg_policies where schemaname = 'waitlist'`;
    expect(rows[0]!.n).toBe(0);
  });

  for (const role of ["anon", "authenticated"] as const) {
    for (const table of TABLES) {
      it(`${role} は waitlist.${table} を読めない`, async () => {
        await expect(asRole(sql, role, (tx) => tx.unsafe(`select * from waitlist.${table}`))).rejects.toThrow(/permission denied/);
      });
    }
    it(`${role} は waitlist.signups に書き込めない`, async () => {
      await expect(
        asRole(sql, role, (tx) =>
          tx.unsafe(
            `insert into waitlist.signups (email, email_normalized, consented_at, consent_version) values ('a@example.com','a@example.com', now(), 'v1')`,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });
    it(`${role} は集計ビューを読めない`, async () => {
      await expect(asRole(sql, role, (tx) => tx.unsafe("select * from waitlist.signup_summary_by_creative"))).rejects.toThrow(
        /permission denied/,
      );
    });
  }

  it("仮に権限が誤って付与されても、ポリシーがないため行は見えない（多層防御）", async () => {
    await insertSignup(sql, "leak-check@example.com");
    const rows = await asRole(sql, "authenticated", async (tx) => {
      await tx.unsafe("reset role");
      await tx.unsafe("grant usage on schema waitlist to authenticated");
      await tx.unsafe("grant select on waitlist.signups to authenticated");
      await tx.unsafe("set local role authenticated");
      return tx`select * from waitlist.signups`;
    });
    expect(rows).toHaveLength(0);
    await sql`delete from waitlist.signups where email_normalized = 'leak-check@example.com'`;
  });

  it("service_role は読み書きできる", async () => {
    const n = await asRole(sql, "service_role", async (tx) => {
      await insertSignup(tx, "svc@example.com");
      const r = await tx`select count(*)::int as n from waitlist.signups where email_normalized = 'svc@example.com'`;
      return r[0]!.n as number;
    });
    expect(n).toBe(1);
  });

  it("同じメールアドレスは大文字小文字・空白の違いがあっても1件だけ", async () => {
    await insertSignup(sql, "Dup@Example.com");
    await expect(insertSignup(sql, " dup@example.COM ")).rejects.toThrow(/signups_email_normalized_key/);
    await sql`delete from waitlist.signups where email_normalized = 'dup@example.com'`;
  });

  it("正規化されていない email_normalized は拒否される", async () => {
    await expect(
      sql`insert into waitlist.signups (email, email_normalized, consented_at, consent_version) values ('X@Y.jp', 'X@Y.jp', now(), 'v1')`,
    ).rejects.toThrow(/check constraint/);
  });

  it("保存項目に氏名・住所・電話番号・写真などの列がない", async () => {
    const cols = await sql`
      select column_name from information_schema.columns
      where table_schema = 'waitlist' and table_name = 'signups' order by column_name`;
    const names = cols.map((c) => c.column_name as string);
    for (const banned of ["name", "full_name", "address", "phone", "tel", "photo", "image", "ip", "ip_address", "user_agent"]) {
      expect(names).not.toContain(banned);
    }
    expect(names).toEqual(
      [
        "confirmation_sent_count",
        "confirmed_at",
        "consent_version",
        "consented_at",
        "created_at",
        "email",
        "email_normalized",
        "first_confirmed_at",
        "id",
        "is_test",
        "last_confirmation_sent_at",
        "marketing_opt_in",
        "marketing_opt_in_at",
        "survey",
        "survey_answered_at",
        "survey_version",
        "unsubscribed_at",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
      ].sort(),
    );
  });

  it("宣伝メールの同意フラグと同意日時は一致していなければならない", async () => {
    await expect(insertSignup(sql, "mk@example.com", { marketing_opt_in: true })).rejects.toThrow(/signups_marketing_consistency/);
  });

  it("トークンはハッシュ形式のみ受け付け、登録削除で連動して消える", async () => {
    const id = await insertSignup(sql, "tok@example.com");
    await expect(
      sql`insert into waitlist.tokens (token_hash, signup_id, purpose, expires_at) values ('plain-token', ${id}, 'confirm', now() + interval '1 day')`,
    ).rejects.toThrow(/check constraint/);
    await sql`insert into waitlist.tokens (token_hash, signup_id, purpose, expires_at) values (${hash("a")}, ${id}, 'confirm', now() + interval '1 day')`;
    await sql`delete from waitlist.signups where id = ${id}`;
    const left = await sql`select count(*)::int as n from waitlist.tokens where signup_id = ${id}`;
    expect(left[0]!.n).toBe(0);
  });

  it("イベント名は定義済みのものだけ、セッションIDは形式を検査する", async () => {
    await expect(sql`insert into waitlist.events (name) values ('purchase')`).rejects.toThrow(/check constraint/);
    await expect(sql`insert into waitlist.events (name, session_id) values ('lp_view', 'a@b.c')`).rejects.toThrow(/check constraint/);
    await sql`insert into waitlist.events (name, session_id, utm_content) values ('lp_view', 'abcDEF12_-', 'ad_a_v1')`;
  });

  it("集計ビューはテスト登録を除外し、確認済み・解除済みを区別する", async () => {
    await insertSignup(sql, "s1@example.com", { utm_content: "ad_a_v1", confirmed_at: new Date() });
    await insertSignup(sql, "s2@example.com", { utm_content: "ad_a_v1" });
    await insertSignup(sql, "s3@example.com", { utm_content: "ad_a_v1", confirmed_at: new Date(), unsubscribed_at: new Date() });
    await insertSignup(sql, "s4@example.com", { utm_content: "ad_a_v1", confirmed_at: new Date(), is_test: true });
    await insertSignup(sql, "s5@example.com", { utm_content: "ad_b_v1", confirmed_at: new Date() });
    const rows = await sql`select * from waitlist.signup_summary_by_creative order by utm_content`;
    const a = rows.find((r) => r.utm_content === "ad_a_v1")!;
    const b = rows.find((r) => r.utm_content === "ad_b_v1")!;
    expect([Number(a.signups_total), Number(a.signups_confirmed), Number(a.signups_confirmed_active)]).toEqual([3, 2, 1]);
    expect([Number(b.signups_total), Number(b.signups_confirmed), Number(b.signups_confirmed_active)]).toEqual([1, 1, 1]);
  });
});
