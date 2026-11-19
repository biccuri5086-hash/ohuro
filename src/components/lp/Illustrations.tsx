// LP 用のオリジナル 2D イラスト（インライン SVG。外部素材・3D は使わない）。
// すべて開発中のコンセプトイメージであり、実際の製品画面ではない。
type Props = { className?: string; title?: string };

const OUTLINE = "#5b3f33";

/** ペットのコンセプトイメージ: 湯気のようなまるい生き物が頭にタオルをのせている */
export function PetIllustration({ className, title = "ペットのイメージ（開発中のコンセプト）" }: Props) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      {/* 湯気 */}
      <path d="M44 22c-6-6 2-12-2-18M62 18c-5-6 3-11-1-17M80 22c-6-6 2-12-2-18" stroke="#b9d9ec" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* 体 */}
      <path
        d="M20 82c0-26 18-44 40-44s40 18 40 44c0 16-14 24-40 24S20 98 20 82z"
        fill="#ffd6bf"
        stroke={OUTLINE}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* タオル */}
      <path d="M36 46c8-10 40-10 48 0l-4 8c-10-6-30-6-40 0z" fill="#ffffff" stroke={OUTLINE} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M42 46h36" stroke="#6fb3dd" strokeWidth="3" strokeLinecap="round" />
      {/* 顔 */}
      <circle cx="47" cy="74" r="4.5" fill={OUTLINE} />
      <circle cx="73" cy="74" r="4.5" fill={OUTLINE} />
      <circle cx="45" cy="72.5" r="1.4" fill="#fff" />
      <circle cx="71" cy="72.5" r="1.4" fill="#fff" />
      <ellipse cx="38" cy="84" rx="6" ry="3.5" fill="#ffab9a" />
      <ellipse cx="82" cy="84" rx="6" ry="3.5" fill="#ffab9a" />
      <path d="M55 84q5 5 10 0" stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** 横から見た 2D マイホームのコンセプトイメージ */
export function RoomIllustration({ className, title = "2Dマイホームのイメージ（開発中のコンセプト）" }: Props) {
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="2" y="2" width="316" height="176" rx="14" fill="#fff4e4" stroke={OUTLINE} strokeWidth="4" />
      {/* 壁紙と床 */}
      <rect x="4" y="128" width="312" height="48" rx="10" fill="#e8c39a" />
      <path d="M4 128h312" stroke={OUTLINE} strokeWidth="3" />
      {/* 窓 */}
      <rect x="28" y="26" width="70" height="56" rx="6" fill="#cfe9f7" stroke={OUTLINE} strokeWidth="3" />
      <path d="M63 26v56M28 54h70" stroke={OUTLINE} strokeWidth="3" />
      {/* 棚 */}
      <rect x="226" y="40" width="70" height="88" rx="6" fill="#d9a877" stroke={OUTLINE} strokeWidth="3" />
      <path d="M226 70h70M226 100h70" stroke={OUTLINE} strokeWidth="3" />
      <rect x="236" y="52" width="14" height="18" rx="3" fill="#8cc7a0" stroke={OUTLINE} strokeWidth="2" />
      <circle cx="272" cy="90" r="8" fill="#ffd35c" stroke={OUTLINE} strokeWidth="2" />
      {/* ソファ */}
      <rect x="110" y="96" width="96" height="34" rx="12" fill="#f39c8b" stroke={OUTLINE} strokeWidth="3" />
      <rect x="104" y="108" width="18" height="24" rx="8" fill="#f39c8b" stroke={OUTLINE} strokeWidth="3" />
      <rect x="194" y="108" width="18" height="24" rx="8" fill="#f39c8b" stroke={OUTLINE} strokeWidth="3" />
      {/* ペット */}
      <g transform="translate(130 64) scale(0.48)">
        <path d="M20 82c0-26 18-44 40-44s40 18 40 44c0 16-14 24-40 24S20 98 20 82z" fill="#ffd6bf" stroke={OUTLINE} strokeWidth="6" />
        <circle cx="47" cy="74" r="5" fill={OUTLINE} />
        <circle cx="73" cy="74" r="5" fill={OUTLINE} />
        <path d="M36 46c8-10 40-10 48 0l-4 8c-10-6-30-6-40 0z" fill="#fff" stroke={OUTLINE} strokeWidth="5" />
      </g>
      {/* ラグ */}
      <ellipse cx="160" cy="150" rx="70" ry="10" fill="#bfe0c8" stroke={OUTLINE} strokeWidth="2.5" />
    </svg>
  );
}

export function CoinIcon({ className, title = "コイン" }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="24" cy="24" r="20" fill="#ffd35c" stroke={OUTLINE} strokeWidth="3.5" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="#e3a92a" strokeWidth="3" />
      <circle cx="20" cy="21" r="3" fill="#fff" opacity="0.9" />
      <circle cx="27" cy="27" r="2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function TowelIcon({ className, title = "タオル" }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="8" y="8" width="32" height="32" rx="6" fill="#fff" stroke={OUTLINE} strokeWidth="3.5" />
      <path d="M8 32h32" stroke="#6fb3dd" strokeWidth="4" />
      <path d="M14 14h20" stroke="#cfe9f7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ className, title = "スマートフォン" }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="14" y="4" width="20" height="40" rx="5" fill="#cfe9f7" stroke={OUTLINE} strokeWidth="3.5" />
      <circle cx="24" cy="37" r="2.5" fill={OUTLINE} />
    </svg>
  );
}
