// 画素の差分計算（Issue #25）。依存なしの純粋な関数。
// ブラウザ（canvas の ImageData）と単体テストの両方で同じ関数を使う。

/**
 * 2 枚の RGBA 画素列を比べる。大きさが違う場合は、重ならない部分をすべて「変化あり」と数える。
 * @param {{width:number,height:number,data:ArrayLike<number>}} a
 * @param {{width:number,height:number,data:ArrayLike<number>}} b
 * @param {number} threshold 各色成分（R/G/B/A）の差の許容値
 * @returns {{width:number,height:number,changed:number,total:number,ratio:number,sizeMatches:boolean,mask:Uint8Array}}
 *   mask は変化した画素を 1 とする配列（width × height、行優先）
 */
export function diffPixels(a, b, threshold) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const total = width * height;
  const mask = new Uint8Array(total);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const inA = x < a.width && y < a.height;
      const inB = x < b.width && y < b.height;
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
