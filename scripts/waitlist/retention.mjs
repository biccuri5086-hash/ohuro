// 事前登録データの保存期間と、期限切れデータの削除（Issue #45。期間は DECISIONS.md D-013 の 11）。
// - 既定は「確認モード」: 削除対象の件数だけを数え、何も変更しない
// - execute: true のときだけ、1 つのトランザクションで削除する（本番での実行は所有者が承認し、所有者が行う）
// - 件数だけを返す。メールアドレスなどの個人情報は出力しない
//
// 未実装: 「公開のお知らせを送った後 6 か月」。お知らせの送信日を記録する仕組みがないため、送信の機能を作るときに追加する。
// それまでは「登録から 2 年」だけで確認済みの登録を削除する。

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION = Object.freeze({
  /** 確認されなかった登録: 最後の登録（同意）から（日数） */
  unconfirmedDays: 30,
  /** 配信停止した登録: 停止から（年。暦の応当日で数える） */
  unsubscribedYears: 1,
  /** 確認済みの登録（停止していない）: 最初の登録から（年） */
  confirmedYears: 2,
  /** 計測イベント: Gate 0 の判断から（年）。判断後に記録されたものは記録から（年） */
  eventsYears: 1,
  /** レート制限用の値（日数） */
  rateLimitDays: 1,
});

/** 入力（日付）の誤り。文面は固定で、入力値を含まない */
export class RetentionInputError extends Error {}

const daysBefore = (/** @type {Date} */ now, /** @type {number} */ days) => new Date(now.getTime() - days * DAY_MS);

/**
 * n 年前の同じ月日・時刻（UTC）。2 月 29 日の応当日がない年は 2 月 28 日にする
 * （境界を早めにして、期限前のデータを消さないため。Codex 指摘 PR #46）
 * @param {Date} d
 * @param {number} years
 */
export function yearsBefore(d, years) {
  const y = d.getUTCFullYear() - years;
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

/**
 * 期限の境界を計算する。gate0DecidedAt が未指定なら計測イベントは対象外（null）
 * @param {Date} now
 * @param {Date | null} [gate0DecidedAt]
 */
export function cutoffs(now, gate0DecidedAt = null) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RetentionInputError("現在時刻が不正です");
  const yearAgo = yearsBefore(now, RETENTION.eventsYears);
  /** @type {Date | null} */
  let eventsBefore = null;
  if (gate0DecidedAt !== null && gate0DecidedAt !== undefined) {
    if (!(gate0DecidedAt instanceof Date) || Number.isNaN(gate0DecidedAt.getTime())) throw new RetentionInputError("Gate 0 の判断日が不正です");
    if (gate0DecidedAt.getTime() > now.getTime()) throw new RetentionInputError("Gate 0 の判断日が未来です");
    // 判断から 1 年たった後は、記録から 1 年を過ぎたイベントを削除する。
    // 判断より前のイベントはすべて対象になり、判断後に記録されたイベントも記録から 1 年で消える（Codex 指摘 PR #46）
    if (gate0DecidedAt.getTime() <= yearAgo.getTime()) eventsBefore = yearAgo;
  }
  return {
    unconfirmedBefore: daysBefore(now, RETENTION.unconfirmedDays),
    unsubscribedBefore: yearsBefore(now, RETENTION.unsubscribedYears),
    confirmedBefore: yearsBefore(now, RETENTION.confirmedYears),
    rateLimitBefore: daysBefore(now, RETENTION.rateLimitDays),
    eventsBefore,
  };
}

/**
 * 削除対象の条件（区分ごと。区分は重ならない）
 * @param {any} sql
 * @param {ReturnType<typeof cutoffs>} c
 */
function targets(sql, c) {
  const list = [
    {
      key: "unconfirmed",
      label: "確認されなかった登録（最後の登録から 30 日）",
      table: sql`waitlist.signups`,
      where: sql`confirmed_at is null and unsubscribed_at is null and consented_at < ${c.unconfirmedBefore}`,
    },
    {
      key: "unsubscribed",
      label: "配信停止した登録（停止から 1 年）",
      table: sql`waitlist.signups`,
      where: sql`unsubscribed_at is not null and unsubscribed_at < ${c.unsubscribedBefore}`,
    },
    {
      key: "confirmed",
      label: "確認済みの登録（登録から 2 年）",
      table: sql`waitlist.signups`,
      where: sql`confirmed_at is not null and unsubscribed_at is null and created_at < ${c.confirmedBefore}`,
    },
    {
      key: "rateLimits",
      label: "レート制限用の値（1 日）",
      table: sql`waitlist.rate_limits`,
      where: sql`window_start < ${c.rateLimitBefore}`,
    },
  ];
  if (c.eventsBefore) {
    list.push({
      key: "events",
      label: "計測イベント（Gate 0 の判断から 1 年。判断後の記録は記録から 1 年）",
      table: sql`waitlist.events`,
      where: sql`occurred_at < ${c.eventsBefore}`,
    });
  }
  return list;
}

/**
 * 期限切れデータを数える（execute: false）か、削除する（execute: true）。
 * 登録を削除すると、確認・解除用のトークンも外部キーで連動して削除される。
 * @param {any} sql postgres の接続
 * @param {{ now?: Date, gate0DecidedAt?: Date | null, execute?: boolean }} [options]
 * @returns {Promise<{ mode: "dry-run" | "execute", counts: Record<string, number>, labels: Record<string, string>, eventsSkipped: boolean }>}
 */
export async function purgeExpired(sql, { now = new Date(), gate0DecidedAt = null, execute = false } = {}) {
  const c = cutoffs(now, gate0DecidedAt);
  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, string>} */
  const labels = {};
  await sql.begin(async (/** @type {any} */ tx) => {
    for (const t of targets(tx, c)) {
      labels[t.key] = t.label;
      if (execute) {
        const rows = await tx`delete from ${t.table} where ${t.where} returning 1`;
        counts[t.key] = rows.length;
      } else {
        const [{ n }] = await tx`select count(*)::int as n from ${t.table} where ${t.where}`;
        counts[t.key] = n;
      }
    }
  });
  return { mode: execute ? "execute" : "dry-run", counts, labels, eventsSkipped: c.eventsBefore === null };
}

/**
 * 結果を文章にする（件数のみ）
 * @param {{ mode: string, counts: Record<string, number>, labels: Record<string, string>, eventsSkipped: boolean }} result
 */
export function formatResult(result) {
  const head = result.mode === "execute" ? "削除しました" : "確認モード（何も変更していません）。削除される件数";
  const lines = [head + ":"];
  for (const [key, n] of Object.entries(result.counts)) lines.push(`- ${result.labels[key]}: ${n}件`);
  if (result.eventsSkipped) lines.push("- 計測イベント: 対象外（Gate 0 の判断日が未指定、または判断から 1 年たっていない）");
  lines.push("- 確認済みの登録の「公開のお知らせ送信後 6 か月」は未実装（送信日の記録がないため）");
  return lines.join("\n");
}
