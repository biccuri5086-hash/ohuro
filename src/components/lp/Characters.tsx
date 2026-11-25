import Image from "next/image";
import furopen from "@/assets/characters/furopen.webp";
import kuragera from "@/assets/characters/kuragera.webp";
import mizuhane from "@/assets/characters/mizuhane.webp";
import rakkoru from "@/assets/characters/rakkoru.webp";
import ryuusei from "@/assets/characters/ryuusei.webp";
import yugekitsune from "@/assets/characters/yugekitsune.webp";
import yuzukapi from "@/assets/characters/yuzukapi.webp";
import yuzunyan from "@/assets/characters/yuzunyan.webp";

// 画像生成 AI で作ったコンセプト画像（台帳: art/characters.json、DECISIONS.md D-015）。
// 開発中のコンセプトイメージとして表示する。
export const CHARACTERS = {
  furopen: { src: furopen, name: "ふろペン" },
  kuragera: { src: kuragera, name: "くらげら" },
  mizuhane: { src: mizuhane, name: "みずはね" },
  rakkoru: { src: rakkoru, name: "らっこる" },
  ryuusei: { src: ryuusei, name: "りゅうせい" },
  yugekitsune: { src: yugekitsune, name: "ゆげきつね" },
  yuzukapi: { src: yuzukapi, name: "ゆずかぴ" },
  yuzunyan: { src: yuzunyan, name: "ゆずにゃん" },
} as const;

export type CharacterId = keyof typeof CHARACTERS;

export function CharacterImage({
  id,
  className,
  priority = false,
  sizes = "160px",
}: {
  id: CharacterId;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const c = CHARACTERS[id];
  return (
    <Image
      src={c.src}
      alt={`${c.name}（お湯わらしのイメージ・開発中のコンセプト）`}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
