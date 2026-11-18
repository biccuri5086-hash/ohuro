import "server-only";

/**
 * RFC 8058 のワンクリック配信停止リクエストか判定する。
 * 本文は multipart/form-data（SHOULD）または application/x-www-form-urlencoded（MAY）で、
 * `List-Unsubscribe=One-Click` を含む必要がある。それ以外の形式・値は拒否する。
 */
export async function isOneClickUnsubscribeRequest(request: Request): Promise<boolean> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("multipart/form-data") && !type.startsWith("application/x-www-form-urlencoded")) return false;
  try {
    const form = await request.formData();
    return form.get("List-Unsubscribe") === "One-Click";
  } catch {
    return false;
  }
}
