import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 社員（スキル）の形式と名簿の整合を検査する（Issue #32）
const ROOT = ".claude/skills";
const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);
const read = (name) => readFileSync(join(ROOT, name, "SKILL.md"), "utf8");
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Object.fromEntries(
    m[1].split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
};
const rosterSkills = (text) => [...text.matchAll(/\| `([a-z0-9-]+)` \|/g)].map((m) => m[1]);
const leads = dirs.filter((d) => /^ohuro-.*-lead$/.test(d));

describe("社員（スキル）の形式（Issue #32）", () => {
  it.each(dirs)("%s: SKILL.md があり、frontmatter の name がディレクトリ名と一致し、description は 1 行", (name) => {
    expect(existsSync(join(ROOT, name, "SKILL.md"))).toBe(true);
    const fm = frontmatter(read(name));
    expect(fm, "frontmatter がない").not.toBeNull();
    expect(fm.name).toBe(name);
    expect(fm.description?.length ?? 0).toBeGreaterThan(10);
    expect(fm.description.length).toBeLessThanOrEqual(400); // 毎回の会話に読み込まれるため短く（新規は 160 以内。下のテスト）
    expect(fm.description).not.toContain("\n");
  });

  it("共通資料がある", () => {
    expect(existsSync(join(ROOT, "_shared", "ohuro-brief.md"))).toBe(true);
  });
});

describe("名簿の整合（Issue #32）", () => {
  it("社長がいて、部長は 7 部署", () => {
    expect(dirs).toContain("ohuro-ceo");
    expect(leads).toHaveLength(7);
  });

  it("社長の部長表にある部長はすべて存在し、部長はすべて社長の表にいる", () => {
    const listed = rosterSkills(read("ohuro-ceo"));
    expect(new Set(listed)).toEqual(new Set(leads));
  });

  it.each(leads)("%s: 担当表のスキルはすべて存在する", (lead) => {
    const listed = rosterSkills(read(lead));
    expect(listed.length).toBeGreaterThan(0);
    for (const s of listed) expect(dirs, `${lead} の担当表の ${s} がない`).toContain(s);
  });

  it("社長・部長以外のすべてのスキルが、どこかの部長の担当表にいる（所属のない社員がいない）", () => {
    const assigned = new Set(leads.flatMap((l) => rosterSkills(read(l))));
    const members = dirs.filter((d) => d !== "ohuro-ceo" && !leads.includes(d));
    for (const m of members) expect(assigned.has(m), `${m} がどの部にも属していない`).toBe(true);
  });

  it("Issue #32 で作った社長・部長・担当は共通資料を読み、担当は「所有者が決めること」を出力に含める", () => {
    // 既存の 8 スキル（gekiyaku-todo から取り込んだもの）は形式が異なるため対象外
    const EXISTING = ["accessibility", "auto-cowork", "auto-routines", "auto-safety", "beh-ethics-checker", "dev-security-auditor", "e2e-testing", "postgres-patterns"];
    const ours = dirs.filter((d) => !EXISTING.includes(d));
    for (const d of ours) {
      expect(read(d), `${d} が共通資料を参照していない`).toContain("_shared/ohuro-brief.md");
      expect(frontmatter(read(d)).description.length, `${d} の description が長い`).toBeLessThanOrEqual(160);
    }
    const members = ours.filter((d) => d !== "ohuro-ceo" && !leads.includes(d));
    expect(members.length).toBeGreaterThanOrEqual(31);
    for (const d of members) expect(read(d), `${d} に「所有者が決めること」がない`).toContain("所有者が決めること");
  });
});
