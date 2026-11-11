import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "al_live_";

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, API_KEY_PREFIX.length + 4) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Accepts `Authorization: Bearer <key>` or `x-api-key: <key>`. */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return headers.get("x-api-key")?.trim() || null;
}
