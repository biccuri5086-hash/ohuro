// 広告流入元（UTM）の取得（ブラウザ専用）。
// 最初に LP を開いたときの UTM をタブ単位（sessionStorage）で保持し、登録時に送る。
import { sanitizeUtm, type Utm, UTM_KEYS } from "./validation";

const STORAGE_KEY = "ohuro_utm";

export function readUtmFromSearch(search: string): Utm {
  const params = new URLSearchParams(search);
  const raw: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) raw[key] = v;
  }
  return sanitizeUtm(raw);
}

/** URL に UTM があればそれを保存して返す。なければ保存済みの値を返す */
export function captureUtm(search: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined): Utm {
  const fromUrl = readUtmFromSearch(search);
  try {
    if (Object.keys(fromUrl).length > 0) {
      storage?.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const saved = storage?.getItem(STORAGE_KEY);
    return saved ? sanitizeUtm(JSON.parse(saved)) : {};
  } catch {
    // ストレージが使えない環境（プライベートモード等）では URL の値だけ使う
    return fromUrl;
  }
}
