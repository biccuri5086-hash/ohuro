import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/** 推測困難なトークン（256 bit、base64url で 43 文字）。平文はメールのリンクにのみ載せ、DB にはハッシュを保存する */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** IP アドレス等をそのまま保存しないための鍵付きハッシュ */
export function keyedHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}
