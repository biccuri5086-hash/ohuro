import { describe, expect, it } from "vitest";
import { captureUtm, readUtmFromSearch } from "@/lib/waitlist/attribution";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("広告流入元（UTM）の取得", () => {
  it("URL の UTM を取り出し、不正な値は捨てる", () => {
    expect(readUtmFromSearch("?utm_source=instagram&utm_content=ad_b_v1&utm_campaign=%3Cx%3E&x=1")).toEqual({
      utm_source: "instagram",
      utm_content: "ad_b_v1",
    });
  });
  it("URL に UTM があれば保存し、同じタブで UTM なしのページに移っても保持する", () => {
    const st = memoryStorage();
    expect(captureUtm("?utm_content=ad_a_v1", st)).toEqual({ utm_content: "ad_a_v1" });
    expect(captureUtm("", st)).toEqual({ utm_content: "ad_a_v1" });
  });
  it("新しい UTM で上書きする（直近の広告を優先）", () => {
    const st = memoryStorage();
    captureUtm("?utm_content=ad_a_v1", st);
    expect(captureUtm("?utm_content=ad_b_v1", st)).toEqual({ utm_content: "ad_b_v1" });
  });
  it("ストレージが使えなくても URL の値で動く", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(captureUtm("?utm_content=ad_a_v1", broken)).toEqual({ utm_content: "ad_a_v1" });
    expect(captureUtm("", broken)).toEqual({});
    expect(captureUtm("", undefined)).toEqual({});
  });
  it("保存値が改ざんされていても不正な値は使わない", () => {
    const st = memoryStorage();
    st.setItem("ohuro_utm", JSON.stringify({ utm_content: "<script>", utm_source: "ok_src" }));
    expect(captureUtm("", st)).toEqual({ utm_source: "ok_src" });
  });
});
