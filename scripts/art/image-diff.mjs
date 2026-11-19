// 画素の差分計算（Issue #25）。依存なしの純粋な関数。
// ブラウザ（canvas の ImageData）と単体テストの両方で同じ関数を使う。

/**
 * 2 枚の RGBA 画素列を比べる。
 * 大きさが違う場合は、片方の画像にしかない画素を「変化あり」と数える。どちらの画像にもない画素
 * （縦長と横長を重ねたときの角など）は数えず、割合の分母は 2 枚の画像の領域の和集合にする（Codex 指摘 PR #30）。
 * @param {{width:number,height:number,data:ArrayLike<number>}} a
 * @param {{width:number,height:number,data:ArrayLike<number>}} b
 * @param {number} threshold 各色成分（R/G/B/A）の差の許容値
 * @returns {{width:number,height:number,changed:number,total:number,ratio:number,sizeMatches:boolean,mask:Uint8Array}}
 *   width × height は比較画像の描画範囲（両方を覆う矩形）。mask は変化した画素を 1、どちらの画像にもない画素を 2 とする（行優先）。
 *   total は和集合の画素数
 */
export function diffPixels(a, b, threshold) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const mask = new Uint8Array(width * height);
  let changed = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const inA = x < a.width && y < a.height;
      const inB = x < b.width && y < b.height;
      if (!inA && !inB) {
        mask[i] = 2;
        continue;
      }
      total++;
      let diff = !(inA && inB);
      if (!diff) {
        const ia = (y * a.width + x) * 4;
        const ib = (y * b.width + x) * 4;
        for (let c = 0; c < 4; c++) {
          if (Math.abs(a.data[ia + c] - b.data[ib + c]) > threshold) {
            diff = true;
            break;
          }
        }
      }
      if (diff) {
        mask[i] = 1;
        changed++;
      }
    }
  }
  return {
    width,
    height,
    changed,
    total,
    ratio: total === 0 ? 0 : changed / total,
    sizeMatches: a.width === b.width && a.height === b.height,
    mask,
  };
}
