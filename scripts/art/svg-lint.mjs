// 素材 SVG の読み取りと検査（Issue #24 / Art-2）。依存なし。
// 許可するのは「自作の平面的な 2D 図形」に必要な最小限の要素・属性だけ（許可リスト方式）。
// ラスター画像・外部参照・スクリプト・スタイル・グラデーション・フィルター（立体的な表現）は、許可リストにないため拒否される。

const ELEMENTS = {
  svg: ["xmlns", "viewBox"],
  g: ["transform", "opacity"],
  path: ["d"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx"],
};
const PAINT_ATTRS = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity"];
const NUMBER = /^-?\d+(\.\d+)?$/;
const TRANSFORM = /^(\s*(translate|scale|rotate)\(\s*-?\d+(\.\d+)?(\s*[ ,]\s*-?\d+(\.\d+)?){0,2}\s*\)\s*)+$/;
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

/**
 * SVG の文字列を要素の木にする。許可した書き方以外（DOCTYPE・CDATA・文字・クォートなしの属性など）はエラー。
 * @returns {{root: object|null, errors: string[]}}
 */
export function parseSvg(text) {
  const errors = [];
  const stack = [];
  let root = null;
  const token = /<!--([\s\S]*?)-->|<(\/?)([A-Za-z][\w:-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"<>]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = token.exec(text))) {
    const [, comment, closing, name, rawAttrs, selfClose, chars, stray] = m;
    if (comment !== undefined) continue;
    if (stray !== undefined) {
      errors.push(`読み取れない記述があります（位置 ${m.index}）`);
      break;
    }
    if (chars !== undefined) {
      if (chars.trim()) errors.push(`要素の外・中に文字があります: "${chars.trim().slice(0, 20)}"`);
      continue;
    }
    if (closing) {
      // 閉じタグに属性・自己終了記号は書けない（XML として不正。Codex 指摘 PR #35）
      if (rawAttrs.trim() || selfClose) {
        errors.push(`閉じタグ </${name}> に属性や「/」は書けません`);
        break;
      }
      const open = stack.pop();
      if (!open || open.name !== name) {
        errors.push(`閉じタグ </${name}> が対応していません`);
        break;
      }
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
      if (a[1] in attrs) errors.push(`<${name}> の属性 ${a[1]} が重複しています`);
      attrs[a[1]] = a[2];
    }
    const node = { name, attrs, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root) errors.push("最上位の要素が 2 つ以上あります");
    else root = node;
    if (!selfClose) stack.push(node);
  }
  if (stack.length) errors.push(`閉じられていない要素があります: <${stack[stack.length - 1].name}>`);
  if (!root) errors.push("svg 要素がありません");
  return { root, errors };
}

/**
 * 素材 SVG を検査する。
 * @param {string} text SVG の文字列
 * @param {{colors: Record<string,string>, strokeWidths: number[], maxBytes: number}} palette
 * @returns {string[]} エラー（空なら合格）
 */
export function lintSvg(text, palette) {
  const errors = [];
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > palette.maxBytes) errors.push(`ファイルが大きすぎます（${bytes} バイト > ${palette.maxBytes}）`);
  for (const [re, msg] of [
    [/<script/i, "script は使えません"],
    [/<image/i, "image（ラスター画像）は使えません"],
    [/<style/i, "style は使えません"],
    [/<foreignObject/i, "foreignObject は使えません"],
    [/href\s*=/i, "外部参照（href）は使えません"],
    [/url\(/i, "url() は使えません"],
    [/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i, "DOCTYPE・ENTITY・CDATA は使えません"],
    [/data:/i, "data: URI は使えません"],
  ]) {
    if (re.test(text)) errors.push(msg);
  }
  const { root, errors: parseErrors } = parseSvg(text);
  errors.push(...parseErrors);
  if (!root) return errors;
  if (root.name !== "svg") errors.push("最上位の要素は svg にしてください");
  if (root.attrs.xmlns !== "http://www.w3.org/2000/svg") errors.push("svg に xmlns=\"http://www.w3.org/2000/svg\" が必要です");
  if (!/^0 0 \d+ \d+$/.test(root.attrs.viewBox ?? "")) errors.push('svg に viewBox="0 0 幅 高さ"（整数）が必要です');
  const colors = new Set(Object.keys(palette.colors));
  const widths = new Set(palette.strokeWidths.map(String));
  // 実効的な塗り・線（親からの継承と SVG の既定値を含む）を検査する。既定値は fill=黒・stroke=none・stroke-width=1
  // 省略すると既定の黒や太さ 1 で描かれるため、図形ごとに実際に使われる値がパレット・許可値に入るかを見る（Codex 指摘 PR #35）
  const SHAPES = new Set(["path", "circle", "ellipse", "rect"]);
  const checkEffective = (node, inherited) => {
    const eff = {
      fill: node.attrs.fill ?? inherited.fill,
      stroke: node.attrs.stroke ?? inherited.stroke,
      "stroke-width": node.attrs["stroke-width"] ?? inherited["stroke-width"],
    };
    if (SHAPES.has(node.name)) {
      if (eff.fill === undefined) errors.push(`<${node.name}> の塗りが省略されています（既定の黒になる）。fill に色か "none" を書いてください`);
      if (eff.stroke !== undefined && eff.stroke !== "none" && eff["stroke-width"] === undefined) {
        errors.push(`<${node.name}> の線の太さが省略されています（既定の 1 になる）。stroke-width を書いてください`);
      }
    }
    for (const c of node.children) checkEffective(c, eff);
  };

  const visit = (node, depth) => {
    const allowed = ELEMENTS[node.name];
    if (!allowed || (node.name === "svg" && depth > 0)) {
      errors.push(`要素 <${node.name}> は使えません（使えるのは g・path・circle・ellipse・rect）`);
      return;
    }
    const ok = new Set([...allowed, ...(node.name === "svg" ? [] : PAINT_ATTRS)]);
    for (const [k, v] of Object.entries(node.attrs)) {
      if (!ok.has(k)) {
        errors.push(`<${node.name}> の属性 ${k} は使えません`);
        continue;
      }
      if ((k === "fill" || k === "stroke") && v !== "none" && !colors.has(v)) errors.push(`パレットにない色です: ${k}="${v}"`);
      if (k === "stroke-width" && !widths.has(v)) errors.push(`許可されていない線の太さです: ${v}`);
      if ((k === "stroke-linecap" || k === "stroke-linejoin") && v !== "round") errors.push(`${k} は round だけです`);
      if (k === "opacity" && !(NUMBER.test(v) && Number(v) >= 0 && Number(v) <= 1)) errors.push(`opacity は 0〜1 の数値です: ${v}`);
      if (k === "transform" && !TRANSFORM.test(v)) errors.push(`transform は translate・scale・rotate だけです: ${v}`);
      if (k === "d" && !PATH_D.test(v)) errors.push(`path の d に使えない文字があります`);
      if (["cx", "cy", "r", "rx", "ry", "x", "y", "width", "height"].includes(k) && !NUMBER.test(v)) errors.push(`${k} は数値です: ${v}`);
    }
    if (node.name !== "svg" && node.name !== "g" && node.children.length) errors.push(`<${node.name}> の中に要素は置けません`);
    for (const c of node.children) visit(c, depth + 1);
  };
  visit(root, 0);
  checkEffective(root, {});
  return errors;
}
