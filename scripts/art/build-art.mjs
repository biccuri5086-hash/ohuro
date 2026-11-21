#!/usr/bin/env node
// 素材パイプライン（Issue #24 / Art-2）。正本 art/src/*.svg を検査し、LP 用の React コンポーネントと広告用の文字列を生成する。
// 使い方:
//   npm run art:build                 検査 → 生成ファイルを書き出す
//   npm run art:build -- --check      検査 → 生成ファイルが最新かを確認（書き換えない。単体テストでも実行）
//   npm run art:build -- --update-hashes  素材台帳の sha256 を現在のファイルに合わせる（ライセンス欄は人間が確認）
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { lintSvg, parseSvg } from "./svg-lint.mjs";

export const PATHS = {
  src: "art/src",
  palette: "art/palette.json",
  ledger: "art/ASSETS.json",
  tsx: "src/components/art/generated.tsx",
  ads: "scripts/ads/art.generated.mjs",
};

const LEDGER_FIELDS = ["id", "file", "component", "defaultTitle", "kind", "author", "method", "references", "createdAt", "license", "commercialUse", "sha256"];
const JSX_ATTR = { "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin" };
const HEADER = "自動生成（scripts/art/build-art.mjs）。直接編集しない。正本は art/src/*.svg、素材台帳は art/ASSETS.json（Issue #24）";

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function attrs(node, jsx) {
  return Object.entries(node.attrs)
    .map(([k, v]) => `${jsx ? (JSX_ATTR[k] ?? k) : k}="${v}"`)
    .join(" ");
}

function serialize(node, jsx, indent) {
  const pad = " ".repeat(indent);
  const a = attrs(node, jsx);
  if (!node.children.length) return `${pad}<${node.name} ${a}${jsx ? " " : ""}/>`;
  const inner = node.children.map((c) => serialize(c, jsx, indent + 2)).join("\n");
  return `${pad}<${node.name} ${a}>\n${inner}\n${pad}</${node.name}>`;
}

/** 検査と生成。ファイルは書かず、エラーと生成内容を返す */
export function buildArt(root = process.cwd()) {
  const errors = [];
  const read = (p) => readFileSync(join(root, p), "utf8");
  const palette = JSON.parse(read(PATHS.palette));
  const ledger = JSON.parse(read(PATHS.ledger));
  const files = readdirSync(join(root, PATHS.src)).filter((f) => f.endsWith(".svg")).sort();
  const others = readdirSync(join(root, PATHS.src)).filter((f) => !f.endsWith(".svg"));
  for (const f of others) errors.push(`${PATHS.src}/${f}: SVG 以外の素材は置けません`);

  const byFile = new Map();
  const components = new Set();
  for (const e of ledger.assets ?? []) {
    for (const k of LEDGER_FIELDS) if (e[k] === undefined || e[k] === "") errors.push(`素材台帳 ${e.id ?? "?"}: ${k} がありません`);
    if (!/^[A-Z][A-Za-z0-9]*$/.test(e.component ?? "")) errors.push(`素材台帳 ${e.id}: component は英字で始まる名前にしてください`);
    if (components.has(e.component)) errors.push(`素材台帳 ${e.id}: component ${e.component} が重複しています`);
    components.add(e.component);
    byFile.set(e.file, e);
  }

  const assets = [];
  for (const f of files) {
    const rel = `${PATHS.src}/${f}`;
    const text = read(rel);
    for (const msg of lintSvg(text, palette)) errors.push(`${rel}: ${msg}`);
    const entry = byFile.get(rel);
    if (!entry) {
      errors.push(`${rel}: 素材台帳（${PATHS.ledger}）に記録がありません`);
      continue;
    }
    if (entry.sha256 !== sha256(text)) errors.push(`${rel}: 素材台帳の sha256 が一致しません（素材を変えたら台帳も更新する。--update-hashes）`);
    const { root: tree } = parseSvg(text);
    if (tree) assets.push({ entry, tree });
  }
  for (const e of ledger.assets ?? []) if (!existsSync(join(root, e.file))) errors.push(`素材台帳 ${e.id}: ファイル ${e.file} がありません`);

  const tsx = [
    `// ${HEADER}`,
    "type Props = { className?: string; title?: string };",
    "",
    ...assets.flatMap(({ entry, tree }) => [
      `/** ${entry.id}: ${entry.defaultTitle} */`,
      `export function ${entry.component}({ className, title = ${JSON.stringify(entry.defaultTitle)} }: Props) {`,
      "  return (",
      `    <svg viewBox="${tree.attrs.viewBox}" className={className} role="img" aria-label={title}>`,
      "      <title>{title}</title>",
      ...tree.children.map((c) => serialize(c, true, 6)),
      "    </svg>",
      "  );",
      "}",
      "",
    ]),
  ].join("\n");

  const ads = [
    `// ${HEADER}`,
    "// 広告の場面（scripts/ads/render-ads.mjs）で使う、素材の svg 要素の中身と viewBox",
    "export const ART = {",
    ...assets.map(
      ({ entry, tree }) =>
        `  ${entry.id}: {\n    viewBox: ${JSON.stringify(tree.attrs.viewBox)},\n    inner: ${JSON.stringify(tree.children.map((c) => serialize(c, false, 0)).join("\n"))},\n  },`,
    ),
    "};",
    "",
  ].join("\n");

  return { errors, outputs: { [PATHS.tsx]: tsx, [PATHS.ads]: ads }, ledger };
}

function main() {
  const root = process.cwd();
  if (process.argv.includes("--update-hashes")) {
    const ledger = JSON.parse(readFileSync(join(root, PATHS.ledger), "utf8"));
    for (const e of ledger.assets) if (existsSync(join(root, e.file))) e.sha256 = sha256(readFileSync(join(root, e.file), "utf8"));
    writeFileSync(join(root, PATHS.ledger), JSON.stringify(ledger, null, 2) + "\n");
    console.log("素材台帳の sha256 を更新しました。ライセンス・商用利用の欄は人間が確認してください");
  }
  const { errors, outputs } = buildArt(root);
  if (errors.length) {
    for (const e of errors) console.error(`エラー: ${e}`);
    process.exitCode = 1;
    return;
  }
  const check = process.argv.includes("--check");
  const stale = [];
  for (const [p, content] of Object.entries(outputs)) {
    const current = existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
    if (current === content) continue;
    if (check) stale.push(p);
    else writeFileSync(join(root, p), content);
  }
  if (stale.length) {
    console.error(`生成ファイルが最新ではありません（npm run art:build を実行）: ${stale.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(check ? "素材の検査: 合格・生成ファイルは最新" : "素材の検査: 合格・生成ファイルを書き出しました");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
