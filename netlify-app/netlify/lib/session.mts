import { createHash, createHmac, timingSafeEqual } from "node:crypto";

declare const Netlify: any;

const COOKIE = "automechanika_session";
const SESSION_SECONDS = 12 * 60 * 60;

function env(name: string): string {
  const value = Netlify.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function equal(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function passwordMatches(password: string): boolean {
  if (!password || password.length > 200) return false;
  const actual = createHash("sha256").update(password, "utf8").digest("hex");
  return equal(actual, env("APP_PASSWORD_SHA256"));
}

function sign(payload: string): string {
  return createHmac("sha256", env("SESSION_SECRET")).update(payload).digest("base64url");
}

export function makeSessionCookie(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function cookieValue(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function isAuthenticated(req: Request): boolean {
  try {
    const token = cookieValue(req);
    if (!token) return false;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (!equal(signature, sign(payload))) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(decoded?.exp) && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sameOriginWrite(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return origin === new URL(req.url).origin; } catch { return false; }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
