import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { validateEntry } from "../shared/ledger.js";
import type { Mailer } from "./mailer.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { Store } from "./store.js";

export interface AppOptions {
  store: Store;
  mailer: Mailer;
  /** Origin used in the password reset link. */
  publicUrl: string;
  /** Built client to serve; omitted when only the API is wanted. */
  staticDir?: string;
}

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const BODY_LIMIT = 64 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > BODY_LIMIT) return undefined;
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createAppServer(options: AppOptions): Server {
  const { store, mailer, publicUrl, staticDir } = options;
  const sessions = new Set<string>();
  const resets = new Map<string, number>();
  let lastResetAt = 0;

  async function serveStatic(url: string, response: ServerResponse): Promise<void> {
    if (!staticDir) return send(response, 404, { error: "not_found" });
    const path = decodeURIComponent(new URL(url, "http://local").pathname);
    const candidate = normalize(join(staticDir, path));
    const inside = candidate === staticDir || candidate.startsWith(staticDir + sep);
    const file = inside && extname(candidate) !== "" ? candidate : join(staticDir, "index.html");
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(content);
    } catch {
      if (file === join(staticDir, "index.html")) return send(response, 404, { error: "not_found" });
      await serveStatic("/", response);
    }
  }

  async function handleApi(
    request: IncomingMessage,
    response: ServerResponse,
    method: string,
    path: string,
  ): Promise<void> {
    const body = method === "GET" || method === "DELETE" ? {} : await readJson(request);
    if (!body) return send(response, 400, { error: "bad_request" });

    if (method === "GET" && path === "/api/health") return send(response, 200, { status: "ok" });

    if (method === "POST" && path === "/api/login") {
      const owner = store.owner;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!owner || email !== owner.email || !(await verifyPassword(password, owner.passwordHash))) {
        return send(response, 401, { error: "invalid_credentials" });
      }
      const token = randomBytes(32).toString("hex");
      sessions.add(token);
      return send(response, 200, { token });
    }

    if (method === "POST" && path === "/api/forgot") {
      const owner = store.owner;
      if (!owner) return send(response, 200, { ok: true });
      const now = Date.now();
      if (now - lastResetAt < RESET_COOLDOWN_MS) return send(response, 200, { ok: true });
      lastResetAt = now;
      const token = randomBytes(32).toString("hex");
      resets.set(sha256(token), now + RESET_TTL_MS);
      try {
        await mailer({
          to: owner.email,
          subject: "ตั้งรหัสผ่านใหม่",
          text: `เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ 1 ชั่วโมง): ${publicUrl}/?reset=${token}`,
        });
      } catch (error) {
        console.error("sending the reset mail failed", error);
        resets.delete(sha256(token));
        lastResetAt = 0;
        return send(response, 502, { error: "mail_failed" });
      }
      return send(response, 200, { ok: true });
    }

    if (method === "POST" && path === "/api/reset") {
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      const expiry = resets.get(sha256(token));
      if (expiry === undefined || expiry < Date.now()) {
        return send(response, 400, { error: "invalid_token" });
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        return send(response, 400, {
          error: "validation",
          errors: [`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`],
        });
      }
      const owner = store.owner;
      if (!owner) return send(response, 400, { error: "invalid_token" });
      store.setOwner({ email: owner.email, passwordHash: await hashPassword(password) });
      resets.clear();
      sessions.clear();
      return send(response, 200, { ok: true });
    }

    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!sessions.has(token)) return send(response, 401, { error: "unauthorized" });

    if (method === "POST" && path === "/api/logout") {
      sessions.delete(token);
      return send(response, 200, { ok: true });
    }

    if (path === "/api/entries" && method === "GET") {
      return send(response, 200, { entries: store.list() });
    }

    if (path === "/api/entries" && method === "POST") {
      const result = validateEntry(body);
      if (!result.ok) return send(response, 400, { error: "validation", errors: result.errors });
      return send(response, 201, { entry: store.add(result.value) });
    }

    const match = /^\/api\/entries\/([^/]+)$/.exec(path);
    if (match?.[1] && method === "PUT") {
      const result = validateEntry(body);
      if (!result.ok) return send(response, 400, { error: "validation", errors: result.errors });
      const entry = store.update(match[1], result.value);
      return entry ? send(response, 200, { entry }) : send(response, 404, { error: "not_found" });
    }
    if (match?.[1] && method === "DELETE") {
      return store.remove(match[1])
        ? send(response, 200, { ok: true })
        : send(response, 404, { error: "not_found" });
    }

    return send(response, 404, { error: "not_found" });
  }

  return createServer((request, response) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";
    const path = url.split("?")[0] ?? "/";
    const handled = path.startsWith("/api/")
      ? handleApi(request, response, method, path)
      : method === "GET"
        ? serveStatic(url, response)
        : Promise.resolve(send(response, 404, { error: "not_found" }));
    handled.catch((error: unknown) => {
      console.error(error);
      if (!response.headersSent) send(response, 500, { error: "server_error" });
      else response.end();
    });
  });
}
