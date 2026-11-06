// Pure JWT helpers — no DB, no "server-only", so proxy.ts can import them.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "od_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = { sub: string; role: "admin" | "caller"; name: string };

function key() {
  const raw = process.env.SESSION_SECRET?.trim();
  const s = raw && /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ role: p.role, name: p.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: payload.role === "admin" ? "admin" : "caller",
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}
