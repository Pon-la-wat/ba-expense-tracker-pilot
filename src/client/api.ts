import type { Entry } from "../shared/ledger";

export type ErrorKind = "network" | "auth" | "validation" | "server";

export interface EntryPayload {
  date: string;
  amount: string;
  type: string;
  note: string;
}

export class ApiError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export const NETWORK_MESSAGE =
  "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง";
export const SERVER_MESSAGE = "เกิดข้อผิดพลาดในระบบ กรุณาลองอีกครั้งภายหลัง";

interface Reply {
  error?: string;
  errors?: string[];
}

export class Api {
  token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError("network", NETWORK_MESSAGE);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // A reply without JSON (for example a proxy error page) is handled by status below.
    }
    if (response.ok) return data as T;

    const reply = (data ?? {}) as Reply;
    if (response.status === 401) throw new ApiError("auth", reply.error ?? "unauthorized");
    if (response.status === 400) {
      throw new ApiError("validation", reply.error ?? "bad_request", reply.errors ?? []);
    }
    throw new ApiError("server", SERVER_MESSAGE);
  }

  async login(email: string, password: string): Promise<void> {
    const { token } = await this.request<{ token: string }>("POST", "/api/login", {
      email,
      password,
    });
    this.token = token;
  }

  async logout(): Promise<void> {
    try {
      await this.request("POST", "/api/logout", {});
    } finally {
      this.token = null;
    }
  }

  forgot(): Promise<unknown> {
    return this.request("POST", "/api/forgot", {});
  }

  reset(token: string, password: string): Promise<unknown> {
    return this.request("POST", "/api/reset", { token, password });
  }

  async listEntries(): Promise<Entry[]> {
    return (await this.request<{ entries: Entry[] }>("GET", "/api/entries")).entries;
  }

  async createEntry(payload: EntryPayload): Promise<Entry> {
    return (await this.request<{ entry: Entry }>("POST", "/api/entries", payload)).entry;
  }

  async updateEntry(id: string, payload: EntryPayload): Promise<Entry> {
    return (await this.request<{ entry: Entry }>("PUT", `/api/entries/${id}`, payload)).entry;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.request("DELETE", `/api/entries/${id}`);
  }
}
