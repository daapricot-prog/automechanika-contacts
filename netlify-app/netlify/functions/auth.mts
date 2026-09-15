import { clearSessionCookie, isAuthenticated, json, makeSessionCookie, passwordMatches, sameOriginWrite } from "../lib/session.mts";

export default async (req: Request) => {
  if (req.method === "GET") return json({ authenticated: isAuthenticated(req) });

  if (req.method === "POST") {
    if (!sameOriginWrite(req)) return json({ error: "Forbidden" }, 403);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    const password = typeof body?.password === "string" ? body.password : "";
    if (!passwordMatches(password)) return json({ error: "Неверный пароль" }, 401);
    return json({ authenticated: true }, 200, { "set-cookie": makeSessionCookie() });
  }

  if (req.method === "DELETE") {
    if (!sameOriginWrite(req)) return json({ error: "Forbidden" }, 403);
    return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
  }

  return json({ error: "Method not allowed" }, 405, { allow: "GET, POST, DELETE" });
};

export const config = { path: "/api/auth" };
